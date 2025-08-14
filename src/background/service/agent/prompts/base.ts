import { BasePromptTemplate } from '@langchain/core/prompts';

export abstract class BasePrompt<T> {
  abstract getPrompt(): BasePromptTemplate;
  abstract getSystemMessage(): string;
  abstract getUserMessage(): string;
  abstract responseSchema: T;
}
