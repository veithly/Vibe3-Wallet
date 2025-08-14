import { BaseAgent } from './base';
import type { BaseAgentOptions, AgentOutput } from './base';
import { createLogger } from '@/utils/logger';
import { HumanMessage, SystemMessage } from '../llm/messages';

const logger = createLogger('PlannerAgent');

export interface PlannerOutput {
  observation: string;
  challenges: string;
  done: boolean;
  next_steps: string;
  reasoning: string;
  web_task: boolean;
}

export class PlannerAgent extends BaseAgent<PlannerOutput> {
  constructor(options: BaseAgentOptions) {
    super('planner', options);
  }

  async execute(): Promise<AgentOutput<PlannerOutput>> {
    try {
      this.emitEvent('STEP_START', 'Planning next steps...');

      const systemMessage = new SystemMessage(`You are a planning agent for web automation tasks. 
Your job is to analyze the current state and plan the next steps to accomplish the task: "${this.task}"

Respond with JSON in this format:
{
  "observation": "What you observe about the current state",
  "challenges": "Any challenges or obstacles you identify", 
  "done": boolean indicating if the task is complete,
  "next_steps": "Detailed plan for the next steps",
  "reasoning": "Your reasoning for the plan",
  "web_task": boolean indicating if this requires web interaction
}`);

      // Get current page state (this would need to be implemented)
      const currentState = await this.getCurrentPageState();

      const userMessage = new HumanMessage(`Current page state: ${currentState}
Task to accomplish: ${this.task}
Please analyze and provide the next steps.`);

      const response = await this.invokeModel([systemMessage, userMessage]);

      // Parse JSON response
      const result = this.parseJsonResponse(response.content);

      if (result) {
        this.emitEvent('STEP_OK', result.next_steps);
        logger.info('Planning completed:', result);

        return {
          id: this.id,
          result: result,
        };
      } else {
        throw new Error('Failed to parse planner response');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('Planning failed:', errorMessage);
      this.emitEvent('STEP_FAIL', errorMessage);

      return {
        id: this.id,
        error: errorMessage,
      };
    }
  }

  private async getCurrentPageState(): Promise<string> {
    // This would integrate with browser automation to get current page state
    // For now, return a placeholder
    return 'Current page state would be extracted here';
  }

  private parseJsonResponse(content: string): PlannerOutput | null {
    try {
      // Extract JSON from response if wrapped in markdown or other text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          observation: parsed.observation || '',
          challenges: parsed.challenges || '',
          done: Boolean(parsed.done),
          next_steps: parsed.next_steps || '',
          reasoning: parsed.reasoning || '',
          web_task: Boolean(parsed.web_task),
        };
      }
      return null;
    } catch (error) {
      logger.error('Failed to parse JSON response:', error);
      return null;
    }
  }
}
