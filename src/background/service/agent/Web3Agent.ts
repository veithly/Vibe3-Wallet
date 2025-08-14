// Core Web3 Agent orchestration system that coordinates all components
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from './llm/messages';
import { Web3Intent, Web3ActionType } from './intent/IntentRecognizer';
import { ActionPlan } from './planning/ActionPlanner';
import { ActionStep } from './types';
import {
  Web3Context,
  LLMResponse,
  IWeb3LLM,
  FunctionSchema,
  StreamingLLMResponse,
  FunctionCall,
} from './llm/types';
import { IntentRecognizer } from './intent/IntentRecognizer';
import { ActionPlanner } from './planning/ActionPlanner';
import { TransactionSimulator } from './simulation/TransactionSimulator';
import { ConfirmationManager } from './confirmation/ConfirmationManager';
import { DAppAutomation } from './automation/DAppAutomation';
import { AgentContext } from './types';
import { chatHistoryStore } from './chatHistory';
import { Actors } from './chatHistory/types';
import { toolRegistry } from './tools/ToolRegistry';
import {
  ParallelExecutor,
  createExecutionBatch,
  canExecuteInParallel,
} from './execution/ParallelExecutor';
import { errorRecoveryManager } from './recovery/ErrorRecovery';
import {
  IntelligentTaskAnalyzer,
  TaskAnalysis,
} from './task-analysis/IntelligentTaskAnalyzer';
import { BrowserAutomationController } from './automation/BrowserAutomationController';
import { PromptManager, PromptContext } from './prompts/PromptManager';
import { ActionRegistry } from './actions/ActionRegistry';
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

  // New modules
  private intelligentTaskAnalyzer: IntelligentTaskAnalyzer;
  private browserAutomationController: BrowserAutomationController;
  private promptManager: PromptManager;
  private actionRegistry: ActionRegistry;

  private config: AgentConfig;
  private state: Web3AgentState;

  constructor(
    context: AgentContext,
    llm: IWeb3LLM,
    config?: Partial<AgentConfig>,
    dependencies?: {
      intelligentTaskAnalyzer?: IntelligentTaskAnalyzer;
      browserAutomationController?: BrowserAutomationController;
      promptManager?: PromptManager;
      actionRegistry?: ActionRegistry;
    }
  ) {
    this.context = context;
    this.llm = llm;

    // Core components
    this.intentRecognizer = new IntentRecognizer();
    this.actionPlanner = new ActionPlanner(context);
    this.transactionSimulator = new TransactionSimulator(context);
    this.confirmationManager = new ConfirmationManager(context);
    this.dappAutomation = new DAppAutomation(context);

    // New modules with dependency injection
    this.intelligentTaskAnalyzer =
      dependencies?.intelligentTaskAnalyzer || new IntelligentTaskAnalyzer(llm);
    this.browserAutomationController =
      dependencies?.browserAutomationController ||
      new BrowserAutomationController();
    this.promptManager = dependencies?.promptManager || new PromptManager();
    this.actionRegistry = dependencies?.actionRegistry || new ActionRegistry();

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

      // Step 1: AI-driven task analysis
      const taskAnalysis = await this.intelligentTaskAnalyzer.analyzeTask(
        instruction,
        this.state.currentContext
      );
      logger.info('Task analysis completed', {
        taskType: taskAnalysis.taskType,
        confidence: taskAnalysis.confidence,
        requiresBrowserAutomation: taskAnalysis.requiresBrowserAutomation,
        requiresWeb3: taskAnalysis.requiresWeb3,
      });

      // Step 2: Enhanced intent extraction with task analysis context
      const enhancedContext = {
        ...this.state.currentContext,
        taskAnalysis: taskAnalysis.reasoning,
      };

      const intent = await this.intentRecognizer.extractIntent(
        instruction,
        enhancedContext
      );
      logger.info(
        `Extracted intent: ${intent.action} with confidence ${intent.confidence}`
      );

      // Step 3: Check if this is a browser automation task
      if (taskAnalysis.requiresBrowserAutomation) {
        return await this.handleBrowserAutomationTask(
          instruction,
          taskAnalysis
        );
      }

      // Step 4: Generate enhanced prompt with new modules
      const promptContext: PromptContext = {
        messages: this.state.conversationHistory,
        context: enhancedContext,
        intent,
        tools: this.llm.getAvailableTools(),
        conversationHistory: this.state.conversationHistory,
        availableActions: this.actionRegistry.getAvailableActions(),
        taskAnalysis,
      };

      const enhancedPrompt = await this.promptManager.createPrompt(
        promptContext
      );

      // Step 5: Enhanced LLM response generation
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

      // Step 6: Generate LLM response with enhanced prompt and error recovery
      let llmResponse: LLMResponse;
      try {
        llmResponse = await this.llm.generateResponse(
          enhancedPrompt.messages,
          enhancedPrompt.context,
          enhancedPrompt.intent,
          enhancedPrompt.tools
        );
      } catch (error) {
        logger.error('LLM generation failed:', error);

        // Attempt error recovery
        const recovery = await errorRecoveryManager.recoverFromError(
          error instanceof Error ? error : new Error(String(error)),
          'llm_response_generation',
          { intent, conversationLength: this.state.conversationHistory.length }
        );

        if (recovery.success) {
          // Retry with recovered context
          try {
            llmResponse = await this.llm.generateResponse(
              this.state.conversationHistory,
              this.state.currentContext,
              intent
            );
          } catch (retryError) {
            // Use fallback response
            llmResponse =
              recovery.result || (await this.generateFallbackResponse(error));
          }
        } else if (recovery.fallback) {
          // Use fallback plan
          llmResponse = await this.generateFallbackResponse(
            error,
            recovery.fallback
          );
        } else {
          // Final fallback
          llmResponse = await this.generateFallbackResponse(error);
        }

        const errorMessage = llmResponse.response;
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

      // Step 7: Create action plan if actions were suggested
      let plan: ActionPlan | undefined;
      if (llmResponse.actions.length > 0 && intent.action !== 'QUERY') {
        plan = await this.actionPlanner.createPlan(intent);
        logger.info(`Created action plan with ${plan.actions.length} steps`);
      }

      // Step 4: Simulate transactions if simulation is enabled and plan exists (with error recovery)
      let simulation: any;
      if (this.config.simulationEnabled && plan && plan.requiresConfirmation) {
        try {
          simulation = await this.transactionSimulator.simulatePlan(plan);
          logger.info(
            `Transaction simulation completed with risk level: ${simulation.riskLevel}`
          );
        } catch (simulationError) {
          logger.warn(
            'Transaction simulation failed, proceeding without simulation',
            simulationError
          );

          // Attempt recovery for simulation failure
          await errorRecoveryManager.recoverFromError(
            simulationError instanceof Error
              ? simulationError
              : new Error(String(simulationError)),
            'transaction_simulation',
            { plan: plan.actions.map((a) => a.type) }
          );

          // Continue without simulation
          simulation = {
            riskLevel: 'UNKNOWN',
            successRate: 0.5,
            totalGas: '0x0',
            totalTime: 0,
          };
        }
      }

      // Step 5: Handle confirmation and execution (with error recovery)
      let executedActions: ActionStep[] = [];
      if (plan && (await this.shouldExecutePlan(plan, simulation))) {
        try {
          executedActions = await this.executePlan(plan);
        } catch (executionError) {
          logger.error('Plan execution failed:', executionError);

          // Attempt error recovery for execution failure
          const recovery = await errorRecoveryManager.recoverFromError(
            executionError instanceof Error
              ? executionError
              : new Error(String(executionError)),
            'plan_execution',
            { plan: plan.actions.map((a) => a.type) }
          );

          if (recovery.success) {
            // Retry execution with recovered context
            try {
              executedActions = await this.executePlan(plan);
            } catch (retryError) {
              logger.error('Retry execution also failed:', retryError);
              executedActions = this.generateFailedActions(
                plan.actions,
                retryError
              );
            }
          } else {
            executedActions = this.generateFailedActions(
              plan.actions,
              executionError
            );
          }
        }
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
        for (const depId of action.dependencies || []) {
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
    try {
      // Check if this is a browser automation action
      if (action.type && this.isBrowserAutomationAction(action.type)) {
        return await this.executeBrowserAutomationAction(action);
      }

      // Use ActionRegistry for dynamic action execution
      const validationResult = this.actionRegistry.validateParameters(
        action.type || '',
        action.params || {}
      );
      if (!validationResult.valid) {
        logger.warn(
          `Parameter validation failed for ${action.type}:`,
          validationResult.errors
        );
        return this.generateFailedAction(
          action,
          new Error(validationResult.errors.join(', '))
        );
      }

      const result = await this.actionRegistry.executeAction(
        action.type || '',
        action.params || {},
        this.state.currentContext
      );

      if (result.success) {
        return {
          ...action,
          result: result.data,
          status: 'completed' as const,
        };
      } else {
        return this.generateFailedAction(
          action,
          new Error(result.error || 'Action execution failed')
        );
      }
    } catch (error) {
      logger.error(`Action execution failed: ${action.type}`, error);

      // Attempt error recovery for individual action failure
      const recovery = await errorRecoveryManager.recoverFromError(
        error instanceof Error ? error : new Error(String(error)),
        `action_execution_${action.type}`,
        action.params
      );

      if (recovery.success) {
        // Retry action execution with recovered context
        try {
          const retryResult = await this.actionRegistry.executeAction(
            action.type || '',
            action.params || {},
            this.state.currentContext
          );
          if (retryResult.success) {
            return {
              ...action,
              result: retryResult.data,
              status: 'completed' as const,
            };
          } else {
            return this.generateFailedAction(
              action,
              new Error(retryResult.error || 'Retry failed')
            );
          }
        } catch (retryError) {
          logger.error(
            `Retry action execution also failed: ${action.type}`,
            retryError
          );
          return this.generateFailedAction(action, retryError);
        }
      } else {
        return this.generateFailedAction(action, error);
      }
    }
  }

  // Action execution methods
  private async executeCheckBalance(action: ActionStep): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual balance checking
    const balance = '0';

    return {
      ...action,
      result: { success: true, balance },
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
      result: { success: true, txHash },
      status: 'completed' as const,
    };
  }

  private async executeApproveToken(action: ActionStep): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual token approval
    const txHash = '0x' + Math.random().toString(16).substr(2, 64);

    return {
      ...action,
      result: { success: true, txHash },
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
      result: { success: true, txHash, outputAmount },
      status: 'completed' as const,
    };
  }

  private async executeBridgeTokens(action: ActionStep): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual token bridging
    const txHash = '0x' + Math.random().toString(16).substr(2, 64);

    return {
      ...action,
      result: { success: true, txHash },
      status: 'completed' as const,
    };
  }

  private async executeStakeTokens(action: ActionStep): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual token staking
    const txHash = '0x' + Math.random().toString(16).substr(2, 64);

    return {
      ...action,
      result: { success: true, txHash },
      status: 'completed' as const,
    };
  }

  private async executeConnectWallet(action: ActionStep): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual wallet connection
    const connected = true;

    return {
      ...action,
      result: { success: true, connected },
      status: 'completed' as const,
    };
  }

  private async executeSwitchNetwork(action: ActionStep): Promise<ActionStep> {
    const { params } = action;

    // TODO: Implement actual network switching
    const switched = true;

    return {
      ...action,
      result: { success: true, switched },
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

  // Enhanced function calling support
  async processUserInstructionWithFunctionCalling(
    instruction: string,
    enableStreaming: boolean = false,
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<AgentResponse> {
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

      // Step 2: Get available tools for function calling
      const availableTools = this.llm.getAvailableTools();

      // Step 3: Generate LLM response with function calling
      let llmResponse: LLMResponse;
      if (enableStreaming && this.llm.supportsFunctionCalling()) {
        llmResponse = await this.llm.generateStreamingResponse(
          this.state.conversationHistory,
          this.state.currentContext,
          intent,
          availableTools,
          onChunk
        );
      } else {
        llmResponse = await this.llm.generateResponse(
          this.state.conversationHistory,
          this.state.currentContext,
          intent,
          availableTools
        );
      }

      // Step 4: Execute function calls if any
      const executedActions: ActionStep[] = [];
      if (llmResponse.functionCalls && llmResponse.functionCalls.length > 0) {
        executedActions.push(
          ...(await this.executeFunctionCalls(llmResponse.functionCalls))
        );
      }

      // Step 5: Generate final response
      const response = await this.generateFinalResponse(
        instruction,
        intent,
        llmResponse,
        undefined, // No traditional plan for function calling
        undefined, // No simulation for function calling
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
      this.state.executionHistory.push(...executedActions);

      return {
        success: true,
        message: response,
        actions: executedActions,
        sessionId: this.state.sessionId,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error(
        'Error processing user instruction with function calling:',
        error
      );

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

  private async executeFunctionCalls(
    functionCalls: FunctionCall[]
  ): Promise<ActionStep[]> {
    if (functionCalls.length === 0) {
      return [];
    }

    // Check if we can execute in parallel
    const parallelCheck = canExecuteInParallel(functionCalls);

    if (parallelCheck.canParallel && functionCalls.length > 1) {
      logger.info('Executing function calls in parallel', {
        count: functionCalls.length,
        reason: parallelCheck.reason,
      });

      return await this.executeFunctionCallsParallel(functionCalls);
    } else {
      logger.info('Executing function calls sequentially', {
        count: functionCalls.length,
        reason: parallelCheck.reason || 'Single function call',
      });

      return await this.executeFunctionCallsSequential(functionCalls);
    }
  }

  private async executeFunctionCallsSequential(
    functionCalls: FunctionCall[]
  ): Promise<ActionStep[]> {
    const executedActions: ActionStep[] = [];

    for (const functionCall of functionCalls) {
      try {
        logger.info(
          `Executing function call: ${functionCall.name}`,
          functionCall.arguments
        );

        // Validate parameters
        const validation = toolRegistry.validateParameters(
          functionCall.name,
          functionCall.arguments
        );
        if (!validation.valid) {
          logger.warn(
            `Parameter validation failed for ${functionCall.name}:`,
            validation.errors
          );
          continue;
        }

        // Execute the function call
        const result = await toolRegistry.executeTool(
          functionCall.name,
          functionCall.arguments
        );

        // Create action step
        const actionStep: ActionStep = {
          id: `func_${functionCall.name}_${Date.now()}`,
          name: `Execute ${functionCall.name}`,
          type: functionCall.name,
          description: `Executed ${functionCall.name}`,
          params: functionCall.arguments,
          status: 'completed',
          result,
          dependencies: [],
          riskLevel: this.getFunctionRiskLevel(functionCall.name),
        };

        executedActions.push(actionStep);
        logger.info(
          `Function call executed successfully: ${functionCall.name}`
        );
      } catch (error) {
        logger.error(
          `Function call execution failed: ${functionCall.name}`,
          error
        );

        // Create failed action step
        const actionStep: ActionStep = {
          id: `func_${functionCall.name}_${Date.now()}`,
          name: `Execute ${functionCall.name}`,
          type: functionCall.name,
          description: `Failed to execute ${functionCall.name}`,
          params: functionCall.arguments,
          status: 'failed',
          result: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          dependencies: [],
          riskLevel: this.getFunctionRiskLevel(functionCall.name),
        };

        executedActions.push(actionStep);
      }
    }

    return executedActions;
  }

  private async executeFunctionCallsParallel(
    functionCalls: FunctionCall[]
  ): Promise<ActionStep[]> {
    const executedActions: ActionStep[] = [];

    try {
      // Create parallel executor with optimized settings
      const executor = createExecutionBatch(functionCalls, {
        maxConcurrency: 3,
        timeoutMs: 30000,
        retryAttempts: 2,
        enableParallel: true,
        dependencyAware: true,
      });

      // Execute actions in parallel
      const results = await executor.executeActions(functionCalls);

      // Convert execution results to action steps
      for (const result of results) {
        const functionCall = functionCalls.find((fc) => {
          const actionId = this.getFunctionCallId(
            fc,
            functionCalls.indexOf(fc)
          );
          return actionId === result.actionId;
        });

        if (!functionCall) continue;

        const actionStep: ActionStep = {
          id: result.actionId,
          name: `Execute ${functionCall.name}`,
          type: functionCall.name,
          description: result.success
            ? `Executed ${functionCall.name} (parallel)`
            : `Failed to execute ${functionCall.name} (parallel)`,
          params: functionCall.arguments,
          status: result.success ? 'completed' : 'failed',
          result: result.success ? result.result : { error: result.error },
          dependencies: result.dependencies,
          riskLevel: this.getFunctionRiskLevel(functionCall.name),
        };

        executedActions.push(actionStep);
      }

      logger.info('Parallel function call execution completed', {
        total: functionCalls.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        averageDuration:
          results.reduce((sum, r) => sum + r.duration, 0) / results.length,
      });
    } catch (error) {
      logger.error('Parallel function call execution failed', error);

      // Fall back to sequential execution
      logger.info('Falling back to sequential execution');
      return await this.executeFunctionCallsSequential(functionCalls);
    }

    return executedActions;
  }

  private getFunctionCallId(functionCall: FunctionCall, index: number): string {
    return `func_${functionCall.name}_${index}_${Date.now()}`;
  }

  private getFunctionRiskLevel(
    functionName: string
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    const tool = toolRegistry.getTool(functionName);
    if (!tool) return 'MEDIUM';

    switch (tool.riskLevel) {
      case 'low':
        return 'LOW';
      case 'medium':
        return 'MEDIUM';
      case 'high':
        return 'HIGH';
      default:
        return 'MEDIUM';
    }
  }

  // Public methods for enhanced capabilities
  async getAvailableTools(): Promise<FunctionSchema[]> {
    return this.llm.getAvailableTools();
  }

  async supportsFunctionCalling(): Promise<boolean> {
    return this.llm.supportsFunctionCalling();
  }

  async supportsStreaming(): Promise<boolean> {
    return (
      'generateStreamingResponse' in this.llm &&
      typeof this.llm.generateStreamingResponse === 'function'
    );
  }

  async getToolRegistryInfo() {
    return toolRegistry.getToolInfo();
  }

  // Fallback response generation methods
  private async generateFallbackResponse(
    error: any,
    fallbackPlan?: any
  ): Promise<LLMResponse> {
    if (fallbackPlan) {
      return {
        response: `I apologize, but I encountered an issue while processing your request. I've activated a fallback plan to assist you: ${fallbackPlan.description}. Please try rephrasing your request or try again later.`,
        actions: [],
        confidence: 0.3,
        thinking: 'Using fallback response due to error',
      };
    }

    // Analyze the error type and provide targeted fallback
    if (this.isNetworkError(error)) {
      return {
        response:
          "I apologize, but I'm currently experiencing network connectivity issues. This might be due to a poor internet connection or temporary service outage. Please check your connection and try again in a few moments.",
        actions: [],
        confidence: 0.4,
        thinking: 'Network connectivity issue detected',
      };
    }

    if (this.isApiError(error)) {
      return {
        response:
          "I apologize, but I'm experiencing technical difficulties with my AI service. This is a temporary issue, and my team has been notified. Please try again in a few minutes.",
        actions: [],
        confidence: 0.3,
        thinking: 'AI service API issue detected',
      };
    }

    // Generic fallback
    return {
      response:
        'I apologize, but I encountered an unexpected error while processing your request. This could be due to temporary system issues. Please try rephrasing your request or try again later. If the problem persists, please contact support.',
      actions: [],
      confidence: 0.2,
      thinking: 'Generic error fallback response',
    };
  }

  private generateFailedActions(
    actions: ActionStep[],
    error: any
  ): ActionStep[] {
    return actions.map((action) => ({
      ...action,
      status: 'failed' as const,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        fallback: true,
      },
    }));
  }

  private generateFailedAction(action: ActionStep, error: any): ActionStep {
    return {
      ...action,
      status: 'failed' as const,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        fallback: true,
      },
    };
  }

  // Error classification helpers
  private isNetworkError(error: any): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const networkErrorPatterns = [
      /network/i,
      /connection/i,
      /timeout/i,
      /ECONNREFUSED/i,
      /fetch/i,
      /offline/i,
    ];

    return networkErrorPatterns.some((pattern) => pattern.test(message));
  }

  private isApiError(error: any): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const apiErrorPatterns = [
      /api/i,
      /llm/i,
      /model/i,
      /provider/i,
      /rate.?limit/i,
      /quota/i,
      /unauthorized/i,
    ];

    return apiErrorPatterns.some((pattern) => pattern.test(message));
  }

  // Public method for error recovery statistics
  public async getErrorRecoveryStats() {
    return errorRecoveryManager.getErrorStats();
  }

  public async clearErrorHistory() {
    errorRecoveryManager.clearErrorHistory();
  }

  public async resetCircuitBreakers() {
    errorRecoveryManager.resetCircuitBreakers();
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
          action: action.type || '',
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
        action: action.type || '',
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

  /**
   * Handle browser automation tasks
   */
  private async handleBrowserAutomationTask(
    instruction: string,
    taskAnalysis: TaskAnalysis
  ): Promise<AgentResponse> {
    try {
      logger.info('Handling browser automation task', {
        instruction,
        taskType: taskAnalysis.taskType,
      });

      const result = await this.browserAutomationController.handleAutomationTask(
        instruction,
        taskAnalysis,
        false, // Streaming handled separately
        undefined
      );

      // Add user message to conversation history
      const userMessage = new HumanMessage(instruction);
      this.state.conversationHistory.push(userMessage);

      // Add assistant response to conversation history
      const assistantMessage = new AIMessage(result.message);
      this.state.conversationHistory.push(assistantMessage);

      // Convert ActionStep types for compatibility
      const convertedActions = result.actions.map((action) => ({
        id: action.id,
        name: action.type || action.description,
        description: action.description,
        status: (action.status || 'pending') as
          | 'pending'
          | 'in_progress'
          | 'completed'
          | 'failed',
        type: action.type,
        params: action.params,
        dependencies: action.dependencies,
      }));

      // Store in chat history
      await this.storeConversationStep(
        userMessage,
        assistantMessage,
        convertedActions
      );

      // Update state
      this.state.lastActivity = Date.now();
      this.state.executionHistory.push(...convertedActions);

      return {
        success: result.success,
        message: result.message,
        actions: convertedActions,
        sessionId: this.state.sessionId,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Browser automation task failed', error);

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

  /**
   * Execute browser automation action
   */
  private async executeBrowserAutomationAction(
    action: ActionStep
  ): Promise<ActionStep> {
    try {
      const result = await this.browserAutomationController.executeAction(
        action
      );

      return {
        ...action,
        result: result.data,
        status: 'completed' as const,
      };
    } catch (error) {
      logger.error(`Browser automation failed: ${action.type}`, error);
      return this.generateFailedAction(action, error);
    }
  }

  /**
   * Check if action is browser automation
   */
  private isBrowserAutomationAction(actionType: string): boolean {
    const browserActions = [
      'navigate',
      'click',
      'fill_form',
      'extract_content',
      'wait_for',
      'scroll',
      'screenshot',
      'switch_tab',
      'close_tab',
      'navigateToUrl',
      'clickElement',
      'fillForm',
      'extractContent',
    ];

    return browserActions.includes(actionType);
  }

  // Public methods for accessing new modules
  async getIntelligentTaskAnalyzer() {
    return this.intelligentTaskAnalyzer;
  }

  async getBrowserAutomationController() {
    return this.browserAutomationController;
  }

  async getPromptManager() {
    return this.promptManager;
  }

  async getActionRegistry() {
    return this.actionRegistry;
  }

  async getEnhancedStats() {
    return {
      web3Agent: {
        sessionId: this.state.sessionId,
        conversationLength: this.state.conversationHistory.length,
        executionHistory: this.state.executionHistory.length,
        lastActivity: this.state.lastActivity,
      },
      taskAnalyzer: await this.intelligentTaskAnalyzer.getCacheStats(),
      browserAutomation: await this.browserAutomationController.getExecutionHistory(),
      promptManager: await this.promptManager.getPromptStats(),
      actionRegistry: this.actionRegistry.getStats(),
    };
  }
}
