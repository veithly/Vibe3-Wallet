import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { createLogger } from '@/utils/logger';

const logger = createLogger('MessageManager');

class MessageManager {
  private messages: (SystemMessage | HumanMessage | AIMessage)[] = [];

  constructor() {}

  public addMessage(message: SystemMessage | HumanMessage | AIMessage): void {
    this.messages.push(message);
  }

  public getMessages(): (SystemMessage | HumanMessage | AIMessage)[] {
    return this.messages;
  }

  public clearMessages(): void {
    this.messages = [];
  }

  public initTaskMessages(systemPrompt: string, task: string): void {
    this.clearMessages();
    this.addMessage(new SystemMessage(systemPrompt));
    this.addMessage(new HumanMessage(task));
  }

  public addNewTask(task: string): void {
    this.addMessage(new HumanMessage(task));
  }

  public addPlan(plan: string, position: number): void {
    this.messages.splice(position, 0, new AIMessage(plan));
  }

  public length(): number {
    return this.messages.length;
  }
}

export default MessageManager;
