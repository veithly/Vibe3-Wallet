// Core multi-agent system
export { MultiAgentSystem } from './MultiAgentSystem';
export type {
  Agent,
  AgentMessage,
  AgentState,
  AgentResult,
  TaskPlan,
  ValidationResult,
} from './AgentTypes';

// Individual agent implementations
export { EnhancedNavigatorAgent } from './EnhancedNavigatorAgent';

// Element selection system
export { IndexBasedElementSelector } from './ElementSelector';
export type {
  ElementInfo,
  SelectionCriteria,
  SelectionResult,
} from './ElementSelector';

// Task planning system
export { DynamicTaskPlanner } from './TaskPlanner';
export type {
  PlanningContext,
  PlanningStrategy,
  ReplanningTriggers,
} from './TaskPlanner';

// Validation system
export { TaskValidator } from './TaskValidator';
export type {
  ValidationCriteria,
  ValidationContext,
  RetryStrategy,
  ValidationResultWithRetry,
} from './TaskValidator';

// Error handling system
export { EnhancedErrorHandler } from './ErrorHandler';
export type {
  ErrorClassification,
  ErrorContext,
  RecoveryAction,
  RecoveryResult,
  ErrorType,
  ErrorSeverity,
  ErrorCategory,
} from './ErrorHandler';

// Integration layer
export { MultiAgentIntegration } from './MultiAgentIntegration';
export type {
  MultiAgentConfig,
  MultiAgentExecutionResult,
} from './MultiAgentIntegration';

// Utilities and constants
export const MULTI_AGENT_DEFAULT_CONFIG = {
  maxSteps: 20,
  maxErrors: 5,
  enableValidation: true,
  enableReplanning: true,
  enableRecovery: true,
  planningStrategy: 'adaptive' as const,
  retryStrategy: 'exponential' as const,
  timeoutMs: 30000,
};

export const ELEMENT_SELECTION_TIMEOUT = 10000;
export const VALIDATION_TIMEOUT = 15000;
export const RECOVERY_MAX_ATTEMPTS = 3;
export const CIRCUIT_BREAKER_THRESHOLD = 5;