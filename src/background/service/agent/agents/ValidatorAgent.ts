import { BaseAgent } from './base';
import type { BaseAgentOptions, AgentOutput } from './base';
import { createLogger } from '@/utils/logger';
import { HumanMessage, SystemMessage } from '../llm/messages';
import { 
  ValidationResult, 
  ValidationRule, 
  ValidationCriteria, 
  ValidationReport,
  SecurityCheck,
  RiskAssessment,
  ContextSnapshot,
  BrowserState,
  WalletState,
  ActionResult,
  CoordinationEvent
} from '../types/BaseTypes';
import { ElementSelectorEngine } from '../automation/components/ElementSelector';
import { Web3Context } from '../types';

const logger = createLogger('ValidatorAgent');

export interface EnhancedValidatorOutput {
  isValid: boolean;
  confidence: number;
  reason: string;
  details: ValidationReport;
  recommendations: string[];
  securityChecks: SecurityCheck[];
  riskAssessment: RiskAssessment;
  nextState?: Partial<BrowserState | WalletState>;
  shouldRetry: boolean;
  retryStrategy?: string;
}

export interface ValidatorValidationCriteria {
  type: 'completion' | 'accuracy' | 'security' | 'performance' | 'compliance';
  name: string;
  description: string;
  required: boolean;
  weight: number;
  validator: (context: ValidationContext) => Promise<ValidationResult>;
}

export interface ValidationContext {
  originalIntent: string;
  executionPlan: any;
  actionResults: ActionResult[];
  browserState: BrowserState;
  walletState: WalletState;
  contextSnapshot: ContextSnapshot;
  securityChecks: SecurityCheck[];
  performanceMetrics: any;
  validationRules: ValidationRule[];
}

export class ValidatorAgent extends BaseAgent<EnhancedValidatorOutput> {
  private elementSelector: ElementSelectorEngine;
  private validationCriteria: ValidatorValidationCriteria[] = [];
  private securityThreshold: number = 0.8;
  private completionThreshold: number = 0.9;
  private executionPlan: any;
  private startTime: number = Date.now();

  constructor(options: BaseAgentOptions) {
    super('validator', options);
    this.elementSelector = new ElementSelectorEngine();
    this.initializeValidationCriteria();
  }

  async execute(): Promise<AgentOutput<EnhancedValidatorOutput>> {
    try {
      this.emitEvent('STEP_START', 'Starting comprehensive validation...');

      // Get execution context from other agents
      const context = await this.getValidationContext();
      
      // Perform multi-dimensional validation
      const validationReport = await this.performComprehensiveValidation(context);
      
      // Generate security assessment
      const securityChecks = await this.performSecurityValidation(context);
      
      // Generate risk assessment
      const riskAssessment = await this.generateRiskAssessment(validationReport, securityChecks);
      
      // Generate recommendations
      const recommendations = await this.generateRecommendations(validationReport, riskAssessment);
      
      // Determine retry strategy
      const retryDecision = await this.determineRetryStrategy(validationReport, riskAssessment);

      const overallResult = this.calculateOverallValidation(validationReport, riskAssessment);

      const output: EnhancedValidatorOutput = {
        isValid: overallResult.isValid,
        confidence: overallResult.confidence,
        reason: overallResult.reason,
        details: validationReport,
        recommendations,
        securityChecks,
        riskAssessment,
        nextState: await this.generateNextState(context, validationReport),
        shouldRetry: retryDecision.shouldRetry,
        retryStrategy: retryDecision.strategy
      };

      this.emitEvent(
        overallResult.isValid ? 'STEP_OK' : 'STEP_FAIL',
        `Validation completed: ${overallResult.reason}`
      );

      logger.info('Validation completed', {
        isValid: output.isValid,
        confidence: output.confidence,
        riskLevel: riskAssessment.overallRisk,
        securityIssues: securityChecks.filter(check => check.level === 'error' || check.level === 'critical').length
      });

      return {
        id: this.id,
        result: output,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Validation execution failed:', errorMessage);
      this.emitEvent('STEP_FAIL', errorMessage);

      return {
        id: this.id,
        error: errorMessage,
      };
    }
  }

  private initializeValidationCriteria(): void {
    this.validationCriteria = [
      {
        type: 'completion',
        name: 'Task Completion',
        description: 'Validates if the task was completed successfully',
        required: true,
        weight: 0.4,
        validator: this.validateTaskCompletion.bind(this)
      } as ValidatorValidationCriteria,
      {
        type: 'accuracy',
        name: 'Result Accuracy',
        description: 'Validates if the results match the expected outcome',
        required: true,
        weight: 0.3,
        validator: this.validateResultAccuracy.bind(this)
      } as ValidatorValidationCriteria,
      {
        type: 'security',
        name: 'Security Compliance',
        description: 'Validates security aspects of the execution',
        required: true,
        weight: 0.2,
        validator: this.validateSecurityCompliance.bind(this)
      } as ValidatorValidationCriteria,
      {
        type: 'performance',
        name: 'Performance Standards',
        description: 'Validates performance metrics and efficiency',
        required: false,
        weight: 0.1,
        validator: this.validatePerformanceStandards.bind(this)
      } as ValidatorValidationCriteria
    ];
  }

  private async getValidationContext(): Promise<ValidationContext> {
    try {
      // Get current browser state
      const browserState = await this.getCurrentBrowserState();
      
      // Get current wallet state
      const walletState = await this.getCurrentWalletState();
      
      // Get context snapshot
      const contextSnapshot = await this.getContextSnapshot();
      
      // Get execution results from coordinator
      const actionResults = await this.getActionResults();
      
      // Get validation rules from intent
      const validationRules = await this.getValidationRules();
      
      // Get performance metrics
      const performanceMetrics = await this.getPerformanceMetrics();

      return {
        originalIntent: this.task,
        executionPlan: this.executionPlan,
        actionResults,
        browserState,
        walletState,
        contextSnapshot,
        securityChecks: [],
        performanceMetrics,
        validationRules
      };
    } catch (error) {
      logger.error('Failed to get validation context:', error);
      throw new Error('Unable to gather validation context');
    }
  }

  private async getCurrentBrowserState(): Promise<BrowserState> {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab) {
        throw new Error('No active tab found');
      }

      // Get detailed DOM state
      const domState = await this.getDOMState(tab.id!);
      
      // Get network state
      const networkState = await this.getNetworkState(tab.id!);

      return {
        currentUrl: tab.url || '',
        title: tab.title || '',
        activeTabId: tab.id!,
        availableTabs: await this.getAvailableTabs(),
        domState,
        networkState,
        interactionState: {
          lastAction: 'unknown',
          lastActionTime: Date.now(),
          actionQueue: [],
          isProcessing: false
        }
      };
    } catch (error) {
      logger.warn('Failed to get browser state, using defaults:', error);
      return {
        currentUrl: '',
        title: '',
        activeTabId: this.tabId,
        availableTabs: [],
        domState: {
          readyState: 'complete',
          hasForms: false,
          hasInputs: false,
          hasButtons: false,
          hasLinks: false,
          visibleElements: [],
          hiddenElements: []
        },
        networkState: {
          isActive: false,
          pendingRequests: 0,
          lastRequestTime: 0,
          responseTimes: []
        },
        interactionState: {
          lastAction: 'unknown',
          lastActionTime: Date.now(),
          actionQueue: [],
          isProcessing: false
        }
      };
    }
  }

  private async getCurrentWalletState(): Promise<WalletState> {
    try {
      // Get wallet state from Web3 context
      const web3Context = await this.getWeb3Context();
      
      return {
        isConnected: web3Context.currentAddress !== '',
        currentAddress: web3Context.currentAddress,
        chainId: web3Context.currentChain,
        balances: web3Context.balances || {},
        allowances: [],
        nonce: 0,
        gasPrice: '0',
        contracts: []
      };
    } catch (error) {
      logger.warn('Failed to get wallet state, using defaults:', error);
      return {
        isConnected: false,
        currentAddress: '',
        chainId: 1,
        balances: {},
        allowances: [],
        nonce: 0,
        gasPrice: '0',
        contracts: []
      };
    }
  }

  private async getDOMState(tabId: number): Promise<any> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          readyState: document.readyState,
          hasForms: document.forms.length > 0,
          hasInputs: document.querySelectorAll('input').length > 0,
          hasButtons: document.querySelectorAll('button').length > 0,
          hasLinks: document.querySelectorAll('a').length > 0,
          visibleElements: Array.from(document.querySelectorAll('*')).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }).slice(0, 50).map(el => ({
            selector: el.tagName.toLowerCase(),
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.substring(0, 100) || '',
            visible: true,
            interactive: el.matches('button, input, select, textarea, a')
          })),
          hiddenElements: []
        })
      });

      return results[0]?.result || {};
    } catch (error) {
      logger.warn('Failed to get DOM state:', error);
      return {};
    }
  }

  private async getNetworkState(tabId: number): Promise<any> {
    try {
      // Simplified network state detection
      return {
        isActive: true,
        pendingRequests: 0,
        lastRequestTime: Date.now(),
        responseTimes: []
      };
    } catch (error) {
      logger.warn('Failed to get network state:', error);
      return {
        isActive: false,
        pendingRequests: 0,
        lastRequestTime: 0,
        responseTimes: []
      };
    }
  }

  private async getAvailableTabs(): Promise<any[]> {
    try {
      const tabs = await chrome.tabs.query({});
      return tabs.map(tab => ({
        id: tab.id!,
        url: tab.url || '',
        title: tab.title || '',
        status: tab.status as any,
        lastActivity: Date.now()
      }));
    } catch (error) {
      logger.warn('Failed to get available tabs:', error);
      return [];
    }
  }

  private async getContextSnapshot(): Promise<ContextSnapshot> {
    // This would integrate with the context management system
    return {
      id: `snapshot_${Date.now()}`,
      timestamp: Date.now(),
      browserState: await this.getCurrentBrowserState(),
      walletState: await this.getCurrentWalletState(),
      agentStates: {},
      activeTasks: [],
      messages: [],
      metadata: {}
    };
  }

  private async getActionResults(): Promise<ActionResult[]> {
    // This would get the actual results from the execution coordinator
    // For now, return empty array
    return [];
  }

  private async getValidationRules(): Promise<ValidationRule[]> {
    // This would extract validation rules from the original intent
    return [];
  }

  private async getPerformanceMetrics(): Promise<any> {
    // This would get performance metrics from the monitoring system
    return {
      executionTime: 0,
      memoryUsage: 0,
      networkRequests: 0,
      errors: []
    };
  }

  private async getWeb3Context(): Promise<Web3Context> {
    // This would get the Web3 context from the wallet
    return {
      currentChain: 1,
      currentAddress: '',
      balances: {},
      riskLevel: 'LOW'
    };
  }

  private async performComprehensiveValidation(context: ValidationContext): Promise<ValidationReport> {
    const report: ValidationReport = {
      id: `validation_${Date.now()}`,
      timestamp: Date.now(),
      overallScore: 0,
      validations: [],
      passed: [],
      failed: [],
      warnings: [],
      metadata: {
        executionTime: Date.now() - (this.startTime || Date.now()),
        criteriaCount: this.validationCriteria.length,
        contextCompleteness: this.assessContextCompleteness(context)
      }
    };

    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const criteria of this.validationCriteria) {
      try {
        const result = await criteria.validator(context);
        
        const validation = {
          criteria,
          result,
          weight: criteria.weight,
          timestamp: Date.now()
        };

        report.validations.push(validation);

        if (result.isValid) {
          report.passed.push(validation);
          totalWeightedScore += result.score * criteria.weight;
        } else {
          report.failed.push(validation);
          if (result.severity !== 'error') {
            totalWeightedScore += result.score * criteria.weight;
          }
        }

        if (result.severity === 'warning') {
          report.warnings.push(validation);
        }

        totalWeight += criteria.weight;

      } catch (error) {
        logger.error(`Validation failed for criteria ${criteria.name}:`, error);
        report.failed.push({
          criteria,
          result: {
            isValid: false,
            score: 0,
            message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            severity: 'error',
            details: { error: error instanceof Error ? error.stack : error }
          },
          weight: criteria.weight,
          timestamp: Date.now()
        });
      }
    }

    report.overallScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

    return report;
  }

  private async validateTaskCompletion(context: ValidationContext): Promise<ValidationResult> {
    // Use LLM to analyze if the task was completed
    const systemPrompt = `You are a task completion validator. Analyze if the original task was completed successfully based on the current browser state and action results.

Task: "${context.originalIntent}"

Browser State:
- URL: ${context.browserState.currentUrl}
- Title: ${context.browserState.title}
- Page Elements: ${context.browserState.domState.visibleElements.length} visible elements

Action Results: ${context.actionResults.length} actions executed

Respond with JSON:
{
  "isValid": boolean,
  "score": number (0-1),
  "message": "explanation of validation result",
  "severity": "info" | "warning" | "error",
  "details": {
    "completionEvidence": string[],
    "missingElements": string[],
    "confidence": number
  }
}`;

    const userPrompt = `Validate if the task was completed successfully based on the provided context.`;

    try {
      const response = await this.invokeModel([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt)
      ]);

      const result = this.parseValidationResponse(response.content);
      return result || {
        isValid: false,
        score: 0,
        message: 'Unable to validate task completion',
        severity: 'error',
        details: {}
      };
    } catch (error) {
      logger.error('Task completion validation failed:', error);
      return {
        isValid: false,
        score: 0,
        message: 'Task completion validation failed',
        severity: 'error',
        details: { error: error instanceof Error ? error.message : error }
      };
    }
  }

  private async validateResultAccuracy(context: ValidationContext): Promise<ValidationResult> {
    // Validate if the results match expected outcomes
    const successfulActions = context.actionResults.filter(r => r.success);
    const accuracy = successfulActions.length / Math.max(context.actionResults.length, 1);

    return {
      isValid: accuracy >= 0.8,
      score: accuracy,
      message: `${Math.round(accuracy * 100)}% of actions completed successfully`,
      severity: accuracy >= 0.8 ? 'info' : accuracy >= 0.6 ? 'warning' : 'error',
      details: {
        successfulActions: successfulActions.length,
        totalActions: context.actionResults.length,
        accuracy: accuracy
      }
    };
  }

  private async validateSecurityCompliance(context: ValidationContext): Promise<ValidationResult> {
    // Basic security validation
    const securityChecks = [
      this.validateUrlSafety(context.browserState.currentUrl),
      this.validateNoSensitiveDataExposure(context),
      this.validateSecureConnections(context)
    ];

    const results = await Promise.all(securityChecks);
    const passedChecks = results.filter(r => r.isValid).length;
    const score = passedChecks / results.length;

    return {
      isValid: score >= this.securityThreshold,
      score: score,
      message: `${passedChecks}/${results.length} security checks passed`,
      severity: score >= this.securityThreshold ? 'info' : 'error',
      details: {
        securityChecks: results,
        passedChecks,
        totalChecks: results.length
      }
    };
  }

  private async validatePerformanceStandards(context: ValidationContext): Promise<ValidationResult> {
    // Validate performance metrics
    const metrics = context.performanceMetrics;
    
    // Check if execution time is reasonable
    const executionTimeScore = Math.max(0, 1 - (metrics.executionTime / 30000)); // 30 second threshold
    
    // Check error rate
    const errorRate = metrics.errors.length / Math.max(context.actionResults.length, 1);
    const errorRateScore = Math.max(0, 1 - errorRate);

    const overallScore = (executionTimeScore + errorRateScore) / 2;

    return {
      isValid: overallScore >= 0.7,
      score: overallScore,
      message: `Performance score: ${Math.round(overallScore * 100)}%`,
      severity: overallScore >= 0.7 ? 'info' : 'warning',
      details: {
        executionTimeScore,
        errorRateScore,
        overallScore,
        metrics
      }
    };
  }

  private async validateUrlSafety(url: string): Promise<ValidationResult> {
    // Basic URL validation
    const isSafeUrl = /^https?:\/\/.+/.test(url) && !url.includes('malicious');
    
    return {
      isValid: isSafeUrl,
      score: isSafeUrl ? 1 : 0,
      message: isSafeUrl ? 'URL appears safe' : 'URL validation failed',
      severity: isSafeUrl ? 'info' : 'error',
      details: { url }
    };
  }

  private async validateNoSensitiveDataExposure(context: ValidationContext): Promise<ValidationResult> {
    // Check for potential sensitive data exposure
    const sensitivePatterns = [
      /private[_\s]?key/i,
      /secret/i,
      /password/i,
      /mnemonic/i
    ];

    const pageText = context.browserState.domState.visibleElements
      .map(el => el.text)
      .join(' ')
      .toLowerCase();

    const hasSensitiveData = sensitivePatterns.some(pattern => pattern.test(pageText));

    return {
      isValid: !hasSensitiveData,
      score: hasSensitiveData ? 0 : 1,
      message: hasSensitiveData ? 'Potential sensitive data detected' : 'No sensitive data detected',
      severity: hasSensitiveData ? 'warning' : 'info',
      details: { hasSensitiveData }
    };
  }

  private async validateSecureConnections(context: ValidationContext): Promise<ValidationResult> {
    // Check if using HTTPS
    const isSecure = context.browserState.currentUrl.startsWith('https://');
    
    return {
      isValid: isSecure,
      score: isSecure ? 1 : 0.5,
      message: isSecure ? 'Secure connection detected' : 'Connection not secured',
      severity: isSecure ? 'info' : 'warning',
      details: { isSecure }
    };
  }

  private async performSecurityValidation(context: ValidationContext): Promise<SecurityCheck[]> {
    const checks: SecurityCheck[] = [];

    // URL validation
    checks.push({
      type: 'url_validation',
      level: context.browserState.currentUrl.startsWith('https://') ? 'info' : 'warning',
      message: 'URL protocol validation',
      details: { url: context.browserState.currentUrl },
      recommendation: context.browserState.currentUrl.startsWith('https://') ? 
        undefined : 'Consider using HTTPS for secure connections'
    });

    // Domain safety check
    try {
      const url = new URL(context.browserState.currentUrl);
      const isSafeDomain = !url.hostname.includes('malicious') && !url.hostname.includes('phishing');
      
      checks.push({
        type: 'domain_check',
        level: isSafeDomain ? 'info' : 'error',
        message: 'Domain safety check',
        details: { domain: url.hostname },
        recommendation: isSafeDomain ? undefined : 'Avoid potentially malicious domains'
      });
    } catch (error) {
      checks.push({
        type: 'domain_check',
        level: 'warning',
        message: 'Domain validation failed',
        details: { error: error instanceof Error ? error.message : error }
      });
    }

    return checks;
  }

  private async generateRiskAssessment(report: ValidationReport, securityChecks: SecurityCheck[]): Promise<RiskAssessment> {
    const factors: any[] = [];
    
    // Overall validation score factor
    if (report.overallScore < 0.7) {
      factors.push({
        type: 'validation_score',
        level: report.overallScore < 0.5 ? 'HIGH' : 'MEDIUM' as const,
        description: `Low validation score: ${Math.round(report.overallScore * 100)}%`,
        weight: 0.4
      });
    }

    // Security issues factor
    const securityIssues = securityChecks.filter(check => check.level === 'error' || check.level === 'critical');
    if (securityIssues.length > 0) {
      factors.push({
        type: 'security_issues',
        level: securityIssues.length > 2 ? 'HIGH' : 'MEDIUM' as const,
        description: `${securityIssues.length} security issues detected`,
        weight: 0.5
      });
    }

    // Failed validations factor
    if (report.failed.length > 0) {
      factors.push({
        type: 'failed_validations',
        level: report.failed.length > 2 ? 'HIGH' : 'MEDIUM' as const,
        description: `${report.failed.length} validation checks failed`,
        weight: 0.3
      });
    }

    // Calculate overall risk
    const maxRiskScore = Math.max(...factors.map(f => f.weight * (f.level === 'HIGH' ? 3 : f.level === 'MEDIUM' ? 2 : 1)), 0);
    const overallRisk = maxRiskScore > 2 ? 'HIGH' : maxRiskScore > 1 ? 'MEDIUM' : 'LOW' as const;

    return {
      overallRisk,
      factors,
      recommendations: this.generateRiskRecommendations(factors),
      mitigations: this.generateRiskMitigations(factors)
    };
  }

  private generateRiskRecommendations(factors: any[]): string[] {
    const recommendations: string[] = [];
    
    factors.forEach(factor => {
      switch (factor.type) {
        case 'validation_score':
          recommendations.push('Review and improve task execution accuracy');
          break;
        case 'security_issues':
          recommendations.push('Address security vulnerabilities immediately');
          break;
        case 'failed_validations':
          recommendations.push('Investigate and fix failed validation checks');
          break;
      }
    });

    return recommendations;
  }

  private generateRiskMitigations(factors: any[]): string[] {
    const mitigations: string[] = [];
    
    factors.forEach(factor => {
      switch (factor.type) {
        case 'validation_score':
          mitigations.push('Implement better error handling and retry logic');
          break;
        case 'security_issues':
          mitigations.push('Add additional security validation steps');
          break;
        case 'failed_validations':
          mitigations.push('Enhance validation criteria and checks');
          break;
      }
    });

    return mitigations;
  }

  private async generateRecommendations(report: ValidationReport, riskAssessment: RiskAssessment): Promise<string[]> {
    const recommendations: string[] = [];

    // Add risk-based recommendations
    recommendations.push(...riskAssessment.recommendations);

    // Add validation-based recommendations
    if (report.overallScore < 0.8) {
      recommendations.push('Consider improving execution accuracy');
    }

    if (report.warnings.length > 0) {
      recommendations.push('Address validation warnings');
    }

    // Add performance recommendations
    if (report.metadata.executionTime > 10000) {
      recommendations.push('Optimize execution time');
    }

    return recommendations;
  }

  private async determineRetryStrategy(report: ValidationReport, riskAssessment: RiskAssessment): Promise<{shouldRetry: boolean; strategy?: string}> {
    // Don't retry if high risk or critical security issues
    if (riskAssessment.overallRisk === 'HIGH' || 
        riskAssessment.factors.some(f => f.level === 'HIGH' && f.type === 'security_issues')) {
      return { shouldRetry: false };
    }

    // Retry if validation score is close to threshold
    if (report.overallScore >= 0.7 && report.overallScore < this.completionThreshold) {
      return { 
        shouldRetry: true, 
        strategy: 'partial_retry_with_adjustments' 
      };
    }

    // Retry if there are retryable failures
    const retryableFailures = report.failed.filter(f => 
      f.result.severity !== 'error' && f.criteria.required
    );

    if (retryableFailures.length > 0 && retryableFailures.length < report.failed.length) {
      return { 
        shouldRetry: true, 
        strategy: 'selective_retry' 
      };
    }

    return { shouldRetry: false };
  }

  private calculateOverallValidation(report: ValidationReport, riskAssessment: RiskAssessment): {isValid: boolean; confidence: number; reason: string} {
    const isValid = report.overallScore >= this.completionThreshold && 
                   riskAssessment.overallRisk !== 'HIGH' &&
                   report.failed.filter(f => f.criteria.required && f.result.severity === 'error').length === 0;

    const confidence = Math.min(report.overallScore, 1 - (riskAssessment.overallRisk === 'HIGH' ? 0.5 : riskAssessment.overallRisk === 'MEDIUM' ? 0.2 : 0));

    let reason = '';
    if (isValid) {
      reason = `Task validated successfully with ${Math.round(report.overallScore * 100)}% confidence`;
    } else {
      reason = `Validation failed: ${report.failed.length} checks failed, risk level: ${riskAssessment.overallRisk}`;
    }

    return { isValid, confidence, reason };
  }

  private async generateNextState(context: ValidationContext, report: ValidationReport): Promise<Partial<BrowserState | WalletState>> {
    // Generate next state based on validation results
    // Return a partial state that combines relevant browser and wallet state changes
    return {
      ...context.browserState,
      ...context.walletState
    };
  }

  private assessContextCompleteness(context: ValidationContext): number {
    // Assess how complete the context is for validation
    let completeness = 0;
    
    if (context.browserState.currentUrl) completeness += 0.2;
    if (context.browserState.domState.visibleElements.length > 0) completeness += 0.2;
    if (context.walletState.isConnected) completeness += 0.2;
    if (context.actionResults.length > 0) completeness += 0.2;
    if (context.validationRules.length > 0) completeness += 0.2;

    return completeness;
  }

  private parseValidationResponse(content: string): ValidationResult | null {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isValid: Boolean(parsed.isValid),
          score: parsed.score || 0,
          message: parsed.message || '',
          severity: parsed.severity || 'info',
          details: parsed.details || {}
        };
      }
      return null;
    } catch (error) {
      logger.error('Failed to parse validation response:', error);
      return null;
    }
  }

  // Additional helper methods for enhanced validation
  async validateSpecificElement(selector: string, expectedState: any): Promise<ValidationResult> {
    try {
      const elements = await this.elementSelector.findElements({ strategy: 'css', selector, confidence: 0.8 });
      
      if (elements.length === 0) {
        return {
          isValid: false,
          score: 0,
          message: `Element not found: ${selector}`,
          severity: 'error',
          details: { selector }
        };
      }

      // Validate element state against expected state
      const isValid = this.validateElementState(elements[0], expectedState);
      
      return {
        isValid,
        score: isValid ? 1 : 0,
        message: isValid ? 'Element validation passed' : 'Element validation failed',
        severity: isValid ? 'info' : 'warning',
        details: { element: elements[0], expectedState }
      };
    } catch (error) {
      return {
        isValid: false,
        score: 0,
        message: `Element validation error: ${error instanceof Error ? error.message : error}`,
        severity: 'error',
        details: { error: error instanceof Error ? error.stack : error }
      };
    }
  }

  private validateElementState(element: any, expectedState: any): boolean {
    // Simple state validation - can be enhanced
    if (expectedState.visible !== undefined && element.visible !== expectedState.visible) {
      return false;
    }
    
    if (expectedState.text && !element.text.includes(expectedState.text)) {
      return false;
    }

    return true;
  }

  async validateTransactionConfirmation(txHash: string): Promise<ValidationResult> {
    try {
      // This would integrate with blockchain validation
      // For now, simulate validation
      return {
        isValid: true,
        score: 1,
        message: `Transaction ${txHash} confirmed`,
        severity: 'info',
        details: { txHash, confirmations: 1 }
      };
    } catch (error) {
      return {
        isValid: false,
        score: 0,
        message: `Transaction validation failed: ${error instanceof Error ? error.message : error}`,
        severity: 'error',
        details: { error }
      };
    }
  }

  async validateBalanceChange(expectedChange: any): Promise<ValidationResult> {
    try {
      // This would validate actual balance changes
      return {
        isValid: true,
        score: 1,
        message: 'Balance change validated',
        severity: 'info',
        details: { expectedChange }
      };
    } catch (error) {
      return {
        isValid: false,
        score: 0,
        message: `Balance validation failed: ${error instanceof Error ? error.message : error}`,
        severity: 'error',
        details: { error }
      };
    }
  }
}