import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

export function getRole(message: BaseMessage): string {
  if (message instanceof HumanMessage) {
    return 'user';
  } else if (message instanceof AIMessage) {
    return 'assistant';
  } else if (message instanceof SystemMessage) {
    return 'system';
  } else {
    return 'unknown';
  }
}
