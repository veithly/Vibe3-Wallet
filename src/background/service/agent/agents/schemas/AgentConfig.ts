/**
 * Agent configuration management system
 */

import { z } from 'zod';

// Configuration schema
const AgentConfigSchema = z.object({
  environment: z.enum(['development', 'staging', 'production']),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  timeout: z.number().positive().default(30000),
  maxRetries: z.number().int().min(0).default(3),
  enableCache: z.boolean().default(true),
  enableValidation: z.boolean().default(true),
  enableReplanning: z.boolean().default(true),
  performanceTracking: z.boolean().default(true),
  errorRecovery: z.object({
    enabled: z.boolean().default(true),
    maxRecoveryAttempts: z.number().int().min(0).default(3),
    recoveryStrategies: z.array(z.string()).default(['retry', 'fallback', 'abort']),
  }).default({}),
  llm: z.object({
    model: z.string().default('gpt-4'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().int().positive().default(2000),
    timeout: z.number().positive().default(60000),
  }).default({}),
  browser: z.object({
    defaultTimeout: z.number().positive().default(30000),
    elementTimeout: z.number().positive().default(10000),
    navigationTimeout: z.number().positive().default(45000),
    screenshotQuality: z.number().min(1).max(100).default(90),
  }).default({}),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Agent configuration manager
 */
export class AgentConfigManager {
  private config: AgentConfig;
  private environment: string;

  constructor(environment: string = 'development') {
    this.environment = environment;
    this.config = this.getDefaultConfig(environment);
  }

  /**
   * Get the current configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Update configuration values
   */
  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = AgentConfigSchema.parse({
      ...this.config,
      ...updates,
    });
  }

  /**
   * Get environment-specific configuration
   */
  getEnvironmentConfig(): AgentConfig {
    return this.getConfig();
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(feature: keyof AgentConfig): boolean {
    const value = this.config[feature];
    return typeof value === 'boolean' ? value : false;
  }

  /**
   * Get timeout for a specific operation
   */
  getTimeout(operation: 'default' | 'element' | 'navigation' | 'llm'): number {
    switch (operation) {
      case 'element':
        return this.config.browser.elementTimeout;
      case 'navigation':
        return this.config.browser.navigationTimeout;
      case 'llm':
        return this.config.llm.timeout;
      default:
        return this.config.timeout;
    }
  }

  /**
   * Get LLM configuration
   */
  getLLMConfig() {
    return this.config.llm;
  }

  /**
   * Get browser configuration
   */
  getBrowserConfig() {
    return this.config.browser;
  }

  /**
   * Get error recovery configuration
   */
  getErrorRecoveryConfig() {
    return this.config.errorRecovery;
  }

  /**
   * Set environment (development/staging/production)
   */
  setEnvironment(environment: string): void {
    this.environment = environment;
    this.config = this.getDefaultConfig(environment);
  }

  /**
   * Get default configuration for environment
   */
  private getDefaultConfig(environment: string): AgentConfig {
    const baseConfig = {
      environment: environment as AgentConfig['environment'],
      logLevel: 'info' as const,
      timeout: 30000,
      maxRetries: 3,
      enableCache: true,
      enableValidation: true,
      enableReplanning: true,
      performanceTracking: true,
    };

    // Environment-specific overrides
    const envOverrides: Record<string, Partial<AgentConfig>> = {
      development: {
        logLevel: 'debug',
        timeout: 60000,
        enableCache: true,
        performanceTracking: true,
      },
      staging: {
        logLevel: 'info',
        timeout: 45000,
        enableCache: true,
        performanceTracking: true,
      },
      production: {
        logLevel: 'warn',
        timeout: 30000,
        enableCache: true,
        performanceTracking: false,
      },
    };

    const merged = {
      ...baseConfig,
      ...envOverrides[environment] || envOverrides.development,
    };

    return AgentConfigSchema.parse(merged);
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors?: string[] } {
    const result = AgentConfigSchema.safeParse(this.config);
    if (result.success) {
      return { valid: true };
    } else {
      return {
        valid: false,
        errors: result.error.errors.map(err => err.message),
      };
    }
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.config = this.getDefaultConfig(this.environment);
  }

  /**
   * Export configuration as JSON
   */
  export(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  import(jsonConfig: string): { success: boolean; error?: string } {
    try {
      const parsed = JSON.parse(jsonConfig);
      const result = AgentConfigSchema.safeParse(parsed);
      
      if (result.success) {
        this.config = result.data;
        return { success: true };
      } else {
        return {
          success: false,
          error: result.error.errors.map(err => err.message).join(', '),
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid JSON',
      };
    }
  }
}

// Default configuration instances
export const defaultConfig = new AgentConfigManager('development');
export const stagingConfig = new AgentConfigManager('staging');
export const productionConfig = new AgentConfigManager('production');