// Core multi-agent system
// Legacy MultiAgentSystem removed
export type {
  Agent,
  AgentMessage,
  AgentState,
  AgentResult,
  TaskPlan,
  ValidationResult,
} from './AgentTypes';

// Legacy EnhancedNavigatorAgent removed

// Element selection system
export { IndexBasedElementSelector } from './ElementSelector';
export type {
  ElementInfo,
  SelectionCriteria,
  SelectionResult,
} from './ElementSelector';

// Legacy TaskPlanner removed

// Legacy TaskValidator removed

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