import { createLogger } from '../../../utils/logger';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const logger = createLogger('agent-integration');

// INTELLIGENT AGENT INTEGRATION - LLM-DRIVEN ELEMENT DISCOVERY SYSTEM
//
// This file has been transformed from hardcoded task execution to an intelligent,
// LLM-driven system that:
// 1. Discovers page elements with detailed information
// 2. Provides visual highlighting and marking of elements
// 3. Uses LLM decision-making instead of hardcoded rules
// 4. Generates smart selectors based on discovered elements
// 5. Eliminates hardcoded task execution methods
//
// Key Components:
// - EnhancedElementDiscovery: Comprehensive element analysis and highlighting
// - LLMDecisionSystem: Intelligent decision making with fallback to rules
// - IntelligentTaskExecutor: Smart task execution based on LLM decisions
//
// This system replaces the previous hardcoded approach with dynamic,
// context-aware element interaction.

// Agent event types and interfaces
type AgentEvent = {
  actor: string;
  state: string;
  data: {
    taskId: string;
    step: number;
    maxSteps: number;
    details: string;
  };
  timestamp: number;
  type: string;
};

type EventCallback = (event: AgentEvent) => Promise<void>;

// Browser context interface
interface BrowserContext {
  getActiveTab(): Promise<chrome.tabs.Tab>;
  createTab(url: string): Promise<chrome.tabs.Tab>;
  switchToTab(tabId: number): Promise<void>;
  closeTab(tabId: number): Promise<void>;
  cleanup(): Promise<void>;
}

// DOM operation interfaces
interface DOMOperationResult {
  success: boolean;
  data?: any;
  error?: string;
}

interface ElementInfo {
  tagName: string;
  attributes: Record<string, string>;
  text?: string;
  visible: boolean;
  bounds?: DOMRect;
}

// Improved browser context implementation
class RabbyBrowserContext implements BrowserContext {
  async getActiveTab(): Promise<chrome.tabs.Tab> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
      throw new Error('No active tab found');
    }
    return tabs[0];
  }

  async createTab(url: string): Promise<chrome.tabs.Tab> {
    return await chrome.tabs.create({ url });
  }

  async switchToTab(tabId: number): Promise<void> {
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, {
      focused: true,
    });
  }

  async closeTab(tabId: number): Promise<void> {
    await chrome.tabs.remove(tabId);
  }

  async cleanup(): Promise<void> {
    // Cleanup any resources if needed
  }
}

// Enhanced element information interface
interface EnhancedElementInfo extends ElementInfo {
  selector: string;
  elementType: 'button' | 'link' | 'input' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'other';
  interactionType: 'click' | 'fill' | 'select' | 'check' | 'scroll';
  priority: number;
  context?: string;
  isVisible: boolean;
  isClickable: boolean;
  isEditable: boolean;
}

// Enhanced element discovery system
class EnhancedElementDiscovery {
  /**
   * Get comprehensive page analysis with enhanced element information
   */
  static async discoverPageElements(tabId: number): Promise<{
    pageInfo: any;
    elements: EnhancedElementInfo[];
    summary: {
      totalElements: number;
      clickableElements: number;
      inputElements: number;
      visibleElements: number;
    };
  }> {
    try {
      const [pageInfo, elements] = await Promise.all([
        DOMService.getPageInfo(tabId),
        this.getEnhancedElements(tabId)
      ]);

      const summary = {
        totalElements: elements.length,
        clickableElements: elements.filter(el => el.isClickable).length,
        inputElements: elements.filter(el => el.isEditable).length,
        visibleElements: elements.filter(el => el.isVisible).length
      };

      return { pageInfo, elements, summary };
    } catch (error) {
      logger.error('EnhancedElementDiscovery', 'Failed to discover page elements', { error });
      throw error;
    }
  }

  /**
   * Get enhanced elements with detailed information
   */
  static async getEnhancedElements(tabId: number): Promise<EnhancedElementInfo[]> {
    const result = await DOMService.executeScript(
      tabId,
      () => {
        const interactiveSelectors = [
          'button',
          'a[href]',
          'input[type="button"]',
          'input[type="submit"]',
          'input[type="reset"]',
          'input[type="text"]',
          'input[type="email"]',
          'input[type="password"]',
          'input[type="search"]',
          'input[type="checkbox"]',
          'input[type="radio"]',
          'textarea',
          'select',
          '[onclick]',
          '[role="button"]',
          '[role="link"]',
          '[role="textbox"]',
          '[role="combobox"]',
          '[role="checkbox"]',
          '[role="radio"]',
          '[tabindex]:not([tabindex="-1"])',
          '[contenteditable="true"]',
          '[data-action]',
          '[data-testid]',
          '[data-cy]',
          '[data-qa]',
          '.btn',
          '.button',
          '.clickable',
          '.interactive'
        ];

        const elements: EnhancedElementInfo[] = [];
        let elementCounter = 0;

        interactiveSelectors.forEach((selectorGroup) => {
          const foundElements = document.querySelectorAll(selectorGroup);
          foundElements.forEach((element) => {
            const bounds = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);

            const isVisible =
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              style.opacity !== '0' &&
              bounds.width > 0 &&
              bounds.height > 0 &&
              bounds.top >= 0 &&
              bounds.left >= 0;

            const tagName = element.tagName.toLowerCase();
            const elementType = getElementType(element);
            const interactionType = getInteractionType(element, elementType);

            // Generate unique selector
            const selector = generateSelector(element, elementCounter++);

            // Get element context (parent hierarchy)
            const context = getElementContext(element);

            // Calculate priority based on visibility, position, and attributes
            const priority = calculateElementPriority(element, bounds, isVisible);

            // Only include visible and reasonably sized elements
            if (isVisible && bounds.width > 5 && bounds.height > 5) {
              elements.push({
                tagName,
                attributes: Array.from(element.attributes).reduce((attrs, attr) => {
                  attrs[attr.name] = attr.value;
                  return attrs;
                }, {} as Record<string, string>),
                text: element.textContent?.trim() || '',
                visible: isVisible,
                bounds: bounds as DOMRect,
                selector,
                elementType,
                interactionType,
                priority,
                context,
                isVisible,
                isClickable: isClickable(element),
                isEditable: isEditable(element)
              });
            }
          });
        });

        // Helper functions (defined before use)
        function getElementType(element: Element): EnhancedElementInfo['elementType'] {
          const tagName = element.tagName.toLowerCase();
          const type = (element as HTMLInputElement).type;

          if (tagName === 'button') return 'button';
          if (tagName === 'a') return 'link';
          if (tagName === 'textarea') return 'textarea';
          if (tagName === 'select') return 'select';
          if (tagName === 'input') {
            if (type === 'checkbox') return 'checkbox';
            if (type === 'radio') return 'radio';
            return 'input';
          }
          if (element.getAttribute('role') === 'button') return 'button';
          if (element.getAttribute('role') === 'link') return 'link';
          if (element.getAttribute('role') === 'textbox') return 'input';
          return 'other';
        }

        function getInteractionType(element: Element, elementType: EnhancedElementInfo['elementType']): EnhancedElementInfo['interactionType'] {
          if (elementType === 'input' || elementType === 'textarea') return 'fill';
          if (elementType === 'select') return 'select';
          if (elementType === 'checkbox' || elementType === 'radio') return 'check';
          return 'click';
        }

        function generateSelector(element: Element, index: number): string {
          // Try to generate a stable selector
          if (element.id) return `#${element.id}`;
          if (element.getAttribute('data-testid')) return `[data-testid="${element.getAttribute('data-testid')}"]`;
          if (element.getAttribute('data-cy')) return `[data-cy="${element.getAttribute('data-cy')}"]`;
          if (element.getAttribute('data-qa')) return `[data-qa="${element.getAttribute('data-qa')}"]`;

          // Use a combination of attributes and index
          const tagName = element.tagName.toLowerCase();
          const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';
          return `${tagName}${classes}[data-element-index="${index}"]`;
        }

        function getElementContext(element: Element): string {
          const context: string[] = [];
          let current = element.parentElement;

          for (let i = 0; i < 3 && current; i++) {
            if (current.id) context.push(`#${current.id}`);
            else if (current.className) context.push(`.${current.className.split(' ')[0]}`);
            else context.push(current.tagName.toLowerCase());
            current = current.parentElement;
          }

          return context.reverse().join(' > ');
        }

        function calculateElementPriority(element: Element, bounds: DOMRect, isVisible: boolean): number {
          let priority = 0;

          // Base priority for visibility
          if (isVisible) priority += 10;

          // Position priority (elements in viewport center get higher priority)
          const viewportCenterX = window.innerWidth / 2;
          const viewportCenterY = window.innerHeight / 2;
          const elementCenterX = bounds.left + bounds.width / 2;
          const elementCenterY = bounds.top + bounds.height / 2;

          const distanceFromCenter = Math.sqrt(
            Math.pow(elementCenterX - viewportCenterX, 2) +
            Math.pow(elementCenterY - viewportCenterY, 2)
          );

          // Higher priority for elements closer to center
          priority += Math.max(0, 20 - (distanceFromCenter / 100));

          // Size priority (not too small, not too large)
          if (bounds.width > 50 && bounds.height > 30) priority += 5;

          // Attribute priority
          if (element.id) priority += 10;
          if (element.getAttribute('data-testid')) priority += 8;
          if (element.getAttribute('aria-label')) priority += 7;
          if (element.getAttribute('title')) priority += 5;

          // Text content priority
          const text = element.textContent?.trim() || '';
          if (text.length > 0 && text.length < 50) priority += 5;

          // Interactive elements priority
          if (element.tagName === 'BUTTON') priority += 8;
          if (element.tagName === 'A' && element.getAttribute('href')) priority += 6;

          return Math.round(priority * 100) / 100;
        }

        function isClickable(element: Element): boolean {
          const tagName = element.tagName.toLowerCase();
          const type = (element as HTMLInputElement).type;

          return ['button', 'a'].includes(tagName) ||
                 ['button', 'submit', 'reset'].includes(type) ||
                 element.getAttribute('role') === 'button' ||
                 element.getAttribute('onclick') !== null ||
                 element.getAttribute('data-action') !== null ||
                 element.getAttribute('tabindex') !== null;
        }

        function isEditable(element: Element): boolean {
          const tagName = element.tagName.toLowerCase();
          const type = (element as HTMLInputElement).type;
          const role = element.getAttribute('role');

          return ['input', 'textarea', 'select'].includes(tagName) &&
                 !['hidden', 'submit', 'button', 'reset'].includes(type) ||
                 role === 'textbox' ||
                 role === 'combobox' ||
                 element.getAttribute('contenteditable') === 'true';
        }
      },
      []
    );

    return result.success ? result.data || [] : [];
  }

  /**
   * Highlight elements on the page with visual markers
   */
  static async highlightElements(tabId: number, selectors: string[]): Promise<boolean> {
    const result = await DOMService.executeScript(
      tabId,
      (selArray: string[]) => {
        // Remove existing highlights
        const existingHighlights = document.querySelectorAll('.agent-element-highlight');
        existingHighlights.forEach(highlight => highlight.remove());

        // Create highlight overlay
        const overlay = document.createElement('div');
        overlay.id = 'agent-element-highlight-overlay';
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 999999;
          font-family: Arial, sans-serif;
        `;
        document.body.appendChild(overlay);

        // Highlight each element
        selArray.forEach((selector, index) => {
          const element = document.querySelector(selector);
          if (!element) return;

          const bounds = element.getBoundingClientRect();

          // Create highlight box
          const highlight = document.createElement('div');
          highlight.className = 'agent-element-highlight';
          highlight.style.cssText = `
            position: absolute;
            top: ${bounds.top + window.scrollY}px;
            left: ${bounds.left + window.scrollX}px;
            width: ${bounds.width}px;
            height: ${bounds.height}px;
            border: 2px solid #ff6b6b;
            background: rgba(255, 107, 107, 0.1);
            border-radius: 4px;
            pointer-events: none;
            z-index: 1000000;
            transition: all 0.3s ease;
          `;

          // Add label
          const label = document.createElement('div');
          label.textContent = `${index + 1}`;
          label.style.cssText = `
            position: absolute;
            top: -25px;
            left: 0;
            background: #ff6b6b;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: bold;
            min-width: 20px;
            text-align: center;
          `;

          highlight.appendChild(label);
          overlay.appendChild(highlight);

          // Add hover effect
          highlight.addEventListener('mouseenter', () => {
            highlight.style.background = 'rgba(255, 107, 107, 0.3)';
            highlight.style.transform = 'scale(1.02)';
          });

          highlight.addEventListener('mouseleave', () => {
            highlight.style.background = 'rgba(255, 107, 107, 0.1)';
            highlight.style.transform = 'scale(1)';
          });
        });

        return true;
      },
      [selectors]
    );

    return result.success && result.data;
  }

  /**
   * Remove element highlights
   */
  static async removeHighlights(tabId: number): Promise<boolean> {
    const result = await DOMService.executeScript(
      tabId,
      () => {
        const highlights = document.querySelectorAll('.agent-element-highlight');
        const overlay = document.getElementById('agent-element-highlight-overlay');

        highlights.forEach(highlight => highlight.remove());
        if (overlay) overlay.remove();

        return true;
      },
      []
    );

    return result.success && result.data;
  }

  /**
   * Find best matching element for a given target
   */
  static async findBestMatch(tabId: number, target: string, elementType?: EnhancedElementInfo['elementType']): Promise<{
    element: EnhancedElementInfo | null;
    confidence: number;
    reason: string;
  }> {
    const elements = await this.getEnhancedElements(tabId);
    const targetLower = target.toLowerCase();

    let bestMatch: EnhancedElementInfo | null = null;
    let highestConfidence = 0;
    let reason = '';

    for (const element of elements) {
      if (elementType && element.elementType !== elementType) continue;

      let confidence = 0;
      let matchReasons: string[] = [];

      // Text content matching
      if (element.text && element.text.toLowerCase().includes(targetLower)) {
        const textSimilarity = this.calculateSimilarity(targetLower, element.text.toLowerCase());
        confidence += textSimilarity * 40;
        matchReasons.push(`text match (${Math.round(textSimilarity * 100)}%)`);
      }

      // Attribute matching
      for (const [attrName, attrValue] of Object.entries(element.attributes)) {
        if (attrValue.toLowerCase().includes(targetLower)) {
          const attrSimilarity = this.calculateSimilarity(targetLower, attrValue.toLowerCase());
          confidence += attrSimilarity * 20;
          matchReasons.push(`${attrName} match (${Math.round(attrSimilarity * 100)}%)`);
        }
      }

      // Element type matching
      if (targetLower.includes('button') && element.elementType === 'button') {
        confidence += 15;
        matchReasons.push('button type match');
      }
      if (targetLower.includes('link') && element.elementType === 'link') {
        confidence += 15;
        matchReasons.push('link type match');
      }
      if (targetLower.includes('input') && element.elementType === 'input') {
        confidence += 15;
        matchReasons.push('input type match');
      }

      // Context matching
      if (element.context && element.context.toLowerCase().includes(targetLower)) {
        confidence += 10;
        matchReasons.push('context match');
      }

      // Priority bonus
      confidence += element.priority * 2;

      if (confidence > highestConfidence && confidence > 20) {
        highestConfidence = confidence;
        bestMatch = element;
        reason = matchReasons.join(', ');
      }
    }

    return {
      element: bestMatch,
      confidence: highestConfidence,
      reason: reason || 'No strong match found'
    };
  }

  /**
   * Calculate string similarity (0-1)
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}

// DOM Service - implements nanobrowser-style DOM operations
class DOMService {
  /**
   * Execute script in tab with comprehensive error handling
   */
  static async executeScript<T = any>(
    tabId: number,
    func: (...args: any[]) => T,
    args: any[] = []
  ): Promise<DOMOperationResult> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: func,
        args: args,
      });

      if (results && results[0]) {
        return {
          success: true,
          data: results[0].result,
        };
      }

      return {
        success: false,
        error: 'No result returned from script execution',
      };
    } catch (error) {
      logger.error('DOMService', 'Script execution failed', {
        error,
        tabId,
        functionName: func.name,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Wait for element to exist in DOM
   */
  static async waitForElement(
    tabId: number,
    selector: string,
    timeout: number = 10000
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.executeScript(
        tabId,
        (sel: string) => {
          const element = document.querySelector(sel);
          return element !== null;
        },
        [selector]
      );

      if (result.success && result.data) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return false;
  }

  /**
   * Get element information
   */
  static async getElementInfo(
    tabId: number,
    selector: string
  ): Promise<ElementInfo | null> {
    const result = await this.executeScript(
      tabId,
      (sel: string) => {
        const element = document.querySelector(sel);
        if (!element) return null;

        const bounds = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return {
          tagName: element.tagName.toLowerCase(),
          attributes: Array.from(element.attributes).reduce((attrs, attr) => {
            attrs[attr.name] = attr.value;
            return attrs;
          }, {} as Record<string, string>),
          text: element.textContent?.trim() || '',
          visible:
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            bounds.width > 0 &&
            bounds.height > 0,
          bounds: {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            top: bounds.top,
            right: bounds.right,
            bottom: bounds.bottom,
            left: bounds.left,
          } as DOMRect,
        };
      },
      [selector]
    );

    return result.success ? result.data : null;
  }

  /**
   * Click element with advanced interaction
   */
  static async clickElement(tabId: number, selector: string): Promise<boolean> {
    const result = await this.executeScript(
      tabId,
      (sel: string) => {
        const element = document.querySelector(sel) as HTMLElement;
        if (!element) return false;

        // Scroll into view if needed
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center',
        });

        // Wait a bit for scroll to complete
        setTimeout(() => {
          // Try multiple click methods for better compatibility
          try {
            // Method 1: Native click
            element.click();
          } catch (e) {
            try {
              // Method 2: Dispatch click event
              const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
              });
              element.dispatchEvent(clickEvent);
            } catch (e2) {
              // Method 3: Focus and trigger
              if (element.focus) {
                element.focus();
              }
              element.click();
            }
          }
        }, 100);

        return true;
      },
      [selector]
    );

    return result.success && result.data;
  }

  /**
   * Fill input with text
   */
  static async fillInput(
    tabId: number,
    selector: string,
    text: string
  ): Promise<boolean> {
    const result = await this.executeScript(
      tabId,
      (sel: string, txt: string) => {
        const element = document.querySelector(sel) as
          | HTMLInputElement
          | HTMLTextAreaElement;
        if (!element) return false;

        // Clear existing content
        element.value = '';
        element.focus();

        // Set new value
        element.value = txt;

        // Dispatch input events for better compatibility
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        // For React and other frameworks
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(element, txt);
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }

        return true;
      },
      [selector, text]
    );

    return result.success && result.data;
  }

  /**
   * Get all clickable elements (similar to nanobrowser's getClickableElements)
   */
  static async getClickableElements(tabId: number): Promise<ElementInfo[]> {
    const result = await this.executeScript(
      tabId,
      () => {
        const clickableSelectors = [
          'button',
          'a[href]',
          'input[type="button"]',
          'input[type="submit"]',
          'input[type="reset"]',
          '[onclick]',
          '[role="button"]',
          '[tabindex]',
          'select',
          'input[type="checkbox"]',
          'input[type="radio"]',
          'input[type="text"]',
          'input[type="email"]',
          'input[type="password"]',
          'textarea',
        ];

        const elements: ElementInfo[] = [];

        clickableSelectors.forEach((selectorGroup) => {
          const foundElements = document.querySelectorAll(selectorGroup);
          foundElements.forEach((element, index) => {
            const bounds = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);

            const isVisible =
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              style.opacity !== '0' &&
              bounds.width > 0 &&
              bounds.height > 0;

            if (isVisible) {
              elements.push({
                tagName: element.tagName.toLowerCase(),
                attributes: Array.from(element.attributes).reduce(
                  (attrs, attr) => {
                    attrs[attr.name] = attr.value;
                    return attrs;
                  },
                  {} as Record<string, string>
                ),
                text: element.textContent?.trim() || '',
                visible: isVisible,
                bounds: bounds as DOMRect,
              });
            }
          });
        });

        return elements;
      },
      []
    );

    return result.success ? result.data || [] : [];
  }

  /**
   * Scroll page or element
   */
  static async scroll(
    tabId: number,
    direction: 'up' | 'down' | 'top' | 'bottom',
    amount?: number
  ): Promise<boolean> {
    const result = await this.executeScript(
      tabId,
      (dir: string, amt?: number) => {
        switch (dir) {
          case 'top':
            window.scrollTo({ top: 0, behavior: 'smooth' });
            break;
          case 'bottom':
            window.scrollTo({
              top: document.body.scrollHeight,
              behavior: 'smooth',
            });
            break;
          case 'up':
            window.scrollBy({
              top: -(amt || window.innerHeight),
              behavior: 'smooth',
            });
            break;
          case 'down':
            window.scrollBy({
              top: amt || window.innerHeight,
              behavior: 'smooth',
            });
            break;
          default:
            return false;
        }
        return true;
      },
      [direction, amount]
    );

    return result.success && result.data;
  }

  /**
   * Get page information
   */
  static async getPageInfo(tabId: number): Promise<any> {
    const result = await this.executeScript(
      tabId,
      () => {
        return {
          title: document.title,
          url: window.location.href,
          scrollY: window.scrollY,
          scrollHeight: document.body.scrollHeight,
          viewportHeight: window.innerHeight,
          forms: document.forms.length,
          inputs: document.querySelectorAll('input').length,
          buttons: document.querySelectorAll('button').length,
          links: document.querySelectorAll('a').length,
        };
      },
      []
    );

    return result.success ? result.data : null;
  }
}

// LLM Decision System for intelligent element selection
class LLMDecisionSystem {
  private llm: any;

  constructor() {
    // Initialize LLM based on available services
    this.llm = this.initializeLLM();
  }

  private initializeLLM() {
    // Try to initialize with available LLM services
    try {
      // Check if OpenAI is available
      if (typeof ChatOpenAI !== 'undefined') {
        return new ChatOpenAI({
          modelName: 'gpt-3.5-turbo',
          temperature: 0.1,
        });
      }

      // Fallback to Anthropic
      if (typeof ChatAnthropic !== 'undefined') {
        return new ChatAnthropic({
          model: 'claude-3-haiku-20240307',
          temperature: 0.1,
        });
      }

      // Fallback to Google
      if (typeof ChatGoogleGenerativeAI !== 'undefined') {
        return new ChatGoogleGenerativeAI({
          model: 'gemini-pro',
          temperature: 0.1,
        });
      }
    } catch (error) {
      logger.warn('LLMDecisionSystem', 'Failed to initialize LLM, using rule-based fallback', { error });
    }

    return null; // Will use rule-based decision making
  }

  /**
   * Make intelligent decision about element selection
   */
  async makeDecision(task: string, pageContext: {
    pageInfo: any;
    elements: EnhancedElementInfo[];
    summary: any;
  }): Promise<{
    action: 'click' | 'fill' | 'select' | 'check' | 'navigate' | 'analyze' | 'none';
    target?: string;
    selector?: string;
    value?: string;
    confidence: number;
    reasoning: string;
    highlights?: string[];
  }> {
    if (!this.llm) {
      // Use rule-based decision making
      return this.makeRuleBasedDecision(task, pageContext);
    }

    try {
      // Prepare context for LLM
      const context = this.prepareLLMContext(task, pageContext);

      // Create LLM prompt
      const prompt = this.createDecisionPrompt(context);

      // Get LLM decision
      const response = await this.llm.invoke([
        {
          role: 'system',
          content: this.getSystemPrompt()
        },
        {
          role: 'user',
          content: prompt
        }
      ]);

      // Parse LLM response
      return this.parseLLMResponse(response.content);
    } catch (error) {
      logger.error('LLMDecisionSystem', 'LLM decision failed, falling back to rule-based', { error });
      return this.makeRuleBasedDecision(task, pageContext);
    }
  }

  /**
   * Prepare context for LLM decision making
   */
  private prepareLLMContext(task: string, pageContext: any) {
    // Filter and prioritize elements for LLM
    const importantElements = pageContext.elements
      .filter((el: EnhancedElementInfo) => el.priority > 5)
      .slice(0, 20); // Limit to top 20 elements

    return {
      task,
      pageInfo: pageContext.pageInfo,
      elements: importantElements,
      summary: pageContext.summary,
      timestamp: Date.now()
    };
  }

  /**
   * Create decision prompt for LLM
   */
  private createDecisionPrompt(context: any): string {
    const { task, pageInfo, elements, summary } = context;

    let prompt = `Task: "${task}"

Page Information:
- Title: ${pageInfo.title}
- URL: ${pageInfo.url}
- Total interactive elements: ${summary.totalElements}
- Clickable elements: ${summary.clickableElements}
- Input elements: ${summary.inputElements}

Available Elements (sorted by priority):
`;

    elements.forEach((el: EnhancedElementInfo, index: number) => {
      prompt += `${index + 1}. Type: ${el.elementType}, Action: ${el.interactionType}
   Text: "${el.text}"
   Selector: ${el.selector}
   Priority: ${el.priority}
   Context: ${el.context}
   Attributes: ${JSON.stringify(el.attributes)}
`;
    });

    prompt += `
Instructions:
Based on the task and available elements, decide the best action to take. Respond in JSON format with:
{
  "action": "click|fill|select|check|navigate|analyze|none",
  "target": "element description or URL",
  "selector": "CSS selector if applicable",
  "value": "value to fill if applicable",
  "confidence": 0.0-1.0,
  "reasoning": "explanation of decision",
  "highlights": ["selector1", "selector2"] (elements to highlight)
}

Rules:
- Choose action with confidence > 0.6
- For "fill" action, include both target and value
- For "navigate" action, include URL as target
- Highlight relevant elements for user reference
- If no suitable action, return "none" with reasoning`;

    return prompt;
  }

  /**
   * Get system prompt for LLM
   */
  private getSystemPrompt(): string {
    return `You are an intelligent web automation assistant. Your job is to analyze web pages and determine the best actions to take based on user tasks.

Guidelines:
1. Always prioritize user safety and avoid harmful actions
2. Choose the most specific and relevant elements
3. Consider element priority, visibility, and context
4. Provide clear reasoning for decisions
5. When uncertain, suggest analysis rather than incorrect action
6. Never make up information - use only the provided context

Action Types:
- click: Click on buttons, links, or interactive elements
- fill: Fill input fields with text
- select: Select options from dropdowns
- check: Check or uncheck checkboxes/radio buttons
- navigate: Navigate to a different URL
- analyze: Provide page analysis and suggestions
- none: No suitable action found

Response Format: Always respond with valid JSON only.`;
  }

  /**
   * Parse LLM response
   */
  private parseLLMResponse(response: string): any {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.action || !parsed.confidence || !parsed.reasoning) {
        throw new Error('Invalid response format');
      }

      return {
        action: parsed.action,
        target: parsed.target,
        selector: parsed.selector,
        value: parsed.value,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        highlights: parsed.highlights || []
      };
    } catch (error) {
      logger.error('LLMDecisionSystem', 'Failed to parse LLM response', { error, response });
      throw new Error('Invalid LLM response format');
    }
  }

  /**
   * Rule-based decision making as fallback
   */
  private makeRuleBasedDecision(task: string, pageContext: any): Promise<any> {
    return new Promise((resolve) => {
      const taskLower = task.toLowerCase();
      const elements = pageContext.elements;

      // Navigation tasks
      if (taskLower.includes('open') || taskLower.includes('go to') || taskLower.includes('navigate')) {
        const urlMatch = task.match(/(?:open|go to|navigate)\s+(.+)/i);
        if (urlMatch) {
          let url = urlMatch[1].trim();
          if (!url.startsWith('http')) {
            url = `https://${url}`;
          }
          resolve({
            action: 'navigate',
            target: url,
            confidence: 0.8,
            reasoning: `Rule-based: Navigation task detected for ${url}`,
            highlights: []
          });
          return;
        }
      }

      // Click tasks
      if (taskLower.includes('click')) {
        const targetMatch = task.match(/click\s+(.+)/i);
        if (targetMatch) {
          const target = targetMatch[1].trim();

          // Find best match for clicking
          const match = this.findBestElementMatch(target, elements, ['button', 'link']);
          if (match.element && match.confidence > 0.5) {
            resolve({
              action: 'click',
              target: target,
              selector: match.element.selector,
              confidence: match.confidence,
              reasoning: `Rule-based: Found matching ${match.element.elementType} with ${match.confidence} confidence`,
              highlights: [match.element.selector]
            });
            return;
          }
        }
      }

      // Fill tasks
      if (taskLower.includes('fill') || taskLower.includes('type') || taskLower.includes('input')) {
        const fillMatch = task.match(/(?:fill|type|input)\s+(.+?)\s+(?:with|as)\s+(.+)/i);
        if (fillMatch) {
          const target = fillMatch[1].trim();
          const value = fillMatch[2].trim();

          const match = this.findBestElementMatch(target, elements, ['input', 'textarea']);
          if (match.element && match.confidence > 0.5) {
            resolve({
              action: 'fill',
              target: target,
              selector: match.element.selector,
              value: value,
              confidence: match.confidence,
              reasoning: `Rule-based: Found input field with ${match.confidence} confidence`,
              highlights: [match.element.selector]
            });
            return;
          }
        }
      }

      // Default: analyze page
      resolve({
        action: 'analyze',
        confidence: 0.3,
        reasoning: 'Rule-based: No specific action identified, suggesting page analysis',
        highlights: elements.slice(0, 5).map((el: EnhancedElementInfo) => el.selector)
      });
    });
  }

  /**
   * Find best element match for rule-based decisions
   */
  private findBestElementMatch(target: string, elements: EnhancedElementInfo[], types: string[]): {
    element: EnhancedElementInfo | null;
    confidence: number;
  } {
    const targetLower = target.toLowerCase();
    let bestMatch: EnhancedElementInfo | null = null;
    let highestConfidence = 0;

    for (const element of elements) {
      if (!types.includes(element.elementType)) continue;

      let confidence = 0;

      // Text matching
      if (element.text && element.text.toLowerCase().includes(targetLower)) {
        confidence += 0.5;
      }

      // Attribute matching
      for (const [attrName, attrValue] of Object.entries(element.attributes)) {
        if (attrValue.toLowerCase().includes(targetLower)) {
          confidence += 0.3;
        }
      }

      // Context matching
      if (element.context && element.context.toLowerCase().includes(targetLower)) {
        confidence += 0.2;
      }

      // Priority bonus
      confidence += element.priority * 0.1;

      if (confidence > highestConfidence) {
        highestConfidence = confidence;
        bestMatch = element;
      }
    }

    return {
      element: bestMatch,
      confidence: Math.min(highestConfidence, 1.0)
    };
  }
}

// Browser Actions - implements specific browser operations
class BrowserActions {
  constructor(private tabId: number) {}

  async addTodoItem(
    todoText: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // Smart selector strategy for todo apps
      const todoSelectors = [
        'input[placeholder*="todo" i]',
        'input[placeholder*="task" i]',
        'input[placeholder*="add" i]',
        '.todo-input',
        '.new-todo',
        'input[type="text"]:not([readonly])',
        '.task-input',
        '#new-todo-input',
        '#todo-input',
        '[data-testid*="todo" i] input',
        '[data-testid*="task" i] input',
      ];

      let inputFound = false;

      for (const selector of todoSelectors) {
        if (await DOMService.waitForElement(this.tabId, selector, 2000)) {
          logger.info('AgentExecutor', `Found todo input: ${selector}`);

          // Focus and fill input
          await DOMService.clickElement(this.tabId, selector);
          await new Promise((resolve) => setTimeout(resolve, 300));

          const filled = await DOMService.fillInput(
            this.tabId,
            selector,
            todoText
          );

          if (filled) {
            // Try to submit by pressing Enter
            await DOMService.executeScript(
              this.tabId,
              (sel: string) => {
                const input = document.querySelector(sel) as HTMLInputElement;
                if (input) {
                  const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    bubbles: true,
                  });
                  input.dispatchEvent(enterEvent);
                }
              },
              [selector]
            );

            // Also try to find and click submit buttons
            const submitSelectors = [
              'button[type="submit"]',
              '.add-button',
              '.add-todo',
              'button:contains("Add")',
              'button:contains("+")',
              '[data-action="add"]',
              'form button',
            ];

            for (const btnSelector of submitSelectors) {
              if (
                await DOMService.waitForElement(this.tabId, btnSelector, 1000)
              ) {
                await DOMService.clickElement(this.tabId, btnSelector);
                break;
              }
            }

            inputFound = true;
            break;
          }
        }
      }

      if (!inputFound) {
        return {
          success: false,
          message:
            'Could not find todo input field. Please make sure you are on a todo application page.',
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        success: true,
        message: `Successfully added todo: "${todoText}"`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to add todo: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  async completeTodoItem(
    todoText?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const result = await DOMService.executeScript(
        this.tabId,
        (searchText?: string) => {
          // Find uncompleted todo items
          const checkboxes = Array.from(
            document.querySelectorAll('input[type="checkbox"]:not(:checked)')
          );

          if (checkboxes.length === 0) {
            return { found: false, message: 'No uncompleted todo items found' };
          }

          // If searchText provided, try to find specific todo
          if (searchText) {
            for (const checkbox of checkboxes) {
              const parent = checkbox.closest(
                'li, .todo-item, .task-item, [data-todo], [data-task]'
              );
              if (
                parent &&
                parent.textContent
                  ?.toLowerCase()
                  .includes(searchText.toLowerCase())
              ) {
                (checkbox as HTMLInputElement).click();
                return {
                  found: true,
                  message: `Completed todo: "${searchText}"`,
                };
              }
            }
            return {
              found: false,
              message: `Todo item "${searchText}" not found`,
            };
          }

          // Complete first uncompleted item
          (checkboxes[0] as HTMLInputElement).click();
          return {
            found: true,
            message: 'Completed first uncompleted todo item',
          };
        },
        [todoText]
      );

      if (result.success && result.data?.found) {
        return { success: true, message: result.data.message };
      }

      return {
        success: false,
        message: result.data?.message || 'Could not complete todo item',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to complete todo: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  async deleteTodoItem(
    todoText?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const result = await DOMService.executeScript(
        this.tabId,
        (searchText?: string) => {
          const todoItems = Array.from(
            document.querySelectorAll(
              'li, .todo-item, .task-item, [data-todo], [data-task]'
            )
          );

          if (todoItems.length === 0) {
            return { found: false, message: 'No todo items found' };
          }

          let targetItem: Element | null = null;

          if (searchText) {
            // Find specific todo item
            targetItem =
              todoItems.find((item) =>
                item.textContent
                  ?.toLowerCase()
                  .includes(searchText.toLowerCase())
              ) || null;
          } else {
            // Use first item
            targetItem = todoItems[0] || null;
          }

          if (!targetItem) {
            return { found: false, message: 'Todo item not found' };
          }

          // Try to find delete button
          const deleteBtn = targetItem.querySelector(
            '.delete, .remove, .trash, button[title*="delete" i], button[title*="remove" i], [data-action="delete"]'
          );

          if (deleteBtn) {
            (deleteBtn as HTMLElement).click();
            return { found: true, message: 'Deleted todo item' };
          }

          // If no delete button, try removing the item directly
          (targetItem as HTMLElement).remove();
          return { found: true, message: 'Removed todo item' };
        },
        [todoText]
      );

      if (result.success && result.data?.found) {
        return { success: true, message: result.data.message };
      }

      return {
        success: false,
        message: result.data?.message || 'Could not delete todo item',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete todo: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  async listTodoItems(): Promise<{ success: boolean; message?: string }> {
    try {
      const result = await DOMService.executeScript(
        this.tabId,
        () => {
          const todoItems = Array.from(
            document.querySelectorAll(
              'li, .todo-item, .task-item, [data-todo], [data-task]'
            )
          );

          if (todoItems.length === 0) {
            return { items: [], message: 'No todo items found on this page' };
          }

          const items = todoItems
            .map((item, index) => {
              const checkbox = item.querySelector(
                'input[type="checkbox"]'
              ) as HTMLInputElement;
              const isCompleted = checkbox ? checkbox.checked : false;
              const text = item.textContent?.trim() || '';

              if (text.length === 0) return null;

              return {
                index: index + 1,
                text: text,
                completed: isCompleted,
              };
            })
            .filter((item) => item !== null);

          return { items, message: `Found ${items.length} todo items` };
        },
        []
      );

      if (result.success && result.data) {
        const todos = result.data.items;
        if (todos.length > 0) {
          const todoList = todos
            .map(
              (todo: any) =>
                `${todo.index}. ${todo.completed ? '✓' : '○'} ${todo.text}`
            )
            .join('\n');

          return {
            success: true,
            message: `Todo Items:\n${todoList}`,
          };
        }
      }

      return {
        success: true,
        message: result.data?.message || 'No todo items found on this page',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to list todos: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }
}

// Intelligent Task Executor - replaces hardcoded strategies with LLM-driven decisions
class IntelligentTaskExecutor {
  private llmDecisionSystem: LLMDecisionSystem;
  private elementDiscovery: typeof EnhancedElementDiscovery;

  constructor(private tabId: number, private actions: BrowserActions) {
    this.llmDecisionSystem = new LLMDecisionSystem();
    this.elementDiscovery = EnhancedElementDiscovery;
  }

  async executeTask(
    task: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      logger.info('IntelligentTaskExecutor', `Starting intelligent task execution: ${task}`, { tabId: this.tabId });

      // Step 1: Discover page elements
      await this.emitEvent('system', 'step.start', 'Discovering page elements...');
      const pageContext = await this.elementDiscovery.discoverPageElements(this.tabId);
      await this.emitEvent('system', 'step.ok', `Found ${pageContext.summary.totalElements} interactive elements`);

      // Step 2: Make intelligent decision
      await this.emitEvent('system', 'step.start', 'Analyzing task and making decision...');
      const decision = await this.llmDecisionSystem.makeDecision(task, pageContext);
      await this.emitEvent('system', 'step.ok', `Decision made: ${decision.action} with ${Math.round(decision.confidence * 100)}% confidence`);

      // Step 3: Highlight relevant elements if specified
      if (decision.highlights && decision.highlights.length > 0) {
        await this.emitEvent('system', 'step.start', 'Highlighting relevant elements...');
        await this.elementDiscovery.highlightElements(this.tabId, decision.highlights);
        await this.emitEvent('system', 'step.ok', `Highlighted ${decision.highlights.length} elements`);

        // Wait a moment for user to see highlights
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Remove highlights
        await this.elementDiscovery.removeHighlights(this.tabId);
      }

      // Step 4: Execute the decided action
      await this.emitEvent('system', 'step.start', `Executing action: ${decision.action}...`);
      const result = await this.executeDecision(decision);
      await this.emitEvent('system', 'step.ok', `Action completed: ${result.message}`);

      return result;
    } catch (error) {
      logger.error('IntelligentTaskExecutor', 'Task execution failed', { error, task });
      await this.emitEvent('system', 'step.fail', `Task failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        message: `Intelligent task execution failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  /**
   * Execute the LLM decision
   */
  private async executeDecision(decision: any): Promise<{ success: boolean; message?: string }> {
    const { action, selector, target, value, confidence, reasoning } = decision;

    // Only execute if confidence is sufficient
    if (confidence < 0.5) {
      return {
        success: false,
        message: `Confidence too low (${Math.round(confidence * 100)}%) to execute action: ${reasoning}`
      };
    }

    switch (action) {
      case 'click':
        return await this.executeClick(selector, target, reasoning);

      case 'fill':
        return await this.executeFill(selector, target, value, reasoning);

      case 'select':
        return await this.executeSelect(selector, target, value, reasoning);

      case 'check':
        return await this.executeCheck(selector, target, reasoning);

      case 'navigate':
        return await this.executeNavigate(target, reasoning);

      case 'analyze':
        return await this.executeAnalysis(reasoning);

      case 'none':
        return {
          success: true,
          message: `No action taken: ${reasoning}`
        };

      default:
        return {
          success: false,
          message: `Unknown action type: ${action}`
        };
    }
  }

  /**
   * Execute click action
   */
  private async executeClick(selector: string, target: string, reasoning: string): Promise<{ success: boolean; message?: string }> {
    if (!selector) {
      return {
        success: false,
        message: `No selector provided for click action: ${target}`
      };
    }

    // Wait for element and click
    if (await DOMService.waitForElement(this.tabId, selector, 5000)) {
      const clicked = await DOMService.clickElement(this.tabId, selector);
      if (clicked) {
        return {
          success: true,
          message: `Successfully clicked ${target || 'element'} (${reasoning})`
        };
      }
    }

    return {
      success: false,
      message: `Failed to click ${target || 'element'}: element not found or not clickable`
    };
  }

  /**
   * Execute fill action
   */
  private async executeFill(selector: string, target: string, value: string, reasoning: string): Promise<{ success: boolean; message?: string }> {
    if (!selector || !value) {
      return {
        success: false,
        message: `Missing selector or value for fill action: ${target}`
      };
    }

    // Wait for element and fill
    if (await DOMService.waitForElement(this.tabId, selector, 5000)) {
      const filled = await DOMService.fillInput(this.tabId, selector, value);
      if (filled) {
        return {
          success: true,
          message: `Successfully filled ${target || 'field'} with "${value}" (${reasoning})`
        };
      }
    }

    return {
      success: false,
      message: `Failed to fill ${target || 'field'}: element not found or not editable`
    };
  }

  /**
   * Execute select action
   */
  private async executeSelect(selector: string, target: string, value: string, reasoning: string): Promise<{ success: boolean; message?: string }> {
    if (!selector || !value) {
      return {
        success: false,
        message: `Missing selector or value for select action: ${target}`
      };
    }

    const result = await DOMService.executeScript(
      this.tabId,
      (sel: string, val: string) => {
        const select = document.querySelector(sel) as HTMLSelectElement;
        if (!select) return false;

        // Try to find option by value
        let option = Array.from(select.options).find(opt =>
          opt.value.toLowerCase().includes(val.toLowerCase()) ||
          opt.textContent?.toLowerCase().includes(val.toLowerCase())
        );

        if (option) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }

        return false;
      },
      [selector, value]
    );

    return {
      success: result.success && result.data,
      message: result.success && result.data
        ? `Successfully selected ${value} in ${target || 'dropdown'} (${reasoning})`
        : `Failed to select ${value} in ${target || 'dropdown'}`
    };
  }

  /**
   * Execute check action
   */
  private async executeCheck(selector: string, target: string, reasoning: string): Promise<{ success: boolean; message?: string }> {
    if (!selector) {
      return {
        success: false,
        message: `No selector provided for check action: ${target}`
      };
    }

    const result = await DOMService.executeScript(
      this.tabId,
      (sel: string) => {
        const element = document.querySelector(sel) as HTMLInputElement;
        if (!element) return false;

        if (element.type === 'checkbox' || element.type === 'radio') {
          element.checked = !element.checked;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }

        return false;
      },
      [selector]
    );

    return {
      success: result.success && result.data,
      message: result.success && result.data
        ? `Successfully toggled ${target || 'checkbox'} (${reasoning})`
        : `Failed to toggle ${target || 'checkbox'}`
    };
  }

  /**
   * Execute navigate action
   */
  private async executeNavigate(target: string, reasoning: string): Promise<{ success: boolean; message?: string }> {
    try {
      // Ensure URL has protocol
      let url = target;
      if (!url.startsWith('http')) {
        url = `https://${url}`;
      }

      await chrome.tabs.update(this.tabId, { url });
      await this.waitForPageLoad();

      return {
        success: true,
        message: `Successfully navigated to ${url} (${reasoning})`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to navigate to ${target}: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute analysis action
   */
  private async executeAnalysis(reasoning: string): Promise<{ success: boolean; message?: string }> {
    const pageContext = await this.elementDiscovery.discoverPageElements(this.tabId);

    let analysis = `Page Analysis: ${reasoning}\n\n`;
    analysis += `Page Title: ${pageContext.pageInfo.title}\n`;
    analysis += `URL: ${pageContext.pageInfo.url}\n`;
    analysis += `Elements Found: ${pageContext.summary.totalElements} total, `;
    analysis += `${pageContext.summary.clickableElements} clickable, `;
    analysis += `${pageContext.summary.inputElements} input fields\n\n`;

    // Show top elements by priority
    const topElements = pageContext.elements.slice(0, 10);
    analysis += 'Top Priority Elements:\n';
    topElements.forEach((el, index) => {
      analysis += `${index + 1}. ${el.elementType}: "${el.text}" (Priority: ${el.priority})\n`;
      analysis += `   Selector: ${el.selector}\n`;
      analysis += `   Context: ${el.context}\n\n`;
    });

    return {
      success: true,
      message: analysis
    };
  }

  /**
   * Wait for page to load after navigation
   */
  private async waitForPageLoad(timeout: number = 10000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const tab = await chrome.tabs.get(this.tabId);
        if (tab.status === 'complete') {
          return;
        }
      } catch (error) {
        throw new Error(`Tab ${this.tabId} became inaccessible during navigation`);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Page did not finish loading within ${timeout}ms`);
  }

  /**
   * Emit event for tracking
   */
  private async emitEvent(actor: string, state: string, details: string): Promise<void> {
    // This would normally emit to the event system
    // For now, just log it
    logger.info('IntelligentTaskExecutor', `${actor}.${state}: ${details}`);
  }
}

// Legacy TaskExecutor - kept for backward compatibility but deprecated
// All new functionality should use IntelligentTaskExecutor

// Main AgentExecutor class
class AgentExecutor {
  private eventSubscribers: EventCallback[] = [];
  private isRunning = false;
  private currentTask: string | null = null;
  private currentStep = 0;
  private taskId: string | null = null;
  private cancelled = false;
  private tabId: number | null = null;
  private executionHistory: Array<{
    taskId: string;
    task: string;
    timestamp: number;
    status: 'completed' | 'failed' | 'cancelled';
  }> = [];

  constructor() {
    logger.info('AgentExecutor', 'Initialized browser automation executor');
    this.loadExecutionHistory();
  }

  async execute(options: {
    task: string;
    taskId: string;
    tabId: number;
  }): Promise<void> {
    this.isRunning = true;
    this.currentTask = options.task;
    this.taskId = options.taskId;
    this.tabId = options.tabId;
    this.currentStep = 0;
    this.cancelled = false;

    logger.info('AgentExecutor', `Executing task: ${options.task}`, {
      taskId: options.taskId,
      tabId: options.tabId,
    });

    try {
      await this.emitEvent('system', 'task.start', 'Task started');

      // Initialize browser actions and intelligent task executor
      const actions = new BrowserActions(options.tabId);
      const executor = new IntelligentTaskExecutor(options.tabId, actions);

      // Execute the task
      const taskResult = await executor.executeTask(options.task);

      if (taskResult.success) {
        await this.recordExecution('completed');
        await this.emitEvent(
          'system',
          'task.ok',
          taskResult.message || 'Task completed successfully'
        );
      } else {
        await this.recordExecution('failed');
        await this.emitEvent(
          'system',
          'task.fail',
          taskResult.message || 'Task failed'
        );
        throw new Error(taskResult.message || 'Task execution failed');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.recordExecution('failed');
      await this.emitEvent(
        'system',
        'task.fail',
        `Task failed: ${errorMessage}`
      );
      throw error;
    } finally {
      this.cleanup();
    }
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    logger.info('AgentExecutor', 'Cancel requested');
  }

  async replay(sessionId: string): Promise<void> {
    logger.info('AgentExecutor', `Replaying session: ${sessionId}`);

    // Simplified replay implementation
    this.isRunning = true;
    this.currentTask = `Replay session ${sessionId}`;
    this.taskId = `replay-${sessionId}`;
    this.cancelled = false;

    try {
      await this.emitEvent('system', 'task.start', 'Replay started');

      // Simple replay simulation
      const replaySteps = [
        'Loading session metadata...',
        'Validating execution context...',
        'Replaying actions...',
      ];

      for (let i = 0; i < replaySteps.length; i++) {
        if (this.cancelled) {
          await this.recordExecution('cancelled');
          await this.emitEvent(
            'system',
            'task.cancel',
            'Replay cancelled by user'
          );
          return;
        }

        this.currentStep = i + 1;
        await this.emitEvent('navigator', 'step.start', replaySteps[i]);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await this.emitEvent(
          'navigator',
          'step.ok',
          `${replaySteps[i]} completed`
        );
      }

      await this.recordExecution('completed');
      await this.emitEvent(
        'system',
        'task.ok',
        'Replay completed successfully'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.recordExecution('failed');
      await this.emitEvent(
        'system',
        'task.fail',
        `Replay failed: ${errorMessage}`
      );
      throw error;
    } finally {
      this.cleanup();
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      currentTask: this.currentTask || undefined,
      currentStep: this.currentStep > 0 ? this.currentStep : undefined,
    };
  }

  subscribeToEvents(callback: EventCallback): void {
    this.eventSubscribers.push(callback);
  }

  unsubscribeFromEvents(): void {
    this.eventSubscribers = [];
  }

  addFollowUpTask(task: string): void {
    logger.info('AgentExecutor', `Adding follow-up task: ${task}`);

    if (this.isRunning) {
      logger.warn(
        'AgentExecutor',
        'Cannot add follow-up task while another task is running'
      );
      return;
    }

    // In a real implementation, this would add the task to a queue
    setTimeout(async () => {
      if (!this.isRunning && this.tabId) {
        const followUpTaskId = `followup-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        await this.execute({ task, taskId: followUpTaskId, tabId: this.tabId });
      }
    }, 1000);
  }

  public cleanup(): void {
    this.isRunning = false;
    this.currentTask = null;
    this.currentStep = 0;
    this.taskId = null;
    this.tabId = null;
    this.cancelled = false;

    logger.info('AgentExecutor', 'Cleaned up executor state');
  }

  private async recordExecution(
    status: 'completed' | 'failed' | 'cancelled'
  ): Promise<void> {
    if (!this.taskId || !this.currentTask) return;

    const record = {
      taskId: this.taskId,
      task: this.currentTask,
      timestamp: Date.now(),
      status,
    };

    this.executionHistory.push(record);

    // Keep only last 50 executions
    if (this.executionHistory.length > 50) {
      this.executionHistory = this.executionHistory.slice(-50);
    }

    // Save to chrome storage for persistence
    try {
      await chrome.storage.local.set({
        agentExecutorHistory: this.executionHistory,
      });
    } catch (error) {
      logger.warn('AgentExecutor', 'Failed to save execution history', error);
    }
  }

  private async loadExecutionHistory(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('agentExecutorHistory');
      if (result.agentExecutorHistory) {
        this.executionHistory = result.agentExecutorHistory;
        logger.info(
          'AgentExecutor',
          `Loaded ${this.executionHistory.length} historical executions`
        );
      }
    } catch (error) {
      logger.warn('AgentExecutor', 'Failed to load execution history', error);
    }
  }

  getExecutionStats(): {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const stats = this.executionHistory.reduce(
      (acc, record) => {
        acc.total++;
        acc[record.status]++;
        return acc;
      },
      { total: 0, completed: 0, failed: 0, cancelled: 0 }
    );

    return stats;
  }

  private async emitEvent(
    actor: string,
    state: string,
    details: string
  ): Promise<void> {
    const event: AgentEvent = {
      actor,
      state,
      data: {
        taskId: this.taskId || 'unknown',
        step: this.currentStep,
        maxSteps: 5,
        details,
      },
      timestamp: Date.now(),
      type: 'execution',
    };

    for (const callback of this.eventSubscribers) {
      try {
        await callback(event);
      } catch (error) {
        logger.error('AgentExecutor', 'Error in event callback', { error });
      }
    }
  }
}

// Bridge interface
export interface AgentExecutorBridge {
  execute(task: string, tabId: number): Promise<void>;
  cancel(): Promise<void>;
  replay(sessionId: string): Promise<void>;
  getStatus(): {
    isRunning: boolean;
    currentTask?: string;
    currentStep?: number;
  };
  subscribeToEvents(callback: EventCallback): void;
  unsubscribeFromEvents(): void;
  addFollowUpTask(task: string): void;
  cleanup?(): void;
}

// Native browser automation controller - replaces AgentIntegrationBridge
class AgentController implements AgentExecutorBridge {
  private executor: AgentExecutor;
  private browserContext: BrowserContext;

  constructor() {
    this.executor = new AgentExecutor();
    this.browserContext = new RabbyBrowserContext();

    logger.info(
      'AgentController',
      'Initialized native browser automation controller'
    );
  }

  async execute(task: string, tabId: number): Promise<void> {
    logger.info('AgentController', `Executing task: ${task}`, { tabId });

    if (!task || task.trim().length === 0) {
      throw new Error('Task description cannot be empty');
    }

    if (!tabId || tabId <= 0) {
      throw new Error('Invalid tab ID provided');
    }

    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url) {
        throw new Error(`Tab ${tabId} is not accessible or does not exist`);
      }

      if (this.isRestrictedUrl(tab.url)) {
        throw new Error(`Cannot execute tasks on restricted URL: ${tab.url}`);
      }

      const taskId = `task-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Switch to tab and execute task
      await this.browserContext.switchToTab(tabId);
      await this.waitForTabReady(tabId);
      await this.executor.execute({ task, taskId, tabId });

      logger.info('AgentController', 'Task execution completed', { taskId });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('AgentController', 'Task execution failed', {
        error: errorMessage,
        tabId,
      });
      throw error;
    }
  }

  async cancel(): Promise<void> {
    logger.info('AgentController', 'Canceling current task');

    try {
      await this.executor.cancel();
      logger.info('AgentController', 'Task cancelled successfully');
    } catch (error) {
      logger.error('AgentController', 'Failed to cancel task', { error });
      throw error;
    }
  }

  async replay(sessionId: string): Promise<void> {
    logger.info('AgentController', `Replaying session: ${sessionId}`);

    try {
      await this.executor.replay(sessionId);
      logger.info('AgentController', 'Session replay completed', {
        sessionId,
      });
    } catch (error) {
      logger.error('AgentController', 'Session replay failed', {
        error,
        sessionId,
      });
      throw error;
    }
  }

  getStatus() {
    return this.executor.getStatus();
  }

  subscribeToEvents(callback: EventCallback): void {
    this.executor.subscribeToEvents(callback);
    logger.info('AgentController', 'Event subscription added');
  }

  unsubscribeFromEvents(): void {
    this.executor.unsubscribeFromEvents();
    logger.info('AgentController', 'Event subscriptions cleared');
  }

  addFollowUpTask(task: string): void {
    if (!task || task.trim().length === 0) {
      logger.warn('AgentController', 'Cannot add empty follow-up task');
      return;
    }

    this.executor.addFollowUpTask(task);
    logger.info('AgentController', 'Follow-up task queued', { task });
  }

  getExecutionStats() {
    return this.executor.getExecutionStats();
  }

  private isRestrictedUrl(url: string): boolean {
    const restrictedPatterns = [
      /^chrome:\/\//,
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^about:\/\//,
      /^file:\/\//,
    ];

    return restrictedPatterns.some((pattern) => pattern.test(url));
  }

  private async waitForTabReady(
    tabId: number,
    timeout: number = 5000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          return;
        }
      } catch (error) {
        throw new Error(`Tab ${tabId} became inaccessible`);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Tab ${tabId} did not become ready within ${timeout}ms`);
  }

  cleanup(): void {
    logger.info('AgentController', 'Starting cleanup process...');

    try {
      this.executor.cleanup?.();
      logger.info('AgentController', 'AgentExecutor cleaned up');
    } catch (error) {
      logger.warn('AgentController', 'Error during executor cleanup', error);
    }

    try {
      this.browserContext.cleanup();
      logger.info('AgentController', 'Browser context cleaned up');
    } catch (error) {
      logger.warn(
        'AgentController',
        'Error during browser context cleanup',
        error
      );
    }

    logger.info('AgentController', 'Cleanup completed');
  }
}

// Export the singleton instance
export const agentController = new AgentController();

// For backward compatibility, also export as agentIntegrationBridge
export const agentIntegrationBridge = agentController;
