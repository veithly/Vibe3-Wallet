// Types for agent functionality
export interface ExecutionEvent {
  type: string;
  actor: string;
  state: string;
  timestamp: number;
  data?: any;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  code?: string;
  data?: any;
  details?: any;
  balance?: string;
  txHash?: string;
  connected?: boolean;
  switched?: boolean;
  fallback?: boolean;
  outputAmount?: string;
}

export interface AgentContext {
  tabId: number;
  sessionId: string;
  origin?: string;
  eventHandler: (event: ExecutionEvent) => void;
  sendConfirmationRequest?: (confirmation: any) => Promise<any>;
  llm?: any;
  // Additional properties for Web3 functionality
  currentChain?: string;
  currentAddress?: string;
  riskLevel?: string;
  balances?: Record<string, string>;
  gasPrices?: Record<string, string>;
  protocols?: Record<string, any>;
}

export interface ActionStep {
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
}

export interface ActionDefinition {
  name: string;
  description: string;
  timeout: number;
  category: 'system' | 'web3' | 'utility' | 'browser';
  handler: (...args: unknown[]) => unknown;
  dependencies: string[];
  riskLevel: 'high' | 'low' | 'medium';
  retryable: boolean;
  schema?: any;
}

export interface Web3Context {
  currentChain: number;
  currentAddress: string;
  balances: Record<string, string>;
  riskLevel: string;
}

export class Executor {
  constructor(
    private task: string,
    private tabId: number,
    private eventHandler: (event: ExecutionEvent) => void
  ) {}

  async execute(): Promise<void> {
    // Stub implementation
    this.eventHandler({
      type: 'execution',
      actor: 'EXECUTOR',
      state: 'TASK_START',
      timestamp: Date.now(),
      data: { task: this.task },
    });

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 1000));

    this.eventHandler({
      type: 'execution',
      actor: 'EXECUTOR',
      state: 'TASK_COMPLETE',
      timestamp: Date.now(),
      data: { task: this.task, result: 'Completed successfully' },
    });
  }

  async cancel(): Promise<void> {
    this.eventHandler({
      type: 'execution',
      actor: 'EXECUTOR',
      state: 'TASK_CANCEL',
      timestamp: Date.now(),
      data: { task: this.task },
    });
  }
}
