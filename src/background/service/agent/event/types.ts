export enum Actors {
  SYSTEM = 'SYSTEM',
  USER = 'USER',
  PLANNER = 'PLANNER',
  NAVIGATOR = 'NAVIGATOR',
  VALIDATOR = 'VALIDATOR',
}

export enum ExecutionState {
  // Initial state when a new task is started
  TASK_START = 'TASK_START',
  // Task has been successfully completed
  TASK_OK = 'TASK_OK',
  // Task was cancelled by the user
  TASK_CANCEL = 'TASK_CANCEL',
  // Task failed to complete
  TASK_FAIL = 'TASK_FAIL',
  // Task has been paused by the user
  TASK_PAUSE = 'TASK_PAUSE',
  // When the planner determined that the task is complete
  DONE = 'DONE',
}

export enum EventType {
  // For events related to the execution flow of the agent
  EXECUTION = 'EXECUTION',
  // For events related to the agent's thoughts and reasoning
  THOUGHT = 'THOUGHT',
  // For events related to the agent's actions
  ACTION = 'ACTION',
  // For events related to the agent's observations
  OBSERVATION = 'OBSERVATION',
  // For events related to the agent's errors
  ERROR = 'ERROR',
}

export interface EventData {
  type: EventType;
  actor: Actors;
  // For EXECUTION event, state is required state is one of ExecutionState
  // For other events, state is a string that represents the sub-state of the event
  state: ExecutionState | string;
  timestamp: number;
  data?: any; // any payload
}

export type EventCallback = (detail: EventData) => void;

export type Subscribers = {
  [key in EventType]: EventCallback[];
};
