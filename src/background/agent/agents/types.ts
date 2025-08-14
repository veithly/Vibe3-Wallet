import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ActionResult, agentBrainSchema } from '../types';
import type {
  AgentContext,
  AgentOutput,
  BrowserContext,
  AgentOptions,
} from '../types';

// Re-export types and classes from parent module to maintain consistency
export { ActionResult, agentBrainSchema };
export type { AgentContext, AgentOutput, BrowserContext, AgentOptions };

export interface AgentBrainOptions {
  model: BaseChatModel;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface BaseAgentInterface {
  ModelOutput: any;
  plan: (input: string) => Promise<string>;
  act: (input: string) => Promise<ActionResult>;
}
