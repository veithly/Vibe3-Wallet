// DApp automation system for browser interaction and wallet connection
import { ActionStep } from '../planning/ActionPlanner';
import type { AgentContext } from '../types';

export interface DAppTask {
  id: string;
  type: DAppTaskType;
  selector?: string;
  value?: string;
  url?: string;
  tabId?: number;
  timeout?: number;
  transaction?: any;
  options?: any;
}

export type DAppTaskType =
  | 'NAVIGATE'
  | 'CLICK'
  | 'INPUT'
  | 'WAIT'
  | 'SCROLL'
  | 'SWITCH_TAB'
  | 'CLOSE_TAB'
  | 'CONNECT_WALLET'
  | 'SIGN_TRANSACTION'
  | 'SWITCH_NETWORK'
  | 'EXTRACT_DATA'
  | 'VERIFY_ELEMENT';

export interface DAppInteractionResult {
  success: boolean;
  results: TaskResult[];
  error?: string;
  duration: number;
  screenshots?: string[];
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  screenshot?: string;
}

export interface BrowserTab {
  id: number;
  url: string;
  title: string;
  active: boolean;
  status: 'loading' | 'complete' | 'error';
}

export interface BrowserController {
  openTab(url: string): Promise<number>;
  closeTab(tabId: number): Promise<void>;
  switchTab(tabId: number): Promise<void>;
  getTabs(): Promise<BrowserTab[]>;
  navigate(tabId: number, url: string): Promise<void>;
  clickElement(tabId: number, selector: string): Promise<void>;
  inputText(tabId: number, selector: string, text: string): Promise<void>;
  waitForElement(
    tabId: number,
    selector: string,
    timeout?: number
  ): Promise<boolean>;
  waitForLoad(tabId: number, timeout?: number): Promise<void>;
  wait(duration: number): Promise<void>;
  scrollToElement(tabId: number, selector: string): Promise<void>;
  extractText(tabId: number, selector: string): Promise<string>;
  extractData(tabId: number, pattern: any): Promise<any>;
  takeScreenshot(tabId: number): Promise<string>;
  executeScript(tabId: number, script: string): Promise<any>;
}

export interface WalletConnector {
  connect(tabId: number, dappName: string): Promise<boolean>;
  disconnect(tabId: number): Promise<void>;
  signTransaction(tabId: number, transaction: any): Promise<string>;
  signMessage(tabId: number, message: string): Promise<string>;
  switchNetwork(tabId: number, chainId: number): Promise<boolean>;
  is_connected(tabId: number): Promise<boolean>;
  getAccounts(tabId: number): Promise<string[]>;
}

export interface AutomationConfig {
  defaultTimeout: number;
  screenshotOnError: boolean;
  verboseLogging: boolean;
  maxRetries: number;
  retryDelay: number;
}

export class DAppAutomation {
  private context: AgentContext;
  private browserController: BrowserController;
  private walletConnector: WalletConnector;
  private config: AutomationConfig;

  constructor(
    context: AgentContext,
    browserController?: BrowserController,
    walletConnector?: WalletConnector,
    config?: Partial<AutomationConfig>
  ) {
    this.context = context;
    this.browserController = browserController || new ChromeBrowserController();
    this.walletConnector = walletConnector || new RabbyWalletConnector(context);
    this.config = {
      defaultTimeout: 30000,
      screenshotOnError: true,
      verboseLogging: false,
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };
  }

  async interactWithDApp(
    dAppUrl: string,
    tasks: DAppTask[]
  ): Promise<DAppInteractionResult> {
    const startTime = Date.now();
    const results: TaskResult[] = [];
    const screenshots: string[] = [];

    try {
      // Open or find tab for the dApp
      const tabId = await this.getOrCreateTab(dAppUrl);

      // Wait for page to load
      await this.browserController.waitForLoad(
        tabId,
        this.config.defaultTimeout
      );

      // Execute tasks sequentially
      for (const task of tasks) {
        try {
          const result = await this.executeTask(tabId, task);
          results.push(result);

          // Take screenshot if enabled
          if (this.config.screenshotOnError && !result.success) {
            const screenshot = await this.browserController.takeScreenshot(
              tabId
            );
            screenshots.push(screenshot);
          }
        } catch (error) {
          const errorResult: TaskResult = {
            taskId: task.id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            duration: 0,
          };
          results.push(errorResult);

          // Take screenshot on error
          if (this.config.screenshotOnError) {
            const screenshot = await this.browserController.takeScreenshot(
              tabId
            );
            screenshots.push(screenshot);
          }
        }
      }

      return {
        success: results.every((r) => r.success),
        results,
        duration: Date.now() - startTime,
        screenshots,
      };
    } catch (error) {
      return {
        success: false,
        results,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        screenshots,
      };
    }
  }

  private async getOrCreateTab(url: string): Promise<number> {
    // Try to find existing tab with the same URL
    const tabs = await this.browserController.getTabs();
    const existingTab = tabs.find((tab) => tab.url.includes(url));

    if (existingTab) {
      await this.browserController.switchTab(existingTab.id);
      return existingTab.id;
    }

    // Create new tab
    return await this.browserController.openTab(url);
  }

  private async executeTask(
    tabId: number,
    task: DAppTask
  ): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      let result: any;

      switch (task.type) {
        case 'NAVIGATE':
          await this.browserController.navigate(tabId, task.url!);
          result = { navigated: true };
          break;

        case 'CLICK':
          await this.browserController.clickElement(tabId, task.selector!);
          result = { clicked: true };
          break;

        case 'INPUT':
          await this.browserController.inputText(
            tabId,
            task.selector!,
            task.value!
          );
          result = { input: true };
          break;

        case 'WAIT':
          await this.browserController.wait(task.timeout || 1000);
          result = { waited: true };
          break;

        case 'SCROLL':
          await this.browserController.scrollToElement(tabId, task.selector!);
          result = { scrolled: true };
          break;

        case 'SWITCH_TAB':
          await this.browserController.switchTab(task.tabId!);
          result = { switched: true };
          break;

        case 'CLOSE_TAB':
          await this.browserController.closeTab(task.tabId!);
          result = { closed: true };
          break;

        case 'CONNECT_WALLET':
          result = await this.handleWalletConnection(tabId, task);
          break;

        case 'SIGN_TRANSACTION':
          result = await this.handleTransactionSigning(tabId, task);
          break;

        case 'SWITCH_NETWORK':
          result = await this.handleNetworkSwitch(tabId, task);
          break;

        case 'EXTRACT_DATA':
          result = await this.browserController.extractData(
            tabId,
            task.options!
          );
          break;

        case 'VERIFY_ELEMENT':
          result = await this.browserController.waitForElement(
            tabId,
            task.selector!,
            task.timeout
          );
          break;

        default:
          throw new Error(`Unsupported task type: ${task.type}`);
      }

      return {
        taskId: task.id,
        success: true,
        result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      if (this.config.verboseLogging) {
        console.error(`Task ${task.id} failed:`, error);
      }

      return {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  private async handleWalletConnection(
    tabId: number,
    task: DAppTask
  ): Promise<any> {
    // Check if wallet is already connected
    const isConnected = await this.walletConnector.is_connected(tabId);

    if (isConnected) {
      return { alreadyConnected: true };
    }

    // Look for connect wallet button
    const connectButtons = [
      'button[data-testid="connect-wallet"]',
      'button:contains("Connect Wallet")',
      'button:contains("Connect")',
      '.connect-wallet',
      '#connect-wallet',
    ];

    let connected = false;

    for (const selector of connectButtons) {
      try {
        await this.browserController.waitForElement(tabId, selector, 5000);
        await this.browserController.clickElement(tabId, selector);

        // Wait for wallet popup and connect
        connected = await this.walletConnector.connect(
          tabId,
          task.options?.dappName || 'Unknown dApp'
        );

        if (connected) {
          break;
        }
      } catch (error) {
        // Continue to next selector
        continue;
      }
    }

    if (!connected) {
      throw new Error('Could not connect wallet to dApp');
    }

    return { connected: true };
  }

  private async handleTransactionSigning(
    tabId: number,
    task: DAppTask
  ): Promise<any> {
    // Execute the transaction that triggers signing
    if (task.selector) {
      await this.browserController.clickElement(tabId, task.selector);
    }

    // Sign the transaction
    const txHash = await this.walletConnector.signTransaction(
      tabId,
      task.transaction!
    );

    return { txHash };
  }

  private async handleNetworkSwitch(
    tabId: number,
    task: DAppTask
  ): Promise<any> {
    // Switch network in wallet
    const switched = await this.walletConnector.switchNetwork(
      tabId,
      task.options?.chainId
    );

    if (!switched) {
      throw new Error('Could not switch network');
    }

    // Wait for dApp to detect network change
    await this.browserController.wait(2000);

    return { switched: true };
  }

  // Helper methods for common DApp interactions
  async connectToDApp(dAppUrl: string, dappName: string): Promise<boolean> {
    const tasks: DAppTask[] = [
      {
        id: 'connect-1',
        type: 'CONNECT_WALLET',
        options: { dappName },
      },
    ];

    const result = await this.interactWithDApp(dAppUrl, tasks);
    return result.success;
  }

  async swapOnDApp(
    dAppUrl: string,
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<string> {
    const tasks: DAppTask[] = [
      {
        id: 'connect-1',
        type: 'CONNECT_WALLET',
        options: { dappName: 'DEX' },
      },
      {
        id: 'input-from-1',
        type: 'INPUT',
        selector: 'input[data-testid="from-amount"]',
        value: amount,
      },
      {
        id: 'select-from-1',
        type: 'CLICK',
        selector: 'button[data-testid="from-token-select"]',
      },
      {
        id: 'wait-from-1',
        type: 'WAIT',
        timeout: 1000,
      },
      {
        id: 'input-from-search-1',
        type: 'INPUT',
        selector: 'input[data-testid="token-search"]',
        value: fromToken,
      },
      {
        id: 'select-from-token-1',
        type: 'CLICK',
        selector: `button[data-token="${fromToken}"]`,
      },
      {
        id: 'select-to-1',
        type: 'CLICK',
        selector: 'button[data-testid="to-token-select"]',
      },
      {
        id: 'wait-to-1',
        type: 'WAIT',
        timeout: 1000,
      },
      {
        id: 'input-to-search-1',
        type: 'INPUT',
        selector: 'input[data-testid="token-search"]',
        value: toToken,
      },
      {
        id: 'select-to-token-1',
        type: 'CLICK',
        selector: `button[data-token="${toToken}"]`,
      },
      {
        id: 'swap-1',
        type: 'CLICK',
        selector: 'button[data-testid="swap-button"]',
      },
      {
        id: 'confirm-1',
        type: 'SIGN_TRANSACTION',
        selector: 'button[data-testid="confirm-button"]',
        transaction: {
          type: 'swap',
          fromToken,
          toToken,
          amount,
        },
      },
    ];

    const result = await this.interactWithDApp(dAppUrl, tasks);

    if (!result.success) {
      throw new Error('Swap failed');
    }

    const confirmResult = result.results.find((r) => r.taskId === 'confirm-1');
    return confirmResult?.result?.txHash || '';
  }

  async stakeOnDApp(
    dAppUrl: string,
    token: string,
    amount: string,
    poolId: string
  ): Promise<string> {
    const tasks: DAppTask[] = [
      {
        id: 'connect-1',
        type: 'CONNECT_WALLET',
        options: { dappName: 'Staking' },
      },
      {
        id: 'navigate-pool-1',
        type: 'NAVIGATE',
        url: `${dAppUrl}/pool/${poolId}`,
      },
      {
        id: 'input-amount-1',
        type: 'INPUT',
        selector: 'input[data-testid="stake-amount"]',
        value: amount,
      },
      {
        id: 'stake-1',
        type: 'CLICK',
        selector: 'button[data-testid="stake-button"]',
      },
      {
        id: 'confirm-1',
        type: 'SIGN_TRANSACTION',
        selector: 'button[data-testid="confirm-stake"]',
        transaction: {
          type: 'stake',
          token,
          amount,
          poolId,
        },
      },
    ];

    const result = await this.interactWithDApp(dAppUrl, tasks);

    if (!result.success) {
      throw new Error('Staking failed');
    }

    const confirmResult = result.results.find((r) => r.taskId === 'confirm-1');
    return confirmResult?.result?.txHash || '';
  }

  async extractDAppData(
    dAppUrl: string,
    selectors: Record<string, string>
  ): Promise<Record<string, any>> {
    const tasks: DAppTask[] = Object.entries(selectors).map(
      ([key, selector]) => ({
        id: `extract-${key}`,
        type: 'EXTRACT_DATA',
        options: { selector, key },
      })
    );

    const result = await this.interactWithDApp(dAppUrl, tasks);

    const data: Record<string, any> = {};

    for (const taskResult of result.results) {
      if (taskResult.success) {
        const key = taskResult.taskId.replace('extract-', '');
        data[key] = taskResult.result;
      }
    }

    return data;
  }
}

// Default implementations
class ChromeBrowserController implements BrowserController {
  async openTab(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
      chrome.tabs.create({ url }, (tab) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(tab.id!);
        }
      });
    });
  }

  async closeTab(tabId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.tabs.remove(tabId, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async switchTab(tabId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.tabs.update(tabId, { active: true }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async getTabs(): Promise<BrowserTab[]> {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(
            tabs.map((tab) => ({
              id: tab.id!,
              url: tab.url || '',
              title: tab.title || '',
              active: tab.active!,
              status: (tab.status as any) || 'complete',
            }))
          );
        }
      });
    });
  }

  async navigate(tabId: number, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.tabs.update(tabId, { url }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async clickElement(tabId: number, selector: string): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: (selector: string) => {
            const element = document.querySelector(selector) as HTMLElement;
            if (element) {
              element.click();
              return true;
            }
            return false;
          },
          args: [selector],
        },
        (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async inputText(
    tabId: number,
    selector: string,
    text: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: (selector: string, text: string) => {
            const element = document.querySelector(
              selector
            ) as HTMLInputElement;
            if (element) {
              element.value = text;
              element.dispatchEvent(new Event('input', { bubbles: true }));
              return true;
            }
            return false;
          },
          args: [selector, text],
        },
        (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async waitForElement(
    tabId: number,
    selector: string,
    timeout: number = 30000
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            func: (selector: string) => {
              return document.querySelector(selector) !== null;
            },
            args: [selector],
          },
          (result) => {
            if (chrome.runtime.lastError || Date.now() - startTime > timeout) {
              clearInterval(checkInterval);
              resolve(false);
            } else if (result[0]?.result) {
              clearInterval(checkInterval);
              resolve(true);
            }
          }
        );
      }, 100);
    });
  }

  async waitForLoad(tabId: number, timeout: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkStatus = () => {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          if (tab.status === 'complete') {
            resolve();
          } else if (Date.now() - startTime > timeout) {
            reject(new Error('Page load timeout'));
          } else {
            setTimeout(checkStatus, 100);
          }
        });
      };

      checkStatus();
    });
  }

  async wait(duration: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, duration));
  }

  async scrollToElement(tabId: number, selector: string): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: (selector: string) => {
            const element = document.querySelector(selector);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth' });
              return true;
            }
            return false;
          },
          args: [selector],
        },
        (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async extractText(tabId: number, selector: string): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: (selector: string) => {
            const element = document.querySelector(selector);
            return element ? element.textContent : '';
          },
          args: [selector],
        },
        (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result[0]?.result || '');
          }
        }
      );
    });
  }

  async extractData(tabId: number, pattern: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: (pattern: any) => {
            // This is a simplified data extraction
            // In reality, this would be more sophisticated
            return { extracted: true };
          },
          args: [pattern],
        },
        (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result[0]?.result);
          }
        }
      );
    });
  }

  async takeScreenshot(tabId: number): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(tabId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(dataUrl);
        }
      });
    });
  }

  async executeScript(tabId: number, script: string): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: new Function(script) as (...args: any[]) => unknown,
        },
        (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result[0]?.result);
          }
        }
      );
    });
  }
}

class RabbyWalletConnector implements WalletConnector {
  private context: AgentContext;

  constructor(context: AgentContext) {
    this.context = context;
  }

  async connect(tabId: number, dappName: string): Promise<boolean> {
    // This would integrate with Rabby's wallet connection logic
    // For now, return true to simulate successful connection
    console.log(`Connecting wallet to ${dappName} on tab ${tabId}`);
    return true;
  }

  async disconnect(tabId: number): Promise<void> {
    console.log(`Disconnecting wallet from tab ${tabId}`);
  }

  async signTransaction(tabId: number, transaction: any): Promise<string> {
    // This would integrate with Rabby's transaction signing
    console.log(`Signing transaction on tab ${tabId}:`, transaction);
    return '0x' + Math.random().toString(16).substr(2, 64);
  }

  async signMessage(tabId: number, message: string): Promise<string> {
    // This would integrate with Rabby's message signing
    console.log(`Signing message on tab ${tabId}:`, message);
    return '0x' + Math.random().toString(16).substr(2, 64);
  }

  async switchNetwork(tabId: number, chainId: number): Promise<boolean> {
    // This would integrate with Rabby's network switching
    console.log(`Switching to network ${chainId} on tab ${tabId}`);
    return true;
  }

  async is_connected(tabId: number): Promise<boolean> {
    // Check if wallet is connected to the dApp
    console.log(`Checking wallet connection on tab ${tabId}`);
    return false; // Default to not connected
  }

  async getAccounts(tabId: number): Promise<string[]> {
    // Get connected accounts
    console.log(`Getting accounts on tab ${tabId}`);
    return [];
  }
}
