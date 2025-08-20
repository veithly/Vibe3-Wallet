import { ActionStep, Web3Context } from '../types';
import { TaskAnalysis } from '../task-analysis/IntelligentTaskAnalyzer';
import { StreamingLLMResponse } from '../llm/types';
import { createLogger } from '@/utils/logger';
import { cdpController, type CDPResult } from './CDPController';
import { cdpBrowserContext } from './CDPBrowserContext';

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

export const ElementSelectionSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['highlight', 'select', 'analyze'] },
    filter: { type: 'string' },
    visibleOnly: { type: 'boolean' },
  },
  required: ['mode'],
};

export const ElementAnalysisSchema = {
  type: 'object',
  properties: {
    selector: { type: 'string' },
    includeAccessibility: { type: 'boolean' },
    includeEvents: { type: 'boolean' },
  },
  required: ['selector'],
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
  | 'close_tab'
  | 'element_selection'
  | 'element_analysis'
  | 'find_elements'
  | 'highlight_element';

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
   * Get or create an active web tab (robust across side-panel/currentWindow contexts)
   */
  private async getOrCreateActiveTab(): Promise<chrome.tabs.Tab> {
    // 1) Prefer the active tab in any NORMAL browser window
    try {
      const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] as any });
      for (const w of wins) {
        const t = w.tabs?.find((tb) => tb.active);
        if (t && t.id) {
          return t;
        }
      }
    } catch (e) {
      // ignore and fall through
    }

    // 2) Fallback: find the most recently accessed http(s)/file tab across all windows
    const allTabs = await chrome.tabs.query({});
    const isValid = (u?: string) => {
      const url = (u || '').trim().toLowerCase();
      if (!url) return false;
      if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) return false;
      if (url.startsWith('chrome-extension://') || url.startsWith('moz-extension://')) return false;
      return url.startsWith('http') || url.startsWith('file://');
    };
    const candidates = allTabs.filter((t) => isValid(t.url));
    if (candidates.length > 0) {
      const sorted = candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      const chosen = sorted[0];
      if (chosen && chosen.id) {
        try { await chrome.tabs.update(chosen.id, { active: true }); } catch {}
        return await chrome.tabs.get(chosen.id);
      }
    }

    // 3) As a last resort, surface a clear error (we intentionally avoid opening about:blank)
    throw new Error('No active web tab found. Please open a webpage (http/https/file) and try again.');
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
        case 'element_selection':
          return await this.activateElementSelection(task.params);
        case 'element_analysis':
          return await this.analyzeElement(task.params);
        case 'find_elements':
          return await this.findElements(task.params);
        case 'highlight_element':
          return await this.highlightElement(task.params);
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

        // Get or create a tab for navigation using robust tab management
        try {
          tab = await this.getOrCreateActiveTab();
          logger.info('Got tab for navigation', {
            tabId: tab.id,
            tabUrl: tab.url,
            requestedUrl: params.url,
            isUrlOf: params.url === 'of',
            urlLength: params.url.length,
          });
        } catch (tabError: any) {
          // Fallback: create a new tab directly with the target URL (never about:blank)
          logger.warn('Failed to get active tab; creating new tab with target URL', {
            error: tabError?.message || String(tabError),
            requestedUrl: params.url,
          });
          try {
            tab = await chrome.tabs.create({ url: params.url, active: true });
            logger.info('Created new tab with target URL', { tabId: tab.id, tabUrl: tab.url });
          } catch (createErr: any) {
            logger.error('Failed to create new tab with target URL', createErr);
            throw new Error(`Failed to get or create tab for navigation: ${tabError?.message || tabError}`);
          }
        }

        // If current tab URL already equals requested URL (normalized), avoid duplicate navigation
        try {
          const normalize = (u?: string) => (u || '').trim().replace(/\/$/, '').toLowerCase();
          const currentUrl = normalize(tab.url);
          const targetUrl = normalize(params.url);
          if (currentUrl === targetUrl) {
            logger.info('Skip tabs.update: current URL equals target URL (normalized)', { tabId: tab.id, currentUrl: tab.url, targetUrl: params.url });
          } else {
            tab = await chrome.tabs.update(tab.id!, { url: params.url });
          }
          logger.info('Chrome tabs.update result', {
            tabId: tab.id,
            tabUrl: tab.url,
            originalRequestedUrl: params.url,
            urlMatches: (tab.url || '').trim().replace(/\/$/, '').toLowerCase() === (params.url || '').trim().replace(/\/$/, '').toLowerCase(),
            isTabUrlOf: tab.url === 'of',
          });
        } catch (updateError) {
          logger.error('Failed to update tab URL', updateError);
          throw new Error(`Failed to update tab URL: ${updateError.message}`);
        }

        // Update active tabs tracking
        this.activeTabs.set('main', tab);

        // Wait for page load if needed
        if (params.waitFor === 'load') {
          logger.info('Waiting for page load completion', { tabId: tab.id });
          await this.waitForTabLoad(tab.id!);
        } else if (params.waitFor === 'networkidle') {
          logger.info('Waiting for network idle (simplified implementation)', { tabId: tab.id });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Ensure CDP attached before returning (both when URL unchanged or after navigation)
        try {
          const attachedBefore = await cdpBrowserContext.attachTab(tab.id!);
          logger.info('CDP ensured after navigateToUrl', { tabId: tab.id, attached: attachedBefore });
        } catch (e) {
          logger.warn('CDP attach after navigateToUrl failed', { tabId: tab.id, error: (e as Error)?.message });
        }

        const timing = Date.now() - startTime;
        const alreadyOnPage = (tab.url || '').trim().replace(/\/$/, '').toLowerCase() === (params.url || '').trim().replace(/\/$/, '').toLowerCase();
        const method = alreadyOnPage ? 'already_on_page' : 'navigate';
        return {
          success: true,
          data: { tabId: tab.id, url: params.url, finalUrl: tab.url, title: tab.title, method, cdpAttached: true },
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
      const tab = await this.getOrCreateActiveTab();

      // Use CDP as primary method (nanobrowser approach)
      const cdpResult = await cdpController.clickElement(tab.id!, {
        selector: params.selector,
        xpath: params.selector?.startsWith('/') ? params.selector : undefined,
        timeout: params.timeout || 5000,
        scrollIntoView: true
      });

      if (cdpResult.success) {
        logger.info('CDP click successful', { tabId: tab.id, params, timing: cdpResult.timing });

        // Hybrid assurance: follow up with in-page programmatic click to maximize compatibility
        try {
          const follow = await chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: (p: any) => {
              const bySelector = (s: string): Element | null => { try { return document.querySelector(s); } catch { return null; } };
              const byXPath = (xp: string): Element | null => { try { const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null); return (r.singleNodeValue as Element) || null; } catch { return null; } };
              let el: Element | null = null;
              if (p?.selector) {
                const s = String(p.selector);
                el = s.startsWith('/') ? byXPath(s) : bySelector(s);
              }
              if (!el) return { ensured: false };
              try { (el as any).click?.(); } catch {}
              return { ensured: true, tag: (el as HTMLElement).tagName };
            },
            args: [params]
          });
          logger.info('Hybrid ensure click executed', { ensured: follow?.[0]?.result?.ensured });
        } catch (e) {
          logger.warn('Hybrid ensure click failed', { error: (e as Error)?.message });
        }

        return {
          success: true,
          data: cdpResult.data,
          timing: cdpResult.timing || 0,
        };
      }

      // Fallback to script injection if CDP fails
      logger.warn('CDP click failed, falling back to script injection', { error: cdpResult.error });

      if (chrome.scripting && chrome.scripting.executeScript) {
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

  private async hoverElement(params: {
    selector?: string;
    duration?: number;
  }): Promise<BrowserActionResult> {
    try {
      const tab = await this.getOrCreateActiveTab();

      // Use CDP as primary method
      const cdpResult = await cdpController.hoverElement(tab.id!, {
        selector: params.selector,
        xpath: params.selector?.startsWith('/') ? params.selector : undefined,
        duration: params.duration || 1000,
        scrollIntoView: true
      });

      if (cdpResult.success) {
        logger.info('CDP hover successful', { tabId: tab.id, params, timing: cdpResult.timing });
        return {
          success: true,
          data: cdpResult.data,
          timing: cdpResult.timing || 0,
        };
      }

      // Fallback to script injection
      logger.warn('CDP hover failed, falling back to script injection', { error: cdpResult.error });

      if (chrome.scripting && chrome.scripting.executeScript) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: this.hoverElementInPage,
          args: [params],
        });

        return {
          success: true,
          data: { hovered: true },
          timing: 200,
        };
      } else {
        return {
          success: true,
          data: { simulated: true, action: 'hover' },
          timing: 200,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Hover failed',
        timing: 0,
      };
    }
  }

  private async fillForm(params: {
    fields: Array<any>;
    submit?: boolean;
  }): Promise<BrowserActionResult> {
    try {
      const tab = await this.getOrCreateActiveTab();

      // For form filling, we'll use CDP for typing but keep script injection for form logic
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: this.fillFormInPage,
        args: [params],
      });

      // For text fields, also try CDP typing for better reliability
      if (params.fields) {
        for (const field of params.fields) {
          if (field.value && typeof field.value === 'string' && field.selector) {
            try {
              await cdpController.typeText(tab.id!, {
                selector: field.selector,
                xpath: field.selector?.startsWith('/') ? field.selector : undefined,
                text: field.value,
                clear: true,
                delay: 10
              });
            } catch (cdpError) {
              logger.warn('CDP typing failed for field, using script injection result', { field, error: cdpError });
            }
          }
        }
      }

      return {
        success: true,
        data: results[0]?.result,
        timing: 0,
      };
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
        const tab = await this.getOrCreateActiveTab();

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
        const tab = await this.getOrCreateActiveTab();

        const direction = (params?.direction || 'down').toLowerCase();
        const amount = Number(params?.amount || 600);
        const selector = params?.selector as string | undefined;

        await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: (dir: string, amt: number, sel?: string) => {
            let target: Element | Window = window;
            if (sel) {
              try {
                const el = sel.startsWith('/')
                  ? (document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as Element | null)
                  : document.querySelector(sel);
                if (el) target = el;
              } catch {}
            }
            const delta = dir === 'up' ? -Math.abs(amt) : Math.abs(amt);
            if (target === window) window.scrollBy(0, delta);
            else (target as Element).scrollTop += delta;
          },
          args: [direction, amount, selector],
        });

        return { success: true, data: { scrolled: true, direction, amount }, timing: 200 };
      } else {
        return { success: true, data: { simulated: true, action: 'scroll' }, timing: 200 };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Scroll failed', timing: 0 };
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
      const byXPath = (xp: string): Element | null => {
        try {
          const result = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          return (result.singleNodeValue as Element) || null;
        } catch { return null; }
      };
      const bySelector = (sel: string): Element | null => {
        try { return document.querySelector(sel); } catch { return null; }
      };

      let element: Element | null = null;

      if (params.selector) {
        const sel: string = String(params.selector);
        element = sel.startsWith('/') ? byXPath(sel) : bySelector(sel);
      } else if (params.text) {
        // Find element by text content
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        let node;
        while ((node = walker.nextNode())) {
          if (node.textContent && node.textContent.includes(params.text)) {
            element = node.parentElement;
            break;
          }
        }
      }

      if (!element) return { success: false, error: 'Element not found' };

      let el = element as HTMLElement;
      // Ensure into view before interaction
      try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any }); } catch { try { el.scrollIntoView(); } catch {} }

      // If element is disabled or not interactable, try to click its nearest clickable ancestor
      const isDisabled = (node: Element | null): boolean => !!(node as HTMLElement | null)?.hasAttribute?.('disabled');
      let target: HTMLElement = el;
      let guard = 0;
      while (guard++ < 5 && (isDisabled(target) || target.getBoundingClientRect().width === 0 || target.getBoundingClientRect().height === 0)) {
        const parent = target.closest('button, a, [role="button"], [role="link"], [onclick], [onmousedown]') as HTMLElement | null;
        if (!parent) break;
        target = parent;
      }
      if (target !== el) {
        el = target;
      }

      // Prepare coordinates
      const rect = el.getBoundingClientRect();
      const cx = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
      const cy = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));

      // Focus if possible
      try { (el as any).focus?.(); } catch {}

      // Dispatch pointer/mouse events sequence for better compatibility
      const fire = (type: string) => {
        try {
          if (typeof PointerEvent !== 'undefined') {
            el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerType: 'mouse', isPrimary: true }));
          } else {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
          }
        } catch {}
      };
      fire('pointerover');
      fire('mouseover');
      fire('pointermove');
      fire('mousemove');
      fire('pointerdown');
      fire('mousedown');
      fire('pointerup');
      fire('mouseup');
      fire('click');

      // Ensure default action is invoked (programmatic click)
      try { el.click(); } catch {}

      return { success: true, element: el.tagName, x: cx, y: cy, invokedProgrammaticClick: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Click failed' };
    }
  }

  private hoverElementInPage(params: any): any {
    try {
      const bySelector = (sel: string): Element | null => { try { return document.querySelector(sel); } catch { return null; } };
      const byXPath = (xp: string): Element | null => { try { const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null); return (r.singleNodeValue as Element) || null; } catch { return null; } };
      const sel: string = String(params.selector || '');
      const element = sel.startsWith('/') ? byXPath(sel) : bySelector(sel);
      if (!element) return { success: false, error: 'Element not found' };
      const el = element as HTMLElement;
      try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any }); } catch { try { el.scrollIntoView(); } catch {} }
      const rect = el.getBoundingClientRect();
      const cx = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
      const cy = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
      const fire = (type: string) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
      fire('mousemove');
      fire('mouseover');
      fire('mouseenter');
      if (params.duration && Number(params.duration) > 0) {
        const end = Date.now() + Number(params.duration);
        const step = () => { if (Date.now() < end) { fire('mousemove'); requestAnimationFrame(step); } };
        requestAnimationFrame(step);
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Hover failed' };
    }
  }


  private fillFormInPage(params: any): any {
    try {
      const results: any[] = [];

      const dispatch = (el: Element, type: string) => {
        const ev = new Event(type, { bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
      };
      const setInputValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
        (el as any).focus?.();
        const proto = Object.getPrototypeOf(el) as any;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value);
        else (el as any).value = value;
        dispatch(el, 'input');
        dispatch(el, 'change');
        (el as any).blur?.();
      };
      const clickIfNeeded = (el: HTMLElement) => {
        try { el.click(); } catch {}
      };

      for (const rawField of (params.fields || [])) {
        const field = rawField || {};
        let element: Element | null = null;

        if (field.selector) {
          element = document.querySelector(field.selector);
        } else if (field.name) {
          element = document.querySelector(`[name="${field.name}"]`);
        }

        if (!element) {
          results.push({ success: false, field: field.name || field.selector, error: 'Element not found' });
          continue;
        }

        const tag = element.tagName.toLowerCase();
        const typeAttr = (element as HTMLElement).getAttribute('type')?.toLowerCase() || '';
        const kind = field.type || typeAttr || tag;

        try {
          if (tag === 'input' || tag === 'textarea') {
            if (['checkbox', 'radio'].includes(typeAttr) || field.type === 'checkbox' || field.type === 'radio') {
              const input = element as HTMLInputElement;
              const desired = String(field.value || '').toLowerCase();
              let wantChecked: boolean;

              // Enhanced checkbox/radio value interpretation
              if (desired === 'toggle') {
                wantChecked = !input.checked; // Toggle current state
              } else {
                wantChecked = desired === 'true' || desired === '1' || desired === 'on' || desired === 'yes' || desired === 'checked';
              }

              if (input.checked !== wantChecked) {
                clickIfNeeded(input);
                if (input.checked !== wantChecked) {
                  input.checked = wantChecked;
                  dispatch(input, 'input');
                  dispatch(input, 'change');
                }
              }
            } else {
              setInputValue(element as HTMLInputElement | HTMLTextAreaElement, String(field.value ?? ''));
            }
          } else if (tag === 'select') {
            const sel = element as HTMLSelectElement;
            let matched = false;
            const value = field.value != null ? String(field.value) : '';
            const visibleText = field.visibleText ?? field.label ?? field.text;

            // Enhanced select option matching (nanobrowser-aligned)
            if (visibleText != null) {
              const text = String(visibleText).trim().toLowerCase();
              for (const opt of Array.from(sel.options)) {
                const optText = opt.text.trim().toLowerCase();
                const optLabel = (opt.getAttribute('label') || '').trim().toLowerCase();
                if (optText === text || optLabel === text || optText.includes(text)) {
                  sel.value = opt.value;
                  matched = true;
                  break;
                }
              }
            }
            if (!matched && value) {
              for (const opt of Array.from(sel.options)) {
                if (opt.value === value || opt.value.toLowerCase() === value.toLowerCase()) {
                  sel.value = opt.value;
                  matched = true;
                  break;
                }
              }
            }
            // Fallback: partial text match
            if (!matched && visibleText) {
              const text = String(visibleText).trim().toLowerCase();
              for (const opt of Array.from(sel.options)) {
                if (opt.text.trim().toLowerCase().includes(text)) {
                  sel.value = opt.value;
                  matched = true;
                  break;
                }
              }
            }
            if (!matched && sel.options.length) {
              sel.selectedIndex = 0;
            }
            dispatch(sel, 'input');
            dispatch(sel, 'change');
          } else if ((element as HTMLElement).isContentEditable) {
            setInputValue(element as any, String(field.value ?? ''));
          } else {
            (element as any).textContent = String(field.value ?? '');
            dispatch(element, 'input');
            dispatch(element, 'change');
          }
          results.push({ success: true, field: field.name || field.selector, kind });
        } catch (e) {
          results.push({ success: false, field: field.name || field.selector, error: (e as Error)?.message || 'Fill failed', kind });
        }
      }

      if (params.submit) {
        let form: HTMLFormElement | null = null;
        try {
          const firstOk = document.activeElement as HTMLElement | null;
          form = (firstOk?.closest?.('form') as HTMLFormElement) || (document.querySelector('form') as HTMLFormElement);
        } catch {}
        if (form) {
          if (typeof (form as any).requestSubmit === 'function') (form as any).requestSubmit();
          else form.submit();
        }
      }

      return { success: true, results };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Form fill failed' };
    }
  }

  private extractContentFromPage(params: any): any {
    try {
      const elements = document.querySelectorAll(params.selector);
      const results: any[] = [];

      for (const element of Array.from(elements)) {
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

  /**
   * Ensure we have an active tab for element operations
   */
  private async ensureActiveTab(): Promise<chrome.tabs.Tab | null> {
    try {
      // Try to get active tab
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (activeTab && activeTab.url && activeTab.url !== 'about:blank') {
        return activeTab;
      }

      // Try to get any tab in current window
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      if (allTabs.length > 0) {
        const suitableTab = allTabs.find(tab =>
          tab.url && tab.url !== 'about:blank' && !tab.discarded
        );

        if (suitableTab) {
          await chrome.tabs.update(suitableTab.id!, { active: true });
          return suitableTab;
        }
      }

      // Create new tab if needed
      const newTab = await chrome.tabs.create({
        url: 'about:blank',
        active: true
      });

      // Wait for tab to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      return newTab;

    } catch (error) {
      logger.error('Failed to ensure active tab', error);
      return null;
    }
  }

  /**
   * Verify content script is available in target tab
   */
  private async verifyContentScript(tabId: number): Promise<boolean> {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      return true;
    } catch (error) {
      // Content script not available, try to inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-script.js']
        });
        return true;
      } catch (injectError) {
        logger.error('Failed to inject content script', injectError);
        return false;
      }
    }
  }

  // Element selection methods
  private async activateElementSelection(params: any): Promise<BrowserActionResult> {
    try {
      // Get current active tabs with better error handling
      const activeTabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      let targetTab = activeTabs[0];

      // If no active tab, try to get any tab from current window
      if (!targetTab) {
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        if (allTabs.length > 0) {
          // Activate the first available tab
          await chrome.tabs.update(allTabs[0].id!, { active: true });
          targetTab = allTabs[0];
          logger.info('Activated existing tab for element selection', {
            tabId: targetTab.id,
            url: targetTab.url
          });
        }
      }

      // If still no tab, create a new one
      if (!targetTab) {
        logger.info('No suitable tab found, creating new tab for element selection');
        targetTab = await chrome.tabs.create({
          url: 'about:blank',
          active: true
        });

        // Wait for tab to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        logger.info('Created new tab for element selection', {
          tabId: targetTab.id,
          url: targetTab.url
        });
      }

      if (!targetTab || !targetTab.id) {
        throw new Error('No active tab available and could not create new tab');
      }

      // Verify tab has proper URL before proceeding
      if (!targetTab.url || targetTab.url === 'about:blank') {
        // Wait a bit for tab to fully initialize
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Verify content script is available
      const contentScriptReady = await this.verifyContentScript(targetTab.id);
      if (!contentScriptReady) {
        throw new Error('Content script not available in target tab');
      }

      const response = await chrome.tabs.sendMessage(targetTab.id, {
        type: 'ELEMENT_SELECTOR_ACTIVATE',
        options: {
          mode: params.mode,
          filter: params.filter,
          visibleOnly: params.visibleOnly,
        },
      });

      return {
        success: true,
        data: response,
        timing: 0,
      };
    } catch (error) {
      logger.error('Element selection activation failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Element selection failed',
        timing: 0,
      };
    }
  }

  private async analyzeElement(params: any): Promise<BrowserActionResult> {
    try {
      // Use enhanced tab management
      const targetTab = await this.ensureActiveTab();

      if (!targetTab || !targetTab.id) {
        throw new Error('No active tab available and could not create new tab');
      }

      // Verify content script is available
      const contentScriptReady = await this.verifyContentScript(targetTab.id);
      if (!contentScriptReady) {
        throw new Error('Content script not available in target tab');
      }

      const response = await chrome.tabs.sendMessage(targetTab.id, {
        type: 'ELEMENT_ANALYZE',
        selector: params.selector,
        includeAccessibility: params.includeAccessibility,
        includeEvents: params.includeEvents,
      });

      return {
        success: true,
        data: response,
        timing: 0,
      };
    } catch (error) {
      logger.error('Element analysis failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Element analysis failed',
        timing: 0,
      };
    }
  }

  private async findElements(params: any): Promise<BrowserActionResult> {
    try {
      // Use enhanced tab management
      const targetTab = await this.ensureActiveTab();

      if (!targetTab || !targetTab.id) {
        throw new Error('No active tab available and could not create new tab');
      }

      // Verify content script is available
      const contentScriptReady = await this.verifyContentScript(targetTab.id);
      if (!contentScriptReady) {
        throw new Error('Content script not available in target tab');
      }

      const response = await chrome.tabs.sendMessage(targetTab.id, {
        type: 'ELEMENT_FIND_BY_TEXT',
        text: params.text,
        elementType: params.elementType,
        caseSensitive: params.caseSensitive,
        visibleOnly: params.visibleOnly,
      });

      return {
        success: true,
        data: response,
        timing: 0,
      };
    } catch (error) {
      logger.error('Find elements failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Find elements failed',
        timing: 0,
      };
    }
  }

  private async highlightElement(params: any): Promise<BrowserActionResult> {
    try {
      // Use enhanced tab management
      const targetTab = await this.ensureActiveTab();

      if (!targetTab || !targetTab.id) {
        throw new Error('No active tab available and could not create new tab');
      }

      // Verify content script is available
      const contentScriptReady = await this.verifyContentScript(targetTab.id);
      if (!contentScriptReady) {
        throw new Error('Content script not available in target tab');
      }

      const response = await chrome.tabs.sendMessage(targetTab.id, {
        type: 'ELEMENT_HIGHLIGHT',
        selector: params.selector,
        color: params.color,
        duration: params.duration,
      });

      return {
        success: true,
        data: response,
        timing: 0,
      };
    } catch (error) {
      logger.error('Element highlighting failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Element highlighting failed',
        timing: 0,
      };
    }
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
      element_selection: 'element_selection',
      element_analysis: 'element_analysis',
      find_elements: 'find_elements',
      highlight_element: 'highlight_element',
    };

    return mapping[actionType] || 'extract_content'; // Default to content extraction
  }

  async cleanup(): Promise<void> {
    // Cleanup CDP controller and browser context
    await cdpController.cleanup();
    await cdpBrowserContext.cleanup();
    logger.info('BrowserAutomationController cleanup completed');
  }
}
