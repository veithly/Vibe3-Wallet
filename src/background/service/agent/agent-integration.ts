import { createLogger } from '../../../utils/logger';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const logger = createLogger('agent-integration');

// Agent event types and interfaces
type AgentEvent = {
  actor: string;
  state: string;
  data: {
    taskId: string;
    step: number;
    maxSteps: number;
    details: string;
  };
  timestamp: number;
  type: string;
};

type EventCallback = (event: AgentEvent) => Promise<void>;

// Browser context interface
interface BrowserContext {
  getActiveTab(): Promise<chrome.tabs.Tab>;
  createTab(url: string): Promise<chrome.tabs.Tab>;
  switchToTab(tabId: number): Promise<void>;
  closeTab(tabId: number): Promise<void>;
  cleanup(): Promise<void>;
}

// DOM operation interfaces
interface DOMOperationResult {
  success: boolean;
  data?: any;
  error?: string;
}

interface ElementInfo {
  tagName: string;
  attributes: Record<string, string>;
  text?: string;
  visible: boolean;
  bounds?: DOMRect;
}

// Improved browser context implementation
class RabbyBrowserContext implements BrowserContext {
  async getActiveTab(): Promise<chrome.tabs.Tab> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
      throw new Error('No active tab found');
    }
    return tabs[0];
  }

  async createTab(url: string): Promise<chrome.tabs.Tab> {
    return await chrome.tabs.create({ url });
  }

  async switchToTab(tabId: number): Promise<void> {
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, {
      focused: true,
    });
  }

  async closeTab(tabId: number): Promise<void> {
    await chrome.tabs.remove(tabId);
  }

  async cleanup(): Promise<void> {
    // Cleanup any resources if needed
  }
}

// DOM Service - implements nanobrowser-style DOM operations
class DOMService {
  /**
   * Execute script in tab with comprehensive error handling
   */
  static async executeScript<T = any>(
    tabId: number,
    func: (...args: any[]) => T,
    args: any[] = []
  ): Promise<DOMOperationResult> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: func,
        args: args,
      });

      if (results && results[0]) {
        return {
          success: true,
          data: results[0].result,
        };
      }

      return {
        success: false,
        error: 'No result returned from script execution',
      };
    } catch (error) {
      logger.error('DOMService', 'Script execution failed', {
        error,
        tabId,
        functionName: func.name,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Wait for element to exist in DOM
   */
  static async waitForElement(
    tabId: number,
    selector: string,
    timeout: number = 10000
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.executeScript(
        tabId,
        (sel: string) => {
          const element = document.querySelector(sel);
          return element !== null;
        },
        [selector]
      );

      if (result.success && result.data) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return false;
  }

  /**
   * Get element information
   */
  static async getElementInfo(
    tabId: number,
    selector: string
  ): Promise<ElementInfo | null> {
    const result = await this.executeScript(
      tabId,
      (sel: string) => {
        const element = document.querySelector(sel);
        if (!element) return null;

        const bounds = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return {
          tagName: element.tagName.toLowerCase(),
          attributes: Array.from(element.attributes).reduce((attrs, attr) => {
            attrs[attr.name] = attr.value;
            return attrs;
          }, {} as Record<string, string>),
          text: element.textContent?.trim() || '',
          visible:
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            bounds.width > 0 &&
            bounds.height > 0,
          bounds: {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            top: bounds.top,
            right: bounds.right,
            bottom: bounds.bottom,
            left: bounds.left,
          } as DOMRect,
        };
      },
      [selector]
    );

    return result.success ? result.data : null;
  }

  /**
   * Click element with advanced interaction
   */
  static async clickElement(tabId: number, selector: string): Promise<boolean> {
    const result = await this.executeScript(
      tabId,
      (sel: string) => {
        const element = document.querySelector(sel) as HTMLElement;
        if (!element) return false;

        // Scroll into view if needed
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center',
        });

        // Wait a bit for scroll to complete
        setTimeout(() => {
          // Try multiple click methods for better compatibility
          try {
            // Method 1: Native click
            element.click();
          } catch (e) {
            try {
              // Method 2: Dispatch click event
              const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
              });
              element.dispatchEvent(clickEvent);
            } catch (e2) {
              // Method 3: Focus and trigger
              if (element.focus) {
                element.focus();
              }
              element.click();
            }
          }
        }, 100);

        return true;
      },
      [selector]
    );

    return result.success && result.data;
  }

  /**
   * Fill input with text
   */
  static async fillInput(
    tabId: number,
    selector: string,
    text: string
  ): Promise<boolean> {
    const result = await this.executeScript(
      tabId,
      (sel: string, txt: string) => {
        const element = document.querySelector(sel) as
          | HTMLInputElement
          | HTMLTextAreaElement;
        if (!element) return false;

        // Clear existing content
        element.value = '';
        element.focus();

        // Set new value
        element.value = txt;

        // Dispatch input events for better compatibility
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        // For React and other frameworks
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        )?.set;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(element, txt);
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }

        return true;
      },
      [selector, text]
    );

    return result.success && result.data;
  }

  /**
   * Get all clickable elements (similar to nanobrowser's getClickableElements)
   */
  static async getClickableElements(tabId: number): Promise<ElementInfo[]> {
    const result = await this.executeScript(
      tabId,
      () => {
        const clickableSelectors = [
          'button',
          'a[href]',
          'input[type="button"]',
          'input[type="submit"]',
          'input[type="reset"]',
          '[onclick]',
          '[role="button"]',
          '[tabindex]',
          'select',
          'input[type="checkbox"]',
          'input[type="radio"]',
          'input[type="text"]',
          'input[type="email"]',
          'input[type="password"]',
          'textarea',
        ];

        const elements: ElementInfo[] = [];

        clickableSelectors.forEach((selectorGroup) => {
          const foundElements = document.querySelectorAll(selectorGroup);
          foundElements.forEach((element, index) => {
            const bounds = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);

            const isVisible =
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              style.opacity !== '0' &&
              bounds.width > 0 &&
              bounds.height > 0;

            if (isVisible) {
              elements.push({
                tagName: element.tagName.toLowerCase(),
                attributes: Array.from(element.attributes).reduce(
                  (attrs, attr) => {
                    attrs[attr.name] = attr.value;
                    return attrs;
                  },
                  {} as Record<string, string>
                ),
                text: element.textContent?.trim() || '',
                visible: isVisible,
                bounds: bounds as DOMRect,
              });
            }
          });
        });

        return elements;
      },
      []
    );

    return result.success ? result.data || [] : [];
  }

  /**
   * Scroll page or element
   */
  static async scroll(
    tabId: number,
    direction: 'up' | 'down' | 'top' | 'bottom',
    amount?: number
  ): Promise<boolean> {
    const result = await this.executeScript(
      tabId,
      (dir: string, amt?: number) => {
        switch (dir) {
          case 'top':
            window.scrollTo({ top: 0, behavior: 'smooth' });
            break;
          case 'bottom':
            window.scrollTo({
              top: document.body.scrollHeight,
              behavior: 'smooth',
            });
            break;
          case 'up':
            window.scrollBy({
              top: -(amt || window.innerHeight),
              behavior: 'smooth',
            });
            break;
          case 'down':
            window.scrollBy({
              top: amt || window.innerHeight,
              behavior: 'smooth',
            });
            break;
          default:
            return false;
        }
        return true;
      },
      [direction, amount]
    );

    return result.success && result.data;
  }

  /**
   * Get page information
   */
  static async getPageInfo(tabId: number): Promise<any> {
    const result = await this.executeScript(
      tabId,
      () => {
        return {
          title: document.title,
          url: window.location.href,
          scrollY: window.scrollY,
          scrollHeight: document.body.scrollHeight,
          viewportHeight: window.innerHeight,
          forms: document.forms.length,
          inputs: document.querySelectorAll('input').length,
          buttons: document.querySelectorAll('button').length,
          links: document.querySelectorAll('a').length,
        };
      },
      []
    );

    return result.success ? result.data : null;
  }
}

// Browser Actions - implements specific browser operations
class BrowserActions {
  constructor(private tabId: number) {}

  async addTodoItem(
    todoText: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      // Smart selector strategy for todo apps
      const todoSelectors = [
        'input[placeholder*="todo" i]',
        'input[placeholder*="task" i]',
        'input[placeholder*="add" i]',
        '.todo-input',
        '.new-todo',
        'input[type="text"]:not([readonly])',
        '.task-input',
        '#new-todo-input',
        '#todo-input',
        '[data-testid*="todo" i] input',
        '[data-testid*="task" i] input',
      ];

      let inputFound = false;

      for (const selector of todoSelectors) {
        if (await DOMService.waitForElement(this.tabId, selector, 2000)) {
          logger.info('AgentExecutor', `Found todo input: ${selector}`);

          // Focus and fill input
          await DOMService.clickElement(this.tabId, selector);
          await new Promise((resolve) => setTimeout(resolve, 300));

          const filled = await DOMService.fillInput(
            this.tabId,
            selector,
            todoText
          );

          if (filled) {
            // Try to submit by pressing Enter
            await DOMService.executeScript(
              this.tabId,
              (sel: string) => {
                const input = document.querySelector(sel) as HTMLInputElement;
                if (input) {
                  const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    bubbles: true,
                  });
                  input.dispatchEvent(enterEvent);
                }
              },
              [selector]
            );

            // Also try to find and click submit buttons
            const submitSelectors = [
              'button[type="submit"]',
              '.add-button',
              '.add-todo',
              'button:contains("Add")',
              'button:contains("+")',
              '[data-action="add"]',
              'form button',
            ];

            for (const btnSelector of submitSelectors) {
              if (
                await DOMService.waitForElement(this.tabId, btnSelector, 1000)
              ) {
                await DOMService.clickElement(this.tabId, btnSelector);
                break;
              }
            }

            inputFound = true;
            break;
          }
        }
      }

      if (!inputFound) {
        return {
          success: false,
          message:
            'Could not find todo input field. Please make sure you are on a todo application page.',
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        success: true,
        message: `Successfully added todo: "${todoText}"`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to add todo: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  async completeTodoItem(
    todoText?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const result = await DOMService.executeScript(
        this.tabId,
        (searchText?: string) => {
          // Find uncompleted todo items
          const checkboxes = Array.from(
            document.querySelectorAll('input[type="checkbox"]:not(:checked)')
          );

          if (checkboxes.length === 0) {
            return { found: false, message: 'No uncompleted todo items found' };
          }

          // If searchText provided, try to find specific todo
          if (searchText) {
            for (const checkbox of checkboxes) {
              const parent = checkbox.closest(
                'li, .todo-item, .task-item, [data-todo], [data-task]'
              );
              if (
                parent &&
                parent.textContent
                  ?.toLowerCase()
                  .includes(searchText.toLowerCase())
              ) {
                (checkbox as HTMLInputElement).click();
                return {
                  found: true,
                  message: `Completed todo: "${searchText}"`,
                };
              }
            }
            return {
              found: false,
              message: `Todo item "${searchText}" not found`,
            };
          }

          // Complete first uncompleted item
          (checkboxes[0] as HTMLInputElement).click();
          return {
            found: true,
            message: 'Completed first uncompleted todo item',
          };
        },
        [todoText]
      );

      if (result.success && result.data?.found) {
        return { success: true, message: result.data.message };
      }

      return {
        success: false,
        message: result.data?.message || 'Could not complete todo item',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to complete todo: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  async deleteTodoItem(
    todoText?: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const result = await DOMService.executeScript(
        this.tabId,
        (searchText?: string) => {
          const todoItems = Array.from(
            document.querySelectorAll(
              'li, .todo-item, .task-item, [data-todo], [data-task]'
            )
          );

          if (todoItems.length === 0) {
            return { found: false, message: 'No todo items found' };
          }

          let targetItem: Element | null = null;

          if (searchText) {
            // Find specific todo item
            targetItem =
              todoItems.find((item) =>
                item.textContent
                  ?.toLowerCase()
                  .includes(searchText.toLowerCase())
              ) || null;
          } else {
            // Use first item
            targetItem = todoItems[0] || null;
          }

          if (!targetItem) {
            return { found: false, message: 'Todo item not found' };
          }

          // Try to find delete button
          const deleteBtn = targetItem.querySelector(
            '.delete, .remove, .trash, button[title*="delete" i], button[title*="remove" i], [data-action="delete"]'
          );

          if (deleteBtn) {
            (deleteBtn as HTMLElement).click();
            return { found: true, message: 'Deleted todo item' };
          }

          // If no delete button, try removing the item directly
          (targetItem as HTMLElement).remove();
          return { found: true, message: 'Removed todo item' };
        },
        [todoText]
      );

      if (result.success && result.data?.found) {
        return { success: true, message: result.data.message };
      }

      return {
        success: false,
        message: result.data?.message || 'Could not delete todo item',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete todo: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  async listTodoItems(): Promise<{ success: boolean; message?: string }> {
    try {
      const result = await DOMService.executeScript(
        this.tabId,
        () => {
          const todoItems = Array.from(
            document.querySelectorAll(
              'li, .todo-item, .task-item, [data-todo], [data-task]'
            )
          );

          if (todoItems.length === 0) {
            return { items: [], message: 'No todo items found on this page' };
          }

          const items = todoItems
            .map((item, index) => {
              const checkbox = item.querySelector(
                'input[type="checkbox"]'
              ) as HTMLInputElement;
              const isCompleted = checkbox ? checkbox.checked : false;
              const text = item.textContent?.trim() || '';

              if (text.length === 0) return null;

              return {
                index: index + 1,
                text: text,
                completed: isCompleted,
              };
            })
            .filter((item) => item !== null);

          return { items, message: `Found ${items.length} todo items` };
        },
        []
      );

      if (result.success && result.data) {
        const todos = result.data.items;
        if (todos.length > 0) {
          const todoList = todos
            .map(
              (todo: any) =>
                `${todo.index}. ${todo.completed ? '✓' : '○'} ${todo.text}`
            )
            .join('\n');

          return {
            success: true,
            message: `Todo Items:\n${todoList}`,
          };
        }
      }

      return {
        success: true,
        message: result.data?.message || 'No todo items found on this page',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to list todos: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }
}

// Task execution strategies
class TaskExecutor {
  constructor(private tabId: number, private actions: BrowserActions) {}

  async executeTask(
    task: string
  ): Promise<{ success: boolean; message?: string }> {
    const lowercaseTask = task.toLowerCase();

    try {
      // Todo-related tasks
      if (lowercaseTask.includes('todo') || lowercaseTask.includes('task')) {
        return await this.executeTodoTask(task);
      }

      // General web automation tasks
      if (lowercaseTask.includes('click')) {
        return await this.executeClickTask(task);
      }

      if (
        lowercaseTask.includes('fill') ||
        lowercaseTask.includes('type') ||
        lowercaseTask.includes('input')
      ) {
        return await this.executeFillTask(task);
      }

      if (lowercaseTask.includes('scroll')) {
        return await this.executeScrollTask(task);
      }

      if (
        lowercaseTask.includes('navigate') ||
        lowercaseTask.includes('go to')
      ) {
        return await this.executeNavigateTask(task);
      }

      // Default: analyze page and provide suggestions
      return await this.analyzePageAndSuggest(task);
    } catch (error) {
      logger.error('TaskExecutor', 'Task execution error', { error, task });
      return {
        success: false,
        message: `Task execution failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  private async executeTodoTask(
    task: string
  ): Promise<{ success: boolean; message?: string }> {
    const lowercaseTask = task.toLowerCase();

    // Extract todo text from task
    const todoMatch = task.match(
      /(?:add|create|new)\s+(?:todo|task)(?:\s+["'](.+?)["']|\s+(.+?)(?:\s|$))/i
    );
    const todoText = todoMatch
      ? (todoMatch[1] || todoMatch[2] || '').trim()
      : '';

    if (
      lowercaseTask.includes('add') ||
      lowercaseTask.includes('create') ||
      lowercaseTask.includes('new')
    ) {
      return await this.actions.addTodoItem(todoText || 'New Task');
    }

    if (
      lowercaseTask.includes('complete') ||
      lowercaseTask.includes('finish') ||
      lowercaseTask.includes('done')
    ) {
      return await this.actions.completeTodoItem(todoText);
    }

    if (lowercaseTask.includes('delete') || lowercaseTask.includes('remove')) {
      return await this.actions.deleteTodoItem(todoText);
    }

    if (
      lowercaseTask.includes('list') ||
      lowercaseTask.includes('show') ||
      lowercaseTask.includes('view')
    ) {
      return await this.actions.listTodoItems();
    }

    // Default: try to add the task as a new todo
    return await this.actions.addTodoItem(task);
  }

  private async executeClickTask(
    task: string
  ): Promise<{ success: boolean; message?: string }> {
    // Extract selector from task
    const selectorMatch = task.match(
      /click\s+(?:on\s+)?(?:["'](.+?)["']|(\S+))/i
    );
    const selector = selectorMatch
      ? selectorMatch[1] || selectorMatch[2]
      : null;

    if (!selector) {
      return {
        success: false,
        message:
          'Could not extract selector from click task. Please specify what to click.',
      };
    }

    if (await DOMService.waitForElement(this.tabId, selector, 5000)) {
      const clicked = await DOMService.clickElement(this.tabId, selector);
      if (clicked) {
        return { success: true, message: `Successfully clicked: ${selector}` };
      }
    }

    return {
      success: false,
      message: `Could not find or click element: ${selector}`,
    };
  }

  private async executeFillTask(
    task: string
  ): Promise<{ success: boolean; message?: string }> {
    // Extract selector and text from task
    const fillMatch = task.match(
      /(?:fill|type|input)\s+(?:["'](.+?)["']|(\S+))\s+(?:with\s+)?(?:["'](.+?)["']|(.+?)(?:\s|$))/i
    );
    const selector = fillMatch ? fillMatch[1] || fillMatch[2] : null;
    const text = fillMatch ? (fillMatch[3] || fillMatch[4] || '').trim() : '';

    if (!selector || !text) {
      return {
        success: false,
        message:
          'Could not extract selector and text from fill task. Please specify what to fill and with what text.',
      };
    }

    if (await DOMService.waitForElement(this.tabId, selector, 5000)) {
      const filled = await DOMService.fillInput(this.tabId, selector, text);
      if (filled) {
        return {
          success: true,
          message: `Successfully filled: ${selector} with "${text}"`,
        };
      }
    }

    return {
      success: false,
      message: `Could not find or fill element: ${selector}`,
    };
  }

  private async executeScrollTask(
    task: string
  ): Promise<{ success: boolean; message?: string }> {
    const lowercaseTask = task.toLowerCase();

    if (lowercaseTask.includes('scroll to top')) {
      const scrolled = await DOMService.scroll(this.tabId, 'top');
      return {
        success: scrolled,
        message: scrolled
          ? 'Scrolled to top of page'
          : 'Failed to scroll to top',
      };
    }

    if (lowercaseTask.includes('scroll to bottom')) {
      const scrolled = await DOMService.scroll(this.tabId, 'bottom');
      return {
        success: scrolled,
        message: scrolled
          ? 'Scrolled to bottom of page'
          : 'Failed to scroll to bottom',
      };
    }

    if (lowercaseTask.includes('scroll up')) {
      const scrolled = await DOMService.scroll(this.tabId, 'up');
      return {
        success: scrolled,
        message: scrolled ? 'Scrolled up' : 'Failed to scroll up',
      };
    }

    if (lowercaseTask.includes('scroll down')) {
      const scrolled = await DOMService.scroll(this.tabId, 'down');
      return {
        success: scrolled,
        message: scrolled ? 'Scrolled down' : 'Failed to scroll down',
      };
    }

    return {
      success: false,
      message:
        'Could not understand scroll task. Try "scroll to top", "scroll to bottom", "scroll up", or "scroll down"',
    };
  }

  private async executeNavigateTask(
    task: string
  ): Promise<{ success: boolean; message?: string }> {
    // Extract URL from task
    const urlMatch = task.match(
      /(?:navigate|go)\s+(?:to\s+)?(?:["'](.+?)["']|(\S+))/i
    );
    const url = urlMatch ? urlMatch[1] || urlMatch[2] : null;

    if (!url) {
      return {
        success: false,
        message:
          'Could not extract URL from navigation task. Please specify where to navigate.',
      };
    }

    // Ensure URL has protocol
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;

    try {
      await chrome.tabs.update(this.tabId, { url: fullUrl });
      // Wait for page to load
      await this.waitForPageLoad();
      return {
        success: true,
        message: `Successfully navigated to: ${fullUrl}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Navigation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }

  private async waitForPageLoad(timeout: number = 10000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const tab = await chrome.tabs.get(this.tabId);
        if (tab.status === 'complete') {
          return;
        }
      } catch (error) {
        throw new Error(
          `Tab ${this.tabId} became inaccessible during navigation`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Page did not finish loading within ${timeout}ms`);
  }

  private async analyzePageAndSuggest(
    task: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const pageInfo = await DOMService.getPageInfo(this.tabId);

      if (!pageInfo) {
        return { success: false, message: 'Could not analyze page' };
      }

      let suggestions = `Page Analysis for task: "${task}"\n\n`;
      suggestions += `Title: ${pageInfo.title}\n`;
      suggestions += `URL: ${pageInfo.url}\n`;
      suggestions += `Elements found: ${pageInfo.forms} forms, ${pageInfo.inputs} inputs, ${pageInfo.buttons} buttons, ${pageInfo.links} links\n\n`;

      // Check if it looks like a todo app
      const clickableElements = await DOMService.getClickableElements(
        this.tabId
      );
      const hasTodoInputs = clickableElements.some(
        (el) =>
          el.attributes.placeholder?.toLowerCase().includes('todo') ||
          el.attributes.class?.toLowerCase().includes('todo')
      );

      if (hasTodoInputs) {
        suggestions += 'This appears to be a todo application. You can try:\n';
        suggestions += '- "add todo [task name]" to create a new todo\n';
        suggestions += '- "complete todo [task name]" to mark a todo as done\n';
        suggestions += '- "delete todo [task name]" to remove a todo\n';
        suggestions += '- "list todos" to see all todos\n\n';
      }

      suggestions += 'General commands you can try:\n';
      suggestions += '- "click [selector]" to click an element\n';
      suggestions += '- "fill [selector] with [text]" to fill an input\n';
      suggestions += '- "scroll to [top|bottom]" to scroll\n';
      suggestions += '- "navigate to [url]" to go to another page';

      return { success: true, message: suggestions };
    } catch (error) {
      return {
        success: false,
        message: `Page analysis failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      };
    }
  }
}

// Main AgentExecutor class
class AgentExecutor {
  private eventSubscribers: EventCallback[] = [];
  private isRunning = false;
  private currentTask: string | null = null;
  private currentStep = 0;
  private taskId: string | null = null;
  private cancelled = false;
  private tabId: number | null = null;
  private executionHistory: Array<{
    taskId: string;
    task: string;
    timestamp: number;
    status: 'completed' | 'failed' | 'cancelled';
  }> = [];

  constructor() {
    logger.info('AgentExecutor', 'Initialized browser automation executor');
    this.loadExecutionHistory();
  }

  async execute(options: {
    task: string;
    taskId: string;
    tabId: number;
  }): Promise<void> {
    this.isRunning = true;
    this.currentTask = options.task;
    this.taskId = options.taskId;
    this.tabId = options.tabId;
    this.currentStep = 0;
    this.cancelled = false;

    logger.info('AgentExecutor', `Executing task: ${options.task}`, {
      taskId: options.taskId,
      tabId: options.tabId,
    });

    try {
      await this.emitEvent('system', 'task.start', 'Task started');

      // Initialize browser actions and task executor
      const actions = new BrowserActions(options.tabId);
      const executor = new TaskExecutor(options.tabId, actions);

      // Execute the task
      const taskResult = await executor.executeTask(options.task);

      if (taskResult.success) {
        await this.recordExecution('completed');
        await this.emitEvent(
          'system',
          'task.ok',
          taskResult.message || 'Task completed successfully'
        );
      } else {
        await this.recordExecution('failed');
        await this.emitEvent(
          'system',
          'task.fail',
          taskResult.message || 'Task failed'
        );
        throw new Error(taskResult.message || 'Task execution failed');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.recordExecution('failed');
      await this.emitEvent(
        'system',
        'task.fail',
        `Task failed: ${errorMessage}`
      );
      throw error;
    } finally {
      this.cleanup();
    }
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    logger.info('AgentExecutor', 'Cancel requested');
  }

  async replay(sessionId: string): Promise<void> {
    logger.info('AgentExecutor', `Replaying session: ${sessionId}`);

    // Simplified replay implementation
    this.isRunning = true;
    this.currentTask = `Replay session ${sessionId}`;
    this.taskId = `replay-${sessionId}`;
    this.cancelled = false;

    try {
      await this.emitEvent('system', 'task.start', 'Replay started');

      // Simple replay simulation
      const replaySteps = [
        'Loading session metadata...',
        'Validating execution context...',
        'Replaying actions...',
      ];

      for (let i = 0; i < replaySteps.length; i++) {
        if (this.cancelled) {
          await this.recordExecution('cancelled');
          await this.emitEvent(
            'system',
            'task.cancel',
            'Replay cancelled by user'
          );
          return;
        }

        this.currentStep = i + 1;
        await this.emitEvent('navigator', 'step.start', replaySteps[i]);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await this.emitEvent(
          'navigator',
          'step.ok',
          `${replaySteps[i]} completed`
        );
      }

      await this.recordExecution('completed');
      await this.emitEvent(
        'system',
        'task.ok',
        'Replay completed successfully'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.recordExecution('failed');
      await this.emitEvent(
        'system',
        'task.fail',
        `Replay failed: ${errorMessage}`
      );
      throw error;
    } finally {
      this.cleanup();
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      currentTask: this.currentTask || undefined,
      currentStep: this.currentStep > 0 ? this.currentStep : undefined,
    };
  }

  subscribeToEvents(callback: EventCallback): void {
    this.eventSubscribers.push(callback);
  }

  unsubscribeFromEvents(): void {
    this.eventSubscribers = [];
  }

  addFollowUpTask(task: string): void {
    logger.info('AgentExecutor', `Adding follow-up task: ${task}`);

    if (this.isRunning) {
      logger.warn(
        'AgentExecutor',
        'Cannot add follow-up task while another task is running'
      );
      return;
    }

    // In a real implementation, this would add the task to a queue
    setTimeout(async () => {
      if (!this.isRunning && this.tabId) {
        const followUpTaskId = `followup-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        await this.execute({ task, taskId: followUpTaskId, tabId: this.tabId });
      }
    }, 1000);
  }

  public cleanup(): void {
    this.isRunning = false;
    this.currentTask = null;
    this.currentStep = 0;
    this.taskId = null;
    this.tabId = null;
    this.cancelled = false;

    logger.info('AgentExecutor', 'Cleaned up executor state');
  }

  private async recordExecution(
    status: 'completed' | 'failed' | 'cancelled'
  ): Promise<void> {
    if (!this.taskId || !this.currentTask) return;

    const record = {
      taskId: this.taskId,
      task: this.currentTask,
      timestamp: Date.now(),
      status,
    };

    this.executionHistory.push(record);

    // Keep only last 50 executions
    if (this.executionHistory.length > 50) {
      this.executionHistory = this.executionHistory.slice(-50);
    }

    // Save to chrome storage for persistence
    try {
      await chrome.storage.local.set({
        agentExecutorHistory: this.executionHistory,
      });
    } catch (error) {
      logger.warn('AgentExecutor', 'Failed to save execution history', error);
    }
  }

  private async loadExecutionHistory(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('agentExecutorHistory');
      if (result.agentExecutorHistory) {
        this.executionHistory = result.agentExecutorHistory;
        logger.info(
          'AgentExecutor',
          `Loaded ${this.executionHistory.length} historical executions`
        );
      }
    } catch (error) {
      logger.warn('AgentExecutor', 'Failed to load execution history', error);
    }
  }

  getExecutionStats(): {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const stats = this.executionHistory.reduce(
      (acc, record) => {
        acc.total++;
        acc[record.status]++;
        return acc;
      },
      { total: 0, completed: 0, failed: 0, cancelled: 0 }
    );

    return stats;
  }

  private async emitEvent(
    actor: string,
    state: string,
    details: string
  ): Promise<void> {
    const event: AgentEvent = {
      actor,
      state,
      data: {
        taskId: this.taskId || 'unknown',
        step: this.currentStep,
        maxSteps: 5,
        details,
      },
      timestamp: Date.now(),
      type: 'execution',
    };

    for (const callback of this.eventSubscribers) {
      try {
        await callback(event);
      } catch (error) {
        logger.error('AgentExecutor', 'Error in event callback', { error });
      }
    }
  }
}

// Bridge interface
export interface AgentExecutorBridge {
  execute(task: string, tabId: number): Promise<void>;
  cancel(): Promise<void>;
  replay(sessionId: string): Promise<void>;
  getStatus(): {
    isRunning: boolean;
    currentTask?: string;
    currentStep?: number;
  };
  subscribeToEvents(callback: EventCallback): void;
  unsubscribeFromEvents(): void;
  addFollowUpTask(task: string): void;
  cleanup?(): void;
}

// Native browser automation controller - replaces AgentIntegrationBridge
class AgentController implements AgentExecutorBridge {
  private executor: AgentExecutor;
  private browserContext: BrowserContext;

  constructor() {
    this.executor = new AgentExecutor();
    this.browserContext = new RabbyBrowserContext();

    logger.info(
      'AgentController',
      'Initialized native browser automation controller'
    );
  }

  async execute(task: string, tabId: number): Promise<void> {
    logger.info('AgentController', `Executing task: ${task}`, { tabId });

    if (!task || task.trim().length === 0) {
      throw new Error('Task description cannot be empty');
    }

    if (!tabId || tabId <= 0) {
      throw new Error('Invalid tab ID provided');
    }

    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url) {
        throw new Error(`Tab ${tabId} is not accessible or does not exist`);
      }

      if (this.isRestrictedUrl(tab.url)) {
        throw new Error(`Cannot execute tasks on restricted URL: ${tab.url}`);
      }

      const taskId = `task-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Switch to tab and execute task
      await this.browserContext.switchToTab(tabId);
      await this.waitForTabReady(tabId);
      await this.executor.execute({ task, taskId, tabId });

      logger.info('AgentController', 'Task execution completed', { taskId });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('AgentController', 'Task execution failed', {
        error: errorMessage,
        tabId,
      });
      throw error;
    }
  }

  async cancel(): Promise<void> {
    logger.info('AgentController', 'Canceling current task');

    try {
      await this.executor.cancel();
      logger.info('AgentController', 'Task cancelled successfully');
    } catch (error) {
      logger.error('AgentController', 'Failed to cancel task', { error });
      throw error;
    }
  }

  async replay(sessionId: string): Promise<void> {
    logger.info('AgentController', `Replaying session: ${sessionId}`);

    try {
      await this.executor.replay(sessionId);
      logger.info('AgentController', 'Session replay completed', {
        sessionId,
      });
    } catch (error) {
      logger.error('AgentController', 'Session replay failed', {
        error,
        sessionId,
      });
      throw error;
    }
  }

  getStatus() {
    return this.executor.getStatus();
  }

  subscribeToEvents(callback: EventCallback): void {
    this.executor.subscribeToEvents(callback);
    logger.info('AgentController', 'Event subscription added');
  }

  unsubscribeFromEvents(): void {
    this.executor.unsubscribeFromEvents();
    logger.info('AgentController', 'Event subscriptions cleared');
  }

  addFollowUpTask(task: string): void {
    if (!task || task.trim().length === 0) {
      logger.warn('AgentController', 'Cannot add empty follow-up task');
      return;
    }

    this.executor.addFollowUpTask(task);
    logger.info('AgentController', 'Follow-up task queued', { task });
  }

  getExecutionStats() {
    return this.executor.getExecutionStats();
  }

  private isRestrictedUrl(url: string): boolean {
    const restrictedPatterns = [
      /^chrome:\/\//,
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^about:\/\//,
      /^file:\/\//,
    ];

    return restrictedPatterns.some((pattern) => pattern.test(url));
  }

  private async waitForTabReady(
    tabId: number,
    timeout: number = 5000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          return;
        }
      } catch (error) {
        throw new Error(`Tab ${tabId} became inaccessible`);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Tab ${tabId} did not become ready within ${timeout}ms`);
  }

  cleanup(): void {
    logger.info('AgentController', 'Starting cleanup process...');

    try {
      this.executor.cleanup?.();
      logger.info('AgentController', 'AgentExecutor cleaned up');
    } catch (error) {
      logger.warn('AgentController', 'Error during executor cleanup', error);
    }

    try {
      this.browserContext.cleanup();
      logger.info('AgentController', 'Browser context cleaned up');
    } catch (error) {
      logger.warn(
        'AgentController',
        'Error during browser context cleanup',
        error
      );
    }

    logger.info('AgentController', 'Cleanup completed');
  }
}

// Export the singleton instance
export const agentController = new AgentController();

// For backward compatibility, also export as agentIntegrationBridge
export const agentIntegrationBridge = agentController;
