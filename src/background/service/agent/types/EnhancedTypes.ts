// Enhanced type definitions for Vibe3-Wallet Agent System
// This file provides additional types for the multi-agent architecture

import { 
  ExecutionEvent, 
  ActionResult, 
  AgentContext, 
  ActionStep, 
  Web3Context 
} from '../types';

// Core Agent Types
export interface AgentConfig {
  id: string;
  name: string;
  type: 'planner' | 'navigator' | 'validator' | 'web3' | 'coordinator';
  capabilities: string[];
  maxRetries: number;
  timeout: number;
  enabled: boolean;
}

export interface AgentState {
  id: string;
  status: 'idle' | 'active' | 'busy' | 'error' | 'paused';
  currentTask?: string;
  lastActivity: number;
  errorCount: number;
  performance: AgentPerformance;
}

export interface AgentPerformance {
  tasksCompleted: number;
  averageExecutionTime: number;
  successRate: number;
  errorRate: number;
  lastExecutionTime?: number;
}

// Enhanced Intent and Task Types
export interface EnhancedIntent {
  id: string;
  action: string;
  parameters: Record<string, any>;
  confidence: number;
  source: 'user' | 'system' | 'automation';
  timestamp: number;
  context?: Web3Context;
  validationRules?: ValidationRule[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any>;
}

export interface TaskAnalysis {
  id: string;
  intentId: string;
  taskType: TaskType;
  complexity: ComplexityLevel;
  estimatedDuration: number;
  requiredCapabilities: string[];
  riskLevel: RiskLevel;
  browserActions?: string[];
  web3Actions?: string[];
  dependencies?: string[];
  contextRequirements?: ContextRequirement[];
  optimizationSuggestions?: string[];
}

export type TaskType = 
  | 'navigation'
  | 'form_filling'
  | 'content_extraction'
  | 'web3_transaction'
  | 'interaction'
  | 'automation'
  | 'validation'
  | 'coordination';

export type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'expert';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Execution and Action Types
export interface ExecutionPlan {
  id: string;
  name: string;
  description: string;
  actions: EnhancedAction[];
  dependencies: string[];
  estimatedDuration: number;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  metadata: PlanMetadata;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused';
  createdAt: number;
  updatedAt: number;
  executionStrategy?: ExecutionStrategy;
}

export interface EnhancedAction extends ActionStep {
  agentType: string;
  priority: number;
  retries: number;
  maxRetries: number;
  timeout: number;
  contextRequirements?: ContextRequirement[];
  fallbackActions?: string[];
  metadata?: Record<string, any>;
}

export interface ExecutionStrategy {
  parallelization: 'none' | 'partial' | 'full';
  errorHandling: 'continue' | 'stop_on_error' | 'retry_all';
  optimization: 'none' | 'basic' | 'aggressive';
  fallbackEnabled: boolean;
  maxConcurrentActions: number;
}

// Context and State Types
export interface BrowserState {
  currentUrl: string;
  title: string;
  activeTabId: number;
  availableTabs: TabInfo[];
  domState: DOMState;
  networkState: NetworkState;
  interactionState: InteractionState;
}

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  status: 'loading' | 'complete' | 'error';
  lastActivity: number;
}

export interface DOMState {
  readyState: string;
  hasForms: boolean;
  hasInputs: boolean;
  hasButtons: boolean;
  hasLinks: boolean;
  visibleElements: ElementInfo[];
  hiddenElements: ElementInfo[];
}

export interface NetworkState {
  isActive: boolean;
  pendingRequests: number;
  lastRequestTime: number;
  responseTimes: number[];
}

export interface InteractionState {
  lastAction: string;
  lastActionTime: number;
  actionQueue: string[];
  isProcessing: boolean;
}

// Element and Interaction Types
export interface ElementInfo {
  selector: string;
  tag: string;
  text: string;
  visible: boolean;
  interactive: boolean;
  attributes: Record<string, string>;
  boundingBox: BoundingBox;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementSelector {
  strategy: 'css' | 'xpath' | 'text' | 'attribute';
  selector: string;
  confidence: number;
  fallbackSelectors?: ElementSelector[];
}

export interface InteractionResult {
  success: boolean;
  element?: ElementInfo;
  action: string;
  result?: any;
  timing: number;
  sideEffects?: string[];
}

// Validation and Rule Types
export interface ValidationRule {
  field: string;
  operator: 'equals' | 'contains' | 'regex' | 'greater_than' | 'less_than';
  value: any;
  message: string;
  required: boolean;
}

export interface ContextRequirement {
  type: 'wallet_state' | 'browser_state' | 'network_state' | 'agent_state';
  required: boolean;
  description: string;
  validator: (context: any) => boolean;
}

// Event and Communication Types
export interface AgentMessage {
  id: string;
  type: 'request' | 'response' | 'event' | 'error';
  from: string;
  to: string;
  payload: any;
  timestamp: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface ConfirmationRequest {
  id: string;
  type: 'action' | 'plan' | 'transaction';
  title: string;
  description: string;
  details: any;
  riskLevel: RiskLevel;
  timeout: number;
  timestamp: number;
}

// Performance and Monitoring Types
export interface AgentMetrics {
  id: string;
  agentId: string;
  timestamp: number;
  executionTime: number;
  memoryUsage: number;
  cpuUsage: number;
  networkRequests: number;
  errorCount: number;
  successCount: number;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  agents: Record<string, AgentState>;
  systemLoad: number;
  memoryUsage: number;
  activeTasks: number;
  errorRate: number;
  lastUpdate: number;
}

// Configuration and Settings Types
export interface AgentSystemConfig {
  agents: AgentConfig[];
  globalSettings: GlobalSettings;
  performanceSettings: PerformanceSettings;
  securitySettings: SecuritySettings;
}

export interface GlobalSettings {
  maxConcurrentTasks: number;
  defaultTimeout: number;
  enableLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enableMetrics: boolean;
  enableOptimization: boolean;
}

export interface PerformanceSettings {
  enableCaching: boolean;
  cacheTimeout: number;
  enableParallelization: boolean;
  maxParallelActions: number;
  enableRetry: boolean;
  maxRetries: number;
  retryDelay: number;
}

export interface SecuritySettings {
  enableConfirmation: boolean;
  confirmationThreshold: RiskLevel;
  enableValidation: boolean;
  maxExecutionTime: number;
  allowedOrigins: string[];
  blockedActions: string[];
}

// Plan Metadata Types
export interface PlanMetadata {
  intent: EnhancedIntent;
  taskAnalysis: TaskAnalysis;
  createdAt: number;
  updatedAt?: number;
  optimizationLevel: number;
  executionHistory?: ExecutionHistory[];
  estimatedCost?: number;
  actualCost?: number;
  tags?: string[];
}

export interface ExecutionHistory {
  timestamp: number;
  action: string;
  result: ActionResult;
  executionTime: number;
  agent: string;
}

// Tool and Action Registry Types
export interface ToolDefinition {
  name: string;
  description: string;
  category: 'system' | 'web3' | 'utility' | 'browser';
  handler: (...args: unknown[]) => unknown;
  schema?: any;
  riskLevel: RiskLevel;
  timeout: number;
  dependencies: string[];
  retryable: boolean;
  requiredPermissions?: string[];
}

// Error Handling Types
export interface AgentError {
  id: string;
  type: 'validation' | 'execution' | 'timeout' | 'network' | 'system';
  message: string;
  details?: any;
  stack?: string;
  timestamp: number;
  agentId?: string;
  actionId?: string;
  taskId?: string;
  recoverable: boolean;
  recoverySuggestions?: string[];
}

// Utility Types
export type PromiseResult<T> = Promise<{
  success: boolean;
  data?: T;
  error?: string;
}>;

export type AsyncResult<T> = Promise<T>;

export interface Disposable {
  dispose(): void;
}

export interface Configurable {
  configure(config: any): void;
  getConfig(): any;
}

// Type Guards
export function isEnhancedIntent(obj: any): obj is EnhancedIntent {
  return obj && 
    typeof obj.id === 'string' &&
    typeof obj.action === 'string' &&
    typeof obj.parameters === 'object' &&
    typeof obj.confidence === 'number';
}

export function isExecutionPlan(obj: any): obj is ExecutionPlan {
  return obj &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.actions) &&
    typeof obj.estimatedDuration === 'number';
}

export function isActionResult(obj: any): obj is ActionResult {
  return obj &&
    typeof obj.success === 'boolean';
}

export function isAgentContext(obj: any): obj is AgentContext {
  return obj &&
    typeof obj.tabId === 'number' &&
    typeof obj.sessionId === 'string' &&
    typeof obj.eventHandler === 'function';
}