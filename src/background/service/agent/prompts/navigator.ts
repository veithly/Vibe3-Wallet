import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from '@langchain/core/prompts';
import { BasePrompt } from './base';
import {
  getCurrentSystemMessage,
  getHumanMessage,
} from './templates/navigator';

export interface NavigatorResponseSchema {
  action: string;
  args?: Record<string, any>;
}

export class NavigatorPrompt extends BasePrompt<NavigatorResponseSchema> {
  responseSchema: NavigatorResponseSchema = {
    action: '',
    args: undefined,
  };
  constructor(private readonly maxActionsPerStep: number) {
    super();
  }

  getPrompt(): ChatPromptTemplate {
    const systemMessage = getCurrentSystemMessage();
    const humanMessage = getHumanMessage();

    return ChatPromptTemplate.fromMessages([
      new SystemMessagePromptTemplate({ prompt: systemMessage }),
      new HumanMessagePromptTemplate({ prompt: humanMessage }),
    ]);
  }

  getSystemMessage(): string {
    return 'Navigator system message';
  }

  getUserMessage(): string {
    return 'Navigator human message';
  }
}
