import { PromptTemplate } from '@langchain/core/prompts';

const systemMessageTemplate = `Your role is to act as a thoughtful planner for a browser automation agent. You will be given a task to perform and a history of the actions taken so far. Your goal is to create a plan to accomplish the task.

Today is {today_date}.
The user's objective is {objective}.
The user's current tab is on the following URL: {current_url}.

Your response should be a JSON object with the following schema:

{response_schema}
`;

const humanMessageTemplate = `Here is the history of the actions taken so far:

{history}

Please create a plan to accomplish the task.`;

export const getCurrentSystemMessage = () => {
  return new PromptTemplate({
    template: systemMessageTemplate,
    inputVariables: [
      'today_date',
      'objective',
      'current_url',
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
