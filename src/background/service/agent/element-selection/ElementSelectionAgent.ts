import { AgentContext, Web3Context } from '../types';
import { TaskAnalysis } from '../task-analysis/IntelligentTaskAnalyzer';
import { StreamingLLMResponse } from '../llm/types';
import { createLogger } from '@/utils/logger';
import { BrowserAutomationController } from '../automation/BrowserAutomationController';
import { Web3Agent } from '../Web3Agent';
import { toolRegistry } from '../tools/ToolRegistry';
import { agent } from '../../agent';

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
  private web3Agent: Web3Agent | null = null;
  private isActive: boolean = false;
  private currentTask: ElementSelectionTask | null = null;
  private executionHistory: ElementSelectionTask[] = [];

  constructor(web3Agent?: Web3Agent) {
    this.browserController = new BrowserAutomationController();
    this.web3Agent = web3Agent || null;
  }

  /**
   * Set the Web3Agent instance for proper message integration
   */
  setWeb3Agent(web3Agent: Web3Agent): void {
    this.web3Agent = web3Agent;
  }

  /**
   * Get the Web3Agent instance from the agent service
   */
  private getWeb3AgentFromService(): Web3Agent | null {
    try {
      return agent.getWeb3Agent();
    } catch (error) {
      logger.warn('ElementSelectionAgent', 'Failed to get Web3Agent from service', { error });
      return null;
    }
  }

  /**
   * Execute tool with proper message storage through Web3Agent
   */
  private async executeToolWithMessageTracking(toolName: string, params: any): Promise<any> {
    // Get Web3Agent from service if not already set
    if (!this.web3Agent) {
      this.web3Agent = this.getWeb3AgentFromService();
    }

    if (this.web3Agent) {
      // Create a function call object for message tracking
      const functionCall = {
        id: `call_${toolName}_${Date.now()}`,
        name: toolName,
        arguments: params,
        timestamp: Date.now()
      };

      try {
        // Store pending tool call message
        await this.web3Agent['storeToolCallMessage'](functionCall, 'pending');

        // Store executing tool call message
        await this.web3Agent['storeToolCallMessage'](functionCall, 'executing');

        // Execute the tool
        const result = await toolRegistry.executeTool(toolName, params);

        // Store completed tool call message
        await this.web3Agent['storeToolCallMessage'](functionCall, 'completed', {
          success: result.success,
          result: result.result,
          error: result.error
        });

        return result;
      } catch (error) {
        // Store failed tool call message
        await this.web3Agent['storeToolCallMessage'](functionCall, 'failed', {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    } else {
      // Fallback to direct tool registry execution
      return await toolRegistry.executeTool(toolName, params);
    }
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

    // Activate element selector with better error handling and message tracking
    let highlightResult = await this.executeToolWithMessageTracking('activateElementSelector', {
      mode: 'highlight',
      filter: task.params.filter,
      visibleOnly: task.params.visibleOnly || true,
    });

    if (!highlightResult.success) {
      // Try to recover by creating a tab first
      if (highlightResult.error?.includes('No active tab found') ||
          highlightResult.error?.includes('No active tab available') ||
          highlightResult.error?.includes('Content script not available')) {
        logger.warn('Element selection failed, attempting recovery...', {
          error: highlightResult.error
        });

        // Wait a moment before retry
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Retry the activation with message tracking
        highlightResult = await this.executeToolWithMessageTracking('activateElementSelector', {
          mode: 'highlight',
          filter: task.params.filter,
          visibleOnly: task.params.visibleOnly || true,
        });

        if (!highlightResult.success) {
          throw new Error(`Failed to activate element selector after recovery: ${highlightResult.error}`);
        }
      } else {
        throw new Error(`Failed to activate element selector: ${highlightResult.error}`);
      }
    }

    // Get highlighted elements with message tracking
    const elementsResult = await this.executeToolWithMessageTracking('getHighlightedElements', {
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

    // Activate element selector in select mode with recovery and message tracking
    let selectResult = await this.executeToolWithMessageTracking('activateElementSelector', {
      mode: 'select',
      filter: task.params.filter,
      visibleOnly: true,
    });

    if (!selectResult.success) {
      // Try to recover from tab-related errors
      if (selectResult.error?.includes('No active tab found') ||
          selectResult.error?.includes('No active tab available') ||
          selectResult.error?.includes('Content script not available')) {
        logger.warn('Element selection failed, attempting recovery...', {
          error: selectResult.error
        });

        // Wait a moment before retry
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Retry the activation with message tracking
        selectResult = await this.executeToolWithMessageTracking('activateElementSelector', {
          mode: 'select',
          filter: task.params.filter,
          visibleOnly: true,
        });

        if (!selectResult.success) {
          throw new Error(`Failed to activate element selector after recovery: ${selectResult.error}`);
        }
      } else {
        throw new Error(`Failed to activate element selector: ${selectResult.error}`);
      }
    }

    // Wait for user selection (simplified - in real implementation would use event listeners)
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get highlighted elements (would normally get the selected element) with message tracking
    const elementsResult = await this.executeToolWithMessageTracking('getHighlightedElements', {});

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

    // Analyze element with recovery logic and message tracking
    let analyzeResult = await this.executeToolWithMessageTracking('analyzeElement', {
      selector: task.params.selector,
      includeAccessibility: task.params.includeAccessibility || true,
      includeEvents: task.params.includeEvents || false,
    });

    if (!analyzeResult.success) {
      // Try to recover from tab-related errors
      if (analyzeResult.error?.includes('No active tab found') ||
          analyzeResult.error?.includes('No active tab available') ||
          analyzeResult.error?.includes('Content script not available')) {
        logger.warn('Element analysis failed, attempting recovery...', {
          error: analyzeResult.error
        });

        // Wait a moment before retry
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Retry the analysis with message tracking
        analyzeResult = await this.executeToolWithMessageTracking('analyzeElement', {
          selector: task.params.selector,
          includeAccessibility: task.params.includeAccessibility || true,
          includeEvents: task.params.includeEvents || false,
        });

        if (!analyzeResult.success) {
          throw new Error(`Failed to analyze element after recovery: ${analyzeResult.error}`);
        }
      } else {
        throw new Error(`Failed to analyze element: ${analyzeResult.error}`);
      }
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
      // Find by text with recovery logic and message tracking
      let findResult = await this.executeToolWithMessageTracking('findElementsByText', {
        text: task.params.text,
        elementType: task.params.elementType,
        caseSensitive: task.params.caseSensitive || false,
        visibleOnly: task.params.visibleOnly || true,
      });

      if (!findResult.success) {
        // Try to recover from tab-related errors
        if (findResult.error?.includes('No active tab found') ||
            findResult.error?.includes('No active tab available') ||
            findResult.error?.includes('Content script not available')) {
          logger.warn('Find elements failed, attempting recovery...', {
            error: findResult.error
          });

          // Wait a moment before retry
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Retry the find operation with message tracking
          findResult = await this.executeToolWithMessageTracking('findElementsByText', {
            text: task.params.text,
            elementType: task.params.elementType,
            caseSensitive: task.params.caseSensitive || false,
            visibleOnly: task.params.visibleOnly || true,
          });

          if (!findResult.success) {
            throw new Error(`Failed to find elements after recovery: ${findResult.error}`);
          }
        } else {
          throw new Error(`Failed to find elements: ${findResult.error}`);
        }
      }

      elements = findResult.result?.elements || [];
    } else {
      // Simplified: use highlightElement to retrieve candidates (buttons-only when interactiveOnly)
      let highlightResult = await this.executeToolWithMessageTracking('highlightElement', {
        interactiveOnly: true,
        // limit can be tuned or provided via task
        limit: Math.min(200, Math.max(1, Number(task.params?.limit) || 100)),
      });

      if (!highlightResult.success) {
        // Try to recover from tab-related errors
        if (highlightResult.error?.includes('No active tab found') ||
            highlightResult.error?.includes('No active tab available') ||
            highlightResult.error?.includes('Content script not available')) {
          logger.warn('highlightElement failed, attempting recovery...', {
            error: highlightResult.error
          });

          // Wait a moment before retry
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Retry
          highlightResult = await this.executeToolWithMessageTracking('highlightElement', {
            interactiveOnly: true,
            limit: Math.min(200, Math.max(1, Number(task.params?.limit) || 100)),
          });

          if (!highlightResult.success) {
            throw new Error(`Failed to highlight elements after recovery: ${highlightResult.error}`);
          }
        } else {
          throw new Error(`Failed to highlight elements: ${highlightResult.error}`);
        }
      }

      elements = highlightResult.result?.elements || [];
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

    // Element highlighting removed. Proceeding without visual highlight.

    // Perform the interaction with recovery logic and message tracking
    let interactionResult;
    switch (task.params.action) {
      case 'click':
        interactionResult = await this.executeToolWithMessageTracking('clickElement', {
          selector: task.params.selector,
        });
        break;
      case 'hover':
        interactionResult = await this.executeToolWithMessageTracking('hoverElement', {
          selector: task.params.selector,
          duration: 1000,
        });
        break;
      case 'screenshot':
        interactionResult = await this.executeToolWithMessageTracking('captureElementScreenshot', {
          selector: task.params.selector,
          includeHighlights: true,
        });
        break;
      default:
        throw new Error(`Unknown interaction action: ${task.params.action}`);
    }

    if (!interactionResult.success) {
      // Try to recover from tab-related errors
      if (interactionResult.error?.includes('No active tab found') ||
          interactionResult.error?.includes('No active tab available') ||
          interactionResult.error?.includes('Content script not available')) {
        logger.warn('Element interaction failed, attempting recovery...', {
          error: interactionResult.error,
          action: task.params.action
        });

        // Wait a moment before retry
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Retry the interaction with message tracking
        switch (task.params.action) {
          case 'click':
            interactionResult = await this.executeToolWithMessageTracking('clickElement', {
              selector: task.params.selector,
            });
            break;
          case 'hover':
            interactionResult = await this.executeToolWithMessageTracking('hoverElement', {
              selector: task.params.selector,
              duration: 1000,
            });
            break;
          case 'screenshot':
            interactionResult = await this.executeToolWithMessageTracking('captureElementScreenshot', {
              selector: task.params.selector,
              includeHighlights: true,
            });
            break;
        }

        if (!interactionResult.success) {
          throw new Error(`Failed to ${task.params.action} element after recovery: ${interactionResult.error}`);
        }
      } else {
        throw new Error(`Interaction failed: ${interactionResult.error}`);
      }
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

// Initialize the element selection agent with Web3Agent from service when available
try {
  const web3Agent = agent.getWeb3Agent();
  if (web3Agent) {
    elementSelectionAgent.setWeb3Agent(web3Agent);
    logger.info('ElementSelectionAgent', 'Initialized with Web3Agent from service');
  }
} catch (error) {
  logger.warn('ElementSelectionAgent', 'Failed to initialize with Web3Agent from service', { error });
}