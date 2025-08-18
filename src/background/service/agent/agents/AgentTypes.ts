/**
 * Core types and interfaces for the multi-agent automation system
 */

// Core execution context for agent operations
export interface ExecutionContext {
  tabId: string;
  url: string;
  timestamp: number;
  sessionId: string;
  userAgent: string;
  viewport: { width: number; height: number };
  cookies: Array<{ name: string; value: string; domain: string }>;
  localStorage: Record<string, string>;
}

// Agent state interface
export interface AgentState {
  status: 'idle' | 'planning' | 'executing' | 'validating' | 'error' | 'completed';
  currentTask: string;
  stepCount: number;
  maxSteps: number;
  errorCount: number;
  maxErrors: number;
  context: any; // Web3Context
}

// Message structure for agent communication
export interface AgentMessage {
  id: string;
  type: 'request' | 'response' | 'event' | 'error' | 'status';
  from: string;
  to: string;
  content: any;
  timestamp: number;
  correlationId?: string;
}

// Agent execution result
export interface AgentResult {
  success: boolean;
  data?: any;
  error?: string;
  shouldContinue: boolean;
  confidence: number;
  metadata?: Record<string, any>;
}

// Base agent interface
export interface Agent {
  id: string;
  name: string;
  type: 'planner' | 'navigator' | 'validator';
  state: AgentState;
  execute(message: AgentMessage): Promise<AgentResult>;
  handleMessage(message: AgentMessage): Promise<void>;
  canHandle(taskType: string): boolean;
}

// Task planning structure
export interface TaskPlan {
  id: string;
  instruction: string;
  steps: PlanStep[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedDuration: number;
  confidence: number;
  reasoning: string;
  fallbackStrategy?: string;
  context?: ExecutionContext;
  metadata?: Record<string, any>;
}

// Legacy type alias for backward compatibility
export type AgentTaskPlan = TaskPlan;

// Individual plan step
export interface PlanStep {
  id: string;
  type: 'navigate' | 'click' | 'input' | 'wait' | 'search' | 'validate' | 'scroll' | 'screenshot' | 'extract';
  description: string;
  parameters: Record<string, any>;
  timeout: number;
  retries: number;
  dependencies?: string[];
  required: boolean;
  rollbackSteps?: PlanStep[];
}

// Element selection result
export interface SelectedElement {
  index: number;
  text: string;
  type: string;
  confidence: number;
  bounds: { x: number; y: number; width: number; height: number };
  attributes: Record<string, string>;
  isVisible: boolean;
  isInteractive: boolean;
  xpath?: string;
  cssSelector?: string;
}

// Validation result
export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  criteria: {
    elementFound: boolean;
    actionCompleted: boolean;
    stateChanged: boolean;
    expectedContent?: string;
    actualContent?: string;
    errorMessages?: string[];
  };
  suggestions: string[];
  shouldRetry: boolean;
  retryCount?: number;
  executionTime: number;
}

// Performance metrics
export interface PerformanceMetrics {
  executionTime: number;
  successRate: number;
  errorCount: number;
  averageResponseTime: number;
  memoryUsage: number;
  lastUpdated: number;
  agentMetrics: Record<string, {
    executions: number;
    successes: number;
    failures: number;
    averageTime: number;
  }>;
}

// Agent capabilities
export enum AgentCapability {
  PLANNING = 'planning',
  NAVIGATION = 'navigation',
  ELEMENT_SELECTION = 'element_selection',
  VALIDATION = 'validation',
  ERROR_HANDLING = 'error_handling',
  CONTENT_ANALYSIS = 'content_analysis',
  VISUAL_RECOGNITION = 'visual_recognition'
}

// Agent status
export enum AgentStatus {
  IDLE = 'idle',
  PLANNING = 'planning',
  EXECUTING = 'executing',
  VALIDATING = 'validating',
  ERROR = 'error',
  COMPLETED = 'completed'
}

// Task execution status
export interface TaskExecutionStatus {
  taskId: string;
  status: AgentStatus;
  currentStep: number;
  totalSteps: number;
  progress: number;
  startTime: number;
  estimatedCompletion?: number;
  errors: string[];
  warnings: string[];
  metadata?: Record<string, any>;
}

// Error handling
export interface AgentError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
  timestamp: number;
  recoverable: boolean;
  recoverySuggestions?: string[];
}

// Agent configuration
export interface AgentConfiguration {
  id: string;
  name: string;
  capabilities: AgentCapability[];
  maxConcurrentTasks: number;
  timeout: number;
  retries: number;
  enabled: boolean;
  config?: Record<string, any>;
}