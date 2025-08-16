import { 
  EnhancedIntent, 
  ExecutionPlan, 
  EnhancedAction, 
  ContextRequirement,
  ValidationRule,
  ExecutionStrategy,
  Web3Context,
  TaskAnalysis 
} from '../types/BaseTypes';
import { ActionStep } from '../types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('PlannerAgent');

export class PlannerAgent {
  private id: string;
  private activePlans: Map<string, ExecutionPlan> = new Map();
  private planHistory: ExecutionPlan[] = [];

  constructor(id: string = 'planner-agent') {
    this.id = id;
  }

  /**
   * Create execution plan from enhanced intent and task analysis
   */
  async createExecutionPlan(
    intent: EnhancedIntent,
    taskAnalysis: TaskAnalysis,
    context: Web3Context
  ): Promise<ExecutionPlan> {
    logger.info('Creating execution plan', {
      intentAction: intent.action,
      taskType: taskAnalysis.taskType,
      complexity: taskAnalysis.complexity,
    });

    // Validate intent parameters
    const validationResult = this.validateIntent(intent);
    if (!validationResult.valid) {
      throw new Error(`Intent validation failed: ${validationResult.errors.join(', ')}`);
    }

    // Generate actions based on intent and task type
    const actions = await this.generateActions(intent, taskAnalysis, context);
    
    // Calculate dependencies and execution order
    const planDependencies = await this.calculateDependencies(actions);
    const actionsWithDependencies = actions; // Actions already have their individual dependencies set
    
    // Create execution plan
    const plan: ExecutionPlan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: this.generatePlanName(intent, taskAnalysis),
      description: this.generatePlanDescription(intent, taskAnalysis),
      actions: actionsWithDependencies,
      dependencies: this.extractPlanDependencies(actionsWithDependencies),
      estimatedDuration: this.estimateDuration(actionsWithDependencies),
      riskLevel: this.assessPlanRisk(actionsWithDependencies, context),
      requiresConfirmation: this.requiresConfirmation(actionsWithDependencies),
      metadata: {
        intent,
        taskAnalysis,
        createdAt: Date.now(),
        optimizationLevel: this.calculateOptimizationLevel(actionsWithDependencies),
      },
    };

    // Store plan
    this.activePlans.set(plan.id, plan);
    this.planHistory.push(plan);

    logger.info('Execution plan created successfully', {
      planId: plan.id,
      actionCount: plan.actions.length,
      estimatedDuration: plan.estimatedDuration,
      riskLevel: plan.riskLevel,
    });

    return plan;
  }

  /**
   * Optimize existing execution plan
   */
  async optimizePlan(plan: ExecutionPlan): Promise<ExecutionPlan> {
    logger.info('Optimizing execution plan', { planId: plan.id });

    const optimizedActions = await this.optimizeActions(plan.actions);
    const optimizedDependencies = await this.calculateDependencies(optimizedActions);

    const optimizedPlan: ExecutionPlan = {
      ...plan,
      actions: optimizedActions,
      dependencies: optimizedDependencies,
      estimatedDuration: this.estimateDuration(optimizedActions),
      metadata: {
        ...plan.metadata,
        optimizedAt: Date.now(),
        originalDuration: plan.estimatedDuration,
        optimizationRatio: plan.estimatedDuration / this.estimateDuration(optimizedActions),
      },
    };

    // Update stored plan
    this.activePlans.set(plan.id, optimizedPlan);

    logger.info('Plan optimized successfully', {
      planId: plan.id,
      originalDuration: plan.estimatedDuration,
      optimizedDuration: optimizedPlan.estimatedDuration,
      optimizationRatio: optimizedPlan.metadata.optimizationRatio,
    });

    return optimizedPlan;
  }

  /**
   * Generate fallback plan when primary plan fails
   */
  async generateFallbackPlan(
    originalPlan: ExecutionPlan,
    failurePoint: string,
    error: string
  ): Promise<ExecutionPlan> {
    logger.info('Generating fallback plan', {
      originalPlanId: originalPlan.id,
      failurePoint,
      error,
    });

    const fallbackActions = await this.generateFallbackActions(
      originalPlan.actions,
      failurePoint,
      error
    );

    const fallbackPlan: ExecutionPlan = {
      ...originalPlan,
      id: `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: `Fallback: ${originalPlan.name}`,
      description: `Fallback plan due to failure at ${failurePoint}: ${error}`,
      actions: fallbackActions,
      dependencies: this.extractPlanDependencies(fallbackActions),
      estimatedDuration: this.estimateDuration(fallbackActions),
      riskLevel: 'MEDIUM', // Fallback plans are typically medium risk
      requiresConfirmation: true, // Always confirm fallback plans
      metadata: {
        ...originalPlan.metadata,
        isFallback: true,
        originalPlanId: originalPlan.id,
        failurePoint,
        failureError: error,
        createdAt: Date.now(),
      },
    };

    this.activePlans.set(fallbackPlan.id, fallbackPlan);
    this.planHistory.push(fallbackPlan);

    logger.info('Fallback plan created successfully', {
      fallbackPlanId: fallbackPlan.id,
      actionCount: fallbackPlan.actions.length,
    });

    return fallbackPlan;
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): ExecutionPlan | undefined {
    return this.activePlans.get(planId);
  }

  /**
   * Get all active plans
   */
  getActivePlans(): ExecutionPlan[] {
    return Array.from(this.activePlans.values());
  }

  /**
   * Get plan history
   */
  getPlanHistory(): ExecutionPlan[] {
    return [...this.planHistory];
  }

  /**
   * Clear completed or expired plans
   */
  cleanupPlans(): void {
    const now = Date.now();
    const expireTime = 30 * 60 * 1000; // 30 minutes

    for (const [planId, plan] of this.activePlans) {
      const planAge = now - (plan.metadata.createdAt || 0);
      if (planAge > expireTime) {
        this.activePlans.delete(planId);
        logger.debug('Expired plan removed', { planId, age: planAge });
      }
    }
  }

  // Private helper methods

  private validateIntent(intent: EnhancedIntent): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required parameters
    if (!intent.action) {
      errors.push('Intent action is required');
    }

    if (!intent.parameters) {
      errors.push('Intent parameters are required');
    }

    // Validate confidence threshold
    if (intent.confidence < 0.5) {
      errors.push('Intent confidence too low');
    }

    // Run custom validation rules
    if (intent.validationRules) {
      for (const rule of intent.validationRules) {
        if (!this.runValidationRule(rule, intent)) {
          errors.push(rule.message);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private runValidationRule(rule: ValidationRule, intent: EnhancedIntent): boolean {
    const value = this.getNestedValue(intent.parameters, rule.field);
    
    switch (rule.operator) {
      case 'equals':
        return value === rule.value;
      case 'contains':
        return typeof value === 'string' && rule.value !== undefined && value.includes(rule.value);
      case 'regex':
        return rule.value ? new RegExp(rule.value).test(String(value)) : false;
      case 'greater_than':
        return Number(value) > Number(rule.value || 0);
      case 'less_than':
        return Number(value) < Number(rule.value || 0);
      default:
        return true;
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private async generateActions(
    intent: EnhancedIntent,
    taskAnalysis: TaskAnalysis,
    context: Web3Context
  ): Promise<EnhancedAction[]> {
    const actions: EnhancedAction[] = [];

    switch (taskAnalysis.taskType) {
      case 'navigation':
        actions.push(...this.createNavigationActions(intent, taskAnalysis));
        break;
      
      case 'form_filling':
        actions.push(...this.createFormFillingActions(intent, taskAnalysis));
        break;
      
      case 'content_extraction':
        actions.push(...this.createContentExtractionActions(intent, taskAnalysis));
        break;
      
      case 'web3_transaction':
        actions.push(...this.createWeb3TransactionActions(intent, taskAnalysis, context));
        break;
      
      case 'interaction':
        actions.push(...this.createInteractionActions(intent, taskAnalysis));
        break;
      
      case 'automation':
        actions.push(...this.createAutomationActions(intent, taskAnalysis));
        break;
      
      default:
        actions.push(...this.createGenericActions(intent, taskAnalysis));
    }

    // Add context requirements and metadata
    return actions.map((action, index) => ({
      ...action,
      id: action.id || `action_${Date.now()}_${index}`,
      priority: action.priority || this.calculateActionPriority(action, intent),
      retries: 0,
      maxRetries: this.getMaxRetriesForAction(action),
      timeout: action.timeout || this.getDefaultTimeoutForAction(action),
      contextRequirements: this.generateContextRequirements(action),
    }));
  }

  private createNavigationActions(
    intent: EnhancedIntent,
    taskAnalysis: TaskAnalysis
  ): EnhancedAction[] {
    const actions: EnhancedAction[] = [];

    if (intent.parameters.url) {
      actions.push({
        id: 'navigate_primary',
        name: 'Navigate to URL',
        description: `Navigate to ${intent.parameters.url}`,
        type: 'navigateToUrl',
        status: 'pending',
        agentType: 'navigator',
        priority: 1,
        retries: 0,
        maxRetries: 3,
        timeout: 30000,
        params: {
          url: intent.parameters.url,
          waitFor: 'load',
        },
        dependencies: [],
        riskLevel: 'LOW',
      });
    }

    return actions;
  }

  private createFormFillingActions(
    intent: EnhancedIntent,
    taskAnalysis: TaskAnalysis
  ): EnhancedAction[] {
    const actions: EnhancedAction[] = [];

    if (intent.parameters.fields) {
      intent.parameters.fields.forEach((field: any, index: number) => {
        actions.push({
          id: `fill_field_${index}`,
          name: `Fill ${field.name || field.selector || 'field'}`,
          description: `Fill ${field.type || 'text'} field: ${field.value}`,
          type: 'fillForm',
          status: 'pending',
          agentType: 'navigator',
          priority: 2,
          retries: 0,
          maxRetries: 3,
          timeout: 15000,
          params: {
            fields: [field],
          },
          dependencies: index > 0 ? [`fill_field_${index - 1}`] : [],
          riskLevel: 'MEDIUM',
        });
      });
    }

    if (intent.parameters.submit) {
      actions.push({
        id: 'submit_form',
        name: 'Submit form',
        description: 'Submit the filled form',
        type: 'clickElement',
        status: 'pending',
        agentType: 'navigator',
        priority: 3,
        retries: 0,
        maxRetries: 3,
        timeout: 20000,
        params: {
          selector: 'button[type="submit"], input[type="submit"], .submit',
        },
        dependencies: actions.map(a => a.id),
        riskLevel: 'MEDIUM',
      });
    }

    return actions;
  }

  private createContentExtractionActions(
    intent: EnhancedIntent,
    taskAnalysis: TaskAnalysis
  ): EnhancedAction[] {
    const actions: EnhancedAction[] = [];

    actions.push({
      id: 'extract_content',
      name: 'Extract content',
      description: `Extract ${intent.parameters.extractType || 'text'} content`,
      type: 'extractContent',
      status: 'pending',
      agentType: 'navigator',
      priority: 1,
      retries: 0,
      maxRetries: 3,
      timeout: 10000,
      params: {
        selector: intent.parameters.selector || 'body',
        type: intent.parameters.extractType || 'text',
        multiple: intent.parameters.multiple || false,
      },
      dependencies: [],
      riskLevel: 'LOW',
    });

    return actions;
  }

  private createWeb3TransactionActions(
    intent: EnhancedIntent,
    taskAnalysis: TaskAnalysis,
    context: Web3Context
  ): EnhancedAction[] {
    const actions: EnhancedAction[] = [];

    switch (intent.action) {
      case 'SWAP':
        actions.push(...this.createSwapActions(intent, context));
        break;
      case 'BRIDGE':
        actions.push(...this.createBridgeActions(intent, context));
        break;
      case 'STAKE':
        actions.push(...this.createStakeActions(intent, context));
        break;
      case 'APPROVE':
        actions.push(...this.createApproveActions(intent, context));
        break;
      default:
        actions.push(...this.createGenericWeb3Actions(intent, context));
    }

    return actions;
  }

  private createSwapActions(
    intent: EnhancedIntent,
    context: Web3Context
  ): EnhancedAction[] {
    const actions: EnhancedAction[] = [];

    actions.push({
      id: 'check_balance',
      name: 'Check token balance',
      description: 'Verify sufficient token balance for swap',
      type: 'checkBalance',
      status: 'pending',
      agentType: 'web3',
      priority: 1,
      retries: 0,
      maxRetries: 3,
      timeout: 10000,
      params: {
        token: intent.parameters.fromToken,
        amount: intent.parameters.amount,
      },
      dependencies: [],
      riskLevel: 'LOW',
    });

    actions.push({
      id: 'approve_token',
      name: 'Approve token spending',
      description: `Approve ${intent.parameters.spender} to spend ${intent.parameters.fromToken}`,
      type: 'approveToken',
      status: 'pending',
      agentType: 'web3',
      priority: 2,
      retries: 0,
      maxRetries: 3,
      timeout: 45000,
      params: {
        token: intent.parameters.fromToken,
        spender: intent.parameters.spender,
        amount: intent.parameters.amount,
      },
      dependencies: ['check_balance'],
      riskLevel: 'HIGH',
    });

    actions.push({
      id: 'execute_swap',
      name: 'Execute token swap',
      description: `Swap ${intent.parameters.amount} ${intent.parameters.fromToken} for ${intent.parameters.toToken}`,
      type: 'swapTokens',
      status: 'pending',
      agentType: 'web3',
      priority: 3,
      retries: 0,
      maxRetries: 3,
      timeout: 60000,
      params: {
        fromToken: intent.parameters.fromToken,
        toToken: intent.parameters.toToken,
        amount: intent.parameters.amount,
        slippage: intent.parameters.slippage || '1',
      },
      dependencies: ['approve_token'],
      riskLevel: 'HIGH',
    });

    return actions;
  }

  private createBridgeActions(
    intent: EnhancedIntent,
    context: Web3Context
  ): EnhancedAction[] {
    const actions: EnhancedAction[] = [];

    actions.push({
      id: 'check_balance_bridge',
      name: 'Check token balance for bridging',
      description: 'Verify sufficient token balance for bridge',
      type: 'checkBalance',
      status: 'pending',
      agentType: 'web3',
      priority: 1,
      retries: 0,
      maxRetries: 3,
      timeout: 10000,
      params: {
        token: intent.parameters.token,
        amount: intent.parameters.amount,
        chainId: intent.parameters.fromChain,
      },
      dependencies: [],
      riskLevel: 'LOW',
    });

    actions.push({
      id: 'bridge_tokens',
      name: 'Bridge tokens across chains',
      description: `Bridge ${intent.parameters.amount} ${intent.parameters.token} from chain ${intent.parameters.fromChain} to ${intent.parameters.toChain}`,
      type: 'bridgeTokens',
      status: 'pending',
      agentType: 'web3',
      priority: 2,
      retries: 0,
      maxRetries: 3,
      timeout: 90000,
      params: {
        token: intent.parameters.token,
        amount: intent.parameters.amount,
        fromChain: intent.parameters.fromChain,
        toChain: intent.parameters.toChain,
        recipient: intent.parameters.recipient || context.currentAddress,
      },
      dependencies: ['check_balance_bridge'],
      riskLevel: 'HIGH',
    });

    return actions;
  }

  private createStakeActions(
    intent: EnhancedIntent,
    context: Web3Context
  ): EnhancedAction[] {
    const actions: EnhancedAction[] = [];

    actions.push({
      id: 'check_stake_balance',
      name: 'Check token balance for staking',
      description: 'Verify sufficient token balance for staking',
      type: 'checkBalance',
      status: 'pending',
      agentType: 'web3',
      priority: 1,
      retries: 0,
      maxRetries: 3,
      timeout: 10000,
      params: {
        token: intent.parameters.token,
        amount: intent.parameters.amount,
      },
      dependencies: [],
      riskLevel: 'LOW',
    });

    actions.push({
      id: 'stake_tokens',
      name: 'Stake tokens',
      description: `Stake ${intent.parameters.amount} ${intent.parameters.token}`,
      type: 'stakeTokens',
      status: 'pending',
      agentType: 'web3',
      priority: 2,
      retries: 0,
      maxRetries: 3,
      timeout: 60000,
      params: {
        token: intent.parameters.token,
        amount: intent.parameters.amount,
        pool: intent.parameters.pool,
      },
      dependencies: ['check_stake_balance'],
      riskLevel: 'HIGH',
    });

    return actions;
  }

  private createApproveActions(
    intent: EnhancedIntent,
    context: Web3Context
  ): EnhancedAction[] {
    const actions: EnhancedAction[] = [];

    actions.push({
      id: 'approve_tokens',
      name: 'Approve token spending',
      description: `Approve ${intent.parameters.spender} to spend ${intent.parameters.amount} ${intent.parameters.token}`,
      type: 'approveToken',
      status: 'pending',
      agentType: 'web3',
      priority: 1,
      retries: 0,
      maxRetries: 3,
      timeout: 45000,
      params: {
        token: intent.parameters.token,
        spender: intent.parameters.spender,
        amount: intent.parameters.amount,
      },
      dependencies: [],
      riskLevel: 'HIGH',
    });

    return actions;
  }

  private createGenericWeb3Actions(
    intent: EnhancedIntent,
    context: Web3Context
  ): EnhancedAction[] {
    return [{
      id: 'generic_web3_action',
      name: `Execute ${intent.action}`,
      description: `Execute ${intent.action} with parameters: ${JSON.stringify(intent.parameters)}`,
      type: intent.action.toLowerCase(),
      status: 'pending',
      agentType: 'web3',
      priority: 1,
      retries: 0,
      maxRetries: 3,
      timeout: 60000,
      params: intent.parameters,
      dependencies: [],
      riskLevel: 'MEDIUM',
    }];
  }

  private createInteractionActions(
    intent: EnhancedIntent,
    taskAnalysis: TaskAnalysis
  ): EnhancedAction[] {
    const actions: EnhancedAction[] = [];

    if (intent.parameters.clickTargets) {
      intent.parameters.clickTargets.forEach((target: string, index: number) => {
        actions.push({
          id: `click_${index}`,
          name: `Click ${target}`,
          description: `Click on ${target}`,
          type: 'clickElement',
          status: 'pending',
          agentType: 'navigator',
          priority: index + 1,
          retries: 0,
          maxRetries: 3,
          timeout: 15000,
          params: {
            text: target,
          },
          dependencies: index > 0 ? [`click_${index - 1}`] : [],
          riskLevel: 'LOW',
        });
      });
    }

    return actions;
  }

  private createAutomationActions(
    intent: EnhancedIntent,
    taskAnalysis: TaskAnalysis
  ): EnhancedAction[] {
    const actions: EnhancedAction[] = [];

    // Complex automation typically involves multiple steps
    if (taskAnalysis.browserActions) {
      taskAnalysis.browserActions.forEach((action: string, index: number) => {
        actions.push({
          id: `automation_${index}`,
          name: `Execute ${action}`,
          description: `Execute automation step: ${action}`,
          type: action,
          status: 'pending',
          agentType: 'navigator',
          priority: index + 1,
          retries: 0,
          maxRetries: 3,
          timeout: 20000,
          params: intent.parameters,
          dependencies: index > 0 ? [`automation_${index - 1}`] : [],
          riskLevel: 'MEDIUM',
        });
      });
    }

    return actions;
  }

  private createGenericActions(
    intent: EnhancedIntent,
    taskAnalysis: TaskAnalysis
  ): EnhancedAction[] {
    return [{
      id: 'generic_action',
      name: `Execute ${intent.action}`,
      description: `Execute ${intent.action} with parameters: ${JSON.stringify(intent.parameters)}`,
      type: intent.action.toLowerCase(),
      status: 'pending',
      agentType: 'navigator',
      priority: 1,
      retries: 0,
      maxRetries: 3,
      timeout: 30000,
      params: intent.parameters,
      dependencies: [],
      riskLevel: 'MEDIUM',
    }];
  }

  private async calculateDependencies(actions: EnhancedAction[]): Promise<string[]> {
    // Simple dependency calculation - can be enhanced with more sophisticated analysis
    const dependencyGraph = new Map<string, Set<string>>();

    // Build dependency graph
    for (const action of actions) {
      dependencyGraph.set(action.id, new Set(action.dependencies || []));
    }

    // Detect and resolve circular dependencies
    this.resolveCircularDependencies(dependencyGraph, actions);

    // Extract all unique dependencies
    const allDependencies = new Set<string>();
    for (const action of actions) {
      const resolvedDeps = Array.from(dependencyGraph.get(action.id) || []);
      resolvedDeps.forEach(dep => allDependencies.add(dep));
    }

    return Array.from(allDependencies);
  }

  private resolveCircularDependencies(
    graph: Map<string, Set<string>>,
    actions: EnhancedAction[]
  ): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const dependencies = graph.get(nodeId) || new Set();
      for (const depId of dependencies) {
        if (hasCycle(depId)) {
          // Remove circular dependency
          dependencies.delete(depId);
          logger.warn('Circular dependency detected and removed', {
            from: nodeId,
            to: depId,
          });
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const action of actions) {
      if (hasCycle(action.id)) {
        logger.warn('Circular dependency detected in action', { actionId: action.id });
      }
    }
  }

  private extractPlanDependencies(actions: EnhancedAction[]): string[] {
    const allDependencies = new Set<string>();
    
    for (const action of actions) {
      for (const dep of action.dependencies || []) {
        allDependencies.add(dep);
      }
    }

    return Array.from(allDependencies);
  }

  private estimateDuration(actions: EnhancedAction[]): number {
    return actions.reduce((total, action) => total + action.timeout, 0);
  }

  private assessPlanRisk(actions: EnhancedAction[], context: Web3Context): 'LOW' | 'MEDIUM' | 'HIGH' {
    const riskScores = actions.map(action => {
      switch (action.riskLevel) {
        case 'HIGH': return 3;
        case 'MEDIUM': return 2;
        case 'LOW': return 1;
        default: return 2;
      }
    });

    const averageRisk = riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length;

    if (averageRisk >= 2.5) return 'HIGH';
    if (averageRisk >= 1.5) return 'MEDIUM';
    return 'LOW';
  }

  private requiresConfirmation(actions: EnhancedAction[]): boolean {
    return actions.some(action => action.riskLevel === 'HIGH');
  }

  private generatePlanName(intent: EnhancedIntent, taskAnalysis: TaskAnalysis): string {
    return `${intent.action}_${taskAnalysis.taskType}_${Date.now()}`;
  }

  private generatePlanDescription(intent: EnhancedIntent, taskAnalysis: TaskAnalysis): string {
    return `Execute ${intent.action} with complexity ${taskAnalysis.complexity}`;
  }

  private calculateActionPriority(action: EnhancedAction, intent: EnhancedIntent): number {
    // Higher priority for critical actions
    if (action.riskLevel === 'HIGH') return 1;
    if (action.riskLevel === 'MEDIUM') return 2;
    return 3;
  }

  private getMaxRetriesForAction(action: EnhancedAction): number {
    switch (action.riskLevel) {
      case 'HIGH': return 5;
      case 'MEDIUM': return 3;
      case 'LOW': return 2;
      default: return 3;
    }
  }

  private getDefaultTimeoutForAction(action: EnhancedAction): number {
    switch (action.riskLevel) {
      case 'HIGH': return 60000;
      case 'MEDIUM': return 30000;
      case 'LOW': return 15000;
      default: return 30000;
    }
  }

  private generateContextRequirements(action: EnhancedAction): ContextRequirement[] {
    const requirements: ContextRequirement[] = [];

    if (action.agentType === 'web3') {
      requirements.push({
        type: 'wallet_state',
        required: true,
        description: 'Wallet must be connected',
        validator: (context: any) => context.isConnected,
      });
    }

    if (action.agentType === 'navigator') {
      requirements.push({
        type: 'browser_state',
        required: true,
        description: 'Browser must be available',
        validator: (context: any) => context.isActive,
      });
    }

    return requirements;
  }

  private calculateOptimizationLevel(actions: EnhancedAction[]): number {
    // Simple optimization calculation based on action count and complexity
    const actionCount = actions.length;
    const highRiskActions = actions.filter(a => a.riskLevel === 'HIGH').length;
    
    if (actionCount > 10) return 0.8;
    if (actionCount > 5) return 0.6;
    if (highRiskActions > 2) return 0.7;
    return 0.5;
  }

  private async optimizeActions(actions: EnhancedAction[]): Promise<EnhancedAction[]> {
    // Simple optimization - remove redundant actions, parallelize where possible
    const optimizedActions = [...actions];
    
    // Remove duplicate actions
    const uniqueActions = optimizedActions.filter((action, index, self) =>
      index === self.findIndex(a => a.type === action.type && JSON.stringify(a.params) === JSON.stringify(action.params))
    );

    // Optimize timeouts based on risk level
    return uniqueActions.map(action => ({
      ...action,
      timeout: Math.min(action.timeout, this.getOptimizedTimeout(action)),
    }));
  }

  private getOptimizedTimeout(action: EnhancedAction): number {
    const baseTimeout = action.timeout;
    const optimizationFactor = 0.8; // 20% optimization
    return Math.max(5000, baseTimeout * optimizationFactor);
  }

  private async generateFallbackActions(
    originalActions: EnhancedAction[],
    failurePoint: string,
    error: string
  ): Promise<EnhancedAction[]> {
    // Generate alternative actions based on failure type
    const failedActionIndex = originalActions.findIndex(a => a.id === failurePoint);
    if (failedActionIndex === -1) {
      return originalActions; // Return original if failure point not found
    }

    const failedAction = originalActions[failedActionIndex];
    const fallbackActions = originalActions.slice(0, failedActionIndex);

    // Add fallback action
    const fallbackAction = this.generateFallbackAction(failedAction, error);
    fallbackActions.push(fallbackAction);

    // Add remaining actions with updated dependencies
    const remainingActions = originalActions.slice(failedActionIndex + 1);
    remainingActions.forEach(action => {
      fallbackActions.push({
        ...action,
        dependencies: action.dependencies?.map(dep => 
          dep === failurePoint ? fallbackAction.id : dep
        ),
      });
    });

    return fallbackActions;
  }

  private generateFallbackAction(failedAction: EnhancedAction, error: string): EnhancedAction {
    // Generate a fallback version of the failed action
    return {
      ...failedAction,
      id: `${failedAction.id}_fallback`,
      name: `Fallback: ${failedAction.name}`,
      description: `Fallback action due to: ${error}`,
      retries: 0,
      maxRetries: failedAction.maxRetries + 2, // More retries for fallback
      timeout: failedAction.timeout * 1.5, // Longer timeout
      fallbackActions: failedAction.fallbackActions,
    };
  }

  // Public utility methods
  getStats(): { activePlans: number; totalPlans: number; averageActions: number } {
    return {
      activePlans: this.activePlans.size,
      totalPlans: this.planHistory.length,
      averageActions: this.planHistory.length > 0 
        ? this.planHistory.reduce((sum, plan) => sum + plan.actions.length, 0) / this.planHistory.length
        : 0,
    };
  }
}