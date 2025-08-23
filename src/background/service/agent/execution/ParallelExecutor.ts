// Parallel action execution system for enhanced Web3 agent performance
import { createLogger } from '@/utils/logger';
import { ActionStep } from '../planning/ActionPlanner';
import { FunctionCall } from '../llm/types';
import { toolRegistry } from '../tools/ToolRegistry';

const logger = createLogger('ParallelExecutor');

export interface ExecutionResult {
  actionId: string;
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  dependencies: string[];
}

export interface ParallelExecutionOptions {
  maxConcurrency: number;
  timeoutMs: number;
  retryAttempts: number;
  enableParallel: boolean;
  dependencyAware: boolean;
}

export interface ExecutionGraph {
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
}

export interface ExecutionNode {
  id: string;
  action: ActionStep | FunctionCall;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime?: number;
  endTime?: number;
  result?: any;
  error?: string;
  dependencies: string[];
  dependents: string[];
  retryCount: number;
}

export interface ExecutionEdge {
  from: string;
  to: string;
  type: 'dependency' | 'order';
}

export class ParallelExecutor {
  private options: ParallelExecutionOptions;
  private graph: ExecutionGraph;
  private runningExecutions: Map<string, Promise<ExecutionResult>> = new Map();
  private abortController: AbortController;

  constructor(options: Partial<ParallelExecutionOptions> = {}) {
    this.options = {
      maxConcurrency: 3,
      timeoutMs: 30000,
      retryAttempts: 2,
      enableParallel: true,
      dependencyAware: true,
      ...options,
    };

    this.graph = {
      nodes: [],
      edges: [],
    };

    this.abortController = new AbortController();
  }

  async executeActions(
    actions: (ActionStep | FunctionCall)[]
  ): Promise<ExecutionResult[]> {
    if (!this.options.enableParallel || actions.length === 1) {
      // Fall back to sequential execution
      return this.executeSequential(actions);
    }

    logger.info('Starting parallel execution', {
      actionCount: actions.length,
      maxConcurrency: this.options.maxConcurrency,
      dependencyAware: this.options.dependencyAware,
    });

    // Build execution graph
    this.buildExecutionGraph(actions);

    // Execute with parallel processing
    const results = await this.executeParallel();

    logger.info('Parallel execution completed', {
      totalActions: actions.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      averageDuration:
        results.reduce((sum, r) => sum + r.duration, 0) / results.length,
    });

    return results;
  }

  private buildExecutionGraph(actions: (ActionStep | FunctionCall)[]): void {
    this.graph.nodes = actions.map((action, index) => ({
      id: this.getActionId(action, index),
      action,
      status: 'pending',
      dependencies: this.getActionDependencies(action),
      dependents: [],
      retryCount: 0,
    }));

    // Build dependency edges
    for (const node of this.graph.nodes) {
      for (const depId of node.dependencies) {
        this.graph.edges.push({
          from: depId,
          to: node.id,
          type: 'dependency',
        });
      }
    }

    // Build dependent relationships
    for (const edge of this.graph.edges) {
      const fromNode = this.graph.nodes.find((n) => n.id === edge.from);
      const toNode = this.graph.nodes.find((n) => n.id === edge.to);
      if (fromNode && toNode) {
        fromNode.dependents.push(toNode.id);
      }
    }

    logger.info('Built execution graph', {
      nodes: this.graph.nodes.length,
      edges: this.graph.edges.length,
      maxDepth: this.calculateMaxDepth(),
    });
  }

  private async executeParallel(): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    const executionQueue = this.getExecutableNodes();
    let activeExecutions = 0;

    while (executionQueue.length > 0 || activeExecutions > 0) {
      // Start new executions if under concurrency limit
      while (
        executionQueue.length > 0 &&
        activeExecutions < this.options.maxConcurrency
      ) {
        const node = executionQueue.shift()!;
        const execution = this.executeNode(node);

        this.runningExecutions.set(node.id, execution);
        activeExecutions++;

        // Handle completion
        execution.finally(() => {
          activeExecutions--;
          this.runningExecutions.delete(node.id);

          // Add newly executable nodes to queue
          const newExecutableNodes = this.getExecutableNodes();
          executionQueue.push(...newExecutableNodes);
        });
      }

      // Wait for at least one execution to complete
      if (this.runningExecutions.size > 0) {
        await Promise.race(Array.from(this.runningExecutions.values()));
      }
    }

    // Collect all results
    for (const node of this.graph.nodes) {
      if (node.status === 'completed' || node.status === 'failed') {
        results.push({
          actionId: node.id,
          success: node.status === 'completed',
          result: node.result,
          error: node.error,
          duration:
            (node.endTime || Date.now()) - (node.startTime || Date.now()),
          dependencies: node.dependencies,
        });
      }
    }

    return results;
  }

  private async executeNode(node: ExecutionNode): Promise<ExecutionResult> {
    if (this.abortController.signal.aborted) {
      node.status = 'cancelled';
      return {
        actionId: node.id,
        success: false,
        error: 'Execution cancelled',
        duration: 0,
        dependencies: node.dependencies,
      };
    }

    node.status = 'running';
    node.startTime = Date.now();

    try {
      logger.info(`Executing node: ${node.id}`);

      let result: any;

      if ('type' in node.action) {
        // ActionStep execution
        result = await this.executeActionStep(node.action as ActionStep);
      } else {
        // FunctionCall execution
        result = await this.executeFunctionCall(node.action as FunctionCall);
      }

      node.status = 'completed';
      node.result = result;
      node.endTime = Date.now();

      const executionResult: ExecutionResult = {
        actionId: node.id,
        success: true,
        result,
        duration: node.endTime - node.startTime!,
        dependencies: node.dependencies,
      };

      logger.info(`Node execution completed: ${node.id}`, {
        duration: executionResult.duration,
        success: true,
      });

      return executionResult;
    } catch (error) {
      node.status = 'failed';
      node.error = error instanceof Error ? error.message : String(error);
      node.endTime = Date.now();

      const executionResult: ExecutionResult = {
        actionId: node.id,
        success: false,
        error: node.error,
        duration: node.endTime - node.startTime!,
        dependencies: node.dependencies,
      };

      logger.error(`Node execution failed: ${node.id}`, error);

      // Retry if attempts remain
      if (node.retryCount < this.options.retryAttempts) {
        node.retryCount++;
        node.status = 'pending';
        logger.info(`Retrying node: ${node.id} (attempt ${node.retryCount})`);

        // Add back to execution queue
        setTimeout(() => {
          // The node will be picked up in the next execution cycle
        }, 1000 * node.retryCount); // Exponential backoff
      }

      return executionResult;
    }
  }

  private async executeActionStep(action: ActionStep): Promise<any> {
    // This would integrate with the existing action execution system
    logger.info(`Executing ActionStep: ${action.type}`, action.params);

    // Mock implementation for now
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 1000 + 500)
    );

    return {
      actionType: action.type,
      params: action.params,
      result: `Mock result for ${action.type}`,
      success: true,
      timestamp: Date.now(),
    };
  }

  private async executeFunctionCall(functionCall: FunctionCall): Promise<any> {
    logger.info(
      `Executing FunctionCall: ${functionCall.name}`,
      functionCall.arguments
    );

    // Validate parameters
    const validation = toolRegistry.validateParameters(
      functionCall.name,
      functionCall.arguments
    );
    if (!validation.valid) {
      throw new Error(
        `Parameter validation failed: ${validation.errors.join(', ')}`
      );
    }

    // Execute the function call
    const result = await toolRegistry.executeTool(
      functionCall.name,
      functionCall.arguments
    );

    logger.info(`FunctionCall executed successfully: ${functionCall.name}`);

    return result;
  }

  private getExecutableNodes(): ExecutionNode[] {
    return this.graph.nodes.filter((node) => {
      if (node.status !== 'pending') return false;

      // Check if all dependencies are completed
      return node.dependencies.every((depId) => {
        const depNode = this.graph.nodes.find((n) => n.id === depId);
        return depNode?.status === 'completed';
      });
    });
  }

  private getActionDependencies(action: ActionStep | FunctionCall): string[] {
    if ('dependencies' in action) {
      return action.dependencies || [];
    }

    // For function calls, determine dependencies based on parameter relationships
    const dependencies: string[] = [];



    return dependencies;
  }

  private getActionId(
    action: ActionStep | FunctionCall,
    index: number
  ): string {
    if ('id' in action && action.id) {
      return action.id;
    }

    if ('name' in action && action.name) {
      return `func_${action.name}_${index}_${Date.now()}`;
    }

    return `action_${index}_${Date.now()}`;
  }

  private calculateMaxDepth(): number {
    const visited = new Set<string>();
    const depths = new Map<string, number>();

    const calculateDepth = (nodeId: string): number => {
      if (visited.has(nodeId)) {
        return depths.get(nodeId) || 0;
      }

      visited.add(nodeId);
      const node = this.graph.nodes.find((n) => n.id === nodeId);

      if (!node || node.dependencies.length === 0) {
        depths.set(nodeId, 1);
        return 1;
      }

      const maxDepDepth = Math.max(
        ...node.dependencies.map((depId) => calculateDepth(depId))
      );
      const depth = maxDepDepth + 1;
      depths.set(nodeId, depth);

      return depth;
    };

    return Math.max(...this.graph.nodes.map((node) => calculateDepth(node.id)));
  }

  private async executeSequential(
    actions: (ActionStep | FunctionCall)[]
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const startTime = Date.now();

      try {
        let result: any;

        if ('type' in action) {
          result = await this.executeActionStep(action as ActionStep);
        } else {
          result = await this.executeFunctionCall(action as FunctionCall);
        }

        results.push({
          actionId: this.getActionId(action, i),
          success: true,
          result,
          duration: Date.now() - startTime,
          dependencies: this.getActionDependencies(action),
        });
      } catch (error) {
        results.push({
          actionId: this.getActionId(action, i),
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
          dependencies: this.getActionDependencies(action),
        });
      }
    }

    return results;
  }

  // Public methods for control and monitoring
  abort(): void {
    this.abortController.abort();
    logger.info('Parallel execution aborted');
  }

  getExecutionStatus(): {
    total: number;
    completed: number;
    running: number;
    failed: number;
    pending: number;
    progress: number;
  } {
    const total = this.graph.nodes.length;
    const completed = this.graph.nodes.filter((n) => n.status === 'completed')
      .length;
    const running = this.graph.nodes.filter((n) => n.status === 'running')
      .length;
    const failed = this.graph.nodes.filter((n) => n.status === 'failed').length;
    const pending = this.graph.nodes.filter((n) => n.status === 'pending')
      .length;
    const progress = total > 0 ? (completed / total) * 100 : 0;

    return {
      total,
      completed,
      running,
      failed,
      pending,
      progress,
    };
  }

  getExecutionGraph(): ExecutionGraph {
    return { ...this.graph };
  }

  reset(): void {
    this.graph = {
      nodes: [],
      edges: [],
    };
    this.runningExecutions.clear();
    this.abortController = new AbortController();
    logger.info('Parallel executor reset');
  }
}

// Utility functions for parallel execution
export function createExecutionBatch(
  actions: (ActionStep | FunctionCall)[],
  options?: Partial<ParallelExecutionOptions>
): ParallelExecutor {
  return new ParallelExecutor(options);
}

export function canExecuteInParallel(
  actions: (ActionStep | FunctionCall)[]
): { canParallel: boolean; reason?: string } {
  if (actions.length <= 1) {
    return {
      canParallel: false,
      reason: 'Single action, no benefit from parallel execution',
    };
  }

  // Check for actions that must be sequential
  const sequentialPatterns: Array<{ before: string; after: string }> = [];

  for (const pattern of sequentialPatterns) {
    const beforeIndex = actions.findIndex(
      (a) => 'type' in a && a.type === pattern.before
    );
    const afterIndex = actions.findIndex(
      (a) => 'type' in a && a.type === pattern.after
    );

    if (beforeIndex !== -1 && afterIndex !== -1 && beforeIndex > afterIndex) {
      return {
        canParallel: false,
        reason: `${pattern.after} must come after ${pattern.before}`,
      };
    }
  }

  return { canParallel: true };
}

export function optimizeExecutionOrder(
  actions: (ActionStep | FunctionCall)[]
): (ActionStep | FunctionCall)[] {
  if (actions.length <= 1) return actions;

  // Group actions by type and dependencies
  const readActions = actions.filter(
    (a) =>
      'type' in a &&
      [
        'getNFTs',
        'getGasPrice',
      ].includes(a.type)
  );

  const writeActions = actions.filter(
    (a) =>
      'type' in a &&
      [
        'getNFTs',
        'getGasPrice',
      ].includes(
        a.type
      )
  );

  const functionCalls = actions.filter((a) => 'name' in a);

  // Optimal order: reads -> function calls -> writes
  return [...readActions, ...functionCalls, ...writeActions];
}
