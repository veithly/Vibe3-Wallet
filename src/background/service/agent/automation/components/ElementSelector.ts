import { ElementSelector, ElementInfo, InteractionResult, BoundingBox } from '../../types/BaseTypes';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ElementSelector');

export class ElementSelectorEngine {
  private cache = new Map<string, ElementInfo[]>();
  private cacheTimeout = 30000; // 30 seconds

  /**
   * Find elements using multiple strategies with fallbacks
   */
  async findElements(
    selector: ElementSelector,
    context?: Document | Element
  ): Promise<ElementInfo[]> {
    const cacheKey = this.generateCacheKey(selector, context);
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && !this.isCacheExpired(cached)) {
      logger.debug('Using cached elements', { cacheKey, count: cached.length });
      return cached;
    }

    const results: ElementInfo[] = [];
    
    // Try each strategy in order of preference
    for (const strategy of this.getStrategies(selector)) {
      try {
        const elements = await this.executeStrategy(strategy, context);
        if (elements.length > 0) {
          results.push(...elements);
          logger.info('Found elements using strategy', {
            strategy: strategy.strategy,
            selector: strategy.selector,
            count: elements.length,
          });
          break;
        }
      } catch (error) {
        logger.warn('Strategy failed', {
          strategy: strategy.strategy,
          selector: strategy.selector,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Cache results
    if (results.length > 0) {
      this.cache.set(cacheKey, results);
      setTimeout(() => this.cache.delete(cacheKey), this.cacheTimeout);
    }

    return results;
  }

  /**
   * Find single best element match
   */
  async findBestElement(
    selector: ElementSelector,
    context?: Document | Element
  ): Promise<ElementInfo | null> {
    const elements = await this.findElements(selector, context);
    
    if (elements.length === 0) {
      return null;
    }

    if (elements.length === 1) {
      return elements[0];
    }

    // Score and rank elements to find the best match
    const scoredElements = elements.map(element => ({
      element,
      score: this.scoreElement(element, selector),
    }));

    scoredElements.sort((a, b) => b.score - a.score);
    return scoredElements[0].element;
  }

  /**
   * Execute click action on element
   */
  async clickElement(
    selector: ElementSelector,
    context?: Document | Element
  ): Promise<InteractionResult> {
    const startTime = Date.now();
    
    try {
      const element = await this.findBestElement(selector, context);
      if (!element) {
        return {
          success: false,
          action: 'click',
          result: null,
          timing: Date.now() - startTime,
          sideEffects: ['Element not found'],
        };
      }

      // Execute click in browser context
      const result = await this.executeInBrowserContext((doc) => {
        const targetElement = doc.querySelector(element.selector) as HTMLElement;
        if (!targetElement) {
          throw new Error('Element not found in DOM');
        }

        // Check if element is clickable
        if (!this.isElementClickable(targetElement)) {
          throw new Error('Element is not clickable');
        }

        // Scroll element into view if needed
        this.scrollIntoView(targetElement);

        // Execute click
        targetElement.click();

        return {
          tagName: targetElement.tagName,
          text: targetElement.textContent,
          href: (targetElement as HTMLAnchorElement).href,
          action: 'click',
        };
      });

      logger.info('Element clicked successfully', {
        selector: selector.selector,
        element: element.selector,
        timing: Date.now() - startTime,
      });

      return {
        success: true,
        element,
        action: 'click',
        result,
        timing: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Click failed', {
        selector: selector.selector,
        error: error instanceof Error ? error.message : String(error),
        timing: Date.now() - startTime,
      });

      return {
        success: false,
        action: 'click',
        result: null,
        timing: Date.now() - startTime,
        sideEffects: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Fill input field with text
   */
  async fillInput(
    selector: ElementSelector,
    value: string,
    context?: Document | Element
  ): Promise<InteractionResult> {
    const startTime = Date.now();
    
    try {
      const element = await this.findBestElement(selector, context);
      if (!element) {
        return {
          success: false,
          action: 'fill',
          result: null,
          timing: Date.now() - startTime,
          sideEffects: ['Element not found'],
        };
      }

      const result = await this.executeInBrowserContext((doc) => {
        const targetElement = doc.querySelector(element.selector) as HTMLInputElement;
        if (!targetElement) {
          throw new Error('Input element not found');
        }

        if (!this.isInputEditable(targetElement)) {
          throw new Error('Input element is not editable');
        }

        // Focus and clear existing value
        targetElement.focus();
        targetElement.value = '';

        // Simulate typing for better compatibility
        this.simulateTyping(targetElement, value);

        // Trigger change event
        const event = new Event('input', { bubbles: true });
        targetElement.dispatchEvent(event);
        const changeEvent = new Event('change', { bubbles: true });
        targetElement.dispatchEvent(changeEvent);

        return {
          tagName: targetElement.tagName,
          type: targetElement.type,
          value: targetElement.value,
          action: 'fill',
        };
      });

      logger.info('Input filled successfully', {
        selector: selector.selector,
        valueLength: value.length,
        timing: Date.now() - startTime,
      });

      return {
        success: true,
        element,
        action: 'fill',
        result,
        timing: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Fill input failed', {
        selector: selector.selector,
        error: error instanceof Error ? error.message : String(error),
        timing: Date.now() - startTime,
      });

      return {
        success: false,
        action: 'fill',
        result: null,
        timing: Date.now() - startTime,
        sideEffects: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Select dropdown option
   */
  async selectDropdown(
    selector: ElementSelector,
    value: string,
    context?: Document | Element
  ): Promise<InteractionResult> {
    const startTime = Date.now();
    
    try {
      const element = await this.findBestElement(selector, context);
      if (!element) {
        return {
          success: false,
          action: 'select',
          result: null,
          timing: Date.now() - startTime,
          sideEffects: ['Element not found'],
        };
      }

      const result = await this.executeInBrowserContext((doc) => {
        const targetElement = doc.querySelector(element.selector) as HTMLSelectElement;
        if (!targetElement) {
          throw new Error('Select element not found');
        }

        // Try to find option by value
        let option = Array.from(targetElement.options).find(opt => 
          opt.value === value || opt.textContent?.trim() === value
        );

        if (!option) {
          throw new Error(`Option not found: ${value}`);
        }

        targetElement.value = option.value;
        
        // Trigger change event
        const event = new Event('change', { bubbles: true });
        targetElement.dispatchEvent(event);

        return {
          tagName: targetElement.tagName,
          selectedValue: targetElement.value,
          selectedText: option.textContent,
          action: 'select',
        };
      });

      logger.info('Dropdown selected successfully', {
        selector: selector.selector,
        value,
        timing: Date.now() - startTime,
      });

      return {
        success: true,
        element,
        action: 'select',
        result,
        timing: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Dropdown selection failed', {
        selector: selector.selector,
        value,
        error: error instanceof Error ? error.message : String(error),
        timing: Date.now() - startTime,
      });

      return {
        success: false,
        action: 'select',
        result: null,
        timing: Date.now() - startTime,
        sideEffects: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Extract content from element
   */
  async extractContent(
    selector: ElementSelector,
    extractType: 'text' | 'html' | 'attribute' | 'value' = 'text',
    attributeName?: string,
    context?: Document | Element
  ): Promise<InteractionResult> {
    const startTime = Date.now();
    
    try {
      const elements = await this.findElements(selector, context);
      if (elements.length === 0) {
        return {
          success: false,
          action: 'extract',
          result: null,
          timing: Date.now() - startTime,
          sideEffects: ['Elements not found'],
        };
      }

      const result = await this.executeInBrowserContext((doc) => {
        const targetElements = Array.from(doc.querySelectorAll(selector.selector));
        const results: any[] = [];

        for (const element of targetElements) {
          let content: any;

          switch (extractType) {
            case 'text':
              content = element.textContent?.trim() || '';
              break;
            case 'html':
              content = element.innerHTML;
              break;
            case 'value':
              content = (element as HTMLInputElement).value || '';
              break;
            case 'attribute':
              content = attributeName ? element.getAttribute(attributeName) : null;
              break;
            default:
              content = element.textContent?.trim() || '';
          }

          results.push({
            tagName: element.tagName,
            content,
            selector: selector.selector,
          });
        }

        return {
          type: extractType,
          count: results.length,
          results: results.length === 1 ? results[0] : results,
          action: 'extract',
        };
      });

      logger.info('Content extracted successfully', {
        selector: selector.selector,
        type: extractType,
        count: Array.isArray(result.results) ? result.results.length : 1,
        timing: Date.now() - startTime,
      });

      return {
        success: true,
        element: elements[0],
        action: 'extract',
        result,
        timing: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Content extraction failed', {
        selector: selector.selector,
        type: extractType,
        error: error instanceof Error ? error.message : String(error),
        timing: Date.now() - startTime,
      });

      return {
        success: false,
        action: 'extract',
        result: null,
        timing: Date.now() - startTime,
        sideEffects: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  // Private helper methods

  private generateCacheKey(selector: ElementSelector, context?: Document | Element): string {
    return `${selector.strategy}:${selector.selector}:${context ? 'context' : 'document'}`;
  }

  private isCacheExpired(elements: ElementInfo[]): boolean {
    // Simple expiration check - could be enhanced with DOM mutation observation
    return false;
  }

  private getStrategies(selector: ElementSelector): ElementSelector[] {
    const strategies: ElementSelector[] = [selector];
    
    // Add fallback strategies
    if (selector.fallbackSelectors) {
      strategies.push(...selector.fallbackSelectors);
    }

    // Generate automatic fallbacks based on primary strategy
    const fallbacks = this.generateFallbackStrategies(selector);
    strategies.push(...fallbacks);

    return strategies;
  }

  private generateFallbackStrategies(primary: ElementSelector): ElementSelector[] {
    const fallbacks: ElementSelector[] = [];

    switch (primary.strategy) {
      case 'css':
        // If CSS fails, try text-based search
        if (primary.selector.includes('[text=')) {
          fallbacks.push({
            strategy: 'text',
            selector: primary.selector.replace(/\[text="([^"]+)"\]/, '$1'),
            confidence: primary.confidence * 0.8,
          });
        }
        break;
      
      case 'text':
        // If text search fails, try partial text matches
        fallbacks.push({
          strategy: 'text',
          selector: primary.selector,
          confidence: primary.confidence * 0.6,
        });
        break;
    }

    return fallbacks;
  }

  private async executeStrategy(
    strategy: ElementSelector,
    context?: Document | Element
  ): Promise<ElementInfo[]> {
    return await this.executeInBrowserContext((doc) => {
      const searchContext = context || doc;
      let elements: Element[] = [];

      switch (strategy.strategy) {
        case 'css':
          elements = Array.from(searchContext.querySelectorAll(strategy.selector));
          break;
        
        case 'text':
          elements = this.findElementsByText(searchContext, strategy.selector);
          break;
        
        case 'xpath':
          // Note: XPath might not be available in all browser contexts
          try {
            const xpathResult = doc.evaluate(
              strategy.selector,
              searchContext,
              null,
              XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
              null
            );
            for (let i = 0; i < xpathResult.snapshotLength; i++) {
              const element = xpathResult.snapshotItem(i);
              if (element) elements.push(element as Element);
            }
          } catch (error) {
            logger.warn('XPath evaluation failed', { error });
          }
          break;
        
        case 'attribute':
          elements = Array.from(searchContext.querySelectorAll(`[${strategy.selector}]`));
          break;
      }

      return elements.map(element => this.elementToInfo(element));
    });
  }

  private findElementsByText(context: Element | Document, text: string): Element[] {
    const doc = context instanceof Document ? context : context.ownerDocument || document;
    const walker = doc.createTreeWalker(
      context,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node: Node) => {
          return node.textContent && node.textContent.includes(text) 
            ? NodeFilter.FILTER_ACCEPT 
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const elements: Element[] = [];
    let node;

    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.includes(text)) {
        const parent = node.parentElement;
        if (parent && !elements.includes(parent)) {
          elements.push(parent);
        }
      }
    }

    return elements;
  }

  private elementToInfo(element: Element): ElementInfo {
    const rect = element.getBoundingClientRect();
    const boundingBox: BoundingBox = {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };

    const attributes: Record<string, string> = {};
    for (const attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }

    return {
      selector: this.generateUniqueSelector(element),
      tag: element.tagName,
      text: element.textContent?.trim() || '',
      visible: this.isElementVisible(element),
      interactive: this.isElementInteractive(element),
      attributes,
      boundingBox,
    };
  }

  private generateUniqueSelector(element: Element): string {
    if (element.id) {
      return `#${element.id}`;
    }

    const path: string[] = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.tagName.toLowerCase();
      
      if (current.className) {
        selector += '.' + current.className.trim().split(/\s+/).join('.');
      }

      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children);
        const sameTagSiblings = siblings.filter(el => el.tagName === current.tagName);
        
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement!;
    }

    return path.join(' > ');
  }

  private scoreElement(element: ElementInfo, selector: ElementSelector): number {
    let score = selector.confidence || 0.5;

    // Boost score for visible elements
    if (element.visible) score += 0.3;

    // Boost score for interactive elements
    if (element.interactive) score += 0.2;

    // Boost score for exact text matches
    if (selector.strategy === 'text' && element.text === selector.selector) {
      score += 0.4;
    }

    // Penalize hidden or non-interactive elements
    if (!element.visible) score -= 0.5;
    if (!element.interactive) score -= 0.2;

    return Math.max(0, Math.min(1, score));
  }

  private async executeInBrowserContext<T>(callback: (doc: Document) => T): Promise<T> {
    if (typeof chrome !== 'undefined' && chrome.scripting && chrome.scripting.executeScript) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: callback,
        args: [document]
      });

      return results[0]?.result as T;
    } else {
      // Fallback for non-extension context
      return callback(document);
    }
  }

  private isElementClickable(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.pointerEvents !== 'none' &&
      !(element as HTMLInputElement).disabled &&
      !(element as HTMLInputElement).readOnly
    );
  }

  private isElementVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }

  private isElementInteractive(element: Element): boolean {
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION'];
    return interactiveTags.includes(element.tagName) || 
           element.hasAttribute('onclick') ||
           element.hasAttribute('href') ||
           element.getAttribute('role') === 'button' ||
           element.getAttribute('role') === 'link';
  }

  private isInputEditable(element: HTMLInputElement | HTMLElement): boolean {
    const inputElement = element as HTMLInputElement;
    return (
      !inputElement.disabled &&
      !inputElement.readOnly &&
      inputElement.type !== 'hidden' &&
      inputElement.type !== 'submit' &&
      inputElement.type !== 'button' &&
      inputElement.type !== 'reset'
    );
  }

  private scrollIntoView(element: HTMLElement): void {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'center',
    });
  }

  private simulateTyping(element: HTMLInputElement, value: string): void {
    element.value = '';
    
    for (let i = 0; i < value.length; i++) {
      element.value += value[i];
      
      // Trigger input event for each character
      const event = new Event('input', { bubbles: true });
      element.dispatchEvent(event);
      
      // Small delay between keystrokes
      if (i < value.length - 1) {
        // This is a simplified simulation - in real implementation, use actual delays
      }
    }
  }

  // Public utility methods
  clearCache(): void {
    this.cache.clear();
    logger.info('Element selector cache cleared');
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}