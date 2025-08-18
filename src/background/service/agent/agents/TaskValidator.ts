import { z } from 'zod';
import { IWeb3LLM, Web3Context, LLMResponse } from '../llm/types';
import { HumanMessage, SystemMessage } from '../llm/messages';
import { ValidationResult, ValidationResultSchema } from './MultiAgentSystem';
import { createLogger } from '@/utils/logger';

const logger = createLogger('TaskValidator');

// Validation criteria
export interface ValidationCriteria {
  type: 'completion' | 'element_exists' | 'content_contains' | 'url_changed' | 'form_submitted';
  target?: string; // URL, element selector, text content, etc.
  expectedValue?: string | boolean | number;
  timeout?: number;
  confidence?: number;
}

// Validation context
export interface ValidationContext {
  originalInstruction: string;
  executedSteps: string[];
  currentUrl: string;
  executionResults: Array<{
    step: string;
    success: boolean;
    result?: any;
    error?: string;
    timestamp: number;
  }>;
  pageElements?: any[];
  screenshots?: string[];
  context: Web3Context;
}

// Retry strategy
export interface RetryStrategy {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  retryConditions: string[];
}

// Validation result with retry information
export interface ValidationResultWithRetry extends ValidationResult {
  retryAttempt: number;
  nextRetryDelay?: number;
  suggestedActions?: string[];
}

/**
 * Comprehensive Task Validator with retry logic
 */
export class TaskValidator {
  private llm: IWeb3LLM;
  private validationHistory: Map<string, ValidationResult[]> = new Map();
  private retryStrategies: Map<string, RetryStrategy> = new Map();

  constructor(llm: IWeb3LLM) {
    this.llm = llm;
    this.initializeRetryStrategies();
  }

  /**
   * Validate task completion with comprehensive checks
   */
  async validateTask(
    instruction: string,
    context: ValidationContext,
    criteria?: ValidationCriteria[]
  ): Promise<ValidationResultWithRetry> {
    try {
      logger.info('Starting task validation', {
        instruction,
        stepsExecuted: context.executedSteps.length,
        currentUrl: context.currentUrl,
      });

      // Auto-determine validation criteria if not provided
      const validationCriteria = criteria || this.determineValidationCriteria(instruction, context);

      // Perform multiple validation checks
      const results: ValidationResult[] = [];

      for (const criterion of validationCriteria) {
        const result = await this.validateCriterion(criterion, context);
        results.push(result);
      }

      // Aggregate results
      const aggregated = this.aggregateValidationResults(results, context);

      // Determine if we should retry
      const retryDecision = this.shouldRetry(aggregated, context);

      logger.info('Task validation completed', {
        isValid: aggregated.isValid,
        confidence: aggregated.confidence,
        shouldRetry: retryDecision.shouldRetry,
        retryAttempt: retryDecision.retryAttempt,
      });

      return {
        ...aggregated,
        retryAttempt: retryDecision.retryAttempt,
        nextRetryDelay: retryDecision.nextDelay,
        suggestedActions: retryDecision.suggestedActions,
      };

    } catch (error) {
      logger.error('Task validation failed', error);
      
      return {
        isValid: false,
        confidence: 0,
        message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        shouldRetry: true,
        retryStrategy: 'delayed',
        retryAttempt: 0,
        nextRetryDelay: 3000,
        suggestedActions: ['Wait and retry validation', 'Check if page is still responsive'],
      } as ValidationResultWithRetry;
    }
  }

  /**
   * Validate a single criterion
   */
  private async validateCriterion(
    criterion: ValidationCriteria,
    context: ValidationContext
  ): Promise<ValidationResult> {
    try {
      switch (criterion.type) {
        case 'completion':
          return await this.validateTaskCompletion(criterion, context);
        case 'element_exists':
          return await this.validateElementExists(criterion, context);
        case 'content_contains':
          return await this.validateContentContains(criterion, context);
        case 'url_changed':
          return await this.validateUrlChanged(criterion, context);
        case 'form_submitted':
          return await this.validateFormSubmitted(criterion, context);
        default:
          throw new Error(`Unknown validation criterion type: ${criterion.type}`);
      }
    } catch (error) {
      logger.error('Criterion validation failed', { criterion, error });
      
      return {
        isValid: false,
        confidence: 0,
        message: `Criterion validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        shouldRetry: true,
        retryStrategy: 'delayed',
      };
    }
  }

  /**
   * Validate overall task completion using AI analysis
   */
  private async validateTaskCompletion(
    criterion: ValidationCriteria,
    context: ValidationContext
  ): Promise<ValidationResult> {
    try {
      const prompt = this.createCompletionValidationPrompt(context);
      const response = await this.llm.generateResponse(
        [
          new SystemMessage(prompt.systemPrompt),
          new HumanMessage(prompt.userPrompt),
        ],
        context.context
      );

      return this.parseValidationResponse(response.response);

    } catch (error) {
      logger.error('Task completion validation failed', error);
      
      // Fallback to simple heuristic validation
      return this.fallbackCompletionValidation(context);
    }
  }

  /**
   * Validate that an element exists on the page
   */
  private async validateElementExists(
    criterion: ValidationCriteria,
    context: ValidationContext
  ): Promise<ValidationResult> {
    try {
      if (!criterion.target) {
        throw new Error('Element target is required for element_exists validation');
      }

      // Check if we have page elements
      if (!context.pageElements || context.pageElements.length === 0) {
        return {
          isValid: false,
          confidence: 0.3,
          message: 'No page elements available for validation',
          shouldRetry: true,
          retryStrategy: 'delayed',
        };
      }

      // Search for element by text or selector
      const targetLower = criterion.target.toLowerCase();
      const foundElements = context.pageElements.filter(element => 
        element.text.toLowerCase().includes(targetLower) ||
        element.tagName.toLowerCase().includes(targetLower) ||
        (element.attributes && Object.values(element.attributes).some((attr: any) => 
          String(attr).toLowerCase().includes(targetLower)
        ))
      );

      const isValid = foundElements.length > 0;
      const confidence = Math.min(0.9, foundElements.length * 0.3);

      return {
        isValid,
        confidence,
        message: isValid ? 
          `Found ${foundElements.length} matching elements for "${criterion.target}"` :
          `No elements found matching "${criterion.target}"`,
        shouldRetry: !isValid && confidence < 0.5,
        retryStrategy: 'alternative',
      };

    } catch (error) {
      logger.error('Element existence validation failed', error);
      
      return {
        isValid: false,
        confidence: 0,
        message: `Element validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        shouldRetry: true,
        retryStrategy: 'delayed',
      };
    }
  }

  /**
   * Validate that page contains specific content
   */
  private async validateContentContains(
    criterion: ValidationCriteria,
    context: ValidationContext
  ): Promise<ValidationResult> {
    try {
      if (!criterion.target) {
        throw new Error('Content target is required for content_contains validation');
      }

      // Extract page content from execution results
      const pageContent = this.extractPageContent(context);
      const targetLower = criterion.target.toLowerCase();

      const containsContent = pageContent.toLowerCase().includes(targetLower);
      const confidence = containsContent ? 0.8 : 0.2;

      return {
        isValid: containsContent,
        confidence,
        message: containsContent ?
          `Page contains target content: "${criterion.target}"` :
          `Page does not contain target content: "${criterion.target}"`,
        shouldRetry: !containsContent,
        retryStrategy: 'delayed',
      };

    } catch (error) {
      logger.error('Content validation failed', error);
      
      return {
        isValid: false,
        confidence: 0,
        message: `Content validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        shouldRetry: true,
        retryStrategy: 'delayed',
      };
    }
  }

  /**
   * Validate that URL has changed as expected
   */
  private async validateUrlChanged(
    criterion: ValidationCriteria,
    context: ValidationContext
  ): Promise<ValidationResult> {
    try {
      const targetUrl = criterion.target;
      const currentUrl = context.currentUrl;

      if (!targetUrl) {
        throw new Error('Target URL is required for url_changed validation');
      }

      // Check if URL matches or contains target
      const urlMatches = currentUrl === targetUrl || currentUrl.includes(targetUrl);
      const confidence = urlMatches ? 0.95 : 0.3;

      return {
        isValid: urlMatches,
        confidence,
        message: urlMatches ?
          `URL matches expected: ${currentUrl}` :
          `URL does not match expected. Current: ${currentUrl}, Expected: ${targetUrl}`,
        shouldRetry: !urlMatches,
        retryStrategy: 'delayed',
      };

    } catch (error) {
      logger.error('URL validation failed', error);
      
      return {
        isValid: false,
        confidence: 0,
        message: `URL validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        shouldRetry: true,
        retryStrategy: 'delayed',
      };
    }
  }

  /**
   * Validate that a form was submitted successfully
   */
  private async validateFormSubmitted(
    criterion: ValidationCriteria,
    context: ValidationContext
  ): Promise<ValidationResult> {
    try {
      // Check for form submission indicators
      const pageContent = this.extractPageContent(context);
      const submissionIndicators = [
        'thank you',
        'success',
        'submitted',
        'complete',
        'confirmation',
        'your form has been',
      ];

      const hasSuccessIndicator = submissionIndicators.some(indicator =>
        pageContent.toLowerCase().includes(indicator)
      );

      // Check if URL changed (common after form submission)
      const urlChanged = context.executionResults.some(result =>
        result.step.includes('navigate') && result.success
      );

      const isValid = hasSuccessIndicator || urlChanged;
      const confidence = hasSuccessIndicator ? 0.8 : (urlChanged ? 0.6 : 0.3);

      return {
        isValid,
        confidence,
        message: isValid ?
          `Form submission detected (${hasSuccessIndicator ? 'success message' : 'URL change'})` :
          'No form submission indicators found',
        shouldRetry: !isValid,
        retryStrategy: 'delayed',
      };

    } catch (error) {
      logger.error('Form submission validation failed', error);
      
      return {
        isValid: false,
        confidence: 0,
        message: `Form validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        shouldRetry: true,
        retryStrategy: 'delayed',
      };
    }
  }

  // Helper methods

  private determineValidationCriteria(
    instruction: string,
    context: ValidationContext
  ): ValidationCriteria[] {
    const criteria: ValidationCriteria[] = [];

    // Always include task completion validation
    criteria.push({
      type: 'completion',
      confidence: 0.8,
    });

    // URL-based validation if instruction contains URL
    const urlMatch = instruction.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      criteria.push({
        type: 'url_changed',
        target: urlMatch[0],
        confidence: 0.7,
      });
    }

    // Content-based validation for specific keywords
    const contentKeywords = [
      'follow', 'unfollow', 'like', 'share', 'post', 'comment',
      'submit', 'send', 'buy', 'sell', 'swap', 'transfer',
    ];

    for (const keyword of contentKeywords) {
      if (instruction.toLowerCase().includes(keyword)) {
        criteria.push({
          type: 'content_contains',
          target: keyword,
          confidence: 0.6,
        });
        break; // Only add one content validation
      }
    }

    // Element existence validation for interactive actions
    const interactiveActions = ['click', 'fill', 'input', 'select'];
    if (interactiveActions.some(action => instruction.toLowerCase().includes(action))) {
      criteria.push({
        type: 'element_exists',
        target: this.extractTargetElement(instruction),
        confidence: 0.5,
      });
    }

    return criteria;
  }

  private createCompletionValidationPrompt(
    context: ValidationContext
  ): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are an expert at validating whether web automation tasks have been completed successfully.

Your job is to analyze the execution results and determine if the original task was completed.

VALIDATION CRITERIA:
1. Task Completion: Did the main objective get accomplished?
2. Page State: Is the page in the expected state?
3. User Experience: Would a human consider this task done?
4. Error Handling: Were there any critical failures?

RESPONSE FORMAT:
{
  "isValid": true/false,
  "confidence": 0.8,
  "message": "Clear explanation of validation result",
  "shouldRetry": true/false,
  "retryStrategy": "immediate|delayed|alternative",
  "suggestions": ["suggestion1", "suggestion2"]
}

CONFIDENCE LEVELS:
- 0.9-1.0: Very confident, clear success/failure indicators
- 0.7-0.8: Moderately confident, some ambiguity
- 0.5-0.6: Low confidence, unclear result
- 0.0-0.4: Very uncertain, needs retry`;

    const executionSummary = context.executionResults.map(result =>
      `${result.step}: ${result.success ? 'SUCCESS' : 'FAILED'} ${result.error ? `(${result.error})` : ''}`
    ).join('\\n');

    const userPrompt = `Validate if this task was completed successfully:

Original instruction: "${context.originalInstruction}"

Current context:
- Current URL: ${context.currentUrl}
- Steps executed: ${context.executedSteps.length}
- Execution results: ${executionSummary}

Page content summary: ${this.extractPageContent(context).substring(0, 500)}...

Analyze the results and determine if the task was completed successfully. Consider both explicit success indicators and overall task achievement.`;

    return { systemPrompt, userPrompt };
  }

  private parseValidationResponse(response: string): ValidationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in validation response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const validated = ValidationResultSchema.parse(parsed);

      return validated;
    } catch (error) {
      logger.error('Failed to parse validation response', { response, error });
      throw new Error(`Invalid validation response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private aggregateValidationResults(
    results: ValidationResult[],
    context: ValidationContext
  ): ValidationResult {
    if (results.length === 0) {
      return {
        isValid: false,
        confidence: 0,
        message: 'No validation results available',
        shouldRetry: true,
        retryStrategy: 'delayed',
      };
    }

    // Weighted aggregation based on confidence
    let weightedScore = 0;
    let totalWeight = 0;
    const messages: string[] = [];
    const suggestions: string[] = [];

    for (const result of results) {
      const weight = result.confidence;
      weightedScore += (result.isValid ? 1 : 0) * weight;
      totalWeight += weight;
      
      if (result.message) {
        messages.push(result.message);
      }
      
      if (result.suggestions) {
        suggestions.push(...result.suggestions);
      }
    }

    const overallConfidence = totalWeight > 0 ? weightedScore / totalWeight : 0;
    const isValid = overallConfidence >= 0.6; // 60% threshold for success

    return {
      isValid,
      confidence: overallConfidence,
      message: messages.join('; ') || 'Validation completed',
      shouldRetry: !isValid && overallConfidence > 0.2,
      retryStrategy: this.determineRetryStrategy(results, context),
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  private shouldRetry(
    result: ValidationResult,
    context: ValidationContext
  ): { shouldRetry: boolean; retryAttempt: number; nextDelay?: number; suggestedActions?: string[] } {
    const previousAttempts = this.validationHistory.get(context.originalInstruction) || [];
    const retryAttempt = previousAttempts.length;

    // Don't retry if validation passed
    if (result.isValid) {
      return { shouldRetry: false, retryAttempt };
    }

    // Don't retry if we've exceeded max attempts
    if (retryAttempt >= 3) {
      return { shouldRetry: false, retryAttempt };
    }

    // Don't retry if confidence is very low (likely impossible)
    if (result.confidence < 0.2) {
      return { shouldRetry: false, retryAttempt };
    }

    // Calculate retry delay based on attempt number
    const baseDelay = 2000;
    const backoffMultiplier = 2;
    const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, retryAttempt), 30000);

    return {
      shouldRetry: true,
      retryAttempt,
      nextDelay: delay,
      suggestedActions: result.suggestions || ['Wait and retry validation'],
    };
  }

  private determineRetryStrategy(
    results: ValidationResult[],
    context: ValidationContext
  ): 'immediate' | 'delayed' | 'alternative' {
    const failedResults = results.filter(r => !r.isValid);
    
    // If most failures suggest alternative approach, use alternative
    const alternativeSuggestions = failedResults.filter(r => r.retryStrategy === 'alternative').length;
    if (alternativeSuggestions > failedResults.length / 2) {
      return 'alternative';
    }

    // If we have some success, retry immediately
    const successfulResults = results.filter(r => r.isValid).length;
    if (successfulResults > 0) {
      return 'immediate';
    }

    // Default to delayed retry
    return 'delayed';
  }

  private extractPageContent(context: ValidationContext): string {
    // Try to extract content from execution results
    for (const result of context.executionResults) {
      if (result.result && typeof result.result === 'object') {
        if (result.result.content || result.result.text) {
          return result.result.content || result.result.text;
        }
        if (result.result.data && result.result.data.content) {
          return result.result.data.content;
        }
      }
    }

    // Fallback to empty string
    return '';
  }

  private extractTargetElement(instruction: string): string {
    // Extract potential element targets from instruction
    const patterns = [
      /click\s+(?:on\s+)?([a-zA-Z\s]+)/i,
      /fill\s+(?:the\s+)?([a-zA-Z\s]+)/i,
      /input\s+(?:into\s+)?([a-zA-Z\s]+)/i,
      /find\s+([a-zA-Z\s]+)/i,
    ];

    for (const pattern of patterns) {
      const match = instruction.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return '';
  }

  private fallbackCompletionValidation(context: ValidationContext): ValidationResult {
    // Simple heuristic validation
    const successCount = context.executionResults.filter(r => r.success).length;
    const totalCount = context.executionResults.length;
    const successRate = totalCount > 0 ? successCount / totalCount : 0;

    const isValid = successRate >= 0.7; // 70% success rate threshold
    const confidence = Math.min(0.8, successRate);

    return {
      isValid,
      confidence,
      message: `Fallback validation: ${successCount}/${totalCount} steps succeeded (${Math.round(successRate * 100)}%)`,
      shouldRetry: !isValid && successRate > 0.3,
      retryStrategy: 'delayed',
    };
  }

  private initializeRetryStrategies(): void {
    // Default retry strategy
    this.retryStrategies.set('default', {
      maxRetries: 3,
      delayMs: 2000,
      backoffMultiplier: 2,
      maxDelayMs: 30000,
      retryConditions: ['validation_failed', 'timeout', 'network_error'],
    });

    // Aggressive retry strategy for important tasks
    this.retryStrategies.set('aggressive', {
      maxRetries: 5,
      delayMs: 1000,
      backoffMultiplier: 1.5,
      maxDelayMs: 15000,
      retryConditions: ['any'],
    });

    // Conservative retry strategy for risky operations
    this.retryStrategies.set('conservative', {
      maxRetries: 1,
      delayMs: 5000,
      backoffMultiplier: 3,
      maxDelayMs: 60000,
      retryConditions: ['validation_failed'],
    });
  }

  // Public utility methods

  recordValidationResult(instruction: string, result: ValidationResult): void {
    if (!this.validationHistory.has(instruction)) {
      this.validationHistory.set(instruction, []);
    }
    
    this.validationHistory.get(instruction)!.push(result);
    
    // Keep only recent history (last 10 results)
    const history = this.validationHistory.get(instruction)!;
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }
  }

  getValidationHistory(instruction: string): ValidationResult[] {
    return this.validationHistory.get(instruction) || [];
  }

  clearValidationHistory(): void {
    this.validationHistory.clear();
    logger.info('Validation history cleared');
  }

  getRetryStrategy(name: string = 'default'): RetryStrategy | undefined {
    return this.retryStrategies.get(name);
  }

  setRetryStrategy(name: string, strategy: RetryStrategy): void {
    this.retryStrategies.set(name, strategy);
    logger.info(`Retry strategy '${name}' updated`);
  }
}