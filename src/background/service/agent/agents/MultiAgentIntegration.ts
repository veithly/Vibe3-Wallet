import { MultiAgentSystem } from './MultiAgentSystem';
import { IndexBasedElementSelector } from './ElementSelector';
import { ElementHighlighter } from './ElementHighlighter';
import { EnhancedNavigatorAgent } from './EnhancedNavigatorAgent';
import { DynamicTaskPlanner, PlanningContext, ReplanningTriggers } from './TaskPlanner';
import { TaskValidator, ValidationContext, ValidationCriteria } from './TaskValidator';
import { EnhancedErrorHandler, ErrorContext, RecoveryAction } from './ErrorHandler';
import { IWeb3LLM, Web3Context } from '../llm/types';
import { TaskAnalysis } from '../task-analysis/IntelligentTaskAnalyzer';
import { BrowserAutomationController } from '../automation/BrowserAutomationController';
import { ActionStep } from '../types';
import { StreamingLLMResponse } from '../llm/types';
import { AgentConfigManager } from './schemas/AgentConfig';
import { createLogger } from '@/utils/logger';

const logger = createLogger('MultiAgentIntegration');

// Integration configuration
export interface MultiAgentConfig {
  maxSteps: number;
  maxErrors: number;
  enableValidation: boolean;
  enableReplanning: boolean;
  enableRecovery: boolean;
  planningStrategy: 'conservative' | 'aggressive' | 'adaptive' | 'fallback';
  retryStrategy: 'immediate' | 'delayed' | 'exponential' | 'alternative';
  timeoutMs: number;
  // Highlighting and visual feedback options
  enableHighlighting: boolean;
  coloredBoxes: boolean;
  showLabels: boolean;
  visualFeedback: boolean;
  autoHighlight: boolean;
}

// Execution result with enhanced metadata
export interface MultiAgentExecutionResult {
  success: boolean;
  message: string;
  actions: ActionStep[];
  duration: number;
  steps: number;
  confidence: number;
  validation?: {
    isValid: boolean;
    confidence: number;
    message: string;
  };
  recovery?: {
    attempts: number;
    successful: boolean;
    actions: string[];
  };
  planning?: {
    replans: number;
    adaptationEvents: number;
  };
  errorAnalysis?: {
    errorType: string;
    severity: string;
    recoveryAction: string;
  };
}

/**
 * Integration layer that combines multi-agent system with existing Vibe3-Wallet components
 */
export class MultiAgentIntegration {
  private multiAgentSystem!: MultiAgentSystem;
  private elementSelector!: IndexBasedElementSelector;
  private elementHighlighter!: ElementHighlighter;
  private enhancedNavigator!: EnhancedNavigatorAgent;
  private taskPlanner!: DynamicTaskPlanner;
  private taskValidator!: TaskValidator;
  private errorHandler!: EnhancedErrorHandler;
  private browserAutomation!: BrowserAutomationController;
  private config: MultiAgentConfig;

  constructor(
    private llm: IWeb3LLM,
    private context: Web3Context,
    config: Partial<MultiAgentConfig> = {}
  ) {
    this.config = {
      maxSteps: 20,
      maxErrors: 5,
      enableValidation: true,
      enableReplanning: true,
      enableRecovery: true,
      planningStrategy: 'adaptive',
      retryStrategy: 'exponential',
      timeoutMs: 30000,
      // Highlighting and visual feedback defaults
      enableHighlighting: true,
      coloredBoxes: true,
      showLabels: true,
      visualFeedback: true,
      autoHighlight: true,
      ...config,
    };

    this.initializeComponents();
  }

  /**
   * Execute a task using the enhanced multi-agent system
   */
  async executeTask(
    instruction: string,
    taskAnalysis: TaskAnalysis,
    enableStreaming: boolean = false,
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<MultiAgentExecutionResult> {
    const startTime = Date.now();
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Starting multi-agent task execution', {
      instruction,
      taskId,
      taskType: taskAnalysis.taskType,
      config: this.config,
    });

    try {
      if (enableStreaming && onChunk) {
        onChunk({
          id: 'stream-init',
          type: 'content',
          content: 'Initializing multi-agent system...',
          timestamp: Date.now(),
        });
      }

      // Check if we should use multi-agent system or fallback to browser automation
      if (this.shouldUseMultiAgent(taskAnalysis)) {
        const result = await this.executeWithMultiAgent(
          instruction,
          taskAnalysis,
          taskId,
          enableStreaming,
          onChunk
        );

        logger.info('Multi-agent execution completed', {
          success: result.success,
          duration: result.duration,
          steps: result.steps,
          confidence: result.confidence,
        });

        return result;
      } else {
        // Fallback to existing browser automation
        logger.info('Using fallback browser automation');
        return await this.executeWithFallback(
          instruction,
          taskAnalysis,
          enableStreaming,
          onChunk
        );
      }

    } catch (error) {
      logger.error('Multi-agent task execution failed', error);

      return {
        success: false,
        message: `Multi-agent execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        actions: [],
        duration: Date.now() - startTime,
        steps: 0,
        confidence: 0,
        errorAnalysis: {
          errorType: 'execution_error',
          severity: 'high',
          recoveryAction: 'abort',
        },
      };
    }
  }

  /**
   * Execute task using the multi-agent system
   */
  private async executeWithMultiAgent(
    instruction: string,
    taskAnalysis: TaskAnalysis,
    taskId: string,
    enableStreaming: boolean,
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<MultiAgentExecutionResult> {
    const startTime = Date.now();
    let replanCount = 0;
    let recoveryAttempts = 0;
    const executedActions: ActionStep[] = [];

    try {
      // Execute with multi-agent system
      const result = await this.multiAgentSystem.executeTask(
        instruction,
        taskId,
        {
          maxSteps: this.config.maxSteps,
          maxErrors: this.config.maxErrors,
          enableValidation: this.config.enableValidation,
          enableReplanning: this.config.enableReplanning,
        }
      );

      // Convert result to ActionSteps
      const actions = this.convertToActionSteps(result, executedActions);

      // Perform final validation if enabled
      let validation;
      if (this.config.enableValidation && result.success) {
        validation = await this.performFinalValidation(instruction, result);
      }

      const duration = Date.now() - startTime;

      return {
        success: result.success,
        message: result.data?.message || 'Multi-agent execution completed',
        actions,
        duration,
        steps: result.metadata?.steps || 0,
        confidence: result.confidence,
        validation,
        planning: {
          replans: replanCount,
          adaptationEvents: result.metadata?.adaptationEvents || 0,
        },
        recovery: recoveryAttempts > 0 ? {
          attempts: recoveryAttempts,
          successful: result.success,
          actions: executedActions.map(a => a.name),
        } : undefined,
      };

    } catch (error) {
      // Handle error with recovery system
      if (this.config.enableRecovery) {
        const recoveryResult = await this.handleExecutionError(
          error as Error,
          instruction,
          { startTime, taskId, step: 'multi_agent_execution' }
        );
        recoveryAttempts++;

        if (recoveryResult.success) {
          return await this.executeWithMultiAgent(
            instruction,
            taskAnalysis,
            taskId,
            enableStreaming,
            onChunk
          );
        }
      }

      throw error;
    }
  }

  /**
   * Execute with fallback browser automation
   */
  private async executeWithFallback(
    instruction: string,
    taskAnalysis: TaskAnalysis,
    enableStreaming: boolean,
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<MultiAgentExecutionResult> {
    const startTime = Date.now();

    try {
      const result = await this.browserAutomation.handleAutomationTask(
        instruction,
        taskAnalysis,
        enableStreaming,
        onChunk
      );

      return {
        success: result.success,
        message: result.message,
        actions: result.actions,
        duration: Date.now() - startTime,
        steps: result.actions.length,
        confidence: result.success ? 0.7 : 0.3,
      };
    } catch (error) {
      logger.error('Fallback automation failed', error);

      return {
        success: false,
        message: `Fallback automation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        actions: [],
        duration: Date.now() - startTime,
        steps: 0,
        confidence: 0,
      };
    }
  }

  /**
   * Handle execution errors with recovery system
   */
  private async handleExecutionError(
    error: Error,
    instruction: string,
    context: { startTime: number; taskId: string; step: string }
  ): Promise<{ success: boolean; action?: RecoveryAction }> {
    try {
      const errorContext: ErrorContext = {
        operation: 'multi_agent_execution',
        step: context.step,
        timestamp: Date.now(),
        environment: {
          url: this.context.currentUrl || 'unknown',
          userAgent: navigator.userAgent,
          extensionVersion: '1.0.0',
        },
        execution: {
          stepNumber: 0,
          totalSteps: this.config.maxSteps,
          retryAttempt: 0,
          maxRetries: this.config.maxErrors,
        },
      };

      const { classification, recoveryActions } = await this.errorHandler.handleError(error, errorContext);

      logger.info('Error classification completed', {
        type: classification.type,
        severity: classification.severity,
        recoverable: classification.recoverable,
        recoveryActionsCount: recoveryActions.length,
      });

      // Execute the best recovery action
      if (recoveryActions.length > 0 && classification.recoverable) {
        const bestAction = recoveryActions[0];
        
        const recoveryResult = await this.errorHandler.executeRecovery(
          bestAction,
          errorContext,
          async (action) => {
            // Execute recovery action
            logger.info('Executing recovery action', { actionId: action.id, actionType: action.type });
            
            switch (action.type) {
              case 'wait':
                await new Promise(resolve => setTimeout(resolve, action.params.duration || 2000));
                return true;
              case 'retry':
                return true; // Signal to retry the operation
              case 'alternative':
                // Try alternative approach
                return await this.tryAlternativeApproach(instruction, action);
              default:
                return false;
            }
          }
        );

        return {
          success: recoveryResult.success,
          action: bestAction,
        };
      }

      return { success: false };

    } catch (handlingError) {
      logger.error('Error recovery failed', handlingError);
      return { success: false };
    }
  }

  /**
   * Try alternative approach for recovery
   */
  private async tryAlternativeApproach(
    instruction: string,
    action: RecoveryAction
  ): Promise<boolean> {
    try {
      logger.info('Trying alternative approach', { actionId: action.id });

      // Implement alternative approaches based on action type
      switch (action.id) {
        case 'refresh_page':
          // Refresh page functionality would go here
          logger.info('Refreshing page as alternative approach');
          return true;
        
        case 'simplify_task':
          // Simplify the task and retry
          logger.info('Simplifying task for retry');
          return true;
        
        default:
          logger.warn('Unknown alternative approach', { actionId: action.id });
          return false;
      }
    } catch (error) {
      logger.error('Alternative approach failed', error);
      return false;
    }
  }

  /**
   * Perform final validation of task completion
   */
  private async performFinalValidation(
    instruction: string,
    result: any
  ): Promise<{ isValid: boolean; confidence: number; message: string }> {
    try {
      const validationContext: ValidationContext = {
        originalInstruction: instruction,
        executedSteps: result.metadata?.steps ? [`step_${result.metadata.steps}`] : [],
        currentUrl: this.context.currentUrl || 'unknown',
        executionResults: [{
          step: 'multi_agent_execution',
          success: result.success,
          result: result.data,
          timestamp: Date.now(),
        }],
        context: this.context,
      };

      const validationResult = await this.taskValidator.validateTask(instruction, validationContext);

      return {
        isValid: validationResult.isValid,
        confidence: validationResult.confidence,
        message: validationResult.message,
      };

    } catch (error) {
      logger.error('Final validation failed', error);
      return {
        isValid: false,
        confidence: 0,
        message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Convert multi-agent result to ActionSteps
   */
  private convertToActionSteps(result: any, executedActions: ActionStep[]): ActionStep[] {
    const actions: ActionStep[] = [];

    if (result.data && result.data.steps) {
      result.data.steps.forEach((step: any, index: number) => {
        actions.push({
          id: `multi_agent_${index}`,
          name: `Multi-Agent Step ${index + 1}`,
          type: step.type || 'automation',
          description: step.description || `Step ${index + 1}`,
          params: step.params || {},
          status: 'completed',
          result: step.result,
          dependencies: step.dependencies || [],
          riskLevel: 'MEDIUM',
        });
      });
    }

    return actions;
  }

  /**
   * Determine if we should use multi-agent system or fallback
   */
  private shouldUseMultiAgent(taskAnalysis: TaskAnalysis): boolean {
    // Use multi-agent for complex tasks
    if (taskAnalysis.complexity === 'high') {
      return true;
    }

    // Use multi-agent for tasks requiring browser automation
    if (taskAnalysis.requiresBrowserAutomation) {
      return true;
    }

    // Use multi-agent for tasks with estimated steps > 3
    if (taskAnalysis.estimatedSteps > 3) {
      return true;
    }

    // Default to true for now (can be made configurable)
    return true;
  }

  /**
   * Initialize all components
   */
  private initializeComponents(): void {
    logger.info('Initializing multi-agent components with highlighting support');

    // Initialize multi-agent system
    this.multiAgentSystem = new MultiAgentSystem(this.llm, this.context);

    // Initialize element selector
    this.elementSelector = new IndexBasedElementSelector();

    // Initialize element highlighter
    this.elementHighlighter = new ElementHighlighter();

    // Initialize enhanced navigator with highlighting
    const navigatorConfig = new AgentConfigManager('development');
    this.enhancedNavigator = new EnhancedNavigatorAgent(navigatorConfig, {
      tabId: '1', // Default tab ID, will be updated during execution
    });

    // Initialize task planner
    this.taskPlanner = new DynamicTaskPlanner(this.llm);

    // Initialize task validator
    this.taskValidator = new TaskValidator(this.llm);

    // Initialize error handler
    this.errorHandler = new EnhancedErrorHandler();

    // Initialize browser automation (fallback)
    this.browserAutomation = new BrowserAutomationController();

    logger.info('Multi-agent components initialized successfully');
  }

  // Public utility methods

  /**
   * Get system status and statistics
   */
  getSystemStatus(): {
    isRunning: boolean;
    components: {
      multiAgent: any;
      elementSelector: { cacheSize: number };
      taskPlanner: { cacheSize: number };
      taskValidator: { historySize: number };
      errorHandler: { historySize: number };
    };
    config: MultiAgentConfig;
  } {
    return {
      isRunning: this.multiAgentSystem.getStatus().isRunning,
      components: {
        multiAgent: this.multiAgentSystem.getStatus(),
        elementSelector: { cacheSize: 0 }, // Would need to expose from ElementSelector
        taskPlanner: { cacheSize: this.taskPlanner.getCacheStats().size },
        taskValidator: { historySize: 0 }, // Would need to expose from TaskValidator
        errorHandler: { historySize: 0 }, // Would need to expose from ErrorHandler
      },
      config: this.config,
    };
  }

  /**
   * Analyze error patterns for a specific operation
   */
  analyzeErrorPatterns(operation: string) {
    return this.errorHandler.analyzeErrorPatterns(operation);
  }

  /**
   * Clear all caches and history
   */
  clearCaches(): void {
    this.taskPlanner.clearCache();
    this.taskValidator.clearValidationHistory();
    logger.info('Multi-agent caches cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MultiAgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Multi-agent configuration updated', { config: this.config });
  }

  /**
   * Get detailed execution statistics
   */
  getExecutionStats(): {
    totalTasks: number;
    successfulTasks: number;
    averageDuration: number;
    averageSteps: number;
    errorRates: { [key: string]: number };
  } {
    // This would track actual execution statistics
    // For now, return placeholder data
    return {
      totalTasks: 0,
      successfulTasks: 0,
      averageDuration: 0,
      averageSteps: 0,
      errorRates: {},
    };
  }

  // Highlighting control methods

  /**
   * Enable element highlighting for current tab
   */
  async enableHighlighting(tabId: number = 1): Promise<boolean> {
    try {
      if (!this.config.enableHighlighting) {
        logger.warn('Highlighting is disabled in configuration');
        return false;
      }

      const elements = await this.elementSelector.getPageElements(tabId);
      const success = await this.elementHighlighter.highlightElements(
        tabId,
        elements.elements,
        {
          showLabels: this.config.showLabels,
          coloredBoxes: this.config.coloredBoxes,
        }
      );

      logger.info('Element highlighting enabled', { tabId, elementCount: elements.elements.length });
      return success;
    } catch (error) {
      logger.error('Failed to enable highlighting', { tabId, error });
      return false;
    }
  }

  /**
   * Disable element highlighting for current tab
   */
  async disableHighlighting(tabId: number = 1): Promise<boolean> {
    try {
      const success = await this.elementHighlighter.removeHighlights(tabId);
      logger.info('Element highlighting disabled', { tabId, success });
      return success;
    } catch (error) {
      logger.error('Failed to disable highlighting', { tabId, error });
      return false;
    }
  }

  /**
   * Focus on specific element with enhanced highlighting
   */
  async focusElement(elementIndex: number, tabId: number = 1): Promise<boolean> {
    try {
      const elements = await this.elementSelector.getPageElements(tabId);
      const success = await this.elementHighlighter.focusElement(
        tabId,
        elementIndex,
        elements.elements,
        {
          showLabels: this.config.showLabels,
          coloredBoxes: this.config.coloredBoxes,
        }
      );

      logger.info('Element focus applied', { tabId, elementIndex, success });
      return success;
    } catch (error) {
      logger.error('Failed to focus element', { tabId, elementIndex, error });
      return false;
    }
  }

  /**
   * Click element with visual feedback
   */
  async clickElementWithFeedback(
    elementIndex: number,
    tabId: number = 1
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const elements = await this.elementSelector.getPageElements(tabId);
      const element = elements.elements[elementIndex];
      
      if (!element) {
        return { success: false, error: `Element ${elementIndex} not found` };
      }

      const result = await this.elementHighlighter.clickElementWithFeedback(
        tabId,
        element,
        elements.elements
      );

      logger.info('Element clicked with feedback', { tabId, elementIndex, success: result.success });
      return result;
    } catch (error) {
      logger.error('Failed to click element with feedback', { tabId, elementIndex, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Input text with visual feedback
   */
  async inputTextWithFeedback(
    elementIndex: number,
    text: string,
    tabId: number = 1
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const elements = await this.elementSelector.getPageElements(tabId);
      const element = elements.elements[elementIndex];
      
      if (!element) {
        return { success: false, error: `Element ${elementIndex} not found` };
      }

      const result = await this.elementHighlighter.inputTextWithFeedback(
        tabId,
        element,
        text,
        elements.elements
      );

      logger.info('Text input with feedback completed', { 
        tabId, 
        elementIndex, 
        textLength: text.length,
        success: result.success 
      });
      return result;
    } catch (error) {
      logger.error('Failed to input text with feedback', { tabId, elementIndex, text, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Toggle highlight visibility
   */
  async toggleHighlightVisibility(visible: boolean, tabId: number = 1): Promise<boolean> {
    try {
      const success = await this.elementHighlighter.toggleHighlights(tabId, visible);
      logger.info('Highlight visibility toggled', { tabId, visible, success });
      return success;
    } catch (error) {
      logger.error('Failed to toggle highlight visibility', { tabId, visible, error });
      return false;
    }
  }

  /**
   * Get current highlight information
   */
  getHighlightInfo(tabId: number = 1) {
    return this.elementHighlighter.getHighlightInfo(tabId);
  }

  /**
   * Check if highlighting is currently active
   */
  isHighlightActive(tabId: number = 1): boolean {
    const info = this.elementHighlighter.getHighlightInfo(tabId);
    return info.length > 0;
  }

  /**
   * Execute navigation task with enhanced highlighting
   */
  async executeNavigationWithHighlighting(
    instruction: string,
    taskAnalysis: TaskAnalysis,
    tabId: number = 1
  ): Promise<MultiAgentExecutionResult> {
    try {
      // Enable highlighting if configured
      if (this.config.autoHighlight && this.config.enableHighlighting) {
        await this.enableHighlighting(tabId);
      }

      // Execute the task
      const result = await this.executeTask(instruction, taskAnalysis);

      // Clean up highlighting if needed
      if (!this.config.autoHighlight) {
        await this.disableHighlighting(tabId);
      }

      return result;
    } catch (error) {
      logger.error('Navigation with highlighting failed', { tabId, error });
      
      // Ensure highlighting is cleaned up on error
      await this.disableHighlighting(tabId);
      
      return {
        success: false,
        message: `Navigation with highlighting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        actions: [],
        duration: 0,
        steps: 0,
        confidence: 0,
      };
    }
  }
}