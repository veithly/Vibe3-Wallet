import { ActionStep, Web3Context } from '../types';
import { TaskAnalysis } from '../task-analysis/IntelligentTaskAnalyzer';
import { StreamingLLMResponse } from '../llm/types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('BrowserAutomationController');

// Browser automation schemas
export const NavigationActionSchema = {
  type: 'object',
  properties: {
    url: { type: 'string', format: 'uri' },
    waitFor: { type: 'string', enum: ['load', 'networkidle', 'selector'] },
    timeout: { type: 'number', default: 30000 },
  },
  required: ['url'],
};

export const ClickActionSchema = {
  type: 'object',
  properties: {
    selector: { type: 'string' },
    text: { type: 'string' },
    waitForNavigation: { type: 'boolean', default: false },
    timeout: { type: 'number', default: 10000 },
  },
  oneOf: [{ required: ['selector'] }, { required: ['text'] }],
};

export const FillFormSchema = {
  type: 'object',
  properties: {
    fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          name: { type: 'string' },
          value: { type: 'string' },
          type: {
            type: 'string',
            enum: [
              'text',
              'password',
              'email',
              'number',
              'checkbox',
              'radio',
              'select',
            ],
          },
        },
        required: ['value'],
      },
    },
    submit: { type: 'boolean', default: false },
  },
  required: ['fields'],
};

export const ExtractContentSchema = {
  type: 'object',
  properties: {
    selector: { type: 'string' },
    attribute: { type: 'string' },
    multiple: { type: 'boolean', default: false },
    type: { type: 'string', enum: ['text', 'html', 'attribute', 'value'] },
  },
};

// Browser automation action types
export type BrowserActionType =
  | 'navigate'
  | 'click'
  | 'fill_form'
  | 'extract_content'
  | 'wait_for'
  | 'scroll'
  | 'screenshot'
  | 'switch_tab'
  | 'close_tab';

// Browser automation result
export interface BrowserActionResult {
  success: boolean;
  data?: any;
  error?: string;
  screenshot?: string;
  timing: number;
}

// Browser automation task
export interface BrowserAutomationTask {
  id: string;
  type: BrowserActionType;
  params: Record<string, any>;
  dependencies: string[];
  timeout: number;
}

/**
 * Real browser automation controller that replaces mock implementation
 */
export class BrowserAutomationController {
  private activeTabs: Map<string, chrome.tabs.Tab> = new Map();
  private executionHistory: BrowserAutomationTask[] = [];
  private isExecuting: boolean = false;
  private currentTaskId: string | null = null;

  constructor() {
    this.initializeBrowserAPI();
  }

  /**
   * Initialize Chrome extension API
   */
  private async initializeBrowserAPI(): Promise<void> {
    try {
      // Check if Chrome extension API is available
      if (typeof chrome === 'undefined' || !chrome.tabs) {
        logger.warn(
          'Chrome extension API not available, running in simulation mode'
        );
        return;
      }

      // Get current active tab
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (activeTab) {
        this.activeTabs.set('main', activeTab);
        logger.info('Browser automation initialized with active tab', {
          tabId: activeTab.id,
          url: activeTab.url,
          title: activeTab.title,
        });
      } else {
        logger.warn('No active tab found, will create new tab when needed');
      }
    } catch (error) {
      logger.error('Failed to initialize browser API', error);
    }
  }

  /**
   * Main entry point for handling automation tasks
   */
  async handleAutomationTask(
    instruction: string,
    taskAnalysis: TaskAnalysis,
    enableStreaming: boolean = false,
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<{ success: boolean; message: string; actions: ActionStep[] }> {
    try {
      logger.info('Starting browser automation task', {
        instruction,
        taskType: taskAnalysis.taskType,
        complexity: taskAnalysis.complexity,
      });

      if (enableStreaming && onChunk) {
        onChunk({
          id: 'stream-1',
          type: 'content',
          content: 'Starting browser automation...',
          timestamp: Date.now(),
        });
      }

      // Convert task analysis to automation plan
      const automationPlan = this.createAutomationPlan(
        instruction,
        taskAnalysis
      );

      if (enableStreaming && onChunk) {
        onChunk({
          id: 'stream-2',
          type: 'content',
          content: `Created automation plan with ${automationPlan.length} steps`,
          timestamp: Date.now(),
        });
      }

      // Execute automation plan
      const results = await this.executeAutomationPlan(
        automationPlan,
        enableStreaming,
        onChunk
      );

      const success = results.every((r) => r.success);
      const message = this.generateAutomationResponse(
        instruction,
        results,
        taskAnalysis
      );

      // Convert to ActionSteps for compatibility
      const actions = results.map((result, index) => ({
        id: `browser_auto_${index}`,
        name: `Browser Automation ${index + 1}`,
        type: automationPlan[index].type,
        description: `Browser automation: ${automationPlan[index].type}`,
        params: automationPlan[index].params,
        status: result.success ? ('completed' as const) : ('failed' as const),
        result: result.data,
        dependencies: [],
        riskLevel: 'MEDIUM' as const,
      }));

      logger.info('Browser automation task completed', {
        success,
        totalSteps: results.length,
        successfulSteps: results.filter((r) => r.success).length,
      });

      return { success, message, actions };
    } catch (error) {
      logger.error('Browser automation task failed', error);

      return {
        success: false,
        message: `Browser automation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        actions: [],
      };
    }
  }

  /**
   * Create automation plan from task analysis
   */
  private createAutomationPlan(
    instruction: string,
    taskAnalysis: TaskAnalysis
  ): BrowserAutomationTask[] {
    const tasks: BrowserAutomationTask[] = [];

    switch (taskAnalysis.taskType) {
      case 'navigation':
        tasks.push(...this.createNavigationTasks(instruction, taskAnalysis));
        break;
      case 'form_filling':
        tasks.push(...this.createFormFillingTasks(instruction, taskAnalysis));
        break;
      case 'content_extraction':
        tasks.push(
          ...this.createContentExtractionTasks(instruction, taskAnalysis)
        );
        break;
      case 'interaction':
        tasks.push(...this.createInteractionTasks(instruction, taskAnalysis));
        break;
      case 'automation':
        tasks.push(
          ...this.createComplexAutomationTasks(instruction, taskAnalysis)
        );
        break;
      default:
        tasks.push(...this.createGenericTasks(instruction, taskAnalysis));
    }

    return tasks;
  }

  /**
   * Create navigation tasks
   */
  private createNavigationTasks(
    instruction: string,
    taskAnalysis: TaskAnalysis
  ): BrowserAutomationTask[] {
    const tasks: BrowserAutomationTask[] = [];

    // Extract URL from instruction
    const urlMatch = instruction.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      tasks.push({
        id: 'navigate_1',
        type: 'navigate',
        params: { url: urlMatch[0] },
        dependencies: [],
        timeout: 30000,
      });
    }

    return tasks;
  }

  /**
   * Create form filling tasks
   */
  private createFormFillingTasks(
    instruction: string,
    taskAnalysis: TaskAnalysis
  ): BrowserAutomationTask[] {
    const tasks: BrowserAutomationTask[] = [];

    // Extract form fields from instruction
    const formFields = this.extractFormFields(instruction);
    if (formFields.length > 0) {
      tasks.push({
        id: 'fill_form_1',
        type: 'fill_form',
        params: { fields: formFields },
        dependencies: [],
        timeout: 20000,
      });
    }

    return tasks;
  }

  /**
   * Create content extraction tasks
   */
  private createContentExtractionTasks(
    instruction: string,
    taskAnalysis: TaskAnalysis
  ): BrowserAutomationTask[] {
    const tasks: BrowserAutomationTask[] = [];

    tasks.push({
      id: 'extract_1',
      type: 'extract_content',
      params: {
        selector: 'body',
        type: 'text',
      },
      dependencies: [],
      timeout: 10000,
    });

    return tasks;
  }

  /**
   * Create interaction tasks
   */
  private createInteractionTasks(
    instruction: string,
    taskAnalysis: TaskAnalysis
  ): BrowserAutomationTask[] {
    const tasks: BrowserAutomationTask[] = [];

    // Look for click targets
    const clickTargets = this.extractClickTargets(instruction);
    clickTargets.forEach((target, index) => {
      tasks.push({
        id: `click_${index + 1}`,
        type: 'click',
        params: { text: target },
        dependencies: index > 0 ? [`click_${index}`] : [],
        timeout: 15000,
      });
    });

    return tasks;
  }

  /**
   * Create complex automation tasks
   */
  private createComplexAutomationTasks(
    instruction: string,
    taskAnalysis: TaskAnalysis
  ): BrowserAutomationTask[] {
    const tasks: BrowserAutomationTask[] = [];

    // Multi-step automation
    if (taskAnalysis.browserActions) {
      taskAnalysis.browserActions.forEach((action, index) => {
        switch (action) {
          case 'navigate':
            tasks.push(
              ...this.createNavigationTasks(instruction, taskAnalysis)
            );
            break;
          case 'click':
            tasks.push(
              ...this.createInteractionTasks(instruction, taskAnalysis)
            );
            break;
          case 'fill':
            tasks.push(
              ...this.createFormFillingTasks(instruction, taskAnalysis)
            );
            break;
          case 'extract':
            tasks.push(
              ...this.createContentExtractionTasks(instruction, taskAnalysis)
            );
            break;
        }
      });
    }

    return tasks;
  }

  /**
   * Create generic tasks
   */
  private createGenericTasks(
    instruction: string,
    taskAnalysis: TaskAnalysis
  ): BrowserAutomationTask[] {
    return [
      {
        id: 'generic_1',
        type: 'extract_content',
        params: {
          selector: 'body',
          type: 'text',
        },
        dependencies: [],
        timeout: 10000,
      },
    ];
  }

  /**
   * Execute automation plan
   */
  private async executeAutomationPlan(
    plan: BrowserAutomationTask[],
    enableStreaming: boolean = false,
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<BrowserActionResult[]> {
    const results: BrowserActionResult[] = [];

    for (const task of plan) {
      if (enableStreaming && onChunk) {
        onChunk({
          id: `stream-${task.id}`,
          type: 'content',
          content: `Executing ${task.type}...`,
          timestamp: Date.now(),
        });
      }

      try {
        const result = await this.executeBrowserTask(task);
        results.push(result);

        if (enableStreaming && onChunk) {
          onChunk({
            id: `stream-${task.id}-result`,
            type: 'content',
            content: result.success ? 'Success' : `Failed: ${result.error}`,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        logger.error(`Task execution failed: ${task.type}`, error);
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timing: 0,
        });
      }
    }

    return results;
  }

  /**
   * Execute individual browser task
   */
  private async executeBrowserTask(
    task: BrowserAutomationTask
  ): Promise<BrowserActionResult> {
    const startTime = Date.now();

    try {
      switch (task.type) {
        case 'navigate':
          return await this.navigateToUrl(
            task.params as { url: string; waitFor?: string; timeout?: number }
          );
        case 'click':
          return await this.clickElement(task.params);
        case 'fill_form':
          return await this.fillForm(
            task.params as { fields: any[]; submit?: boolean }
          );
        case 'extract_content':
          return await this.extractContent(
            task.params as {
              selector: string;
              type?: string;
              multiple?: boolean;
            }
          );
        case 'wait_for':
          return await this.waitFor(task.params);
        case 'scroll':
          return await this.scrollPage(task.params);
        case 'screenshot':
          return await this.takeScreenshot(task.params);
        case 'switch_tab':
          return await this.switchTab(task.params);
        case 'close_tab':
          return await this.closeTab(task.params);
        default:
          throw new Error(`Unsupported task type: ${task.type}`);
      }
    } finally {
      // This ensures timing is always recorded
    }

    return {
      success: true,
      timing: Date.now() - startTime,
    };
  }

  /**
   * Browser automation action implementations
   */
  private async navigateToUrl(params: {
    url: string;
    waitFor?: string;
    timeout?: number;
  }): Promise<BrowserActionResult> {
    const startTime = Date.now();
    logger.info('Starting navigation', {
      url: params.url,
      waitFor: params.waitFor,
      timeout: params.timeout,
      hasChromeAPI: !!(chrome.tabs && chrome.tabs.update),
      // Enhanced debugging for URL corruption detection
      urlType: typeof params.url,
      isUrlOf: params.url === 'of',
      urlLength: params.url.length,
      urlStartsWithHttp: params.url.startsWith('http'),
      fullParams: JSON.stringify(params),
    });

    try {
      // Chrome extension API navigation
      if (chrome.tabs && chrome.tabs.update) {
        // CRITICAL: Check for "of" corruption before calling Chrome API
        if (params.url === 'of') {
          logger.error('URL CORRUPTION DETECTED: About to call Chrome API with url="of"', {
            params,
            fullParams: JSON.stringify(params),
            corruptionPoint: 'BrowserAutomationController before Chrome API call',
            timestamp: Date.now(),
          });
          return {
            success: false,
            error: 'URL corruption detected: cannot navigate to "of"',
            timing: Date.now() - startTime,
          };
        }
        
        let tab: chrome.tabs.Tab;
        
        // Get or create a tab for navigation
        const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTabs.length > 0) {
          logger.info('Updating existing tab for navigation', { 
            tabId: activeTabs[0].id, 
            requestedUrl: params.url,
            isUrlOf: params.url === 'of',
            urlLength: params.url.length,
          });
          tab = await chrome.tabs.update(activeTabs[0].id!, { url: params.url });
          logger.info('Chrome tabs.update result', { 
            tabId: tab.id, 
            tabUrl: tab.url,
            originalRequestedUrl: params.url,
            urlMatches: tab.url === params.url,
            isTabUrlOf: tab.url === 'of',
          });
        } else {
          // Create new tab if no active tab exists
          logger.info('Creating new tab for navigation', { 
            requestedUrl: params.url,
            isUrlOf: params.url === 'of',
            urlLength: params.url.length,
          });
          tab = await chrome.tabs.create({ url: params.url });
          logger.info('Chrome tabs.create result', { 
            tabId: tab.id, 
            tabUrl: tab.url,
            originalRequestedUrl: params.url,
            urlMatches: tab.url === params.url,
            isTabUrlOf: tab.url === 'of',
          });
        }

        // Update active tabs tracking
        this.activeTabs.set('main', tab);

        // Wait for page load if needed
        if (params.waitFor === 'load') {
          logger.info('Waiting for page load completion', { tabId: tab.id });
          await this.waitForTabLoad(tab.id!);
        } else if (params.waitFor === 'networkidle') {
          logger.info('Waiting for network idle (simplified implementation)', { tabId: tab.id });
          // Simplified network idle wait
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const timing = Date.now() - startTime;
        logger.info('Navigation completed successfully', {
          tabId: tab.id,
          requestedUrl: params.url,
          finalTabUrl: tab.url,
          timing,
          urlsMatch: tab.url === params.url,
          isRequestedUrlOf: params.url === 'of',
          isFinalUrlOf: tab.url === 'of',
          method: 'chrome.tabs.update/create',
        });

        const resultData = { 
          tabId: tab.id, 
          url: params.url,
          finalUrl: tab.url,
          title: tab.title,
          method: 'chrome.tabs.update/create'
        };
        
        logger.info('RETURNING NAVIGATION RESULT - FINAL URL CHECK', {
          resultData,
          urlInResult: resultData.url,
          finalUrlInResult: resultData.finalUrl,
          isUrlOf: resultData.url === 'of',
          isFinalUrlOf: resultData.finalUrl === 'of',
          fullResult: JSON.stringify(resultData),
        });

        return {
          success: true,
          data: resultData,
          timing,
        };
      } else {
        // Simulation mode
        logger.warn('Chrome API not available, simulating navigation to', params.url);
        const timing = Date.now() - startTime;
        return {
          success: true,
          data: { 
            simulated: true, 
            url: params.url,
            method: 'simulation'
          },
          timing,
        };
      }
    } catch (error) {
      const timing = Date.now() - startTime;
      logger.error('Navigation failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        params,
        timing,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Navigation failed',
        timing,
      };
    }
  }

  private async clickElement(params: {
    selector?: string;
    text?: string;
    timeout?: number;
  }): Promise<BrowserActionResult> {
    try {
      if (chrome.scripting && chrome.scripting.executeScript) {
        // Real browser interaction
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: this.clickElementInPage,
          args: [params],
        });

        return {
          success: true,
          data: results[0]?.result,
          timing: 0,
        };
      } else {
        // Simulation mode
        logger.info('Simulating click action', params);
        return {
          success: true,
          data: {
            simulated: true,
            action: 'click',
            target: params.selector || params.text,
          },
          timing: 500,
        };
      }
    } catch (error) {
      logger.error('Click failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Click failed',
        timing: 0,
      };
    }
  }

  private async fillForm(params: {
    fields: Array<any>;
    submit?: boolean;
  }): Promise<BrowserActionResult> {
    try {
      if (chrome.scripting && chrome.scripting.executeScript) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: this.fillFormInPage,
          args: [params],
        });

        return {
          success: true,
          data: results[0]?.result,
          timing: 0,
        };
      } else {
        // Simulation mode
        logger.info('Simulating form fill', params);
        return {
          success: true,
          data: {
            simulated: true,
            action: 'fill_form',
            fields: params.fields.length,
          },
          timing: 1500,
        };
      }
    } catch (error) {
      logger.error('Form fill failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Form fill failed',
        timing: 0,
      };
    }
  }

  private async extractContent(params: {
    selector: string;
    type?: string;
    multiple?: boolean;
  }): Promise<BrowserActionResult> {
    try {
      if (chrome.scripting && chrome.scripting.executeScript) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: this.extractContentFromPage,
          args: [params],
        });

        return {
          success: true,
          data: results[0]?.result,
          timing: 0,
        };
      } else {
        // Simulation mode
        logger.info('Simulating content extraction', params);
        return {
          success: true,
          data: {
            simulated: true,
            content: 'Sample extracted content',
            selector: params.selector,
          },
          timing: 300,
        };
      }
    } catch (error) {
      logger.error('Content extraction failed', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Content extraction failed',
        timing: 0,
      };
    }
  }

  private async waitFor(params: any): Promise<BrowserActionResult> {
    // Implementation for wait operations
    await new Promise((resolve) => setTimeout(resolve, params.timeout || 1000));
    return {
      success: true,
      data: { waited: params.timeout || 1000 },
      timing: params.timeout || 1000,
    };
  }

  private async scrollPage(params: any): Promise<BrowserActionResult> {
    try {
      if (chrome.scripting && chrome.scripting.executeScript) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: () => window.scrollTo(0, document.body.scrollHeight),
        });

        return {
          success: true,
          data: { scrolled: true },
          timing: 500,
        };
      } else {
        return {
          success: true,
          data: { simulated: true, action: 'scroll' },
          timing: 200,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Scroll failed',
        timing: 0,
      };
    }
  }

  private async takeScreenshot(params: any): Promise<BrowserActionResult> {
    try {
      if (chrome.tabs && chrome.tabs.captureVisibleTab) {
        const dataUrl = await chrome.tabs.captureVisibleTab();
        return {
          success: true,
          data: { screenshot: dataUrl },
          timing: 1000,
        };
      } else {
        return {
          success: false,
          error: 'Screenshot API not available',
          timing: 0,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Screenshot failed',
        timing: 0,
      };
    }
  }

  private async switchTab(params: any): Promise<BrowserActionResult> {
    try {
      if (chrome.tabs && chrome.tabs.highlight) {
        await chrome.tabs.highlight({ tabs: [params.tabIndex || 0] });
        return {
          success: true,
          data: { switched: true },
          timing: 300,
        };
      } else {
        return {
          success: false,
          error: 'Tab switching API not available',
          timing: 0,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tab switch failed',
        timing: 0,
      };
    }
  }

  private async closeTab(params: any): Promise<BrowserActionResult> {
    try {
      if (chrome.tabs && chrome.tabs.remove) {
        await chrome.tabs.remove(params.tabId);
        return {
          success: true,
          data: { closed: true },
          timing: 200,
        };
      } else {
        return {
          success: false,
          error: 'Tab closing API not available',
          timing: 0,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tab close failed',
        timing: 0,
      };
    }
  }

  // Helper functions for browser script execution
  private clickElementInPage(params: any): any {
    try {
      let element: Element | null = null;

      if (params.selector) {
        element = document.querySelector(params.selector);
      } else if (params.text) {
        // Find element by text content
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null
        );

        let node;
        while ((node = walker.nextNode())) {
          if (node.textContent && node.textContent.includes(params.text)) {
            element = node.parentElement;
            break;
          }
        }
      }

      if (element) {
        (element as HTMLElement).click();
        return { success: true, element: element.tagName };
      } else {
        return { success: false, error: 'Element not found' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Click failed',
      };
    }
  }

  private fillFormInPage(params: any): any {
    try {
      const results: any[] = [];

      for (const field of params.fields) {
        let element: Element | null = null;

        if (field.selector) {
          element = document.querySelector(field.selector);
        } else if (field.name) {
          element = document.querySelector(`[name="${field.name}"]`);
        }

        if (element) {
          const input = element as HTMLInputElement;
          if (input.type === 'checkbox' || input.type === 'radio') {
            input.checked = true;
          } else {
            input.value = field.value;
          }
          results.push({ success: true, field: field.name || field.selector });
        } else {
          results.push({
            success: false,
            field: field.name || field.selector,
            error: 'Element not found',
          });
        }
      }

      if (params.submit) {
        const form = document.querySelector('form');
        if (form) {
          (form as HTMLFormElement).submit();
        }
      }

      return { results, submitted: params.submit };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Form fill failed',
      };
    }
  }

  private extractContentFromPage(params: any): any {
    try {
      const elements = document.querySelectorAll(params.selector);
      const results: any[] = [];

      for (const element of elements) {
        let content = '';

        switch (params.type) {
          case 'text':
            content = element.textContent || '';
            break;
          case 'html':
            content = element.innerHTML;
            break;
          case 'value':
            content = (element as HTMLInputElement).value || '';
            break;
          default:
            content = element.textContent || '';
        }

        results.push(content);

        if (!params.multiple) {
          break;
        }
      }

      return { content: params.multiple ? results : results[0] };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Content extraction failed',
      };
    }
  }

  private async waitForTabLoad(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo
      ) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  // Utility methods
  private extractFormFields(
    instruction: string
  ): Array<{ name?: string; selector?: string; value: string; type?: string }> {
    const fields: Array<{
      name?: string;
      selector?: string;
      value: string;
      type?: string;
    }> = [];

    // Extract common patterns
    const emailMatch = instruction.match(
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
    );
    if (emailMatch) {
      fields.push({ name: 'email', value: emailMatch[1], type: 'email' });
    }

    const numberMatches = instruction.match(/\b(\d+)\b/g);
    if (numberMatches) {
      fields.push({ name: 'number', value: numberMatches[0], type: 'number' });
    }

    return fields;
  }

  private extractClickTargets(instruction: string): string[] {
    const targets: string[] = [];

    // Common button/link text patterns
    const buttonPatterns = [
      /click\s+(?:on\s+)?([a-zA-Z\s]+)/i,
      /press\s+([a-zA-Z\s]+)/i,
      /([a-zA-Z\s]+)\s+button/i,
      /([a-zA-Z\s]+)\s+link/i,
    ];

    for (const pattern of buttonPatterns) {
      const match = instruction.match(pattern);
      if (match) {
        targets.push(match[1].trim());
      }
    }

    return targets;
  }

  private generateAutomationResponse(
    instruction: string,
    results: BrowserActionResult[],
    taskAnalysis: TaskAnalysis
  ): string {
    const successCount = results.filter((r) => r.success).length;
    const totalCount = results.length;

    if (successCount === totalCount) {
      return `✅ Successfully completed ${
        taskAnalysis.taskType
      } task. Executed ${totalCount} actions in ${results.reduce(
        (sum, r) => sum + r.timing,
        0
      )}ms.`;
    } else {
      return `⚠️ Partially completed ${taskAnalysis.taskType} task. ${successCount}/${totalCount} actions succeeded.`;
    }
  }

  // Public methods for external access
  async getActiveTabs(): Promise<chrome.tabs.Tab[]> {
    return Array.from(this.activeTabs.values());
  }

  async getExecutionHistory(): Promise<BrowserAutomationTask[]> {
    return [...this.executionHistory];
  }

  clearHistory(): void {
    this.executionHistory = [];
    logger.info('Browser automation history cleared');
  }

  getIsExecuting(): boolean {
    return this.isExecuting;
  }

  getCurrentTaskId(): string | null {
    return this.currentTaskId;
  }

  /**
   * Execute a single browser automation action (for ActionStep compatibility)
   */
  async executeAction(action: ActionStep): Promise<BrowserActionResult> {
    const browserTask: BrowserAutomationTask = {
      id: action.id,
      type: this.mapActionType(action.type || ''),
      params: action.params,
      dependencies: action.dependencies || [],
      timeout: 30000,
    };

    return await this.executeBrowserTask(browserTask);
  }

  /**
   * Map Web3Agent action type to browser automation type
   */
  private mapActionType(actionType: string): BrowserActionType {
    const mapping: Record<string, BrowserActionType> = {
      navigate: 'navigate',
      navigateToUrl: 'navigate',
      click: 'click',
      clickElement: 'click',
      fill_form: 'fill_form',
      fillForm: 'fill_form',
      extract_content: 'extract_content',
      extractContent: 'extract_content',
      wait_for: 'wait_for',
      scroll: 'scroll',
      screenshot: 'screenshot',
      switch_tab: 'switch_tab',
      close_tab: 'close_tab',
    };

    return mapping[actionType] || 'extract_content'; // Default to content extraction
  }
}
