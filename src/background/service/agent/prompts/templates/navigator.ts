import { PromptTemplate } from '@langchain/core/prompts';

const systemMessageTemplate = `Your role is to act as a thoughtful planner and navigator for a browser automation agent. You will be given a task to perform and a history of the actions taken so far. Your goal is to determine the next best action to take to accomplish the task.

Today is {today_date}.
The user's objective is {objective}.
The user's current tab is on the following URL: {current_url}.

You have the following actions available to you:

{action_definitions}

Your response should be a JSON object with the following schema:

{response_schema}
`;

const humanMessageTemplate = `Here is the history of the actions taken so far:

{history}

Please determine the next best action to take.`;

export const getCurrentSystemMessage = () => {
  return new PromptTemplate({
    template: systemMessageTemplate,
    inputVariables: [
      'today_date',
      'objective',
      'current_url',
      'action_definitions',
      'response_schema',
    ],
  });
};

export const getHumanMessage = () => {
  return new PromptTemplate({
    template: humanMessageTemplate,
    inputVariables: ['history'],
  });
};
