// Mock implementations of LangChain message types for development
// In production, these would be imported from @langchain/core/messages

export interface BaseMessage {
  content: string;
  type: string;
  /**
   * Extra fields carried along with the message. Used for provider-specific data
   * like OpenAI tool calls (e.g. tool_calls on assistant, tool_call_id on tool).
   */
  additional_kwargs?: Record<string, any>;
  /** Optional tool name for tool messages */
  name?: string;
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
  additional_kwargs?: Record<string, any>;

  constructor(content: string, additional_kwargs?: Record<string, any>) {
    this.content = content;
    this.additional_kwargs = additional_kwargs;
  }
}

/**
 * Tool message used to provide tool/function results back to the model in ReAct loops
 * Following OpenAI's chat tool message format
 */
export class ToolMessage implements BaseMessage {
  type = 'tool';
  content: string;
  name?: string;
  additional_kwargs?: Record<string, any>;

  constructor(params: {
    content: string;
    name: string;
    tool_call_id: string;
  }) {
    this.content = params.content;
    this.name = params.name;
    this.additional_kwargs = { tool_call_id: params.tool_call_id };
  }
}

/**
 * ReAct Thought message for reasoning steps in the ReAct pattern
 */
export class ReActThoughtMessage implements BaseMessage {
  type = 'react_thought';
  content: string;
  step: number;
  additional_kwargs?: Record<string, any>;

  constructor(content: string, step: number, additional_kwargs?: Record<string, any>) {
    this.content = content;
    this.step = step;
    this.additional_kwargs = additional_kwargs;
  }
}

/**
 * ReAct Action message for actions taken in the ReAct pattern
 */
export class ReActActionMessage implements BaseMessage {
  type = 'react_action';
  content: string;
  step: number;
  functionCalls?: FunctionCall[];
  additional_kwargs?: Record<string, any>;

  constructor(content: string, step: number, functionCalls?: FunctionCall[], additional_kwargs?: Record<string, any>) {
    this.content = content;
    this.step = step;
    this.functionCalls = functionCalls;
    this.additional_kwargs = additional_kwargs;
  }
}

/**
 * ReAct Observation message for tool execution results in the ReAct pattern
 */
export class ReActObservationMessage implements BaseMessage {
  type = 'react_observation';
  content: string;
  step: number;
  toolName: string;
  additional_kwargs?: Record<string, any>;

  constructor(content: string, step: number, toolName: string, additional_kwargs?: Record<string, any>) {
    this.content = content;
    this.step = step;
    this.toolName = toolName;
    this.additional_kwargs = additional_kwargs;
  }
}

/**
 * Function call interface for structured tool calling
 */
export interface FunctionCall {
  name: string;
  arguments: Record<string, any>;
  id?: string;
}
