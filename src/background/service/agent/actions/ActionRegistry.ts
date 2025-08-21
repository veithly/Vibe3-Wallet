import { z } from 'zod';
import { ActionStep, ActionDefinition } from '../types';
import { createLogger } from '@/utils/logger';
import { AssetQueryAction } from './asset-query-actions';
import { 
  getAllAssetsActionSchema,
  getTokenBalancesActionSchema,
  getNativeBalanceActionSchema,
  getAssetPricesActionSchema
} from './asset-query-schemas';

const logger = createLogger('ActionRegistry');

// Action handler schema
export const ActionHandlerSchema = z.object({
  name: z.string(),
  description: z.string(),
  handler: z.function(),
  schema: z.any(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  category: z.enum(['web3', 'browser', 'system', 'utility']),
  timeout: z.number().default(30000),
  retryable: z.boolean().default(true),
  dependencies: z.array(z.string()).default([]),
});

export type ActionHandler = z.infer<typeof ActionHandlerSchema>;

// Action execution result
export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
  metadata?: Record<string, any>;
}

// Action execution context
export interface ActionExecutionContext {
  step: ActionStep;
  context: any;
  timestamp: number;
  attempt: number;
  metadata?: Record<string, any>;
}

// Action registry configuration
export interface ActionRegistryConfig {
  maxRetries: number;
  defaultTimeout: number;
  enableParallel: boolean;
  maxConcurrency: number;
  enableMetrics: boolean;
}

/**
 * Dynamic Action Registry for managing and executing actions
 */
export class ActionRegistry {
  private actions: Map<string, ActionHandler> = new Map();
  private categories: Map<string, Set<string>> = new Map();
  private executionHistory: ActionResult[] = [];
  private metrics: Map<string, any> = new Map();
  private config: ActionRegistryConfig;
  private assetQueryAction: AssetQueryAction;

  constructor(config?: Partial<ActionRegistryConfig>) {
    this.config = {
      maxRetries: 3,
      defaultTimeout: 30000,
      enableParallel: true,
      maxConcurrency: 5,
      enableMetrics: true,
      ...config,
    };

    // Initialize asset query action
    this.assetQueryAction = new AssetQueryAction({} as any); // Context will be provided during execution

    this.initializeDefaultActions();
    this.initializeCategories();
  }

  /**
   * Initialize default Web3 and browser actions
   */
  private initializeDefaultActions(): void {
    // Web3 Actions
    this.registerAction('checkBalance', {
      name: 'checkBalance',
      description: 'Check token balance for an address',
      handler: this.executeCheckBalance.bind(this),
      schema: {
        type: 'object',
        properties: {
          address: { type: 'string' },
          token: { type: 'string' },
        },
        required: ['address'],
      },
      riskLevel: 'low',
      category: 'web3',
      timeout: 10000,
      dependencies: [],
      retryable: true,
    });

    this.registerAction('sendTransaction', {
      name: 'sendTransaction',
      description: 'Send transaction to recipient',
      handler: this.executeSendTransaction.bind(this),
      schema: {
        type: 'object',
        properties: {
          to: { type: 'string' },
          amount: { type: 'string' },
          token: { type: 'string' },
          gasLimit: { type: 'string' },
        },
        required: ['to', 'amount', 'token'],
      },
      riskLevel: 'high',
      category: 'web3',
      timeout: 60000,
      dependencies: [],
      retryable: false,
    });

    this.registerAction('approveToken', {
      name: 'approveToken',
      description: 'Approve token spending',
      handler: this.executeApproveToken.bind(this),
      schema: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          spender: { type: 'string' },
          amount: { type: 'string' },
        },
        required: ['token', 'spender', 'amount'],
      },
      riskLevel: 'medium',
      category: 'web3',
      timeout: 45000,
      dependencies: [],
      retryable: true,
    });

    this.registerAction('swapTokens', {
      name: 'swapTokens',
      description: 'Swap tokens on DEX',
      handler: this.executeSwapTokens.bind(this),
      schema: {
        type: 'object',
        properties: {
          fromToken: { type: 'string' },
          toToken: { type: 'string' },
          amount: { type: 'string' },
          slippage: { type: 'number', default: 0.5 },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
      riskLevel: 'high',
      category: 'web3',
      timeout: 90000,
      dependencies: [],
      retryable: true,
    });

    this.registerAction('bridgeTokens', {
      name: 'bridgeTokens',
      description: 'Bridge tokens across chains',
      handler: this.executeBridgeTokens.bind(this),
      schema: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          amount: { type: 'string' },
          fromChain: { type: 'number' },
          toChain: { type: 'number' },
        },
        required: ['token', 'amount', 'fromChain', 'toChain'],
      },
      riskLevel: 'high',
      category: 'web3',
      timeout: 120000,
      dependencies: [],
      retryable: true,
    });

    this.registerAction('stakeTokens', {
      name: 'stakeTokens',
      description: 'Stake tokens in DeFi protocol',
      handler: this.executeStakeTokens.bind(this),
      schema: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          amount: { type: 'string' },
          protocol: { type: 'string' },
        },
        required: ['token', 'amount'],
      },
      riskLevel: 'medium',
      category: 'web3',
      timeout: 60000,
      dependencies: [],
      retryable: true,
    });

    // Browser Automation Actions
    this.registerAction('navigateToUrl', {
      name: 'navigateToUrl',
      description: 'Navigate to URL in browser',
      handler: this.executeNavigateToUrl.bind(this),
      schema: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri' },
          waitFor: { type: 'string', enum: ['load', 'networkidle'] },
          timeout: { type: 'number' },
        },
        required: ['url'],
      },
      riskLevel: 'medium',
      category: 'browser',
      timeout: 30000,
      dependencies: [],
      retryable: true,
    });

    this.registerAction('clickElement', {
      name: 'clickElement',
      description: 'Click element on page',
      handler: this.executeClickElement.bind(this),
      schema: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          text: { type: 'string' },
          waitForNavigation: { type: 'boolean' },
        },
        oneOf: [{ required: ['selector'] }, { required: ['text'] }],
      },
      riskLevel: 'medium',
      category: 'browser',
      timeout: 15000,
      dependencies: [],
      retryable: true,
    });

    this.registerAction('fillForm', {
      name: 'fillForm',
      description: 'Fill form fields',
      handler: this.executeFillForm.bind(this),
      schema: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                selector: { type: 'string' },
                name: { type: 'string' },
                value: { type: 'string' },
                type: { type: 'string' },
              },
              required: ['value'],
            },
          },
          submit: { type: 'boolean' },
        },
        required: ['fields'],
      },
      riskLevel: 'medium',
      category: 'browser',
      timeout: 20000,
      dependencies: [],
      retryable: true,
    });

    this.registerAction('extractContent', {
      name: 'extractContent',
      description: 'Extract content from page',
      handler: this.executeExtractContent.bind(this),
      schema: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          type: { type: 'string', enum: ['text', 'html', 'attribute'] },
          attribute: { type: 'string' },
          multiple: { type: 'boolean' },
        },
        required: ['selector'],
      },
      riskLevel: 'low',
      category: 'browser',
      timeout: 10000,
      dependencies: [],
      retryable: true,
    });

    // System Actions
    this.registerAction('switchNetwork', {
      name: 'switchNetwork',
      description: 'Switch blockchain network',
      handler: this.executeSwitchNetwork.bind(this),
      schema: {
        type: 'object',
        properties: {
          chainId: { type: 'number' },
        },
        required: ['chainId'],
      },
      riskLevel: 'low',
      category: 'system',
      timeout: 15000,
      dependencies: [],
      retryable: true,
    });

    this.registerAction('connectWallet', {
      name: 'connectWallet',
      description: 'Connect wallet to dApp',
      handler: this.executeConnectWallet.bind(this),
      schema: {
        type: 'object',
        properties: {
          dappUrl: { type: 'string' },
        },
      },
      riskLevel: 'medium',
      category: 'system',
      timeout: 30000,
      dependencies: [],
      retryable: true,
    });

    // Asset Query Actions
    this.registerAction('getAllAssets', {
      name: 'getAllAssets',
      description: getAllAssetsActionSchema.description,
      handler: this.executeGetAllAssets.bind(this),
      schema: {
        type: 'object',
        properties: {
          address: { type: 'string' },
          chainId: { type: 'string' },
          includeZeroBalances: { type: 'boolean' },
        },
      },
      riskLevel: 'low',
      category: 'web3',
      timeout: 30000,
      dependencies: [],
      retryable: true,
    });

    this.registerAction('getTokenBalances', {
      name: 'getTokenBalances',
      description: getTokenBalancesActionSchema.description,
      handler: this.executeGetTokenBalances.bind(this),
      schema: {
        type: 'object',
        properties: {
          address: { type: 'string' },
          chainId: { type: 'string' },
          tokenAddresses: { type: 'array', items: { type: 'string' } },
        },
      },
      riskLevel: 'low',
      category: 'web3',
      timeout: 20000,
      dependencies: [],
      retryable: true,
    });

    this.registerAction('getNativeBalance', {
      name: 'getNativeBalance',
      description: getNativeBalanceActionSchema.description,
      handler: this.executeGetNativeBalance.bind(this),
      schema: {
        type: 'object',
        properties: {
          address: { type: 'string' },
          chainId: { type: 'string' },
        },
      },
      riskLevel: 'low',
      category: 'web3',
      timeout: 15000,
      dependencies: [],
      retryable: true,
    });

    this.registerAction('getAssetPrices', {
      name: 'getAssetPrices',
      description: getAssetPricesActionSchema.description,
      handler: this.executeGetAssetPrices.bind(this),
      schema: {
        type: 'object',
        properties: {
          chainId: { type: 'string' },
          tokenAddresses: { type: 'array', items: { type: 'string' } },
        },
      },
      riskLevel: 'low',
      category: 'web3',
      timeout: 15000,
      dependencies: [],
      retryable: true,
    });

    // Utility Actions
    this.registerAction('waitFor', {
      name: 'waitFor',
      description: 'Wait for condition or timeout',
      handler: this.executeWaitFor.bind(this),
      schema: {
        type: 'object',
        properties: {
          condition: { type: 'string' },
          timeout: { type: 'number' },
          interval: { type: 'number' },
        },
        required: ['timeout'],
      },
      riskLevel: 'low',
      category: 'utility',
      timeout: 60000,
      dependencies: [],
      retryable: true,
    });

    logger.info('Default actions initialized', {
      count: this.actions.size,
      categories: Array.from(this.categories.keys()),
    });
  }

  /**
   * Initialize action categories
   */
  private initializeCategories(): void {
    this.categories.set('web3', new Set());
    this.categories.set('browser', new Set());
    this.categories.set('system', new Set());
    this.categories.set('utility', new Set());
  }

  /**
   * Register a new action
   */
  registerAction(name: string, handler: ActionHandler): void {
    try {
      const validated = ActionHandlerSchema.parse(handler);
      this.actions.set(name, validated);

      // Add to category
      const categorySet = this.categories.get(validated.category);
      if (categorySet) {
        categorySet.add(name);
      } else {
        this.categories.set(validated.category, new Set([name]));
      }

      // Initialize metrics
      if (this.config.enableMetrics) {
        this.metrics.set(name, {
          executions: 0,
          successes: 0,
          failures: 0,
          averageDuration: 0,
          lastExecution: null,
        });
      }

      logger.info('Action registered', {
        name,
        category: handler.category,
        riskLevel: handler.riskLevel,
      });
    } catch (error) {
      logger.error('Failed to register action', { name, error });
      throw new Error(
        `Invalid action handler: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Unregister an action
   */
  unregisterAction(name: string): boolean {
    const handler = this.actions.get(name);
    if (!handler) {
      return false;
    }

    this.actions.delete(name);

    // Remove from category
    const categorySet = this.categories.get(handler.category);
    if (categorySet) {
      categorySet.delete(name);
    }

    // Remove metrics
    this.metrics.delete(name);

    logger.info('Action unregistered', { name });
    return true;
  }

  /**
   * Get action handler
   */
  getActionHandler(name: string): ActionHandler | undefined {
    return this.actions.get(name);
  }

  /**
   * Execute action
   */
  async executeAction(
    name: string,
    params: Record<string, any>,
    context?: any
  ): Promise<ActionResult> {
    const handler = this.actions.get(name);
    if (!handler) {
      return {
        success: false,
        error: `Action not found: ${name}`,
        duration: 0,
      };
    }

    const executionContext: ActionExecutionContext = {
      step: {
        id: `action_${Date.now()}`,
        name: handler.name,
        type: name,
        description: handler.description,
        params,
        status: 'pending',
        dependencies: [],
      },
      context,
      timestamp: Date.now(),
      attempt: 1,
    };

    return await this.executeWithRetry(handler, executionContext);
  }

  /**
   * Execute action with retry logic
   */
  private async executeWithRetry(
    handler: ActionHandler,
    context: ActionExecutionContext
  ): Promise<ActionResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        logger.debug(`Executing action: ${handler.name} (attempt ${attempt})`);

        // Update attempt
        context.attempt = attempt;
        context.step.status = 'in_progress';

        // Execute with timeout
        const result = await this.executeWithTimeout(
          Promise.resolve(
            handler.handler(context.step.params, context.context)
          ),
          handler.timeout
        );

        const duration = Date.now() - startTime;

        // Update metrics
        if (this.config.enableMetrics) {
          this.updateMetrics(handler.name, true, duration);
        }

        // Add to execution history
        this.addToExecutionHistory({
          success: true,
          data: result,
          duration,
          metadata: {
            action: handler.name,
            attempt,
            category: handler.category,
          },
        });

        logger.info('Action executed successfully', {
          action: handler.name,
          duration,
          attempt,
        });

        return {
          success: true,
          data: result,
          duration,
          metadata: {
            action: handler.name,
            attempt,
            category: handler.category,
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(
          `Action execution failed: ${handler.name} (attempt ${attempt})`,
          { error: lastError.message }
        );

        if (attempt === this.config.maxRetries || !handler.retryable) {
          break;
        }

        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }

    const duration = Date.now() - startTime;

    // Update metrics
    if (this.config.enableMetrics) {
      this.updateMetrics(handler.name, false, duration);
    }

    // Add to execution history
    this.addToExecutionHistory({
      success: false,
      error: lastError?.message || 'Unknown error',
      duration,
      metadata: {
        action: handler.name,
        attempt: context.attempt,
        category: handler.category,
      },
    });

    logger.error('Action execution failed after retries', {
      action: handler.name,
      error: lastError?.message,
      duration,
      attempts: context.attempt,
    });

    return {
      success: false,
      error: lastError?.message || 'Action execution failed',
      duration,
      metadata: {
        action: handler.name,
        attempt: context.attempt,
        category: handler.category,
      },
    };
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('Action execution timeout')),
        timeoutMs
      );
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Validate action parameters
   */
  validateParameters(
    name: string,
    params: Record<string, any>
  ): { valid: boolean; errors: string[] } {
    const handler = this.actions.get(name);
    if (!handler) {
      return { valid: false, errors: [`Action not found: ${name}`] };
    }

    try {
      // Simple validation - in production, use a proper schema validator
      const requiredParams = handler.schema?.required || [];
      const errors: string[] = [];

      for (const param of requiredParams) {
        if (!(param in params)) {
          errors.push(`Missing required parameter: ${param}`);
        }
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      return {
        valid: false,
        errors: [
          `Validation error: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        ],
      };
    }
  }

  /**
   * Get available actions
   */
  getAvailableActions(): string[] {
    return Array.from(this.actions.keys());
  }

  /**
   * Get actions by category
   */
  getActionsByCategory(category: string): string[] {
    const categorySet = this.categories.get(category);
    return categorySet ? Array.from(categorySet) : [];
  }

  /**
   * Get action schema
   */
  getActionSchema(name: string): any {
    const handler = this.actions.get(name);
    return handler?.schema;
  }

  /**
   * Get action info
   */
  getActionInfo(
    name: string
  ): {
    name: string;
    description: string;
    category: string;
    riskLevel: string;
    timeout: number;
    retryable: boolean;
    schema?: any;
  } | null {
    const handler = this.actions.get(name);
    if (!handler) {
      return null;
    }

    return {
      name: handler.name,
      description: handler.description,
      category: handler.category,
      riskLevel: handler.riskLevel,
      timeout: handler.timeout,
      retryable: handler.retryable,
      schema: handler.schema,
    };
  }

  /**
   * Get all actions info
   */
  getAllActionsInfo(): Array<{
    name: string;
    description: string;
    category: string;
    riskLevel: string;
    timeout: number;
    retryable: boolean;
  }> {
    return Array.from(this.actions.values()).map((handler) => ({
      name: handler.name,
      description: handler.description,
      category: handler.category,
      riskLevel: handler.riskLevel,
      timeout: handler.timeout,
      retryable: handler.retryable,
    }));
  }

  /**
   * Execute multiple actions
   */
  async executeActions(
    actions: Array<{ name: string; params: Record<string, any> }>,
    context?: any
  ): Promise<ActionResult[]> {
    if (!this.config.enableParallel || actions.length === 1) {
      // Sequential execution
      const results: ActionResult[] = [];
      for (const action of actions) {
        const result = await this.executeAction(
          action.name,
          action.params,
          context
        );
        results.push(result);
      }
      return results;
    }

    // Parallel execution with concurrency limit
    const results: ActionResult[] = [];
    const executing = new Set<Promise<ActionResult>>();

    for (const action of actions) {
      if (executing.size >= this.config.maxConcurrency) {
        // Wait for one to complete
        await Promise.race(executing);
      }

      const promise = this.executeAction(action.name, action.params, context);
      executing.add(promise);

      promise.finally(() => {
        executing.delete(promise);
      });

      results.push(await promise);
    }

    // Wait for remaining executions
    await Promise.all(executing);

    return results;
  }

  /**
   * Action implementation methods
   */
  private async executeCheckBalance(params: any, context?: any): Promise<any> {
    // Implementation would interact with actual wallet
    logger.info('Checking balance', params);
    return { balance: '0', token: params.token || 'ETH' };
  }

  private async executeSendTransaction(
    params: any,
    context?: any
  ): Promise<any> {
    logger.info('Sending transaction', params);
    return { txHash: '0x' + Math.random().toString(16).substr(2, 64) };
  }

  private async executeApproveToken(params: any, context?: any): Promise<any> {
    logger.info('Approving token', params);
    return { txHash: '0x' + Math.random().toString(16).substr(2, 64) };
  }

  private async executeSwapTokens(params: any, context?: any): Promise<any> {
    logger.info('Swapping tokens', params);
    return {
      txHash: '0x' + Math.random().toString(16).substr(2, 64),
      outputAmount: '0',
    };
  }

  private async executeBridgeTokens(params: any, context?: any): Promise<any> {
    logger.info('Bridging tokens', params);
    return { txHash: '0x' + Math.random().toString(16).substr(2, 64) };
  }

  private async executeStakeTokens(params: any, context?: any): Promise<any> {
    logger.info('Staking tokens', params);
    return { txHash: '0x' + Math.random().toString(16).substr(2, 64) };
  }

  private async executeNavigateToUrl(params: any, context?: any): Promise<any> {
    logger.info('Navigating to URL', params);
    return { success: true, url: params.url };
  }

  private async executeClickElement(params: any, context?: any): Promise<any> {
    logger.info('Clicking element', params);
    return { success: true, element: params.selector || params.text };
  }

  private async executeFillForm(params: any, context?: any): Promise<any> {
    logger.info('Filling form', params);
    return { success: true, fieldsFilled: params.fields.length };
  }

  private async executeExtractContent(
    params: any,
    context?: any
  ): Promise<any> {
    logger.info('Extracting content', params);
    return { content: 'Sample content', selector: params.selector };
  }

  private async executeSwitchNetwork(params: any, context?: any): Promise<any> {
    logger.info('Switching network', params);
    return { success: true, chainId: params.chainId };
  }

  private async executeConnectWallet(params: any, context?: any): Promise<any> {
    logger.info('Connecting wallet', params);
    return { success: true, connected: true };
  }

  private async executeWaitFor(params: any, context?: any): Promise<any> {
    logger.info('Waiting for condition', params);
    await new Promise((resolve) => setTimeout(resolve, params.timeout));
    return { success: true, waited: params.timeout };
  }

  // Asset Query Action implementations
  private async executeGetAllAssets(params: any, context?: any): Promise<any> {
    logger.info('Getting all assets', params);
    const result = await this.assetQueryAction.getAllAssets(params);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get all assets');
    }
    return result.data;
  }

  private async executeGetTokenBalances(params: any, context?: any): Promise<any> {
    logger.info('Getting token balances', params);
    const result = await this.assetQueryAction.getTokenBalances(params);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get token balances');
    }
    return result.data;
  }

  private async executeGetNativeBalance(params: any, context?: any): Promise<any> {
    logger.info('Getting native balance', params);
    const result = await this.assetQueryAction.getNativeBalance(params);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get native balance');
    }
    return result.data;
  }

  private async executeGetAssetPrices(params: any, context?: any): Promise<any> {
    logger.info('Getting asset prices', params);
    const result = await this.assetQueryAction.getAssetPrices(params);
    if (!result.success) {
      throw new Error(result.error || 'Failed to get asset prices');
    }
    return result.data;
  }

  /**
   * Metrics and analytics
   */
  private updateMetrics(
    actionName: string,
    success: boolean,
    duration: number
  ): void {
    const metrics = this.metrics.get(actionName);
    if (!metrics) return;

    metrics.executions++;
    if (success) {
      metrics.successes++;
    } else {
      metrics.failures++;
    }

    // Update average duration
    metrics.averageDuration =
      (metrics.averageDuration * (metrics.executions - 1) + duration) /
      metrics.executions;
    metrics.lastExecution = Date.now();
  }

  private addToExecutionHistory(result: ActionResult): void {
    this.executionHistory.push(result);

    // Keep only last 1000 results
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-1000);
    }
  }

  /**
   * Public methods for analytics
   */
  getMetrics(actionName?: string): any {
    if (actionName) {
      return this.metrics.get(actionName);
    }
    return Object.fromEntries(this.metrics);
  }

  getExecutionHistory(limit: number = 100): ActionResult[] {
    return this.executionHistory.slice(-limit);
  }

  getStats(): {
    totalActions: number;
    totalExecutions: number;
    successRate: number;
    averageDuration: number;
    categories: Record<string, number>;
  } {
    const totalExecutions = Array.from(this.metrics.values()).reduce(
      (sum, m) => sum + m.executions,
      0
    );
    const totalSuccesses = Array.from(this.metrics.values()).reduce(
      (sum, m) => sum + m.successes,
      0
    );
    const averageDuration =
      totalExecutions > 0
        ? Array.from(this.metrics.values()).reduce(
            (sum, m) => sum + m.averageDuration * m.executions,
            0
          ) / totalExecutions
        : 0;

    const categories: Record<string, number> = {};
    for (const [category, actions] of this.categories.entries()) {
      categories[category] = actions.size;
    }

    return {
      totalActions: this.actions.size,
      totalExecutions,
      successRate: totalExecutions > 0 ? totalSuccesses / totalExecutions : 0,
      averageDuration,
      categories,
    };
  }

  clearHistory(): void {
    this.executionHistory = [];
    this.metrics.clear();

    // Reinitialize metrics
    for (const [name, handler] of this.actions.entries()) {
      if (this.config.enableMetrics) {
        this.metrics.set(name, {
          executions: 0,
          successes: 0,
          failures: 0,
          averageDuration: 0,
          lastExecution: null,
        });
      }
    }

    logger.info('Action registry history cleared');
  }
}
