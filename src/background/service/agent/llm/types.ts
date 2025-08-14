// Type definitions for the Web3 Agent LLM system
import { BaseMessage } from './messages';
import { Web3Intent } from '../intent/IntentRecognizer';

export interface LLMResponse {
  response: string;
  actions: LLMAction[];
  confidence: number;
  thinking: string;
}

export interface LLMAction {
  type: string;
  params: Record<string, any>;
  confidence: number;
  reasoning: string;
}

export interface Web3Context {
  currentChain: number;
  currentAddress: string;
  balances: Record<string, string>;
  allowances: Record<string, Record<string, string>>;
  gasPrices: Record<number, string>;
  protocols: Record<string, any>;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface IWeb3LLM {
  generateResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent
  ): Promise<LLMResponse>;
}
