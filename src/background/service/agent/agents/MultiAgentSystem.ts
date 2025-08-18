import { z } from 'zod';
import { IWeb3LLM, Web3Context, LLMResponse } from '../llm/types';
import { HumanMessage, SystemMessage } from '../llm/messages';
import { EnhancedNavigatorAgent } from './EnhancedNavigatorAgent';
import { Agent, AgentMessage, AgentState, AgentResult, TaskPlan } from './AgentTypes';
import { AgentConfigManager } from './schemas/AgentConfig';
import { createLogger } from '@/utils/logger';

// Validation result schema
export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  confidence: z.number().min(0).max(1),
  message: z.string(),
  shouldRetry: z.boolean().optional(),
  retryStrategy: z.enum(['immediate', 'delayed', 'alternative']).optional(),
  suggestions: z.array(z.string()).optional(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

const logger = createLogger('MultiAgentSystem');

// Multi-agent coordinator
export class MultiAgentSystem {
  private agents: Map<string, Agent> = new Map();
  private messageQueue: AgentMessage[] = [];
  private eventHandlers: Map<string, Function[]> = new Map();
  private isRunning: boolean = false;
  private currentTaskId: string | null = null;

  constructor(
    private llm: IWeb3LLM,
    private context: Web3Context
  ) {
    this.initializeAgents();
  }

  private initializeAgents(): void {
    // Initialize the enhanced navigator agent with highlighting capabilities
    const config = new AgentConfigManager('development');
    const navigator = new EnhancedNavigatorAgent(config, {
      tabId: '1',
      url: this.context.currentUrl || 'unknown',
    });

    this.registerAgent(navigator);

    logger.info('Multi-agent system initialized with enhanced navigator agent');
  }

  private registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
    logger.debug(`Registered agent: ${agent.name} (${agent.type})`);
  }

  /**
   * Execute a task using the multi-agent system
   */
  async executeTask(
    instruction: string,
    taskId: string,
    options: {
      maxSteps?: number;
      maxErrors?: number;
      enableValidation?: boolean;
      enableReplanning?: boolean;
    } = {}
  ): Promise<AgentResult> {
    const startTime = Date.now();
    this.currentTaskId = taskId;
    this.isRunning = true;

    const {
      maxSteps = 20,
      maxErrors = 5,
      enableValidation = true,
      enableReplanning = true
    } = options;

    logger.info('Starting multi-agent task execution', {
      instruction,
      taskId,
      maxSteps,
      maxErrors,
    });

    let step = 0;
    let lastResult: AgentResult | null = null;
    let plan: TaskPlan | null = null;

    try {
      // Initialize agent states
      await this.initializeAgentStates(instruction, maxSteps, maxErrors);

      while (step < maxSteps && this.isRunning) {
        logger.info(`Executing step ${step + 1}/${maxSteps}`);

        // Step 1: Planning (every few steps or when replanning is needed)
        if (step === 0 || (enableReplanning && this.shouldReplan(step, lastResult))) {
          const planResult = await this.planExecution(instruction, step);
          if (!planResult.success || !planResult.data) {
            return planResult; // Planning failed
          }
          
          plan = planResult.data;
          this.emit('planCreated', { plan, step });
        }

        // Step 2: Navigation
        const navigationResult = await this.executeNavigation(plan!, step);
        if (!navigationResult.success) {
          lastResult = navigationResult;
          step++;
          continue;
        }

        // Step 3: Validation (if enabled and task seems complete)
        if (enableValidation && this.shouldValidate(navigationResult)) {
          const validationResult = await this.validateResult(instruction, navigationResult);
          
          if (!validationResult.success || !validationResult.data) {
            // Validation failed, handle retry or abort
            if (validationResult.data?.shouldRetry) {
              logger.info('Validation failed, initiating retry');
              continue;
            } else {
              return validationResult;
            }
          }

          // Validation passed, task completed
          if (validationResult.data?.isValid) {
            logger.info('Task validated successfully');
            return {
              success: true,
              data: navigationResult.data,
              shouldContinue: false,
              confidence: validationResult.data.confidence,
              metadata: {
                steps: step + 1,
                duration: Date.now() - startTime,
                validated: true,
              }
            };
          }
        }

        lastResult = navigationResult;
        step++;
      }

      // Task completed or max steps reached
      return {
        success: lastResult?.success ?? false,
        data: lastResult?.data,
        error: step >= maxSteps ? 'Maximum steps reached' : lastResult?.error,
        shouldContinue: false,
        confidence: lastResult?.confidence ?? 0.5,
        metadata: {
          steps: step,
          duration: Date.now() - startTime,
          maxStepsReached: step >= maxSteps,
        }
      };

    } catch (error) {
      logger.error('Multi-agent execution failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        shouldContinue: false,
        confidence: 0,
        metadata: {
          steps: step,
          duration: Date.now() - startTime,
        }
      };
    } finally {
      this.isRunning = false;
      this.currentTaskId = null;
    }
  }

  private async initializeAgentStates(
    instruction: string,
    maxSteps: number,
    maxErrors: number
  ): Promise<void> {
    const baseState: AgentState = {
      status: 'idle',
      currentTask: instruction,
      stepCount: 0,
      maxSteps,
      errorCount: 0,
      maxErrors,
      context: this.context,
    };

    for (const agent of this.agents.values()) {
      agent.state = { ...baseState };
    }
  }

  private async planExecution(instruction: string, step: number): Promise<AgentResult> {
    const planner = this.agents.get('planner');
    if (!planner) {
      throw new Error('Planner agent not found');
    }

    const message: AgentMessage = {
      id: `plan_${step}_${Date.now()}`,
      type: 'request',
      from: 'coordinator',
      to: 'planner',
      content: {
        instruction,
        step,
        context: this.context,
        previousResults: [], // Would contain previous step results
      },
      timestamp: Date.now(),
    };

    planner.state.status = 'planning';
    const result = await planner.execute(message);
    planner.state.status = 'idle';

    return result;
  }

  private async executeNavigation(plan: TaskPlan, step: number): Promise<AgentResult> {
    const navigator = this.agents.get('navigator');
    if (!navigator) {
      throw new Error('Navigator agent not found');
    }

    const currentStep = plan.steps[step % plan.steps.length];
    if (!currentStep) {
      return {
        success: false,
        error: 'No navigation step available',
        shouldContinue: false,
        confidence: 0,
      };
    }

    const message: AgentMessage = {
      id: `nav_${step}_${Date.now()}`,
      type: 'request',
      from: 'coordinator',
      to: 'navigator',
      content: {
        step: currentStep,
        context: this.context,
        plan,
      },
      timestamp: Date.now(),
    };

    navigator.state.status = 'executing';
    const result = await navigator.execute(message);
    navigator.state.status = 'idle';

    // Update agent state based on result
    if (!result.success) {
      navigator.state.errorCount++;
    }

    return result;
  }

  private async validateResult(
    instruction: string,
    result: AgentResult
  ): Promise<AgentResult> {
    const validator = this.agents.get('validator');
    if (!validator) {
      throw new Error('Validator agent not found');
    }

    const message: AgentMessage = {
      id: `val_${Date.now()}`,
      type: 'request',
      from: 'coordinator',
      to: 'validator',
      content: {
        instruction,
        result,
        context: this.context,
      },
      timestamp: Date.now(),
    };

    validator.state.status = 'validating';
    const validation = await validator.execute(message);
    validator.state.status = 'idle';

    return validation;
  }

  private shouldReplan(step: number, lastResult: AgentResult | null): boolean {
    // Replan if last result failed or every 5 steps
    return step % 5 === 0 || (lastResult?.success === false);
  }

  private shouldValidate(result: AgentResult): boolean {
    // Validate if result suggests completion or after certain steps
    return result.shouldContinue === false || result.confidence > 0.8;
  }

  // Event system
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          logger.error('Event handler error', error);
        }
      });
    }
  }

  // Control methods
  stop(): void {
    this.isRunning = false;
    logger.info('Multi-agent system stopped');
  }

  pause(): void {
    this.isRunning = false;
    logger.info('Multi-agent system paused');
  }

  resume(): void {
    this.isRunning = true;
    logger.info('Multi-agent system resumed');
  }

  getStatus(): {
    isRunning: boolean;
    currentTaskId: string | null;
    agents: Array<{ id: string; name: string; type: string; status: string }>;
  } {
    return {
      isRunning: this.isRunning,
      currentTaskId: this.currentTaskId,
      agents: Array.from(this.agents.values()).map(agent => ({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.state.status,
      })),
    };
  }
}

