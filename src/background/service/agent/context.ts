import { MessageManager } from './messageManager';
import { createLogger } from '@/utils/logger';
import type { ActionResult } from '@/background/agent/types';

const logger = createLogger('AgentContext');

export interface AgentOptions {
  maxSteps?: number;
  maxActionsPerStep?: number;
  validateOutput?: boolean;
  enableSimpleMode?: boolean;
  useVision?: boolean;
  maxTokens?: number;
  temperature?: number;
  includeAttributes?: boolean;
  planningInterval?: number;
  maxFailures?: number;
  maxValidatorFailures?: number;
}

export interface StepInfo {
  stepNumber: number;
  maxSteps: number;
}

export type EventCallback = (event: any) => void;

export class AgentContext {
  public taskId: string;
  public messageManager: MessageManager;
  public options: Required<AgentOptions>;
  public controller: AbortController;
  public paused: boolean = false;
  public stopped: boolean = false;
  public actionResults: ActionResult[] = [];
  public stateMessageAdded: boolean = false;
  public stepInfo?: StepInfo;
  public nSteps: number = 0;
  public consecutiveFailures: number = 0;
  public consecutiveValidatorFailures: number = 0;
  private eventCallbacks: Map<string, EventCallback[]> = new Map();

  constructor(taskId: string, options: Partial<AgentOptions> = {}) {
    this.taskId = taskId;
    this.messageManager = new MessageManager();
    this.controller = new AbortController();

    // Set default options
    this.options = {
      maxSteps: options.maxSteps ?? 10,
      maxActionsPerStep: options.maxActionsPerStep ?? 5,
      validateOutput: options.validateOutput ?? false,
      enableSimpleMode: options.enableSimpleMode ?? true,
      useVision: options.useVision ?? false,
      maxTokens: options.maxTokens ?? 4000,
      temperature: options.temperature ?? 0.7,
      includeAttributes: options.includeAttributes ?? true,
      planningInterval: options.planningInterval ?? 3,
      maxFailures: options.maxFailures ?? 3,
      maxValidatorFailures: options.maxValidatorFailures ?? 2,
    };

    logger.info(`AgentContext created for task: ${taskId}`);
  }

  emitEvent(actor: string, state: string, data?: any): void {
    const event = {
      type: 'execution',
      actor,
      state,
      timestamp: Date.now(),
      data: data ? { details: data } : undefined,
    };

    logger.debug('Emitting event:', event);

    // Call all registered callbacks
    const callbacks = this.eventCallbacks.get('execution') || [];
    callbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        logger.error('Error in event callback:', error);
      }
    });
  }

  subscribeToEvents(eventType: string, callback: EventCallback): void {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType)!.push(callback);
  }

  unsubscribeFromEvents(eventType: string, callback: EventCallback): void {
    const callbacks = this.eventCallbacks.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  stop(): void {
    this.stopped = true;
    this.paused = false;
    this.controller.abort();
    logger.info(`Task ${this.taskId} stopped`);
  }

  pause(): void {
    this.paused = true;
    logger.info(`Task ${this.taskId} paused`);
  }

  resume(): void {
    this.paused = false;
    logger.info(`Task ${this.taskId} resumed`);
  }

  reset(): void {
    this.stopped = false;
    this.paused = false;
    this.nSteps = 0;
    this.consecutiveFailures = 0;
    this.consecutiveValidatorFailures = 0;
    this.actionResults = [];
    this.stateMessageAdded = false;
    this.controller = new AbortController();
    logger.info(`Task ${this.taskId} reset`);
  }

  cleanup(): void {
    this.stop();
    this.eventCallbacks.clear();
    this.messageManager.clear();
    logger.info(`Task ${this.taskId} cleaned up`);
  }

  isActive(): boolean {
    return !this.stopped && !this.paused;
  }

  getStatus(): string {
    if (this.stopped) return 'stopped';
    if (this.paused) return 'paused';
    return 'active';
  }
}
