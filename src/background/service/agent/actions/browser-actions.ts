import type { AgentContext } from '../types';
import type { ActionResult } from '../types';
import type {
  ClickElementActionParams,
  InputTextActionParams,
  GoToUrlActionParams,
  ScrollToPercentActionParams,
  SwitchTabActionParams,
  OpenTabActionParams,
  CloseTabActionParams,
  WaitActionParams,
} from './schemas';

export class BrowserAction {
  private readonly context: AgentContext;

  constructor(context: AgentContext) {
    this.context = context;
  }

  async clickElement(params: ClickElementActionParams): Promise<ActionResult> {
    try {
      if (typeof params.index !== 'number' || params.index < 0) {
        return {
          success: false,
          error: 'Invalid element index. Must be a non-negative number.',
          code: 'INVALID_ELEMENT_INDEX',
        };
      }

      const tab = await this.getCurrentTab();
      if (!tab) {
        return {
          success: false,
          error: 'No active tab found. Please open a tab first.',
          code: 'NO_ACTIVE_TAB',
        };
      }

      // Execute click action in the tab
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: (index: number) => {
          const elements = document.querySelectorAll(
            'button, a, input[type="button"], input[type="submit"], [role="button"]'
          );
          if (index >= elements.length) {
            return {
              success: false,
              error: `Element index ${index} out of range. Found ${elements.length} clickable elements.`,
            };
          }
          const element = elements[index];
          if (element) {
            (element as HTMLElement).click();
            return {
              success: true,
              elementTag: element.tagName,
              elementIndex: index,
            };
          }
          return { success: false, error: 'Element not found' };
        },
        args: [params.index],
      });

      const result = results[0]?.result;
      if (!result?.success) {
        return {
          success: false,
          error: result?.error || 'Failed to click element',
          code: 'ELEMENT_CLICK_FAILED',
        };
      }

      return {
        success: true,
        data: {
          elementTag: result.elementTag,
          elementIndex: result.elementIndex,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to click element: ${errorMessage}`,
        code: 'ELEMENT_CLICK_ERROR',
        details: { originalError: errorMessage },
      };
    }
  }

  async inputText(params: InputTextActionParams): Promise<ActionResult> {
    try {
      if (typeof params.index !== 'number' || params.index < 0) {
        return {
          success: false,
          error: 'Invalid element index. Must be a non-negative number.',
          code: 'INVALID_ELEMENT_INDEX',
        };
      }

      if (!params.text || typeof params.text !== 'string') {
        return {
          success: false,
          error: 'Text to input is required and must be a string.',
          code: 'INVALID_TEXT_INPUT',
        };
      }

      const tab = await this.getCurrentTab();
      if (!tab) {
        return {
          success: false,
          error: 'No active tab found. Please open a tab first.',
          code: 'NO_ACTIVE_TAB',
        };
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: (index: number, text: string) => {
          const inputs = document.querySelectorAll(
            'input[type="text"], input[type="email"], input[type="password"], textarea, [contenteditable="true"]'
          );
          if (index >= inputs.length) {
            return {
              success: false,
              error: `Input element index ${index} out of range. Found ${inputs.length} input elements.`,
            };
          }
          const element = inputs[index];
          if (element) {
            const inputElement = element as
              | HTMLInputElement
              | HTMLTextAreaElement;
            inputElement.value = text;
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            return {
              success: true,
              elementTag: element.tagName,
              elementIndex: index,
            };
          }
          return { success: false, error: 'Input element not found' };
        },
        args: [params.index, params.text],
      });

      const result = results[0]?.result;
      if (!result?.success) {
        return {
          success: false,
          error: result?.error || 'Failed to input text',
          code: 'INPUT_TEXT_FAILED',
        };
      }

      return {
        success: true,
        data: {
          elementTag: result.elementTag,
          elementIndex: result.elementIndex,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to input text: ${errorMessage}`,
        code: 'INPUT_TEXT_ERROR',
        details: { originalError: errorMessage },
      };
    }
  }

  async navigateTo(params: GoToUrlActionParams): Promise<ActionResult> {
    try {
      const tab = await this.getCurrentTab();
      if (!tab) {
        return {
          success: false,
          error: 'No active tab found',
        };
      }

      await chrome.tabs.update(tab.id!, { url: params.url });

      // Wait for navigation to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return {
        success: true,
        data: { url: params.url },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async scrollToPercent(
    params: ScrollToPercentActionParams
  ): Promise<ActionResult> {
    try {
      const tab = await this.getCurrentTab();
      if (!tab) {
        return {
          success: false,
          error: 'No active tab found',
        };
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: (percent: number) => {
          const scrollHeight =
            document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo(0, scrollHeight * (percent / 100));
        },
        args: [params.yPercent],
      });

      return {
        success: true,
        data: { percent: params.yPercent },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async switchTab(params: SwitchTabActionParams): Promise<ActionResult> {
    try {
      await chrome.tabs.update(params.tab_id, { active: true });

      return {
        success: true,
        data: { tabId: params.tab_id },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async openTab(params: OpenTabActionParams): Promise<ActionResult> {
    try {
      const tab = await chrome.tabs.create({ url: params.url });

      return {
        success: true,
        data: { tabId: tab.id, url: params.url },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async closeTab(params: CloseTabActionParams): Promise<ActionResult> {
    try {
      await chrome.tabs.remove(params.tab_id);

      return {
        success: true,
        data: { tabId: params.tab_id },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async wait(params: WaitActionParams): Promise<ActionResult> {
    try {
      const seconds = params.seconds || 3; // Default to 3 seconds
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

      return {
        success: true,
        data: { seconds },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async getCurrentTab(): Promise<chrome.tabs.Tab | undefined> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  async executeAction(actionName: string, params: any): Promise<ActionResult> {
    switch (actionName) {
      case 'click':
        return this.clickElement(params);
      case 'inputText':
        return this.inputText(params);
      case 'navigate':
        return this.navigateTo(params);
      case 'scroll':
        return this.scrollToPercent(params);
      case 'switchTab':
        return this.switchTab(params);
      case 'openTab':
        return this.openTab(params);
      case 'closeTab':
        return this.closeTab(params);
      case 'wait':
        return this.wait(params);
      default:
        return {
          success: false,
          error: `Unknown browser action: ${actionName}`,
        };
    }
  }
}
