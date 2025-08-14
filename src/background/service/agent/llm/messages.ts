// Mock implementations of LangChain message types for development
// In production, these would be imported from @langchain/core/messages

export interface BaseMessage {
  content: string;
  type: string;
  additional_kwargs?: Record<string, any>;
}

export interface BaseChatModel {
  modelName: string;
  temperature: number;
  invoke(messages: BaseMessage[], options?: any): Promise<any>;
  _generate(messages: any[], options?: any): Promise<any>;
  _llmType(): string;
}

export class SystemMessage implements BaseMessage {
  type = 'system';
  content: string;

  constructor(content: string) {
    this.content = content;
  }
}

export class HumanMessage implements BaseMessage {
  type = 'human';
  content: string;

  constructor(content: string) {
    this.content = content;
  }
}

export class AIMessage implements BaseMessage {
  type = 'ai';
  content: string;

  constructor(content: string) {
    this.content = content;
  }
}
