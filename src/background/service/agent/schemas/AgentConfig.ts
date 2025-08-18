/**
 * Configuration management for the multi-agent system
 */

// Simple deep merge implementation (replacement for ramda)
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target } as T;
  
  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];
    
    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue) && 
        targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
      result[key] = deepMerge(targetValue, sourceValue as any);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as any;
    }
  }
  
  return result;
}

// Agent behavior configuration
export interface AgentBehaviorConfig {
  // Performance settings
  maxExecutionTime: number;
  maxRetries: number;
  timeoutMultiplier: number;
  maxConcurrentTasks: number;
  
  // Element selection settings
  elementConfidenceThreshold: number;
  maxElementSearchDepth: number;
  enableVisualFeedback: boolean;
  elementSearchTimeout: number;
  
  // Planning settings
  enableReplanning: boolean;
  maxPlanningIterations: number;
  enableParallelExecution: boolean;
  planningTimeout: number;
  
  // Validation settings
  validationConfidenceThreshold: number;
  enableAutoRetry: boolean;
  maxValidationAttempts: number;
  validationTimeout: number;
  
  // Error handling settings
  enableErrorRecovery: boolean;
  circuitBreakerThreshold: number;
  recoveryTimeout: number;
  enableErrorLogging: boolean;
  
  // Logging and monitoring
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  enablePerformanceMonitoring: boolean;
  metricsRetentionPeriod: number;
  enableDetailedTracing: boolean;
  
  // LLM settings
  llmTimeout: number;
  llmMaxTokens: number;
  llmTemperature: number;
  
  // Browser settings
  defaultNavigationTimeout: number;
  waitForElementsTimeout: number;
  pageLoadTimeout: number;
  
  // Feature flags
  enableExperimentalFeatures: boolean;
  enableBetaFeatures: boolean;
  enableAIFeatures: boolean;
}

// Default configuration
export const DEFAULT_AGENT_CONFIG: AgentBehaviorConfig = {
  // Performance settings
  maxExecutionTime: 300000, // 5 minutes
  maxRetries: 3,
  timeoutMultiplier: 1.5,
  maxConcurrentTasks: 5,
  
  // Element selection settings
  elementConfidenceThreshold: 0.7,
  maxElementSearchDepth: 10,
  enableVisualFeedback: true,
  elementSearchTimeout: 30000,
  
  // Planning settings
  enableReplanning: true,
  maxPlanningIterations: 5,
  enableParallelExecution: false,
  planningTimeout: 60000,
  
  // Validation settings
  validationConfidenceThreshold: 0.8,
  enableAutoRetry: true,
  maxValidationAttempts: 3,
  validationTimeout: 30000,
  
  // Error handling settings
  enableErrorRecovery: true,
  circuitBreakerThreshold: 5,
  recoveryTimeout: 30000,
  enableErrorLogging: true,
  
  // Logging and monitoring
  logLevel: 'info',
  enablePerformanceMonitoring: true,
  metricsRetentionPeriod: 86400000, // 24 hours
  enableDetailedTracing: false,
  
  // LLM settings
  llmTimeout: 30000,
  llmMaxTokens: 2000,
  llmTemperature: 0.1,
  
  // Browser settings
  defaultNavigationTimeout: 30000,
  waitForElementsTimeout: 10000,
  pageLoadTimeout: 45000,
  
  // Feature flags
  enableExperimentalFeatures: false,
  enableBetaFeatures: false,
  enableAIFeatures: true,
};

// Environment-specific configurations
export const ENVIRONMENT_CONFIGS: Record<string, Partial<AgentBehaviorConfig>> = {
  development: {
    logLevel: 'debug',
    enableDetailedTracing: true,
    enableExperimentalFeatures: true,
    enableBetaFeatures: true,
    maxExecutionTime: 600000, // 10 minutes for debugging
  },
  testing: {
    logLevel: 'debug',
    enablePerformanceMonitoring: false,
    maxRetries: 1,
    enableAIFeatures: false,
  },
  production: {
    logLevel: 'warn',
    enableDetailedTracing: false,
    enableExperimentalFeatures: false,
    enableBetaFeatures: false,
    maxExecutionTime: 180000, // 3 minutes
  },
};

// Configuration management
export class AgentConfigManager {
  private config: AgentBehaviorConfig;
  private environment: string;
  
  constructor(
    environment: string = 'production',
    config?: Partial<AgentBehaviorConfig>
  ) {
    this.environment = environment;
    this.config = this.initializeConfig(config);
  }
  
  private initializeConfig(config?: Partial<AgentBehaviorConfig>): AgentBehaviorConfig {
    const envConfig = ENVIRONMENT_CONFIGS[this.environment] || {};
    const userConfig = config || {};
    
    return deepMerge(
      deepMerge(DEFAULT_AGENT_CONFIG, envConfig),
      userConfig
    );
  }
  
  getConfig(): AgentBehaviorConfig {
    return { ...this.config };
  }
  
  updateConfig(updates: Partial<AgentBehaviorConfig>): void {
    this.config = deepMerge(this.config, updates);
  }
  
  getConfigForAgent(agentType: string): AgentBehaviorConfig {
    // Agent-specific configuration overrides can be added here
    const agentOverrides: Record<string, Partial<AgentBehaviorConfig>> = {
      planner: {
        planningTimeout: 90000,
        llmMaxTokens: 3000,
      },
      navigator: {
        elementSearchTimeout: 45000,
        defaultNavigationTimeout: 45000,
      },
      validator: {
        validationTimeout: 45000,
        maxValidationAttempts: 5,
      },
    };
    
    const override = agentOverrides[agentType] || {};
    return deepMerge(this.config, override);
  }
  
  setEnvironment(environment: string): void {
    this.environment = environment;
    this.config = this.initializeConfig();
  }
  
  getEnvironment(): string {
    return this.environment;
  }
  
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (this.config.maxExecutionTime <= 0) {
      errors.push('maxExecutionTime must be positive');
    }
    
    if (this.config.elementConfidenceThreshold < 0 || this.config.elementConfidenceThreshold > 1) {
      errors.push('elementConfidenceThreshold must be between 0 and 1');
    }
    
    if (this.config.validationConfidenceThreshold < 0 || this.config.validationConfidenceThreshold > 1) {
      errors.push('validationConfidenceThreshold must be between 0 and 1');
    }
    
    if (this.config.maxRetries < 0) {
      errors.push('maxRetries must be non-negative');
    }
    
    if (this.config.circuitBreakerThreshold <= 0) {
      errors.push('circuitBreakerThreshold must be positive');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  resetToDefaults(): void {
    this.config = this.initializeConfig();
  }
  
  exportConfig(): string {
    return JSON.stringify({
      environment: this.environment,
      config: this.config,
    }, null, 2);
  }
  
  importConfig(configJson: string): { success: boolean; error?: string } {
    try {
      const parsed = JSON.parse(configJson);
      if (parsed.environment) {
        this.setEnvironment(parsed.environment);
      }
      if (parsed.config) {
        this.updateConfig(parsed.config);
      }
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Invalid JSON' 
      };
    }
  }
}