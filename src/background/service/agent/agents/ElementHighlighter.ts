import { createLogger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { AgentConfigManager } from './schemas/AgentConfig';
import { AgentCapability, AgentStatus, SelectedElement, AgentError } from './AgentTypes';

const logger = createLogger('ElementHighlighter');

// Highlight colors for different element types (similar to nanobrowser)
const HIGHLIGHT_COLORS = [
  '#FF6B6B', // Red for buttons
  '#4ECDC4', // Teal for links
  '#45B7D1', // Blue for inputs
  '#96CEB4', // Green for selects
  '#FFEAA7', // Yellow for textareas
  '#DDA0DD', // Plum for interactive elements
  '#98D8C8', // Mint for clickable elements
  '#F7DC6F', // Gold for important elements
];

export interface HighlightBox {
  id: string;
  element: ElementInfo;
  color: string;
  label: string;
  isVisible: boolean;
  overlays: HTMLElement[];
  labelElement?: HTMLElement;
}

export interface ElementInfo {
  index: number;
  tagName: string;
  attributes: Record<string, string>;
  text: string;
  isVisible: boolean;
  isClickable: boolean;
  isInteractive: boolean;
  xpath: string;
  cssSelector: string;
  boundingRect?: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  children: number;
  depth: number;
}

export interface HighlightOptions {
  showLabels?: boolean;
  coloredBoxes?: boolean;
  duration?: number;
  focusIndex?: number;
  zIndex?: string;
  opacity?: number;
}

// Enhanced element highlighter with nanobrowser-style capabilities
export class ElementHighlighter {
  private highlightCache: Map<number, HighlightBox[]> = new Map();
  private config: AgentConfigManager;
  private containerId = 'vibe3-highlight-container';
  private isActive = false;

  constructor(config?: AgentConfigManager) {
    this.config = config || new AgentConfigManager('development');
  }

  /**
   * Initialize highlighting system for a tab
   */
  async initializeHighlighting(tabId: number): Promise<boolean> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: this.initializeHighlightContainer,
        args: [this.containerId],
      });

      this.isActive = true;
      logger.info('Highlighting system initialized', { tabId });
      return true;

    } catch (error) {
      logger.error('Failed to initialize highlighting', { tabId, error });
      return false;
    }
  }

  /**
   * Highlight multiple elements with colored boxes and labels
   */
  async highlightElements(
    tabId: number,
    elements: ElementInfo[],
    options: HighlightOptions = {}
  ): Promise<boolean> {
    try {
      if (!this.isActive) {
        await this.initializeHighlighting(tabId);
      }

      const highlightOptions = {
        showLabels: true,
        coloredBoxes: true,
        duration: 0, // Permanent until removed
        zIndex: '2147483647',
        opacity: 0.3,
        ...options,
      };

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: this.createColoredHighlights,
        args: [elements, highlightOptions, this.containerId],
      });

      const success = results[0]?.result?.success || false;
      
      if (success) {
        // Cache highlight information
        this.highlightCache.set(tabId, elements.map((element, index) => ({
          id: `${this.containerId}-${index}`,
          element,
          color: this.getElementColor(element, index),
          label: index.toString(),
          isVisible: true,
          overlays: [],
        })));
      }

      logger.info('Highlighted elements with colored boxes', {
        tabId,
        count: elements.length,
        options: highlightOptions,
        success,
      });

      return success;

    } catch (error) {
      logger.error('Failed to highlight elements', { tabId, error });
      return false;
    }
  }

  /**
   * Focus on a specific element with enhanced highlighting
   */
  async focusElement(
    tabId: number,
    elementIndex: number,
    elements: ElementInfo[],
    options: HighlightOptions = {}
  ): Promise<boolean> {
    try {
      const element = elements[elementIndex];
      if (!element) {
        logger.warn('Element not found for focusing', { elementIndex });
        return false;
      }

      const focusOptions = {
        showLabels: true,
        coloredBoxes: true,
        focusIndex: elementIndex,
        zIndex: '2147483648', // Higher than normal highlights
        opacity: 0.5,
        ...options,
      };

      // First highlight all elements normally
      await this.highlightElements(tabId, elements, { ...focusOptions, focusIndex: -1 });

      // Then add focus highlighting for the specific element
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: this.createFocusHighlight,
        args: [element, focusOptions, this.containerId],
      });

      const success = results[0]?.result?.success || false;
      
      logger.info('Focused element with enhanced highlight', {
        tabId,
        elementIndex,
        tagName: element.tagName,
        success,
      });

      return success;

    } catch (error) {
      logger.error('Failed to focus element', { tabId, elementIndex, error });
      return false;
    }
  }

  /**
   * Remove all highlights from a tab
   */
  async removeHighlights(tabId: number): Promise<boolean> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: this.removeHighlightContainer,
        args: [this.containerId],
      });

      this.highlightCache.delete(tabId);
      this.isActive = false;

      logger.info('Removed all highlights', { tabId });
      return true;

    } catch (error) {
      logger.error('Failed to remove highlights', { tabId, error });
      return false;
    }
  }

  /**
   * Show/hide highlights without removing them
   */
  async toggleHighlights(tabId: number, visible: boolean): Promise<boolean> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: this.toggleHighlightVisibility,
        args: [this.containerId, visible],
      });

      // Update cache
      const cached = this.highlightCache.get(tabId);
      if (cached) {
        cached.forEach(box => box.isVisible = visible);
      }

      logger.info('Toggled highlight visibility', { tabId, visible });
      return true;

    } catch (error) {
      logger.error('Failed to toggle highlights', { tabId, visible, error });
      return false;
    }
  }

  /**
   * Get current highlight information
   */
  getHighlightInfo(tabId: number): HighlightBox[] {
    return this.highlightCache.get(tabId) || [];
  }

  /**
   * Click element with visual feedback
   */
  async clickElementWithFeedback(
    tabId: number,
    element: ElementInfo,
    elements: ElementInfo[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // First, focus the element
      await this.focusElement(tabId, element.index, elements);

      // Add click animation
      await chrome.scripting.executeScript({
        target: { tabId },
        func: this.animateClick,
        args: [element, this.containerId],
      });

      // Perform the actual click
      const clickResults = await chrome.scripting.executeScript({
        target: { tabId },
        func: this.clickElementInPage,
        args: [element],
      });

      const clickSuccess = clickResults[0]?.result?.success || false;

      logger.info('Element clicked with visual feedback', {
        tabId,
        elementIndex: element.index,
        tagName: element.tagName,
        success: clickSuccess,
      });

      return {
        success: clickSuccess,
        error: clickSuccess ? undefined : 'Click operation failed',
      };

    } catch (error) {
      logger.error('Failed to click element with feedback', { tabId, element, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Input text with visual feedback
   */
  async inputTextWithFeedback(
    tabId: number,
    element: ElementInfo,
    text: string,
    elements: ElementInfo[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // First, focus the element
      await this.focusElement(tabId, element.index, elements);

      // Add input animation
      await chrome.scripting.executeScript({
        target: { tabId },
        func: this.animateInput,
        args: [element, this.containerId],
      });

      // Perform the actual input
      const inputResults = await chrome.scripting.executeScript({
        target: { tabId },
        func: this.inputTextInPage,
        args: [element, text],
      });

      const inputSuccess = inputResults[0]?.result?.success || false;

      logger.info('Text input with visual feedback', {
        tabId,
        elementIndex: element.index,
        textLength: text.length,
        success: inputSuccess,
      });

      return {
        success: inputSuccess,
        error: inputSuccess ? undefined : 'Input operation failed',
      };

    } catch (error) {
      logger.error('Failed to input text with feedback', { tabId, element, text, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Private helper methods

  private getElementColor(element: ElementInfo, index: number): string {
    // Assign colors based on element type
    const tagName = element.tagName.toLowerCase();
    
    if (tagName === 'button') return HIGHLIGHT_COLORS[0];
    if (tagName === 'a') return HIGHLIGHT_COLORS[1];
    if (tagName === 'input') return HIGHLIGHT_COLORS[2];
    if (tagName === 'select') return HIGHLIGHT_COLORS[3];
    if (tagName === 'textarea') return HIGHLIGHT_COLORS[4];
    
    // Cycle through colors for other elements
    return HIGHLIGHT_COLORS[index % HIGHLIGHT_COLORS.length];
  }

  // Browser script execution functions

  private initializeHighlightContainer(containerId: string): void {
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.position = 'fixed';
      container.style.pointerEvents = 'none';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.zIndex = '2147483647';
      container.style.backgroundColor = 'transparent';
      document.body.appendChild(container);
    }
  }

  private createColoredHighlights(
    elements: ElementInfo[],
    options: HighlightOptions,
    containerId: string
  ): { success: boolean; highlightedCount: number } {
    try {
      const container = document.getElementById(containerId);
      if (!container) return { success: false, highlightedCount: 0 };

      // Clear existing highlights
      container.innerHTML = '';

      let highlightedCount = 0;

      elements.forEach((element, index) => {
        if (!element.boundingRect) return;

        const color = this.getElementColor(element, index);
        const overlays: HTMLElement[] = [];

        // Create highlight overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.border = `2px solid ${color}`;
        overlay.style.backgroundColor = color + '1A'; // 10% opacity
        overlay.style.pointerEvents = 'none';
        overlay.style.boxSizing = 'border-box';
        overlay.style.zIndex = options.zIndex || '2147483647';
        
        overlay.style.top = `${element.boundingRect.top}px`;
        overlay.style.left = `${element.boundingRect.left}px`;
        overlay.style.width = `${element.boundingRect.width}px`;
        overlay.style.height = `${element.boundingRect.height}px`;

        // Add focus effect if this is the focused element
        if (options.focusIndex === index) {
          overlay.style.borderWidth = '4px';
          overlay.style.boxShadow = `0 0 10px ${color}`;
        }

        container.appendChild(overlay);
        overlays.push(overlay);

        // Create label if requested
        if (options.showLabels) {
          const label = document.createElement('div');
          label.style.position = 'fixed';
          label.style.background = color;
          label.style.color = 'white';
          label.style.padding = '2px 6px';
          label.style.borderRadius = '4px';
          label.style.fontSize = '12px';
          label.style.fontWeight = 'bold';
          label.style.zIndex = (parseInt(options.zIndex || '2147483647') + 1).toString();
          label.textContent = index.toString();
          
          // Position label in top-right corner of element
          const labelTop = Math.max(0, element.boundingRect.top - 20);
          const labelLeft = element.boundingRect.left;
          label.style.top = `${labelTop}px`;
          label.style.left = `${labelLeft}px`;

          container.appendChild(label);
          overlays.push(label);
        }

        highlightedCount++;
      });

      return { success: true, highlightedCount };
    } catch (error) {
      console.error('Failed to create colored highlights:', error);
      return { success: false, highlightedCount: 0 };
    }
  }

  private createFocusHighlight(
    element: ElementInfo,
    options: HighlightOptions,
    containerId: string
  ): { success: boolean } {
    try {
      const container = document.getElementById(containerId);
      if (!container || !element.boundingRect) return { success: false };

      const color = this.getElementColor(element, element.index);
      
      // Create pulsing focus effect
      const focusOverlay = document.createElement('div');
      focusOverlay.style.position = 'fixed';
      focusOverlay.style.border = `3px solid ${color}`;
      focusOverlay.style.backgroundColor = 'transparent';
      focusOverlay.style.pointerEvents = 'none';
      focusOverlay.style.boxSizing = 'border-box';
      focusOverlay.style.zIndex = (parseInt(options.zIndex || '2147483647') + 2).toString();
      focusOverlay.style.animation = 'vibe3-pulse 1s infinite';
      
      focusOverlay.style.top = `${element.boundingRect.top - 2}px`;
      focusOverlay.style.left = `${element.boundingRect.left - 2}px`;
      focusOverlay.style.width = `${element.boundingRect.width + 4}px`;
      focusOverlay.style.height = `${element.boundingRect.height + 4}px`;

      // Add CSS animation if not already added
      if (!document.getElementById('vibe3-highlight-styles')) {
        const style = document.createElement('style');
        style.id = 'vibe3-highlight-styles';
        style.textContent = `
          @keyframes vibe3-pulse {
            0% { box-shadow: 0 0 0 0 ${color}66; }
            50% { box-shadow: 0 0 0 8px ${color}00; }
            100% { box-shadow: 0 0 0 0 ${color}00; }
          }
        `;
        document.head.appendChild(style);
      }

      container.appendChild(focusOverlay);
      return { success: true };
    } catch (error) {
      console.error('Failed to create focus highlight:', error);
      return { success: false };
    }
  }

  private animateClick(element: ElementInfo, containerId: string): void {
    try {
      const container = document.getElementById(containerId);
      if (!container || !element.boundingRect) return;

      // Create click ripple effect
      const ripple = document.createElement('div');
      ripple.style.position = 'fixed';
      ripple.style.border = '2px solid #FF6B6B';
      ripple.style.borderRadius = '50%';
      ripple.style.pointerEvents = 'none';
      ripple.style.zIndex = '2147483649';
      ripple.style.animation = 'vibe3-ripple 0.6s ease-out';
      
      const centerX = element.boundingRect.left + element.boundingRect.width / 2;
      const centerY = element.boundingRect.top + element.boundingRect.height / 2;
      
      ripple.style.left = `${centerX - 10}px`;
      ripple.style.top = `${centerY - 10}px`;
      ripple.style.width = '20px';
      ripple.style.height = '20px';

      // Add ripple animation
      if (!document.getElementById('vibe3-ripple-styles')) {
        const style = document.createElement('style');
        style.id = 'vibe3-ripple-styles';
        style.textContent = `
          @keyframes vibe3-ripple {
            0% { transform: scale(1); opacity: 1; }
            100% { transform: scale(3); opacity: 0; }
          }
        `;
        document.head.appendChild(style);
      }

      container.appendChild(ripple);

      // Remove ripple after animation
      setTimeout(() => {
        if (ripple.parentNode) {
          ripple.parentNode.removeChild(ripple);
        }
      }, 600);
    } catch (error) {
      console.error('Failed to animate click:', error);
    }
  }

  private animateInput(element: ElementInfo, containerId: string): void {
    try {
      const container = document.getElementById(containerId);
      if (!container || !element.boundingRect) return;

      // Create input glow effect
      const glow = document.createElement('div');
      glow.style.position = 'fixed';
      glow.style.border = `2px solid #45B7D1`;
      glow.style.backgroundColor = '#45B7D11A';
      glow.style.pointerEvents = 'none';
      glow.style.boxSizing = 'border-box';
      glow.style.zIndex = '2147483648';
      glow.style.animation = 'vibe3-glow 0.8s ease-in-out';
      
      glow.style.top = `${element.boundingRect.top}px`;
      glow.style.left = `${element.boundingRect.left}px`;
      glow.style.width = `${element.boundingRect.width}px`;
      glow.style.height = `${element.boundingRect.height}px`;

      // Add glow animation
      if (!document.getElementById('vibe3-glow-styles')) {
        const style = document.createElement('style');
        style.id = 'vibe3-glow-styles';
        style.textContent = `
          @keyframes vibe3-glow {
            0%, 100% { box-shadow: 0 0 5px #45B7D1; }
            50% { box-shadow: 0 0 20px #45B7D1, 0 0 30px #45B7D1; }
          }
        `;
        document.head.appendChild(style);
      }

      container.appendChild(glow);

      // Remove glow after animation
      setTimeout(() => {
        if (glow.parentNode) {
          glow.parentNode.removeChild(glow);
        }
      }, 800);
    } catch (error) {
      console.error('Failed to animate input:', error);
    }
  }

  private removeHighlightContainer(containerId: string): void {
    const container = document.getElementById(containerId);
    if (container) {
      container.remove();
    }
    
    // Remove added styles
    const styles = ['vibe3-highlight-styles', 'vibe3-ripple-styles', 'vibe3-glow-styles'];
    styles.forEach(styleId => {
      const style = document.getElementById(styleId);
      if (style) {
        style.remove();
      }
    });
  }

  private toggleHighlightVisibility(containerId: string, visible: boolean): void {
    const container = document.getElementById(containerId);
    if (container) {
      container.style.display = visible ? 'block' : 'none';
    }
  }

  private clickElementInPage(element: ElementInfo): { success: boolean; error?: string } {
    try {
      const domElement = document.evaluate(
        element.xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue as HTMLElement;

      if (!domElement) {
        return { success: false, error: 'Element not found in DOM' };
      }

      domElement.click();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Click failed',
      };
    }
  }

  private inputTextInPage(element: ElementInfo, text: string): { success: boolean; error?: string } {
    try {
      const domElement = document.evaluate(
        element.xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue as HTMLInputElement | HTMLTextAreaElement;

      if (!domElement) {
        return { success: false, error: 'Element not found in DOM' };
      }

      domElement.focus();
      domElement.value = '';

      // Input text character by character to trigger events
      for (let i = 0; i < text.length; i++) {
        domElement.value += text[i];
        domElement.dispatchEvent(new Event('input', { bubbles: true }));
        domElement.dispatchEvent(new Event('change', { bubbles: true }));
      }

      domElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      domElement.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Input failed',
      };
    }
  }
}