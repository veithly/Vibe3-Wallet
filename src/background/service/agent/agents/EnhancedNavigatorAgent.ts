import { createLogger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { BaseAgent } from './BaseAgent';
import { AgentConfigManager } from './schemas/AgentConfig';
import { 
  AgentCapability, 
  AgentStatus, 
  AgentMessage, 
  AgentResult, 
  PlanStep, 
  ExecutionContext,
  SelectedElement 
} from './AgentTypes';
import { IndexBasedElementSelector, ElementInfo } from './ElementSelector';
import { ElementHighlighter, HighlightOptions } from './ElementHighlighter';

const logger = createLogger('EnhancedNavigatorAgent');

export interface NavigationStep {
  action: 'click' | 'input' | 'scroll' | 'wait' | 'highlight' | 'focus' | 'navigate' | 'analyze';
  target?: {
    index: number;
    description: string;
  };
  data?: {
    text?: string;
    scrollX?: number;
    scrollY?: number;
    duration?: number;
    url?: string;
  };
  timestamp: number;
}

export interface NavigationResult {
  success: boolean;
  steps: NavigationStep[];
  finalState: {
    url: string;
    title: string;
    elementCount: number;
  };
  highlights: {
    elements: ElementInfo[];
    isActive: boolean;
  };
}

// Enhanced navigator agent with integrated highlighting and visual feedback
export class EnhancedNavigatorAgent extends BaseAgent {
  private elementSelector: IndexBasedElementSelector;
  private elementHighlighter: ElementHighlighter;
  private currentTabId: number = -1;
  private navigationHistory: NavigationStep[] = [];
  private currentElements: ElementInfo[] = [];
  private isHighlightingActive = false;

  public id: string = 'enhanced-navigator';
  public name: string = 'Enhanced Navigator';
  public type: 'navigator' = 'navigator';

  constructor(
    config: AgentConfigManager,
    options: Partial<ExecutionContext> = {}
  ) {
    super(null, {
      id: 'enhanced-navigator',
      name: 'Enhanced Navigator',
      capabilities: [
        AgentCapability.NAVIGATION,
        AgentCapability.ELEMENT_SELECTION,
      ],
      ...options,
    });

    this.elementSelector = new IndexBasedElementSelector(config);
    this.elementHighlighter = new ElementHighlighter(config);
  }

  async execute(message: AgentMessage): Promise<AgentResult> {
    const startTime = Date.now();
    this.updateStatus(AgentStatus.EXECUTING);

    try {
      logger.info('Enhanced navigator executing task', {
        messageId: message.id,
        messageType: message.type,
        tabId: this.currentTabId,
      });

      // Extract tab ID from content if available
      if (message.content?.tabId) {
        this.currentTabId = message.content.tabId;
      }

      let result: NavigationResult;

      const action = message.content?.action || 'unknown';
      switch (action) {
        case 'navigate':
          result = await this.handleNavigation(message);
          break;
        
        case 'click_element':
          result = await this.handleClickElement(message);
          break;
        
        case 'input_text':
          result = await this.handleInputText(message);
          break;
        
        case 'highlight_elements':
          result = await this.handleHighlightElements(message);
          break;
        
        case 'focus_element':
          result = await this.handleFocusElement(message);
          break;
        
        case 'scroll_page':
          result = await this.handleScrollPage(message);
          break;
        
        case 'analyze_page':
          result = await this.handleAnalyzePage(message);
          break;
        
        default:
          throw new Error(`Unsupported action: ${action}`);
      }

      const executionTime = Date.now() - startTime;
      
      logger.info('Enhanced navigator completed task', {
        messageId: message.id,
        executionTime,
        success: result.success,
        stepsCount: result.steps.length,
      });

      this.updateStatus(AgentStatus.IDLE);

      return {
        success: result.success,
        data: result,
        shouldContinue: true,
        confidence: result.success ? 0.9 : 0.1,
        metadata: {
          executionTime,
          stepsExecuted: result.steps.length,
          elementsProcessed: result.highlights.elements.length,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Enhanced navigator execution failed', {
        messageId: message.id,
        error: errorMessage,
      });

      this.updateStatus(AgentStatus.ERROR);

      return {
        success: false,
        error: errorMessage,
        shouldContinue: false,
        confidence: 0,
      };
    }
  }

  /**
   * Navigate to a URL with page analysis and element highlighting
   */
  private async handleNavigation(message: AgentMessage): Promise<NavigationResult> {
    const { url, enableHighlighting = true } = message.content?.data || {};
    
    if (!url || typeof url !== 'string') {
      throw new Error('Navigation URL is required');
    }

    const step: NavigationStep = {
      action: 'navigate',
      timestamp: Date.now(),
    };

    try {
      // Update current tab if needed
      if (this.currentTabId === -1) {
        const tab = await chrome.tabs.create({ url });
        this.currentTabId = tab.id!;
      } else {
        await chrome.tabs.update(this.currentTabId, { url });
      }

      // Wait for page to load
      await this.waitForPageLoad();

      // Analyze page elements
      const pageResult = await this.elementSelector.getPageElements(this.currentTabId);
      this.currentElements = pageResult.elements;

      // Enable highlighting if requested
      if (enableHighlighting && this.currentElements.length > 0) {
        await this.elementHighlighter.highlightElements(this.currentTabId, this.currentElements);
        this.isHighlightingActive = true;
      }

      const finalState = await this.getCurrentPageState();

      return {
        success: true,
        steps: [step],
        finalState,
        highlights: {
          elements: this.currentElements,
          isActive: this.isHighlightingActive,
        },
      };

    } catch (error) {
      logger.error('Navigation failed', { url, error });
      return {
        success: false,
        steps: [step],
        finalState: await this.getCurrentPageState(),
        highlights: {
          elements: [],
          isActive: false,
        },
      };
    }
  }

  /**
   * Click element with visual feedback and highlighting
   */
  private async handleClickElement(message: AgentMessage): Promise<NavigationResult> {
    const { elementIndex, description, enableFeedback = true } = message.content?.data || {};
    
    if (elementIndex === undefined || elementIndex === null) {
      throw new Error('Element index is required for clicking');
    }

    const step: NavigationStep = {
      action: 'click',
      target: {
        index: elementIndex,
        description: description || `Element ${elementIndex}`,
      },
      timestamp: Date.now(),
    };

    try {
      // Get current elements if not available
      if (this.currentElements.length === 0) {
        const pageResult = await this.elementSelector.getPageElements(this.currentTabId);
        this.currentElements = pageResult.elements;
      }

      const element = this.currentElements[elementIndex];
      if (!element) {
        throw new Error(`Element ${elementIndex} not found`);
      }

      // Perform click with or without visual feedback
      let success = false;
      if (enableFeedback) {
        const result = await this.elementHighlighter.clickElementWithFeedback(
          this.currentTabId,
          element,
          this.currentElements
        );
        success = result.success;
      } else {
        success = await this.elementSelector.clickElementByIndex(this.currentTabId, elementIndex);
      }

      // Wait a moment for any page changes
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Refresh elements if highlighting is active
      if (this.isHighlightingActive) {
        const pageResult = await this.elementSelector.getPageElements(this.currentTabId);
        this.currentElements = pageResult.elements;
        await this.elementHighlighter.highlightElements(this.currentTabId, this.currentElements);
      }

      const finalState = await this.getCurrentPageState();

      return {
        success,
        steps: [step],
        finalState,
        highlights: {
          elements: this.currentElements,
          isActive: this.isHighlightingActive,
        },
      };

    } catch (error) {
      logger.error('Click element failed', { elementIndex, error });
      return {
        success: false,
        steps: [step],
        finalState: await this.getCurrentPageState(),
        highlights: {
          elements: this.currentElements,
          isActive: this.isHighlightingActive,
        },
      };
    }
  }

  /**
   * Input text with visual feedback and highlighting
   */
  private async handleInputText(message: AgentMessage): Promise<NavigationResult> {
    const { elementIndex, text, enableFeedback = true } = message.content?.data || {};
    
    if (elementIndex === undefined || elementIndex === null) {
      throw new Error('Element index is required for input');
    }
    if (!text || typeof text !== 'string') {
      throw new Error('Input text is required');
    }

    const step: NavigationStep = {
      action: 'input',
      target: {
        index: elementIndex,
        description: `Input field ${elementIndex}`,
      },
      data: { text },
      timestamp: Date.now(),
    };

    try {
      // Get current elements if not available
      if (this.currentElements.length === 0) {
        const pageResult = await this.elementSelector.getPageElements(this.currentTabId);
        this.currentElements = pageResult.elements;
      }

      const element = this.currentElements[elementIndex];
      if (!element) {
        throw new Error(`Element ${elementIndex} not found`);
      }

      // Perform input with or without visual feedback
      let success = false;
      if (enableFeedback) {
        const result = await this.elementHighlighter.inputTextWithFeedback(
          this.currentTabId,
          element,
          text,
          this.currentElements
        );
        success = result.success;
      } else {
        success = await this.elementSelector.inputTextByIndex(this.currentTabId, elementIndex, text);
      }

      const finalState = await this.getCurrentPageState();

      return {
        success,
        steps: [step],
        finalState,
        highlights: {
          elements: this.currentElements,
          isActive: this.isHighlightingActive,
        },
      };

    } catch (error) {
      logger.error('Input text failed', { elementIndex, text, error });
      return {
        success: false,
        steps: [step],
        finalState: await this.getCurrentPageState(),
        highlights: {
          elements: this.currentElements,
          isActive: this.isHighlightingActive,
        },
      };
    }
  }

  /**
   * Highlight elements with colored boxes
   */
  private async handleHighlightElements(message: AgentMessage): Promise<NavigationResult> {
    const { 
      showLabels = true, 
      coloredBoxes = true, 
      focusIndex = -1,
      duration = 0 
    } = message.content?.data || {};

    const step: NavigationStep = {
      action: 'highlight',
      data: { duration },
      timestamp: Date.now(),
    };

    try {
      // Get current elements if not available
      if (this.currentElements.length === 0) {
        const pageResult = await this.elementSelector.getPageElements(this.currentTabId);
        this.currentElements = pageResult.elements;
      }

      const options: HighlightOptions = {
        showLabels,
        coloredBoxes,
        focusIndex,
        duration,
      };

      let success = false;
      if (focusIndex >= 0) {
        success = await this.elementHighlighter.focusElement(
          this.currentTabId,
          focusIndex,
          this.currentElements,
          options
        );
      } else {
        success = await this.elementHighlighter.highlightElements(
          this.currentTabId,
          this.currentElements,
          options
        );
      }

      if (success) {
        this.isHighlightingActive = true;
      }

      // Auto-remove highlights if duration is specified
      if (duration > 0) {
        setTimeout(async () => {
          await this.elementHighlighter.removeHighlights(this.currentTabId);
          this.isHighlightingActive = false;
        }, duration);
      }

      const finalState = await this.getCurrentPageState();

      return {
        success,
        steps: [step],
        finalState,
        highlights: {
          elements: this.currentElements,
          isActive: this.isHighlightingActive,
        },
      };

    } catch (error) {
      logger.error('Highlight elements failed', { error });
      return {
        success: false,
        steps: [step],
        finalState: await this.getCurrentPageState(),
        highlights: {
          elements: this.currentElements,
          isActive: false,
        },
      };
    }
  }

  /**
   * Focus on specific element with enhanced highlighting
   */
  private async handleFocusElement(message: AgentMessage): Promise<NavigationResult> {
    const { elementIndex, enablePulse = true } = message.content?.data || {};
    
    if (elementIndex === undefined || elementIndex === null) {
      throw new Error('Element index is required for focusing');
    }

    const step: NavigationStep = {
      action: 'focus',
      target: {
        index: elementIndex,
        description: `Focus element ${elementIndex}`,
      },
      timestamp: Date.now(),
    };

    try {
      // Get current elements if not available
      if (this.currentElements.length === 0) {
        const pageResult = await this.elementSelector.getPageElements(this.currentTabId);
        this.currentElements = pageResult.elements;
      }

      const element = this.currentElements[elementIndex];
      if (!element) {
        throw new Error(`Element ${elementIndex} not found`);
      }

      const success = await this.elementHighlighter.focusElement(
        this.currentTabId,
        elementIndex,
        this.currentElements,
        { showLabels: true, coloredBoxes: true }
      );

      if (success) {
        this.isHighlightingActive = true;
      }

      const finalState = await this.getCurrentPageState();

      return {
        success,
        steps: [step],
        finalState,
        highlights: {
          elements: this.currentElements,
          isActive: this.isHighlightingActive,
        },
      };

    } catch (error) {
      logger.error('Focus element failed', { elementIndex, error });
      return {
        success: false,
        steps: [step],
        finalState: await this.getCurrentPageState(),
        highlights: {
          elements: this.currentElements,
          isActive: false,
        },
      };
    }
  }

  /**
   * Scroll page with element tracking
   */
  private async handleScrollPage(message: AgentMessage): Promise<NavigationResult> {
    const { scrollX = 0, scrollY = 500, smooth = true } = message.content?.data || {};

    const step: NavigationStep = {
      action: 'scroll',
      data: { scrollX, scrollY },
      timestamp: Date.now(),
    };

    try {
      await chrome.scripting.executeScript({
        target: { tabId: this.currentTabId },
        func: (x: number, y: number, smoothScroll: boolean) => {
          window.scrollTo({
            left: x,
            top: y,
            behavior: smoothScroll ? 'smooth' : 'auto',
          });
        },
        args: [scrollX, scrollY, smooth],
      });

      // Wait for scroll to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Refresh elements after scroll
      if (this.isHighlightingActive) {
        const pageResult = await this.elementSelector.getPageElements(this.currentTabId);
        this.currentElements = pageResult.elements;
        await this.elementHighlighter.highlightElements(this.currentTabId, this.currentElements);
      }

      const finalState = await this.getCurrentPageState();

      return {
        success: true,
        steps: [step],
        finalState,
        highlights: {
          elements: this.currentElements,
          isActive: this.isHighlightingActive,
        },
      };

    } catch (error) {
      logger.error('Scroll page failed', { scrollX, scrollY, error });
      return {
        success: false,
        steps: [step],
        finalState: await this.getCurrentPageState(),
        highlights: {
          elements: this.currentElements,
          isActive: this.isHighlightingActive,
        },
      };
    }
  }

  /**
   * Analyze current page and return element information
   */
  private async handleAnalyzePage(message: AgentMessage): Promise<NavigationResult> {
    const { includeAttributes = true, maxElements = 100 } = message.content?.data || {};

    const step: NavigationStep = {
      action: 'analyze',
      timestamp: Date.now(),
    };

    try {
      const pageResult = await this.elementSelector.getPageElements(this.currentTabId);
      this.currentElements = pageResult.elements.slice(0, maxElements);

      const finalState = await this.getCurrentPageState();

      return {
        success: true,
        steps: [step],
        finalState,
        highlights: {
          elements: this.currentElements,
          isActive: this.isHighlightingActive,
        },
      };

    } catch (error) {
      logger.error('Analyze page failed', { error });
      return {
        success: false,
        steps: [step],
        finalState: await this.getCurrentPageState(),
        highlights: {
          elements: [],
          isActive: false,
        },
      };
    }
  }

  // Utility methods

  private async waitForPageLoad(timeout = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkLoad = () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error('Page load timeout'));
          return;
        }

        chrome.tabs.get(this.currentTabId, (tab) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (tab.status === 'complete') {
            resolve();
          } else {
            setTimeout(checkLoad, 100);
          }
        });
      };

      checkLoad();
    });
  }

  private async getCurrentPageState() {
    try {
      const tab = await chrome.tabs.get(this.currentTabId);
      return {
        url: tab.url || '',
        title: tab.title || '',
        elementCount: this.currentElements.length,
      };
    } catch (error) {
      return {
        url: '',
        title: '',
        elementCount: 0,
      };
    }
  }

  // Public utility methods

  /**
   * Get current highlighted elements
   */
  getCurrentElements(): ElementInfo[] {
    return [...this.currentElements];
  }

  /**
   * Check if highlighting is currently active
   */
  isHighlightActive(): boolean {
    return this.isHighlightingActive;
  }

  /**
   * Remove all highlights
   */
  async removeHighlights(): Promise<boolean> {
    try {
      const success = await this.elementHighlighter.removeHighlights(this.currentTabId);
      this.isHighlightingActive = false;
      return success;
    } catch (error) {
      logger.error('Failed to remove highlights', { error });
      return false;
    }
  }

  /**
   * Toggle highlight visibility
   */
  async toggleHighlightVisibility(visible: boolean): Promise<boolean> {
    try {
      return await this.elementHighlighter.toggleHighlights(this.currentTabId, visible);
    } catch (error) {
      logger.error('Failed to toggle highlight visibility', { error });
      return false;
    }
  }

  /**
   * Get navigation history
   */
  getNavigationHistory(): NavigationStep[] {
    return [...this.navigationHistory];
  }

  /**
   * Clear navigation history
   */
  clearNavigationHistory(): void {
    this.navigationHistory = [];
  }

  /**
   * Check if this agent can handle a specific task type
   */
  canHandle(taskType: string): boolean {
    const supportedTypes = [
      'navigate',
      'click_element',
      'input_text',
      'highlight_elements',
      'focus_element',
      'scroll_page',
      'analyze_page',
    ];
    return supportedTypes.includes(taskType);
  }
}