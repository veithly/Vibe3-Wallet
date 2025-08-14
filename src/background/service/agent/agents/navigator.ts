import { BaseAgent } from './base';
import type { BaseAgentOptions, AgentOutput } from './base';
import { createLogger } from '@/utils/logger';
import { HumanMessage, SystemMessage } from '../llm/messages';

const logger = createLogger('NavigatorAgent');

export interface NavigatorOutput {
  done: boolean;
  action?: string;
  target?: string;
  value?: string;
  reasoning?: string;
}

export class NavigatorAgent extends BaseAgent<NavigatorOutput> {
  constructor(options: BaseAgentOptions) {
    super('navigator', options);
  }

  async execute(): Promise<AgentOutput<NavigatorOutput>> {
    try {
      this.emitEvent('STEP_START', 'Executing navigation step...');

      const systemMessage = new SystemMessage(`You are a web navigation agent. Your task is to interact with web pages to accomplish the user's goal: "${this.task}"

Available actions:
- click: Click on an element
- type: Type text into an input field
- scroll: Scroll the page
- wait: Wait for page to load
- extract: Extract information from the page
- done: Indicate task completion

Respond with JSON in this format:
{
  "done": boolean indicating if task is complete,
  "action": "action name (click, type, scroll, wait, extract, done)",
  "target": "CSS selector or description of target element",
  "value": "text to type or other action value",
  "reasoning": "explanation of why you chose this action"
}`);

      // Get current page state and DOM
      const pageState = await this.getCurrentPageState();

      const userMessage = new HumanMessage(`Current page state: ${pageState}
Task: ${this.task}
What action should I take next?`);

      const response = await this.invokeModel([systemMessage, userMessage]);

      // Parse JSON response
      const result = this.parseJsonResponse(response.content);

      if (result) {
        // Execute the action if it's not 'done'
        if (!result.done && result.action && result.action !== 'done') {
          await this.executeAction(result);
        }

        this.emitEvent(
          'STEP_OK',
          `Action: ${result.action}, Target: ${result.target}`
        );
        logger.info('Navigation step completed:', result);

        return {
          id: this.id,
          result: result,
        };
      } else {
        throw new Error('Failed to parse navigator response');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('Navigation failed:', errorMessage);
      this.emitEvent('STEP_FAIL', errorMessage);

      return {
        id: this.id,
        error: errorMessage,
      };
    }
  }

  private async getCurrentPageState(): Promise<string> {
    try {
      // This would integrate with browser automation to get DOM/page state
      // For now, use Chrome tabs API to get basic page info
      const tab = await chrome.tabs.get(this.tabId);
      return `URL: ${tab.url}, Title: ${tab.title}`;
    } catch (error) {
      logger.warn('Failed to get page state:', error);
      return 'Unable to get current page state';
    }
  }

  private parseJsonResponse(content: string): NavigatorOutput | null {
    try {
      // Extract JSON from response if wrapped in markdown or other text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          done: Boolean(parsed.done),
          action: parsed.action || '',
          target: parsed.target || '',
          value: parsed.value || '',
          reasoning: parsed.reasoning || '',
        };
      }
      return null;
    } catch (error) {
      logger.error('Failed to parse JSON response:', error);
      return null;
    }
  }

  private async executeAction(action: NavigatorOutput): Promise<void> {
    try {
      logger.info(`Executing action: ${action.action} on ${action.target}`);

      // This would integrate with browser automation to execute actions
      // For now, just log the action
      switch (action.action) {
        case 'click':
          await this.executeClick(action.target!, action.value);
          break;
        case 'type':
          await this.executeType(action.target!, action.value!);
          break;
        case 'scroll':
          await this.executeScroll(action.value);
          break;
        case 'wait':
          await this.executeWait(parseInt(action.value || '1000'));
          break;
        case 'extract':
          await this.executeExtract(action.target!);
          break;
        default:
          logger.warn(`Unknown action: ${action.action}`);
      }
    } catch (error) {
      logger.error('Failed to execute action:', error);
      throw error;
    }
  }

  private async executeClick(target: string, value?: string): Promise<void> {
    // Integration point for browser automation
    await chrome.tabs.sendMessage(this.tabId, {
      type: 'EXECUTE_ACTION',
      action: 'click',
      target: target,
      value: value,
    });
  }

  private async executeType(target: string, value: string): Promise<void> {
    // Integration point for browser automation
    await chrome.tabs.sendMessage(this.tabId, {
      type: 'EXECUTE_ACTION',
      action: 'type',
      target: target,
      value: value,
    });
  }

  private async executeScroll(direction?: string): Promise<void> {
    // Integration point for browser automation
    await chrome.tabs.sendMessage(this.tabId, {
      type: 'EXECUTE_ACTION',
      action: 'scroll',
      value: direction || 'down',
    });
  }

  private async executeWait(duration: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, duration));
  }

  private async executeExtract(target: string): Promise<void> {
    // Integration point for browser automation
    await chrome.tabs.sendMessage(this.tabId, {
      type: 'EXECUTE_ACTION',
      action: 'extract',
      target: target,
    });
  }
}
