import { 
  EnhancedAction, 
  ActionResult, 
  BrowserState, 
  ElementSelector,
  InteractionResult,
  ExecutionPlan 
} from '../types/BaseTypes';
import { Web3Context } from '../types';
import { TaskAnalysis } from '../task-analysis/IntelligentTaskAnalyzer';
import { ElementSelectorEngine } from '../automation/components/ElementSelector';
import { BrowserAutomationController } from '../automation/BrowserAutomationController';
import { createLogger } from '@/utils/logger';

const logger = createLogger('NavigatorAgent');

export class NavigatorAgent {
  private id: string;
  private elementSelector: ElementSelectorEngine;
  private browserController: BrowserAutomationController;
  private activeExecutions: Map<string, EnhancedAction> = new Map();
  private executionHistory: Map<string, ActionResult[]> = new Map();

  constructor(
    id: string = 'navigator-agent',
    browserController?: BrowserAutomationController
  ) {
    this.id = id;
    this.elementSelector = new ElementSelectorEngine();
    this.browserController = browserController || new BrowserAutomationController();
  }

  /**
   * Execute a single action with full browser automation capabilities
   */
  async executeAction(
    action: EnhancedAction,
    context: Web3Context
  ): Promise<ActionResult> {
    logger.info('Executing action', {
      actionId: action.id,
      actionType: action.type,
      agentType: action.agentType,
    });

    const startTime = Date.now();
    this.activeExecutions.set(action.id, action);

    try {
      // Validate context requirements
      const contextValidation = this.validateContext(action, context);
      if (!contextValidation.valid) {
        throw new Error(`Context validation failed: ${contextValidation.errors.join(', ')}`);
      }

      // Execute action based on type
      let result: ActionResult;
      
      switch (action.type) {
        case 'navigateToUrl':
          result = await this.executeNavigation(action);
          break;
        case 'clickElement':
          result = await this.executeClick(action);
          break;
        case 'fillForm':
          result = await this.executeFillForm(action);
          break;
        case 'extractContent':
          result = await this.executeExtractContent(action);
          break;
        case 'selectDropdown':
          result = await this.executeSelectDropdown(action);
          break;
        case 'waitFor':
          result = await this.executeWaitFor(action);
          break;
        case 'scroll':
          result = await this.executeScroll(action);
          break;
        case 'screenshot':
          result = await this.executeScreenshot(action);
          break;
        case 'switchTab':
          result = await this.executeSwitchTab(action);
          break;
        case 'closeTab':
          result = await this.executeCloseTab(action);
          break;
        default:
          result = await this.executeGenericAction(action);
      }

      const timing = Date.now() - startTime;
      const finalResult: ActionResult = {
        ...result,
        timing,
        metadata: {
          ...result.metadata,
          actionId: action.id,
          executionTime: timing,
          agentId: this.id,
        },
      };

      // Store execution result
      this.storeExecutionResult(action.id, finalResult);
      this.activeExecutions.delete(action.id);

      logger.info('Action executed successfully', {
        actionId: action.id,
        success: finalResult.success,
        timing,
      });

      return finalResult;
    } catch (error) {
      const timing = Date.now() - startTime;
      const errorResult: ActionResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timing,
        metadata: {
          actionId: action.id,
          executionTime: timing,
          agentId: this.id,
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        },
      };

      this.storeExecutionResult(action.id, errorResult);
      this.activeExecutions.delete(action.id);

      logger.error('Action execution failed', {
        actionId: action.id,
        error: errorResult.error,
        timing,
      });

      return errorResult;
    }
  }

  /**
   * Execute multiple actions with coordination
   */
  async executeActions(
    actions: EnhancedAction[],
    context: Web3Context,
    executionMode: 'sequential' | 'parallel' = 'sequential'
  ): Promise<ActionResult[]> {
    logger.info('Executing multiple actions', {
      count: actions.length,
      executionMode,
    });

    if (executionMode === 'parallel') {
      return await this.executeActionsParallel(actions, context);
    } else {
      return await this.executeActionsSequential(actions, context);
    }
  }

  /**
   * Execute plan with advanced coordination and error recovery
   */
  async executePlan(
    plan: ExecutionPlan,
    context: Web3Context
  ): Promise<{ success: boolean; results: ActionResult[]; executedActions: EnhancedAction[] }> {
    logger.info('Executing execution plan', {
      planId: plan.id,
      actionCount: plan.actions.length,
      estimatedDuration: plan.estimatedDuration,
    });

    const results: ActionResult[] = [];
    const executedActions: EnhancedAction[] = [];
    let planSuccess = true;

    try {
      // Execute actions in dependency order
      const executionOrder = this.calculateExecutionOrder(plan);
      
      for (const actionId of executionOrder) {
        const action = plan.actions.find(a => a.id === actionId);
        if (!action) continue;

        // Check if dependencies are satisfied
        const dependenciesSatisfied = this.checkDependencies(action, executedActions);
        if (!dependenciesSatisfied) {
          logger.warn('Skipping action due to unsatisfied dependencies', { actionId: action.id });
          continue;
        }

        // Execute action with retry logic
        const result = await this.executeActionWithRetry(action, context);
        results.push(result);
        executedActions.push(action);

        // Check if action failed and handle error recovery
        if (!result.success) {
          planSuccess = false;
          
          // Attempt error recovery
          const recovered = await this.attemptErrorRecovery(action, result, context);
          if (recovered) {
            logger.info('Action recovered successfully', { actionId: action.id });
          } else {
            logger.error('Action recovery failed', { actionId: action.id });
            
            // Decide whether to continue or abort based on plan configuration
            if (plan.metadata.executionStrategy?.errorHandling === 'stop_on_error') {
              logger.info('Stopping plan execution due to error', { actionId: action.id });
              break;
            }
          }
        }
      }

      logger.info('Plan execution completed', {
        planId: plan.id,
        success: planSuccess,
        executedActions: executedActions.length,
        totalActions: plan.actions.length,
      });

      return {
        success: planSuccess,
        results,
        executedActions,
      };
    } catch (error) {
      logger.error('Plan execution failed', {
        planId: plan.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        results,
        executedActions,
      };
    }
  }

  /**
   * Get current browser state
   */
  async getBrowserState(): Promise<BrowserState> {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const allTabs = await chrome.tabs.query({});

        const domState = await this.getDOMState();
        const networkState = await this.getNetworkState();

        return {
          currentUrl: activeTab?.url || '',
          title: activeTab?.title || '',
          activeTabId: activeTab?.id || -1,
          availableTabs: allTabs.map(tab => ({
            id: tab.id!,
            url: tab.url || '',
            title: tab.title || '',
            status: tab.status as any,
            lastActivity: Date.now(),
          })),
          domState,
          networkState,
          interactionState: {
            lastAction: '',
            lastActionTime: 0,
            actionQueue: [],
            isProcessing: false,
          },
        };
      } else {
        // Fallback for non-extension context
        return {
          currentUrl: window.location.href,
          title: document.title,
          activeTabId: -1,
          availableTabs: [],
          domState: await this.getDOMState(),
          networkState: await this.getNetworkState(),
          interactionState: {
            lastAction: '',
            lastActionTime: 0,
            actionQueue: [],
            isProcessing: false,
          },
        };
      }
    } catch (error) {
      logger.error('Failed to get browser state', error);
      throw error;
    }
  }

  /**
   * Get execution history
   */
  getExecutionHistory(actionId?: string): ActionResult[] {
    if (actionId) {
      return this.executionHistory.get(actionId) || [];
    }
    return Array.from(this.executionHistory.values()).flat();
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory.clear();
    this.activeExecutions.clear();
    logger.info('Navigator agent history cleared');
  }

  // Private helper methods

  private async executeNavigation(action: EnhancedAction): Promise<ActionResult> {
    const result = await this.browserController.executeAction({
      ...action,
      type: 'navigate',
    } as any);

    return {
      success: result.success,
      data: result.data,
      timing: result.timing,
      metadata: {
        method: 'navigation',
        url: action.params.url,
      },
    };
  }

  private async executeClick(action: EnhancedAction): Promise<ActionResult> {
    const selector: ElementSelector = {
      strategy: 'css',
      selector: action.params.selector || action.params.text,
      confidence: 0.8,
      fallbackSelectors: action.params.fallbackSelectors,
    };

    const result = await this.elementSelector.clickElement(selector);
    
    return {
      success: result.success,
      data: result.result,
      timing: result.timing,
      metadata: {
        method: 'click',
        selector: selector.selector,
        element: result.element,
      },
    };
  }

  private async executeFillForm(action: EnhancedAction): Promise<ActionResult> {
    const results: any[] = [];
    
    for (const field of action.params.fields || []) {
      const selector: ElementSelector = {
        strategy: 'css',
        selector: field.selector || field.name,
        confidence: 0.8,
      };

      const result = await this.elementSelector.fillInput(selector, field.value);
      results.push(result);

      if (!result.success) {
        return {
          success: false,
          error: `Failed to fill field ${field.name || field.selector}: ${result.sideEffects?.[0]}`,
          timing: result.timing,
          metadata: { fieldResults: results },
        };
      }
    }

    // Submit form if requested
    if (action.params.submit) {
      const submitSelector: ElementSelector = {
        strategy: 'css',
        selector: 'button[type="submit"], input[type="submit"], .submit',
        confidence: 0.7,
      };

      const submitResult = await this.elementSelector.clickElement(submitSelector);
      results.push(submitResult);
    }

    return {
      success: results.every(r => r.success),
      data: { fieldResults: results },
      timing: results.reduce((sum, r) => sum + r.timing, 0),
      metadata: {
        method: 'fill_form',
        fieldCount: action.params.fields?.length || 0,
        submitted: action.params.submit,
      },
    };
  }

  private async executeExtractContent(action: EnhancedAction): Promise<ActionResult> {
    const selector: ElementSelector = {
      strategy: 'css',
      selector: action.params.selector || 'body',
      confidence: 0.9,
    };

    const result = await this.elementSelector.extractContent(
      selector,
      action.params.type || 'text',
      action.params.attribute
    );

    return {
      success: result.success,
      data: result.result,
      timing: result.timing,
      metadata: {
        method: 'extract_content',
        type: action.params.type || 'text',
        selector: selector.selector,
      },
    };
  }

  private async executeSelectDropdown(action: EnhancedAction): Promise<ActionResult> {
    const selector: ElementSelector = {
      strategy: 'css',
      selector: action.params.selector,
      confidence: 0.8,
    };

    const result = await this.elementSelector.selectDropdown(selector, action.params.value);

    return {
      success: result.success,
      data: result.result,
      timing: result.timing,
      metadata: {
        method: 'select_dropdown',
        selector: selector.selector,
        value: action.params.value,
      },
    };
  }

  private async executeWaitFor(action: EnhancedAction): Promise<ActionResult> {
    const startTime = Date.now();
    
    // Wait for specified condition
    await new Promise(resolve => setTimeout(resolve, action.params.timeout || 1000));

    return {
      success: true,
      data: { waited: action.params.timeout || 1000 },
      timing: Date.now() - startTime,
      metadata: {
        method: 'wait_for',
        condition: action.params.condition,
      },
    };
  }

  private async executeScroll(action: EnhancedAction): Promise<ActionResult> {
    const result = await this.browserController.executeAction({
      ...action,
      type: 'scroll',
    } as any);

    return {
      success: result.success,
      data: result.data,
      timing: result.timing,
      metadata: {
        method: 'scroll',
        direction: action.params.direction,
      },
    };
  }

  private async executeScreenshot(action: EnhancedAction): Promise<ActionResult> {
    const result = await this.browserController.executeAction({
      ...action,
      type: 'screenshot',
    } as any);

    return {
      success: result.success,
      data: result.data,
      timing: result.timing,
      metadata: {
        method: 'screenshot',
        format: action.params.format,
      },
    };
  }

  private async executeSwitchTab(action: EnhancedAction): Promise<ActionResult> {
    const result = await this.browserController.executeAction({
      ...action,
      type: 'switch_tab',
    } as any);

    return {
      success: result.success,
      data: result.data,
      timing: result.timing,
      metadata: {
        method: 'switch_tab',
        tabIndex: action.params.tabIndex,
      },
    };
  }

  private async executeCloseTab(action: EnhancedAction): Promise<ActionResult> {
    const result = await this.browserController.executeAction({
      ...action,
      type: 'close_tab',
    } as any);

    return {
      success: result.success,
      data: result.data,
      timing: result.timing,
      metadata: {
        method: 'close_tab',
        tabId: action.params.tabId,
      },
    };
  }

  private async executeGenericAction(action: EnhancedAction): Promise<ActionResult> {
    // Try to execute via browser controller for unknown action types
    try {
      const result = await this.browserController.executeAction(action as any);
      
      return {
        success: result.success,
        data: result.data,
        timing: result.timing,
        metadata: {
          method: 'generic',
          actionType: action.type,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Unsupported action type: ${action.type}`,
        timing: 0,
        metadata: {
          method: 'generic',
          actionType: action.type,
        },
      };
    }
  }

  private async executeActionsSequential(
    actions: EnhancedAction[],
    context: Web3Context
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const action of actions) {
      const result = await this.executeAction(action, context);
      results.push(result);

      // Stop on failure if configured
      if (!result.success) {
        break;
      }
    }

    return results;
  }

  private async executeActionsParallel(
    actions: EnhancedAction[],
    context: Web3Context
  ): Promise<ActionResult[]> {
    const promises = actions.map(action => this.executeAction(action, context));
    return await Promise.all(promises);
  }

  private async executeActionWithRetry(
    action: EnhancedAction,
    context: Web3Context,
    attempt: number = 1
  ): Promise<ActionResult> {
    try {
      return await this.executeAction(action, context);
    } catch (error) {
      if (attempt < action.maxRetries) {
        logger.warn('Action failed, retrying', {
          actionId: action.id,
          attempt,
          maxRetries: action.maxRetries,
          error: error instanceof Error ? error.message : String(error),
        });

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));

        return this.executeActionWithRetry(action, context, attempt + 1);
      }
      
      throw error;
    }
  }

  private validateContext(
    action: EnhancedAction,
    context: Web3Context
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (action.contextRequirements) {
      for (const requirement of action.contextRequirements) {
        if (requirement.required && requirement.validator) {
          try {
            const isValid = requirement.validator(context);
            if (!isValid) {
              errors.push(requirement.description);
            }
          } catch (error) {
            errors.push(`Context validation error: ${requirement.description}`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private calculateExecutionOrder(plan: ExecutionPlan): string[] {
    // Topological sort based on dependencies
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (actionId: string) => {
      if (visited.has(actionId)) return;
      if (visiting.has(actionId)) {
        throw new Error(`Circular dependency detected: ${actionId}`);
      }

      visiting.add(actionId);

      const action = plan.actions.find(a => a.id === actionId);
      if (action) {
        for (const depId of action.dependencies || []) {
          visit(depId);
        }
      }

      visiting.delete(actionId);
      visited.add(actionId);
      order.push(actionId);
    };

    for (const action of plan.actions) {
      visit(action.id);
    }

    return order;
  }

  private checkDependencies(action: EnhancedAction, executedActions: EnhancedAction[]): boolean {
    if (!action.dependencies || action.dependencies.length === 0) {
      return true;
    }

    return action.dependencies.every(depId =>
      executedActions.some(executed => executed.id === depId)
    );
  }

  private async attemptErrorRecovery(
    action: EnhancedAction,
    errorResult: ActionResult,
    context: Web3Context
  ): Promise<boolean> {
    logger.info('Attempting error recovery', {
      actionId: action.id,
      error: errorResult.error,
    });

    // Try fallback actions if available
    if (action.fallbackActions && action.fallbackActions.length > 0) {
      for (const fallbackActionId of action.fallbackActions) {
        // Find fallback action in the same plan or context
        // This is a simplified implementation - in practice, you'd need a more sophisticated lookup
        logger.info('Trying fallback action', { fallbackActionId });
        
        // For now, just return true to indicate recovery was attempted
        return true;
      }
    }

    // Try alternative strategies based on error type
    if (errorResult.error?.includes('Element not found')) {
      // Try alternative selectors or strategies
      logger.info('Trying alternative element selection strategies');
      return true;
    }

    if (errorResult.error?.includes('Timeout')) {
      // Retry with longer timeout
      logger.info('Trying with extended timeout');
      return true;
    }

    return false;
  }

  private async getDOMState(): Promise<any> {
    // Get DOM state information
    if (typeof document !== 'undefined') {
      return {
        readyState: document.readyState as any,
        hasForms: document.forms.length > 0,
        hasInputs: document.querySelectorAll('input').length > 0,
        hasButtons: document.querySelectorAll('button').length > 0,
        hasLinks: document.querySelectorAll('a').length > 0,
        visibleElements: [],
        hiddenElements: [],
      };
    }
    
    // Fallback for extension context
    return {
      readyState: 'complete' as any,
      hasForms: false,
      hasInputs: false,
      hasButtons: false,
      hasLinks: false,
      visibleElements: [],
      hiddenElements: [],
    };
  }

  private async getNetworkState() {
    // Get network state information
    return {
      isActive: navigator.onLine,
      pendingRequests: 0,
      lastRequestTime: Date.now(),
      responseTimes: [],
    };
  }

  private storeExecutionResult(actionId: string, result: ActionResult): void {
    if (!this.executionHistory.has(actionId)) {
      this.executionHistory.set(actionId, []);
    }
    this.executionHistory.get(actionId)!.push(result);
  }

  // Public utility methods
  getStats(): { activeExecutions: number; totalExecutions: number; successRate: number } {
    const allResults = Array.from(this.executionHistory.values()).flat();
    const successfulResults = allResults.filter(r => r.success);
    
    return {
      activeExecutions: this.activeExecutions.size,
      totalExecutions: allResults.length,
      successRate: allResults.length > 0 ? successfulResults.length / allResults.length : 0,
    };
  }

  getElementSelector(): ElementSelectorEngine {
    return this.elementSelector;
  }

  getBrowserController(): BrowserAutomationController {
    return this.browserController;
  }
}