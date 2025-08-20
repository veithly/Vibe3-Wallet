/**
 * CDP (Chrome DevTools Protocol) Controller for Vibe3 Wallet
 * Based on nanobrowser's implementation for reliable browser automation
 */

import { createLogger } from '@/utils/logger';

const logger = createLogger('CDPController');

export interface CDPClickOptions {
  selector?: string;
  xpath?: string;
  text?: string;
  timeout?: number;
  scrollIntoView?: boolean;
}

export interface CDPHoverOptions {
  selector?: string;
  xpath?: string;
  duration?: number;
  scrollIntoView?: boolean;
}

export interface CDPScrollOptions {
  direction?: 'up' | 'down';
  amount?: number;
  selector?: string;
  xpath?: string;
}

export interface CDPTypeOptions {
  selector?: string;
  xpath?: string;
  text: string;
  clear?: boolean;
  delay?: number;
}

export interface CDPResult {
  success: boolean;
  error?: string;
  data?: any;
  timing?: number;
}

/**
 * CDP Controller implementing nanobrowser's approach
 * Uses chrome.debugger API for reliable browser automation
 */
export class CDPController {
  private attachedTabs = new Set<number>();
  private debuggerVersion = '1.3';

  constructor() {
    // Listen for tab close events to cleanup
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.detachFromTab(tabId);
    });

    // Keep attachedTabs in sync with real debugger state across SW restarts
    chrome.debugger.onDetach.addListener((source, reason) => {
      if (source?.tabId != null) {
        this.attachedTabs.delete(source.tabId);
        logger.info('CDP detached (event)', { tabId: source.tabId, reason });
      }
    });
  }

  /**
   * Attach debugger to tab (equivalent to nanobrowser's attachPuppeteer)
   */
  async attachToTab(tabId: number): Promise<boolean> {
    try {
      if (this.attachedTabs.has(tabId)) {
        return true;
      }

      // If another debugger is attached, attempt to detach it (likely our previous session)
      try {
        const targets = await chrome.debugger.getTargets?.();
        const target = targets?.find(t => t.tabId === tabId);
        if (target?.attached) {
          // Try detaching in case it's a stale session from this extension
          try { await chrome.debugger.detach({ tabId }); } catch {}
          // Small delay before re-attach
          await new Promise(r => setTimeout(r, 50));
        }
      } catch {}

      await chrome.debugger.attach({ tabId }, this.debuggerVersion);
      this.attachedTabs.add(tabId);

      // Enable required domains
      await this.sendCommand(tabId, 'Runtime.enable');
      await this.sendCommand(tabId, 'DOM.enable');
      await this.sendCommand(tabId, 'Input.enable');
      await this.sendCommand(tabId, 'Page.enable');

      logger.info('CDP attached to tab', { tabId });
      return true;
    } catch (error: any) {
      const message = (error && (error.message || String(error))) || '';
      // If another debugger is attached and we couldn't reclaim it, surface a clear error
      if (message.includes('Another debugger is already attached')) {
        logger.error('Failed to attach: another debugger is attached', { tabId, error });
      } else {
        logger.error('Failed to attach CDP to tab', { tabId, error });
      }
      return false;
    }
  }

  /**
   * Detach debugger from tab
   */
  async detachFromTab(tabId: number): Promise<void> {
    try {
      if (this.attachedTabs.has(tabId)) {
        await chrome.debugger.detach({ tabId });
        this.attachedTabs.delete(tabId);
        logger.info('CDP detached from tab', { tabId });
      }
    } catch (error) {
      logger.warn('Failed to detach CDP from tab', { tabId, error });
    }
  }

  /**
   * Send CDP command to tab
   */
  private async sendCommand(tabId: number, method: string, params?: any): Promise<any> {
    try {
      const result = await chrome.debugger.sendCommand({ tabId }, method, params);
      return result;
    } catch (error) {
      logger.error('CDP command failed', { tabId, method, params, error });
      throw error;
    }
  }

  /**
   * Get element by selector or xpath (safe, avoids quoting issues)
   */
  private async getElement(tabId: number, options: { selector?: string; xpath?: string }): Promise<string> {
    const { selector, xpath } = options;

    // Get document objectId to use callFunctionOn safely
    const docEval = await this.sendCommand(tabId, 'Runtime.evaluate', {
      expression: 'document',
      returnByValue: false
    });
    const documentObjectId = docEval.result.objectId as string;

    if (xpath) {
      const result = await this.sendCommand(tabId, 'Runtime.callFunctionOn', {
        objectId: documentObjectId,
        functionDeclaration: `function(xp){
          const r = this.evaluate(xp, this, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          return r && r.singleNodeValue ? r.singleNodeValue : null;
        }`,
        arguments: [{ value: String(xpath) }],
        returnByValue: false
      });
      if (result.result && result.result.objectId) {
        return result.result.objectId as string;
      }
    } else if (selector) {
      const result = await this.sendCommand(tabId, 'Runtime.callFunctionOn', {
        objectId: documentObjectId,
        functionDeclaration: `function(sel){ return this.querySelector(sel); }`,
        arguments: [{ value: String(selector) }],
        returnByValue: false
      });
      if (result.result && result.result.objectId) {
        return result.result.objectId as string;
      }
    }

    throw new Error('Element not found');
  }

  /**
   * Get element box in viewport coordinates (via getBoundingClientRect)
   */
  private async getElementBox(tabId: number, objectId: string): Promise<{ x: number; y: number; width: number; height: number }> {
    const result = await this.sendCommand(tabId, 'Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `function(){
        const r = this.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      }`,
      returnByValue: true
    });
    if (!result.result?.value) throw new Error('Could not get element rect');
    return result.result.value as any;
  }

  /**
   * Scroll element into view
   */
  private async scrollIntoView(tabId: number, objectId: string): Promise<void> {
    await this.sendCommand(tabId, 'Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `
        function() {
          this.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        }
      `
    });
  }

  /**
   * Wait for element to be stable (not moving)
   */
  private async waitForElementStable(tabId: number, objectId: string, timeout = 1000): Promise<void> {
    const startTime = Date.now();
    let lastBox: any = null;

    while (Date.now() - startTime < timeout) {
      try {
        const currentBox = await this.getElementBox(tabId, objectId);

        if (lastBox &&
            Math.abs(currentBox.x - lastBox.x) < 1 &&
            Math.abs(currentBox.y - lastBox.y) < 1) {
          return; // Element is stable
        }

        lastBox = currentBox;
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        // Element might be moving or not ready
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }

  /**
   * Click element using CDP (nanobrowser approach)
   */
  async clickElement(tabId: number, options: CDPClickOptions): Promise<CDPResult> {
    const startTime = Date.now();

    try {
      // Ensure CDP is attached
      if (!await this.attachToTab(tabId)) {
        throw new Error('Failed to attach CDP to tab');
      }

      // Bring page to front to ensure interaction
      try { await this.sendCommand(tabId, 'Page.bringToFront'); } catch {}

      // Get element
      let objectId = await this.getElement(tabId, options);

      // Refine click target: prefer clickable descendant/ancestor if needed
      try {
        const refine = await this.sendCommand(tabId, 'Runtime.callFunctionOn', {
          objectId,
          functionDeclaration: `function(){
            const isVisible = (el) => {
              const r = el.getBoundingClientRect();
              const s = getComputedStyle(el);
              const inVP = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
              return r.width > 0 && r.height > 0 && inVP && s.visibility !== 'hidden' && s.display !== 'none';
            };
            const isInteractive = (el) => el.matches && el.matches('button, a, input, select, textarea, [role="button"], [role="link"], [onclick], [onmousedown]');
            let el = this;
            if (!isInteractive(el)) {
              const desc = this.querySelector && this.querySelector('button, a, input, select, textarea, [role="button"], [role="link"], [onclick], [onmousedown]');
              if (desc && isVisible(desc)) return desc;
              const anc = this.closest && this.closest('button, a, [role="button"], [role="link"], [onclick], [onmousedown]');
              if (anc && isVisible(anc)) return anc;
            }
            return el;
          }`,
          returnByValue: false
        });
        if (refine?.result?.objectId) {
          objectId = refine.result.objectId as string;
        }
      } catch {}

      // Scroll into view if requested
      if (options.scrollIntoView !== false) {
        await this.scrollIntoView(tabId, objectId);
        await new Promise(resolve => setTimeout(resolve, 80));
        await this.waitForElementStable(tabId, objectId, 400);
      }

      // Get element position
      const box = await this.getElementBox(tabId, objectId);
      let x = box.x + box.width / 2;
      let y = box.y + box.height / 2;

      // Adjust using elementFromPoint and pick top descendant if needed
      const adjustPoint = await this.sendCommand(tabId, 'Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: `function(){
          const el = this;
          const rect = el.getBoundingClientRect();
          let cx = Math.min(Math.max(rect.left + rect.width/2, 1), window.innerWidth-1);
          let cy = Math.min(Math.max(rect.top + rect.height/2, 1), window.innerHeight-1);
          const topEl = document.elementFromPoint(cx, cy);
          // IMPORTANT: Do not return DOM nodes in returnByValue to avoid 'Object reference chain is too long'
          return { cx, cy, matches: !!topEl && (el===topEl || el.contains(topEl)) };
        }`,
        returnByValue: true
      });

      if (adjustPoint?.result?.value) {
        const { cx, cy, matches } = adjustPoint.result.value as any;
        x = cx; y = cy;
        if (!matches) {
          const findDesc = await this.sendCommand(tabId, 'Runtime.callFunctionOn', {
            objectId,
            functionDeclaration: `function(){
              const rect = this.getBoundingClientRect();
              const cx = Math.min(Math.max(rect.left + rect.width/2, 1), window.innerWidth-1);
              const cy = Math.min(Math.max(rect.top + rect.height/2, 1), window.innerHeight-1);
              const top = document.elementFromPoint(cx, cy);
              return (top && this.contains(top)) ? top : this;
            }`,
            returnByValue: false
          });
          if (findDesc?.result?.objectId) {
            const descId = findDesc.result.objectId as string;
            const dbox = await this.getElementBox(tabId, descId);
            x = dbox.x + dbox.width / 2;
            y = dbox.y + dbox.height / 2;
            objectId = descId;
          }
        }
      }

      // Visible and clickable check
      const isVisible = await this.sendCommand(tabId, 'Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: `
          function() {
            const rect = this.getBoundingClientRect();
            const style = window.getComputedStyle(this);
            const inViewport = rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
            return rect.width > 0 && rect.height > 0 && inViewport && style.visibility !== 'hidden' && style.display !== 'none' && !this.disabled;
          }
        `,
        returnByValue: true
      });
      if (!isVisible.result.value) {
        throw new Error('Element is not visible or clickable');
      }

      // Hover then click with buttons flag
      await this.sendCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, pointerType: 'mouse' });
      await this.sendCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, pointerType: 'mouse' });
      await this.sendCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
      await this.sendCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });

      // Focus and programmatic click as safety net
      try {
        await this.sendCommand(tabId, 'Runtime.callFunctionOn', { objectId, functionDeclaration: 'function() { this.focus && this.focus(); }' });
        await this.sendCommand(tabId, 'Runtime.callFunctionOn', { objectId, functionDeclaration: 'function() { this.click && this.click(); }' });
      } catch (fallbackError) {
        logger.warn('Fallback click failed', fallbackError);
      }

      const timing = Date.now() - startTime;
      return { success: true, data: { x, y, timing, method: 'cdp' }, timing };

    } catch (error) {
      const timing = Date.now() - startTime;
      logger.error('CDP click failed', { tabId, error, timing });
      return { success: false, error: error instanceof Error ? error.message : String(error), timing };
    }
  }

  /**
   * Hover over element using CDP
   */
  async hoverElement(tabId: number, options: CDPHoverOptions): Promise<CDPResult> {
    const startTime = Date.now();

    try {
      if (!await this.attachToTab(tabId)) {
        throw new Error('Failed to attach CDP to tab');
      }

      const objectId = await this.getElement(tabId, options);

      if (options.scrollIntoView !== false) {
        await this.scrollIntoView(tabId, objectId);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const box = await this.getElementBox(tabId, objectId);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;

      // Hover sequence
      await this.sendCommand(tabId, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y
      });

      // Maintain hover for duration
      if (options.duration && options.duration > 0) {
        await new Promise(resolve => setTimeout(resolve, options.duration));
      }

      const timing = Date.now() - startTime;
      return {
        success: true,
        data: { x, y, timing },
        timing
      };

    } catch (error) {
      const timing = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timing
      };
    }
  }

  /**
   * Type text into element using CDP
   */
  async typeText(tabId: number, options: CDPTypeOptions): Promise<CDPResult> {
    const startTime = Date.now();

    try {
      if (!await this.attachToTab(tabId)) {
        throw new Error('Failed to attach CDP to tab');
      }

      const objectId = await this.getElement(tabId, options);

      // Focus element
      await this.sendCommand(tabId, 'Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: 'function() { this.focus(); }'
      });

      // Clear if requested
      if (options.clear) {
        await this.sendCommand(tabId, 'Runtime.callFunctionOn', {
          objectId,
          functionDeclaration: 'function() { this.value = ""; this.textContent = ""; }'
        });
      }

      // Type text character by character
      for (const char of options.text) {
        await this.sendCommand(tabId, 'Input.dispatchKeyEvent', {
          type: 'char',
          text: char
        });

        if (options.delay) {
          await new Promise(resolve => setTimeout(resolve, options.delay));
        }
      }

      const timing = Date.now() - startTime;
      return {
        success: true,
        data: { text: options.text, timing },
        timing
      };

    } catch (error) {
      const timing = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timing
      };
    }
  }

  /**
   * Cleanup all attached tabs
   */
  async cleanup(): Promise<void> {
    const tabs = Array.from(this.attachedTabs);
    await Promise.all(tabs.map(tabId => this.detachFromTab(tabId)));
  }
}

// Singleton instance
export const cdpController = new CDPController();
