import { AgentContext } from '../types';
import { ActionRegistry } from './builder';
import { chatHistoryStore } from '../chatHistory';
import { logger } from '@/ui/views/Agent/utils/logger';
import { BrowserAction } from './browser-actions';
import { Web3Action } from './web3-actions';

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface ActionExecutionOptions {
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  validateResult?: boolean;
}

export class EnhancedActionExecutor {
  private readonly context: AgentContext;
  private readonly actionRegistry: ActionRegistry;
  private readonly sessionId: string;
  private readonly browserAction: BrowserAction;
  private readonly web3Action: Web3Action;
  private executionStats: {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    averageExecutionTime: number;
  } = {
    totalActions: 0,
    successfulActions: 0,
    failedActions: 0,
    averageExecutionTime: 0,
  };

  constructor(
    context: AgentContext,
    actionRegistry: ActionRegistry,
    sessionId: string
  ) {
    this.context = context;
    this.actionRegistry = actionRegistry;
    this.sessionId = sessionId;
    this.browserAction = new BrowserAction(context);
    this.web3Action = new Web3Action(context);
  }

  async executeAction(
    actionName: string,
    params: Record<string, any>,
    options: ActionExecutionOptions = {}
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const stepId = `action_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      // Log action start
      await chatHistoryStore.addAgentStep(this.sessionId, {
        id: stepId,
        action: actionName,
        status: 'in_progress',
        timestamp: startTime,
        details: { params, options },
      });

      logger.info('ActionExecutor', `Executing action: ${actionName}`, {
        params,
        options,
      });

      // Validate action exists
      const action = this.actionRegistry[actionName];
      if (!action) {
        throw new Error(`Unknown action: ${actionName}`);
      }

      // Validate parameters against schema
      const validationResult = this.validateParameters(actionName, params);
      if (!validationResult.valid) {
        throw new Error(
          `Invalid parameters for action ${actionName}: ${validationResult.error}`
        );
      }

      // Execute the action with timeout and retry logic
      const result = await this.executeWithRetry(actionName, params, options);

      const duration = Date.now() - startTime;

      // Update execution stats
      this.updateStats(result.success, duration);

      // Log action completion
      await chatHistoryStore.updateAgentStep(this.sessionId, stepId, {
        status: result.success ? 'completed' : 'failed',
        duration,
        result: result.data,
        error: result.error,
      });

      logger.info('ActionExecutor', `Action completed: ${actionName}`, {
        success: result.success,
        duration,
        error: result.error,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Update execution stats
      this.updateStats(false, duration);

      // Log action failure
      await chatHistoryStore.updateAgentStep(this.sessionId, stepId, {
        status: 'failed',
        duration,
        error: errorMessage,
      });

      logger.error('ActionExecutor', `Action failed: ${actionName}`, {
        error: errorMessage,
        duration,
        params,
      });

      return {
        success: false,
        error: errorMessage,
        duration,
      };
    }
  }

  private async executeWithRetry(
    actionName: string,
    params: Record<string, any>,
    options: ActionExecutionOptions
  ): Promise<ActionResult> {
    const { timeout = 30000, retryCount = 2, retryDelay = 1000 } = options;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= retryCount + 1; attempt++) {
      try {
        return await this.executeSingleAction(actionName, params, timeout);
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';

        if (attempt <= retryCount) {
          logger.warn(
            'ActionExecutor',
            `Action failed, retrying (${attempt}/${retryCount}): ${actionName}`,
            {
              error: lastError,
              attempt,
            }
          );

          // Wait before retry
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelay * attempt)
          );
        }
      }
    }

    return {
      success: false,
      error: lastError || 'Action failed after all retries',
    };
  }

  private async executeSingleAction(
    actionName: string,
    params: Record<string, any>,
    timeout: number
  ): Promise<ActionResult> {
    const action = this.actionRegistry[actionName];

    // Create timeout promise
    const timeoutPromise = new Promise<ActionResult>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Action ${actionName} timed out after ${timeout}ms`));
      }, timeout);
    });

    // Execute action
    const executionPromise = this.executeActionHandler(actionName, params);

    // Race between execution and timeout
    return Promise.race([executionPromise, timeoutPromise]);
  }

  private async executeActionHandler(
    actionName: string,
    params: Record<string, any>
  ): Promise<ActionResult> {
    const action = this.actionRegistry[actionName];

    // Use real action handlers instead of mock data
    if (this.isWeb3Action(actionName)) {
      return this.web3Action.executeAction(actionName, params);
    } else {
      return this.browserAction.executeAction(actionName, params);
    }
  }

  private isWeb3Action(actionName: string): boolean {
    const web3ActionPatterns = [
      'addLiquidity',
      'removeLiquidity',
      'interactWithContract',
      'signMessage',
      'signTypedData',
      'getNFTs',
      'getGasPrice',
      'estimateGas',
    ];

    return web3ActionPatterns.includes(actionName);
  }

  private validateParameters(
    actionName: string,
    params: Record<string, any>
  ): { valid: boolean; error?: string } {
    const action = this.actionRegistry[actionName];

    // For now, perform basic validation
    // In a real implementation, this would use Zod schema validation
    if (!params || typeof params !== 'object') {
      return { valid: false, error: 'Parameters must be an object' };
    }

    return { valid: true };
  }

  private updateStats(success: boolean, duration: number): void {
    this.executionStats.totalActions++;

    if (success) {
      this.executionStats.successfulActions++;
    } else {
      this.executionStats.failedActions++;
    }

    // Update average execution time
    const totalDuration =
      this.executionStats.averageExecutionTime *
        (this.executionStats.totalActions - 1) +
      duration;
    this.executionStats.averageExecutionTime =
      totalDuration / this.executionStats.totalActions;
  }

  getExecutionStats() {
    return { ...this.executionStats };
  }

  resetStats() {
    this.executionStats = {
      totalActions: 0,
      successfulActions: 0,
      failedActions: 0,
      averageExecutionTime: 0,
    };
  }

  getAvailableActions(): string[] {
    return Object.keys(this.actionRegistry);
  }

  getActionInfo(
    actionName: string
  ): { description: string; schema?: any } | null {
    const action = this.actionRegistry[actionName];
    return action
      ? { description: action.description, schema: action.schema }
      : null;
  }

  // Batch execution for multiple actions
  async executeBatch(
    actions: Array<{
      name: string;
      params: Record<string, any>;
      options?: ActionExecutionOptions;
    }>
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const action of actions) {
      const result = await this.executeAction(
        action.name,
        action.params,
        action.options
      );
      results.push(result);

      // Stop execution if an action fails and critical flag is set
      if (!result.success && action.options?.validateResult) {
        break;
      }
    }

    return results;
  }

  // Parallel execution for independent actions
  async executeParallel(
    actions: Array<{
      name: string;
      params: Record<string, any>;
      options?: ActionExecutionOptions;
    }>
  ): Promise<ActionResult[]> {
    const promises = actions.map((action) =>
      this.executeAction(action.name, action.params, action.options)
    );

    return Promise.all(promises);
  }
}
