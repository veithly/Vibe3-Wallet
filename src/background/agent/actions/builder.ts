import { ActionResult } from '../types';
import type { AgentContext } from '../types';
import {
  clickElementActionSchema,
  doneActionSchema,
  goBackActionSchema,
  goToUrlActionSchema,
  inputTextActionSchema,
  openTabActionSchema,
  searchGoogleActionSchema,
  switchTabActionSchema,
  ActionSchema,
  sendKeysActionSchema,
  scrollToTextActionSchema,
  cacheContentActionSchema,
  selectDropdownOptionActionSchema,
  getDropdownOptionsActionSchema,
  closeTabActionSchema,
  waitActionSchema,
  previousPageActionSchema,
  scrollToPercentActionSchema,
  nextPageActionSchema,
  scrollToTopActionSchema,
  scrollToBottomActionSchema,
} from './schemas';
import { createLogger } from '@/utils/logger';
import { ExecutionState, Actors } from '../events/types';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { wrapUntrustedContent } from '../messages/utils';

const logger = createLogger('Action');

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}

/**
 * An action is a function that takes an input and returns an ActionResult
 */
export class Action {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly handler: (input: any) => Promise<ActionResult>,
    public readonly schema: ActionSchema,
    // Whether this action has an index argument
    public readonly hasIndex: boolean = false
  ) {}

  async call(input: unknown): Promise<ActionResult> {
    return await this.handler(input);
  }

  name() {
    return this.schema.name;
  }

  /**
   * Returns the prompt for the action
   * @returns {string} The prompt for the action
   */
  prompt() {
    // Simplified prompt generation without Zod introspection
    return `${this.schema.description}:\n{${this.name()}: {}}`;
  }

  /**
   * Get the index argument from the input if this action has an index
   * @param input The input to extract the index from
   * @returns The index value if found, null otherwise
   */
  getIndexArg(input: unknown): number | null {
    if (!this.hasIndex) {
      return null;
    }
    if (input && typeof input === 'object' && 'index' in input) {
      return (input as { index: number }).index;
    }
    return null;
  }

  /**
   * Set the index argument in the input if this action has an index
   * @param input The input to update the index in
   * @param newIndex The new index value to set
   * @returns Whether the index was set successfully
   */
  setIndexArg(input: unknown, newIndex: number): boolean {
    if (!this.hasIndex) {
      return false;
    }
    if (input && typeof input === 'object') {
      (input as { index: number }).index = newIndex;
      return true;
    }
    return false;
  }
}

// TODO: can not make every action optional, don't know why
export function buildDynamicActionSchema(actions: Action[]): any {
  const schema: Record<string, any> = {};
  for (const action of actions) {
    schema[action.name()] = { description: action.schema.description };
  }
  return schema;
}

export class ActionBuilder {
  private readonly context: AgentContext;
  private readonly extractorLLM: BaseChatModel;

  constructor(context: AgentContext, extractorLLM: BaseChatModel) {
    this.context = context;
    this.extractorLLM = extractorLLM;
  }

  buildDefaultActions() {
    const actions: Action[] = [];

    const done = new Action(async (input: any) => {
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        doneActionSchema.name
      );
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_OK,
        input.text
      );
      return new ActionResult({
        isDone: true,
        extractedContent: input.text,
      });
    }, doneActionSchema);
    actions.push(done as never);

    const searchGoogle = new Action(async (input: any) => {
      const context = this.context;
      const intent = input.intent || `Searching for "${input.query}" in Google`;
      context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);

      await context.browserContext.navigateTo(
        `https://www.google.com/search?q=${input.query}`
      );

      const msg2 = `Searched for "${input.query}" in Google`;
      context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg2);
      return new ActionResult({
        extractedContent: msg2,
        includeInMemory: true,
      });
    }, searchGoogleActionSchema);
    actions.push(searchGoogle as never);

    const goToUrl = new Action(async (input: any) => {
      const intent = input.intent || `Navigating to ${input.url}`;
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );

      await this.context.browserContext.navigateTo(input.url);
      const msg2 = `Navigated to ${input.url}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg2);
      return new ActionResult({
        extractedContent: msg2,
        includeInMemory: true,
      });
    }, goToUrlActionSchema);
    actions.push(goToUrl as never);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const goBack = new Action(async (input: any) => {
      const intent = input.intent || 'Navigating back';
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );

      const page = await this.context.browserContext.getCurrentPage();
      await page.goBack();
      const msg2 = 'Navigated back';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg2);
      return new ActionResult({
        extractedContent: msg2,
        includeInMemory: true,
      });
    }, goBackActionSchema);
    actions.push(goBack as never);

    const wait = new Action(async (input: any) => {
      const seconds = input.seconds || 3;
      const intent = input.intent || `Waiting for ${seconds} seconds`;
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      const msg = `${seconds} seconds elapsed`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, waitActionSchema);
    actions.push(wait as never);

    // Element Interaction Actions
    const clickElement = new Action(
      async (input: any) => {
        const intent =
          input.intent || `Click element with index ${input.index}`;
        this.context.emitEvent(
          Actors.NAVIGATOR,
          ExecutionState.ACT_START,
          intent
        );

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          throw new Error(
            `Element with index ${input.index} does not exist - retry or use alternative actions`
          );
        }

        // Check if element is a file uploader
        if (page.isFileUploader(elementNode)) {
          const msg = `Index ${input.index} - has an element which opens file upload dialog. To upload files please use a specific function to upload files`;
          logger.info(msg);
          return new ActionResult({
            extractedContent: msg,
            includeInMemory: true,
          });
        }

        try {
          const initialTabIds = await this.context.browserContext.getAllTabIds();
          await page.clickElementNode(
            this.context.options.useVision,
            elementNode
          );
          let msg = `Clicked button with index ${
            input.index
          }: ${elementNode.getAllTextTillNextClickableElement(2)}`;
          logger.info(msg);

          // TODO: could be optimized by chrome extension tab api
          const currentTabIds = await this.context.browserContext.getAllTabIds();
          if (currentTabIds.size > initialTabIds.size) {
            const newTabMsg = 'New tab opened - switching to it';
            msg += ` - ${newTabMsg}`;
            logger.info(newTabMsg);
            // find the tab id that is not in the initial tab ids
            const newTabId = Array.from(currentTabIds).find(
              (id) => !initialTabIds.has(id)
            );
            if (newTabId) {
              await this.context.browserContext.switchTab(newTabId);
            }
          }
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({
            extractedContent: msg,
            includeInMemory: true,
          });
        } catch (error) {
          const msg = `Element no longer available with index ${input.index} - most likely the page changed`;
          this.context.emitEvent(
            Actors.NAVIGATOR,
            ExecutionState.ACT_FAIL,
            msg
          );
          return new ActionResult({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      clickElementActionSchema,
      true
    );
    actions.push(clickElement as never);

    const inputText = new Action(
      async (input: any) => {
        const intent = input.intent || `Input text into index ${input.index}`;
        this.context.emitEvent(
          Actors.NAVIGATOR,
          ExecutionState.ACT_START,
          intent
        );

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          throw new Error(
            `Element with index ${input.index} does not exist - retry or use alternative actions`
          );
        }

        await page.inputTextElementNode(
          this.context.options.useVision,
          elementNode,
          input.text
        );
        const msg = `Input ${input.text} into index ${input.index}`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
        return new ActionResult({
          extractedContent: msg,
          includeInMemory: true,
        });
      },
      inputTextActionSchema,
      true
    );
    actions.push(inputText as never);

    // Tab Management Actions
    const switchTab = new Action(async (input: any) => {
      const intent = input.intent || `Switching to tab ${input.tab_id}`;
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );
      await this.context.browserContext.switchTab(input.tab_id);
      const msg = `Switched to tab ${input.tab_id}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, switchTabActionSchema);
    actions.push(switchTab as never);

    const openTab = new Action(async (input: any) => {
      const intent = input.intent || `Opening ${input.url} in new tab`;
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );
      await this.context.browserContext.openTab(input.url);
      const msg = `Opened ${input.url} in new tab`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, openTabActionSchema);
    actions.push(openTab as never);

    const closeTab = new Action(async (input: any) => {
      const intent = input.intent || `Closing tab ${input.tab_id}`;
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );
      await this.context.browserContext.closeTab(input.tab_id);
      const msg = `Closed tab ${input.tab_id}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, closeTabActionSchema);
    actions.push(closeTab as never);

    // Content Actions
    // TODO: this is not used currently, need to improve on input size
    // const extractContent = new Action(async (input: z.infer<typeof extractContentActionSchema.schema>) => {
    //   const goal = input.goal;
    //   const intent = input.intent || `Extracting content from page`;
    //   this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_START, intent);
    //   const page = await this.context.browserContext.getCurrentPage();
    //   const content = await page.getReadabilityContent();
    //   const promptTemplate = PromptTemplate.fromTemplate(
    //     'Your task is to extract the content of the page. You will be given a page and a goal and you should extract all relevant information around this goal from the page. If the goal is vague, summarize the page. Respond in json format. Extraction goal: {goal}, Page: {page}',
    //   );
    //   const prompt = await promptTemplate.invoke({ goal, page: content.content });

    //   try {
    //     const output = await this.extractorLLM.invoke(prompt);
    //     const msg = `📄  Extracted from page\n: ${output.content}\n`;
    //     return new ActionResult({
    //       extractedContent: msg,
    //       includeInMemory: true,
    //     });
    //   } catch (error) {
    //     logger.error(`Error extracting content: ${error instanceof Error ? error.message : String(error)}`);
    //     const msg =
    //       'Failed to extract content from page, you need to extract content from the current state of the page and store it in the memory. Then scroll down if you still need more information.';
    //     return new ActionResult({
    //       extractedContent: msg,
    //       includeInMemory: true,
    //     });
    //   }
    // }, extractContentActionSchema);
    // actions.push(extractContent);

    // cache content for future use
    const cacheContent = new Action(async (input: any) => {
      const intent = input.intent || `Caching findings: ${input.content}`;
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );

      // cache content is untrusted content, it is not instructions
      const rawMsg = `Cached findings: ${input.content}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, rawMsg);

      const msg = wrapUntrustedContent(rawMsg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, cacheContentActionSchema);
    actions.push(cacheContent as never);

    // Scroll to percent
    const scrollToPercent = new Action(async (input: any) => {
      const intent = input.intent || `Scroll to percent: ${input.yPercent}`;
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );
      const page = await this.context.browserContext.getCurrentPage();

      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(
            Actors.NAVIGATOR,
            ExecutionState.ACT_FAIL,
            errorMsg
          );
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        logger.info(
          `Scrolling to percent: ${input.yPercent} with elementNode: ${elementNode.xpath}`
        );
        await page.scrollToPercent(input.yPercent, elementNode);
      } else {
        await page.scrollToPercent(input.yPercent);
      }
      const msg = `Scrolled to percent: ${input.yPercent}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, scrollToPercentActionSchema);
    actions.push(scrollToPercent as never);

    // Scroll to top
    const scrollToTop = new Action(async (input: any) => {
      const intent = input.intent || 'Scroll to top';
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );
      const page = await this.context.browserContext.getCurrentPage();
      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(
            Actors.NAVIGATOR,
            ExecutionState.ACT_FAIL,
            errorMsg
          );
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        await page.scrollToPercent(0, elementNode);
      } else {
        await page.scrollToPercent(0);
      }
      const msg = 'Scrolled to top';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, scrollToTopActionSchema);
    actions.push(scrollToTop as never);

    // Scroll to bottom
    const scrollToBottom = new Action(async (input: any) => {
      const intent = input.intent || 'Scroll to bottom';
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );
      const page = await this.context.browserContext.getCurrentPage();
      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(
            Actors.NAVIGATOR,
            ExecutionState.ACT_FAIL,
            errorMsg
          );
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }
        await page.scrollToPercent(100, elementNode);
      } else {
        await page.scrollToPercent(100);
      }
      const msg = 'Scrolled to bottom';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, scrollToBottomActionSchema);
    actions.push(scrollToBottom as never);

    // Scroll to previous page
    const previousPage = new Action(async (input: any) => {
      const intent = input.intent || 'Scroll to previous page';
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );
      const page = await this.context.browserContext.getCurrentPage();

      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(
            Actors.NAVIGATOR,
            ExecutionState.ACT_FAIL,
            errorMsg
          );
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }

        // Check if element is already at top of its scrollable area
        try {
          const [elementScrollTop] = await page.getElementScrollInfo(
            elementNode
          );
          if (elementScrollTop === 0) {
            const msg = `Element with index ${input.index} is already at top, cannot scroll to previous page`;
            this.context.emitEvent(
              Actors.NAVIGATOR,
              ExecutionState.ACT_OK,
              msg
            );
            return new ActionResult({
              extractedContent: msg,
              includeInMemory: true,
            });
          }
        } catch (error) {
          // If we can't get scroll info, let the scrollToPreviousPage method handle it
          logger.info(
            `Could not get element scroll info: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }

        await page.scrollToPreviousPage(elementNode);
      } else {
        // Check if page is already at top
        const [initialScrollY] = await page.getScrollInfo();
        if (initialScrollY === 0) {
          const msg = 'Already at top of page, cannot scroll to previous page';
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({
            extractedContent: msg,
            includeInMemory: true,
          });
        }

        await page.scrollToPreviousPage();
      }
      const msg = 'Scrolled to previous page';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, previousPageActionSchema);
    actions.push(previousPage as never);

    // Scroll to next page
    const nextPage = new Action(async (input: any) => {
      const intent = input.intent || 'Scroll to next page';
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );
      const page = await this.context.browserContext.getCurrentPage();

      if (input.index) {
        const state = await page.getCachedState();
        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(
            Actors.NAVIGATOR,
            ExecutionState.ACT_FAIL,
            errorMsg
          );
          return new ActionResult({ error: errorMsg, includeInMemory: true });
        }

        // Check if element is already at bottom of its scrollable area
        try {
          const [
            elementScrollTop,
            elementClientHeight,
            elementScrollHeight,
          ] = await page.getElementScrollInfo(elementNode);
          if (elementScrollTop + elementClientHeight >= elementScrollHeight) {
            const msg = `Element with index ${input.index} is already at bottom, cannot scroll to next page`;
            this.context.emitEvent(
              Actors.NAVIGATOR,
              ExecutionState.ACT_OK,
              msg
            );
            return new ActionResult({
              extractedContent: msg,
              includeInMemory: true,
            });
          }
        } catch (error) {
          // If we can't get scroll info, let the scrollToNextPage method handle it
          logger.info(
            `Could not get element scroll info: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }

        await page.scrollToNextPage(elementNode);
      } else {
        // Check if page is already at bottom
        const [
          initialScrollY,
          initialVisualViewportHeight,
          initialScrollHeight,
        ] = await page.getScrollInfo();
        if (
          initialScrollY + initialVisualViewportHeight >=
          initialScrollHeight
        ) {
          const msg = 'Already at bottom of page, cannot scroll to next page';
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({
            extractedContent: msg,
            includeInMemory: true,
          });
        }

        await page.scrollToNextPage();
      }
      const msg = 'Scrolled to next page';
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, nextPageActionSchema);
    actions.push(nextPage as never);

    // Scroll to text
    const scrollToText = new Action(async (input: any) => {
      const intent =
        input.intent ||
        `Scroll to text: ${input.text}${
          input.nth > 1
            ? ` (${input.nth}${
                input.nth === 2 ? 'nd' : input.nth === 3 ? 'rd' : 'th'
              } occurrence)`
            : ''
        }`;
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );

      const page = await this.context.browserContext.getCurrentPage();
      try {
        const scrolled = await page.scrollToText(input.text, input.nth);
        const msg = scrolled
          ? `Scrolled to text: ${input.text}${
              input.nth > 1
                ? ` (${input.nth}${
                    input.nth === 2 ? 'nd' : input.nth === 3 ? 'rd' : 'th'
                  } occurrence)`
                : ''
            }`
          : `Text '${input.text}' not found or not visible on page${
              input.nth > 1
                ? ` (${input.nth}${
                    input.nth === 2 ? 'nd' : input.nth === 3 ? 'rd' : 'th'
                  } occurrence)`
                : ''
            }`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
        return new ActionResult({
          extractedContent: msg,
          includeInMemory: true,
        });
      } catch (error) {
        const msg = `Failed to scroll to text: ${
          error instanceof Error ? error.message : String(error)
        }`;
        this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_FAIL, msg);
        return new ActionResult({ error: msg, includeInMemory: true });
      }
    }, scrollToTextActionSchema);
    actions.push(scrollToText as never);

    // Keyboard Actions
    const sendKeys = new Action(async (input: any) => {
      const intent = input.intent || `Send keys: ${input.keys}`;
      this.context.emitEvent(
        Actors.NAVIGATOR,
        ExecutionState.ACT_START,
        intent
      );

      const page = await this.context.browserContext.getCurrentPage();
      await page.sendKeys(input.keys);
      const msg = `Sent keys: ${input.keys}`;
      this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
      return new ActionResult({ extractedContent: msg, includeInMemory: true });
    }, sendKeysActionSchema);
    actions.push(sendKeys as never);

    // Get all options from a native dropdown
    const getDropdownOptions = new Action(
      async (input: any) => {
        const intent =
          input.intent ||
          `Getting options from dropdown with index ${input.index}`;
        this.context.emitEvent(
          Actors.NAVIGATOR,
          ExecutionState.ACT_START,
          intent
        );

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          logger.error(errorMsg);
          this.context.emitEvent(
            Actors.NAVIGATOR,
            ExecutionState.ACT_FAIL,
            errorMsg
          );
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }

        try {
          // Use the existing getDropdownOptions method
          const options = await page.getDropdownOptions(input.index);

          if (options && options.length > 0) {
            // Format options for display
            const formattedOptions: string[] = options.map((opt) => {
              // Encoding ensures AI uses the exact string in select_dropdown_option
              const encodedText = JSON.stringify(opt.text);
              return `${opt.index}: text=${encodedText}`;
            });

            let msg = formattedOptions.join('\n');
            msg += '\nUse the exact text string in select_dropdown_option';
            logger.info(msg);
            this.context.emitEvent(
              Actors.NAVIGATOR,
              ExecutionState.ACT_OK,
              `Got ${options.length} options from dropdown`
            );
            return new ActionResult({
              extractedContent: msg,
              includeInMemory: true,
            });
          }

          // This code should not be reached as getDropdownOptions throws an error when no options found
          // But keeping as fallback
          const msg = 'No options found in dropdown';
          logger.info(msg);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({
            extractedContent: msg,
            includeInMemory: true,
          });
        } catch (error) {
          const errorMsg = `Failed to get dropdown options: ${
            error instanceof Error ? error.message : String(error)
          }`;
          logger.error(errorMsg);
          this.context.emitEvent(
            Actors.NAVIGATOR,
            ExecutionState.ACT_FAIL,
            errorMsg
          );
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }
      },
      getDropdownOptionsActionSchema,
      true
    );
    actions.push(getDropdownOptions as never);

    // Select dropdown option for interactive element index by the text of the option you want to select'
    const selectDropdownOption = new Action(
      async (input: any) => {
        const intent =
          input.intent ||
          `Select option "${input.text}" from dropdown with index ${input.index}`;
        this.context.emitEvent(
          Actors.NAVIGATOR,
          ExecutionState.ACT_START,
          intent
        );

        const page = await this.context.browserContext.getCurrentPage();
        const state = await page.getState();

        const elementNode = state?.selectorMap.get(input.index);
        if (!elementNode) {
          const errorMsg = `Element with index ${input.index} does not exist - retry or use alternative actions`;
          this.context.emitEvent(
            Actors.NAVIGATOR,
            ExecutionState.ACT_FAIL,
            errorMsg
          );
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }

        // Validate that we're working with a select element
        if (
          !elementNode.tagName ||
          elementNode.tagName.toLowerCase() !== 'select'
        ) {
          const errorMsg = `Cannot select option: Element with index ${
            input.index
          } is a ${elementNode.tagName || 'unknown'}, not a SELECT`;
          logger.error(errorMsg);
          this.context.emitEvent(
            Actors.NAVIGATOR,
            ExecutionState.ACT_FAIL,
            errorMsg
          );
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }

        logger.debug(
          `Attempting to select '${input.text}' using xpath: ${elementNode.xpath}`
        );
        logger.debug(
          `Element attributes: ${JSON.stringify(elementNode.attributes)}`
        );
        logger.debug(`Element tag: ${elementNode.tagName}`);

        try {
          const result = await page.selectDropdownOption(
            input.index,
            input.text
          );
          const msg = `Selected option "${input.text}" from dropdown with index ${input.index}`;
          logger.info(msg);
          this.context.emitEvent(Actors.NAVIGATOR, ExecutionState.ACT_OK, msg);
          return new ActionResult({
            extractedContent: result,
            includeInMemory: true,
          });
        } catch (error) {
          const errorMsg = `Failed to select option: ${
            error instanceof Error ? error.message : String(error)
          }`;
          logger.error(errorMsg);
          this.context.emitEvent(
            Actors.NAVIGATOR,
            ExecutionState.ACT_FAIL,
            errorMsg
          );
          return new ActionResult({
            error: errorMsg,
            includeInMemory: true,
          });
        }
      },
      selectDropdownOptionActionSchema,
      true
    );
    actions.push(selectDropdownOption as never);

    return actions;
  }
}
