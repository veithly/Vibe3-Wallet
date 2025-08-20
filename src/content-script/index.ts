import { Message } from '@/utils/message';
import PortMessage from '@/utils/message/portMessage';
import browser from 'webextension-polyfill';

import { EXTENSION_MESSAGES } from '@/constant/message';
import { isManifestV3 } from '@/utils/env';

// Element Selection System
interface ElementHighlight {
  id: string;
  element: HTMLElement;
  selector: string;
  bounds: DOMRect;
  isVisible: boolean;
}

interface ElementSelectorOptions {
  mode: 'highlight' | 'select' | 'analyze';
  filter?: (element: HTMLElement) => boolean;
  onElementSelect?: (element: ElementHighlight) => void;
}

class ElementSelectionSystem {
  private highlights: Map<string, ElementHighlight> = new Map();
  private overlay: HTMLDivElement | null = null;
  private isActive = false;
  private options: ElementSelectorOptions = { mode: 'highlight' };

  constructor() {
    this.createOverlay();
    this.setupEventListeners();
  }

  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.id = 'vibe3-element-selector-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 999999;
      display: none;
    `;
    document.body.appendChild(this.overlay);
  }

  private setupEventListeners(): void {
    document.addEventListener('click', this.handleElementClick.bind(this), true);
    document.addEventListener('mousemove', this.handleMouseMove.bind(this), true);
    document.addEventListener('keydown', this.handleKeyDown.bind(this), true);
  }

  private handleElementClick(event: MouseEvent): void {
    if (!this.isActive || this.options.mode !== 'select') return;

    event.preventDefault();
    event.stopPropagation();

    const element = event.target as HTMLElement;
    if (this.options.filter && !this.options.filter(element)) return;

    const highlight = this.createHighlight(element);
    if (highlight && this.options.onElementSelect) {
      this.options.onElementSelect(highlight);
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.isActive || this.options.mode !== 'select') return;

    const element = event.target as HTMLElement;
    this.previewElement(element);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isActive) return;

    if (event.key === 'Escape') {
      this.deactivate();
    }
  }

  private createHighlight(element: HTMLElement): ElementHighlight | null {
    if (!element || !element.getBoundingClientRect) return null;

    const bounds = element.getBoundingClientRect();
    const selector = this.generateSelector(element);
    const id = `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const highlight: ElementHighlight = {
      id,
      element,
      selector,
      bounds,
      isVisible: this.isElementVisible(element)
    };

    this.highlights.set(id, highlight);
    this.renderHighlight(highlight);

    return highlight;
  }

  private generateSelector(element: HTMLElement): string {
    if (element.id) {
      return `#${element.id}`;
    }

    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        return `.${classes.join('.')}`;
      }
    }

    const tagName = element.tagName.toLowerCase();
    const parent = element.parentElement;

    if (!parent) {
      return tagName;
    }

    const siblings = Array.from(parent.children).filter(child => child.tagName === element.tagName);
    const index = siblings.indexOf(element);

    if (siblings.length > 1) {
      return `${tagName}:nth-child(${index + 1})`;
    }

    return tagName;
  }

  private isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return rect.width > 0 &&
           rect.height > 0 &&
           style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  }

  private renderHighlight(highlight: ElementHighlight): void {
    if (!this.overlay) return;

    const highlightEl = document.createElement('div');
    highlightEl.id = `highlight-${highlight.id}`;
    highlightEl.style.cssText = `
      position: absolute;
      top: ${highlight.bounds.top}px;
      left: ${highlight.bounds.left}px;
      width: ${highlight.bounds.width}px;
      height: ${highlight.bounds.height}px;
      border: 2px solid #3b82f6;
      background: rgba(59, 130, 246, 0.1);
      border-radius: 4px;
      pointer-events: none;
      z-index: 1000000;
      transition: all 0.2s ease;
    `;

    // Add label
    const label = document.createElement('div');
    label.style.cssText = `
      position: absolute;
      top: -25px;
      left: 0;
      background: #3b82f6;
      color: white;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      font-family: monospace;
      white-space: nowrap;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    label.textContent = highlight.selector;
    highlightEl.appendChild(label);

    this.overlay.appendChild(highlightEl);
  }

  private previewElement(element: HTMLElement): void {
    // Remove previous preview
    const existingPreview = this.overlay?.querySelector('.preview-highlight');
    if (existingPreview) {
      existingPreview.remove();
    }

    // Add new preview
    const bounds = element.getBoundingClientRect();
    const preview = document.createElement('div');
    preview.className = 'preview-highlight';
    preview.style.cssText = `
      position: absolute;
      top: ${bounds.top - 2}px;
      left: ${bounds.left - 2}px;
      width: ${bounds.width + 4}px;
      height: ${bounds.height + 4}px;
      border: 2px solid #ef4444;
      background: rgba(239, 68, 68, 0.05);
      border-radius: 4px;
      pointer-events: none;
      z-index: 999999;
      transition: all 0.1s ease;
    `;

    this.overlay?.appendChild(preview);
  }

  public activate(options: ElementSelectorOptions): void {
    this.options = options;
    this.isActive = true;

    if (this.overlay) {
      this.overlay.style.display = 'block';
      this.overlay.style.pointerEvents = options.mode === 'select' ? 'auto' : 'none';
    }

    // Highlight interactive elements if in highlight mode
    if (options.mode === 'highlight') {
      this.highlightInteractiveElements();
    }
  }

  public deactivate(): void {
    this.isActive = false;

    if (this.overlay) {
      this.overlay.style.display = 'none';
      this.overlay.style.pointerEvents = 'none';
      this.overlay.innerHTML = '';
    }

    this.highlights.clear();
  }

  private highlightInteractiveElements(): void {
    const interactiveSelectors = [
      'button', 'input', 'select', 'textarea', 'a[href]',
      '[role="button"]', '[role="link"]', '[role="textbox"]',
      '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])'
    ];

    interactiveSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const htmlElement = element as HTMLElement;
        if (this.isElementVisible(htmlElement)) {
          this.createHighlight(htmlElement);
        }
      });
    });
  }

  /**
   * DeFi-specific element detection
   */
  private detectDeFiElements(): HTMLElement[] {
    const defiElements: HTMLElement[] = [];

    // Wallet connection elements
    const walletConnectionPatterns = [
      'button[class*="connect"]',
      '[class*="wallet-connect"]',
      'button:contains("Connect Wallet")',
      'button:contains("Connect")',
      'button:contains("Link Wallet")',
      '[aria-label*="connect"]',
      '[data-testid*="connect"]',
    ];

    // Token swap elements
    const tokenSwapPatterns = [
      'input[placeholder*="From"]',
      'input[placeholder*="To"]',
      'button[class*="swap"]',
      'button:contains("Swap")',
      '[class*="from"] input',
      '[class*="to"] input',
      '[data-testid*="swap"]',
      'button[class*="token"]',
      '[class*="select-token"]',
    ];

    // Approval elements
    const approvalPatterns = [
      'button:contains("Approve")',
      'button:contains("Enable")',
      'button:contains("Allow")',
      '[class*="approve"]',
      '[data-testid*="approve"]',
    ];

    // Liquidity elements
    const liquidityPatterns = [
      'button:contains("Add Liquidity")',
      'button:contains("Provide")',
      'button:contains("Supply")',
      'button:contains("Remove")',
      'button:contains("Withdraw")',
      '[class*="add-liquidity"]',
      '[class*="remove-liquidity"]',
    ];

    // Staking elements
    const stakingPatterns = [
      'button:contains("Stake")',
      'button:contains("Deposit")',
      'button:contains("Farm")',
      'button:contains("Unstake")',
      'button:contains("Claim")',
      '[class*="stake"]',
      '[class*="unstake"]',
      'span:contains("APY")',
      'span:contains("APR")',
    ];

    // Combine all DeFi patterns
    const allDefiPatterns = [
      ...walletConnectionPatterns,
      ...tokenSwapPatterns,
      ...approvalPatterns,
      ...liquidityPatterns,
      ...stakingPatterns,
    ];

    // Find elements matching DeFi patterns
    allDefiPatterns.forEach(pattern => {
      try {
        if (pattern.includes(':contains(')) {
          // Handle text-based patterns with simplified implementation
          const text = pattern.match(/:contains\("([^"]+)"\)/)?.[1];
          if (text) {
            const elements = Array.from(document.querySelectorAll('button, span, div, a'));
            elements.forEach(element => {
              const htmlElement = element as HTMLElement;
              if (htmlElement.textContent?.includes(text) && this.isElementVisible(htmlElement)) {
                defiElements.push(htmlElement);
              }
            });
          }
        } else {
          // Handle CSS selectors
          const elements = document.querySelectorAll(pattern);
          elements.forEach(element => {
            const htmlElement = element as HTMLElement;
            if (this.isElementVisible(htmlElement)) {
              defiElements.push(htmlElement);
            }
          });
        }
      } catch (error) {
        // Ignore invalid selectors
      }
    });

    return defiElements;
  }

  /**
   * Enhanced element highlighting with DeFi prioritization
   */
  public highlightDeFiElements(): number {
    // Ensure overlay is visible for highlighting
    if (!this.overlay) {
      this.createOverlay();
    }
    if (this.overlay) {
      this.overlay.style.display = 'block';
      this.overlay.style.pointerEvents = 'none';
      // Clear previous highlights before drawing new ones
      this.overlay.innerHTML = '';
    }
    this.highlights.clear();

    const defiElements = this.detectDeFiElements();

    // Highlight DeFi elements with special styling
    defiElements.forEach((element) => {
      const highlight = this.createHighlight(element);
      if (highlight) {
        // Add special DeFi styling
        const highlightElement = this.overlay?.querySelector(`#highlight-${highlight.id}`);
        if (highlightElement) {
          (highlightElement as HTMLElement).style.borderColor = '#10b981'; // Green for DeFi
          (highlightElement as HTMLElement).style.borderWidth = '3px';
        }
      }
    });

    return defiElements.length;
  }

  public getHighlightedElements(): ElementHighlight[] {
    return Array.from(this.highlights.values());
  }

  public clearHighlights(): void {
    this.highlights.clear();
    if (this.overlay) {
      this.overlay.innerHTML = '';
    }
  }

  public destroy(): void {
    this.deactivate();
    this.overlay?.remove();
  }

  /**
   * Analyze a specific element by selector
   */
  public analyzeElement(selector: string): any {
    try {
      const element = document.querySelector(selector);
      if (!element) {
        return { error: 'Element not found' };
      }

      const htmlElement = element as HTMLElement;
      const bounds = htmlElement.getBoundingClientRect();
      const style = window.getComputedStyle(htmlElement);

      return {
        selector,
        element: {
          tagName: htmlElement.tagName.toLowerCase(),
          textContent: htmlElement.textContent?.substring(0, 200),
          attributes: this.getElementAttributes(htmlElement),
          accessibility: {
            ariaLabel: htmlElement.getAttribute('aria-label'),
            ariaRole: htmlElement.getAttribute('role'),
            tabIndex: htmlElement.tabIndex,
            visible: this.isElementVisible(htmlElement),
            enabled: !(htmlElement as HTMLButtonElement | HTMLInputElement).disabled,
          },
          styles: {
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            zIndex: style.zIndex,
          },
          bounds: {
            top: bounds.top,
            left: bounds.left,
            width: bounds.width,
            height: bounds.height,
          },
        },
        success: true,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Find elements by text content
   */
  public findElementsByText(text: string, options: any = {}): any {
    try {
      const {
        elementType = '',
        caseSensitive = false,
        visibleOnly = true,
      } = options;

      const searchRegex = caseSensitive
        ? new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
        : new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

      const elements = document.querySelectorAll(elementType || '*');
      const matches: any[] = [];

      elements.forEach((element) => {
        const htmlElement = element as HTMLElement;
        const textContent = htmlElement.textContent || '';

        if (searchRegex.test(textContent) && (!visibleOnly || this.isElementVisible(htmlElement))) {
          const bounds = htmlElement.getBoundingClientRect();
          matches.push({
            selector: this.generateSelector(htmlElement),
            element: {
              tagName: htmlElement.tagName.toLowerCase(),
              textContent: textContent.substring(0, 100),
              attributes: this.getElementAttributes(htmlElement),
            },
            bounds: {
              top: bounds.top,
              left: bounds.left,
              width: bounds.width,
              height: bounds.height,
            },
            visible: this.isElementVisible(htmlElement),
          });
        }
      });

      return { elements: matches, success: true };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get all interactive elements on the page
   */
  public getInteractiveElements(options: any = {}): any {
    try {
      const {
        elementType = '',
        textFilter = '',
        includeAttributes = false,
        includeAll = false,
        includeHidden = false,
      } = options;

      // Decide which selectors to use
      const selectors = includeAll
        ? ['*']
        : (elementType
            ? [elementType]
            : [
                'button', 'input', 'select', 'textarea', 'a[href]',
                '[role="button"]', '[role="link"]', '[role="textbox"]',
                '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])'
              ]);

      const elements: HTMLElement[] = [];
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => elements.push(el as HTMLElement));
      });

      const filtered = elements
        .filter(el => includeHidden ? true : this.isElementVisible(el))
        .filter(el => !textFilter || (el.textContent || '').toLowerCase().includes(textFilter.toLowerCase()))
        // Avoid overlay/debug containers if any
        .filter(el => !(el.id && /^vibe3-(overlay|debug)/i.test(el.id)));

      const interactiveElements = filtered.map(el => {
        const bounds = el.getBoundingClientRect();
        return {
          selector: this.generateSelector(el),
          element: {
            tagName: el.tagName.toLowerCase(),
            textContent: el.textContent?.substring(0, 200),
            ...(includeAttributes && { attributes: this.getElementAttributes(el) }),
          },
          bounds: {
            top: bounds.top,
            left: bounds.left,
            width: bounds.width,
            height: bounds.height,
          },
          visible: this.isElementVisible(el),
        };
      });

      return { elements: interactiveElements, success: true };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Highlight a specific element
   */
  public highlightElement(selector: string, options: any = {}): any {
    try {
      const element = document.querySelector(selector);
      if (!element) {
        return { error: 'Element not found' };
      }

      const { color = 'blue', duration = 0 } = options;
      const htmlElement = element as HTMLElement;

      // Create temporary highlight
      const bounds = htmlElement.getBoundingClientRect();
      const highlight = document.createElement('div');
      const colorMap = {
        red: '#ef4444',
        blue: '#3b82f6',
        green: '#10b981',
        yellow: '#f59e0b',
        purple: '#8b5cf6',
      };

      highlight.style.cssText = `
        position: fixed;
        top: ${bounds.top}px;
        left: ${bounds.left}px;
        width: ${bounds.width}px;
        height: ${bounds.height}px;
        border: 3px solid ${colorMap[color as keyof typeof colorMap] || colorMap.blue};
        background: rgba(59, 130, 246, 0.1);
        border-radius: 4px;
        pointer-events: none;
        z-index: 1000001;
        transition: all 0.3s ease;
      `;

      document.body.appendChild(highlight);

      // Auto-remove if duration is specified
      if (duration > 0) {
        setTimeout(() => {
          highlight.remove();
        }, duration);
      }

      return {
        success: true,
        highlightId: `highlight-${Date.now()}`,
        bounds: {
          top: bounds.top,
          left: bounds.left,
          width: bounds.width,
          height: bounds.height,
        },
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Capture element screenshot (simplified implementation)
   */
  public captureElementScreenshot(selector: string): any {
    try {
      const element = document.querySelector(selector);
      if (!element) {
        return { error: 'Element not found' };
      }

      const htmlElement = element as HTMLElement;
      const bounds = htmlElement.getBoundingClientRect();

      // In a real implementation, this would use chrome.tabs.captureVisibleTab
      // For now, return element information for screenshot capture
      return {
        success: true,
        selector,
        bounds: {
          top: bounds.top,
          left: bounds.left,
          width: bounds.width,
          height: bounds.height,
        },
        message: 'Screenshot capture requires additional permissions',
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get element attributes as a dictionary
   */
  private getElementAttributes(element: HTMLElement): Record<string, string> {
    const attributes: Record<string, string> = {};
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attributes[attr.name] = attr.value;
    }
    return attributes;
  }
}

// Initialize element selection system
const elementSelector = new ElementSelectionSystem();

// Handle element selection messages from background
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    return Promise.resolve({ success: true, type: 'PONG', timestamp: Date.now() });
  }


  if (message.type === 'ELEMENT_HIGHLIGHT') {
    try {
      const rawKind = message.params?.interactiveOnly;
      const kind = typeof rawKind === 'string' ? rawKind.toLowerCase() : (rawKind === false ? 'all' : 'clickable');
      const limit = Math.max(1, Math.min(500, Number(message.params?.limit) || (kind === 'clickable' || kind === 'button' || kind === 'input' ? 100 : 200)));
      const overlayId = 'vibe3-debug-overlay';
      let overlay = document.getElementById(overlayId) as HTMLElement | null;
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayId;
        Object.assign((overlay as HTMLElement).style, {
          position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647'
        });
        document.documentElement.appendChild(overlay as unknown as Node);
      }
      (overlay as HTMLElement).innerHTML = '';

      // Collect elements
      const visible = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r && r.width > 0 && r.height > 0;
      };

      let candidates: Element[] = [];
      const selector = message.params?.selector as string | undefined;
      if (selector) {
        const el = document.querySelector(selector);
        if (el) candidates = [el];
      } else {
        const allEls: Element[] = Array.prototype.slice.call(document.querySelectorAll('*'));
        const selectorMap: Record<string, string> = {
          button: 'button, [role="button"], input[type="button"], input[type="submit"]',
          clickable: 'button, [role="button"], input[type="button"], input[type="submit"], a[href], [role="link"]',
          input: 'input, textarea, select, [contenteditable="true"], [role="textbox"]',
          link: 'a[href], [role="link"]',
          all: '*',
        };
        const sel = selectorMap[kind] || '*';
        candidates = sel === '*'
          ? allEls
          : Array.prototype.slice.call(document.querySelectorAll(sel));
      }

      const filteredAll = candidates.filter(visible);
      let filtered = filteredAll.slice(0, limit);

      // Note: Removed auto-scroll logic - LLM should explicitly use scrollPage tool if needed

      // Draw wireframe with index labels
      filtered.forEach((el, idx) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const box = document.createElement('div');
        Object.assign(box.style, {
          position: 'absolute', top: `${Math.max(0, r.top)}px`, left: `${Math.max(0, r.left)}px`,
          width: `${r.width}px`, height: `${r.height}px`, border: '2px solid #22d3ee', boxSizing: 'border-box'
        });
        const tag = document.createElement('div');
        tag.textContent = String(idx + 1);
        Object.assign(tag.style, {
          position: 'absolute', top: `${Math.max(0, r.top - 14)}px`, left: `${Math.max(0, r.left)}px`,
          fontSize: '10px', lineHeight: '12px', padding: '0 4px', color: '#000', background: '#22d3ee', borderRadius: '3px', pointerEvents: 'none'
        });
        (overlay as HTMLElement).appendChild(box);
        (overlay as HTMLElement).appendChild(tag);
      });

      // Return the indexed elements minimal info so Agent can choose later
      const elements = filtered.map((el, idx) => ({
        index: idx + 1,
        selector: (() => {
          let node: Element | null = el; const parts: string[] = [];
          while (node && node.nodeType === 1 && parts.length < 5) {
            let part = node.tagName.toLowerCase();
            const id = (node as HTMLElement).id; if (id) { parts.unshift(`#${id}`); break; }
            const siblings = Array.prototype.slice.call(node.parentElement?.children || []);
            const nth = siblings.indexOf(node) + 1; parts.unshift(`${part}:nth-child(${nth})`); node = node.parentElement;
          }
          return parts.join(' > ');
        })(),
        tag: (el as HTMLElement).tagName.toLowerCase(),
        text: ((el.textContent || '').trim().slice(0, 120)),
        ariaLabel: (el.getAttribute('aria-label') || ''),
        title: ((el as HTMLElement).title || ''),
        role: (el.getAttribute('role') || ''),
        hasSvg: !!el.querySelector('svg'),
        hasImgAlt: !!el.querySelector('img[alt]'),
        imgAlt: (el.querySelector('img[alt]')?.getAttribute('alt') || ''),
      }));

      return Promise.resolve({ success: true, data: { elements } });
    } catch (e) {
      return Promise.resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  } else if (message.type === 'ELEMENT_SCREENSHOT') {
    const result = elementSelector.captureElementScreenshot(message.params.selector);
    return Promise.resolve({ success: true, data: result });
  } else if (message.type === 'ELEMENT_HIGHLIGHT_DEFIELEMENTS') {

  } else if (message.type === 'ELEMENT_CLICK_SELECTOR') {
    try {
      const sel = message.params?.selector;
      const el = sel ? document.querySelector(sel) as HTMLElement | null : null;
      if (!el) return Promise.resolve({ success: false, error: 'Element not found' });
      (el as any).focus?.();
      el.click();
      return Promise.resolve({ success: true });
    } catch (e) {
      return Promise.resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  } else if (message.type === 'ELEMENT_INPUT_SELECTOR') {
    try {
      const sel = message.params?.selector;
      const value = message.params?.value ?? '';
      const el = sel ? document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null : null;
      if (!el) return Promise.resolve({ success: false, error: 'Element not found' });
      (el as any).focus?.();
      (el as any).value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return Promise.resolve({ success: true });
    } catch (e) {
      return Promise.resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  } else if (message.type === 'ELEMENT_SCROLL_SELECTOR') {
    try {
      const sel = message.params?.selector;
      const el = sel ? document.querySelector(sel) as HTMLElement | null : null;
      if (!el) return Promise.resolve({ success: false, error: 'Element not found' });
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      return Promise.resolve({ success: true });
    } catch (e) {
      return Promise.resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  } else if (message.type === 'ELEMENT_SELECTOR_ACTIVATE') {
    try {
      const mode = message.options?.mode || 'highlight';
      const overlayId = 'vibe3-debug-overlay';
      let overlay = document.getElementById(overlayId) as HTMLElement | null;
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayId;
        Object.assign((overlay as HTMLElement).style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647' });
        document.documentElement.appendChild(overlay as unknown as Node);
      }
      return Promise.resolve({ success: true, data: { mode } });
    } catch (e) {
      return Promise.resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  } else if (message.type === 'ELEMENT_SELECTOR_CLEAR') {
    try {
      const overlayId = 'vibe3-debug-overlay';
      const overlay = document.getElementById(overlayId) as HTMLElement | null;
      if (overlay) overlay.innerHTML = '';
      return Promise.resolve({ success: true });
    } catch (e) {
      return Promise.resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  } else if (message.type === 'ELEMENT_SELECTOR_GET_HIGHLIGHTS') {
    try {
      const overlayId = 'vibe3-debug-overlay';
      const overlay = document.getElementById(overlayId) as HTMLElement | null;
      // We do not persist the list in DOM; return last scan candidates if we have them.
      // For now, return an empty set with success, panel uses its own state.
      return Promise.resolve({ success: true, data: { elements: [] } });
    } catch (e) {
      return Promise.resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  } else if (message.type === 'ELEMENT_ANALYZE') {
    try {
      const sel = message.params?.selector;
      const el = sel ? document.querySelector(sel) as HTMLElement | null : null;
      if (!el) return Promise.resolve({ success: false, error: 'Element not found' });
      const rect = el.getBoundingClientRect();
      const info = {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 200),
        aria: el.getAttribute('aria-label') || '',
        title: el.title || '',
        role: el.getAttribute('role') || '',
        bounds: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      };
      return Promise.resolve({ success: true, data: info });
    } catch (e) {
      return Promise.resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  } else if (message.type === 'ELEMENT_DEBUG_SCAN_AND_LOG') {
    try {
      // Activate highlight mode and clear previous overlay
      elementSelector.activate({ mode: 'highlight' });
      const opts = message.params?.options || {};
      const result = elementSelector.getInteractiveElements(opts);
      // Log in page (visible in page console)
      // eslint-disable-next-line no-console
      console.info('[ElementSelector][Page] Scan:', {
        url: location.href,
        title: document.title,
        count: result?.elements?.length || 0,
        elements: result?.elements || [],
      });
      return Promise.resolve({ success: true, data: result });
    } catch (e) {
      return Promise.resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  } else if (message.type === 'ELEMENT_DEBUG_PAGE_LOG') {
    try {
      const payload = message.params?.payload ?? message.payload ?? message.message ?? 'No payload';
      // eslint-disable-next-line no-console
      console.info('[ElementSelector][Page][Log]:', payload);
      return Promise.resolve({ success: true });
    } catch (e) {
      return Promise.resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  } else if (message.type === 'ELEMENT_HIGHLIGHT_ELEMENTS') {
    try {
      const items = (message.params?.items || []) as Array<{ selector: string; type?: string; label?: string }>;
      const overlayId = 'vibe3-debug-overlay';
      let overlay = document.getElementById(overlayId) as HTMLElement | null;
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayId;
        Object.assign((overlay as HTMLElement).style, {
          position: 'fixed',
          inset: '0',
          pointerEvents: 'none',
          zIndex: '2147483647',
        });
        document.documentElement.appendChild(overlay as unknown as Node);
      }
      (overlay as HTMLElement).innerHTML = '';

      const colorMap: Record<string, string> = {
        button: '#10b981', // emerald
        input: '#3b82f6',  // blue
        textarea: '#f97316', // orange
        select: '#f59e0b',  // amber
        a: '#8b5cf6',       // violet
        default: '#6b7280', // gray
      };

      const toType = (el: Element | null, t?: string) => (t ? t.toLowerCase() : (el?.tagName.toLowerCase() || 'default'));
      const toLabel = (type: string, fallback?: string) => {
        switch (type) {
          case 'button': return 'BTN';
          case 'input': return 'INP';
          case 'textarea': return 'TXT';
          case 'select': return 'SEL';
          case 'a': return 'A';
          default: return fallback || 'EL';
        }
      };

      items.forEach((it) => {
        const el = document.querySelector(it.selector) as HTMLElement | null;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const type = toType(el, it.type);
        const color = colorMap[type] || colorMap.default;
        const label = it.label || toLabel(type);

        const box = document.createElement('div');
        Object.assign(box.style, {
          position: 'absolute',
          top: `${Math.max(0, rect.top)}px`,
          left: `${Math.max(0, rect.left)}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          border: `2px solid ${color}`,
          boxSizing: 'border-box',
          background: 'transparent',
        });
        const tag = document.createElement('div');
        tag.textContent = label;
        Object.assign(tag.style, {
          position: 'absolute',
          top: `${Math.max(0, rect.top - 14)}px`,
          left: `${Math.max(0, rect.left)}px`,
          fontSize: '10px',
          lineHeight: '12px',
          padding: '0 4px',
          color: '#fff',
          background: color,
          borderRadius: '3px',
          pointerEvents: 'none',
        });
        overlay!.appendChild(box);
        overlay!.appendChild(tag);
      });

      return Promise.resolve({ success: true });
    } catch (e) {
      return Promise.resolve({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return undefined;
});

const createDefer = <T>() => {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: any) => void) | undefined;

  const promise: Promise<T> = new Promise(function (_resolve, _reject) {
    resolve = _resolve;
    reject = _reject;
  });

  return {
    promise,
    resolve,
    reject,
  };
};

const injectProviderScript = (isDefaultWallet: boolean) => {
  // the script element with src won't execute immediately
  // use inline script element instead!
  const container = document.head || document.documentElement;
  const ele = document.createElement('script');
  // in prevent of webpack optimized code do some magic(e.g. double/sigle quote wrap),
  // separate content assignment to two line
  // use AssetReplacePlugin to replace pageprovider content
  ele.setAttribute('src', browser.runtime.getURL('pageProvider.js'));
  container.insertBefore(ele, container.children[0]);
  container.removeChild(ele);
};

const { BroadcastChannelMessage } = Message;

let pm: PortMessage | null;
let defer = createDefer<PortMessage>();

const bcm = new BroadcastChannelMessage({
  name: 'rabby-content-script',
  target: 'rabby-page-provider',
}).listen((data) => {
  browser.runtime.sendMessage({ type: 'ping' });
  if (pm) {
    return pm?.request(data);
  }
  return defer.promise.then((pm) => pm?.request(data));
});

// background notification

document.addEventListener('beforeunload', () => {
  bcm.dispose();
  pm?.dispose();
});

const handlePmMessage = (data) => bcm.send('message', data);

const onDisconnectDestroyStreams = (err) => {
  pm?.port?.onDisconnect.removeListener(onDisconnectDestroyStreams);
  pm?.off('message', handlePmMessage);

  pm?.dispose();
  pm = null;
  defer = createDefer<PortMessage>();
};

const setupExtensionStreams = () => {
  pm = new PortMessage().connect();
  pm?.on('message', handlePmMessage);
  defer.resolve?.(pm);
  pm?.port?.onDisconnect.addListener(onDisconnectDestroyStreams);
  bcm.send('message', { event: 'contentScriptConnected' });
};

setupExtensionStreams();

const onMessageSetUpExtensionStreams = (msg) => {
  if (msg.name === EXTENSION_MESSAGES.READY) {
    if (!pm) {
      setupExtensionStreams();
    }
    return Promise.resolve(`Rabby: handled ${EXTENSION_MESSAGES.READY}`);
  }
  return undefined;
};
browser.runtime.onMessage.addListener(onMessageSetUpExtensionStreams);

// if (!isManifestV3) {
//   injectProviderScript(false);
// }
