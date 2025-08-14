export enum EventType {
  EXECUTION = 'execution',
}

export enum ExecutionState {
  TASK_START = 'task_start',
  TASK_OK = 'task_ok',
  TASK_FAIL = 'task_fail',
  TASK_CANCEL = 'task_cancel',
  TASK_PAUSE = 'task_pause',
  TASK_RESUME = 'task_resume',
  STEP_START = 'step_start',
  STEP_OK = 'step_ok',
  STEP_FAIL = 'step_fail',
  STEP_CANCEL = 'step_cancel',
  ACT_START = 'action_start',
  ACT_OK = 'action_ok',
  ACT_FAIL = 'action_fail',
}

export interface AgentEvent {
  type: EventType;
  actor: string;
  state: ExecutionState;
  timestamp: number;
  data?: any;
}
