// Enhanced type definitions for multi-agent coordination and browser automation

// Core types for validation system
export interface ValidationResult {
  isValid: boolean;
  score: number;
  message: string;
  severity: 'info' | 'warning' | 'error';
  details: Record<string, any>;
}

export interface ValidationReport {
  id: string;
  timestamp: number;
  overallScore: number;
  validations: Array<{
    criteria: any;
    result: ValidationResult;
    weight: number;
    timestamp: number;
  }>;
  passed: Array<any>;
  failed: Array<any>;
  warnings: Array<any>;
  metadata: Record<string, any>;
}

export interface ValidationCriteria {
  type: 'completion' | 'accuracy' | 'security' | 'performance' | 'compliance';
  name: string;
  description: string;
  required: boolean;
  weight: number;
  validator: (context: any) => Promise<ValidationResult>;
}

// Web3 context type
export interface Web3Context {
  currentChain: number;
  currentAddress: string;
  balances: Record<string, string>;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  tabId?: number;
}

// Task analysis type
export interface TaskAnalysis {
  id: string;
  intentId: string;
  taskType: 'navigation' | 'form_filling' | 'content_extraction' | 'web3_transaction' | 'web3_operation' | 'interaction' | 'automation';
  complexity: 'low' | 'medium' | 'high';
  estimatedDuration: number;
  requiredCapabilities: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  browserActions?: string[];
}

// Core multi-agent types
export interface MultiStepExecutor {
  id: string;
  sessionId: string;
  currentPlan?: ExecutionPlan;
  executionHistory: EnhancedAction[];
  isExecuting: boolean;
  startTime?: number;
  endTime?: number;
}

export interface ExecutionPlan {
  id: string;
  name: string;
  description: string;
  actions: EnhancedAction[];
  dependencies: string[];
  estimatedDuration: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  requiresConfirmation: boolean;
  metadata: Record<string, any>;
}

export interface EnhancedAction {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  result?: ActionResult;
  error?: string;
  type?: string;
  params?: any;
  dependencies?: string[];
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  agentType: 'planner' | 'navigator' | 'validator' | 'web3' | 'browser';
  priority: number;
  retries: number;
  maxRetries: number;
  timeout: number;
  fallbackActions?: string[];
  contextRequirements?: ContextRequirement[];
}

export interface ContextRequirement {
  type: 'wallet_state' | 'browser_state' | 'network_state' | 'ui_state';
  required: boolean;
  description: string;
  validator?: (context: any) => boolean;
}

// Enhanced intent types
export interface EnhancedIntent {
  id: string;
  action: string;
  confidence: number;
  parameters: Record<string, any>;
  context: {
    currentChain: number;
    currentAddress: string;
    balances: Record<string, string>;
    riskLevel: string;
  };
  taskAnalysis: {
    id: string;
    intentId: string;
    taskType: string;
    complexity: string;
    estimatedDuration: number;
    requiredCapabilities: string[];
    riskLevel: string;
  };
  subIntents?: EnhancedIntent[];
  validationRules?: ValidationRule[];
  executionStrategy: ExecutionStrategy;
}

export interface ValidationRule {
  type: 'parameter' | 'context' | 'security' | 'network';
  field: string;
  condition: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  operator?: 'equals' | 'contains' | 'regex' | 'greater_than' | 'less_than';
  value?: string;
}

export interface ExecutionStrategy {
  mode: 'sequential' | 'parallel' | 'adaptive';
  maxConcurrency: number;
  errorHandling: 'stop_on_error' | 'continue_on_error' | 'retry';
  optimization: 'speed' | 'safety' | 'balanced';
}

// Browser state management
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
  readyState: DocumentReadyState;
  hasForms: boolean;
  hasInputs: boolean;
  hasButtons: boolean;
  hasLinks: boolean;
  visibleElements: ElementInfo[];
  hiddenElements: ElementInfo[];
}

export interface ElementInfo {
  selector: string;
  tag: string;
  text: string;
  visible: boolean;
  interactive: boolean;
  attributes: Record<string, string>;
  boundingBox?: BoundingBox;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
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

// Wallet state management
export interface WalletState {
  isConnected: boolean;
  currentAddress: string;
  chainId: number;
  balances: TokenBalance[] | Record<string, string>;
  allowances: TokenAllowance[];
  nonce: number;
  gasPrice: string;
  contracts: ContractInfo[];
}

export interface TokenBalance {
  symbol: string;
  address: string;
  balance: string;
  decimals: number;
  valueUsd: number;
}

export interface TokenAllowance {
  tokenAddress: string;
  spenderAddress: string;
  amount: string;
  expires?: number;
}

export interface ContractInfo {
  address: string;
  name: string;
  abi: any[];
  isVerified: boolean;
}

// Enhanced action results
export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
  warnings?: string[];
  timing: number;
  metadata: Record<string, any>;
  nextState?: Partial<BrowserState | WalletState>;
}

// Agent coordination types
export interface AgentMessage {
  id: string;
  from: string;
  to: string | string[];
  type: 'request' | 'response' | 'broadcast' | 'error';
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  payload: any;
  requiresResponse: boolean;
  responseTo?: string;
}

export interface AgentStatus {
  id: string;
  type: string;
  state: 'idle' | 'busy' | 'error' | 'offline';
  currentTask?: string;
  performance: AgentPerformance;
  capabilities: string[];
  lastActivity: number;
}

export interface AgentPerformance {
  tasksCompleted: number;
  averageResponseTime: number;
  successRate: number;
  errorRate: number;
  currentLoad: number;
}

// Element selection and interaction
export interface ElementSelector {
  strategy: 'css' | 'xpath' | 'text' | 'attribute' | 'visual' | 'ai';
  selector: string;
  fallbackSelectors?: ElementSelector[];
  confidence: number;
  context?: string;
}

export interface InteractionResult {
  success: boolean;
  element?: ElementInfo;
  action: string;
  result: any;
  timing: number;
  sideEffects?: string[];
}

// Multi-agent coordination events
export interface CoordinationEvent {
  id: string;
  type: 'task_start' | 'task_complete' | 'task_error' | 'agent_state_change' | 'context_update';
  timestamp: number;
  source: string;
  target?: string;
  data: any;
  priority: 'low' | 'medium' | 'high';
}

// Error recovery and retry logic
export interface RecoveryStrategy {
  type: 'retry' | 'fallback' | 'skip' | 'abort';
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
  conditions: RecoveryCondition[];
}

export interface RecoveryCondition {
  type: 'error_type' | 'error_code' | 'timeout' | 'network_error';
  value: string;
  operator: 'equals' | 'contains' | 'regex' | 'greater_than' | 'less_than';
}

// Performance monitoring
export interface PerformanceMetrics {
  sessionId: string;
  startTime: number;
  endTime?: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageExecutionTime: number;
  memoryUsage: number[];
  cpuUsage: number[];
  networkRequests: number;
  errors: ErrorInfo[];
}

export interface ErrorInfo {
  timestamp: number;
  type: string;
  message: string;
  stack?: string;
  context: any;
  recoveryAttempted: boolean;
  recoverySuccessful?: boolean;
}

// Streaming and real-time updates
export interface StreamUpdate {
  id: string;
  type: 'thinking' | 'action' | 'result' | 'error' | 'status';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
  progress?: number;
}

export interface StreamSession {
  id: string;
  sessionId: string;
  isActive: boolean;
  subscribers: string[];
  updates: StreamUpdate[];
  startTime: number;
  endTime?: number;
}

// Security and validation
export interface SecurityCheck {
  type: 'url_validation' | 'domain_check' | 'content_scan' | 'behavior_analysis';
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details?: any;
  recommendation?: string;
}

export interface RiskAssessment {
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: RiskFactor[];
  recommendations: string[];
  mitigations: string[];
}

export interface RiskFactor {
  type: string;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  weight: number;
  evidence?: any;
}

// Configuration and settings
export interface AgentConfig {
  maxConcurrentTasks: number;
  defaultTimeout: number;
  retryAttempts: number;
  maxRetries?: number;
  enableStreaming: boolean;
  enableOptimization: boolean;
  securityLevel: 'low' | 'medium' | 'high';
  performanceMode: 'speed' | 'balanced' | 'safety';
  customSettings?: Record<string, any>;
}

// Context management
export interface ContextSnapshot {
  id: string;
  timestamp: number;
  browserState: BrowserState;
  walletState: WalletState;
  agentStates: Record<string, AgentStatus>;
  activeTasks: string[];
  messages: AgentMessage[];
  metadata: Record<string, any>;
}

export interface ContextDiff {
  before: ContextSnapshot;
  after: ContextSnapshot;
  changes: ContextChange[];
  timestamp: number;
}

export interface ContextChange {
  type: 'browser' | 'wallet' | 'agent' | 'task' | 'message';
  field: string;
  oldValue: any;
  newValue: any;
  significance: 'low' | 'medium' | 'high';
}

// Note: All types are already exported as interfaces above