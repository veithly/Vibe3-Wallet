import { createLogger } from '@/utils/logger';

const logger = createLogger('BaseAgent');

export interface AgentOutput<T = unknown> {
  id: string;
  result?: T;
  error?: string;
}

export interface BaseAgentOptions {
  chatLLM: any; // BaseChatModel from langchain
  task: string;
  tabId: number;
}

export abstract class BaseAgent<T = unknown> {
  protected id: string;
  protected chatLLM: any;
  protected task: string;
  protected tabId: number;

  constructor(id: string, options: BaseAgentOptions) {
    this.id = id;
    this.chatLLM = options.chatLLM;
    this.task = options.task;
    this.tabId = options.tabId;

    logger.info(`Initialized ${id} agent for task: ${options.task}`);
  }

  abstract execute(): Promise<AgentOutput<T>>;

  protected async invokeModel(messages: any[]): Promise<any> {
    try {
      const response = await this.chatLLM.invoke(messages);
      return response;
    } catch (error) {
      logger.error(`${this.id} model invocation failed:`, error);
      throw error;
    }
  }

  protected emitEvent(state: string, data?: any) {
    // This would integrate with the event system
    logger.info(`${this.id}: ${state}`, data);
  }
}
