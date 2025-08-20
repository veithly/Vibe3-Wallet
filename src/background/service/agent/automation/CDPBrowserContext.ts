/**
 * CDP Browser Context for Vibe3 Wallet
 * Manages browser tabs and CDP connections similar to nanobrowser's BrowserContext
 */

import { createLogger } from '@/utils/logger';
import { cdpController } from './CDPController';

const logger = createLogger('CDPBrowserContext');

export interface BrowserContextConfig {
  displayHighlights: boolean;
  viewportExpansion: number;
  homePageUrl: string;
  maxTabs: number;
}

export const DEFAULT_BROWSER_CONTEXT_CONFIG: BrowserContextConfig = {
  displayHighlights: true,
  viewportExpansion: 0,
  homePageUrl: 'about:blank',
  maxTabs: 10,
};

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  attached: boolean;
  lastActivity: number;
}

/**
 * Browser Context managing CDP connections to tabs
 * Based on nanobrowser's BrowserContext implementation
 */
export class CDPBrowserContext {
  private _config: BrowserContextConfig;
  private _currentTabId: number | null = null;
  private _attachedTabs = new Map<number, TabInfo>();

  constructor(config: Partial<BrowserContextConfig> = {}) {
    this._config = { ...DEFAULT_BROWSER_CONTEXT_CONFIG, ...config };

    // Listen for tab events
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.detachTab(tabId);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'complete' && this._attachedTabs.has(tabId)) {
        this.updateTabInfo(tabId);
      }
    });
  }

  public getConfig(): BrowserContextConfig {
    return this._config;
  }

  public updateConfig(config: Partial<BrowserContextConfig>): void {
    this._config = { ...this._config, ...config };
  }

  public updateCurrentTabId(tabId: number): void {
    this._currentTabId = tabId;
  }

  /**
   * Get or create current active tab with CDP attachment
   */
  public async getCurrentTab(): Promise<TabInfo> {
    // If no current tab set, query active tab
    if (!this._currentTabId) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        // Create new tab if none available
        const newTab = await chrome.tabs.create({ url: this._config.homePageUrl });
        if (!newTab.id) {
          throw new Error('Failed to create new tab');
        }
        this._currentTabId = newTab.id;
      } else {
        this._currentTabId = tab.id;
      }
    }

    // Get or attach to current tab
    let tabInfo = this._attachedTabs.get(this._currentTabId);
    if (!tabInfo) {
      const tab = await chrome.tabs.get(this._currentTabId);
      tabInfo = {
        id: this._currentTabId,
        url: tab.url || '',
        title: tab.title || '',
        attached: false,
        lastActivity: Date.now()
      };
      this._attachedTabs.set(this._currentTabId, tabInfo);
    }

    // Attach CDP if not already attached
    if (!tabInfo.attached) {
      const attached = await cdpController.attachToTab(this._currentTabId);
      if (attached) {
        tabInfo.attached = true;
        tabInfo.lastActivity = Date.now();
        logger.info('Tab attached to CDP', { tabId: this._currentTabId });
      } else {
        throw new Error(`Failed to attach CDP to tab ${this._currentTabId}`);
      }
    }

    return tabInfo;
  }

  /**
   * Attach CDP to specific tab
   */
  public async attachTab(tabId: number): Promise<boolean> {
    try {
      const tab = await chrome.tabs.get(tabId);
      const attached = await cdpController.attachToTab(tabId);

      if (attached) {
        const tabInfo: TabInfo = {
          id: tabId,
          url: tab.url || '',
          title: tab.title || '',
          attached: true,
          lastActivity: Date.now()
        };
        this._attachedTabs.set(tabId, tabInfo);
        logger.info('Tab attached', { tabId });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to attach tab', { tabId, error });
      return false;
    }
  }

  /**
   * Detach CDP from specific tab
   */
  public async detachTab(tabId: number): Promise<void> {
    try {
      await cdpController.detachFromTab(tabId);
      this._attachedTabs.delete(tabId);

      if (this._currentTabId === tabId) {
        this._currentTabId = null;
      }

      logger.info('Tab detached', { tabId });
    } catch (error) {
      logger.warn('Failed to detach tab', { tabId, error });
    }
  }

  /**
   * Update tab information
   */
  private async updateTabInfo(tabId: number): Promise<void> {
    const tabInfo = this._attachedTabs.get(tabId);
    if (tabInfo) {
      try {
        const tab = await chrome.tabs.get(tabId);
        tabInfo.url = tab.url || '';
        tabInfo.title = tab.title || '';
        tabInfo.lastActivity = Date.now();
      } catch (error) {
        logger.warn('Failed to update tab info', { tabId, error });
      }
    }
  }

  /**
   * Get all attached tabs
   */
  public getAttachedTabs(): TabInfo[] {
    return Array.from(this._attachedTabs.values());
  }

  /**
   * Check if tab is valid for CDP operations
   */
  public isValidWebPage(url: string): boolean {
    const lowerCaseUrl = url.trim().toLowerCase();
    return Boolean(
      lowerCaseUrl &&
      lowerCaseUrl.startsWith('http') &&
      !lowerCaseUrl.startsWith('https://chromewebstore.google.com') &&
      !lowerCaseUrl.includes('chrome://') &&
      !lowerCaseUrl.includes('chrome-extension://') &&
      !lowerCaseUrl.includes('moz-extension://')
    );
  }

  /**
   * Navigate current tab to URL
   */
  public async navigateToUrl(url: string): Promise<void> {
    const tabInfo = await this.getCurrentTab();

    if (!this.isValidWebPage(url)) {
      throw new Error(`URL not allowed for automation: ${url}`);
    }

    await chrome.tabs.update(tabInfo.id, { url });

    // Wait for navigation to complete
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Navigation timeout'));
      }, 30000);

      const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (tabId === tabInfo.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeout);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });

    // Update tab info
    await this.updateTabInfo(tabInfo.id);
  }

  /**
   * Cleanup all attached tabs
   */
  public async cleanup(): Promise<void> {
    const tabIds = Array.from(this._attachedTabs.keys());
    await Promise.all(tabIds.map(tabId => this.detachTab(tabId)));
    this._currentTabId = null;
    logger.info('Browser context cleanup completed');
  }

  /**
   * Get current tab ID
   */
  public getCurrentTabId(): number | null {
    return this._currentTabId;
  }

  /**
   * Check if tab is attached
   */
  public isTabAttached(tabId: number): boolean {
    return this._attachedTabs.has(tabId) && this._attachedTabs.get(tabId)?.attached === true;
  }

  /**
   * Cleanup inactive tabs (older than 30 minutes)
   */
  public async cleanupInactiveTabs(): Promise<void> {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [tabId, tabInfo] of this._attachedTabs.entries()) {
      if (now - tabInfo.lastActivity > maxAge) {
        logger.info('Cleaning up inactive tab', { tabId, age: now - tabInfo.lastActivity });
        await this.detachTab(tabId);
      }
    }
  }
}

// Singleton instance
export const cdpBrowserContext = new CDPBrowserContext();
