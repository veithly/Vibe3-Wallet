// Type definitions for the Web3 Agent LLM system with function calling support
import { BaseMessage } from './messages';
import { Web3Intent } from '../intent/IntentRecognizer';
import { z } from 'zod';

// Enhanced LLM Response with function calling support
export interface LLMResponse {
  response: string;
  actions: LLMAction[];
  confidence: number;
  thinking: string;
  functionCalls?: FunctionCall[];
  tool_calls?: any[]; // OpenAI tool_calls format support
}

// Function call structure for native function calling
export interface FunctionCall {
  name: string;
  arguments: Record<string, any>;
  id?: string;
}

// Function calling schema
export interface FunctionSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ParameterSchema>;
    required?: string[];
  };
}

export interface ParameterSchema {
  type: string;
  description: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
}

// Streaming response support
export interface StreamingLLMResponse {
  id: string;
  type: 'content' | 'function_call' | 'done';
  content?: string;
  functionCall?: FunctionCall;
  done?: boolean;
  timestamp?: number;
}

export interface LLMAction {
  type: string;
  params: Record<string, any>;
  confidence: number;
  reasoning: string;
  functionCall?: FunctionCall;
}

export interface Web3Context {
  currentChain: number;
  currentAddress: string;
  balances: Record<string, string>;
  allowances: Record<string, Record<string, string>>;
  gasPrices: Record<number, string>;
  protocols: Record<string, any>;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  currentUrl?: string;
}

export interface IWeb3LLM {
  generateResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent,
    tools?: FunctionSchema[]
  ): Promise<LLMResponse>;

  // Streaming support
  generateStreamingResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent,
    tools?: FunctionSchema[],
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<LLMResponse>;

  // Cancel current streaming request (if any)
  cancelStreaming(): void;

  // Function calling support
  supportsFunctionCalling(): boolean;

  // Get available tools
  getAvailableTools(): FunctionSchema[];

  // Get underlying chat model for agent compatibility
  getChatModel(): any;
}
