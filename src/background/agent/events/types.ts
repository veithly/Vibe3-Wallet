export enum ExecutionState {
  TASK_START = 'TASK_START',
  TASK_PLANNING = 'TASK_PLANNING',
  TASK_ACTING = 'TASK_ACTING',
  TASK_COMPLETE = 'TASK_COMPLETE',
  TASK_CANCEL = 'TASK_CANCEL',
  TASK_FAIL = 'TASK_FAIL',
  ACT_START = 'ACT_START',
  ACT_OK = 'ACT_OK',
  ACT_FAIL = 'ACT_FAIL',
  PLAN_START = 'PLAN_START',
  PLAN_OK = 'PLAN_OK',
  PLAN_FAIL = 'PLAN_FAIL',
}

export enum Actors {
  NAVIGATOR = 'NAVIGATOR',
  PLANNER = 'PLANNER',
  VALIDATOR = 'VALIDATOR',
  EXECUTOR = 'EXECUTOR',
}

export interface ExecutionEvent {
  type: string;
  actor: string;
  state: ExecutionState;
  timestamp: number;
  data?: any;
  message?: string;
}

export interface EventHandler {
  (event: ExecutionEvent): void;
}
