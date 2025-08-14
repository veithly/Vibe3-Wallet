import { agentIntegrationBridge } from './agent-integration';
import type { AgentExecutorBridge } from './agent-integration';

// Re-export the bridge
export const Executor = agentIntegrationBridge;

// Export the execution event interface for compatibility
export interface ExecutionEvent {
  type: string;
  actor: string;
  state: string;
  timestamp: number;
  data?: any;
}

// Export the bridge type
export type { AgentExecutorBridge };
