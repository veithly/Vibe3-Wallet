import { AgentContext } from '../types';
import { ActionBuilder } from './builder';
import {
  EnhancedActionExecutor,
  ActionResult,
  ActionExecutionOptions,
} from './executor';
import { chatHistoryStore } from '../chatHistory';
import { logger } from '@/ui/views/Agent/utils/logger';

export interface TaskExecutionPlan {
  id: string;
  description: string;
  estimatedDuration: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  requiredActions: Array<{
    name: string;
    params: Record<string, any>;
    intent?: string;
    dependencies?: string[];
    options?: ActionExecutionOptions;
  }>;
  riskLevel: 'low' | 'medium' | 'high';
  requiresConfirmation: boolean;
}

export interface ExecutionProgress {
  taskId: string;
  currentStep: number;
  totalSteps: number;
  completedActions: string[];
  failedActions: string[];
  currentAction?: string;
  estimatedTimeRemaining?: number;
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'paused';
}

export class EnhancedActionCoordinator {
  private readonly context: AgentContext;
  private readonly actionBuilder: ActionBuilder;
  private readonly sessionId: string;
  private executor: EnhancedActionExecutor;
  private currentTask: TaskExecutionPlan | null = null;
  private executionProgress: ExecutionProgress | null = null;
  private taskQueue: TaskExecutionPlan[] = [];
  private isExecuting: boolean = false;

  constructor(context: AgentContext, sessionId: string) {
    this.context = context;
    this.sessionId = sessionId;
    this.actionBuilder = new ActionBuilder(context, context.llm);
    this.executor = new EnhancedActionExecutor(
      context,
      this.actionBuilder.buildDefaultActions(),
      sessionId
    );
  }

  async createExecutionPlan(
    taskDescription: string,
    userIntent: string,
    complexity: 'simple' | 'moderate' | 'complex' = 'moderate'
  ): Promise<TaskExecutionPlan> {
    const taskId = `task_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Log planning start
    await chatHistoryStore.addAgentStep(this.sessionId, {
      id: `plan_${taskId}`,
      action: 'create_execution_plan',
      status: 'in_progress',
      timestamp: Date.now(),
      details: { taskDescription, userIntent, complexity },
    });

    try {
      // Analyze task and generate execution plan
      const plan = await this.analyzeAndPlan(
        taskDescription,
        userIntent,
        complexity
      );

      // Log planning completion
      await chatHistoryStore.updateAgentStep(this.sessionId, `plan_${taskId}`, {
        status: 'completed',
        result: { taskId: plan.id, actionCount: plan.requiredActions.length },
      });

      logger.info('ActionCoordinator', 'Execution plan created', {
        taskId: plan.id,
        actionCount: plan.requiredActions.length,
        estimatedDuration: plan.estimatedDuration,
        riskLevel: plan.riskLevel,
      });

      return plan;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Log planning failure
      await chatHistoryStore.updateAgentStep(this.sessionId, `plan_${taskId}`, {
        status: 'failed',
        error: errorMessage,
      });

      logger.error('ActionCoordinator', 'Failed to create execution plan', {
        error: errorMessage,
        taskDescription,
      });

      throw error;
    }
  }

  private async analyzeAndPlan(
    taskDescription: string,
    userIntent: string,
    complexity: string
  ): Promise<TaskExecutionPlan> {
    // Simulate task analysis and planning
    // In a real implementation, this would use AI to analyze the task and generate an optimal plan

    const actions = await this.generateActionSequence(
      taskDescription,
      userIntent,
      complexity
    );

    return {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      description: taskDescription,
      estimatedDuration: this.estimateDuration(actions),
      priority: this.determinePriority(userIntent, complexity),
      requiredActions: actions,
      riskLevel: this.assessRisk(actions, complexity),
      requiresConfirmation: this.requiresConfirmation(actions),
    };
  }

  private async generateActionSequence(
    taskDescription: string,
    userIntent: string,
    complexity: string
  ): Promise<TaskExecutionPlan['requiredActions']> {
    // Mock action generation based on task description
    const actions: TaskExecutionPlan['requiredActions'] = [];

    // Simple keyword-based action detection
    const lowerTask = taskDescription.toLowerCase();



    if (lowerTask.includes('nft')) {
      actions.push({
        name: 'getNFTs',
        params: { address: '0x1234...5678' },
        intent: 'Get NFT collection',
      });
    }

    if (lowerTask.includes('sign')) {
      actions.push({
        name: 'signMessage',
        params: { message: 'Message to sign' },
        intent: 'Sign message',
      });
    }

    // Add web navigation actions if needed
    if (
      lowerTask.includes('go to') ||
      lowerTask.includes('open') ||
      lowerTask.includes('visit')
    ) {
      actions.unshift({
        name: 'navigate',
        params: { url: this.extractUrl(taskDescription) },
        intent: 'Navigate to target URL',
      });
    }

    // If no specific actions detected, add a generic search
    if (actions.length === 0) {
      actions.push({
        name: 'search_google',
        params: { query: taskDescription },
        intent: 'Search for information',
      });
    }

    return actions;
  }

  private extractUrl(taskDescription: string): string {
    // Simple URL extraction (would be more sophisticated in real implementation)
    const urlMatch = taskDescription.match(/https?:\/\/[^\s]+/);
    return urlMatch ? urlMatch[0] : 'https://google.com';
  }

  private estimateDuration(
    actions: TaskExecutionPlan['requiredActions']
  ): number {
    // Estimate duration based on action types
    const baseTime = 1000; // 1 second base time
    const actionMultipliers: Record<string, number> = {
      navigate: 2,
      search_google: 1.5,
      getNFTs: 2,
      signMessage: 1.5,
    };

    return actions.reduce((total, action) => {
      const multiplier = actionMultipliers[action.name] || 1;
      return total + baseTime * multiplier;
    }, 0);
  }

  private determinePriority(
    userIntent: string,
    complexity: string
  ): TaskExecutionPlan['priority'] {
    if (userIntent.includes('urgent') || userIntent.includes('immediately')) {
      return 'critical';
    }
    if (complexity === 'complex') {
      return 'high';
    }
    if (userIntent.includes('please') || userIntent.includes('when you can')) {
      return 'low';
    }
    return 'medium';
  }

  private assessRisk(
    actions: TaskExecutionPlan['requiredActions'],
    complexity: string
  ): TaskExecutionPlan['riskLevel'] {
    const highRiskActions: string[] = [];
    const hasHighRiskAction = actions.some((action) =>
      highRiskActions.includes(action.name)
    );

    if (hasHighRiskAction || complexity === 'complex') {
      return 'high';
    }
    if (
      actions.some((action) =>
        ['signMessage', 'interactWithContract'].includes(action.name)
      )
    ) {
      return 'medium';
    }
    return 'low';
  }

  private requiresConfirmation(
    actions: TaskExecutionPlan['requiredActions']
  ): boolean {
    const confirmationActions = [
      'signMessage',
    ];
    return actions.some((action) => confirmationActions.includes(action.name));
  }

  async executeTask(task: TaskExecutionPlan): Promise<ExecutionProgress> {
    if (this.isExecuting) {
      throw new Error('Already executing a task');
    }

    this.currentTask = task;
    this.isExecuting = true;

    this.executionProgress = {
      taskId: task.id,
      currentStep: 0,
      totalSteps: task.requiredActions.length,
      completedActions: [],
      failedActions: [],
      status: 'executing',
    };

    try {
      // Log task execution start
      await chatHistoryStore.addAgentStep(this.sessionId, {
        id: `task_${task.id}`,
        action: 'execute_task',
        status: 'in_progress',
        timestamp: Date.now(),
        details: {
          taskDescription: task.description,
          actionCount: task.requiredActions.length,
        },
      });

      logger.info('ActionCoordinator', 'Starting task execution', {
        taskId: task.id,
        actionCount: task.requiredActions.length,
        estimatedDuration: task.estimatedDuration,
      });

      // Execute actions in sequence
      for (let i = 0; i < task.requiredActions.length; i++) {
        const action = task.requiredActions[i];

        this.executionProgress.currentStep = i + 1;
        this.executionProgress.currentAction = action.name;

        // Check for dependencies
        if (action.dependencies && action.dependencies.length > 0) {
          const allDependenciesCompleted = action.dependencies.every((dep) =>
            this.executionProgress!.completedActions.includes(dep)
          );

          if (!allDependenciesCompleted) {
            logger.warn(
              'ActionCoordinator',
              'Skipping action due to unmet dependencies',
              {
                action: action.name,
                dependencies: action.dependencies,
                completed: this.executionProgress!.completedActions,
              }
            );
            continue;
          }
        }

        // Execute the action
        const result = await this.executor.executeAction(
          action.name,
          action.params,
          action.options
        );

        if (result.success) {
          this.executionProgress.completedActions.push(action.name);
        } else {
          this.executionProgress.failedActions.push(action.name);

          // Stop execution on critical failures
          if (
            task.priority === 'critical' &&
            this.executionProgress.failedActions.length > 0
          ) {
            this.executionProgress.status = 'failed';
            break;
          }
        }
      }

      // Determine final status
      if (this.executionProgress.failedActions.length === 0) {
        this.executionProgress.status = 'completed';
      } else if (this.executionProgress.completedActions.length > 0) {
        this.executionProgress.status = 'completed'; // Partial success
      } else {
        this.executionProgress.status = 'failed';
      }

      // Log task completion
      await chatHistoryStore.updateAgentStep(
        this.sessionId,
        `task_${task.id}`,
        {
          status: this.executionProgress.status,
          result: {
            completedActions: this.executionProgress.completedActions.length,
            failedActions: this.executionProgress.failedActions.length,
            totalActions: task.requiredActions.length,
          },
        }
      );

      logger.info('ActionCoordinator', 'Task execution completed', {
        taskId: task.id,
        status: this.executionProgress.status,
        completedActions: this.executionProgress.completedActions.length,
        failedActions: this.executionProgress.failedActions.length,
      });

      return this.executionProgress;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      this.executionProgress!.status = 'failed';

      // Log task failure
      await chatHistoryStore.updateAgentStep(
        this.sessionId,
        `task_${task.id}`,
        {
          status: 'failed',
          error: errorMessage,
        }
      );

      logger.error('ActionCoordinator', 'Task execution failed', {
        taskId: task.id,
        error: errorMessage,
      });

      throw error;
    } finally {
      this.isExecuting = false;
    }
  }

  getExecutionProgress(): ExecutionProgress | null {
    return this.executionProgress;
  }

  getCurrentTask(): TaskExecutionPlan | null {
    return this.currentTask;
  }

  pauseExecution(): void {
    if (
      this.executionProgress &&
      this.executionProgress.status === 'executing'
    ) {
      this.executionProgress.status = 'paused';
      this.isExecuting = false;
    }
  }

  resumeExecution(): void {
    if (this.executionProgress && this.executionProgress.status === 'paused') {
      this.executionProgress.status = 'executing';
      this.isExecuting = true;
    }
  }

  cancelExecution(): void {
    if (this.executionProgress) {
      this.executionProgress.status = 'failed';
      this.isExecuting = false;
    }
  }

  getAvailableActions(): string[] {
    return this.executor.getAvailableActions();
  }

  getExecutionStats() {
    return this.executor.getExecutionStats();
  }

  // Queue management for multiple tasks
  queueTask(task: TaskExecutionPlan): void {
    this.taskQueue.push(task);
    this.taskQueue.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  async executeNextTask(): Promise<ExecutionProgress | null> {
    if (this.isExecuting || this.taskQueue.length === 0) {
      return null;
    }

    const task = this.taskQueue.shift()!;
    return this.executeTask(task);
  }

  getTaskQueue(): TaskExecutionPlan[] {
    return [...this.taskQueue];
  }

  clearTaskQueue(): void {
    this.taskQueue = [];
  }
}
