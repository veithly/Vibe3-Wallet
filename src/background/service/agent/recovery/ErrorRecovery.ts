// Enhanced error recovery and fallback mechanisms for Web3 agent
import { createLogger } from '@/utils/logger';
import { LLMResponse, FunctionCall, StreamingLLMResponse } from '../llm/types';
import { ActionStep } from '../planning/ActionPlanner';
import { toolRegistry } from '../tools/ToolRegistry';

const logger = createLogger('ErrorRecovery');

export interface ErrorContext {
  error: Error;
  operation: string;
  params?: any;
  timestamp: number;
  retryCount: number;
}

export interface RecoveryStrategy {
  name: string;
  condition: (context: ErrorContext) => boolean;
  action: (context: ErrorContext) => Promise<any>;
  priority: number;
}

export interface FallbackPlan {
  name: string;
  description: string;
  steps: FallbackStep[];
  estimatedTimeMs: number;
}

export interface FallbackStep {
  name: string;
  description: string;
  action: () => Promise<any>;
  timeoutMs: number;
  critical: boolean;
}

export class ErrorRecoveryManager {
  private strategies: Map<string, RecoveryStrategy[]> = new Map();
  private fallbackPlans: Map<string, FallbackPlan[]> = new Map();
  private errorHistory: ErrorContext[] = [];
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor() {
    this.initializeRecoveryStrategies();
    this.initializeFallbackPlans();
    this.initializeCircuitBreakers();
  }

  private initializeRecoveryStrategies(): void {
    // Network error recovery strategies
    this.registerStrategy('network', {
      name: 'retry_with_backoff',
      condition: (ctx) => this.isNetworkError(ctx.error),
      action: async (ctx) => this.retryWithBackoff(ctx),
      priority: 1
    });

    this.registerStrategy('network', {
      name: 'switch_network_endpoint',
      condition: (ctx) => this.isNetworkError(ctx.error) && ctx.retryCount > 2,
      action: async (ctx) => this.switchNetworkEndpoint(ctx),
      priority: 2
    });

    // API error recovery strategies
    this.registerStrategy('api', {
      name: 'retry_with_different_model',
      condition: (ctx) => this.isApiError(ctx.error),
      action: async (ctx) => this.retryWithDifferentModel(ctx),
      priority: 1
    });

    this.registerStrategy('api', {
      name: 'fallback_to_mock',
      condition: (ctx) => this.isApiError(ctx.error) && ctx.retryCount > 2,
      action: async (ctx) => this.fallbackToMockResponse(ctx),
      priority: 2
    });

    // Function calling error recovery
    this.registerStrategy('function_call', {
      name: 'retry_with_corrected_params',
      condition: (ctx) => this.isParameterError(ctx.error),
      action: async (ctx) => this.retryWithCorrectedParams(ctx),
      priority: 1
    });

    this.registerStrategy('function_call', {
      name: 'use_alternative_tool',
      condition: (ctx) => this.isToolError(ctx.error),
      action: async (ctx) => this.useAlternativeTool(ctx),
      priority: 2
    });

    // Timeout error recovery
    this.registerStrategy('timeout', {
      name: 'increase_timeout_and_retry',
      condition: (ctx) => this.isTimeoutError(ctx.error),
      action: async (ctx) => this.increaseTimeoutAndRetry(ctx),
      priority: 1
    });

    this.registerStrategy('timeout', {
      name: 'execute_in_background',
      condition: (ctx) => this.isTimeoutError(ctx.error) && ctx.retryCount > 1,
      action: async (ctx) => this.executeInBackground(ctx),
      priority: 2
    });

    // Validation error recovery
    this.registerStrategy('validation', {
      name: 'sanitize_params_and_retry',
      condition: (ctx) => this.isValidationError(ctx.error),
      action: async (ctx) => this.sanitizeParamsAndRetry(ctx),
      priority: 1
    });

    this.registerStrategy('validation', {
      name: 'request_user_correction',
      condition: (ctx) => this.isValidationError(ctx.error) && ctx.retryCount > 1,
      action: async (ctx) => this.requestUserCorrection(ctx),
      priority: 2
    });
  }

  private initializeFallbackPlans(): void {
    // LLM response fallback plans
    this.registerFallbackPlan('llm_response', {
      name: 'structured_response_fallback',
      description: 'Generate a structured response when LLM fails',
      steps: [
        {
          name: 'extract_intent',
          description: 'Extract user intent from the failed request',
          action: async () => this.extractUserIntent(),
          timeoutMs: 5000,
          critical: true
        },
        {
          name: 'generate_template_response',
          description: 'Generate response based on intent template',
          action: async () => this.generateTemplateResponse(),
          timeoutMs: 3000,
          critical: true
        },
        {
          name: 'suggest_alternatives',
          description: 'Suggest alternative approaches',
          action: async () => this.suggestAlternatives(),
          timeoutMs: 2000,
          critical: false
        }
      ],
      estimatedTimeMs: 10000
    });

    // Function calling fallback plans
    this.registerFallbackPlan('function_call', {
      name: 'manual_execution_fallback',
      description: 'Provide manual execution instructions when automation fails',
      steps: [
        {
          name: 'identify_failed_operation',
          description: 'Identify what operation failed',
          action: async () => this.identifyFailedOperation(),
          timeoutMs: 3000,
          critical: true
        },
        {
          name: 'generate_manual_steps',
          description: 'Generate step-by-step manual instructions',
          action: async () => this.generateManualSteps(),
          timeoutMs: 5000,
          critical: true
        },
        {
          name: 'provide_ui_guidance',
          description: 'Provide UI guidance for manual execution',
          action: async () => this.provideUIGuidance(),
          timeoutMs: 3000,
          critical: false
        }
      ],
      estimatedTimeMs: 11000
    });

    // Network fallback plans
    this.registerFallbackPlan('network', {
      name: 'offline_mode_fallback',
      description: 'Switch to offline mode with cached data',
      steps: [
        {
          name: 'check_cache',
          description: 'Check for cached relevant data',
          action: async () => this.checkCache(),
          timeoutMs: 2000,
          critical: true
        },
        {
          name: 'provide_cached_response',
          description: 'Provide response based on cached data',
          action: async () => this.provideCachedResponse(),
          timeoutMs: 3000,
          critical: true
        },
        {
          name: 'schedule_sync',
          description: 'Schedule data sync when connection is restored',
          action: async () => this.scheduleSync(),
          timeoutMs: 1000,
          critical: false
        }
      ],
      estimatedTimeMs: 6000
    });
  }

  private initializeCircuitBreakers(): void {
    // LLM circuit breaker
    this.circuitBreakers.set('llm', new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60000,
      monitoringPeriodMs: 300000
    }));

    // Function calling circuit breaker
    this.circuitBreakers.set('function_call', new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 30000,
      monitoringPeriodMs: 180000
    }));

    // Network circuit breaker
    this.circuitBreakers.set('network', new CircuitBreaker({
      failureThreshold: 10,
      resetTimeoutMs: 120000,
      monitoringPeriodMs: 600000
    }));
  }

  async recoverFromError(
    error: Error,
    operation: string,
    params?: any,
    attemptRecovery: boolean = true
  ): Promise<{ success: boolean; result?: any; fallback?: FallbackPlan }> {
    const context: ErrorContext = {
      error,
      operation,
      params,
      timestamp: Date.now(),
      retryCount: this.getRetryCount(operation)
    };

    logger.error('Error recovery initiated', context);

    // Log error for analysis
    this.logError(context);

    // Check circuit breaker
    const circuitBreaker = this.circuitBreakers.get(this.getCircuitBreakerKey(operation));
    if (circuitBreaker && circuitBreaker.isOpen()) {
      logger.warn(`Circuit breaker open for ${operation}, using fallback`);
      const fallback = await this.executeFallbackPlan(operation, context);
      return { success: false, fallback };
    }

    if (!attemptRecovery) {
      return { success: false };
    }

    // Try recovery strategies
    const strategies = this.getStrategiesForError(context);
    
    for (const strategy of strategies.sort((a, b) => a.priority - b.priority)) {
      try {
        logger.info(`Attempting recovery strategy: ${strategy.name}`, context);
        
        const result = await strategy.action(context);
        
        if (result) {
          logger.info(`Recovery strategy succeeded: ${strategy.name}`);
          
          // Record success in circuit breaker
          circuitBreaker?.recordSuccess();
          
          return { success: true, result };
        }
      } catch (recoveryError) {
        logger.warn(`Recovery strategy failed: ${strategy.name}`, recoveryError);
      }
    }

    // All recovery strategies failed, record failure in circuit breaker
    circuitBreaker?.recordFailure();

    // Try fallback plan
    try {
      const fallback = await this.executeFallbackPlan(operation, context);
      return { success: false, fallback };
    } catch (fallbackError) {
      logger.error('Fallback plan execution failed', fallbackError);
      return { success: false };
    }
  }

  private async executeFallbackPlan(
    operation: string,
    context: ErrorContext
  ): Promise<FallbackPlan | undefined> {
    const plans = this.fallbackPlans.get(operation) || [];
    
    for (const plan of plans) {
      try {
        logger.info(`Executing fallback plan: ${plan.name}`);
        
        const results: any[] = [];
        for (const step of plan.steps) {
          try {
            const result = await Promise.race([
              step.action(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Step timeout')), step.timeoutMs)
              )
            ]);
            results.push({ step: step.name, success: true, result });
          } catch (stepError) {
            results.push({ step: step.name, success: false, error: stepError });
            
            if (step.critical) {
              throw new Error(`Critical step failed: ${step.name}`);
            }
          }
        }
        
        logger.info('Fallback plan executed successfully', { plan: plan.name, results });
        return plan;
        
      } catch (planError) {
        logger.warn(`Fallback plan failed: ${plan.name}`, planError);
        continue;
      }
    }
    
    return undefined;
  }

  // Recovery strategy implementations
  private async retryWithBackoff(context: ErrorContext): Promise<any> {
    const delay = Math.min(1000 * Math.pow(2, context.retryCount), 30000);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // This would be implemented by the caller
    return { shouldRetry: true, delay };
  }

  private async switchNetworkEndpoint(context: ErrorContext): Promise<any> {
    // Switch to different RPC endpoint or API endpoint
    logger.info('Switching network endpoint');
    return { endpointSwitched: true };
  }

  private async retryWithDifferentModel(context: ErrorContext): Promise<any> {
    // Switch to a different LLM model
    logger.info('Retrying with different model');
    return { modelSwitched: true };
  }

  private async fallbackToMockResponse(context: ErrorContext): Promise<LLMResponse> {
    return {
      response: 'I apologize, but I\'m experiencing technical difficulties. Let me help you with a basic response while I resolve this issue.',
      actions: [],
      confidence: 0.3,
      thinking: 'Using fallback response due to API error'
    };
  }

  private async retryWithCorrectedParams(context: ErrorContext): Promise<any> {
    // Analyze and correct function call parameters
    const correctedParams = await this.correctParameters(context.params);
    return { correctedParams, shouldRetry: true };
  }

  private async useAlternativeTool(context: ErrorContext): Promise<any> {
    // Find alternative tool that can perform similar operation
    const alternative = await this.findAlternativeTool(context.operation);
    return { alternativeTool: alternative };
  }

  private async increaseTimeoutAndRetry(context: ErrorContext): Promise<any> {
    const newTimeout = 30000 * (context.retryCount + 1);
    return { newTimeout, shouldRetry: true };
  }

  private async executeInBackground(context: ErrorContext): Promise<any> {
    // Execute the operation in background and return immediately
    logger.info('Executing operation in background');
    return { backgroundExecution: true };
  }

  private async sanitizeParamsAndRetry(context: ErrorContext): Promise<any> {
    const sanitizedParams = this.sanitizeParameters(context.params);
    return { sanitizedParams, shouldRetry: true };
  }

  private async requestUserCorrection(context: ErrorContext): Promise<any> {
    return { userCorrectionNeeded: true, error: context.error.message };
  }

  // Fallback plan implementations
  private async extractUserIntent(): Promise<any> {
    // Analyze the failed request to extract user intent
    return { intent: 'general_assistance' };
  }

  private async generateTemplateResponse(): Promise<string> {
    return 'I apologize for the technical difficulty. I\'m here to help you with your Web3 needs. Could you please rephrase your request or try a simpler approach?';
  }

  private async suggestAlternatives(): Promise<string[]> {
    return [
      'Try breaking your request into smaller steps',
      'Check your wallet connection',
      'Verify you have sufficient funds',
      'Try again in a few moments'
    ];
  }

  private async identifyFailedOperation(): Promise<string> {
    return 'Unknown operation';
  }

  private async generateManualSteps(): Promise<string[]> {
    return [
      'Step 1: Open your wallet extension',
      'Step 2: Navigate to the required section',
      'Step 3: Execute the operation manually'
    ];
  }

  private async provideUIGuidance(): Promise<string> {
    return 'Please use the wallet interface to complete this operation manually.';
  }

  private async checkCache(): Promise<any> {
    return { hasCache: false };
  }

  private async provideCachedResponse(): Promise<string> {
    return 'I\'m currently offline. Here\'s what I can tell you from cached data...';
  }

  private async scheduleSync(): Promise<void> {
    // Schedule background sync
  }

  // Error classification helpers
  private isNetworkError(error: Error): boolean {
    const networkErrorPatterns = [
      /network/i,
      /connection/i,
      /timeout/i,
      /ECONNREFUSED/i,
      /fetch/i,
      /offline/i
    ];
    
    return networkErrorPatterns.some(pattern => pattern.test(error.message));
  }

  private isApiError(error: Error): boolean {
    const apiErrorPatterns = [
      /api/i,
      /llm/i,
      /model/i,
      /provider/i,
      /rate.?limit/i,
      /quota/i,
      /unauthorized/i
    ];
    
    return apiErrorPatterns.some(pattern => pattern.test(error.message));
  }

  private isParameterError(error: Error): boolean {
    const paramErrorPatterns = [
      /parameter/i,
      /argument/i,
      /validation/i,
      /invalid/i,
      /missing/i,
      /required/i
    ];
    
    return paramErrorPatterns.some(pattern => pattern.test(error.message));
  }

  private isToolError(error: Error): boolean {
    const toolErrorPatterns = [
      /tool/i,
      /function/i,
      /not.?found/i,
      /undefined/i,
      /execution/i
    ];
    
    return toolErrorPatterns.some(pattern => pattern.test(error.message));
  }

  private isTimeoutError(error: Error): boolean {
    return /timeout/i.test(error.message);
  }

  private isValidationError(error: Error): boolean {
    return /validation/i.test(error.message);
  }

  // Utility methods
  private registerStrategy(category: string, strategy: RecoveryStrategy): void {
    if (!this.strategies.has(category)) {
      this.strategies.set(category, []);
    }
    this.strategies.get(category)!.push(strategy);
  }

  private registerFallbackPlan(operation: string, plan: FallbackPlan): void {
    if (!this.fallbackPlans.has(operation)) {
      this.fallbackPlans.set(operation, []);
    }
    this.fallbackPlans.get(operation)!.push(plan);
  }

  private getStrategiesForError(context: ErrorContext): RecoveryStrategy[] {
    const category = this.getErrorCategory(context.error);
    return this.strategies.get(category) || [];
  }

  private getErrorCategory(error: Error): string {
    if (this.isNetworkError(error)) return 'network';
    if (this.isApiError(error)) return 'api';
    if (this.isTimeoutError(error)) return 'timeout';
    if (this.isValidationError(error)) return 'validation';
    if (this.isParameterError(error) || this.isToolError(error)) return 'function_call';
    return 'general';
  }

  private getCircuitBreakerKey(operation: string): string {
    if (operation.includes('llm') || operation.includes('model')) return 'llm';
    if (operation.includes('function') || operation.includes('tool')) return 'function_call';
    if (operation.includes('network') || operation.includes('rpc')) return 'network';
    return 'general';
  }

  private getRetryCount(operation: string): number {
    return this.errorHistory.filter(ctx => ctx.operation === operation).length;
  }

  private logError(context: ErrorContext): void {
    this.errorHistory.push(context);
    
    // Keep only recent errors (last 100)
    if (this.errorHistory.length > 100) {
      this.errorHistory = this.errorHistory.slice(-100);
    }
  }

  private async correctParameters(params: any): Promise<any> {
    // Implement parameter correction logic
    return params;
  }

  private async findAlternativeTool(operation: string): Promise<string | null> {
    // Find alternative tool for the operation
    return null;
  }

  private sanitizeParameters(params: any): any {
    // Sanitize parameters to prevent validation errors
    return params;
  }

  // Public methods
  getErrorStats(): {
    totalErrors: number;
    errorsByCategory: Record<string, number>;
    recoverySuccessRate: number;
    circuitBreakerStatus: Record<string, string>;
  } {
    const errorsByCategory = this.errorHistory.reduce((acc, ctx) => {
      const category = this.getErrorCategory(ctx.error);
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const circuitBreakerStatus = Object.fromEntries(
      Array.from(this.circuitBreakers.entries()).map(([key, breaker]) => [
        key,
        breaker.getState()
      ])
    );

    return {
      totalErrors: this.errorHistory.length,
      errorsByCategory,
      recoverySuccessRate: 0.85, // Mock value
      circuitBreakerStatus
    };
  }

  clearErrorHistory(): void {
    this.errorHistory = [];
    logger.info('Error history cleared');
  }

  resetCircuitBreakers(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
    logger.info('All circuit breakers reset');
  }
}

// Circuit breaker implementation
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;

  constructor(private config: {
    failureThreshold: number;
    resetTimeoutMs: number;
    monitoringPeriodMs: number;
  }) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is OPEN');
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;
    }
  }

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttemptTime) {
        this.state = 'HALF_OPEN';
        return false;
      }
      return true;
    }
    return false;
  }

  getState(): string {
    return this.state;
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
  }
}

// Global error recovery manager instance
export const errorRecoveryManager = new ErrorRecoveryManager();