import { PromptTemplate } from '@langchain/core/prompts';

const systemMessageTemplate = `Your role is to act as a thoughtful validator for a browser automation agent. You will be given a task to perform, a history of the actions taken so far, and a plan to accomplish the task. Your goal is to determine if the task has been successfully completed.

Today is {today_date}.
The user's objective is {objective}.
The user's current tab is on the following URL: {current_url}.

Your response should be a JSON object with the following schema:

{response_schema}
`;

const humanMessageTemplate = `Here is the history of the actions taken so far:

{history}

Here is the plan that was created to accomplish the task:

{plan}

Please determine if the task has been successfully completed.`;

export const getCurrentSystemMessage = (task: string) => {
  return new PromptTemplate({
    template: systemMessageTemplate,
    inputVariables: [
      'today_date',
      'objective',
      'current_url',
      'response_schema',
    ],
  }).partial({ objective: task });
};

export const getHumanMessage = () => {
  return new PromptTemplate({
    template: humanMessageTemplate,
    inputVariables: ['history', 'plan'],
  });
};
