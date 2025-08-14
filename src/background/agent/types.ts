// Local base model interface - no external dependencies
export interface BaseChatModel {
  call: (messages: any[]) => Promise<any>;
  invoke: (messages: any[]) => Promise<any>;
}

export class ActionResult {
  isDone?: boolean;
  extractedContent?: string;
  includeInMemory?: boolean;
  error?: string;
  success?: boolean;

  constructor(
    options: {
      isDone?: boolean;
      extractedContent?: string;
      includeInMemory?: boolean;
      error?: string;
      success?: boolean;
    } = {}
  ) {
    this.isDone = options.isDone;
    this.extractedContent = options.extractedContent;
    this.includeInMemory = options.includeInMemory;
    this.error = options.error;
    this.success = options.success;
  }
}

export interface AgentOutput<T = any> {
  id: string;
  result?: T;
  error?: string;
}

export interface StepInfo {
  stepNumber: number;
  maxSteps: number;
}

export interface AgentContext {
  browserContext: BrowserContext;
  options: AgentOptions;
  emitEvent: (actor: string, state: string, message: string) => void;
  controller: AbortController;
  messageManager: any;
  paused: boolean;
  stopped: boolean;
  actionResults: ActionResult[];
  stateMessageAdded: boolean;
  stepInfo?: StepInfo;
}

export interface BrowserContext {
  navigateTo: (url: string) => Promise<void>;
  getCurrentPage: () => Promise<any>;
  getAllTabIds: () => Promise<Set<number>>;
  switchTab: (tabId: number) => Promise<void>;
  openTab: (url: string) => Promise<void>;
  closeTab: (tabId: number) => Promise<void>;
  getState: (useVision?: boolean) => Promise<any>;
  getCachedState: (useVision?: boolean) => Promise<any>;
}

export interface AgentOptions {
  useVision?: boolean;
  maxTokens?: number;
  temperature?: number;
  includeAttributes?: boolean;
}

export interface ModelOutput {
  [key: string]: any;
}

export interface BaseAgent {
  ModelOutput: ModelOutput;
  plan: (input: string) => Promise<string>;
  act: (input: string) => Promise<ActionResult>;
}

export interface AgentBrainOptions {
  model: BaseChatModel;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ActionSchema {
  name: string;
  description: string;
  schema: any;
}

export const agentBrainSchema = {
  name: 'agentBrain',
  description: 'Agent brain for processing tasks',
  schema: {},
};
