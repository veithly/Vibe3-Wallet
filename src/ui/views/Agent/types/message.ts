export enum Actors {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  PLANNER = 'planner',
  NAVIGATOR = 'navigator',
  VALIDATOR = 'validator',
}

export interface FunctionCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  result?: any;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  timestamp: number;
}

export interface ThinkingStep {
  step: number;
  content: string;
  type: 'thinking' | 'planning' | 'reasoning' | 'analysis';
  timestamp: number;
}

export interface ReActStatusMessage {
  isThinking: boolean;
  isActing: boolean;
  currentStep: number;
  maxSteps: number;
  currentAction?: string;
  thinkingContent?: string;
  isActive: boolean;
  timestamp: number;
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  result: any;
  success: boolean;
  timestamp: number;
}

export interface Message {
  actor: Actors;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  messageId?: string;
  functionCalls?: FunctionCall[];
  thinking?: ThinkingStep[];
  reactStatus?: ReActStatusMessage;
  toolResults?: ToolResult[];
  finishReason?: string;
  messageType?: 'standard' | 'thinking' | 'function_call' | 'reasoning' | 'react_status' | 'execution' | 'error' | 'streaming_start' | 'streaming_chunk' | 'streaming_complete' | 'streaming_error' | 'speech_to_text_error' | 'fallback' | 'fallback_complete' | 'tool_result' | 'assistant_content' | 'wallet_auto_connected' | 'wallet_auto_signed' | 'wallet_auto_approved_tx' | 'wallet_confirmation_request' | 'wallet_contract_callback';
}

export interface ActorProfile {
  name: string;
  description: string;
  icon: string;
  iconBackground: string;
  color: string;
}

export const ACTOR_PROFILES: Record<Actors, ActorProfile> = {
  [Actors.USER]: {
    name: 'User',
    description: 'Your commands and questions',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#4A90E2',
    color: '#4A90E2',
  },
  [Actors.ASSISTANT]: {
    name: 'Assistant',
    description: 'AI assistant responses',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#7C3AED',
    color: '#7C3AED',
  },
  [Actors.SYSTEM]: {
    name: 'System',
    description: 'System messages and notifications',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#6B7280',
    color: '#6B7280',
  },
  [Actors.PLANNER]: {
    name: 'Planner',
    description: 'Planning and strategy development',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#10B981',
    color: '#10B981',
  },
  [Actors.NAVIGATOR]: {
    name: 'Navigator',
    description: 'Web interaction and navigation',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#F59E0B',
    color: '#F59E0B',
  },
  [Actors.VALIDATOR]: {
    name: 'Validator',
    description: 'Task completion and validation',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#EF4444',
    color: '#EF4444',
  },
};

// Additional Web3-specific actor profiles
export const WEB3_ACTOR_PROFILES = {
  WALLET: {
    name: 'Wallet',
    description: 'Wallet operations and transactions',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#8B5CF6',
    color: '#8B5CF6',
  },
  DEFI: {
    name: 'DeFi',
    description: 'DeFi protocol interactions',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#06B6D4',
    color: '#06B6D4',
  },
  NFT: {
    name: 'NFT',
    description: 'NFT operations and collections',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#EC4899',
    color: '#EC4899',
  },
  GOVERNANCE: {
    name: 'Governance',
    description: 'DAO governance and voting',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#84CC16',
    color: '#84CC16',
  },
  BRIDGE: {
    name: 'Bridge',
    description: 'Cross-chain bridge operations',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#F97316',
    color: '#F97316',
  },
};

// Legacy profile for backward compatibility
export const ACTOR_PROFILES_LEGACY = {
  [Actors.USER]: {
    name: 'User',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#4A90E2',
  },
  [Actors.ASSISTANT]: {
    name: 'Assistant',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#4A90E2',
  },
  [Actors.SYSTEM]: {
    name: 'System',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#4A90E2',
  },
  [Actors.PLANNER]: {
    name: 'Planner',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#4A90E2',
  },
  [Actors.NAVIGATOR]: {
    name: 'Navigator',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#4A90E2',
  },
  [Actors.VALIDATOR]: {
    name: 'Validator',
    icon: chrome.runtime.getURL('images/icon-128.png'),
    iconBackground: '#4A90E2',
  },
};

// Utility function to normalize actor type (handles both enum and string values)
export function normalizeActor(actor: Actors | string): Actors {
  if (typeof actor === 'string') {
    // Try to find matching enum value
    const enumValue = Object.values(Actors).find((value) => value === actor);
    return enumValue || Actors.SYSTEM; // Fallback to SYSTEM
  }
  return actor;
}

// Type guard to check if a value is a valid actor
export function isValidActor(value: any): value is Actors {
  return Object.values(Actors).includes(value);
}

// Safe function to get actor profile with fallback
export function getActorProfile(actor: Actors | string): ActorProfile {
  const normalizedActor = normalizeActor(actor);
  return ACTOR_PROFILES[normalizedActor] || ACTOR_PROFILES[Actors.SYSTEM];
}
