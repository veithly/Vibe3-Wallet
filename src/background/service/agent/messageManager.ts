// Local message interface implementations - no external dependencies
export interface BaseMessage {
  content: string;
  role: 'system' | 'user' | 'assistant';
  timestamp?: number;
  _getType(): string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Local message implementations
export class HumanMessage implements BaseMessage {
  role = 'user' as const;
  content: string;
  timestamp?: number;

  constructor(content: string) {
    this.content = content;
    this.timestamp = Date.now();
  }

  _getType(): string {
    return 'human';
  }
}

export class AIMessage implements BaseMessage {
  role = 'assistant' as const;
  content: string;
  timestamp?: number;

  constructor(content: string) {
    this.content = content;
    this.timestamp = Date.now();
  }

  _getType(): string {
    return 'ai';
  }
}

export class SystemMessage implements BaseMessage {
  role = 'system' as const;
  content: string;
  timestamp?: number;

  constructor(content: string) {
    this.content = content;
    this.timestamp = Date.now();
  }

  _getType(): string {
    return 'system';
  }
}

export class MessageManager {
  private messages: BaseMessage[] = [];
  private maxMessages: number = 50; // Limit to prevent memory issues

  constructor(maxMessages: number = 50) {
    this.maxMessages = maxMessages;
  }

  initTaskMessages(systemMessage: string, task: string): void {
    this.messages = [];
    this.messages.push(new SystemMessage(systemMessage));
    this.messages.push(new HumanMessage(task));
  }

  addMessage(role: string, content: string): void {
    let message: BaseMessage;
    switch (role) {
      case 'user':
      case 'human':
        message = new HumanMessage(content);
        break;
      case 'assistant':
      case 'ai':
        message = new AIMessage(content);
        break;
      case 'system':
        message = new SystemMessage(content);
        break;
      default:
        message = new HumanMessage(content);
        break;
    }

    this.messages.push(message);

    // Keep only the last maxMessages messages (but preserve system message)
    if (this.messages.length > this.maxMessages) {
      const systemMessages = this.messages.filter(
        (msg) => msg._getType() === 'system'
      );
      const otherMessages = this.messages
        .filter((msg) => msg._getType() !== 'system')
        .slice(-this.maxMessages + systemMessages.length);
      this.messages = [...systemMessages, ...otherMessages];
    }
  }

  addNewTask(task: string): void {
    this.addMessage('user', task);
  }

  addStateMessage(state: BaseMessage): void {
    this.messages.push(state);
  }

  removeLastStateMessage(): void {
    if (this.messages.length > 0) {
      this.messages.pop();
    }
  }

  addModelOutput(output: any): void {
    const content =
      typeof output === 'string' ? output : JSON.stringify(output);
    this.addMessage('assistant', content);
  }

  addMessageWithTokens(message: BaseMessage): void {
    this.messages.push(message);
  }

  getMessages(): BaseMessage[] {
    return [...this.messages];
  }

  length(): number {
    return this.messages.length;
  }

  clear(): void {
    this.messages = [];
  }

  // Convert to simple messages for UI display
  toSimpleMessages(): Message[] {
    return this.messages.map((msg) => ({
      role:
        msg._getType() === 'human'
          ? 'user'
          : msg._getType() === 'ai'
          ? 'assistant'
          : 'system',
      content:
        typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content),
    }));
  }
}
