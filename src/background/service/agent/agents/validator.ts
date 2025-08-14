import { BaseAgent } from './base';
import type { BaseAgentOptions, AgentOutput } from './base';
import { createLogger } from '@/utils/logger';
import { HumanMessage, SystemMessage } from '../llm/messages';

const logger = createLogger('ValidatorAgent');

export interface ValidatorOutput {
  is_valid: boolean;
  reason: string;
  answer: string;
}

export class ValidatorAgent extends BaseAgent<ValidatorOutput> {
  constructor(options: BaseAgentOptions) {
    super('validator', options);
  }

  async execute(): Promise<AgentOutput<ValidatorOutput>> {
    try {
      this.emitEvent('STEP_START', 'Validating task completion...');

      const systemMessage = new SystemMessage(`You are a validation agent. Your job is to determine if the task has been completed successfully by analyzing the current state of the web page.

Task to validate: "${this.task}"

Respond with JSON in this format:
{
  "is_valid": boolean indicating if the task is complete and correct,
  "reason": "detailed explanation of why the task is or isn't complete",
  "answer": "the final answer or result if the task is complete"
}`);

      // Get current page state for validation
      const currentState = await this.getCurrentPageState();

      const userMessage = new HumanMessage(`Current page state: ${currentState}
Original task: ${this.task}
Please validate if this task has been completed successfully.`);

      const response = await this.invokeModel([systemMessage, userMessage]);

      // Parse JSON response
      const result = this.parseJsonResponse(response.content);

      if (result) {
        if (result.is_valid) {
          this.emitEvent('STEP_OK', result.answer);
          logger.info('Task validated as complete:', result.answer);
        } else {
          this.emitEvent('STEP_FAIL', result.reason);
          logger.info('Task validation failed:', result.reason);
        }

        return {
          id: this.id,
          result: result,
        };
      } else {
        throw new Error('Failed to parse validator response');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('Validation failed:', errorMessage);
      this.emitEvent('STEP_FAIL', errorMessage);

      return {
        id: this.id,
        error: errorMessage,
      };
    }
  }

  private async getCurrentPageState(): Promise<string> {
    try {
      // This would integrate with browser automation to get current page state
      // For now, use Chrome tabs API to get basic page info
      const tab = await chrome.tabs.get(this.tabId);

      // Try to get page content for validation
      try {
        const response = await chrome.tabs.sendMessage(this.tabId, {
          type: 'GET_PAGE_STATE',
        });

        return `URL: ${tab.url}
Title: ${tab.title}
Content: ${response?.content || 'Unable to get page content'}`;
      } catch (contentError) {
        return `URL: ${tab.url}, Title: ${tab.title}`;
      }
    } catch (error) {
      logger.warn('Failed to get page state for validation:', error);
      return 'Unable to get current page state for validation';
    }
  }

  private parseJsonResponse(content: string): ValidatorOutput | null {
    try {
      // Extract JSON from response if wrapped in markdown or other text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          is_valid: Boolean(parsed.is_valid),
          reason: parsed.reason || '',
          answer: parsed.answer || '',
        };
      }
      return null;
    } catch (error) {
      logger.error('Failed to parse JSON response:', error);
      return null;
    }
  }
}
