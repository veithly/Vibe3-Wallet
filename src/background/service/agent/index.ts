// Multi-Agent Automation System
//
// A sophisticated automation system for Vibe3-Wallet that enables
// complex web interactions through AI-powered agent coordination.
//
// @module MultiAgentSystem

// Configuration management
export * from './schemas/AgentConfig';

// Schema validation - with explicit exports to avoid conflicts
export {
  AgentActionSchema,
  TaskPlanSchema,
  ElementSelectionSchema,
  ValidationResultSchema,
  PerformanceMetricsSchema,
  AgentSchemaValidator,
  type AgentAction,
  type TaskPlan as SchemaTaskPlan,
  type ElementSelection,
  type ValidationResult as SchemaValidationResult,
  type PerformanceMetrics as SchemaPerformanceMetrics
} from './schemas/AgentSchemas';

// Core types and interfaces - selective exports to avoid conflicts
export {
  AgentCapability,
  AgentStatus,
  AgentError,
  AgentConfiguration,
  ExecutionContext,
  AgentMessage,
  PlanStep,
  SelectedElement,
  TaskExecutionStatus
} from './agents/AgentTypes';

// Enhanced highlighting and navigation components
// ElementHighlighter removed (deprecated)

// Legacy EnhancedNavigatorAgent removed

// Export conflicting types with aliases
import {
  PerformanceMetrics as AgentPerformanceMetrics,
  TaskPlan as AgentTaskPlan,
  ValidationResult as AgentValidationResult
} from './agents/AgentTypes';

export {
  AgentPerformanceMetrics as PerformanceMetrics_Agent,
  AgentTaskPlan as TaskPlan_Agent,
  AgentValidationResult as ValidationResult_Agent
};

// System version
export const MULTI_AGENT_VERSION = '1.0.0';

// System capabilities
export const SYSTEM_CAPABILITIES = [
  'natural_language_processing',
  'web_automation',
  'element_selection',
  'task_planning',
  'error_recovery',
  'performance_monitoring',
  'multi_agent_coordination',
  'visual_element_highlighting',
  'colored_box_feedback',
  'interactive_element_indexing',
] as const;

// Default export for easy importing
export default {
  version: MULTI_AGENT_VERSION,
  capabilities: SYSTEM_CAPABILITIES,
};
