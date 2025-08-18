import { createLogger } from '@/utils/logger';
import { Agent, AgentState, AgentMessage, AgentResult, ExecutionContext } from './AgentTypes';

const logger = createLogger('BaseAgent');

/**
 * Enhanced Base Agent class that combines the best patterns from both systems
 * 
 * This class provides common functionality for all agents while maintaining
 * compatibility with the multi-agent system interface.
 */
export abstract class BaseAgent implements Agent {
  public abstract id: string;
  public abstract name: string;
  public abstract type: 'planner' | 'navigator' | 'validator';
  
  public state: AgentState;
  protected llm: any;
  protected context: any;
  protected eventHandlers: Map<string, Function[]> = new Map();

  constructor(
    llm: any,
    context: any,
    initialState?: Partial<AgentState>
  ) {
    this.llm = llm;
    this.context = context;
    
    this.state = {
      status: 'idle',
      currentTask: '',
      stepCount: 0,
      maxSteps: 20,
      errorCount: 0,
      maxErrors: 5,
      context: this.context,
      ...initialState
    };

    logger.info(`Initialized base agent`);
  }

  /**
   * Main execution method - must be implemented by subclasses
   */
  abstract execute(message: AgentMessage): Promise<AgentResult>;

  /**
   * Handle incoming messages from other agents
   */
  async handleMessage(message: AgentMessage): Promise<void> {
    logger.debug(`${this.id} received message`, {
      from: message.from,
      type: message.type,
      messageId: message.id,
    });

    switch (message.type) {
      case 'request':
        await this.handleRequest(message);
        break;
      case 'event':
        await this.handleEvent(message);
        break;
      case 'response':
        await this.handleResponse(message);
        break;
      case 'error':
        await this.handleError(message);
        break;
    }
  }

  /**
   * Check if this agent can handle a specific task type
   */
  abstract canHandle(taskType: string): boolean;

  /**
   * Protected helper methods for subclasses
   */

  protected async invokeModel(messages: any[]): Promise<any> {
    try {
      const response = await this.llm.invoke(messages);
      return response;
    } catch (error) {
      logger.error(`${this.id} model invocation failed:`, error);
      throw error;
    }
  }

  protected emitEvent(eventType: string, data?: any): void {
    logger.info(`${this.id}: ${eventType}`, data);
    
    // Trigger any registered event handlers
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          logger.error(`Event handler error for ${eventType}:`, error);
        }
      });
    }
  }

  protected updateStatus(status: AgentState['status']): void {
    this.state.status = status;
    this.emitEvent('status_changed', { status });
  }

  protected incrementErrorCount(): void {
    this.state.errorCount++;
    this.emitEvent('error_incremented', { 
      errorCount: this.state.errorCount, 
      maxErrors: this.state.maxErrors 
    });
  }

  protected incrementStepCount(): void {
    this.state.stepCount++;
    this.emitEvent('step_incremented', { 
      stepCount: this.state.stepCount, 
      maxSteps: this.state.maxSteps 
    });
  }

  /**
   * Event handling methods
   */

  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Message handling methods to be overridden by subclasses
   */

  protected async handleRequest(message: AgentMessage): Promise<void> {
    // Default implementation - subclasses can override
    logger.debug(`${this.id} handling request:`, message.content);
  }

  protected async handleEvent(message: AgentMessage): Promise<void> {
    // Default implementation - subclasses can override
    logger.debug(`${this.id} handling event:`, message.content);
  }

  protected async handleResponse(message: AgentMessage): Promise<void> {
    // Default implementation - subclasses can override
    logger.debug(`${this.id} handling response:`, message.content);
  }

  protected async handleError(message: AgentMessage): Promise<void> {
    // Default implementation - subclasses can override
    logger.warn(`${this.id} handling error:`, message.content);
    this.incrementErrorCount();
  }

  /**
   * Utility methods
   */

  protected createExecutionContext(): ExecutionContext {
    return {
      tabId: 'unknown',
      url: this.context.currentUrl || 'unknown',
      timestamp: Date.now(),
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userAgent: navigator.userAgent,
      viewport: { width: 1024, height: 768 },
      cookies: [],
      localStorage: {},
    };
  }

  protected createAgentMessage(
    type: AgentMessage['type'],
    to: string,
    content: any,
    correlationId?: string
  ): AgentMessage {
    return {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      from: this.id,
      to,
      content,
      timestamp: Date.now(),
      correlationId,
    };
  }

  protected isAtMaxSteps(): boolean {
    return this.state.stepCount >= this.state.maxSteps;
  }

  protected isAtMaxErrors(): boolean {
    return this.state.errorCount >= this.state.maxErrors;
  }

  protected shouldStopExecution(): boolean {
    return this.isAtMaxSteps() || this.isAtMaxErrors();
  }

  /**
   * Get agent status and statistics
   */
  getStatus(): {
    id: string;
    name: string;
    type: string;
    status: AgentState['status'];
    stepCount: number;
    maxSteps: number;
    errorCount: number;
    maxErrors: number;
    currentTask: string;
  } {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: this.state.status,
      stepCount: this.state.stepCount,
      maxSteps: this.state.maxSteps,
      errorCount: this.state.errorCount,
      maxErrors: this.state.maxErrors,
      currentTask: this.state.currentTask,
    };
  }

  /**
   * Reset agent state
   */
  reset(): void {
    this.state = {
      ...this.state,
      status: 'idle',
      currentTask: '',
      stepCount: 0,
      errorCount: 0,
    };
    this.emitEvent('reset');
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.eventHandlers.clear();
    this.emitEvent('cleanup');
  }
}