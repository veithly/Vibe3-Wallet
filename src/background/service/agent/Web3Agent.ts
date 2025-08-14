// Core Web3 Agent orchestration system that coordinates all components
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from './llm/messages';
import { Web3Intent, Web3ActionType } from './intent/IntentRecognizer';
import { ActionPlan, ActionStep } from './planning/ActionPlanner';
import { Web3Context, LLMResponse, IWeb3LLM } from './llm/types';
import { IntentRecognizer } from './intent/IntentRecognizer';
import { ActionPlanner } from './planning/ActionPlanner';
import { TransactionSimulator } from './simulation/TransactionSimulator';
import { ConfirmationManager } from './confirmation/ConfirmationManager';
import { DAppAutomation } from './automation/DAppAutomation';
import { AgentContext } from './types';
import { chatHistoryStore } from './chatHistory';
import { Actors } from './chatHistory/types';
import { createLogger } from '@/utils/logger';
import type { BaseChatModel as IBaseChatModel } from './llm/messages';

const logger = createLogger('Web3Agent');

export interface AgentResponse {
  success: boolean;
  message: string;
  actions?: ActionStep[];
  plan?: ActionPlan;
  simulation?: any;
  error?: string;
  sessionId: string;
  timestamp: number;
}

export interface AgentConfig {
  maxRetries: number;
  timeoutMs: number;
  autoConfirmLowRisk: boolean;
  requireConfirmationHighRisk: boolean;
  simulationEnabled: boolean;
  riskThreshold: number;
}

export interface Web3AgentState {
  sessionId: string;
  currentContext: Web3Context;
  activePlan?: ActionPlan;
  executionHistory: ActionStep[];
  conversationHistory: BaseMessage[];
  lastActivity: number;
}

export class Web3Agent {
  private context: AgentContext;
  private llm: IWeb3LLM;
  public intentRecognizer: IntentRecognizer;
  public actionPlanner: ActionPlanner;
  public transactionSimulator: TransactionSimulator;
  private confirmationManager: ConfirmationManager;
  private dappAutomation: DAppAutomation;
  private config: AgentConfig;
  private state: Web3AgentState;

  constructor(
    context: AgentContext,
    llm: IWeb3LLM,
    config?: Partial<AgentConfig>
  ) {
    this.context = context;
    this.llm = llm;
    this.intentRecognizer = new IntentRecognizer();
    this.actionPlanner = new ActionPlanner(context);
    this.transactionSimulator = new TransactionSimulator(context);
    this.confirmationManager = new ConfirmationManager(context);
    this.dappAutomation = new DAppAutomation(context);

    this.config = {
      maxRetries: 3,
      timeoutMs: 30000,
      autoConfirmLowRisk: true,
      requireConfirmationHighRisk: true,
      simulationEnabled: true,
      riskThreshold: 0.7,
      ...config,
    };

    this.state = {
      sessionId: '',
      currentContext: this.initializeWeb3Context(),
      executionHistory: [],
      conversationHistory: [],
      lastActivity: Date.now(),
    };
  }

  private initializeWeb3Context(): Web3Context {
    return {
      currentChain: 1, // Ethereum mainnet
      currentAddress: '',
      balances: {},
      allowances: {},
      gasPrices: {},
      protocols: {},
      riskLevel: 'LOW',
    };
  }

  async initialize(sessionId?: string): Promise<void> {
    // Initialize session
    this.state.sessionId =
      sessionId ||
      `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create or load session
    try {
      const sessionExists = await chatHistoryStore.sessionExists(
        this.state.sessionId
      );
      if (!sessionExists) {
        // Create new session
        await chatHistoryStore.createSession(this.state.sessionId, 'New Chat');
      }

      // Load session history if exists
      const history = await chatHistoryStore.getSession(this.state.sessionId);
      if (history.length > 0) {
        this.state.conversationHistory = history.map((msg) =>
          msg.actor === 'user'
            ? new HumanMessage(msg.content)
            : new AIMessage(msg.content)
        );
      }
    } catch (error) {
      logger.warn('Web3Agent', 'Failed to initialize session history', error);
    }

    // Initialize Web3 context
    await this.updateWeb3Context();

    console.log(`Web3Agent initialized with session: ${this.state.sessionId}`);
  }

  async processUserInstruction(instruction: string): Promise<AgentResponse> {
    try {
      const startTime = Date.now();

      // Add user message to conversation history
      const userMessage = new HumanMessage(instruction);
      this.state.conversationHistory.push(userMessage);

      // Step 1: Extract intent from user instruction
      const intent = await this.intentRecognizer.extractIntent(
        instruction,
        this.state.currentContext
      );
      logger.info(
        `Extracted intent: ${intent.action} with confidence ${intent.confidence}`
      );

      // All messages must go through LLM processing
      if (!this.llm || !this.llm.generateResponse) {
        logger.error('LLM not properly initialized - this should not happen');
        const errorMessage =
          'I apologize, but there appears to be a configuration issue with the AI service. Please try again later.';

        const assistantMessage = new AIMessage(errorMessage);
        this.state.conversationHistory.push(assistantMessage);
        await this.storeConversationStep(userMessage, assistantMessage, []);
        this.state.lastActivity = Date.now();

        return {
          success: false,
          message: errorMessage,
          sessionId: this.state.sessionId,
          timestamp: Date.now(),
        };
      }

      // Step 2: Generate LLM response with context
      let llmResponse: LLMResponse;
      try {
        llmResponse = await this.llm.generateResponse(
          this.state.conversationHistory,
          this.state.currentContext,
          intent
        );
      } catch (error) {
        logger.error('LLM generation failed:', error);
        const errorMessage = `I apologize, but I'm having trouble processing your request right now. This could be due to a temporary issue with the AI service. Please try again later. Error details: ${
          error instanceof Error ? error.message : String(error)
        }`;

        const assistantMessage = new AIMessage(errorMessage);
        this.state.conversationHistory.push(assistantMessage);
        await this.storeConversationStep(userMessage, assistantMessage, []);
        this.state.lastActivity = Date.now();

        return {
          success: false,
          message: errorMessage,
          sessionId: this.state.sessionId,
          timestamp: Date.now(),
        };
      }

      // Step 3: Create action plan if actions were suggested
      let plan: ActionPlan | undefined;
      if (llmResponse.actions.length > 0 && intent.action !== 'QUERY') {
        plan = await this.actionPlanner.createPlan(intent);
        logger.info(`Created action plan with ${plan.actions.length} steps`);
      }

      // Step 4: Simulate transactions if simulation is enabled and plan exists
      let simulation: any;
      if (this.config.simulationEnabled && plan && plan.requiresConfirmation) {
        simulation = await this.transactionSimulator.simulatePlan(plan);
        logger.info(
          `Transaction simulation completed with risk level: ${simulation.riskLevel}`
        );
      }

      // Step 5: Handle confirmation and execution
      let executedActions: ActionStep[] = [];
      if (plan && (await this.shouldExecutePlan(plan, simulation))) {
        executedActions = await this.executePlan(plan);
      }

      // Step 6: Generate final response
      const response = await this.generateFinalResponse(
        instruction,
        intent,
        llmResponse,
        plan,
        simulation,
        executedActions
      );

      // Add assistant response to conversation history
      const assistantMessage = new AIMessage(response);
      this.state.conversationHistory.push(assistantMessage);

      // Store in chat history
      await this.storeConversationStep(
        userMessage,
        assistantMessage,
        executedActions
      );

      // Update state
      this.state.lastActivity = Date.now();
      if (plan) {
        this.state.activePlan = plan;
      }
      this.state.executionHistory.push(...executedActions);

      return {
        success: true,
        message: response,
        actions: executedActions,
        plan,
        simulation,
        sessionId: this.state.sessionId,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Error processing user instruction:', error);

      // Return error response on failure
      const errorMessage = this.generateErrorResponse(error);
      const assistantMessage = new AIMessage(errorMessage);
      this.state.conversationHistory.push(assistantMessage);

      await this.storeConversationStep(
        new HumanMessage(instruction),
        assistantMessage,
        []
      );

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error.message : String(error),
        sessionId: this.state.sessionId,
        timestamp: Date.now(),
      };
    }
  }

  private async shouldExecutePlan(
    plan: ActionPlan,
    simulation?: any
  ): Promise<boolean> {
    if (!plan.requiresConfirmation && this.config.autoConfirmLowRisk) {
      return true;
    }

    if (plan.riskLevel === 'HIGH' && this.config.requireConfirmationHighRisk) {
      return await this.confirmationManager.requestConfirmation(
        plan,
        simulation
      );
    }

    if (plan.riskLevel === 'MEDIUM') {
      return await this.confirmationManager.requestConfirmation(
        plan,
        simulation
      );
    }

    return this.config.autoConfirmLowRisk;
  }

  private async executePlan(plan: ActionPlan): Promise<ActionStep[]> {
    const executedActions: ActionStep[] = [];

    try {
      // Execute actions in dependency order
      const executionOrder = this.calculateExecutionOrder(plan.actions);

      for (const actionId of executionOrder) {
        const action = plan.actions.find((a) => a.id === actionId);
        if (!action) continue;

        // Check if dependencies are satisfied
        const dependenciesSatisfied = action.dependencies.every((depId) =>
          executedActions.some((executed) => executed.id === depId)
        );

        if (!dependenciesSatisfied) {
          console.warn(
            `Skipping action ${action.id} due to unsatisfied dependencies`
          );
          continue;
        }

        // Execute action with retries
        const result = await this.executeActionWithRetry(action);
        executedActions.push(result);
      }

      return executedActions;
    } catch (error) {
      console.error('Error executing plan:', error);
      throw error;
    }
  }

  private calculateExecutionOrder(actions: ActionStep[]): string[] {
    // Topological sort based on dependencies
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (actionId: string) => {
      if (visited.has(actionId)) return;
      if (visiting.has(actionId)) {
        throw new Error(
          `Circular dependency detected involving action ${actionId}`
        );
      }

      visiting.add(actionId);

      const action = actions.find((a) => a.id === actionId);
      if (action) {
        for (const depId of action.dependencies) {
          visit(depId);
        }
      }

      visiting.delete(actionId);
      visited.add(actionId);
      order.push(actionId);
    };

    for (const action of actions) {
      visit(action.id);
    }

    return order;
  }

  private async executeActionWithRetry(
    action: ActionStep,
    attempt: number = 1
  ): Promise<ActionStep> {
    try {
      console.log(`Executing action ${action.id} (attempt ${attempt})`);

      const executedAction = await this.executeAction(action);

      // Store execution result
      await this.storeActionExecution(executedAction);

      return executedAction;
    } catch (error) {
      if (attempt < this.config.maxRetries) {
        console.warn(
          `Action ${action.id} failed, retrying... (${attempt + 1}/${
            this.config.maxRetries
          })`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        return this.executeActionWithRetry(action, attempt + 1);
      }

      throw error;
    }
  }

  private async executeAction(action: ActionStep): Promise<ActionStep> {
    // Update action status to in progress
    const executingAction = { ...action };

    switch (action.type) {
      case 'checkBalance':
        return await this.executeCheckBalance(executingAction);
      case 'sendTransaction':
        return await this.executeSendTransaction(executingAction);
      case 'approveToken':
        return await this.executeApproveToken(executingAction);
      case 'swapTokens':
        return await this.executeSwapTokens(executingAction);
      case 'bridgeTokens':
        return await this.executeBridgeTokens(executingAction);
      case 'stakeTokens':
        return await this.executeStakeTokens(executingAction);
      case 'connectWallet':
        return await this.executeConnectWallet(executingAction);
      case 'switchNetwork':
        return await this.executeSwitchNetwork(executingAction);
      default:
        throw new Error(`Unsupported action type: ${action.type}`);
    }
  }

  // Action execution methods
  private async executeCheckBalance(action: ActionStep): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual balance checking
    const balance = '0';

    return {
      ...action,
      result: { balance },
      status: 'completed' as const,
    };
  }

  private async executeSendTransaction(
    action: ActionStep
  ): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual transaction sending
    const txHash = '0x' + Math.random().toString(16).substr(2, 64);

    return {
      ...action,
      result: { txHash },
      status: 'completed' as const,
    };
  }

  private async executeApproveToken(action: ActionStep): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual token approval
    const txHash = '0x' + Math.random().toString(16).substr(2, 64);

    return {
      ...action,
      result: { txHash },
      status: 'completed' as const,
    };
  }

  private async executeSwapTokens(action: ActionStep): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual token swap
    const txHash = '0x' + Math.random().toString(16).substr(2, 64);
    const outputAmount = '0';

    return {
      ...action,
      result: { txHash, outputAmount },
      status: 'completed' as const,
    };
  }

  private async executeBridgeTokens(action: ActionStep): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual token bridging
    const txHash = '0x' + Math.random().toString(16).substr(2, 64);

    return {
      ...action,
      result: { txHash },
      status: 'completed' as const,
    };
  }

  private async executeStakeTokens(action: ActionStep): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual token staking
    const txHash = '0x' + Math.random().toString(16).substr(2, 64);

    return {
      ...action,
      result: { txHash },
      status: 'completed' as const,
    };
  }

  private async executeConnectWallet(action: ActionStep): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual wallet connection
    const connected = true;

    return {
      ...action,
      result: { connected },
      status: 'completed' as const,
    };
  }

  private async executeSwitchNetwork(action: ActionStep): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual network switching
    const switched = true;

    return {
      ...action,
      result: { switched },
      status: 'completed' as const,
    };
  }

  private async generateFinalResponse(
    instruction: string,
    intent: Web3Intent,
    llmResponse: LLMResponse,
    plan?: ActionPlan,
    simulation?: any,
    executedActions: ActionStep[] = []
  ): Promise<string> {
    if (intent.action === 'QUERY') {
      return llmResponse.response;
    }

    if (!plan) {
      return `I understand you want to ${this.getActionDescription(
        intent.action
      )}. Let me help you with that. ${llmResponse.response}`;
    }

    if (executedActions.length === 0) {
      // Plan created but not executed (awaiting confirmation)
      return `I've created a plan to ${this.getActionDescription(
        intent.action
      )}. Here's what I'll do:\n\n${this.formatPlanSummary(plan)}\n\n${
        simulation ? this.formatSimulationSummary(simulation) : ''
      }\n\nPlease confirm if you'd like me to proceed.`;
    }

    // Actions were executed
    const successCount = executedActions.filter((a) => a.status === 'completed')
      .length;
    const totalCount = executedActions.length;

    if (successCount === totalCount) {
      return `✅ Successfully ${this.getActionDescription(
        intent.action
      )}!\n\n${this.formatExecutionSummary(executedActions)}\n\n${
        llmResponse.response
      }`;
    } else {
      return `⚠️ Partially completed ${this.getActionDescription(
        intent.action
      )}. ${successCount}/${totalCount} actions succeeded.\n\n${this.formatExecutionSummary(
        executedActions
      )}\n\nPlease check the errors and try again.`;
    }
  }

  private getActionDescription(actionType: Web3ActionType): string {
    const descriptions: Record<Web3ActionType, string> = {
      SWAP: 'swap tokens',
      BRIDGE: 'bridge tokens across chains',
      STAKE: 'stake tokens',
      UNSTAKE: 'unstake tokens',
      APPROVE: 'approve token spending',
      SEND: 'send tokens',
      RECEIVE: 'receive tokens',
      BUY: 'buy tokens',
      SELL: 'sell tokens',
      ADD_LIQUIDITY: 'add liquidity',
      REMOVE_LIQUIDITY: 'remove liquidity',
      CLAIM_REWARDS: 'claim rewards',
      VOTE: 'vote on governance',
      DEPLOY: 'deploy contract',
      INTERACT: 'interact with contract',
      QUERY: 'query information',
      CONNECT_WALLET: 'connect wallet',
      SWITCH_NETWORK: 'switch network',
      SIGN_MESSAGE: 'sign message',
      SIGN_TYPED_DATA: 'sign typed data',
    };

    return descriptions[actionType] || 'perform action';
  }

  private formatPlanSummary(plan: ActionPlan): string {
    return plan.actions
      .map(
        (action, index) =>
          `${index + 1}. ${action.description} (${this.formatRiskLevel(
            action.riskLevel
          )})`
      )
      .join('\n');
  }

  private formatSimulationSummary(simulation: any): string {
    return `**Simulation Results:**\n- Risk Level: ${
      simulation.riskLevel
    }\n- Estimated Gas: ${simulation.totalGas}\n- Estimated Time: ${
      simulation.totalTime
    }s\n- Success Rate: ${Math.round(simulation.successRate * 100)}%`;
  }

  private formatExecutionSummary(actions: ActionStep[]): string {
    return actions
      .map((action) => {
        const status = action.status === 'completed' ? '✅' : '❌';
        return `${status} ${action.description}`;
      })
      .join('\n');
  }

  private formatRiskLevel(riskLevel: string): string {
    const riskEmojis: Record<string, string> = {
      LOW: '🟢',
      MEDIUM: '🟡',
      HIGH: '🔴',
    };
    return `${riskEmojis[riskLevel] || '⚪'} ${riskLevel}`;
  }

  private generateErrorResponse(error: any): string {
    if (error.message?.includes('insufficient funds')) {
      return '❌ Insufficient funds for this transaction. Please check your balance and try again.';
    }

    if (error.message?.includes('user rejected')) {
      return "❌ Transaction was rejected. Please try again when you're ready.";
    }

    if (error.message?.includes('network')) {
      return '❌ Network error occurred. Please check your connection and try again.';
    }

    return `❌ An error occurred: ${
      error.message || 'Unknown error'
    }. Please try again or contact support if the problem persists.`;
  }

  private async updateWeb3Context(): Promise<void> {
    // TODO: Implement actual Web3 context updates
    // This should fetch current chain, address, balances, etc.
    this.state.currentContext = {
      ...this.state.currentContext,
      currentAddress: await this.getCurrentAddress(),
      balances: await this.getCurrentBalances(),
      gasPrices: await this.getCurrentGasPrices(),
    };
  }

  private async getCurrentAddress(): Promise<string> {
    // TODO: Get current wallet address
    return '0x0000000000000000000000000000000000000000';
  }

  private async getCurrentBalances(): Promise<Record<string, string>> {
    // TODO: Get current token balances
    return {};
  }

  private async getCurrentGasPrices(): Promise<Record<number, string>> {
    // TODO: Get current gas prices
    return {};
  }

  private async storeConversationStep(
    userMessage: HumanMessage,
    assistantMessage: AIMessage,
    actions: ActionStep[]
  ): Promise<void> {
    try {
      await chatHistoryStore.addMessage(this.state.sessionId, {
        actor: Actors.USER,
        content: userMessage.content as string,
        timestamp: Date.now(),
      });

      await chatHistoryStore.addMessage(this.state.sessionId, {
        actor: Actors.SYSTEM,
        content: assistantMessage.content as string,
        timestamp: Date.now(),
      });

      // Store action executions
      for (const action of actions) {
        await chatHistoryStore.addAgentStep(this.state.sessionId, {
          id: action.id,
          action: action.type,
          status: action.status || 'completed',
          timestamp: Date.now(),
          details: action.params,
          result: action.result,
        });
      }
    } catch (error) {
      console.error('Error storing conversation step:', error);
    }
  }

  private async storeActionExecution(action: ActionStep): Promise<void> {
    try {
      await chatHistoryStore.addAgentStep(this.state.sessionId, {
        id: action.id,
        action: action.type,
        status: action.status || 'completed',
        timestamp: Date.now(),
        details: action.params,
        result: action.result,
      });
    } catch (error) {
      console.error('Error storing action execution:', error);
    }
  }

  // Public methods for external access
  async getState(): Promise<Web3AgentState> {
    return { ...this.state };
  }

  async getHistory(): Promise<BaseMessage[]> {
    return [...this.state.conversationHistory];
  }

  async clearHistory(): Promise<void> {
    this.state.conversationHistory = [];
    this.state.executionHistory = [];
    this.state.activePlan = undefined;
    await chatHistoryStore.clearAllHistory();
  }

  async switchNetwork(chainId: number): Promise<void> {
    this.state.currentContext.currentChain = chainId;
    await this.updateWeb3Context();
  }

  async refreshContext(): Promise<void> {
    await this.updateWeb3Context();
  }
}
