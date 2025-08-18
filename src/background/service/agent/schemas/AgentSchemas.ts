/**
 * Schema validation for the multi-agent system
 */

import { z } from 'zod';

// Action parameter schemas
export const NavigateActionSchema = z.object({
  type: z.literal('navigate'),
  url: z.string().url().nonempty(),
  timeout: z.number().positive().default(30000),
  waitFor: z.enum(['load', 'domcontentloaded', 'networkidle']).default('load'),
  userAgent: z.string().optional(),
  viewport: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
});

export const ClickActionSchema = z.object({
  type: z.literal('click'),
  selector: z.string().optional(),
  index: z.number().int().min(0).optional(),
  text: z.string().optional(),
  timeout: z.number().positive().default(10000),
  doubleClick: z.boolean().default(false),
  rightClick: z.boolean().default(false),
  scrollIntoView: z.boolean().default(true),
  waitForNavigation: z.boolean().default(false),
});

export const InputActionSchema = z.object({
  type: z.literal('input'),
  selector: z.string().optional(),
  index: z.number().int().min(0).optional(),
  text: z.string().nonempty(),
  timeout: z.number().positive().default(10000),
  clearFirst: z.boolean().default(true),
  submitForm: z.boolean().default(false),
  pressEnter: z.boolean().default(false),
  delay: z.number().min(0).default(100),
});

export const SearchActionSchema = z.object({
  type: z.literal('search'),
  query: z.string().nonempty(),
  searchEngine: z.enum(['google', 'bing', 'duckduckgo']).default('google'),
  timeout: z.number().positive().default(30000),
  waitForResults: z.boolean().default(true),
});

export const WaitActionSchema = z.object({
  type: z.literal('wait'),
  duration: z.number().positive(),
  reason: z.string().optional(),
  waitFor: z.enum(['time', 'element', 'navigation', 'network']).default('time'),
  selector: z.string().optional(),
});

export const ValidateActionSchema = z.object({
  type: z.literal('validate'),
  criteria: z.record(z.unknown()),
  timeout: z.number().positive().default(10000),
  strict: z.boolean().default(true),
});

export const ScrollActionSchema = z.object({
  type: z.literal('scroll'),
  direction: z.enum(['up', 'down', 'left', 'right']).default('down'),
  amount: z.enum(['page', 'screen', 'element']).default('page'),
  selector: z.string().optional(),
  timeout: z.number().positive().default(10000),
});

export const ScreenshotActionSchema = z.object({
  type: z.literal('screenshot'),
  fullPage: z.boolean().default(true),
  selector: z.string().optional(),
  quality: z.number().min(1).max(100).default(90),
  timeout: z.number().positive().default(10000),
});

export const ExtractActionSchema = z.object({
  type: z.literal('extract'),
  selector: z.string().optional(),
  format: z.enum(['text', 'html', 'json', 'data']).default('text'),
  timeout: z.number().positive().default(10000),
});

// Union of all action schemas
export const AgentActionSchema = z.discriminatedUnion('type', [
  NavigateActionSchema,
  ClickActionSchema,
  InputActionSchema,
  SearchActionSchema,
  WaitActionSchema,
  ValidateActionSchema,
  ScrollActionSchema,
  ScreenshotActionSchema,
  ExtractActionSchema,
]);

// Task plan schema
export const TaskPlanSchema = z.object({
  id: z.string().uuid(),
  instruction: z.string().nonempty(),
  steps: z.array(z.object({
    id: z.string().uuid(),
    type: z.enum(['navigate', 'click', 'input', 'wait', 'search', 'validate', 'scroll', 'screenshot', 'extract']),
    description: z.string(),
    parameters: z.record(z.unknown()),
    timeout: z.number().positive(),
    retries: z.number().int().min(0).default(0),
    dependencies: z.array(z.string()).optional(),
    required: z.boolean().default(true),
    rollbackSteps: z.array(z.any()).optional(),
  })),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  estimatedDuration: z.number().positive(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  fallbackStrategy: z.string().optional(),
  context: z.any().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Element selection schema
export const ElementSelectionSchema = z.object({
  index: z.number().int().min(0),
  text: z.string(),
  type: z.string(),
  confidence: z.number().min(0).max(1),
  bounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  attributes: z.record(z.string()),
  isVisible: z.boolean(),
  isInteractive: z.boolean(),
  xpath: z.string().optional(),
  cssSelector: z.string().optional(),
});

// Validation result schema
export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  confidence: z.number().min(0).max(1),
  criteria: z.object({
    elementFound: z.boolean(),
    actionCompleted: z.boolean(),
    stateChanged: z.boolean(),
    expectedContent: z.string().optional(),
    actualContent: z.string().optional(),
    errorMessages: z.array(z.string()).optional(),
  }),
  suggestions: z.array(z.string()),
  shouldRetry: z.boolean(),
  retryCount: z.number().min(0).optional(),
  executionTime: z.number().positive(),
});

// Performance metrics schema
export const PerformanceMetricsSchema = z.object({
  executionTime: z.number().positive(),
  successRate: z.number().min(0).max(1),
  errorCount: z.number().min(0),
  averageResponseTime: z.number().positive(),
  memoryUsage: z.number().min(0),
  lastUpdated: z.number().positive(),
  agentMetrics: z.record(z.object({
    executions: z.number().min(0),
    successes: z.number().min(0),
    failures: z.number().min(0),
    averageTime: z.number().positive(),
  })),
});

// Type exports
export type AgentAction = z.infer<typeof AgentActionSchema>;
export type TaskPlan = z.infer<typeof TaskPlanSchema>;
export type ElementSelection = z.infer<typeof ElementSelectionSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;

// Validation utilities
export class AgentSchemaValidator {
  static validateAction(action: unknown): AgentAction {
    return AgentActionSchema.parse(action);
  }
  
  static validateTaskPlan(plan: unknown): TaskPlan {
    return TaskPlanSchema.parse(plan);
  }
  
  static validateElementSelection(selection: unknown): ElementSelection {
    return ElementSelectionSchema.parse(selection);
  }
  
  static validateValidationResult(result: unknown): ValidationResult {
    return ValidationResultSchema.parse(result);
  }
  
  static validatePerformanceMetrics(metrics: unknown): PerformanceMetrics {
    return PerformanceMetricsSchema.parse(metrics);
  }
  
  static safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: z.ZodError } {
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return { success: false, error: result.error };
    }
  }
  
  static validateActionArray(actions: unknown[]): AgentAction[] {
    return actions.map(action => this.validateAction(action));
  }
  
  static createActionValidator() {
    return {
      navigate: (data: any) => NavigateActionSchema.parse(data),
      click: (data: any) => ClickActionSchema.parse(data),
      input: (data: any) => InputActionSchema.parse(data),
      search: (data: any) => SearchActionSchema.parse(data),
      wait: (data: any) => WaitActionSchema.parse(data),
      validate: (data: any) => ValidateActionSchema.parse(data),
      scroll: (data: any) => ScrollActionSchema.parse(data),
      screenshot: (data: any) => ScreenshotActionSchema.parse(data),
    };
  }
}