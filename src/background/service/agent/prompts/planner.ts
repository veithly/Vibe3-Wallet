import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from '@langchain/core/prompts';
import { BasePrompt } from './base';
import { getCurrentSystemMessage, getHumanMessage } from './templates/planner';

export interface PlannerResponseSchema {
  web_task: string;
  next_steps: string[];
  done: boolean;
  observation: string;
  reply: string;
}

export class PlannerPrompt extends BasePrompt<PlannerResponseSchema> {
  responseSchema: PlannerResponseSchema = {
    web_task: '',
    next_steps: [],
    done: false,
    observation: '',
    reply: '',
  };
  getPrompt(): ChatPromptTemplate {
    const systemMessage = getCurrentSystemMessage();
    const humanMessage = getHumanMessage();

    return ChatPromptTemplate.fromMessages([
      new SystemMessagePromptTemplate({ prompt: systemMessage }),
      new HumanMessagePromptTemplate({ prompt: humanMessage }),
    ]);
  }

  getSystemMessage(): string {
    return 'Planner system message';
  }

  getUserMessage(): string {
    return 'Planner human message';
  }
}
