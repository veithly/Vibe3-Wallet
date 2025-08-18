import { createLogger } from '@/utils/logger';

const logger = createLogger('ErrorHandler');

// Error classification
export interface ErrorClassification {
  type: ErrorType;
  severity: ErrorSeverity;
  category: ErrorCategory;
  recoverable: boolean;
  retryStrategy: RetryStrategy;
  estimatedRecoveryTime: number;
  userMessage: string;
  technicalDetails: string;
  timestamp?: number;
}

// Extended error classification for history storage
interface ErrorHistoryEntry extends ErrorClassification {
  timestamp: number;
}

// Error types
export type ErrorType = 
  | 'network_error'
  | 'timeout_error'
  | 'element_not_found'
  | 'permission_denied'
  | 'browser_api_error'
  | 'script_execution_error'
  | 'validation_error'
  | 'resource_unavailable'
  | 'user_interruption'
  | 'unknown_error';

// Error severity levels
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

// Error categories
export type ErrorCategory = 
  | 'temporary'      // Will likely resolve on its own
  | 'retriable'      // Can be fixed with retry
  | 'recoverable'    // Can be fixed with alternative approach
  | 'permanent'      // Cannot be fixed, must abort
  | 'user_action'    // Requires user intervention

// Retry strategies
export type RetryStrategy = 
  | 'immediate'       // Retry right away
  | 'delayed'        // Wait before retry
  | 'exponential'    // Exponential backoff
  | 'alternative'    // Try different approach
  | 'escalate'        // Escalate to user/system
  | 'abort'          // Stop execution

// Error context
export interface ErrorContext {
  operation: string;
  step: string;
  timestamp: number;
  environment: {
    url: string;
    userAgent: string;
    tabId?: number;
    extensionVersion: string;
  };
  execution: {
    stepNumber: number;
    totalSteps: number;
    retryAttempt: number;
    maxRetries: number;
  };
  additional?: Record<string, any>;
}

// Recovery action
export interface RecoveryAction {
  id: string;
  type: 'retry' | 'wait' | 'alternative' | 'skip' | 'escalate' | 'abort';
  description: string;
  params: Record<string, any>;
  estimatedDuration: number;
  confidence: number;
}

// Recovery result
export interface RecoveryResult {
  success: boolean;
  action: RecoveryAction;
  message: string;
  duration: number;
  error?: string;
  nextState?: 'retry' | 'continue' | 'skip' | 'abort';
}

/**
 * Enhanced Error Handler with recovery mechanisms
 */
export class EnhancedErrorHandler {
  private errorHistory: Map<string, ErrorHistoryEntry[]> = new Map();
  private recoveryStrategies: Map<string, RecoveryAction[]> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor() {
    this.initializeRecoveryStrategies();
    this.initializeCircuitBreakers();
  }

  /**
   * Handle and classify errors with recovery suggestions
   */
  async handleError(
    error: Error | string,
    context: ErrorContext
  ): Promise<{ classification: ErrorClassification; recoveryActions: RecoveryAction[] }> {
    try {
      const errorObj = typeof error === 'string' ? new Error(error) : error;
      
      logger.error('Handling error', {
        error: errorObj.message,
        operation: context.operation,
        step: context.step,
        severity: this.assessInitialSeverity(errorObj, context),
      });

      // Classify the error
      const classification = await this.classifyError(errorObj, context);
      
      // Store in error history
      this.storeErrorInHistory(context.operation, classification);

      // Check circuit breakers
      const circuitBreakerKey = this.getCircuitBreakerKey(context);
      const circuitBreaker = this.circuitBreakers.get(circuitBreakerKey);
      
      if (circuitBreaker && circuitBreaker.shouldTrip()) {
        logger.warn('Circuit breaker tripped', { circuitBreakerKey });
        return this.handleCircuitBreakerTrip(classification, context);
      }

      // Generate recovery actions
      const recoveryActions = this.generateRecoveryActions(classification, context);

      logger.info('Error classification completed', {
        type: classification.type,
        severity: classification.severity,
        recoverable: classification.recoverable,
        recoveryActionsCount: recoveryActions.length,
      });

      return {
        classification,
        recoveryActions,
      };

    } catch (handlingError) {
      logger.error('Error handling failed', handlingError);
      
      // Fallback classification
      const fallbackClassification: ErrorClassification = {
        type: 'unknown_error',
        severity: 'high',
        category: 'permanent',
        recoverable: false,
        retryStrategy: 'abort',
        estimatedRecoveryTime: 0,
        userMessage: 'An unexpected error occurred',
        technicalDetails: `Error handling failed: ${handlingError instanceof Error ? handlingError.message : 'Unknown'}`,
      };

      return {
        classification: fallbackClassification,
        recoveryActions: [{
          id: 'fallback_abort',
          type: 'abort',
          description: 'Abort due to error handling failure',
          params: {},
          estimatedDuration: 0,
          confidence: 1.0,
        }],
      };
    }
  }

  /**
   * Execute a recovery action
   */
  async executeRecovery(
    action: RecoveryAction,
    context: ErrorContext,
    executor: (action: RecoveryAction) => Promise<boolean>
  ): Promise<RecoveryResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Executing recovery action', {
        actionId: action.id,
        actionType: action.type,
        operation: context.operation,
      });

      // Validate action before execution
      if (!this.validateRecoveryAction(action, context)) {
        throw new Error(`Invalid recovery action: ${action.id}`);
      }

      // Execute the action
      const success = await executor(action);

      const duration = Date.now() - startTime;
      
      const result: RecoveryResult = {
        success,
        action,
        message: success ? 
          `Recovery action '${action.description}' completed successfully` :
          `Recovery action '${action.description}' failed`,
        duration,
        nextState: this.determineNextState(action, success, context),
      };

      logger.info('Recovery execution completed', {
        success,
        duration,
        nextState: result.nextState,
      });

      // Update circuit breakers
      this.updateCircuitBreakers(action, success, context);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Recovery execution failed', {
        actionId: action.id,
        error: error instanceof Error ? error.message : 'Unknown',
        duration,
      });

      return {
        success: false,
        action,
        message: `Recovery execution failed: ${error instanceof Error ? error.message : 'Unknown'}`,
        duration,
        error: error instanceof Error ? error.message : 'Unknown',
        nextState: 'abort',
      };
    }
  }

  /**
   * Monitor and adapt error handling based on patterns
   */
  analyzeErrorPatterns(operation: string): {
    errorFrequency: number;
    commonErrorTypes: ErrorType[];
    averageRecoveryTime: number;
    successRate: number;
    recommendations: string[];
  } {
    const history = this.errorHistory.get(operation) || [];
    
    if (history.length === 0) {
      return {
        errorFrequency: 0,
        commonErrorTypes: [],
        averageRecoveryTime: 0,
        successRate: 1.0,
        recommendations: ['No error history available'],
      };
    }

    // Calculate error frequency (errors per hour)
    const timeSpan = Date.now() - Math.min(...history.map(e => e.timestamp || Date.now()));
    const hours = Math.max(timeSpan / (1000 * 60 * 60), 1);
    const errorFrequency = history.length / hours;

    // Find common error types
    const typeCounts = new Map<ErrorType, number>();
    history.forEach(error => {
      typeCounts.set(error.type, (typeCounts.get(error.type) || 0) + 1);
    });

    const commonErrorTypes = Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type);

    // Calculate average recovery time
    const averageRecoveryTime = history.reduce((sum, error) => 
      sum + error.estimatedRecoveryTime, 0) / history.length;

    // Calculate success rate (recoverable errors / total errors)
    const recoverableCount = history.filter(error => error.recoverable).length;
    const successRate = recoverableCount / history.length;

    // Generate recommendations
    const recommendations = this.generateErrorPatternRecommendations(
      history,
      errorFrequency,
      successRate
    );

    return {
      errorFrequency,
      commonErrorTypes,
      averageRecoveryTime,
      successRate,
      recommendations,
    };
  }

  // Private helper methods

  private async classifyError(
    error: Error,
    context: ErrorContext
  ): Promise<ErrorClassification> {
    const errorMessage = error.message.toLowerCase();
    const errorStack = error.stack?.toLowerCase() || '';

    // Network errors
    if (errorMessage.includes('network') || 
        errorMessage.includes('fetch') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('timeout')) {
      return this.classifyNetworkError(error, context);
    }

    // Element not found errors
    if (errorMessage.includes('element') ||
        errorMessage.includes('selector') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('null')) {
      return this.classifyElementError(error, context);
    }

    // Permission errors
    if (errorMessage.includes('permission') ||
        errorMessage.includes('denied') ||
        errorMessage.includes('access')) {
      return {
        type: 'permission_denied',
        severity: 'high',
        category: 'user_action',
        recoverable: false,
        retryStrategy: 'escalate',
        estimatedRecoveryTime: 0,
        userMessage: 'Permission denied. Please check extension permissions.',
        technicalDetails: `Permission error: ${error.message}`,
      };
    }

    // Browser API errors
    if (errorMessage.includes('chrome') ||
        errorMessage.includes('browser') ||
        errorMessage.includes('extension')) {
      return this.classifyBrowserError(error, context);
    }

    // Script execution errors
    if (errorMessage.includes('script') ||
        errorMessage.includes('javascript') ||
        errorMessage.includes('execution')) {
      return {
        type: 'script_execution_error',
        severity: 'medium',
        category: 'retriable',
        recoverable: true,
        retryStrategy: 'delayed',
        estimatedRecoveryTime: 3000,
        userMessage: 'Script execution failed, retrying...',
        technicalDetails: `Script error: ${error.message}`,
      };
    }

    // Timeout errors
    if (errorMessage.includes('timeout') ||
        errorMessage.includes('time out')) {
      return {
        type: 'timeout_error',
        severity: 'medium',
        category: 'temporary',
        recoverable: true,
        retryStrategy: 'exponential',
        estimatedRecoveryTime: 5000,
        userMessage: 'Operation timed out, retrying with longer timeout...',
        technicalDetails: `Timeout error: ${error.message}`,
      };
    }

    // Default classification
    return {
      type: 'unknown_error',
      severity: 'medium',
      category: 'retriable',
      recoverable: true,
      retryStrategy: 'delayed',
      estimatedRecoveryTime: 2000,
      userMessage: 'An error occurred, attempting to recover...',
      technicalDetails: `Unknown error: ${error.message}`,
    };
  }

  private classifyNetworkError(error: Error, context: ErrorContext): ErrorClassification {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('timeout')) {
      return {
        type: 'timeout_error',
        severity: 'medium',
        category: 'temporary',
        recoverable: true,
        retryStrategy: 'exponential',
        estimatedRecoveryTime: 5000,
        userMessage: 'Network timeout, retrying...',
        technicalDetails: `Network timeout: ${error.message}`,
      };
    }

    if (errorMessage.includes('offline') || errorMessage.includes('disconnected')) {
      return {
        type: 'network_error',
        severity: 'high',
        category: 'user_action',
        recoverable: false,
        retryStrategy: 'escalate',
        estimatedRecoveryTime: 0,
        userMessage: 'Network connection lost. Please check your internet connection.',
        technicalDetails: `Network offline: ${error.message}`,
      };
    }

    return {
      type: 'network_error',
      severity: 'medium',
      category: 'temporary',
      recoverable: true,
      retryStrategy: 'exponential',
      estimatedRecoveryTime: 3000,
      userMessage: 'Network error, retrying...',
      technicalDetails: `Network error: ${error.message}`,
    };
  }

  private classifyElementError(error: Error, context: ErrorContext): ErrorClassification {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
      return {
        type: 'element_not_found',
        severity: 'medium',
        category: 'recoverable',
        recoverable: true,
        retryStrategy: 'alternative',
        estimatedRecoveryTime: 2000,
        userMessage: 'Element not found, trying alternative approach...',
        technicalDetails: `Element not found: ${error.message}`,
      };
    }

    return {
      type: 'element_not_found',
      severity: 'medium',
      category: 'retriable',
      recoverable: true,
      retryStrategy: 'delayed',
      estimatedRecoveryTime: 1000,
      userMessage: 'Element interaction failed, retrying...',
      technicalDetails: `Element error: ${error.message}`,
    };
  }

  private classifyBrowserError(error: Error, context: ErrorContext): ErrorClassification {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('permission') || errorMessage.includes('access')) {
      return {
        type: 'permission_denied',
        severity: 'high',
        category: 'user_action',
        recoverable: false,
        retryStrategy: 'escalate',
        estimatedRecoveryTime: 0,
        userMessage: 'Browser permission denied. Please check extension permissions.',
        technicalDetails: `Browser permission error: ${error.message}`,
      };
    }

    if (errorMessage.includes('not available') || errorMessage.includes('not supported')) {
      return {
        type: 'browser_api_error',
        severity: 'high',
        category: 'permanent',
        recoverable: false,
        retryStrategy: 'abort',
        estimatedRecoveryTime: 0,
        userMessage: 'Browser API not available in current environment.',
        technicalDetails: `Browser API error: ${error.message}`,
      };
    }

    return {
      type: 'browser_api_error',
      severity: 'medium',
      category: 'temporary',
      recoverable: true,
      retryStrategy: 'delayed',
      estimatedRecoveryTime: 2000,
      userMessage: 'Browser API error, retrying...',
      technicalDetails: `Browser API error: ${error.message}`,
    };
  }

  private generateRecoveryActions(
    classification: ErrorClassification,
    context: ErrorContext
  ): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    // Get predefined recovery strategies for this error type
    const strategies = this.recoveryStrategies.get(classification.type) || [];

    // Filter and adapt strategies based on context
    for (const strategy of strategies) {
      if (this.isStrategyApplicable(strategy, context)) {
        actions.push({
          ...strategy,
          id: `${strategy.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          confidence: this.calculateActionConfidence(strategy, classification, context),
        });
      }
    }

    // Add context-specific actions
    const contextActions = this.generateContextSpecificActions(classification, context);
    actions.push(...contextActions);

    // Sort by confidence
    actions.sort((a, b) => b.confidence - a.confidence);

    // Return top 3 actions
    return actions.slice(0, 3);
  }

  private generateContextSpecificActions(
    classification: ErrorClassification,
    context: ErrorContext
  ): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    // Add wait action for retryable errors
    if (classification.retryStrategy === 'delayed' || classification.retryStrategy === 'exponential') {
      actions.push({
        id: 'wait_and_retry',
        type: 'wait',
        description: 'Wait before retrying',
        params: { duration: classification.estimatedRecoveryTime },
        estimatedDuration: classification.estimatedRecoveryTime,
        confidence: 0.7,
      });
    }

    // Add page refresh for persistent errors
    if (context.execution.retryAttempt > 2 && classification.category === 'temporary') {
      actions.push({
        id: 'refresh_page',
        type: 'alternative',
        description: 'Refresh page and retry',
        params: { preserveState: false },
        estimatedDuration: 5000,
        confidence: 0.6,
      });
    }

    // Add skip action for non-critical steps
    if (classification.severity === 'low' && context.execution.stepNumber < context.execution.totalSteps - 1) {
      actions.push({
        id: 'skip_step',
        type: 'skip',
        description: 'Skip current step and continue',
        params: {},
        estimatedDuration: 0,
        confidence: 0.4,
      });
    }

    return actions;
  }

  private initializeRecoveryStrategies(): void {
    // Network error recovery
    this.recoveryStrategies.set('network_error', [
      {
        id: 'retry_network',
        type: 'retry',
        description: 'Retry network request',
        params: { maxRetries: 3, backoff: 'exponential' },
        estimatedDuration: 10000,
        confidence: 0.8,
      },
      {
        id: 'wait_network',
        type: 'wait',
        description: 'Wait for network recovery',
        params: { duration: 5000 },
        estimatedDuration: 5000,
        confidence: 0.6,
      },
    ]);

    // Element not found recovery
    this.recoveryStrategies.set('element_not_found', [
      {
        id: 'retry_element',
        type: 'retry',
        description: 'Retry element interaction',
        params: { alternativeSelectors: true },
        estimatedDuration: 3000,
        confidence: 0.7,
      },
      {
        id: 'scroll_to_element',
        type: 'alternative',
        description: 'Scroll and try to find element',
        params: { scrollDirection: 'down' },
        estimatedDuration: 2000,
        confidence: 0.6,
      },
      {
        id: 'wait_for_element',
        type: 'wait',
        description: 'Wait for element to appear',
        params: { duration: 3000 },
        estimatedDuration: 3000,
        confidence: 0.5,
      },
    ]);

    // Timeout error recovery
    this.recoveryStrategies.set('timeout_error', [
      {
        id: 'increase_timeout',
        type: 'retry',
        description: 'Retry with increased timeout',
        params: { timeoutMultiplier: 2 },
        estimatedDuration: 15000,
        confidence: 0.8,
      },
      {
        id: 'reduce_complexity',
        type: 'alternative',
        description: 'Try simpler approach',
        params: {},
        estimatedDuration: 5000,
        confidence: 0.6,
      },
    ]);

    // Permission denied recovery
    this.recoveryStrategies.set('permission_denied', [
      {
        id: 'request_permission',
        type: 'escalate',
        description: 'Request required permissions',
        params: {},
        estimatedDuration: 0,
        confidence: 0.9,
      },
    ]);
  }

  private initializeCircuitBreakers(): void {
    // Network circuit breaker
    this.circuitBreakers.set('network', new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
    }));

    // Element interaction circuit breaker
    this.circuitBreakers.set('element_interaction', new CircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 30000, // 30 seconds
      monitoringPeriod: 120000, // 2 minutes
    }));

    // Browser API circuit breaker
    this.circuitBreakers.set('browser_api', new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 120000, // 2 minutes
      monitoringPeriod: 600000, // 10 minutes
    }));
  }

  private assessInitialSeverity(error: Error, context: ErrorContext): ErrorSeverity {
    const errorMessage = error.message.toLowerCase();

    // Critical errors
    if (errorMessage.includes('critical') || 
        errorMessage.includes('fatal') ||
        errorMessage.includes('security')) {
      return 'critical';
    }

    // High severity errors
    if (errorMessage.includes('permission') ||
        errorMessage.includes('access denied') ||
        context.execution.stepNumber === 0) {
      return 'high';
    }

    // Medium severity errors
    if (errorMessage.includes('timeout') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('failed')) {
      return 'medium';
    }

    // Default to low severity
    return 'low';
  }

  private storeErrorInHistory(operation: string, classification: ErrorClassification): void {
    if (!this.errorHistory.has(operation)) {
      this.errorHistory.set(operation, []);
    }

    const history = this.errorHistory.get(operation)!;
    history.push({
      ...classification,
      timestamp: Date.now(),
    });

    // Keep only recent errors (last 50)
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
  }

  private getCircuitBreakerKey(context: ErrorContext): string {
    if (context.operation.includes('network') || context.operation.includes('fetch')) {
      return 'network';
    }
    if (context.operation.includes('element') || context.operation.includes('click')) {
      return 'element_interaction';
    }
    if (context.operation.includes('browser') || context.operation.includes('chrome')) {
      return 'browser_api';
    }
    return 'default';
  }

  private handleCircuitBreakerTrip(
    classification: ErrorClassification,
    context: ErrorContext
  ): { classification: ErrorClassification; recoveryActions: RecoveryAction[] } {
    logger.warn('Circuit breaker tripped, handling failure', {
      operation: context.operation,
      originalType: classification.type,
    });

    const modifiedClassification: ErrorClassification = {
      ...classification,
      severity: 'critical',
      category: 'permanent',
      recoverable: false,
      retryStrategy: 'abort',
      estimatedRecoveryTime: 0,
      userMessage: 'Service temporarily unavailable due to repeated failures',
      technicalDetails: `Circuit breaker tripped for ${context.operation}`,
    };

    return {
      classification: modifiedClassification,
      recoveryActions: [{
        id: 'circuit_breaker_abort',
        type: 'abort',
        description: 'Abort due to circuit breaker',
        params: {},
        estimatedDuration: 0,
        confidence: 1.0,
      }],
    };
  }

  private validateRecoveryAction(action: RecoveryAction, context: ErrorContext): boolean {
    // Check if we've exceeded retry limits
    if (action.type === 'retry' && context.execution.retryAttempt >= context.execution.maxRetries) {
      return false;
    }

    // Check if action is applicable to current context
    if (action.type === 'skip' && context.execution.stepNumber >= context.execution.totalSteps - 1) {
      return false; // Don't skip the last step
    }

    return true;
  }

  private determineNextState(
    action: RecoveryAction,
    success: boolean,
    context: ErrorContext
  ): 'retry' | 'continue' | 'skip' | 'abort' {
    if (!success) {
      return 'abort';
    }

    switch (action.type) {
      case 'retry':
        return 'retry';
      case 'skip':
        return 'skip';
      case 'alternative':
        return 'continue';
      case 'wait':
        return 'retry';
      case 'escalate':
        return 'abort';
      case 'abort':
        return 'abort';
      default:
        return 'continue';
    }
  }

  private updateCircuitBreakers(
    action: RecoveryAction,
    success: boolean,
    context: ErrorContext
  ): void {
    const circuitBreakerKey = this.getCircuitBreakerKey(context);
    const circuitBreaker = this.circuitBreakers.get(circuitBreakerKey);

    if (circuitBreaker) {
      if (success) {
        circuitBreaker.recordSuccess();
      } else {
        circuitBreaker.recordFailure();
      }
    }
  }

  private isStrategyApplicable(strategy: RecoveryAction, context: ErrorContext): boolean {
    // Check retry limits
    if (strategy.type === 'retry' && context.execution.retryAttempt >= 3) {
      return false;
    }

    // Check if we're at the last step (can't skip)
    if (strategy.type === 'skip' && context.execution.stepNumber >= context.execution.totalSteps - 1) {
      return false;
    }

    return true;
  }

  private calculateActionConfidence(
    strategy: RecoveryAction,
    classification: ErrorClassification,
    context: ErrorContext
  ): number {
    let confidence = strategy.confidence;

    // Reduce confidence based on retry attempts
    confidence *= Math.max(0.3, 1 - (context.execution.retryAttempt * 0.2));

    // Increase confidence for matching retry strategies
    if (strategy.type === 'retry' && classification.retryStrategy === 'immediate') {
      confidence *= 1.2;
    }

    // Adjust based on error severity
    const severityMultiplier = {
      'low': 1.2,
      'medium': 1.0,
      'high': 0.8,
      'critical': 0.5,
    }[classification.severity];

    confidence *= severityMultiplier;

    return Math.min(1.0, Math.max(0.1, confidence));
  }

  private generateErrorPatternRecommendations(
    history: ErrorClassification[],
    errorFrequency: number,
    successRate: number
  ): string[] {
    const recommendations: string[] = [];

    // High error frequency recommendations
    if (errorFrequency > 10) {
      recommendations.push('High error frequency detected. Consider implementing more robust error handling.');
    }

    // Low success rate recommendations
    if (successRate < 0.5) {
      recommendations.push('Low recovery success rate. Review and improve recovery strategies.');
    }

    // Common error type recommendations
    const commonTypes = this.getMostCommonErrorTypes(history, 3);
    for (const type of commonTypes) {
      switch (type) {
        case 'network_error':
          recommendations.push('Frequent network errors. Consider implementing offline support.');
          break;
        case 'element_not_found':
          recommendations.push('Frequent element not found errors. Improve element selection strategy.');
          break;
        case 'timeout_error':
          recommendations.push('Frequent timeout errors. Increase timeout values or optimize performance.');
          break;
      }
    }

    return recommendations;
  }

  private getMostCommonErrorTypes(history: ErrorClassification[], limit: number): ErrorType[] {
    const typeCounts = new Map<ErrorType, number>();
    
    history.forEach(error => {
      typeCounts.set(error.type, (typeCounts.get(error.type) || 0) + 1);
    });

    return Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([type]) => type);
  }
}

// Circuit breaker implementation
class CircuitBreaker {
  private failures: number[] = [];
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(private config: {
    failureThreshold: number;
    resetTimeout: number;
    monitoringPeriod: number;
  }) {}

  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailureTime = now;

    // Clean old failures
    const cutoff = now - this.config.monitoringPeriod;
    this.failures = this.failures.filter(time => time > cutoff);

    // Check if we should trip
    if (this.failures.length >= this.config.failureThreshold && this.state === 'closed') {
      this.trip();
    }
  }

  recordSuccess(): void {
    this.failures = [];
    
    if (this.state === 'half-open') {
      this.state = 'closed';
    }
  }

  shouldTrip(): boolean {
    // Reset if timeout has passed
    if (this.state === 'open' && Date.now() - this.lastFailureTime > this.config.resetTimeout) {
      this.state = 'half-open';
    }

    return this.state === 'open';
  }

  private trip(): void {
    this.state = 'open';
    logger.info('Circuit breaker tripped', {
      failureCount: this.failures.length,
      threshold: this.config.failureThreshold,
    });
  }

  getState(): string {
    return this.state;
  }

  getFailureCount(): number {
    return this.failures.length;
  }
}