import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { IWeb3LLM, Web3Context, LLMResponse } from '../llm/types';
import { HumanMessage, SystemMessage } from '../llm/messages';
import { TaskPlan as AgentTaskPlan, TaskPlanSchema } from '../schemas/AgentSchemas';
import { ExecutionContext, AgentMessage, PlanStep } from './AgentTypes';
import { AgentConfigManager } from '../schemas/AgentConfig';
import { createLogger } from '@/utils/logger';

const logger = createLogger('TaskPlanner');

// Planning context
export interface PlanningContext {
  instruction: string;
  currentUrl?: string;
  previousSteps: string[];
  failedSteps: string[];
  currentStep: number;
  maxSteps: number;
  context: Web3Context;
  pageElements?: any[];
  executionHistory?: Array<{
    step: string;
    success: boolean;
    error?: string;
    timestamp: number;
  }>;
  executionContext?: ExecutionContext;
}

// Planning strategies
export type PlanningStrategy = 
  | 'conservative'  // Fewer steps, higher safety
  | 'aggressive'    // More steps, faster execution
  | 'adaptive'      // Adjust based on context
  | 'fallback'      // Simple fallback plan

// Replanning triggers
export interface ReplanningTriggers {
  stepFailure: boolean;
  elementNotFound: boolean;
  timeoutExceeded: boolean;
  userInterruption: boolean;
  contextChange: boolean;
  confidenceLow: boolean;
}

/**
 * Dynamic Task Planner with replanning capabilities
 */
export class DynamicTaskPlanner {
  private llm: IWeb3LLM;
  private config: AgentConfigManager;
  private planningCache: Map<string, { plan: AgentTaskPlan; timestamp: number }> = new Map();
  private readonly cacheTimeoutMs: number = 30000; // 30 seconds

  constructor(llm: IWeb3LLM, config?: AgentConfigManager) {
    this.llm = llm;
    this.config = config || new AgentConfigManager('development');
  }

  /**
   * Create initial task plan
   */
  async createPlan(
    instruction: string,
    context: PlanningContext,
    strategy: PlanningStrategy = 'adaptive'
  ): Promise<{ plan: AgentTaskPlan; confidence: number; reasoning: string }> {
    try {
      const cacheKey = this.generateCacheKey(instruction, context);
      const cached = this.getFromCache(cacheKey);
      
      if (cached) {
        logger.debug('Using cached task plan', { instruction });
        return {
          plan: cached.plan,
          confidence: 0.8, // Slightly reduce confidence for cached plans
          reasoning: 'Using cached plan with minor adjustments',
        };
      }

      logger.info('Creating new task plan', {
        instruction,
        strategy,
        currentStep: context.currentStep,
        hasPreviousSteps: context.previousSteps.length > 0,
      });

      const prompt = this.createPlanningPrompt(instruction, context, strategy);
      const response = await this.llm.generateResponse(
        [
          new SystemMessage(prompt.systemPrompt),
          new HumanMessage(prompt.userPrompt),
        ],
        context.context
      );

      const plan = this.parsePlanningResponse(response.response);
      
      // Validate and enhance the plan
      const validatedPlan = await this.validateAndEnhancePlan(plan, context);
      
      // Cache the result
      this.setToCache(cacheKey, validatedPlan);

      logger.info('Task plan created successfully', {
        steps: validatedPlan.steps.length,
        estimatedDuration: validatedPlan.estimatedDuration,
        confidence: validatedPlan.confidence,
      });

      return {
        plan: validatedPlan,
        confidence: validatedPlan.confidence,
        reasoning: validatedPlan.reasoning,
      };

    } catch (error) {
      logger.error('Task planning failed', error);
      
      // Return fallback plan
      return this.createFallbackPlan(instruction, context);
    }
  }

  /**
   * Replan based on current state and failures
   */
  async replan(
    originalPlan: AgentTaskPlan,
    context: PlanningContext,
    triggers: ReplanningTriggers,
    lastError?: string
  ): Promise<{ plan: AgentTaskPlan; confidence: number; reasoning: string; shouldContinue: boolean }> {
    try {
      logger.info('Initiating replanning', {
        triggers,
        lastError,
        currentStep: context.currentStep,
        failedSteps: context.failedSteps.length,
      });

      const prompt = this.createReplanningPrompt(originalPlan, context, triggers, lastError);
      const response = await this.llm.generateResponse(
        [
          new SystemMessage(prompt.systemPrompt),
          new HumanMessage(prompt.userPrompt),
        ],
        context.context
      );

      const replanResult = this.parseReplanningResponse(response.response);

      logger.info('Replanning completed', {
        strategy: replanResult.strategy,
        steps: replanResult.plan.steps.length,
        shouldContinue: replanResult.shouldContinue,
      });

      return {
        plan: replanResult.plan,
        confidence: replanResult.confidence,
        reasoning: replanResult.reasoning,
        shouldContinue: replanResult.shouldContinue,
      };

    } catch (error) {
      logger.error('Replanning failed', error);
      
      // Determine if we should continue with a simple fallback
      const shouldContinue = this.shouldContinueAfterFailure(context, triggers);
      
      if (shouldContinue) {
        const fallbackPlan = await this.createRecoveryPlan(originalPlan, context, lastError);
        return {
          plan: fallbackPlan.plan,
          confidence: fallbackPlan.confidence,
          reasoning: fallbackPlan.reasoning,
          shouldContinue: true,
        };
      } else {
        return {
          plan: originalPlan, // Return original plan
          confidence: 0.1,
          reasoning: `Replanning failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          shouldContinue: false,
        };
      }
    }
  }

  /**
   * Adapt plan based on execution progress
   */
  async adaptPlan(
    currentPlan: AgentTaskPlan,
    context: PlanningContext,
    executedSteps: number
  ): Promise<{ adaptedPlan: AgentTaskPlan; changes: string[] }> {
    try {
      logger.info('Adapting plan based on execution progress', {
        executedSteps,
        totalSteps: currentPlan.steps.length,
        currentStep: context.currentStep,
      });

      const remainingSteps: PlanStep[] = currentPlan.steps.slice(executedSteps) as PlanStep[];
      const changes: string[] = [];

      // Analyze execution results and adapt remaining steps
      if (context.executionHistory) {
        const recentFailures = context.executionHistory
          .slice(-3)
          .filter(step => !step.success);

        if (recentFailures.length > 0) {
          // Add recovery steps or modify approach
          const adaptedSteps = await this.addRecoverySteps(
            remainingSteps,
            recentFailures,
            context
          );
          changes.push('Added recovery steps for recent failures');
          remainingSteps.splice(0, remainingSteps.length, ...adaptedSteps);
        }
      }

      // Adjust timeouts based on actual performance
      const timeoutAdjustedSteps: PlanStep[] = this.adjustTimeouts(remainingSteps, context);
      if (timeoutAdjustedSteps.length !== remainingSteps.length) {
        changes.push('Adjusted step timeouts based on performance');
      }

      const adaptedPlan: AgentTaskPlan = {
        ...currentPlan,
        steps: timeoutAdjustedSteps,
        estimatedDuration: this.estimateRemainingDuration(timeoutAdjustedSteps),
        confidence: this.calculateAdaptedConfidence(currentPlan, context),
        reasoning: `Adapted plan with ${changes.length} modifications: ${changes.join(', ')}`,
      };

      logger.info('Plan adaptation completed', {
        changes,
        newStepCount: adaptedPlan.steps.length,
        confidence: adaptedPlan.confidence,
      });

      return {
        adaptedPlan,
        changes,
      };

    } catch (error) {
      logger.error('Plan adaptation failed', error);
      return {
        adaptedPlan: currentPlan,
        changes: [],
      };
    }
  }

  // Private helper methods

  private createPlanningPrompt(
    instruction: string,
    context: PlanningContext,
    strategy: PlanningStrategy
  ): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are an expert web automation planner. Your job is to break down user instructions into executable steps for browser automation.

STRATEGY: ${strategy.toUpperCase()}
- Conservative: Fewer steps, higher reliability, longer timeouts
- Aggressive: More parallel steps, faster execution, riskier
- Adaptive: Balance based on task complexity and context
- Fallback: Simple, reliable steps only

STEP TYPES:
- navigate: Go to a URL
- click: Click on an element (using index-based selection)
- input: Type text into an input field (using index-based selection)
- wait: Wait for a condition or time period
- extract: Extract information from the page
- validate: Verify task completion

ELEMENT SELECTION:
- Use index-based selection (0, 1, 2, etc.) instead of CSS selectors
- Elements are automatically detected and indexed by visibility and interactivity
- Index 0 is typically the most relevant element for the action

PLANNING RULES:
1. Start with navigation if URL is mentioned
2. Include wait steps after navigation for page load
3. Use specific element indices when possible
4. Add validation steps to confirm completion
5. Consider failure scenarios and include alternatives
6. Keep steps atomic and focused
7. Estimate realistic timeouts (2-30 seconds)

RESPONSE FORMAT: Always respond with a valid JSON object:
{
  "steps": [
    {
      "id": "step_1",
      "type": "navigate|click|input|wait|extract|validate",
      "description": "Clear description of what this step does",
      "selector": "CSS selector or leave empty for index-based",
      "index": number or leave empty,
      "params": {"key": "value"},
      "dependencies": ["step_0"],
      "timeout": 10000
    }
  ],
  "estimatedDuration": 30000,
  "confidence": 0.8,
  "reasoning": "Explanation of the planning approach"
}`;

    const userPrompt = `Create a step-by-step plan for this instruction: "${instruction}"

Current context:
- Current URL: ${context.currentUrl || 'Not available'}
- Current step: ${context.currentStep}/${context.maxSteps}
- Previous steps: ${context.previousSteps.join(', ') || 'None'}
- Failed steps: ${context.failedSteps.join(', ') || 'None'}

Available page elements will be provided during execution.

Generate a detailed plan following the specified format.`;

    return { systemPrompt, userPrompt };
  }

  private createReplanningPrompt(
    originalPlan: AgentTaskPlan,
    context: PlanningContext,
    triggers: ReplanningTriggers,
    lastError?: string
  ): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are an expert at recovering from failed automation tasks. Your job is to analyze failures and create revised plans.

REPLANNING TRIGGERS:
- Step failure: Action failed to execute
- Element not found: Target element unavailable
- Timeout exceeded: Action took too long
- Context change: Page state changed unexpectedly
- Confidence low: Low certainty in current approach

REPLANNING STRATEGIES:
1. Alternative approach: Try different element or method
2. Wait and retry: Add delay and retry same action
3. Skip and continue: Skip failed step if possible
4. Recovery actions: Add explicit recovery steps
5. Complete redo: Start over with new approach

RESPONSE FORMAT:
{
  "strategy": "alternative|retry|skip|recovery|redo",
  "plan": {
    "steps": [...],
    "estimatedDuration": number,
    "confidence": number,
    "reasoning": string
  },
  "confidence": number,
  "reasoning": "Why this approach should work",
  "shouldContinue": true/false
}`;

    const triggerList = Object.entries(triggers)
      .filter(([_, triggered]) => triggered)
      .map(([trigger, _]) => trigger);

    const userPrompt = `Replan this failed task:

Original instruction: "${context.instruction}"
Original plan reasoning: "${originalPlan.reasoning}"

Current status:
- Step ${context.currentStep}/${context.maxSteps}
- Failed steps: ${context.failedSteps.join(', ')}
- Triggered replanning due to: ${triggerList.join(', ')}
- Last error: ${lastError || 'None'}

Original steps:
${originalPlan.steps.map((step, i) => `${i + 1}. ${step.type}: ${step.description}`).join('\\n')}

Create a revised plan that addresses the failure. Consider alternative approaches, better error handling, or recovery actions.`;

    return { systemPrompt, userPrompt };
  }

  private parsePlanningResponse(response: string): AgentTaskPlan {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const validated = TaskPlanSchema.parse(parsed);

      // Enhance plan with additional metadata
      return {
        ...validated,
        steps: validated.steps.map((step, index) => ({
          ...step,
          id: step.id || `step_${index + 1}`,
          timeout: step.timeout || 10000,
        })),
      };
    } catch (error) {
      logger.error('Failed to parse planning response', { response, error });
      throw new Error(`Invalid planning response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseReplanningResponse(response: string): {
    strategy: string;
    plan: AgentTaskPlan;
    confidence: number;
    reasoning: string;
    shouldContinue: boolean;
  } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in replanning response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const plan = TaskPlanSchema.parse(parsed.plan);

      return {
        strategy: parsed.strategy || 'alternative',
        plan,
        confidence: parsed.confidence || 0.7,
        reasoning: parsed.reasoning || 'Replanning completed',
        shouldContinue: parsed.shouldContinue !== false,
      };
    } catch (error) {
      logger.error('Failed to parse replanning response', { response, error });
      throw new Error(`Invalid replanning response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async validateAndEnhancePlan(plan: AgentTaskPlan, context: PlanningContext): Promise<AgentTaskPlan> {
    const enhancedSteps: PlanStep[] = [...plan.steps] as PlanStep[];

    // Add navigation step if needed and not present
    const urlMatch = context.instruction.match(/https?:\/\/[^\s]+/);
    if (urlMatch && !enhancedSteps.some(step => step.type === 'navigate')) {
      enhancedSteps.unshift({
        id: 'navigate_start',
        type: 'navigate',
        description: `Navigate to ${urlMatch[0]}`,
        parameters: { url: urlMatch[0] },
        dependencies: [],
        timeout: 30000,
        retries: 0,
        required: true,
      } as PlanStep);
    }

    // Add wait steps after navigation
    for (let i = 0; i < enhancedSteps.length; i++) {
      if (enhancedSteps[i].type === 'navigate' && 
          (i === enhancedSteps.length - 1 || enhancedSteps[i + 1].type !== 'wait')) {
        enhancedSteps.splice(i + 1, 0, {
          id: `wait_after_${enhancedSteps[i].id}`,
          type: 'wait',
          description: 'Wait for page to load',
          parameters: { duration: 3000 },
          dependencies: [enhancedSteps[i].id],
          timeout: 5000,
          retries: 0,
          required: true,
        } as PlanStep);
        i++; // Skip the added wait step
      }
    }

    // Add validation step at the end if not present
    if (!enhancedSteps.some(step => step.type === 'validate')) {
      enhancedSteps.push({
        id: 'validate_completion',
        type: 'validate',
        description: 'Validate task completion',
        parameters: { criteria: 'task_success' },
        dependencies: enhancedSteps.length > 0 ? [enhancedSteps[enhancedSteps.length - 1].id] : [],
        timeout: 5000,
        retries: 0,
        required: true,
      } as PlanStep);
    }

    return {
      ...plan,
      steps: enhancedSteps,
      estimatedDuration: this.estimateTotalDuration(enhancedSteps),
      confidence: this.calculatePlanConfidence(enhancedSteps, context),
      reasoning: `${plan.reasoning} (Enhanced with ${enhancedSteps.length - plan.steps.length} additional steps)`,
    };
  }

  private createFallbackPlan(
    instruction: string,
    context: PlanningContext
  ): { plan: AgentTaskPlan; confidence: number; reasoning: string } {
    const steps: PlanStep[] = [];

    // Very basic fallback plan
    const urlMatch = instruction.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      steps.push({
        id: 'fallback_navigate',
        type: 'navigate',
        description: `Navigate to ${urlMatch[0]}`,
        parameters: { url: urlMatch[0] },
        dependencies: [],
        timeout: 30000,
        retries: 0,
        required: true,
      } as PlanStep);

      steps.push({
        id: 'fallback_wait',
        type: 'wait',
        description: 'Wait for page load',
        parameters: { duration: 5000 },
        dependencies: ['fallback_navigate'],
        timeout: 10000,
        retries: 0,
        required: true,
      } as PlanStep);
    }

    steps.push({
      id: 'fallback_extract',
      type: 'extract',
      description: 'Extract page content',
      parameters: { selector: 'body' },
      dependencies: steps.length > 0 ? [steps[steps.length - 1].id] : [],
      timeout: 10000,
      retries: 0,
      required: true,
    } as PlanStep);

    const plan: AgentTaskPlan = {
      id: uuidv4(),
      instruction,
      steps,
      priority: 'medium',
      estimatedDuration: this.estimateTotalDuration(steps),
      confidence: 0.4,
      reasoning: 'Fallback plan created due to planning failure',
    };

    return {
      plan,
      confidence: 0.4,
      reasoning: 'Using fallback plan due to planning failure',
    };
  }

  private createRecoveryPlan(
    originalPlan: AgentTaskPlan,
    context: PlanningContext,
    lastError?: string
  ): { plan: AgentTaskPlan; confidence: number; reasoning: string } {
    const steps: PlanStep[] = [];

    // Add recovery wait step
    steps.push({
      id: 'recovery_wait',
      type: 'wait',
      description: 'Wait before retry',
      parameters: { duration: 2000 },
      dependencies: [],
      timeout: 5000,
      retries: 0,
      required: true,
    } as PlanStep);

    // Add a simple retry step
    const remainingSteps = originalPlan.steps.slice(context.currentStep);
    if (remainingSteps.length > 0) {
      const nextStep = remainingSteps[0];
      steps.push({
        ...nextStep,
        id: `retry_${nextStep.id}`,
        type: nextStep.type, // Ensure type is explicitly set
        description: `Retry: ${nextStep.description}`,
        dependencies: ['recovery_wait'],
        timeout: Math.max(nextStep.timeout || 10000, 15000), // Increase timeout
        required: true,
      } as PlanStep);
    }

    const plan: AgentTaskPlan = {
      id: uuidv4(),
      instruction: originalPlan.instruction,
      steps,
      priority: originalPlan.priority,
      estimatedDuration: this.estimateTotalDuration(steps),
      confidence: 0.5,
      reasoning: `Recovery plan created for: ${lastError || 'Unknown error'}`,
    };

    return {
      plan,
      confidence: 0.5,
      reasoning: 'Using recovery plan after failure',
    };
  }

  private shouldContinueAfterFailure(context: PlanningContext, triggers: ReplanningTriggers): boolean {
    // Continue if we haven't exceeded limits and the failure seems recoverable
    return (
      context.currentStep < context.maxSteps &&
      context.failedSteps.length < 3 &&
      !triggers.userInterruption &&
      !triggers.timeoutExceeded
    );
  }

  private addRecoverySteps(
    steps: PlanStep[],
    failures: Array<{ step: string; success: boolean; error?: string }>,
    context: PlanningContext
  ): Promise<PlanStep[]> {
    const recoverySteps: PlanStep[] = [];

    // Add a wait step before retrying
    recoverySteps.push({
      id: 'recovery_wait',
      type: 'wait',
      description: 'Wait before retrying failed actions',
      parameters: { duration: 3000 },
      dependencies: [],
      timeout: 5000,
      retries: 0,
      required: true,
    } as PlanStep);

    // Add the original steps with increased timeouts
    const enhancedSteps = steps.map(step => ({
      ...step,
      type: step.type, // Ensure type is explicitly set
      timeout: Math.max(step.timeout || 10000, 20000),
      dependencies: [...(step.dependencies || []), 'recovery_wait'],
    } as PlanStep));

    return Promise.resolve([...recoverySteps, ...enhancedSteps]);
  }

  private adjustTimeouts(steps: PlanStep[], context: PlanningContext): PlanStep[] {
    return steps.map(step => {
      // Increase timeouts if we've had recent failures
      const failureRate = context.executionHistory ? 
        context.executionHistory.filter(h => !h.success).length / context.executionHistory.length : 0;

      const multiplier = failureRate > 0.5 ? 1.5 : 1.0;
      const adjustedTimeout = Math.round((step.timeout || 10000) * multiplier);

      return {
        ...step,
        timeout: Math.min(adjustedTimeout, 60000), // Cap at 60 seconds
      };
    });
  }

  private estimateTotalDuration(steps: PlanStep[]): number {
    return steps.reduce((total, step) => total + (step.timeout || 10000), 0);
  }

  private estimateRemainingDuration(steps: PlanStep[]): number {
    return this.estimateTotalDuration(steps);
  }

  private calculatePlanConfidence(steps: PlanStep[], context: PlanningContext): number {
    let confidence = 0.8;

    // Reduce confidence based on failed steps
    if (context.failedSteps.length > 0) {
      confidence -= context.failedSteps.length * 0.1;
    }

    // Reduce confidence for complex tasks
    if (steps.length > 10) {
      confidence -= 0.1;
    }

    // Increase confidence if we have a clear URL
    if (context.instruction.match(/https?:\/\/[^\s]+/)) {
      confidence += 0.1;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private calculateAdaptedConfidence(originalPlan: AgentTaskPlan, context: PlanningContext): number {
    // Slightly reduce confidence for adapted plans
    return Math.max(0.3, (originalPlan as any).confidence - 0.1);
  }

  private generateCacheKey(instruction: string, context: PlanningContext): string {
    return `${instruction}_${context.currentUrl || 'no_url'}_${context.currentStep}`;
  }

  private getFromCache(key: string): { plan: AgentTaskPlan; timestamp: number } | null {
    const cached = this.planningCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeoutMs) {
      return cached;
    }
    return null;
  }

  private setToCache(key: string, plan: AgentTaskPlan): void {
    this.planningCache.set(key, {
      plan,
      timestamp: Date.now(),
    });
  }

  clearCache(): void {
    this.planningCache.clear();
    logger.info('Task planning cache cleared');
  }

  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.planningCache.size,
      hitRate: 0, // Would need hit tracking implementation
    };
  }
}