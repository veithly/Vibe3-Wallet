import { AgentContext, Web3Context } from '../types';
import { TaskAnalysis } from '../task-analysis/IntelligentTaskAnalyzer';
import { StreamingLLMResponse } from '../llm/types';
import { createLogger } from '@/utils/logger';
import { BrowserAutomationController } from '../automation/BrowserAutomationController';
import { toolRegistry } from '../tools/ToolRegistry';

const logger = createLogger('ElementSelectionAgent');

export interface ElementSelectionTask {
  id: string;
  type: 'highlight' | 'select' | 'analyze' | 'find' | 'interact';
  priority: 'low' | 'medium' | 'high';
  instruction: string;
  context: {
    url?: string;
    pageTitle?: string;
    userIntent?: string;
    constraints?: string[];
  };
  params: Record<string, any>;
  dependencies: string[];
  timeout: number;
}

export interface ElementSelectionResult {
  success: boolean;
  elements?: Array<{
    selector: string;
    bounds: { top: number; left: number; width: number; height: number };
    isVisible: boolean;
    properties?: Record<string, any>;
  }>;
  selectedElement?: {
    selector: string;
    bounds: { top: number; left: number; width: number; height: number };
    isVisible: boolean;
    analysis?: {
      type: string;
      textContent?: string;
      attributes?: Record<string, string>;
      accessibility?: Record<string, any>;
    };
  };
  message: string;
  timing: number;
  recommendations?: string[];
}

/**
 * Specialized agent for element selection and analysis tasks
 */
export class ElementSelectionAgent {
  private browserController: BrowserAutomationController;
  private isActive: boolean = false;
  private currentTask: ElementSelectionTask | null = null;
  private executionHistory: ElementSelectionTask[] = [];

  constructor() {
    this.browserController = new BrowserAutomationController();
  }

  /**
   * Execute element selection task with multi-agent coordination
   */
  async executeTask(
    task: ElementSelectionTask,
    context: AgentContext,
    enableStreaming: boolean = false,
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<ElementSelectionResult> {
    const startTime = Date.now();
    this.currentTask = task;
    this.isActive = true;

    try {
      logger.info('Starting element selection task', {
        taskId: task.id,
        type: task.type,
        instruction: task.instruction,
        priority: task.priority,
      });

      if (enableStreaming && onChunk) {
        onChunk({
          id: `element-selection-${task.id}`,
          type: 'content',
          content: `Starting ${task.type} element selection...`,
          timestamp: Date.now(),
        });
      }

      // Execute based on task type
      let result: ElementSelectionResult;
      switch (task.type) {
        case 'highlight':
          result = await this.executeHighlightTask(task, enableStreaming, onChunk);
          break;
        case 'select':
          result = await this.executeSelectTask(task, enableStreaming, onChunk);
          break;
        case 'analyze':
          result = await this.executeAnalyzeTask(task, enableStreaming, onChunk);
          break;
        case 'find':
          result = await this.executeFindTask(task, enableStreaming, onChunk);
          break;
        case 'interact':
          result = await this.executeInteractTask(task, enableStreaming, onChunk);
          break;
        default:
          throw new Error(`Unknown element selection task type: ${task.type}`);
      }

      const timing = Date.now() - startTime;
      result.timing = timing;

      logger.info('Element selection task completed', {
        taskId: task.id,
        success: result.success,
        elementCount: result.elements?.length || 0,
        timing,
      });

      // Add to execution history
      this.executionHistory.push(task);

      return result;
    } catch (error) {
      const timing = Date.now() - startTime;
      logger.error('Element selection task failed', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
        timing,
      });

      return {
        success: false,
        message: `Element selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timing,
      };
    } finally {
      this.isActive = false;
      this.currentTask = null;
    }
  }

  /**
   * Execute highlight task - highlight interactive elements
   */
  private async executeHighlightTask(
    task: ElementSelectionTask,
    enableStreaming: boolean,
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<ElementSelectionResult> {
    if (enableStreaming && onChunk) {
      onChunk({
        id: `highlight-${task.id}`,
        type: 'content',
        content: 'Activating element highlighting mode...',
        timestamp: Date.now(),
      });
    }

    // Activate element selector
    const highlightResult = await toolRegistry.executeTool('activateElementSelector', {
      mode: 'highlight',
      filter: task.params.filter,
      visibleOnly: task.params.visibleOnly || true,
    });

    if (!highlightResult.success) {
      throw new Error(`Failed to activate element selector: ${highlightResult.error}`);
    }

    // Get highlighted elements
    const elementsResult = await toolRegistry.executeTool('getHighlightedElements', {
      filter: task.params.filter,
      includeAttributes: true,
    });

    if (!elementsResult.success) {
      throw new Error(`Failed to get highlighted elements: ${elementsResult.error}`);
    }

    if (enableStreaming && onChunk) {
      onChunk({
        id: `highlight-${task.id}-result`,
        type: 'content',
        content: `Highlighted ${elementsResult.result?.elements?.length || 0} interactive elements`,
        timestamp: Date.now(),
      });
    }

    return {
      success: true,
      elements: elementsResult.result?.elements || [],
      message: `Successfully highlighted ${elementsResult.result?.elements?.length || 0} elements`,
      timing: 0,
      recommendations: this.generateHighlightRecommendations(elementsResult.result?.elements || []),
    };
  }

  /**
   * Execute select task - guide user to select specific elements
   */
  private async executeSelectTask(
    task: ElementSelectionTask,
    enableStreaming: boolean,
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<ElementSelectionResult> {
    if (enableStreaming && onChunk) {
      onChunk({
        id: `select-${task.id}`,
        type: 'content',
        content: 'Activating element selection mode. Please click on the desired element...',
        timestamp: Date.now(),
      });
    }

    // Activate element selector in select mode
    const selectResult = await toolRegistry.executeTool('activateElementSelector', {
      mode: 'select',
      filter: task.params.filter,
      visibleOnly: true,
    });

    if (!selectResult.success) {
      throw new Error(`Failed to activate element selector: ${selectResult.error}`);
    }

    // Wait for user selection (simplified - in real implementation would use event listeners)
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get highlighted elements (would normally get the selected element)
    const elementsResult = await toolRegistry.executeTool('getHighlightedElements', {});

    if (enableStreaming && onChunk) {
      onChunk({
        id: `select-${task.id}-result`,
        type: 'content',
        content: 'Element selection completed',
        timestamp: Date.now(),
      });
    }

    return {
      success: true,
      elements: elementsResult.result?.elements || [],
      message: 'Element selection mode activated. Please click on an element to select it.',
      timing: 0,
      recommendations: [
        'Click on any element to select it',
        'Press ESC to exit selection mode',
        'Selected element information will be displayed',
      ],
    };
  }

  /**
   * Execute analyze task - analyze specific element properties
   */
  private async executeAnalyzeTask(
    task: ElementSelectionTask,
    enableStreaming: boolean,
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<ElementSelectionResult> {
    if (!task.params.selector) {
      throw new Error('Selector is required for element analysis');
    }

    if (enableStreaming && onChunk) {
      onChunk({
        id: `analyze-${task.id}`,
        type: 'content',
        content: `Analyzing element: ${task.params.selector}`,
        timestamp: Date.now(),
      });
    }

    // Analyze element
    const analyzeResult = await toolRegistry.executeTool('analyzeElement', {
      selector: task.params.selector,
      includeAccessibility: task.params.includeAccessibility || true,
      includeEvents: task.params.includeEvents || false,
    });

    if (!analyzeResult.success) {
      throw new Error(`Failed to analyze element: ${analyzeResult.error}`);
    }

    if (enableStreaming && onChunk) {
      onChunk({
        id: `analyze-${task.id}-result`,
        type: 'content',
        content: 'Element analysis completed',
        timestamp: Date.now(),
      });
    }

    return {
      success: true,
      selectedElement: analyzeResult.result?.element,
      message: 'Element analysis completed successfully',
      timing: 0,
      recommendations: this.generateAnalysisRecommendations(analyzeResult.result?.element),
    };
  }

  /**
   * Execute find task - find elements by text or criteria
   */
  private async executeFindTask(
    task: ElementSelectionTask,
    enableStreaming: boolean,
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<ElementSelectionResult> {
    if (!task.params.text && !task.params.selector) {
      throw new Error('Either text or selector is required for find task');
    }

    if (enableStreaming && onChunk) {
      onChunk({
        id: `find-${task.id}`,
        type: 'content',
        content: `Finding elements: ${task.params.text || task.params.selector}`,
        timestamp: Date.now(),
      });
    }

    let elements = [];
    
    if (task.params.text) {
      // Find by text
      const findResult = await toolRegistry.executeTool('findElementsByText', {
        text: task.params.text,
        elementType: task.params.elementType,
        caseSensitive: task.params.caseSensitive || false,
        visibleOnly: task.params.visibleOnly || true,
      });

      if (!findResult.success) {
        throw new Error(`Failed to find elements: ${findResult.error}`);
      }

      elements = findResult.result?.elements || [];
    } else {
      // Get interactive elements with filter
      const interactiveResult = await toolRegistry.executeTool('getInteractiveElements', {
        elementType: task.params.elementType,
        textFilter: task.params.textFilter,
        includeAttributes: true,
      });

      if (!interactiveResult.success) {
        throw new Error(`Failed to get interactive elements: ${interactiveResult.error}`);
      }

      elements = interactiveResult.result?.elements || [];
    }

    if (enableStreaming && onChunk) {
      onChunk({
        id: `find-${task.id}-result`,
        type: 'content',
        content: `Found ${elements.length} matching elements`,
        timestamp: Date.now(),
      });
    }

    return {
      success: true,
      elements,
      message: `Found ${elements.length} matching elements`,
      timing: 0,
      recommendations: this.generateFindRecommendations(elements, task.params),
    };
  }

  /**
   * Execute interact task - interact with specific element
   */
  private async executeInteractTask(
    task: ElementSelectionTask,
    enableStreaming: boolean,
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<ElementSelectionResult> {
    if (!task.params.selector) {
      throw new Error('Selector is required for element interaction');
    }

    if (enableStreaming && onChunk) {
      onChunk({
        id: `interact-${task.id}`,
        type: 'content',
        content: `Interacting with element: ${task.params.selector}`,
        timestamp: Date.now(),
      });
    }

    // First highlight the element
    await toolRegistry.executeTool('highlightElement', {
      selector: task.params.selector,
      color: 'blue',
      duration: 2000,
    });

    // Perform the interaction
    let interactionResult;
    switch (task.params.action) {
      case 'click':
        interactionResult = await toolRegistry.executeTool('clickElement', {
          selector: task.params.selector,
        });
        break;
      case 'hover':
        interactionResult = await toolRegistry.executeTool('hoverElement', {
          selector: task.params.selector,
          duration: 1000,
        });
        break;
      case 'screenshot':
        interactionResult = await toolRegistry.executeTool('captureElementScreenshot', {
          selector: task.params.selector,
          includeHighlights: true,
        });
        break;
      default:
        throw new Error(`Unknown interaction action: ${task.params.action}`);
    }

    if (!interactionResult.success) {
      throw new Error(`Interaction failed: ${interactionResult.error}`);
    }

    if (enableStreaming && onChunk) {
      onChunk({
        id: `interact-${task.id}-result`,
        type: 'content',
        content: `Element ${task.params.action} completed successfully`,
        timestamp: Date.now(),
      });
    }

    return {
      success: true,
      message: `Successfully ${task.params.action}ed element: ${task.params.selector}`,
      timing: 0,
      recommendations: this.generateInteractionRecommendations(task.params.action),
    };
  }

  /**
   * Generate recommendations based on highlighted elements
   */
  private generateHighlightRecommendations(elements: any[]): string[] {
    const recommendations: string[] = [];
    
    if (elements.length === 0) {
      recommendations.push('No interactive elements found on the page');
      recommendations.push('Try navigating to a page with forms or buttons');
    } else if (elements.length > 20) {
      recommendations.push('Many interactive elements found - consider using filters');
      recommendations.push('Use text filters to find specific elements');
    } else {
      recommendations.push(`${elements.length} interactive elements available for selection`);
      recommendations.push('Click on any highlighted element to select it');
    }

    return recommendations;
  }

  /**
   * Generate recommendations based on element analysis
   */
  private generateAnalysisRecommendations(element?: any): string[] {
    const recommendations: string[] = [];
    
    if (!element) {
      recommendations.push('Element not found or not accessible');
      return recommendations;
    }

    recommendations.push(`Element type: ${element.properties?.tagName || 'unknown'}`);
    
    if (element.properties?.textContent) {
      const text = element.properties.textContent.substring(0, 50);
      recommendations.push(`Element contains text: "${text}..."`);
    }

    if (element.analysis?.accessibility) {
      recommendations.push('Accessibility information available for this element');
    }

    recommendations.push('Use this selector for reliable automation');
    
    return recommendations;
  }

  /**
   * Generate recommendations based on found elements
   */
  private generateFindRecommendations(elements: any[], params: any): string[] {
    const recommendations: string[] = [];
    
    if (elements.length === 0) {
      recommendations.push('No matching elements found');
      recommendations.push('Try adjusting search criteria or check page content');
    } else if (elements.length === 1) {
      recommendations.push('Found exact match - ideal for automation');
    } else {
      recommendations.push(`Found ${elements.length} matches - consider using more specific criteria`);
      recommendations.push('Use element properties to distinguish between matches');
    }

    return recommendations;
  }

  /**
   * Generate recommendations based on interaction
   */
  private generateInteractionRecommendations(action: string): string[] {
    const recommendations: string[] = [];
    
    switch (action) {
      case 'click':
        recommendations.push('Element clicked successfully');
        recommendations.push('Wait for page to respond if navigation is expected');
        break;
      case 'hover':
        recommendations.push('Element hovered successfully');
        recommendations.push('Check for dropdowns or tooltips that may have appeared');
        break;
      case 'screenshot':
        recommendations.push('Screenshot captured successfully');
        recommendations.push('Use screenshot for visual verification or documentation');
        break;
    }

    return recommendations;
  }

  /**
   * Get agent status
   */
  getStatus(): {
    isActive: boolean;
    currentTask: ElementSelectionTask | null;
    executionHistory: ElementSelectionTask[];
    capabilities: string[];
  } {
    return {
      isActive: this.isActive,
      currentTask: this.currentTask,
      executionHistory: this.executionHistory,
      capabilities: [
        'Element highlighting and selection',
        'Element property analysis',
        'Text-based element discovery',
        'Interactive element identification',
        'Element interaction and automation',
        'Accessibility analysis',
        'Visual element screenshot capture',
      ],
    };
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
    logger.info('Element selection agent history cleared');
  }
}

// Global element selection agent instance
export const elementSelectionAgent = new ElementSelectionAgent();