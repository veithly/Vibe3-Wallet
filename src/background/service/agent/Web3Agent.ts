// Core Web3 Agent orchestration system that coordinates all components
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
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
import { EnhancedNavigatorAgent } from './agents/EnhancedNavigatorAgent';
import { MultiAgentSystem } from './agents/MultiAgentSystem';
import { DynamicTaskPlanner, PlanningContext } from './agents/TaskPlanner';
import { AgentMessage } from './agents/AgentTypes';
import { TaskValidator } from './agents/TaskValidator';
import { AgentConfigManager } from './agents/schemas/AgentConfig';
import {
  elementSelectionAgent,
  ElementSelectionAgent,
  ElementSelectionTask,
} from './element-selection/ElementSelectionAgent';
import { MultiAgentIntegration } from './agents/MultiAgentIntegration';
import {
  EnhancedIntent,
  ExecutionPlan,
  ActionResult,
  CoordinationEvent,
  MultiStepExecutor,
  ContextSnapshot,
  RiskAssessment,
  EnhancedAction,
} from './types/BaseTypes';

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
  metadata?: Record<string, any>;
}

export interface Web3AgentConfig {
  maxRetries: number;
  timeoutMs: number;
  autoConfirmLowRisk: boolean;
  requireConfirmationHighRisk: boolean;
  simulationEnabled: boolean;
  riskThreshold: number;
  enableStreaming?: boolean;
}

export interface Web3AgentState {
  sessionId: string;
  currentContext: Web3Context;
  activePlan?: ActionPlan;
  executionHistory: ActionStep[];
  conversationHistory: BaseMessage[];
  lastActivity: number;
  multiStepExecutor?: MultiStepExecutor;
  currentEnhancedPlan?: ExecutionPlan;
  agentStatus?: Record<string, any>;
  coordinationEvents?: CoordinationEvent[];
}

// ReAct runtime configuration loaded from Settings
interface ReActRuntimeConfig {
  enabled: boolean;
  maxSteps: number; // safety cap for ReAct iterations
  timeoutMs: number; // overall ReAct loop timeout
  showThinking: boolean; // whether to emit thinking/status messages
  autoContinue: boolean; // whether to continue multiple iterations automatically
}

import { EventEmitter } from 'events';

export class Web3Agent extends EventEmitter {
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

  // Multi-Agent System
  private multiAgentSystem!: MultiAgentSystem;
  private elementSelectionAgent: ElementSelectionAgent;
  private multiStepExecutor: MultiStepExecutor;
  private reactConfig: ReActRuntimeConfig = {
    enabled: true,
    maxSteps: 50,
    timeoutMs: 30000,
    showThinking: true,
    autoContinue: true,
  };

  private multiAgentIntegration!: MultiAgentIntegration;
  private coordinationEnabled: boolean = true;

  // Individual agents
  private plannerAgent!: DynamicTaskPlanner;
  private navigatorAgent!: EnhancedNavigatorAgent;
  private validatorAgent!: TaskValidator;

  private config: Web3AgentConfig;
  private state: Web3AgentState;
  private activeTabId?: number;

  // Cancellation handling for current task
  private _cancelled: boolean = false;
  public cancelCurrentTask(): void {
    try {
      this._cancelled = true;

      // 取消LLM流式处理
      try {
        (this.llm as any)?.cancelStreaming?.();
        logger.info('Web3Agent', 'Cancelled LLM streaming');
      } catch (e) {
        logger.warn('Web3Agent', 'Failed to cancel LLM streaming', e);
      }

      // 取消上下文中的任务
      try {
        if (this.context && typeof (this.context as any).stop === 'function') {
          (this.context as any).stop();
          logger.info('Web3Agent', 'Cancelled context task');
        }
      } catch (e) {
        logger.warn('Web3Agent', 'Failed to cancel context task', e);
      }

      // 取消浏览器自动化控制器
      try {
        if (this.browserAutomationController && typeof (this.browserAutomationController as any).cancelAllOperations === 'function') {
          (this.browserAutomationController as any).cancelAllOperations();
          logger.info('Web3Agent', 'Cancelled browser automation operations');
        }
      } catch (e) {
        logger.warn('Web3Agent', 'Failed to cancel browser automation', e);
      }

      // 取消元素选择代理
      try {
        if (this.elementSelectionAgent && typeof (this.elementSelectionAgent as any).cancelCurrentTask === 'function') {
          (this.elementSelectionAgent as any).cancelCurrentTask();
          logger.info('Web3Agent', 'Cancelled element selection task');
        }
      } catch (e) {
        logger.warn('Web3Agent', 'Failed to cancel element selection task', e);
      }

      logger.info(
        'Web3Agent',
        'cancelCurrentTask called: cancellation flag set and all operations cancelled'
      );
    } catch (e) {
      logger.error('Web3Agent', 'Error in cancelCurrentTask', e);
    }
  }
  private ensureNotCancelled(): void {
    if (this._cancelled) {
      throw new Error('Task cancelled');
    }
  }

  public setActiveTabId(tabId: number) {
    this.activeTabId = tabId;
  }

  constructor(
    context: AgentContext,
    llm: IWeb3LLM,
    config?: Partial<Web3AgentConfig>,
    dependencies?: {
      intelligentTaskAnalyzer?: IntelligentTaskAnalyzer;
      browserAutomationController?: BrowserAutomationController;
      promptManager?: PromptManager;
      actionRegistry?: ActionRegistry;
    }
  ) {
    super();
    // 🔥🔥🔥 EXTREMELY AGGRESSIVE DEBUGGING - WEB3AGENT CONSTRUCTOR CALLED! 🔥🔥🔥
    console.log(
      '🔥🔥🔥 WEB3AGENT CONSTRUCTOR INITIALIZED - THIS MUST APPEAR IN CONSOLE! 🔥🔥🔥',
      {
        timestamp: Date.now(),
        contextType: typeof context,
        llmType: typeof llm,
        configProvided: !!config,
        dependenciesProvided: !!dependencies,
        constructorStack: new Error().stack,
      }
    );

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

    // Initialize Element Selection Agent
    this.elementSelectionAgent = elementSelectionAgent;

    // Initialize Multi-Agent System
    this.initializeMultiAgentSystem();

    this.config = {
      maxConcurrentTasks: 3,
      defaultTimeout: 30000,
      retryAttempts: 3,
      enableStreaming: true,
      enableOptimization: true,
      securityLevel: 'medium',
      performanceMode: 'balanced',
      maxRetries: 3,
      timeoutMs: 30000,
      autoConfirmLowRisk: true,
      requireConfirmationHighRisk: true,
      simulationEnabled: true,
      riskThreshold: 0.7,
      ...config,
    } as Web3AgentConfig;

    this.multiStepExecutor = {
      id: `executor_${Date.now()}`,
      sessionId: '',
      executionHistory: [],
      isExecuting: false,
      startTime: undefined,
      endTime: undefined,
    };

    this.state = {
      sessionId: '',
      currentContext: this.initializeWeb3Context(),
      executionHistory: [],
      conversationHistory: [],
      lastActivity: Date.now(),
      multiStepExecutor: this.multiStepExecutor,
      agentStatus: {},
      coordinationEvents: [],
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

  /**
   * Initialize Multi-Agent System
   */
  private initializeMultiAgentSystem(): void {
    try {
      // Initialize multi-agent system
      this.multiAgentSystem = new MultiAgentSystem(
        this.llm,
        this.state.currentContext
      );

      // Initialize multi-agent integration
      this.multiAgentIntegration = new MultiAgentIntegration(
        this.llm,
        this.state.currentContext
      );

      // Initialize individual agents
      this.plannerAgent = new DynamicTaskPlanner(this.llm);
      this.navigatorAgent = new EnhancedNavigatorAgent(
        new AgentConfigManager('development')
      );
      this.validatorAgent = new TaskValidator(this.llm);

      logger.info('Multi-agent system initialized successfully', {
        multiAgentSystem: !!this.multiAgentSystem,
        multiAgentIntegration: !!this.multiAgentIntegration,
        plannerAgent: !!this.plannerAgent,
        navigatorAgent: !!this.navigatorAgent,
        validatorAgent: !!this.validatorAgent,
        coordinationEnabled: this.coordinationEnabled,
      });
    } catch (error) {
      logger.error('Failed to initialize multi-agent system:', error);
      this.coordinationEnabled = false; // Disable coordination on initialization failure
    }
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

    // Load ReAct runtime configuration from storage and subscribe to updates
    try {
      await this.loadReActConfigFromStorage?.();
    } catch (e) {
      console.warn('[Web3Agent] Failed to load ReAct config on init', e);
    }

    console.log(`Web3Agent initialized with session: ${this.state.sessionId}`);
  }

  private async loadReActConfigFromStorage(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const data = await new Promise<any>((resolve) => {
          try {
            chrome.storage.local.get('reactConfig', (res) => resolve(res));
          } catch (e) {
            resolve({});
          }
        });
        const cfg = data?.reactConfig;
        if (cfg && typeof cfg === 'object') {
          this.reactConfig = {
            enabled: cfg.enabled ?? this.reactConfig.enabled,
            maxSteps: Number.isFinite(cfg.maxSteps)
              ? cfg.maxSteps
              : this.reactConfig.maxSteps,
            timeoutMs: Number.isFinite(cfg.timeoutMs)
              ? cfg.timeoutMs
              : this.reactConfig.timeoutMs,
            showThinking: cfg.showThinking ?? this.reactConfig.showThinking,
            autoContinue: cfg.autoContinue ?? this.reactConfig.autoContinue,
          };
        }
        // Listen for future changes
        try {
          chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes.reactConfig) {
              const newVal = changes.reactConfig.newValue || {};
              this.reactConfig = {
                enabled: newVal.enabled ?? this.reactConfig.enabled,
                maxSteps: Number.isFinite(newVal.maxSteps)
                  ? newVal.maxSteps
                  : this.reactConfig.maxSteps,
                timeoutMs: Number.isFinite(newVal.timeoutMs)
                  ? newVal.timeoutMs
                  : this.reactConfig.timeoutMs,
                showThinking:
                  newVal.showThinking ?? this.reactConfig.showThinking,
                autoContinue:
                  newVal.autoContinue ?? this.reactConfig.autoContinue,
              };
              console.log(
                '[Web3Agent] ReAct config updated from storage',
                this.reactConfig
              );
            }
          });
        } catch {}
        console.log(
          '[Web3Agent] ReAct config loaded from storage',
          this.reactConfig
        );
      }
    } catch (e) {
      console.warn(
        '[Web3Agent] Failed to load ReAct config, using defaults',
        e
      );
    }
  }

  async processUserInstruction(
    instruction: string,
    enableStreaming: boolean = false,
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<AgentResponse> {
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

      // Step 2: Check if multi-agent coordination should be used
      if (
        this.coordinationEnabled &&
        this.shouldUseMultiAgentCoordination(taskAnalysis)
      ) {
        return await this.processWithMultiAgentCoordination(
          instruction,
          taskAnalysis
        );
      }

      // Step 3: Enhanced intent extraction with task analysis context
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

      // Step 4: Check if this is a browser automation task
      if (taskAnalysis.requiresBrowserAutomation) {
        return await this.handleBrowserAutomationTask(
          instruction,
          taskAnalysis
        );
      }

      // Step 4: Generate enhanced prompt with new modules
      const promptContext: PromptContext = {
        messages: this.buildPrunedMessages(),
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
        if (enableStreaming && onChunk && this.llm.generateStreamingResponse) {
          // Use streaming response generation
          llmResponse = await this.llm.generateStreamingResponse(
            enhancedPrompt.messages,
            enhancedPrompt.context,
            enhancedPrompt.intent,
            enhancedPrompt.tools,
            onChunk
          );
        } else {
          // Use regular response generation
          llmResponse = await this.llm.generateResponse(
            enhancedPrompt.messages,
            enhancedPrompt.context,
            enhancedPrompt.intent,
            enhancedPrompt.tools
          );
        }
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
            if (
              enableStreaming &&
              onChunk &&
              this.llm.generateStreamingResponse
            ) {
              // Use streaming response generation for retry
              llmResponse = await this.llm.generateStreamingResponse(
                this.state.conversationHistory,
                this.state.currentContext,
                intent,
                undefined, // no tools for retry
                onChunk
              );
            } else {
              // Use regular response generation for retry
              llmResponse = await this.llm.generateResponse(
                this.state.conversationHistory,
                this.state.currentContext,
                intent
              );
            }
          } catch (retryError) {
            // Surface raw provider error rather than preset fallback
            const raw =
              retryError instanceof Error
                ? retryError.message
                : JSON.stringify(retryError);
            throw new Error(raw);
          }
        } else if (recovery.fallback) {
          // Surface fallback reason explicitly
          throw new Error(
            typeof recovery.fallback === 'string'
              ? recovery.fallback
              : JSON.stringify(recovery.fallback)
          );
        } else {
          // No recovery — propagate original error to UI
          const raw =
            error instanceof Error ? error.message : JSON.stringify(error);
          throw new Error(raw);
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
      if (
        (this.config as any).simulationEnabled &&
        plan &&
        plan.requiresConfirmation
      ) {
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

  /**
   * Determine if multi-agent coordination should be used
   */
  private shouldUseMultiAgentCoordination(taskAnalysis: TaskAnalysis): boolean {
    // Use multi-agent coordination for complex tasks
    const coordinationCriteria = [
      taskAnalysis.complexity === 'high',
      taskAnalysis.requiresBrowserAutomation && taskAnalysis.requiresWeb3,
      taskAnalysis.estimatedSteps > 3,
      taskAnalysis.taskType === 'automation',
      taskAnalysis.taskType === 'interaction',
    ];

    return coordinationCriteria.some((criterion) => criterion);
  }

  /**
   * Process instruction using multi-agent coordination
   */
  private async processWithMultiAgentCoordination(
    instruction: string,
    taskAnalysis: TaskAnalysis
  ): Promise<AgentResponse> {
    try {
      logger.info('Starting multi-agent coordination', {
        instruction,
        taskType: taskAnalysis.taskType,
        complexity: taskAnalysis.complexity,
      });

      const startTime = Date.now();
      this.multiStepExecutor.isExecuting = true;
      this.multiStepExecutor.startTime = startTime;

      // Step 1: Create enhanced intent for multi-agent system
      const enhancedIntent: EnhancedIntent = {
        id: `intent_${Date.now()}`,
        action: taskAnalysis.taskType,
        confidence: taskAnalysis.confidence,
        parameters: { instruction },
        context: this.state.currentContext,
        taskAnalysis: {
          id: `task_${Date.now()}`,
          intentId: `intent_${Date.now()}`,
          taskType: taskAnalysis.taskType,
          complexity: taskAnalysis.complexity,
          estimatedDuration: taskAnalysis.estimatedSteps * 5000, // Convert steps to milliseconds
          requiredCapabilities: this.getRequiredCapabilities(taskAnalysis),
          riskLevel: this.getRiskLevel(taskAnalysis),
        },
        executionStrategy: {
          mode: 'adaptive',
          maxConcurrency: 3,
          errorHandling: 'retry',
          optimization: 'balanced',
        },
      };

      // Step 2: Planner Agent creates execution plan
      const executionPlan = await this.executePlannerAgent(enhancedIntent);
      if (!executionPlan) {
        throw new Error('Planner agent failed to create execution plan');
      }
      this.state.currentEnhancedPlan = executionPlan;

      // Step 3: Navigator Agent executes the plan
      const navigatorResult = await this.executeNavigatorAgent(executionPlan);

      // Step 4: Validator Agent validates results
      const validatorResult = await this.executeValidatorAgent(
        enhancedIntent,
        executionPlan,
        navigatorResult.data || []
      );

      // Step 5: Generate final response
      const response = await this.generateMultiAgentResponse(
        instruction,
        enhancedIntent,
        executionPlan,
        navigatorResult.data || [],
        validatorResult.result
      );

      // Update state
      this.multiStepExecutor.isExecuting = false;
      this.multiStepExecutor.endTime = Date.now();
      this.multiStepExecutor.currentPlan = executionPlan;
      this.multiStepExecutor.executionHistory = this.convertActionResultsToEnhancedActions(
        navigatorResult.data || []
      );

      // Add to coordination events
      this.recordCoordinationEvent('task_complete', {
        executionPlan,
        navigatorResult,
        validatorResult,
        duration: Date.now() - startTime,
      });

      const assistantMessage = new AIMessage(response.message);
      this.state.conversationHistory.push(assistantMessage);

      await this.storeConversationStep(
        new HumanMessage(instruction),
        assistantMessage,
        this.convertActionResultsToActionSteps(navigatorResult.data || [])
      );

      this.state.lastActivity = Date.now();

      return {
        success: response.success,
        message: response.message,
        actions: this.convertActionResultsToActionSteps(
          navigatorResult.data || []
        ),
        sessionId: this.state.sessionId,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Multi-agent coordination failed:', error);

      // Fallback to traditional processing
      logger.info('Falling back to traditional processing');
      return await this.processWithTraditionalMethod(instruction, taskAnalysis);
    }
  }

  /**
   * Get required capabilities for task analysis
   */
  private getRequiredCapabilities(taskAnalysis: TaskAnalysis): string[] {
    const capabilities: string[] = [];

    if (taskAnalysis.requiresBrowserAutomation) {
      capabilities.push('browser_automation');
    }

    if (taskAnalysis.requiresWeb3) {
      capabilities.push('web3');
    }

    if (taskAnalysis.taskType === 'automation') {
      capabilities.push('automation');
    }

    return capabilities;
  }

  /**
   * Get risk level for task analysis
   */
  private getRiskLevel(taskAnalysis: TaskAnalysis): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (taskAnalysis.complexity === 'high' || taskAnalysis.requiresWeb3) {
      return 'HIGH';
    }

    if (taskAnalysis.requiresBrowserAutomation) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  /**
   * Convert AgentTaskPlan to ExecutionPlan
   */
  private convertToExecutionPlan(agentTaskPlan: any): ExecutionPlan {
    const enhancedActions: EnhancedAction[] = agentTaskPlan.steps.map(
      (step: any, index: number) => ({
        id: step.id || `action_${index}`,
        name: step.description || `Step ${index + 1}`,
        description: step.description || '',
        status: 'pending' as const,
        type: step.type,
        params: step.parameters || {},
        dependencies: step.dependencies || [],
        riskLevel: 'LOW' as const,
        agentType: this.getAgentTypeForStep(step.type),
        priority:
          agentTaskPlan.priority === 'high'
            ? 1
            : agentTaskPlan.priority === 'low'
            ? 3
            : 2,
        retries: 0,
        maxRetries: step.retries || 3,
        timeout: step.timeout || 10000,
        fallbackActions: [],
        contextRequirements: [],
      })
    );

    return {
      id: agentTaskPlan.id,
      name: agentTaskPlan.instruction || 'Task Plan',
      description: agentTaskPlan.reasoning || 'Generated task plan',
      actions: enhancedActions,
      dependencies: [],
      estimatedDuration: agentTaskPlan.estimatedDuration || 30000,
      riskLevel: 'LOW' as const,
      requiresConfirmation: false,
      metadata: {
        originalPlan: agentTaskPlan,
        confidence: agentTaskPlan.confidence || 0.8,
        reasoning: agentTaskPlan.reasoning || '',
      },
    };
  }

  /**
   * Get agent type for step type
   */
  private getAgentTypeForStep(
    stepType: string
  ): 'planner' | 'navigator' | 'validator' | 'web3' | 'browser' {
    switch (stepType) {
      case 'navigate':
      case 'click':
      case 'input':
      case 'scroll':
      case 'highlight':
      case 'focus':
        return 'navigator';
      case 'validate':
      case 'extract':
        return 'validator';
      case 'wait':
        return 'browser';
      default:
        return 'navigator';
    }
  }

  /**
   * Execute Planner Agent
   */
  private async executePlannerAgent(intent: EnhancedIntent) {
    try {
      this.emitCoordinationEvent('planner_start', { intent });

      const planningContext: PlanningContext = {
        instruction: intent.parameters.instruction,
        currentUrl: '', // Will be set during execution
        previousSteps: [],
        failedSteps: [],
        currentStep: 0,
        maxSteps: 10,
        context: this.state.currentContext,
        executionHistory: [],
      };

      const plannerResult = await this.plannerAgent.createPlan(
        intent.parameters.instruction,
        planningContext,
        'adaptive'
      );

      // Convert AgentTaskPlan to ExecutionPlan
      const executionPlan = this.convertToExecutionPlan(plannerResult.plan);

      this.emitCoordinationEvent('planner_complete', { result: executionPlan });
      return executionPlan;
    } catch (error) {
      logger.error('Planner agent execution failed:', error);
      this.emitCoordinationEvent('planner_error', { error });
      throw error;
    }
  }

  /**
   * Execute Navigator Agent
   */
  private async executeNavigatorAgent(plan: ExecutionPlan) {
    try {
      this.emitCoordinationEvent('navigator_start', { plan });

      // Convert ExecutionPlan actions to navigator-compatible format
      const navigatorMessage: AgentMessage = {
        id: `navigator_${Date.now()}`,
        from: 'web3-agent',
        to: 'enhanced-navigator',
        type: 'request',
        content: {
          action: 'execute_plan',
          plan: plan.actions,
          context: this.state.currentContext,
        },
        timestamp: Date.now(),
      };

      const result = await this.navigatorAgent.execute(navigatorMessage);

      this.emitCoordinationEvent('navigator_complete', { result });
      return result;
    } catch (error) {
      logger.error('Navigator agent execution failed:', error);
      this.emitCoordinationEvent('navigator_error', { error });
      throw error;
    }
  }

  /**
   * Execute Validator Agent
   */
  private async executeValidatorAgent(
    intent: EnhancedIntent,
    plan: ExecutionPlan,
    actionResults: ActionResult[]
  ) {
    try {
      this.emitCoordinationEvent('validator_start', { intent, plan });

      const validationContext = {
        originalInstruction: intent.parameters.instruction,
        executedSteps: plan.actions?.map((step) => step.description) || [],
        currentUrl: '', // URL not available in AgentContext
        executionResults: actionResults.map((result) => ({
          step: result.metadata?.description || 'Unknown step',
          success: result.success,
          result: result.data,
          timestamp: Date.now(),
        })),
        context: this.state.currentContext,
      };

      const result = await this.validatorAgent.validateTask(
        intent.parameters.instruction,
        validationContext
      );

      this.emitCoordinationEvent('validator_complete', { result });
      return { result };
    } catch (error) {
      logger.error('Validator agent execution failed:', error);
      this.emitCoordinationEvent('validator_error', { error });
      throw error;
    }
  }

  /**
   * Execute Element Selection Agent
   */
  private async executeElementSelectionAgentInternal(
    task: ElementSelectionTask
  ) {
    try {
      this.emitCoordinationEvent('element_selection_start', { task });
      const result = await this.elementSelectionAgent.executeTask(
        task,
        this.context,
        this.config.enableStreaming,
        this.handleStreamingChunk.bind(this)
      );
      this.emitCoordinationEvent('element_selection_complete', { result });
      return result;
    } catch (error) {
      logger.error('Element selection agent execution failed', error);
      this.emitCoordinationEvent('element_selection_error', { error });
      throw error;
    }
  }

  /**
   * Generate response from multi-agent execution
   */
  private async generateMultiAgentResponse(
    instruction: string,
    intent: EnhancedIntent,
    plan: ExecutionPlan,
    actionResults: ActionResult[],
    validationResult?: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      const success =
        actionResults.every((r) => r.success) &&
        validationResult?.result?.isValid;

      if (success) {
        return {
          success: true,
          message:
            `✅ Successfully completed ${intent.action} using multi-agent coordination.\n\n` +
            `**Plan:** ${plan.name}\n` +
            `**Actions:** ${actionResults.length} executed\n` +
            `**Validation:** ${
              validationResult?.confidence
                ? Math.round(validationResult.confidence * 100) + '% confidence'
                : 'Completed'
            }\n\n` +
            validationResult?.suggestions?.length
              ? `**Recommendations:** ${validationResult.suggestions.join(
                  ', '
                )}`
              : '',
        };
      } else {
        const failedActions = actionResults.filter((r) => !r.success).length;
        return {
          success: false,
          message:
            `⚠️ Multi-agent execution partially completed.\n\n` +
            `**Plan:** ${plan.name}\n` +
            `**Failed Actions:** ${failedActions}/${actionResults.length}\n` +
            `**Validation:** ${
              validationResult?.isValid ? 'Passed' : 'Failed'
            }\n\n` +
            validationResult?.suggestions?.length
              ? `**Recommendations:** ${validationResult.suggestions.join(
                  ', '
                )}`
              : '',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Multi-agent execution completed with errors: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  /**
   * Fallback to traditional processing method
   */
  private async processWithTraditionalMethod(
    instruction: string,
    taskAnalysis: TaskAnalysis
  ): Promise<AgentResponse> {
    logger.info('Using traditional processing method');

    // This would call the original processing logic
    // For now, return a simple response
    return {
      success: false,
      message:
        'Multi-agent coordination failed, falling back to traditional processing. Please try again.',
      sessionId: this.state.sessionId,
      timestamp: Date.now(),
    };
  }

  /**
   * Emit coordination event
   */
  private emitCoordinationEvent(type: string, data: any): void {
    const event: CoordinationEvent = {
      id: `event_${Date.now()}`,
      type: type as any,
      timestamp: Date.now(),
      source: 'Web3Agent',
      data,
      priority: 'medium',
    };

    this.state.coordinationEvents?.push(event);
    logger.info('Coordination event', event);
  }

  /**
   * Record coordination event
   */
  private recordCoordinationEvent(type: string, data: any): void {
    this.emitCoordinationEvent(type, data);
  }

  /**
   * Convert ActionResult[] to EnhancedAction[]
   */
  private convertActionResultsToEnhancedActions(
    results: ActionResult[]
  ): EnhancedAction[] {
    return results.map((result, index) => ({
      id: `action_${index}_${Date.now()}`,
      name: 'Unknown Action',
      description: 'Executed action',
      type: 'unknown',
      status: result.success ? 'completed' : 'failed',
      agentType: 'navigator',
      priority: 1,
      retries: 0,
      maxRetries: 3,
      timeout: 30000,
      params: result.data || {},
      dependencies: [],
      riskLevel: 'MEDIUM',
    }));
  }

  /**
   * Convert ActionResult[] to ActionStep[]
   */
  private convertActionResultsToActionSteps(
    results: ActionResult[]
  ): ActionStep[] {
    return results.map((result, index) => ({
      id: `action_${index}_${Date.now()}`,
      name: 'Unknown Action',
      description: 'Executed action',
      type: 'unknown',
      status: result.success ? 'completed' : 'failed',
      params: result.data || {},
      result: result.data,
      dependencies: [],
      riskLevel: 'MEDIUM',
    }));
  }

  private async shouldExecutePlan(
    plan: ActionPlan,
    simulation?: any
  ): Promise<boolean> {
    if (!plan.requiresConfirmation && (this.config as any).autoConfirmLowRisk) {
      return true;
    }

    if (
      plan.riskLevel === 'HIGH' &&
      (this.config as any).requireConfirmationHighRisk
    ) {
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

    return (this.config as any).autoConfirmLowRisk;
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
      if (attempt < (this.config as any).maxRetries) {
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
      // Web3 actions
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
      // Browser automation actions
      NAVIGATE: 'navigate to URL',
      CLICK: 'click element',
      FILL_FORM: 'fill form',

      SCROLL: 'scroll page',
      SCREENSHOT: 'take screenshot',
      WAIT: 'wait for condition',
      HOVER: 'hover over element',
      UPLOAD: 'upload file',
      EXECUTE_JS: 'execute JavaScript',
      SWITCH_TAB: 'switch tab',
      OPEN_TAB: 'open tab',
      CLOSE_TAB: 'close tab',
      // Multi-agent coordination actions
      CREATE_PLAN: 'create execution plan',
      VALIDATE_TASK: 'validate task completion',
      COORDINATE_AGENTS: 'coordinate agents',
      ANALYZE_TASK: 'analyze task complexity',
      OPTIMIZE_EXECUTION: 'optimize execution strategy',
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
    // Prefer raw provider error payloads; avoid fixed/templated replies
    const raw = error instanceof Error ? error.message : String(error);

    // If the error message contains JSON (e.g., OpenAI invalid_request_error), pretty-print it
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch (_) {
      // Not JSON; return plain message without extra prefixes/suffixes
      return raw || 'Unknown error';
    }
  }

  private async updateWeb3Context(): Promise<void> {
    // Fetch current chain, address, balances, and gas from real services
    const [addr, balances, gasPrices] = await Promise.all([
      this.getCurrentAddress(),
      this.getCurrentBalances(),
      this.getCurrentGasPrices(),
    ]);

    this.state.currentContext = {
      ...this.state.currentContext,
      currentAddress: addr,
      balances,
      gasPrices,
    };
  }

  /**
   * Ensure that any assistant tool_calls without matching tool messages are not left dangling
   * before we proceed to the next LLM turn. This avoids provider schema errors.
   */
  private sanitizeDanglingToolCalls(): void {
    try {
      const msgs = this.state.conversationHistory as any[];
      if (!Array.isArray(msgs) || msgs.length === 0) return;

      // 1) For every assistant entry with tool_calls, keep only ids that have a matching
      //    tool message AFTER that assistant entry. If none remain, drop that assistant entry.
      const toRemove = new Set<number>();
      const toReplace = new Map<number, BaseMessage>();

      for (let idx = 0; idx < msgs.length; idx++) {
        const m: any = msgs[idx];
        const toolCalls = m?.additional_kwargs?.tool_calls;
        if (!Array.isArray(toolCalls) || toolCalls.length === 0) continue;

        // Deduplicate tool_calls by id while preserving order
        const seenIds = new Set<string>();
        const dedupedCalls = toolCalls.filter((tc: any) => {
          const id = tc?.id;
          if (typeof id !== 'string' || seenIds.has(id)) return false;
          seenIds.add(id);
          return true;
        });

        // Collect tool_call_ids that already have a matching tool message after this assistant entry
        const respondedIds = new Set<string>();
        for (let i = idx + 1; i < msgs.length; i++) {
          const mm: any = msgs[i];
          const tcId = mm?.additional_kwargs?.tool_call_id;
          if (mm?.type === 'tool' && typeof tcId === 'string') respondedIds.add(tcId);
        }

        const matchedCalls = dedupedCalls.filter((tc: any) => respondedIds.has(tc?.id));

        if (matchedCalls.length === 0) {
          toRemove.add(idx);
        } else if (matchedCalls.length < dedupedCalls.length) {
          // Create a shallow clone AIMessage with filtered tool_calls
          const cloned = new AIMessage(m.content || '', {
            ...(m.additional_kwargs || {}),
            tool_calls: matchedCalls,
          });
          toReplace.set(idx, cloned);
        } else if (dedupedCalls.length < toolCalls.length) {
          // Only dedup needed
          const cloned = new AIMessage(m.content || '', {
            ...(m.additional_kwargs || {}),
            tool_calls: dedupedCalls,
          });
          toReplace.set(idx, cloned);
        }
      }

      // Apply removals/replacements for assistant entries
      if (toRemove.size > 0 || toReplace.size > 0) {
        const updated: BaseMessage[] = [] as any;
        for (let i = 0; i < msgs.length; i++) {
          if (toRemove.has(i)) continue;
          updated.push(toReplace.get(i) || msgs[i]);
        }
        this.state.conversationHistory = updated;
      }

      // 2) Remove any tool messages that do not have a preceding assistant tool_calls in the updated history
      const remaining = this.state.conversationHistory as any[];
      const assistantIdsUpToIndex: Map<number, Set<string>> = new Map();
      const collectedIds = new Set<string>();
      for (let i = 0; i < remaining.length; i++) {
        const mm: any = remaining[i];
        const tcs = mm?.additional_kwargs?.tool_calls;
        if (Array.isArray(tcs)) {
          for (const tc of tcs) {
            const id = tc?.id;
            if (typeof id === 'string') collectedIds.add(id);
          }
        }
        assistantIdsUpToIndex.set(i, new Set(collectedIds));
      }

      const toRemoveTool = new Set<number>();
      for (let i = 0; i < remaining.length; i++) {
        const mm: any = remaining[i];
        if (mm?.type === 'tool') {
          const id = mm?.additional_kwargs?.tool_call_id;
          const hasPreceding = typeof id === 'string' && assistantIdsUpToIndex.get(i - 1 || 0)?.has(id);
          if (!hasPreceding) {
            toRemoveTool.add(i);
          }
        }
      }

      if (toRemoveTool.size > 0) {
        const cleaned: BaseMessage[] = [] as any;
        for (let i = 0; i < remaining.length; i++) {
          if (toRemoveTool.has(i)) continue;
          cleaned.push(remaining[i]);
        }
        this.state.conversationHistory = cleaned;
      }

      // 3) Merge consecutive assistant entries that contain tool_calls into a single assistant message
      //    with deduplicated tool_call ids. This satisfies providers that forbid two assistant.tool_calls
      //    in a row without intervening tool messages.
      const merged: BaseMessage[] = [] as any;
      let i = 0;
      while (i < this.state.conversationHistory.length) {
        const cur: any = this.state.conversationHistory[i];
        if (Array.isArray(cur?.additional_kwargs?.tool_calls) && cur.additional_kwargs.tool_calls.length > 0) {
          // Start combined list with current tool calls (dedup by id)
          const combined: any[] = [];
          const seen = new Set<string>();
          const pushCalls = (calls: any[]) => {
            for (const tc of calls) {
              const id = tc?.id;
              if (typeof id !== 'string' || seen.has(id)) continue;
              seen.add(id);
              combined.push(tc);
            }
          };
          pushCalls(cur.additional_kwargs.tool_calls);

          let j = i + 1;
          while (
            j < this.state.conversationHistory.length &&
            Array.isArray((this.state.conversationHistory[j] as any)?.additional_kwargs?.tool_calls) &&
            (this.state.conversationHistory[j] as any).additional_kwargs.tool_calls.length > 0
          ) {
            const next: any = this.state.conversationHistory[j];
            pushCalls(next.additional_kwargs.tool_calls);
            j++;
          }

          // Rebuild a single AIMessage preserving the last assistant's additional kwargs except tool_calls
          const clone = new AIMessage(cur.content || '', {
            ...(cur.additional_kwargs || {}),
            tool_calls: combined,
          });
          merged.push(clone);
          i = j; // skip merged assistants
          continue;
        }
        merged.push(cur);
        i++;
      }
      this.state.conversationHistory = merged;
    } catch {}
  }
  /**
   * Build a pruned message list for prompts:
   * - Drop verbose user messages like "Tool execution results: ..."
   * - Remove consecutive duplicate human messages
   * - Keep only the last N messages to control context size
   */
  private buildPrunedMessages(maxMessages: number = 20) {
    const msgs = this.state.conversationHistory || [];
    const filtered: BaseMessage[] = [] as any;

    // 1) Drop noisy human echoes and consecutive duplicate human messages
    for (const m of msgs) {
      if ((m as any).type === 'human') {
        const content = String((m as any).content || '');
        if (/^Tool execution results:/i.test(content)) {
          continue; // tool results are already represented by tool messages
        }
        const last = filtered[filtered.length - 1] as any;
        if (last && last.type === 'human') {
          const lastContent = String(last.content || '');
          if (lastContent.trim() === content.trim()) {
            continue; // skip consecutive duplicate human messages
          }
        }
      }
      filtered.push(m);
    }

    // 2) Truncate to last N messages
    let pruned = filtered;
    if (pruned.length > maxMessages) {
      pruned = pruned.slice(pruned.length - maxMessages);
    }

    // 3) Ensure schema consistency for tool_calls/tool messages within the slice
    //    - For assistant tool_calls, keep only ids that have a matching tool message later in the slice
    //    - Drop assistant tool_calls message entirely if no ids remain after filtering
    //    - Drop any tool messages without a preceding assistant tool_calls in the slice
    const toRemove = new Set<number>();
    const toReplace = new Map<number, BaseMessage>();

    // Build maps for lookups
    const assistantToolCallsEntries: Array<{ index: number; ids: string[]; message: any }> = [];
    const toolMessagesById = new Map<string, number[]>();

    pruned.forEach((m: any, idx: number) => {
      const toolCalls = m?.additional_kwargs?.tool_calls;
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        const ids = toolCalls.map((tc: any) => tc?.id).filter((id: any) => typeof id === 'string');
        if (ids.length) assistantToolCallsEntries.push({ index: idx, ids, message: m });
      }
      const toolId = m?.additional_kwargs?.tool_call_id;
      if (typeof toolId === 'string') {
        const arr = toolMessagesById.get(toolId) || [];
        arr.push(idx);
        toolMessagesById.set(toolId, arr);
      }
    });

    // Filter assistant tool_calls to only those with matching tool results after it
    for (const entry of assistantToolCallsEntries) {
      const { index, ids, message } = entry;
      const matchedIds = ids.filter((id) => {
        const positions = toolMessagesById.get(id) || [];
        return positions.some((pos) => pos > index);
      });

      if (matchedIds.length === 0) {
        toRemove.add(index);
        continue;
      }

      if (matchedIds.length < ids.length) {
        // Create a shallow clone AIMessage with filtered tool_calls
        const origCalls = message?.additional_kwargs?.tool_calls || [];
        const filteredCalls = origCalls.filter((tc: any) => matchedIds.includes(tc?.id));
        const cloned = new AIMessage(message.content || '', {
          ...(message.additional_kwargs || {}),
          tool_calls: filteredCalls,
        });
        toReplace.set(index, cloned);
      }
    }

    // Build a set of assistant ids that remain (not removed), considering replacements
    const remainingAssistantIds = new Map<string, number>();
    pruned.forEach((m: any, idx: number) => {
      if (toRemove.has(idx)) return;
      const msg = toReplace.get(idx) || m;
      const toolCalls = msg?.additional_kwargs?.tool_calls;
      if (Array.isArray(toolCalls)) {
        for (const tc of toolCalls) {
          const id = tc?.id;
          if (typeof id === 'string') remainingAssistantIds.set(id, idx);
        }
      }
    });

    // Remove tool messages without a preceding assistant tool_calls in slice
    pruned.forEach((m: any, idx: number) => {
      const toolId = m?.additional_kwargs?.tool_call_id;
      if (typeof toolId === 'string') {
        const aIdx = remainingAssistantIds.get(toolId);
        if (aIdx === undefined || aIdx >= idx) {
          toRemove.add(idx);
        }
      }
    });

    // Apply removals and replacements
    let finalMessages: BaseMessage[] = [];
    pruned.forEach((m: any, idx: number) => {
      if (toRemove.has(idx)) return;
      const replacement = toReplace.get(idx);
      finalMessages.push(replacement || m);
    });

    return finalMessages;
  }
  // Enhanced function calling support
  async processUserInstructionWithFunctionCalling(
    instruction: string,
    enableStreaming: boolean = false,
    onChunk?: (chunk: StreamingLLMResponse) => void,
    onThinking?: (thinking: any) => void,
    onReActStatus?: (status: any) => void,
    onToolCalls?: (payload: {
      content?: string;
      functionCalls?: FunctionCall[];
    }) => void
  ): Promise<AgentResponse> {
    try {
      // Reset cancellation flag for new instruction
      this._cancelled = false;
      const startTime = Date.now();
      let finishReason: string | undefined;
      let processedSecondTurn = false;

      // Safety: remove any dangling tool_calls from previous turn to avoid provider schema errors
      try { this.sanitizeDanglingToolCalls(); } catch (e) {}

      // Add user message to conversation history (avoid consecutive duplicates)
      let userMessage = new HumanMessage(instruction);
      const lastMsg = this.state.conversationHistory[
        this.state.conversationHistory.length - 1
      ] as any;
      const lastType = lastMsg?._getType?.();
      const lastContent = lastMsg?.content;
      if (
        !(lastType === 'human' && String(lastContent) === String(instruction))
      ) {
        this.state.conversationHistory.push(userMessage);
      } else {
        // Reuse the last human message to keep IDs consistent
        userMessage = lastMsg;
      }

      // Initialize ReAct status
      if (onReActStatus) {
        if (this.reactConfig.showThinking) {
          onReActStatus({
            isActive: true,
            isThinking: true,
            isActing: false,
            currentStep: 1,
            maxSteps: this.reactConfig.maxSteps,
            thinkingContent: 'Analyzing your request...',
            timestamp: Date.now(),
          });
        }
      }

      // Store initial thinking message
      if (this.reactConfig.showThinking) {
        await this.storeReActStatusMessage('Analyzing your request...');
      }

      // Step 1: Extract intent from user instruction
      const intent = await this.intentRecognizer.extractIntent(
        instruction,
        this.state.currentContext
      );
      logger.info(
        `Extracted intent: ${intent.action} with confidence ${intent.confidence}`
      );

      // Update ReAct status after intent extraction
      if (onReActStatus) {
        if (this.reactConfig.showThinking) {
          onReActStatus({
            isActive: true,
            isThinking: true,
            isActing: false,
            currentStep: 2,
            maxSteps: this.reactConfig.maxSteps,
            thinkingContent: `Intent recognized: ${intent.action}`,
            timestamp: Date.now(),
          });
        }
      }

      // Store intent recognition message
      await this.storeReActStatusMessage(`Intent recognized: ${intent.action}`);

      // Step 2: Optional ReAct planning phase (create plan first)
      let reactPlan: ActionPlan | undefined;
      try {
        if (intent.action !== 'QUERY') {
          // Send thinking message about planning
          if (onThinking && this.reactConfig.showThinking) {
            onThinking({
              type: 'thinking',
              content: 'Analyzing your request and creating a plan...',
              timestamp: Date.now(),
            });
          }

          // Update ReAct status for planning
          if (onReActStatus) {
            onReActStatus({
              isActive: true,
              isThinking: true,
              isActing: false,
              currentStep: 3,
              maxSteps: Math.max(1, this.reactConfig?.maxSteps ?? 10),
              thinkingContent: 'Creating action plan...',
              timestamp: Date.now(),
            });
          }

          reactPlan = await this.actionPlanner.createPlan(intent);

          // Send thinking message about the plan
          if (onThinking && reactPlan) {
            onThinking({
              type: 'planning',
              content: `I've created a plan with ${
                reactPlan.actions.length
              } steps:\n${this.formatPlanSummary(reactPlan)}`,
              timestamp: Date.now(),
            });
          }

          const planMsg = new SystemMessage(
            `Planned steps (ReAct):\n${this.formatPlanSummary(
              reactPlan
            )}\n\nFollow this plan step-by-step using available tools. Ask for any missing parameters before executing risky operations.`
          );
          this.state.conversationHistory.push(planMsg);
        }
      } catch (e) {
        // Planning optional; continue without blocking
      }

      // Step 3: Get available tools for function calling
      const availableTools = this.llm.getAvailableTools();

      // Build prompt with proper system/user messages
      const promptContext: PromptContext = {
        messages: this.buildPrunedMessages(),
        context: {
          ...this.state.currentContext,
          reactConfig: this.reactConfig,
          externalToolExecution: true,
        },
        intent,
        tools: availableTools,
        conversationHistory: this.state.conversationHistory,
        availableActions: this.actionRegistry.getAvailableActions(),
      };
      const generatedPrompt = await this.promptManager.createPrompt(
        promptContext
      );

      // Step 4: Generate LLM response with function calling (ReAct loop)
      let llmResponse: LLMResponse;
      const accumulatedActions: ActionStep[] = [];

      // Send thinking message about starting function calling
      if (onThinking) {
        onThinking({
          type: 'reasoning',
          content:
            "Now I'll use the available tools to help with your request...",
          timestamp: Date.now(),
        });
      }

      // Update ReAct status for function calling
      if (onReActStatus) {
        onReActStatus({
          isActive: true,
          isThinking: true,
          isActing: false,
          currentStep: 4,
          maxSteps: Math.max(1, this.reactConfig?.maxSteps ?? 10),
          thinkingContent: 'Preparing to execute tools...',
          timestamp: Date.now(),
        });
      }

      // Store tool preparation message
      await this.storeReActStatusMessage('Preparing to execute tools...');

      // First turn: ask for tool calls
      // Ensure provider receives tool schemas
      (this.llm as any).attachToolsForProvider?.(availableTools);

      logger.info('🔍 Web3Agent first turn LLM call decision', {
        enableStreaming,
        hasOnChunk: !!onChunk,
        hasGenerateStreamingResponse: !!this.llm.generateStreamingResponse,
        llmType: this.llm.constructor.name,
        llmMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(this.llm)),
      });

      if (enableStreaming && onChunk) {
        logger.info(
          '🚀 Web3Agent: FORCING streaming response generation for first turn'
        );

        // FORCE streaming by directly calling the method, even if it doesn't exist
        if (this.llm.generateStreamingResponse) {
          logger.info('✅ Using existing generateStreamingResponse method');
          try {
            llmResponse = await this.llm.generateStreamingResponse(
              generatedPrompt.messages,
              generatedPrompt.context,
              generatedPrompt.intent,
              generatedPrompt.tools,
              onChunk
            );
            logger.info('✅ First turn streaming completed successfully', {
              hasResponse: !!llmResponse.response,
              responseLength: llmResponse.response?.length || 0,
              hasFunctionCalls:
                !!llmResponse.functionCalls &&
                llmResponse.functionCalls.length > 0,
              functionCallsCount: llmResponse.functionCalls?.length || 0,
            });
          } catch (streamingError) {
            logger.error('❌ First turn streaming failed', streamingError);
            throw streamingError;
          }
        } else {
          logger.error(
            '❌ generateStreamingResponse method not found, this should not happen!'
          );
          logger.info(
            '🔧 Available methods:',
            Object.getOwnPropertyNames(Object.getPrototypeOf(this.llm))
          );

          // Fallback to regular response but simulate streaming
          llmResponse = await this.llm.generateResponse(
            generatedPrompt.messages,
            generatedPrompt.context,
            generatedPrompt.intent,
            generatedPrompt.tools
          );

          // Simulate streaming by sending the response as chunks
          if (llmResponse.response) {
            onChunk({
              id: `simulated_${Date.now()}`,
              type: 'content',
              content: llmResponse.response,
              timestamp: Date.now(),
            });
          }
        }
      } else {
        logger.warn(
          '⚠️ Web3Agent: Using regular response generation for first turn',
          {
            enableStreaming,
            hasOnChunk: !!onChunk,
            hasGenerateStreamingResponse: !!this.llm.generateStreamingResponse,
          }
        );
        // Use regular response generation for first turn
        llmResponse = await this.llm.generateResponse(
          generatedPrompt.messages,
          generatedPrompt.context,
          generatedPrompt.intent,
          generatedPrompt.tools
        );

        // Send first turn response content via streaming if available (for non-streaming fallback)
        if (enableStreaming && onChunk && llmResponse.response) {
          onChunk({
            id: `first-turn-response-${Date.now()}`,
            type: 'content',
            content: llmResponse.response,
            timestamp: Date.now(),
          });
        }
      }

      // Emit non-streaming tool/function calls to UI if present (support both OpenAI tool_calls and internal functionCalls)
      if (onToolCalls) {
        const openAIToolCalls = (llmResponse as any)?.tool_calls || [];
        const internalCalls = (llmResponse as any)?.functionCalls || [];
        const hasCalls =
          (openAIToolCalls && openAIToolCalls.length > 0) ||
          (internalCalls && internalCalls.length > 0);
        if (hasCalls) {
          const nowTs = Date.now();
          const normalized = (openAIToolCalls.length > 0
            ? openAIToolCalls.map((tc: any, idx: number) => ({
                id:
                  tc.id || `call_${tc.function?.name || 'fn'}_${nowTs}_${idx}`,
                name: tc.function?.name,
                arguments: (() => {
                  try {
                    return tc.function?.arguments
                      ? JSON.parse(tc.function.arguments)
                      : {};
                  } catch {
                    return { raw: tc.function?.arguments };
                  }
                })(),
                status: 'executing',
                timestamp: nowTs,
              }))
            : internalCalls.map((fc: any, idx: number) => ({
                id: fc.id || `call_${fc.name || 'fn'}_${nowTs}_${idx}`,
                name: fc.name,
                arguments: fc.arguments || {},
                status: 'executing',
                timestamp: nowTs,
              }))) as any[];

          onToolCalls({
            content:
              (llmResponse as any).response ||
              (llmResponse as any).content ||
              '',
            functionCalls: normalized as any,
          });
        }
      }

      // 🚨🚨🚨 CRITICAL DEBUGGING: Check LLM response before extraction
      console.log('🚨🚨🚨 LLM RESPONSE BEFORE EXTRACTION:', {
        responseKeys: Object.keys(llmResponse),
        hasFunctionCalls: !!(
          llmResponse.functionCalls && llmResponse.functionCalls.length > 0
        ),
        hasToolCalls: !!(llmResponse as any).tool_calls,
        toolCalls: (llmResponse as any).tool_calls,
        functionCalls: llmResponse.functionCalls,
        rawResponse: JSON.stringify(llmResponse, null, 2).substring(0, 2000),
      });

      // Extract function calls from LLM response (handles both OpenAI tool_calls and internal functionCalls formats)
      const extractedFunctionCalls = this.extractFunctionCallsFromResponse(
        llmResponse
      );

      // If model requested tool calls, execute then send tool results back for a second turn
      if (extractedFunctionCalls && extractedFunctionCalls.length > 0) {
        // Send thinking message about executing tools
        if (onThinking) {
          const toolNames = extractedFunctionCalls
            .map((fc) => fc.name)
            .join(', ');
          onThinking({
            type: 'function_call',
            content: `I need to execute these tools: ${toolNames}`,
            timestamp: Date.now(),
          });
        }

        // Update ReAct status for tool execution
        if (onReActStatus) {
          const toolNames = extractedFunctionCalls
            .map((fc) => fc.name)
            .join(', ');
          onReActStatus({
            isActive: true,
            isThinking: false,
            isActing: true,
            currentStep: Math.min(
              5,
              Math.max(1, this.reactConfig?.maxSteps ?? 10)
            ),
            maxSteps: Math.max(1, this.reactConfig?.maxSteps ?? 10),
            thinkingContent: `Executing tools: ${toolNames}`,
            currentAction: `Running ${toolNames}`,
            timestamp: Date.now(),
          });
        }

        // Store tool execution message
        const toolNames = extractedFunctionCalls
          .map((fc) => fc.name)
          .join(', ');
        await this.storeReActStatusMessage(
          `Executing tools: ${toolNames}`,
          `Running ${toolNames}`,
          false,
          true
        );

        // Record the assistant tool_calls message to keep role structure consistent
        const assistantToolCallMsg = new AIMessage('', {
          tool_calls: extractedFunctionCalls.map((fc) => ({
            id: fc.id || `call_${fc.name}_${Date.now()}`,
            type: 'function',
            function: {
              name: fc.name,
              arguments: JSON.stringify(fc.arguments || {}),
            },
          })),
        });
        this.state.conversationHistory.push(assistantToolCallMsg);

        const firstTurnActions = await this.executeFunctionCalls(
          extractedFunctionCalls
        );
        accumulatedActions.push(...firstTurnActions);

        console.log('🔧 First turn actions executed', {
          actionsCount: firstTurnActions.length,
          actions: firstTurnActions.map((action) => ({
            type: action.type,
            status: action.status,
            hasResult: !!action.result,
          })),
        });

        // Append tool results as ToolMessages
        for (let i = 0; i < firstTurnActions.length; i++) {
          const step = firstTurnActions[i];
          const fc = extractedFunctionCalls[i];
          const toolContent = JSON.stringify({
            success: step.status === 'completed',
            result: step.result,
            params: step.params,
          });
          const toolMsg = new ToolMessage({
            content: toolContent,
            name: step.type || 'tool',
            tool_call_id: fc?.id || `${step.type || 'tool'}_${i}`,
          });
          this.state.conversationHistory.push(toolMsg);

          console.log('📝 Added tool result to conversation history', {
            toolName: step.type,
            toolCallId: fc?.id,
            success: step.status === 'completed',
            hasResult: !!step.result,
            toolContent: toolContent.substring(0, 200),
            conversationLength: this.state.conversationHistory.length,
          });
        }

        // Notify UI: mark function_call cards as completed/failed with results (first turn)
        if (onToolCalls) {
          try {
            const updates = extractedFunctionCalls.map((fc, i) => ({
              id: fc.id || `call_${fc.name || 'fn'}_${Date.now()}_${i}`,
              name: fc.name,
              arguments: fc.arguments || {},
              status: firstTurnActions[i]?.status || 'completed',
              result: firstTurnActions[i]?.result,
              timestamp: Date.now(),
            }));
            onToolCalls({ content: '', functionCalls: updates as any });
          } catch {}
        }
        // Decide whether to stop ReAct after first turn tool execution
        const stopAfterFirst = this.shouldStopAfterActions(intent, firstTurnActions);
        if (stopAfterFirst) {
          finishReason = 'stop';
        }

        // Second turn: let the model incorporate results into a final answer (only if not finished)
        if (!stopAfterFirst) {
          console.log('🔄 Preparing second turn prompt', {
            conversationHistoryLength: this.state.conversationHistory.length,
            lastMessages: this.state.conversationHistory.slice(-3).map((msg) => ({
              type: msg.constructor.name,
              content: msg.content.substring(0, 100),
            })),
          });

          const secondPrompt = await this.promptManager.createPrompt({
            messages: this.buildPrunedMessages(),
            context: {
              ...this.state.currentContext,
              reactConfig: this.reactConfig,
              externalToolExecution: true,
            },
            intent,
            tools: availableTools,
            conversationHistory: this.state.conversationHistory,
            availableActions: this.actionRegistry.getAvailableActions(),
          });
          (this.llm as any).attachToolsForProvider?.(availableTools);

          // Generate second turn response with streaming support
          logger.info('🔍 Web3Agent second turn LLM call decision', {
            enableStreaming,
            hasOnChunk: !!onChunk,
            hasGenerateStreamingResponse: !!this.llm.generateStreamingResponse,
          });

          if (enableStreaming && onChunk) {
            logger.info(
              '🚀 Web3Agent: FORCING streaming response generation for second turn'
            );

            // FORCE streaming by directly calling the method, even if it doesn't exist
            if (this.llm.generateStreamingResponse) {
              logger.info(
                '✅ Using existing generateStreamingResponse method for second turn'
              );
              try {
                llmResponse = await this.llm.generateStreamingResponse(
                  secondPrompt.messages,
                  secondPrompt.context,
                  secondPrompt.intent,
                  secondPrompt.tools,
                  onChunk
                );
                logger.info('✅ Second turn streaming completed successfully', {
                  hasResponse: !!llmResponse.response,
                  responseLength: llmResponse.response?.length || 0,
                  hasFunctionCalls:
                    !!llmResponse.functionCalls &&
                    llmResponse.functionCalls.length > 0,
                  functionCallsCount: llmResponse.functionCalls?.length || 0,
                });
              } catch (streamingError) {
                logger.error('❌ Second turn streaming failed', streamingError);
                throw streamingError;
              }
            } else {
              logger.error(
                '❌ generateStreamingResponse method not found for second turn!'
              );

              // Fallback to regular response but simulate streaming
              llmResponse = await this.llm.generateResponse(
                secondPrompt.messages,
                secondPrompt.context,
                secondPrompt.intent,
                secondPrompt.tools
              );

              // Simulate streaming by sending the response as chunks
              if (llmResponse.response) {
                onChunk({
                  id: `simulated_second_${Date.now()}`,
                  type: 'content',
                  content: llmResponse.response,
                  timestamp: Date.now(),
                });
              }
            }
          } else {
            logger.warn(
              '⚠️ Web3Agent: Using regular response generation for second turn',
              {
                enableStreaming,
                hasOnChunk: !!onChunk,
                hasGenerateStreamingResponse: !!this.llm
                  .generateStreamingResponse,
              }
            );
            // Use regular response generation for second turn
            llmResponse = await this.llm.generateResponse(
              secondPrompt.messages,
              secondPrompt.context,
              secondPrompt.intent,
              secondPrompt.tools
            );

            // Send the second turn response content via streaming (for non-streaming fallback)
            if (enableStreaming && onChunk && llmResponse.response) {
              onChunk({
                id: `second-turn-response-${Date.now()}`,
                type: 'content',
                content: llmResponse.response,
                timestamp: Date.now(),
              });
            }
          }
          // Emit non-streaming tool_calls for second-turn as well
          if (onToolCalls) {
            const openAIToolCalls2 = (llmResponse as any)?.tool_calls || [];
            const internalCalls2 = (llmResponse as any)?.functionCalls || [];
            const hasCalls2 =
              (openAIToolCalls2 && openAIToolCalls2.length > 0) ||
              (internalCalls2 && internalCalls2.length > 0);
            if (hasCalls2) {
              const nowTs2 = Date.now();
              const normalized2 = (openAIToolCalls2.length > 0
                ? openAIToolCalls2.map((tc: any, idx: number) => ({
                    id:
                      tc.id ||
                      `call_${tc.function?.name || 'fn'}_${nowTs2}_${idx}`,
                    name: tc.function?.name,
                    arguments: (() => {
                      try {
                        return tc.function?.arguments
                          ? JSON.parse(tc.function.arguments)
                          : {};
                      } catch {
                        return { raw: tc.function?.arguments };
                      }
                    })(),
                    status: 'executing',
                    timestamp: nowTs2,
                  }))
                : internalCalls2.map((fc: any, idx: number) => ({
                    id: fc.id || `call_${fc.name || 'fn'}_${nowTs2}_${idx}`,
                    name: fc.name,
                    arguments: fc.arguments || {},
                    status: 'executing',
                    timestamp: nowTs2,
                  }))) as any[];

              onToolCalls({
                content:
                  (llmResponse as any).response ||
                  (llmResponse as any).content ||
                  '',
                functionCalls: normalized2 as any,
              });
            }
          }

          // Step 5: Execute function calls if any (second turn)
          const secondTurnFunctionCalls = this.extractFunctionCallsFromResponse(
            llmResponse
          );
          if (secondTurnFunctionCalls && secondTurnFunctionCalls.length > 0) {
            processedSecondTurn = true;
            // Insert an assistant message with tool_calls to satisfy OpenAI schema
            try {
              const assistantToolCallMsg2 = new AIMessage('', {
                tool_calls: secondTurnFunctionCalls.map((fc) => ({
                  id: fc.id || `call_${fc.name}_${Date.now()}`,
                  type: 'function',
                  function: {
                    name: fc.name,
                    arguments: JSON.stringify(fc.arguments || {}),
                  },
                })),
              });
              this.state.conversationHistory.push(assistantToolCallMsg2);
            } catch (e) {
              logger.warn(
                'Failed to append assistant tool_calls message for second turn',
                { error: e instanceof Error ? e.message : String(e) }
              );
            }

            const secondTurnActions = await this.executeFunctionCalls(
              secondTurnFunctionCalls
            );
            accumulatedActions.push(...secondTurnActions);

            // Append tool results as ToolMessages (second turn) so the LLM can use them in ReAct
            try {
              for (let i = 0; i < secondTurnActions.length; i++) {
                const step = secondTurnActions[i];

                // Notify UI: mark function_call cards as completed/failed with results (second turn)
                if (onToolCalls) {
                  try {
                    const updates2 = secondTurnFunctionCalls.map((fc2, i) => ({
                      id: fc2.id || `call_${fc2.name || 'fn'}_${Date.now()}_${i}`,
                      name: fc2.name,
                      arguments: fc2.arguments || {},
                      status: secondTurnActions[i]?.status || 'completed',
                      result: secondTurnActions[i]?.result,
                      timestamp: Date.now(),
                    }));
                    onToolCalls({ content: '', functionCalls: updates2 as any });
                  } catch {}
                }

                const fc2 = secondTurnFunctionCalls[i];
                const toolMsg2 = new ToolMessage({
                  content: JSON.stringify({
                    success: step.status === 'completed',
                    result: step.result,
                    params: step.params,
                  }),
                  name: step.type || 'tool',
                  tool_call_id: fc2?.id || `${step.type || 'tool'}_${i}`,
                });
                this.state.conversationHistory.push(toolMsg2);
              }
            } catch (e) {
              logger.warn('Failed to append second turn tool results', {
                error: e instanceof Error ? e.message : String(e),
              });
            }

            // Decide whether to stop after second turn tool execution
            if (this.shouldStopAfterActions(intent, secondTurnActions)) {
              finishReason = 'stop';
            }
          }
        }
      }

      // Step 5 (fallback duplicate guard): Execute function calls if any (second turn) only if not already processed
      if (!processedSecondTurn) {
        const secondTurnFunctionCalls = this.extractFunctionCallsFromResponse(
          llmResponse
        );
        if (secondTurnFunctionCalls && secondTurnFunctionCalls.length > 0) {
          processedSecondTurn = true;
          // Insert an assistant message with tool_calls to satisfy OpenAI schema
          try {
            const assistantToolCallMsg2 = new AIMessage('', {
              tool_calls: secondTurnFunctionCalls.map((fc) => ({
                id: fc.id || `call_${fc.name}_${Date.now()}`,
                type: 'function',
                function: {
                  name: fc.name,
                  arguments: JSON.stringify(fc.arguments || {}),
                },
              })),
            });
            this.state.conversationHistory.push(assistantToolCallMsg2);
          } catch (e) {
            logger.warn(
              'Failed to append assistant tool_calls message for second turn',
              { error: e instanceof Error ? e.message : String(e) }
            );
          }

          const secondTurnActions = await this.executeFunctionCalls(
            secondTurnFunctionCalls
          );
          accumulatedActions.push(...secondTurnActions);

          // Append tool results as ToolMessages (second turn) so the LLM can use them in ReAct
          try {
            for (let i = 0; i < secondTurnActions.length; i++) {
              const step = secondTurnActions[i];

              // Notify UI: mark function_call cards as completed/failed with results (second turn)
              if (onToolCalls) {
                try {
                  const updates2 = secondTurnFunctionCalls.map((fc2, i) => ({
                    id: fc2.id || `call_${fc2.name || 'fn'}_${Date.now()}_${i}`,
                    name: fc2.name,
                    arguments: fc2.arguments || {},
                    status: secondTurnActions[i]?.status || 'completed',
                    result: secondTurnActions[i]?.result,
                    timestamp: Date.now(),
                  }));
                  onToolCalls({ content: '', functionCalls: updates2 as any });
                } catch {}
              }

              const fc2 = secondTurnFunctionCalls[i];
              const toolMsg2 = new ToolMessage({
                content: JSON.stringify({
                  success: step.status === 'completed',
                  result: step.result,
                  params: step.params,
                }),
                name: step.type || 'tool',
                tool_call_id: fc2?.id || `${step.type || 'tool'}_${i}`,
              });
              this.state.conversationHistory.push(toolMsg2);
            }
          } catch (e) {
            logger.warn('Failed to append second turn tool results', {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }

      // Step 6: Generate final response

      // Multi-turn ReAct loop: continue until no more tool_calls or safety cap reached
      try {
        let iterations = 0;
        const maxIterations = Math.max(1, this.reactConfig?.maxSteps ?? 10); // safety cap to prevent infinite loops
        while (
          iterations < maxIterations &&
          (this.reactConfig?.enabled ?? true)
        ) {
          const nextPrompt = await this.promptManager.createPrompt({
            messages: this.buildPrunedMessages(),
            context: {
              ...this.state.currentContext,
              reactConfig: this.reactConfig,
              externalToolExecution: true,
            },
            intent,
            tools: availableTools,
            conversationHistory: this.state.conversationHistory,
            availableActions: this.actionRegistry.getAvailableActions(),
          });
          (this.llm as any).attachToolsForProvider?.(availableTools);

          let nextResponse: LLMResponse;
          if (
            enableStreaming &&
            onChunk &&
            this.llm.generateStreamingResponse
          ) {
            nextResponse = await this.llm.generateStreamingResponse(
              nextPrompt.messages,
              nextPrompt.context,
              nextPrompt.intent,
              nextPrompt.tools,
              onChunk
            );
          } else {
            nextResponse = await this.llm.generateResponse(
              nextPrompt.messages,
              nextPrompt.context,
              nextPrompt.intent,
              nextPrompt.tools
            );
            if (enableStreaming && onChunk && nextResponse.response) {
              onChunk({
                id: `react-turn-response-${iterations}-${Date.now()}`,
                type: 'content',
                content: nextResponse.response,
                timestamp: Date.now(),
              });
            }
          }

          // Update latest response
          llmResponse = nextResponse;

          // Extract potential new function calls
          const moreFunctionCalls = this.extractFunctionCallsFromResponse(
            nextResponse
          );
          if (!moreFunctionCalls || moreFunctionCalls.length === 0) {
            break; // no more tool calls, finish
          }

          // Emit function_call events to UI for this loop turn (executing status)
          if (onToolCalls) {
            try {
              const nowTsLoop = Date.now();
              const normalizedLoop = moreFunctionCalls.map((fc, idx) => ({
                id: fc.id || `call_${fc.name || 'fn'}_${nowTsLoop}_${idx}`,
                name: fc.name,
                arguments: fc.arguments || {},
                status: 'executing',
                timestamp: nowTsLoop,
              }));
              onToolCalls({
                content: (llmResponse as any)?.response || (llmResponse as any)?.content || '',
                functionCalls: normalizedLoop as any,
              });
            } catch {}
          }

          // Insert an assistant message with tool_calls for this turn
          try {
            const assistantToolCallsMsg = new AIMessage('', {
              tool_calls: moreFunctionCalls.map((fc) => ({
                id: fc.id || `call_${fc.name}_${Date.now()}`,
                type: 'function',
                function: {
                  name: fc.name,
                  arguments: JSON.stringify(fc.arguments || {}),
                },
              })),
            });
            this.state.conversationHistory.push(assistantToolCallsMsg);
          } catch (e) {
            logger.warn(
              'Failed to append assistant tool_calls message for ReAct loop',
              { error: e instanceof Error ? e.message : String(e) }
            );
          }

          // Execute and append tool results
          const loopTurnActions = await this.executeFunctionCalls(
            moreFunctionCalls
          );
          accumulatedActions.push(...loopTurnActions);

          // Stop early if post-action completion criteria met (e.g., contract/click done)
          if (this.shouldStopAfterActions(intent, loopTurnActions)) {
            finishReason = 'stop';
            break;
          }

          try {
            for (let i = 0; i < loopTurnActions.length; i++) {
              const step = loopTurnActions[i];
              const fc = moreFunctionCalls[i];
              const toolMsg = new ToolMessage({
                content: JSON.stringify({
                  success: step.status === 'completed',
                  result: step.result,
                  params: step.params,
                }),
                name: step.type || 'tool',
                tool_call_id: fc?.id || `${step.type || 'tool'}_${i}`,
              });
              this.state.conversationHistory.push(toolMsg);
            }
          } catch (e) {
            logger.warn('Failed to append loop turn tool results', {
              error: e instanceof Error ? e.message : String(e),
            });
          }

          // Notify UI with completed/failed status and results for this loop turn so cards 3+ render
          if (onToolCalls) {
            try {
              const updatesLoop = moreFunctionCalls.map((fc, i) => ({
                id: fc.id || `call_${fc.name || 'fn'}_${Date.now()}_${i}`,
                name: fc.name,
                arguments: fc.arguments || {},
                status: loopTurnActions[i]?.status || 'completed',
                result: loopTurnActions[i]?.result,
                timestamp: Date.now(),
              }));
              onToolCalls({ content: '', functionCalls: updatesLoop as any });
            } catch {}
          }

          iterations++;
        }
      } catch (e) {
        logger.warn(
          'ReAct loop generation failed; continuing to final response',
          { error: e instanceof Error ? e.message : String(e) }
        );
      }

      const response = await this.generateFinalResponse(
        instruction,
        intent,
        llmResponse,
        reactPlan, // Provide plan from ReAct phase (if any)
        undefined, // No simulation for function calling
        accumulatedActions
      );

      // Add assistant response to conversation history
      const assistantMessage = new AIMessage(response);
      this.state.conversationHistory.push(assistantMessage);

      // Store in chat history
      await this.storeConversationStep(
        userMessage,
        assistantMessage,
        accumulatedActions
      );

      // Update state
      this.state.lastActivity = Date.now();
      this.state.executionHistory.push(...accumulatedActions);

      return {
        success: true,
        message: response,
        actions: accumulatedActions,
        plan: reactPlan,
        sessionId: this.state.sessionId,
        timestamp: Date.now(),
        metadata: finishReason ? { finish_reason: finishReason } : undefined,
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

  /**
   * Determine whether the agent should stop ReAct after executing the given actions.
   * Heuristics:
   * - For browser intents (CLICK/NAVIGATE/FILL_FORM): stop when corresponding action succeeds
   * - For common Web3 intents: stop when a tx/sign/network/connect related tool reports success
   */
  private shouldStopAfterActions(intent: Web3Intent, actions: ActionStep[]): boolean {
    if (!actions || actions.length === 0) return false;

    const successOf = (names: string[]) =>
      actions.some((a) => a.status === 'completed' && !!a.type && names.includes(a.type));

    // Browser tasks
    if (intent.action === 'CLICK') {
      return successOf(['clickElement']);
    }
    if (intent.action === 'NAVIGATE') {
      return successOf(['navigateToUrl']);
    }
    if (intent.action === 'FILL_FORM') {
      return successOf(['fillForm']);
    }

    // Web3 tasks: consider done when the primary action succeeds
    const web3DoneNames = [
      'sendTransaction',
      'approveToken',
      'swapTokens',
      'stakeTokens',
      'unstakeTokens',
      'bridgeTokens',
      'addLiquidity',
      'removeLiquidity',
      'interactWithContract',
      'signMessage',
      'signTypedData',
      'switchNetwork',
      'connectWallet',
    ];
    if (successOf(web3DoneNames)) return true;

    return false;
  }

  /**
   * Ingest externally executed tool results and append as ToolMessages so that
   * OpenAI tool_call schema is satisfied before the next assistant turn.
   * Ensures a preceding assistant tool_calls message exists for the provided ids.
   */
  public async ingestExternalToolResults(
    results: Array<{
      toolCallId: string;
      toolName: string;
      result: any;
      success: boolean;
    }>
  ): Promise<void> {
    try {
      if (!Array.isArray(results) || results.length === 0) return;

      // Do NOT fabricate assistant tool_calls. Only append ToolMessages that match
      // existing assistant.tool_calls ids in the current conversation history.
      const msgs = this.state.conversationHistory as any[];
      const declaredIds = new Set<string>();
      for (const m of msgs) {
        const tcs = m?.additional_kwargs?.tool_calls;
        if (Array.isArray(tcs)) {
          for (const tc of tcs) {
            const id = tc?.id;
            if (typeof id === 'string') declaredIds.add(id);
          }
        }
      }

      for (const r of results) {
        const id = r?.toolCallId;
        if (!id || !declaredIds.has(id)) {
          // Skip results that don't correspond to any assistant tool_call
          continue;
        }
        // Avoid duplicating an existing tool message for the same id
        const exists = msgs.some(
          (m: any) => m?.type === 'tool' && ((m?.additional_kwargs?.tool_call_id ?? m?.tool_call_id) === id)
        );
        if (exists) continue;

        const toolMsg = new ToolMessage({
          content: JSON.stringify({ success: !!r.success, result: r.result }),
          name: r.toolName || 'tool',
          tool_call_id: id,
        });
        this.state.conversationHistory.push(toolMsg);
      }
    } catch (e) {
      logger.warn('ingestExternalToolResults failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // =========================
  // Tool Execution & Utilities
  // =========================

  private async executeFunctionCalls(
    functionCalls: FunctionCall[]
  ): Promise<ActionStep[]> {
    if (functionCalls.length === 0) {
      logger.warn(
        'executeFunctionCalls called with empty function calls array'
      );
      return [];
    }

    // Convert OpenAI tool_calls format to internal FunctionCall format if needed
    const normalizedFunctionCalls = this.normalizeFunctionCalls(functionCalls);

    logger.info('executeFunctionCalls starting', {
      count: normalizedFunctionCalls.length,
      functionNames: normalizedFunctionCalls.map((fc) => fc.name),
      originalFormat:
        functionCalls.length > 0 && 'function' in functionCalls[0]
          ? 'OpenAI tool_calls'
          : 'Internal FunctionCall',
    });

    // Check if we can execute in parallel
    const parallelCheck = canExecuteInParallel(normalizedFunctionCalls);

    if (parallelCheck.canParallel && normalizedFunctionCalls.length > 1) {
      logger.info('Executing function calls in parallel', {
        count: normalizedFunctionCalls.length,
        reason: parallelCheck.reason,
      });

      return await this.executeFunctionCallsParallel(normalizedFunctionCalls);
    } else {
      logger.info('Executing function calls sequentially', {
        count: normalizedFunctionCalls.length,
        reason: parallelCheck.reason || 'Single function call',
      });

      return await this.executeFunctionCallsSequential(normalizedFunctionCalls);
    }
  }

  private async executeFunctionCallsSequential(
    functionCalls: FunctionCall[]
  ): Promise<ActionStep[]> {
    const executedActions: ActionStep[] = [];
    const executionId = `sequential_${Date.now()}`;

    logger.info(
      `[${executionId}] Starting sequential function call execution`,
      {
        totalCalls: functionCalls.length,
        functionNames: functionCalls.map((fc) => fc.name),
        executionId,
      }
    );

    for (let i = 0; i < functionCalls.length; i++) {
      if (this._cancelled) {
        logger.info(
          `[${executionId}] Cancellation detected before executing step ${i}; aborting remaining function calls`
        );
        break;
      }
      const functionCall = functionCalls[i];
      const stepStartTime = Date.now();
      const stepExecutionId = `${executionId}_step_${i}`;

      try {
        logger.info(
          `[${stepExecutionId}] Executing function call: ${functionCall.name}`,
          {
            arguments: functionCall.arguments,
            callId: functionCall.id,
            stepIndex: i,
            totalSteps: functionCalls.length,
          }
        );

        // Store pending tool call message
        await this.storeToolCallMessage(functionCall, 'pending');

        // Check if tool exists
        const toolExists = toolRegistry.getTool(functionCall.name);
        if (!toolExists) {
          logger.error(
            `[${stepExecutionId}] Tool not found: ${functionCall.name}`,
            {
              availableTools: Array.from(toolRegistry.getAllTools()).map(
                (t) => t.name
              ),
            }
          );

          // Store failed tool call message
          await this.storeToolCallMessage(functionCall, 'failed');
          throw new Error(`Tool not found: ${functionCall.name}`);
        }

        // Check and recover permissions if tool requires them
        if (
          toolExists.requiredPermissions &&
          toolExists.requiredPermissions.length > 0
        ) {
          const permissionCheck = await this.checkAndRecoverPermissions(
            toolExists.requiredPermissions
          );

          if (!permissionCheck.hasAllPermissions) {
            const errorMessage = this.createPermissionErrorMessage(
              permissionCheck.missingPermissions
            );
            logger.error(
              `[${stepExecutionId}] Permission check failed for ${functionCall.name}`,
              {
                missingPermissions: permissionCheck.missingPermissions,
                recoverySuccessful: permissionCheck.recoverySuccessful,
                error: permissionCheck.error,
              }
            );

            // Store failed tool call message with permission error
            await this.storeToolCallMessage(functionCall, 'failed', {
              success: false,
              error: errorMessage,
              permissionError: true,
            });

            throw new Error(`Permission required: ${errorMessage}`);
          }
        }

        let result;
        try {
          logger.info(
            `[${stepExecutionId}] Tool found, validating parameters`,
            {
              toolName: functionCall.name,
              toolCategory: toolExists.category,
              toolRiskLevel: toolExists.riskLevel,
            }
          );

          // Validate parameters
          const validation = toolRegistry.validateParameters(
            functionCall.name,
            functionCall.arguments
          );
          if (!validation.valid) {
            logger.warn(
              `[${stepExecutionId}] Parameter validation failed for ${functionCall.name}:`,
              {
                errors: validation.errors,
                receivedParams: functionCall.arguments,
                requiredParams: toolExists.required,
              }
            );
            throw new Error(
              `Parameter validation failed: ${validation.errors.join(', ')}`
            );
          }

          logger.info(
            `[${stepExecutionId}] Parameter validation successful, executing tool`
          );

          // Enhanced tool execution logging
          logger.info(`[${stepExecutionId}] Starting tool execution`, {
            toolName: functionCall.name,
            toolCategory: toolExists.category,
            toolRiskLevel: toolExists.riskLevel,
            params: functionCall.arguments,
            paramCount: Object.keys(functionCall.arguments).length,
          });

          // Store executing tool call message
          await this.storeToolCallMessage(functionCall, 'executing');

          // Execute the function call
          result = await toolRegistry.executeTool(
            functionCall.name,
            functionCall.arguments
          );

          const stepExecutionTime = Date.now() - stepStartTime;
          const resultDataForLog =
            (result &&
              (result.data !== undefined ? result.data : result.result)) ||
            undefined;
          logger.info(`[${stepExecutionId}] Tool execution completed`, {
            toolName: functionCall.name,
            success: result?.success,
            hasData: !!resultDataForLog,
            executionTime: stepExecutionTime,
            dataSummary: resultDataForLog
              ? JSON.stringify(resultDataForLog).substring(0, 200)
              : undefined,
            error: result?.error,
            action: result?.action,
            timestamp: result?.timestamp,
            tabId: result?.tabId,
            tabUrl: result?.tabUrl,
          });

          // Store completed tool call message
          await this.storeToolCallMessage(
            functionCall,
            result.success ? 'completed' : 'failed',
            result
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
            `[${stepExecutionId}] Function call executed successfully: ${functionCall.name}`
          );
        } catch (error) {
          const stepExecutionTime = Date.now() - stepStartTime;
          logger.error(
            `[${stepExecutionId}] Function call execution failed: ${functionCall.name}`,
            {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              arguments: functionCall.arguments,
              executionTime: stepExecutionTime,
              stepIndex: i,
              toolCategory: toolExists.category,
              toolRiskLevel: toolExists.riskLevel,
              paramCount: Object.keys(functionCall.arguments).length,
            }
          );

          // Store failed tool call message
          await this.storeToolCallMessage(functionCall, 'failed', {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });

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
      } catch (outerError) {
        logger.error(
          `[${stepExecutionId}] Unexpected error in function call execution`,
          {
            error:
              outerError instanceof Error
                ? outerError.message
                : String(outerError),
            functionName: functionCall.name,
          }
        );

        // Create failed action step for unexpected errors
        const actionStep: ActionStep = {
          id: `func_${functionCall.name}_${Date.now()}`,
          name: `Execute ${functionCall.name}`,
          type: functionCall.name,
          description: `Unexpected error executing ${functionCall.name}`,
          params: functionCall.arguments,
          status: 'failed',
          result: {
            success: false,
            error:
              outerError instanceof Error
                ? outerError.message
                : String(outerError),
          },
          dependencies: [],
          riskLevel: this.getFunctionRiskLevel(functionCall.name),
        };

        executedActions.push(actionStep);
      }
    }

    const totalExecutionTime = Date.now() - parseInt(executionId.split('_')[1]);
    logger.info(
      `[${executionId}] Sequential function call execution completed`,
      {
        totalCalls: functionCalls.length,
        successfulActions: executedActions.filter(
          (a) => a.status === 'completed'
        ).length,
        failedActions: executedActions.filter((a) => a.status === 'failed')
          .length,
        totalExecutionTime,
        averageTimePerCall: totalExecutionTime / functionCalls.length,
      }
    );

    return executedActions;
  }

  private async executeFunctionCallsParallel(
    functionCalls: FunctionCall[]
  ): Promise<ActionStep[]> {
    const executedActions: ActionStep[] = [];

    try {
      // Pre-check permissions for all function calls
      for (const functionCall of functionCalls) {
        const toolExists = toolRegistry.getTool(functionCall.name);
        if (!toolExists) {
          logger.error(
            `Tool not found for parallel execution: ${functionCall.name}`
          );
          throw new Error(`Tool not found: ${functionCall.name}`);
        }

        // Check permissions if required
        if (
          toolExists.requiredPermissions &&
          toolExists.requiredPermissions.length > 0
        ) {
          const permissionCheck = await this.checkAndRecoverPermissions(
            toolExists.requiredPermissions
          );

          if (!permissionCheck.hasAllPermissions) {
            const errorMessage = this.createPermissionErrorMessage(
              permissionCheck.missingPermissions
            );
            logger.error(
              `Permission check failed for parallel execution of ${functionCall.name}`,
              {
                missingPermissions: permissionCheck.missingPermissions,
                recoverySuccessful: permissionCheck.recoverySuccessful,
              }
            );

            // Store failed tool call message with permission error
            await this.storeToolCallMessage(functionCall, 'failed', {
              success: false,
              error: errorMessage,
              permissionError: true,
            });

            throw new Error(
              `Permission required for ${functionCall.name}: ${errorMessage}`
            );
          }
        }
      }

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

  /**
   * Extract function calls from LLM response (handles both OpenAI tool_calls and internal functionCalls formats)
   */
  private extractFunctionCallsFromResponse(
    llmResponse: LLMResponse
  ): FunctionCall[] {
    console.log(
      '🚨🚨🚨 CRITICAL DEBUGGING: extractFunctionCallsFromResponse called!',
      {
        hasFunctionCalls: !!(
          llmResponse.functionCalls && llmResponse.functionCalls.length > 0
        ),
        responseKeys: Object.keys(llmResponse),
        functionCallsLength: llmResponse.functionCalls?.length || 0,
        rawResponsePreview: JSON.stringify(llmResponse).substring(0, 1000),
      }
    );

    // Check for OpenAI tool_calls format in the raw response
    const rawResponse = llmResponse as any;
    if (
      rawResponse.tool_calls &&
      Array.isArray(rawResponse.tool_calls) &&
      rawResponse.tool_calls.length > 0
    ) {
      logger.info('Found OpenAI tool_calls format in response', {
        toolCallsCount: rawResponse.tool_calls.length,
        toolCallNames: rawResponse.tool_calls.map(
          (tc: any) => tc.function?.name || 'unknown'
        ),
      });

      // Convert OpenAI tool_calls to internal FunctionCall format
      const functionCalls: FunctionCall[] = rawResponse.tool_calls.map(
        (toolCall: any) => {
          try {
            let parsedArguments: Record<string, any> = {};

            if (toolCall.function && toolCall.function.arguments) {
              const rawArgs = toolCall.function.arguments;
              logger.info('Processing OpenAI tool call arguments', {
                rawArgs,
                rawArgsType: typeof rawArgs,
                functionName: toolCall.function.name,
                // Enhanced debugging for URL parameters
                isNavigateToUrl: toolCall.function.name === 'navigateToUrl',
                rawArgsLength: rawArgs.length,
                rawArgsPreview:
                  rawArgs.length > 100
                    ? rawArgs.substring(0, 100) + '...'
                    : rawArgs,
              });

              if (typeof rawArgs === 'string') {
                // Handle various edge cases in JSON parsing
                if (rawArgs.trim() === '') {
                  logger.warn('Empty arguments string');
                  parsedArguments = {};
                } else if (rawArgs === 'of') {
                  // This appears to be a specific corruption case - try to recover
                  console.error(
                    '🚨🚨🚨 Arguments string is just "of" - CRITICAL URL CORRUPTION DETECTED!',
                    {
                      rawArgs,
                      functionName: toolCall.function.name,
                      toolCallDetails: JSON.stringify(toolCall, null, 2),
                      fullToolCall: toolCall,
                      context:
                        'URL parameter corruption detected at extraction phase',
                    }
                  );

                  // For navigateToUrl, try to extract URL from context
                  if (toolCall.function.name === 'navigateToUrl') {
                    // Look for URL patterns in the broader context
                    // This is a fallback when JSON is corrupted
                    parsedArguments = {
                      url: 'https://app.uniswap.org', // Default fallback
                      waitFor: 'load',
                    };
                    logger.error(
                      'URL CORRUPTION: Using fallback parameters for navigateToUrl due to "of" corruption',
                      {
                        originalArgs: rawArgs,
                        fallbackArgs: parsedArguments,
                        toolCallId: toolCall.id,
                      }
                    );
                  } else {
                    parsedArguments = {};
                    logger.error(
                      'URL CORRUPTION: Empty arguments for non-navigateToUrl function',
                      {
                        functionName: toolCall.function.name,
                        originalArgs: rawArgs,
                      }
                    );
                  }
                } else {
                  try {
                    // Try normal JSON parsing first
                    parsedArguments = JSON.parse(rawArgs);
                    logger.info('Successfully parsed arguments', {
                      parsedArguments,
                      keys: Object.keys(parsedArguments),
                      // Enhanced URL parameter tracking
                      hasUrlParameter: 'url' in parsedArguments,
                      urlValue: parsedArguments.url,
                      urlType: typeof parsedArguments.url,
                      isUrlOf: parsedArguments.url === 'of',
                      fullArgs: JSON.stringify(parsedArguments),
                    });
                  } catch (parseError) {
                    // If normal parsing fails, try recovery strategies
                    logger.error(
                      'JSON parsing failed for arguments, attempting recovery',
                      {
                        error:
                          parseError instanceof Error
                            ? parseError.message
                            : String(parseError),
                        rawArgs,
                        rawArgsLength: rawArgs.length,
                      }
                    );

                    // Try to fix common JSON issues
                    let fixedArgs = rawArgs;

                    // Strategy 1: Remove trailing commas
                    fixedArgs = fixedArgs.replace(/,\s*([}\]])/g, '$1');

                    // Strategy 2: Fix unescaped quotes in URLs
                    fixedArgs = fixedArgs.replace(
                      /"url":\s*"([^"]*)"/g,
                      (match, url) => {
                        return `"url": "${url.replace(/"/g, '\\"')}"`;
                      }
                    );

                    // Strategy 3: Try to extract URL if it contains obvious patterns
                    const urlMatch = rawArgs.match(/https?:\/\/[^\s"}]+/);
                    if (
                      urlMatch &&
                      toolCall.function.name === 'navigateToUrl'
                    ) {
                      parsedArguments = {
                        url: urlMatch[0],
                        waitFor: rawArgs.includes('waitFor')
                          ? 'load'
                          : undefined,
                      };
                      logger.info(
                        'Extracted URL using regex pattern',
                        parsedArguments
                      );
                    } else {
                      // Try parsing the fixed JSON
                      try {
                        parsedArguments = JSON.parse(fixedArgs);
                        logger.info('Successfully parsed after fixing JSON', {
                          parsedArguments,
                          keys: Object.keys(parsedArguments),
                        });
                      } catch (secondParseError) {
                        logger.error('All JSON parsing attempts failed', {
                          originalError:
                            parseError instanceof Error
                              ? parseError.message
                              : String(parseError),
                          fixedError:
                            secondParseError instanceof Error
                              ? secondParseError.message
                              : String(secondParseError),
                          originalArgs: rawArgs,
                          fixedArgs,
                        });
                        parsedArguments = {};
                      }
                    }
                  }
                }
              } else {
                // Arguments already parsed as object
                parsedArguments = rawArgs || {};
                logger.info('Arguments already parsed as object', {
                  parsedArguments,
                  keys: Object.keys(parsedArguments),
                });
              }
            }

            const functionCall = {
              name: toolCall.function?.name || 'unknown',
              arguments: parsedArguments,
              id: toolCall.id || `call_${Date.now()}`,
            };

            // 🚨🚨🚨 CRITICAL DEBUGGING: Check final parsed arguments before returning
            console.log('🚨🚨🚨 FINAL FUNCTION CALL DEBUG:', {
              functionName: functionCall.name,
              arguments: functionCall.arguments,
              argumentsType: typeof functionCall.arguments,
              argumentsKeys: Object.keys(functionCall.arguments),
              hasUrl: 'url' in functionCall.arguments,
              urlValue: functionCall.arguments.url,
              urlType: typeof functionCall.arguments.url,
              isUrlValid:
                functionCall.arguments.url &&
                typeof functionCall.arguments.url === 'string' &&
                functionCall.arguments.url.startsWith('http'),
              rawToolCall: toolCall,
              parsedArguments: parsedArguments,
              fullFunctionCall: JSON.stringify(functionCall, null, 2),
            });

            // Enhanced debugging for URL parameters in final function call
            if (functionCall.name === 'navigateToUrl') {
              logger.info('FINAL FUNCTION CALL CREATED - navigateToUrl', {
                functionCallId: functionCall.id,
                arguments: functionCall.arguments,
                urlValue: functionCall.arguments.url,
                urlType: typeof functionCall.arguments.url,
                isUrlOf: functionCall.arguments.url === 'of',
                hasValidUrl:
                  functionCall.arguments.url &&
                  functionCall.arguments.url !== 'of' &&
                  functionCall.arguments.url.startsWith('http'),
                fullFunctionCall: JSON.stringify(functionCall),
              });
            }

            return functionCall;
          } catch (error) {
            logger.error('Failed to parse OpenAI tool call', {
              error: error instanceof Error ? error.message : String(error),
              toolCall,
            });

            return {
              name: toolCall.function?.name || 'unknown',
              arguments: {},
              id: toolCall.id || `call_${Date.now()}`,
            };
          }
        }
      );

      logger.info('Successfully converted OpenAI tool_calls to FunctionCalls', {
        convertedCount: functionCalls.length,
        functionNames: functionCalls.map((fc) => fc.name),
      });

      return functionCalls;
    }

    // Check for internal functionCalls format
    if (llmResponse.functionCalls && llmResponse.functionCalls.length > 0) {
      logger.info('Using internal functionCalls format', {
        functionCallsCount: llmResponse.functionCalls.length,
        functionNames: llmResponse.functionCalls.map((fc) => fc.name),
      });

      return llmResponse.functionCalls;
    }

    // Check if there are any function calls in the actions array
    if (llmResponse.actions && llmResponse.actions.length > 0) {
      const functionCallActions = llmResponse.actions.filter(
        (action) => action.functionCall
      );
      if (functionCallActions.length > 0) {
        logger.info('Found function calls in actions array', {
          actionCount: functionCallActions.length,
          functionNames: functionCallActions.map(
            (action) => action.functionCall?.name || 'unknown'
          ),
        });

        return functionCallActions
          .map((action) => action.functionCall)
          .filter((call): call is FunctionCall => call !== undefined);
      }
    }

    logger.warn('No function calls found in LLM response');
    return [];
  }

  /**
   * Normalize function calls - simplified version since extraction is already handled in extractFunctionCallsFromResponse
   */
  private normalizeFunctionCalls(functionCalls: any[]): FunctionCall[] {
    return functionCalls.map((fc) => {
      // Assume function calls are already normalized by extractFunctionCallsFromResponse
      // This method is kept for backward compatibility
      return fc as FunctionCall;
    });
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

  /**
   * Get the current LLM instance
   */
  getLLM(): IWeb3LLM {
    return this.llm;
  }

  /**
   * Set the LLM instance (for dynamic model updates)
   */
  setLLM(llm: IWeb3LLM): void {
    this.llm = llm;
    logger.info('Web3Agent', 'LLM instance updated', {
      message: 'LLM instance updated successfully',
    });
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

  /**
   * Public method to execute element selection tasks
   */
  public async executeElementSelection(task: ElementSelectionTask) {
    return await this.executeElementSelectionAgentInternal(task);
  }

  /**
   * Get element selection agent status
   */
  public getElementSelectionStatus() {
    return this.elementSelectionAgent.getStatus();
  }

  private async getCurrentAddress(): Promise<string> {
    try {
      const account = await (
        await import('@/background/service')
      ).preferenceService.getCurrentAccount();
      return account?.address || '';
    } catch (e) {
      return '';
    }
  }

  private async getCurrentBalances(): Promise<Record<string, string>> {
    try {
      const { preferenceService, openapiService } = await import(
        '@/background/service'
      );
      const account = await preferenceService.getCurrentAccount();
      if (!account?.address) return {};
      // Use existing cached total balance fetch path similar to wallet controller
      const total = await openapiService.getTotalBalance(account.address);
      // Flatten by chain symbol for quick context; keep small to avoid token bloat
      const balances: Record<string, string> = {};
      (total?.chain_list || []).forEach((c: any) => {
        if (c?.asset_token?.symbol && c?.asset_token?.amount) {
          balances[c.asset_token.symbol] = String(c.asset_token.amount);
        }
      });
      return balances;
    } catch (e) {
      return {};
    }
  }

  private async getCurrentGasPrices(): Promise<Record<number, string>> {
    try {
      const { RPCService } = await import('@/background/service');
      const { findChain, findChainByEnum } = await import('@/utils/chain');
      // Query a few common chains using default RPC; keep minimal
      const chains = [1, 56, 137];
      const results: Record<number, string> = {};
      await Promise.all(
        chains.map(async (id) => {
          try {
            const chain = (await import('consts')).CHAINS_ENUM.ETH; // fallback default enum
            const rpcItem = RPCService.getDefaultRPC(
              findChain({ id })!.serverId
            );
            const host = rpcItem?.rpcUrl?.[0];
            if (!host) return;
            const data = await RPCService.defaultRPCRequest(
              host,
              'eth_gasPrice',
              []
            );
            if (typeof data === 'string') {
              results[id] = data;
            }
          } catch {}
        })
      );
      return results;
    } catch (e) {
      return {};
    }
  }

  private async storeConversationStep(
    userMessage: HumanMessage,
    assistantMessage: AIMessage,
    actions: ActionStep[]
  ): Promise<void> {
    try {
      const uiActors = (await import('@/ui/views/Agent/types/message')).Actors;
      await chatHistoryStore.addMessage(this.state.sessionId, {
        actor: uiActors.USER,
        content: userMessage.content as string,
        timestamp: Date.now(),
      });

      await chatHistoryStore.addMessage(this.state.sessionId, {
        actor: uiActors.ASSISTANT,
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

  /**
   * Store ReAct thinking status message in chat history
   */
  private async storeReActStatusMessage(
    thinkingContent: string,
    currentAction?: string,
    isThinking: boolean = true,
    isActing: boolean = false
  ): Promise<void> {
    try {
      if (!this.reactConfig.showThinking) return;
      const uiActors = (await import('@/ui/views/Agent/types/message')).Actors;
      await chatHistoryStore.addMessage(this.state.sessionId, {
        actor: uiActors.ASSISTANT,
        content: thinkingContent,
        timestamp: Date.now(),
        messageType: 'react_status',
        reactStatus: {
          isThinking,
          isActing,
          currentStep: this.state.executionHistory.length + 1,
          maxSteps: this.reactConfig.maxSteps,
          currentAction,
          thinkingContent,
          isActive: true,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      console.error('Error storing ReAct status message:', error);
    }
  }

  /**
   * Store tool call execution message in chat history
   */
  private async storeToolCallMessage(
    functionCall: FunctionCall,
    status: 'pending' | 'executing' | 'completed' | 'failed',
    result?: any
  ): Promise<void> {
    try {
      const uiActors = (await import('@/ui/views/Agent/types/message')).Actors;
      const toolMessage: any = {
        actor: uiActors.ASSISTANT,
        content: `${
          status === 'pending'
            ? 'Preparing to execute'
            : status === 'executing'
            ? 'Executing'
            : status === 'completed'
            ? 'Completed'
            : 'Failed'
        } tool: ${functionCall.name}`,
        timestamp: Date.now(),
        messageType: 'function_call',
        functionCalls: [
          {
            id: functionCall.id,
            name: functionCall.name,
            arguments: functionCall.arguments,
            status,
            timestamp: Date.now(),
          },
        ],
      };

      if (result !== undefined) {
        toolMessage.functionCalls[0].result = result;
      }

      await chatHistoryStore.addMessage(this.state.sessionId, toolMessage);
    } catch (error) {
      console.error('Error storing tool call message:', error);
    }
  }

  /**
   * Store thinking process message in chat history
   */
  private async storeThinkingMessage(content: string): Promise<void> {
    try {
      const uiActors = (await import('@/ui/views/Agent/types/message')).Actors;
      await chatHistoryStore.addMessage(this.state.sessionId, {
        actor: uiActors.ASSISTANT,
        content,
        timestamp: Date.now(),
        messageType: 'thinking',
      });
    } catch (error) {
      console.error('Error storing thinking message:', error);
    }
  }

  /**
   * Check Chrome extension permissions and handle recovery
   */
  private async checkAndRecoverPermissions(
    requiredPermissions: string[]
  ): Promise<{
    hasAllPermissions: boolean;
    missingPermissions: string[];
    recoveryAttempted: boolean;
    recoverySuccessful: boolean;
    error?: string;
  }> {
    try {
      // Get current permissions
      const currentPermissions = await chrome.permissions.getAll();

      // Check which permissions are missing
      const missingPermissions = requiredPermissions.filter((permission) => {
        return !currentPermissions.permissions?.includes(permission as any);
      });

      if (missingPermissions.length === 0) {
        return {
          hasAllPermissions: true,
          missingPermissions: [],
          recoveryAttempted: false,
          recoverySuccessful: false,
        };
      }

      logger.warn('Missing required permissions', {
        required: requiredPermissions,
        missing: missingPermissions,
        current: currentPermissions.permissions,
      });

      // Attempt to recover permissions
      const recoveryResult = await this.attemptPermissionRecovery(
        missingPermissions
      );

      return {
        hasAllPermissions: recoveryResult.success,
        missingPermissions: recoveryResult.success ? [] : missingPermissions,
        recoveryAttempted: true,
        recoverySuccessful: recoveryResult.success,
        error: recoveryResult.error,
      };
    } catch (error) {
      logger.error('Failed to check permissions', error);
      return {
        hasAllPermissions: false,
        missingPermissions: requiredPermissions,
        recoveryAttempted: false,
        recoverySuccessful: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Attempt to recover missing permissions
   */
  private async attemptPermissionRecovery(
    missingPermissions: string[]
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Store permission recovery message
      await this.storeReActStatusMessage(
        `Attempting to recover missing permissions: ${missingPermissions.join(
          ', '
        )}`,
        'Requesting permissions...'
      );

      // Try to request optional permissions
      const requestResult = await chrome.permissions.request({
        permissions: missingPermissions as any,
      });

      if (requestResult) {
        logger.info('Permission recovery successful', {
          recoveredPermissions: missingPermissions,
        });
        await this.storeReActStatusMessage(
          'Permission recovery successful!',
          'All required permissions granted'
        );
        return { success: true };
      } else {
        logger.warn('Permission recovery failed - user denied request');
        await this.storeReActStatusMessage(
          'Permission recovery failed',
          'User denied permission request. Some features may not work properly.',
          false,
          false
        );
        return {
          success: false,
          error:
            'User denied permission request. Please grant the required permissions in extension settings.',
        };
      }
    } catch (error) {
      logger.error('Permission recovery failed with error', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await this.storeReActStatusMessage(
        'Permission recovery failed',
        `Unable to recover permissions: ${errorMessage}`,
        false,
        false
      );

      return {
        success: false,
        error: `Failed to recover permissions: ${errorMessage}. Please check extension permissions.`,
      };
    }
  }

  /**
   * Get user-friendly permission descriptions
   */
  private getPermissionDescription(permission: string): string {
    const descriptions: Record<string, string> = {
      activeTab: 'Access to the current tab for interaction',
      scripting: 'Ability to execute scripts on web pages',
      tabs: 'Access to browser tabs for navigation',
      webNavigation: 'Monitor web navigation for automation',
      debugger: 'Debug access for advanced automation',
      storage: 'Local storage for data persistence',
      unlimitedStorage: 'Unlimited local storage capacity',
      alarms: 'Schedule alarms for timed operations',
      notifications: 'Display notifications for important events',
      offscreen: 'Offscreen document processing',
      contextMenus: 'Context menu integration',
      sidePanel: 'Side panel access for enhanced UI',
      host_permissions: 'Access to all websites for automation',
    };
    return descriptions[permission] || `${permission} permission`;
  }

  /**
   * Create user-friendly permission error message
   */
  private createPermissionErrorMessage(missingPermissions: string[]): string {
    const permissionList = missingPermissions
      .map((perm) => `• ${this.getPermissionDescription(perm)}`)
      .join('\n');

    return `The following permissions are required for this feature to work properly:\n\n${permissionList}\n\nPlease grant these permissions in the extension settings or try again.`;
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
        requiresMultiAgent:
          taskAnalysis.requiresBrowserAutomation &&
          taskAnalysis.complexity === 'high',
      });

      // Use multi-agent system for complex tasks requiring browser automation
      if (
        taskAnalysis.requiresBrowserAutomation &&
        taskAnalysis.complexity === 'high' &&
        this.multiAgentIntegration
      ) {
        logger.info('Using multi-agent system for complex automation task');

        const multiAgentResult = await this.multiAgentIntegration.executeTask(
          instruction,
          taskAnalysis,
          false, // Streaming handled separately
          undefined
        );

        // Add user message to conversation history
        const userMessage = new HumanMessage(instruction);
        this.state.conversationHistory.push(userMessage);

        // Add assistant response to conversation history
        const assistantMessage = new AIMessage(multiAgentResult.message);
        this.state.conversationHistory.push(assistantMessage);

        // Convert ActionStep types for compatibility
        const convertedActions = multiAgentResult.actions.map((action) => ({
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

        this.state.lastActivity = Date.now();

        return {
          success: multiAgentResult.success,
          message: multiAgentResult.message,
          sessionId: this.state.sessionId,
          timestamp: Date.now(),
          actions: convertedActions,
          metadata: {
            executionMethod: 'multi_agent',
            steps: multiAgentResult.steps,
            duration: multiAgentResult.duration,
            validation: multiAgentResult.validation,
            recovery: multiAgentResult.recovery,
            planning: multiAgentResult.planning,
            confidence: multiAgentResult.confidence,
          },
        };
      }

      // Use traditional browser automation for simpler tasks
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

      'wait_for',
      'scroll',
      'screenshot',
      'switch_tab',
      'close_tab',
      'navigateToUrl',
      'clickElement',
      'fillForm',

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

  // Multi-Agent System public methods
  async getMultiAgentStatus() {
    return {
      coordinationEnabled: this.coordinationEnabled,
      agents: {
        planner: !!this.plannerAgent,
        navigator: !!this.navigatorAgent,
        validator: !!this.validatorAgent,
      },
      multiAgentIntegration: !!this.multiAgentIntegration,
      multiAgentSystem: this.multiAgentIntegration
        ? this.multiAgentIntegration.getSystemStatus()
        : null,
      currentExecution: this.multiStepExecutor,
      coordinationEvents: this.state.coordinationEvents?.length || 0,
      currentPlan: this.state.currentEnhancedPlan,
    };
  }

  async enableMultiAgentCoordination(enable: boolean = true): Promise<void> {
    this.coordinationEnabled = enable;
    logger.info(`Multi-agent coordination ${enable ? 'enabled' : 'disabled'}`);
  }

  async getAgentStatus(agentType: 'planner' | 'navigator' | 'validator') {
    switch (agentType) {
      case 'planner':
        return this.plannerAgent
          ? { available: true, id: 'planner' }
          : { available: false };
      case 'navigator':
        return this.navigatorAgent
          ? { available: true, id: 'navigator' }
          : { available: false };
      case 'validator':
        return this.validatorAgent
          ? { available: true, id: 'validator' }
          : { available: false };
      default:
        return { available: false };
    }
  }

  /**
   * Execute task using multi-agent system explicitly
   */
  async executeWithMultiAgent(
    instruction: string,
    enableStreaming: boolean = false,
    onChunk?: (chunk: any) => void
  ): Promise<AgentResponse> {
    if (!this.multiAgentIntegration) {
      throw new Error('Multi-agent integration not available');
    }

    try {
      logger.info('Executing task with multi-agent system', { instruction });

      // Create basic task analysis
      const taskAnalysis: TaskAnalysis = {
        taskType: 'automation',
        complexity: 'high',
        confidence: 0.8,
        requiresBrowserAutomation: true,
        requiresWeb3: false,
        estimatedSteps: 5,
        reasoning: 'Explicit multi-agent execution requested',
        entities: [],
        browserActions: ['navigate'],
        web3Actions: [],
        timestamp: Date.now(),
        analysis: 'Multi-agent execution requested by user',
      };

      const result = await this.multiAgentIntegration.executeTask(
        instruction,
        taskAnalysis,
        enableStreaming,
        onChunk
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

      this.state.lastActivity = Date.now();

      return {
        success: result.success,
        message: result.message,
        sessionId: this.state.sessionId,
        timestamp: Date.now(),
        actions: convertedActions,
        metadata: {
          executionMethod: 'multi_agent_explicit',
          steps: result.steps,
          duration: result.duration,
          validation: result.validation,
          recovery: result.recovery,
          planning: result.planning,
          confidence: result.confidence,
        },
      };
    } catch (error) {
      logger.error('Multi-agent execution failed:', error);
      return {
        success: false,
        message: `Multi-agent execution failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        sessionId: this.state.sessionId,
        timestamp: Date.now(),
        actions: [],
        metadata: {
          confidence: 0,
        },
      };
    }
  }

  async getCoordinationEvents(limit: number = 50) {
    return (this.state.coordinationEvents || []).slice(-limit);
  }

  async clearCoordinationEvents(): Promise<void> {
    this.state.coordinationEvents = [];
    logger.info('Coordination events cleared');
  }

  async getEnhancedStats() {
    return {
      web3Agent: {
        sessionId: this.state.sessionId,
        conversationLength: this.state.conversationHistory.length,
        executionHistory: this.state.executionHistory.length,
        lastActivity: this.state.lastActivity,
        multiAgentEnabled: this.coordinationEnabled,
      },
      taskAnalyzer: await this.intelligentTaskAnalyzer.getCacheStats(),
      browserAutomation: await this.browserAutomationController.getExecutionHistory(),
      promptManager: await this.promptManager.getPromptStats(),
      actionRegistry: this.actionRegistry.getStats(),
      multiAgent: await this.getMultiAgentStatus(),
    };
  }

  private handleStreamingChunk(chunk: any): void {
    // Handle streaming chunks from LLM responses
    this.emit('streaming_chunk', chunk);
  }
}
