import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from '@langchain/core/prompts';
import { BasePrompt } from './base';
import {
  getCurrentSystemMessage,
  getHumanMessage,
} from './templates/validator';

export interface ValidatorResponseSchema {
  is_valid: boolean;
  reasoning: string;
}

export class ValidatorPrompt extends BasePrompt<ValidatorResponseSchema> {
  responseSchema: ValidatorResponseSchema = {
    is_valid: false,
    reasoning: '',
  };

  constructor(private readonly task: string) {
    super();
  }

  getPrompt(): ChatPromptTemplate {
    const systemMessage = getCurrentSystemMessage(this.task);
    const humanMessage = getHumanMessage();

    return ChatPromptTemplate.fromMessages([
      new SystemMessagePromptTemplate({ prompt: systemMessage }),
      new HumanMessagePromptTemplate({ prompt: humanMessage }),
    ]);
  }

  getSystemMessage(): string {
    return 'Validator system message';
  }

  getUserMessage(): string {
    return 'Validator human message';
  }

  addFollowUpTask(task: string): void {
    // no-op
  }
}
