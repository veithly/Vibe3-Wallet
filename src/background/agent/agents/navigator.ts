import { BaseAgent } from './base';
import type { BaseAgentOptions, ExtraAgentOptions } from './base';
import { createLogger } from '@/utils/logger';
import { ActionResult, agentBrainSchema } from './types';
import type { AgentOutput } from './types';
import type { Action } from '../actions/builder';
import { buildDynamicActionSchema } from '../actions/builder';
import { HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
// Note: These imports would need to be adapted for Rabby's event system
// import { Actors, ExecutionState } from '../event/types';
import {
  ChatModelAuthError,
  ChatModelForbiddenError,
  EXTENSION_CONFLICT_ERROR_MESSAGE,
  ExtensionConflictError,
  isAbortedError,
  isAuthenticationError,
  isExtensionConflictError,
  isForbiddenError,
  LLM_FORBIDDEN_ERROR_MESSAGE,
  RequestCancelledError,
} from './errors';
// Note: These imports would need browser integration
// import { calcBranchPathHashSet } from '../../browser/dom/views';
// import { type BrowserState, BrowserStateHistory, URLNotAllowedError } from '../../browser/views';
// import { HistoryTreeProcessor } from '../../browser/dom/history/service';
// import { AgentStepRecord } from '../history';
// import { type DOMHistoryElement } from '../../browser/dom/history/view';

const logger = createLogger('NavigatorAgent');

interface ParsedModelOutput {
  current_state?: {
    next_goal?: string;
  };
  action?: (Record<string, unknown> | null)[] | null;
}

export class NavigatorActionRegistry {
  private actions: Record<string, Action> = {};

  constructor(actions: Action[]) {
    for (const action of actions) {
      this.registerAction(action);
    }
  }

  registerAction(action: Action): void {
    this.actions[action.name()] = action;
  }

  unregisterAction(name: string): void {
    delete this.actions[name];
  }

  getAction(name: string): Action | undefined {
    return this.actions[name];
  }

  setupModelOutputSchema(): any {
    return buildDynamicActionSchema(Object.values(this.actions));
  }
}

export interface NavigatorResult {
  done: boolean;
}

export class NavigatorAgent extends BaseAgent<any, NavigatorResult> {
  private actionRegistry: NavigatorActionRegistry;
  private jsonSchema: Record<string, unknown>;
  // private _stateHistory: BrowserStateHistory | null = null;

  constructor(
    actionRegistry: NavigatorActionRegistry,
    options: BaseAgentOptions,
    extraOptions?: Partial<ExtraAgentOptions>
  ) {
    super(actionRegistry.setupModelOutputSchema(), options, {
      ...extraOptions,
      id: 'navigator',
    });

    this.actionRegistry = actionRegistry;

    // The zod object is too complex to be used directly, so we need to convert it to json schema first for the model to use
    this.jsonSchema = {};
  }

  async invoke(inputMessages: BaseMessage[]): Promise<this['ModelOutput']> {
    // Use structured output
    if (this.withStructuredOutput) {
      const structuredLlm = this.chatLLM.withStructuredOutput(this.jsonSchema, {
        includeRaw: true,
        name: this.modelOutputToolName,
      });

      let response: { parsed: any; raw: BaseMessage } | undefined = undefined;
      try {
        response = await structuredLlm.invoke(inputMessages, {
          signal: this.context.controller.signal,
          ...this.callOptions,
        });

        if (response.parsed) {
          return response.parsed;
        }
      } catch (error) {
        if (isAbortedError(error)) {
          throw error;
        }
        const errorMessage = `Failed to invoke ${this.modelName} with structured output: ${error}`;
        throw new Error(errorMessage);
      }

      // Use type assertion to access the properties
      const rawResponse = response.raw as BaseMessage & {
        tool_calls?: Array<{
          args: {
            currentState: any;
            action: any;
          };
        }>;
      };

      // sometimes LLM returns an empty content, but with one or more tool calls, so we need to check the tool calls
      if (rawResponse.tool_calls && rawResponse.tool_calls.length > 0) {
        logger.info(
          'Navigator structuredLlm tool call with empty content',
          rawResponse.tool_calls
        );
        // only use the first tool call
        const toolCall = rawResponse.tool_calls[0];
        return {
          current_state: toolCall.args.currentState,
          action: [...(toolCall.args.action as any[])],
        };
      }
      throw new Error('Could not parse response');
    }

    // Fallback to parent class manual JSON extraction for models without structured output support
    return super.invoke(inputMessages);
  }

  async execute(): Promise<AgentOutput<NavigatorResult>> {
    const agentOutput: AgentOutput<NavigatorResult> = {
      id: this.id,
    };

    let cancelled = false;
    let modelOutputString: string | null = null;
    // let browserStateHistory: BrowserStateHistory | null = null;
    let actionResults: ActionResult[] = [];

    try {
      // this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.STEP_START, 'Navigating...');

      const messageManager = this.context.messageManager;
      // add the browser state message
      await this.addStateMessageToMemory();
      // const currentState = await this.context.browserContext.getCachedState();
      // browserStateHistory = new BrowserStateHistory(currentState);

      // check if the task is paused or stopped
      if (this.context.paused || this.context.stopped) {
        cancelled = true;
        return agentOutput;
      }

      // call the model to get the actions to take
      const inputMessages = messageManager.getMessages();
      // logger.info('Navigator input message', inputMessages[inputMessages.length - 1]);

      const modelOutput = await this.invoke(inputMessages);

      // check if the task is paused or stopped
      if (this.context.paused || this.context.stopped) {
        cancelled = true;
        return agentOutput;
      }

      const actions = this.fixActions(modelOutput);
      modelOutput.action = actions;
      modelOutputString = JSON.stringify(modelOutput);

      // remove the last state message from memory before adding the model output
      this.removeLastStateMessageFromMemory();
      this.addModelOutputToMemory(modelOutput);

      // take the actions
      actionResults = await this.doMultiAction(actions);
      // logger.info('Action results', JSON.stringify(actionResults, null, 2));

      this.context.actionResults = actionResults;

      // check if the task is paused or stopped
      if (this.context.paused || this.context.stopped) {
        cancelled = true;
        return agentOutput;
      }
      // emit event
      // this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.STEP_OK, 'Navigation done');
      let done = false;
      if (
        actionResults.length > 0 &&
        actionResults[actionResults.length - 1].isDone
      ) {
        done = true;
      }
      agentOutput.result = { done };
      return agentOutput;
    } catch (error) {
      this.removeLastStateMessageFromMemory();
      // Check if this is an authentication error
      if (isAuthenticationError(error)) {
        throw new ChatModelAuthError(
          'Navigator API Authentication failed. Please verify your API key',
          error
        );
      }
      if (isForbiddenError(error)) {
        throw new ChatModelForbiddenError(LLM_FORBIDDEN_ERROR_MESSAGE, error);
      }
      if (isAbortedError(error)) {
        throw new RequestCancelledError((error as Error).message);
      }
      // if (error instanceof URLNotAllowedError) {
      //   throw error;
      // }
      if (isExtensionConflictError(error)) {
        throw new ExtensionConflictError(
          EXTENSION_CONFLICT_ERROR_MESSAGE,
          error
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorString = `Navigation failed: ${errorMessage}`;

      logger.error(errorString);
      // this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.STEP_FAIL, errorString);
      agentOutput.error = errorMessage;
      return agentOutput;
    } finally {
      // if the task is cancelled, remove the last state message from memory and emit event
      if (cancelled) {
        this.removeLastStateMessageFromMemory();
        // this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.STEP_CANCEL, 'Navigation cancelled');
      }
      // TODO: Add history recording when browser integration is complete
      // if (browserStateHistory) {
      //   const actionResultsCopy = actionResults.map(result => {
      //     return new ActionResult({
      //       isDone: result.isDone,
      //       success: result.success,
      //       extractedContent: result.extractedContent,
      //       error: result.error,
      //       includeInMemory: result.includeInMemory,
      //       interactedElement: result.interactedElement,
      //     });
      //   });
      //   const history = new AgentStepRecord(modelOutputString, actionResultsCopy, browserStateHistory);
      //   this.context.history.history.push(history);
      // }
    }
  }

  /**
   * Add the state message to the memory
   */
  public async addStateMessageToMemory() {
    if (this.context.stateMessageAdded) {
      return;
    }

    const messageManager = this.context.messageManager;
    // Handle results that should be included in memory
    if (this.context.actionResults.length > 0) {
      let index = 0;
      for (const r of this.context.actionResults) {
        if (r.includeInMemory) {
          if (r.extractedContent) {
            const msg = new HumanMessage(
              `Action result: ${r.extractedContent}`
            );
            // logger.info('Adding action result to memory', msg.content);
            messageManager.addMessageWithTokens(msg);
          }
          if (r.error) {
            // Get error text and convert to string
            const errorText = r.error.toString().trim();

            // Get only the last line of the error
            const lastLine = errorText.split('\n').pop() || '';

            const msg = new HumanMessage(`Action error: ${lastLine}`);
            logger.info('Adding action error to memory', msg.content);
            messageManager.addMessageWithTokens(msg);
          }
          // reset this action result to empty, we dont want to add it again in the state message
          // NOTE: in python version, all action results are reset to empty, but in ts version, only those included in memory are reset to empty
          this.context.actionResults[index] = new ActionResult();
        }
        index++;
      }
    }

    const state = await this.prompt.getUserMessage(this.context);
    messageManager.addStateMessage(state);
    this.context.stateMessageAdded = true;
  }

  /**
   * Remove the last state message from the memory
   */
  protected async removeLastStateMessageFromMemory() {
    if (!this.context.stateMessageAdded) return;
    const messageManager = this.context.messageManager;
    messageManager.removeLastStateMessage();
    this.context.stateMessageAdded = false;
  }

  private async addModelOutputToMemory(modelOutput: this['ModelOutput']) {
    const messageManager = this.context.messageManager;
    messageManager.addModelOutput(modelOutput);
  }

  /**
   * Fix the actions to be an array of objects, sometimes the action is a string or an object
   * @param response
   * @returns
   */
  private fixActions(response: this['ModelOutput']): Record<string, unknown>[] {
    let actions: Record<string, unknown>[] = [];
    if (Array.isArray(response.action)) {
      // if the item is null, skip it
      actions = response.action.filter((item: unknown) => item !== null);
      if (actions.length === 0) {
        logger.warn('No valid actions found', response.action);
      }
    } else if (typeof response.action === 'string') {
      try {
        logger.warn('Unexpected action format', response.action);
        // First try to parse the action string directly
        actions = JSON.parse(response.action);
      } catch (parseError) {
        try {
          // If direct parsing fails, try to fix the JSON first
          const fixedAction = response.action as string;
          logger.info('Fixed action string', fixedAction);
          actions = JSON.parse(fixedAction);
        } catch (error) {
          logger.error(
            'Invalid action format even after repair attempt',
            response.action
          );
          throw new Error('Invalid action output format');
        }
      }
    } else {
      // if the action is neither an array nor a string, it should be an object
      actions = [response.action];
    }
    return actions;
  }

  private async doMultiAction(
    actions: Record<string, unknown>[]
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    let errCount = 0;
    logger.info('Actions', actions);

    // TODO: Add browser context integration
    // const browserContext = this.context.browserContext;
    // const browserState = await browserContext.getState(this.context.options.useVision);
    // const cachedPathHashes = await calcBranchPathHashSet(browserState);
    // await browserContext.removeHighlight();

    for (const [i, action] of actions.entries()) {
      const actionName = Object.keys(action)[0];
      const actionArgs = action[actionName];
      try {
        // check if the task is paused or stopped
        if (this.context.paused || this.context.stopped) {
          return results;
        }

        const actionInstance = this.actionRegistry.getAction(actionName);
        if (actionInstance === undefined) {
          throw new Error(`Action ${actionName} not exists`);
        }

        // TODO: Add element checking when browser integration is complete
        // const indexArg = actionInstance.getIndexArg(actionArgs);
        // if (i > 0 && indexArg !== null) {
        //   const newState = await browserContext.getState(this.context.options.useVision);
        //   const newPathHashes = await calcBranchPathHashSet(newState);
        //   // next action requires index but there are new elements on the page
        //   if (!newPathHashes.isSubsetOf(cachedPathHashes)) {
        //     const msg = `Something new appeared after action ${i} / ${actions.length}`;
        //     logger.info(msg);
        //     results.push(
        //       new ActionResult({
        //         extractedContent: msg,
        //         includeInMemory: true,
        //       }),
        //     );
        //     break;
        //   }
        // }

        const result = await actionInstance.call(actionArgs);
        if (result === undefined) {
          throw new Error(`Action ${actionName} returned undefined`);
        }

        // TODO: Add DOM element interaction recording when browser integration is complete
        // if (indexArg !== null) {
        //   const domElement = browserState.selectorMap.get(indexArg);
        //   if (domElement) {
        //     const interactedElement = HistoryTreeProcessor.convertDomElementToHistoryElement(domElement);
        //     result.interactedElement = interactedElement;
        //     logger.info('Interacted element', interactedElement);
        //     logger.info('Result', result);
        //   }
        // }
        results.push(result);

        // check if the task is paused or stopped
        if (this.context.paused || this.context.stopped) {
          return results;
        }
        // TODO: wait for 1 second for now, need to optimize this to avoid unnecessary waiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        // if (error instanceof URLNotAllowedError) {
        //   throw error;
        // }
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          'doAction error',
          actionName,
          JSON.stringify(actionArgs, null, 2),
          JSON.stringify(errorMessage, null, 2)
        );
        // unexpected error, emit event
        // this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, errorMessage);
        errCount++;
        if (errCount > 3) {
          throw new Error('Too many errors in actions');
        }
        results.push(
          new ActionResult({
            error: errorMessage,
            isDone: false,
            includeInMemory: true,
          })
        );
      }
    }
    return results;
  }

  // TODO: Add history methods when browser integration is complete
  // Additional methods for history execution would go here...
}
