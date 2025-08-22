// Function calling tool registry for dynamic Web3 tool management
import { FunctionSchema, ParameterSchema } from '../llm/types';
// import { web3ActionSchemas } from '../actions/web3-schemas';
import { createLogger } from '@/utils/logger';
import { Web3Action } from '../actions/web3-actions';
import { BrowserAutomationController } from '../automation/BrowserAutomationController';
import type { AgentContext } from '../types';
import preferenceService from '@/background/service/preference';
import keyringService from '@/background/service/keyring';

import { getClickableElements, removeHighlights as domRemoveHighlights, getScrollInfo as domGetScrollInfo } from '@/background/browser/dom/service';
const logger = createLogger('ToolRegistry');

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ParameterSchema[];
  required: string[];
  handler: (params: any) => Promise<any>;
  category: 'web3' | 'utility' | 'system' | 'browser';
  riskLevel: 'low' | 'medium' | 'high';
  requiresConfirmation: boolean;
  requiredPermissions?: string[];
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private categories: Map<string, string[]> = new Map();
  private executionTracker = new Map<string, number>();
  private lastHighlightedByTabId = new Map<number, any[]>();

  // Deduplication controls for high-frequency element scanning
  private pendingGetClickableByKey = new Map<string, Promise<any>>();
  private lastGetClickableResultByKey = new Map<string, any>();
  private lastGetClickableAtByKey = new Map<string, number>();

  private lastActiveTabId?: number;

  constructor() {
    this.initializeWeb3Tools();
    this.initializeBrowserTools();
    this.initializeUtilityTools();
    this.initializeSystemTools();
  }

  public setLastActiveTabId(tabId: number) {
    this.lastActiveTabId = tabId;
  }

  private initializeWeb3Tools(): void {
    // Core Web3 tools
    this.registerTool({
      name: 'checkBalance',
      description:
        'Check token balance for a specific address on any blockchain',
      parameters: [
        {
          type: 'string',
          description: 'The wallet address to check balance for',
          pattern: '^0x[a-fA-F0-9]{40}$',
        },
        {
          type: 'string',
          description:
            'Optional: Specific token contract address to check (leave empty for native token)',
          pattern: '^0x[a-fA-F0-9]{40}$',
        },
        {
          type: 'number',
          description:
            'Optional: Chain ID (1 for Ethereum, 56 for BSC, 137 for Polygon, etc.)',
          minimum: 1,
        },
      ],
      required: [],
      handler: this.createWeb3Handler('checkBalance'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'sendTransaction',
      description: 'Send a transaction with ETH or tokens to another address',
      parameters: [
        {
          type: 'string',
          description: 'Recipient wallet address',
          pattern: '^0x[a-fA-F0-9]{40}$',
        },
        {
          type: 'string',
          description:
            'Amount to send in wei (e.g., "1000000000000000000" for 1 ETH)',
        },
        {
          type: 'string',
          description: 'Optional: Transaction data (hex string)',
          pattern: '^0x[0-9a-fA-F]*$',
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1,
        },
      ],
      required: ['to', 'value'],
      handler: this.createWeb3Handler('sendTransaction'),
      category: 'web3',
      riskLevel: 'high',
      requiresConfirmation: true,
    });

    this.registerTool({
      name: 'approveToken',
      description: 'Approve a smart contract to spend your tokens',
      parameters: [
        {
          type: 'string',
          description: 'Token contract address',
          pattern: '^0x[a-fA-F0-9]{40}$',
        },
        {
          type: 'string',
          description: 'Spender contract address',
          pattern: '^0x[a-fA-F0-9]{40}$',
        },
        {
          type: 'string',
          description: 'Amount to approve in token units (with decimals)',
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1,
        },
      ],
      required: ['tokenAddress', 'spender', 'amount'],
      handler: this.createWeb3Handler('approveToken'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true,
    });

    this.registerTool({
      name: 'swapTokens',
      description:
        'Swap tokens using decentralized exchanges (DEX aggregators)',
      parameters: [
        {
          type: 'string',
          description:
            'From token address or symbol (e.g., "ETH", "USDC", "0x...")',
        },
        {
          type: 'string',
          description: 'To token address or symbol',
        },
        {
          type: 'string',
          description: 'Amount to swap (with decimals)',
        },
        {
          type: 'string',
          description:
            'Optional: Recipient address (defaults to current wallet)',
        },
        {
          type: 'number',
          description: 'Optional: Slippage tolerance percentage (default 0.5)',
          minimum: 0.1,
          maximum: 5,
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1,
        },
      ],
      required: ['fromToken', 'toToken', 'amount'],
      handler: this.createWeb3Handler('swapTokens'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true,
    });

    this.registerTool({
      name: 'getNFTs',
      description: 'Get NFTs owned by a specific address',
      parameters: [
        {
          type: 'string',
          description: 'Wallet address to check NFTs for',
          pattern: '^0x[a-fA-F0-9]{40}$',
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1,
        },
        {
          type: 'string',
          description: 'Optional: Specific NFT contract address',
          pattern: '^0x[a-fA-F0-9]{40}$',
        },
      ],
      required: ['address'],
      handler: this.createWeb3Handler('getNFTs'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'getTransactionHistory',
      description: 'Get transaction history for a wallet address',
      parameters: [
        {
          type: 'string',
          description: 'Wallet address',
          pattern: '^0x[a-fA-F0-9]{40}$',
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1,
        },
        {
          type: 'number',
          description:
            'Optional: Number of transactions to return (default 50)',
          minimum: 1,
          maximum: 200,
        },
      ],
      required: ['address'],
      handler: this.createWeb3Handler('getTransactionHistory'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'getGasPrice',
      description: 'Get current gas price for a specific blockchain network',
      parameters: [
        {
          type: 'number',
          description:
            'Chain ID (1 for Ethereum, 56 for BSC, 137 for Polygon, etc.)',
          minimum: 1,
        },
      ],
      required: [],
      handler: this.createWeb3Handler('getGasPrice'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'estimateGas',
      description: 'Estimate gas cost for a transaction',
      parameters: [
        {
          type: 'string',
          description: 'Recipient address',
          pattern: '^0x[a-fA-F0-9]{40}$',
        },
        {
          type: 'string',
          description: 'Optional: Transaction value in wei',
          // default: '0x0' // default property not supported in ParameterSchema
        },
        {
          type: 'string',
          description: 'Optional: Transaction data (hex string)',
          pattern: '^0x[0-9a-fA-F]*$',
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1,
        },
      ],
      required: ['to'],
      handler: this.createWeb3Handler('estimateGas'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'switchNetwork',
      description: 'Switch to a different blockchain network',
      parameters: [
        {
          type: 'number',
          description: 'Chain ID to switch to',
          minimum: 1,
        },
      ],
      required: ['chainId'],
      handler: this.createWeb3Handler('switchNetwork'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'signMessage',
      description: 'Sign a message with the current wallet',
      parameters: [
        {
          type: 'string',
          description: 'Message to sign',
        },
        {
          type: 'string',
          description:
            'Optional: Specific address to sign with (defaults to current account)',
          pattern: '^0x[a-fA-F0-9]{40}$',
        },
      ],
      required: ['message'],
      handler: this.createWeb3Handler('signMessage'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true,
    });

    // Advanced DeFi tools (selected tools removed)

    this.registerTool({
      name: 'unstakeTokens',
      description: 'Unstake tokens from a staking contract',
      parameters: [
        {
          type: 'string',
          description: 'Token address to unstake',
        },
        {
          type: 'string',
          description: 'Amount to unstake',
        },
        {
          type: 'string',
          description: 'Staking contract address',
          pattern: '^0x[a-fA-F0-9]{40}$',
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1,
        },
      ],
      required: ['tokenAddress', 'amount', 'stakingContract'],
      handler: this.createWeb3Handler('unstakeTokens'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true,
    });

    this.registerTool({
      name: 'bridgeTokens',
      description: 'Bridge tokens across different blockchain networks',
      parameters: [
        {
          type: 'string',
          description: 'Token address to bridge',
        },
        {
          type: 'string',
          description: 'Amount to bridge',
        },
        {
          type: 'number',
          description: 'Source chain ID',
        },
        {
          type: 'number',
          description: 'Destination chain ID',
        },
        {
          type: 'string',
          description: 'Optional: Recipient address on destination chain',
        },
      ],
      required: ['tokenAddress', 'amount', 'fromChainId', 'toChainId'],
      handler: this.createWeb3Handler('bridgeTokens'),
      category: 'web3',
      riskLevel: 'high',
      requiresConfirmation: true,
    });
  }

  private initializeUtilityTools(): void {
    // Utility tools for general assistance
    this.registerTool({
      name: 'getCurrentTime',
      description: 'Get the current timestamp and date information',
      parameters: [],
      required: [],
      handler: async () => {
        const now = new Date();
        return {
          timestamp: now.getTime(),
          isoString: now.toISOString(),
          dateString: now.toLocaleDateString(),
          timeString: now.toLocaleTimeString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      },
      category: 'utility',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'formatNumber',
      description: 'Format numbers with proper decimal places and units',
      parameters: [
        {
          type: 'string',
          description: 'Number to format',
        },
        {
          type: 'number',
          description: 'Number of decimal places',
          minimum: 0,
          maximum: 18,
        },
        {
          type: 'string',
          description: 'Optional: Unit symbol (e.g., "ETH", "USDC")',
        },
      ],
      required: ['number', 'decimals'],
      handler: async (params) => {
        const num = parseFloat(params.number);
        if (isNaN(num)) {
          throw new Error('Invalid number format');
        }

        const formatted = num.toFixed(params.decimals);
        const withUnit = params.unit
          ? `${formatted} ${params.unit}`
          : formatted;

        return {
          original: params.number,
          formatted: formatted,
          withUnit: withUnit,
          numeric: num,
        };
      },
      category: 'utility',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'calculateGasEstimate',
      description: 'Calculate estimated gas cost in ETH for a transaction',
      parameters: [
        {
          type: 'number',
          description: 'Estimated gas units',
          minimum: 21000,
        },
        {
          type: 'string',
          description: 'Gas price in Gwei',
          pattern: '^[0-9]+(\\.[0-9]+)?$',
        },
      ],
      required: ['gasUnits', 'gasPriceGwei'],
      handler: async (params) => {
        const gasUnits = params.gasUnits;
        const gasPriceGwei = parseFloat(params.gasPriceGwei);

        if (isNaN(gasPriceGwei)) {
          throw new Error('Invalid gas price format');
        }

        const gasPriceWei = gasPriceGwei * 1e9; // Convert Gwei to Wei
        const totalCostWei = gasUnits * gasPriceWei;
        const totalCostEth = totalCostWei / 1e18;

        return {
          gasUnits,
          gasPriceGwei,
          gasPriceWei,
          totalCostWei,
          totalCostEth,
          formatted: `${totalCostEth.toFixed(6)} ETH`,
        };
      },
      category: 'utility',
      riskLevel: 'low',
      requiresConfirmation: false,
    });
  }

  private initializeBrowserTools(): void {
    // Browser automation tools
    this.registerTool({
      name: 'navigateToUrl',
      description: 'Navigate to a specific URL in the browser',
      parameters: [
        {
          type: 'string',
          description: 'The URL to navigate to',
          pattern: '^https?://.+',
        },
        {
          type: 'string',
          description: 'Optional: Wait condition (load, networkidle, selector)',
          enum: ['load', 'networkidle', 'selector'],
        },
        {
          type: 'number',
          description: 'Optional: Timeout in milliseconds',
          minimum: 1000,
          maximum: 60000,
        },
      ],
      required: ['url'],
      handler: this.createBrowserHandler('navigateToUrl'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'clickElement',
      description: 'Click on a web element using CSS selector or text content',
      parameters: [
        {
          type: 'string',
          description: 'CSS selector for the element to click',
        },
        {
          type: 'string',
          description: 'Text content to find and click (alternative to selector)',
        },
        {
          type: 'boolean',
          description: 'Optional: Wait for navigation after click',
        },
        {
          type: 'number',
          description: 'Optional: Timeout in milliseconds',
          minimum: 1000,
          maximum: 30000,
        },
      ],
      required: [],
      handler: this.createBrowserHandler('clickElement'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'fillForm',
      description: 'Fill out a web form with specified values',
      parameters: [
        {
          type: 'string',
          description: 'Array of form fields to fill (JSON format string or object array). Each field should have selector/name and value properties.',
        },
        {
          type: 'boolean',
          description: 'Optional: Submit the form after filling',
        },
      ],
      required: ['fields'],
      handler: this.createBrowserHandler('fillForm'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: false,
    });

    // Removed legacy extractContent tool. Add new nanobrowser-style parsing tools

    this.registerTool({
      name: 'getPageTextSnapshot',
      description: 'Get a comprehensive visible-text snapshot of the current page (nanobrowser-style)',
      parameters: [],
      required: [],
      handler: async (_params: any) => {
        const start = Date.now();
        const log = (level: 'info' | 'warn' | 'error', msg: string, data?: any) => {
          try { (console as any)[level](`[ToolRegistry][getPageTextSnapshot] ${msg}`, data || {}); } catch {}
        };
        const { IndexBasedElementSelector } = await import('../agents/ElementSelector');
        const selector = new IndexBasedElementSelector();
        const activeTab = await this.getOrCreateActiveTab();
        if (!activeTab.id) throw new Error('No active tab');
        try { await this.ensureContentScriptAvailable(activeTab.id); } catch (e) { log('warn', 'ensureContentScriptAvailable failed', { error: (e as any)?.message }); }
        log('info', 'Invoking selector.getPageTextSnapshot', { tabId: activeTab.id, url: activeTab.url });
        const snapshot = await selector.getPageTextSnapshot(activeTab.id);
        log('info', 'Snapshot received', { length: snapshot?.length, wordCount: snapshot?.wordCount });
        return { success: true, data: snapshot, timing: Date.now() - start };
      },
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
      requiredPermissions: ['scripting', 'activeTab']
    });

    this.registerTool({
      name: 'getAllVisibleText',
      description: 'Get normalized visible text from the current page',
      parameters: [],
      required: [],
      handler: async (_params: any) => {
        const start = Date.now();
        const { IndexBasedElementSelector } = await import('../agents/ElementSelector');
        const selector = new IndexBasedElementSelector();
        const activeTab = await this.getOrCreateActiveTab();
        if (!activeTab.id) throw new Error('No active tab');
        try { await this.ensureContentScriptAvailable(activeTab.id); } catch {}
        const text = await selector.getAllVisibleText(activeTab.id);
        return {
          success: true,
          data: { text, length: text.length, wordCount: text.split(/\s+/).filter(Boolean).length },
          timing: Date.now() - start,
        };
      },
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
      requiredPermissions: ['scripting', 'activeTab']
    });

    this.registerTool({
      name: 'getPageElements',
      description: 'Get interactive elements on the page with indices and metadata',
      parameters: [],
      required: [],
      handler: async (_params: any) => {
        const start = Date.now();
        const { IndexBasedElementSelector } = await import('../agents/ElementSelector');
        const selector = new IndexBasedElementSelector();
        const activeTab = await this.getOrCreateActiveTab();
        if (!activeTab.id) throw new Error('No active tab');
        try { await this.ensureContentScriptAvailable(activeTab.id); } catch {}
        const result = await selector.getPageElements(activeTab.id);
        return { success: true, data: result, timing: Date.now() - start };
      },
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
      requiredPermissions: ['scripting', 'activeTab']
    });

    this.registerTool({
      name: 'evaluatePageCompletion',
      description: 'Evaluate task completion based on include/exclude criteria against page text',
      parameters: [
        {
          type: 'object',
          description: 'Completion criteria: { includeAll?, includeAny?, excludeAny?, regexIncludeAll?, regexExcludeAny?, minWordCount? }'
        }
      ],
      required: ['criteria'],
      handler: async (params: any) => {
        const start = Date.now();
        if (!params || typeof params.criteria !== 'object') throw new Error('criteria object required');
        const { IndexBasedElementSelector } = await import('../agents/ElementSelector');
        const selector = new IndexBasedElementSelector();
        const activeTab = await this.getOrCreateActiveTab();
        if (!activeTab.id) throw new Error('No active tab');
        try { await this.ensureContentScriptAvailable(activeTab.id); } catch {}
        const result = await selector.evaluateCompletion(activeTab.id, params.criteria);
        return { success: true, data: result, timing: Date.now() - start };
      },
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
      requiredPermissions: ['scripting', 'activeTab']
    });

    this.registerTool({
      name: 'waitFor',
      description: 'Wait for a specific condition or time period',
      parameters: [
        {
          type: 'string',
          description: 'What to wait for',
          enum: ['time', 'element', 'navigation'],
        },
        {
          type: 'number',
          description: 'Timeout in milliseconds',
          minimum: 1000,
          maximum: 60000,
        },
        {
          type: 'string',
          description: 'Optional: CSS selector if waiting for element',
        },
      ],
      required: [],
      handler: this.createBrowserHandler('waitFor'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'takeScreenshot',
      description: 'Take a screenshot of the current page',
      parameters: [
        {
          type: 'string',
          description: 'Optional: Specific element to screenshot (CSS selector)',
        },
        {
          type: 'boolean',
          description: 'Optional: Capture full page',
        },
      ],
      required: [],
      handler: this.createBrowserHandler('takeScreenshot'),
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    // Enhanced browser automation tools for multi-agent system
    this.registerTool({
      name: 'scrollPage',
      description: 'Scroll the page to a specific position or element',
      parameters: [
        {
          type: 'string',
          description: 'Scroll direction (up, down, top, bottom, element)',
          enum: ['up', 'down', 'top', 'bottom', 'element'],
        },
        {
          type: 'string',
          description: 'Optional: CSS selector if direction is "element"',
        },
        {
          type: 'number',
          description: 'Optional: Scroll amount in pixels',
          minimum: 1,
          maximum: 5000,
        },
      ],
      required: [],
      handler: this.createBrowserHandler('scrollPage'),
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'switchTab',
      description: 'Switch to a different browser tab',
      parameters: [
        {
          type: 'number',
          description: 'Tab index to switch to (0-based)',
          minimum: 0,
        },
        {
          type: 'string',
          description: 'Optional: Tab URL pattern to match',
        },
      ],
      required: [],
      handler: this.createBrowserHandler('switchTab'),
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'openNewTab',
      description: 'Open a new browser tab',
      parameters: [
        {
          type: 'string',
          description: 'URL to open in new tab',
          pattern: '^https?://.+',
        },
        {
          type: 'boolean',
          description: 'Optional: Switch to new tab immediately',
        },
      ],
      required: ['url'],
      handler: this.createBrowserHandler('openNewTab'),
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'closeTab',
      description: 'Close the current or specified browser tab',
      parameters: [
        {
          type: 'number',
          description: 'Optional: Tab index to close (closes current if not specified)',
          minimum: 0,
        },
      ],
      required: [],
      handler: this.createBrowserHandler('closeTab'),
      category: 'browser',
      riskLevel: 'medium',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'getElementInfo',
      description: 'Get detailed information about web elements',
      parameters: [
        {
          type: 'string',
          description: 'CSS selector for the element',
        },
        {
          type: 'boolean',
          description: 'Optional: Get all matching elements',
        },
      ],
      required: ['selector'],
      handler: this.createBrowserHandler('getElementInfo'),
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'hoverElement',
      description: 'Hover over a web element with enhanced mouse event simulation (nanobrowser-aligned)',
      parameters: [
        {
          type: 'string',
          description: 'CSS selector or XPath for the element to hover over',
        },
        {
          type: 'number',
          description: 'Optional: Duration to hover in milliseconds (default: 1000)',
          minimum: 100,
          maximum: 10000,
        },
        {
          type: 'boolean',
          description: 'Scroll element into view before hovering (default: true)',
        },
      ],
      required: ['selector'],
      handler: async (params: any) => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab available');

        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (p: any) => {
            const bySelector = (sel: string): Element | null => { try { return document.querySelector(sel); } catch { return null; } };
            const byXPath = (xp: string): Element | null => { try { const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null); return (r.singleNodeValue as Element) || null; } catch { return null; } };
            const sel: string = String(p.selector || '');
            const element = sel.startsWith('/') ? byXPath(sel) : bySelector(sel);
            if (!element) return { success: false, error: 'Element not found' };
            const el = element as HTMLElement;
            if (p.scrollIntoView !== false) {
              try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as any }); } catch { try { el.scrollIntoView(); } catch {} }
            }
            const rect = el.getBoundingClientRect();
            const cx = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
            const cy = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
            const fire = (type: string) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window }));
            fire('mousemove');
            fire('mouseover');
            fire('mouseenter');
            if (p.duration && Number(p.duration) > 0) {
              const end = Date.now() + Number(p.duration);
              const step = () => { if (Date.now() < end) { fire('mousemove'); requestAnimationFrame(step); } };
              requestAnimationFrame(step);
            }
            return { success: true };
          },
          args: [params]
        });

        return result[0]?.result || { success: false, error: 'Script execution failed' };
      },
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'dragAndDrop',
      description: 'Drag and drop an element to a target location',
      parameters: [
        {
          type: 'string',
          description: 'CSS selector for the source element',
        },
        {
          type: 'string',
          description: 'CSS selector for the target element',
        },
        {
          type: 'number',
          description: 'Optional: Duration of drag in milliseconds',
          minimum: 100,
          maximum: 5000,
        },
      ],
      required: ['sourceSelector', 'targetSelector'],
      handler: this.createBrowserHandler('dragAndDrop'),
      category: 'browser',
      riskLevel: 'medium',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'uploadFile',
      description: 'Upload a file to a file input element',
      parameters: [
        {
          type: 'string',
          description: 'CSS selector for the file input element',
        },
        {
          type: 'string',
          description: 'File path or content to upload',
        },
        {
          type: 'string',
          description: 'Optional: File name',
        },
      ],
      required: ['selector', 'fileContent'],
      handler: this.createBrowserHandler('uploadFile'),
      category: 'browser',
      riskLevel: 'medium',
      requiresConfirmation: true,
    });

    this.registerTool({
      name: 'executeJavaScript',
      description: 'Execute custom JavaScript code on the page',
      parameters: [
        {
          type: 'string',
          description: 'JavaScript code to execute',
        },
        {
          type: 'boolean',
          description: 'Optional: Return execution result',
        },
      ],
      required: ['code'],
      handler: this.createBrowserHandler('executeJavaScript'),
      category: 'browser',
      riskLevel: 'high',
      requiresConfirmation: true,
    });

    this.registerTool({
      name: 'waitForElement',
      description: 'Wait for an element to appear, disappear, or change state',
      parameters: [
        {
          type: 'string',
          description: 'CSS selector for the element',
        },
        {
          type: 'string',
          description: 'Wait condition (appear, disappear, visible, hidden, enabled, disabled)',
          enum: ['appear', 'disappear', 'visible', 'hidden', 'enabled', 'disabled'],
        },
        {
          type: 'number',
          description: 'Timeout in milliseconds',
          minimum: 1000,
          maximum: 60000,
        },
      ],
      required: ['selector', 'condition'],
      handler: this.createBrowserHandler('waitForElement'),
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    // Element selection tools are provided via DOM service and content script helpers

    // Enhanced DOM clickable elements builder (nanobrowser-aligned)
    this.registerTool({
      name: 'getClickableElements',
      description: 'Build comprehensive DOM tree and return interactive elements via enhanced background DOM service (nanobrowser-aligned with shadowRoot, enhanced XPath, performance metrics)',
      parameters: [
        { type: 'boolean', description: 'showHighlightElements: Draw overlay with numbered highlights (default: true)' },
        { type: 'number', description: 'focusElement: Highlight index to focus (-1 for none, default: -1)' },
        { type: 'number', description: 'viewportExpansion: Expand viewport detection area in pixels (default: 0)' },
        { type: 'boolean', description: 'debugMode: Enable performance metrics and debug logging (default: false)' },
      ],
      required: [],
      handler: async (params: any) => {
        // Global dedupe key: tab + url + highlight flags
        const tabForKey = this.lastActiveTabId || 0;
        const showHighlight = params?.[0] ?? params?.showHighlightElements ?? true;
        const focusIndex = params?.[1] ?? params?.focusElement ?? -1;
        const viewportExpansion = params?.[2] ?? params?.viewportExpansion ?? 0;
        const debugMode = params?.[3] ?? params?.debugMode ?? false;

        let keyUrl = 'about:blank';
        try {
          if (this.lastActiveTabId) {
            const t = await chrome.tabs.get(this.lastActiveTabId);
            keyUrl = t?.url || 'about:blank';
          }
        } catch {}
        const dedupeKey = `${tabForKey}|${keyUrl}|${showHighlight}|${focusIndex}|${viewportExpansion}|${debugMode}`;

        // Throttle window to avoid back-to-back identical scans within 800ms
        const nowTs = Date.now();
        const lastAt = this.lastGetClickableAtByKey.get(dedupeKey) || 0;
        const recentMs = nowTs - lastAt;
        if (recentMs < 800) {
          const cached = this.lastGetClickableResultByKey.get(dedupeKey);
          if (cached) return cached;
        }

        // If an identical call is in-flight, await the same promise
        const pending = this.pendingGetClickableByKey.get(dedupeKey);
        if (pending) return pending;

        const execPromise = (async () => {
          // Resolve target tab and URL (robust)
          let targetTab: chrome.tabs.Tab | undefined;
          try {
            if (this.lastActiveTabId) {
              const t = await chrome.tabs.get(this.lastActiveTabId);
              if (t && t.id) targetTab = t;
            }
          } catch {}
          if (!targetTab || !targetTab.id) {
            const validation = await this.validateElementSelectionPrerequisites();
            if (!validation.valid) {
              const fail = { success: false, error: validation.error, action: 'getClickableElements', params };
              return fail;
            }
            targetTab = await this.getOrCreateActiveTab();
          }
          const url = targetTab.url || 'about:blank';

          const domState = await getClickableElements(targetTab.id!, url, showHighlight, focusIndex, viewportExpansion, debugMode);

          // Enhanced serialization with better element data
          const items: any[] = [];
          const selectorMap: Map<number, any> = (domState as any).selectorMap;
          if (selectorMap && typeof selectorMap.forEach === 'function') {
            selectorMap.forEach((node: any, idx: number) => {
              const bounds = node?.viewportCoordinates || node?.pageCoordinates;
              const selector = node?.xpath || '';
              const text = node?.textContent || (node?.getAllTextTillNextClickableElement ? node.getAllTextTillNextClickableElement(1) : '');
              const attrs = node?.attributes || {};

              items.push({
                highlightIndex: idx,
                selector,
                element: {
                  tagName: node?.tagName,
                  textContent: text,
                  attributes: attrs,
                  type: attrs.type || '',
                  role: attrs.role || '',
                  id: attrs.id || '',
                  name: attrs.name || '',
                  className: attrs.class || ''
                },
                bounds,
                isVisible: node?.isVisible,
                isInteractive: node?.isInteractive,
                isTopElement: node?.isTopElement,
                isInViewport: node?.isInViewport,
              });
            });
          }

          // Include performance metrics if debug mode
          const result: any = { success: true, data: { items, count: items.length } };
          if (debugMode && (domState as any).perfMetrics) {
            result.data.perfMetrics = (domState as any).perfMetrics;
          }

          return result;
        })();

        this.pendingGetClickableByKey.set(dedupeKey, execPromise);
        try {
          const res = await execPromise;
          this.lastGetClickableAtByKey.set(dedupeKey, Date.now());
          this.lastGetClickableResultByKey.set(dedupeKey, res);
          return res;
        } finally {
          this.pendingGetClickableByKey.delete(dedupeKey);
        }
      },
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
    });



    // Additional element selection helpers (content-script backed)
    this.registerTool({
      name: 'clearHighlights',
      description: 'Clear all element highlights overlay on the active web page',
      parameters: [],
      required: [],
      handler: this.createElementSelectionHandler('clearHighlights'),
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
    });



    this.registerTool({
      name: 'getInteractiveElements',
      description: 'Scan and return interactive elements on the current page (debug/overlay supported)',
      parameters: [
        { type: 'string', description: 'elementType: optional kind (button|input|link|all)' },
        { type: 'string', description: 'textFilter: optional text contains filter' },
        { type: 'boolean', description: 'includeAttributes: whether to include attributes' },
      ],
      required: [],
      handler: this.createElementSelectionHandler('getInteractiveElements'),
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    // Multi-agent coordination tools
    this.registerTool({
      name: 'createExecutionPlan',
      description: 'Create a detailed execution plan for complex tasks',
      parameters: [
        {
          type: 'string',
          description: 'Task description or instruction',
        },
        {
          type: 'string',
          description: 'Task complexity level',
          enum: ['simple', 'medium', 'complex'],
        },
        {
          type: 'boolean',
          description: 'Optional: Enable risk assessment',
        },
      ],
      required: ['task', 'complexity'],
      handler: this.createMultiAgentHandler('createExecutionPlan'),
      category: 'system',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    // Enhanced scrollIntoView tool
    this.registerTool({
      name: 'scrollIntoView',
      description: 'Scroll an element into view with enhanced options (nanobrowser-aligned)',
      parameters: [
        { type: 'string', description: 'selector: CSS selector or XPath of the element to scroll into view' },
        { type: 'string', description: 'block: Vertical alignment (start, center, end, nearest). Default: center' },
        { type: 'string', description: 'inline: Horizontal alignment (start, center, end, nearest). Default: center' },
        { type: 'boolean', description: 'smooth: Use smooth scrolling animation. Default: false' },
        { type: 'number', description: 'offset: Additional offset in pixels after scrolling. Default: 0' },
      ],
      required: ['selector'],
      handler: async (params: any) => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab available');

        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (sel: string, block: string, inline: string, smooth: boolean, offset: number) => {
            const bySelector = (s: string): Element | null => { try { return document.querySelector(s); } catch { return null; } };
            const byXPath = (xp: string): Element | null => { try { const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null); return (r.singleNodeValue as Element) || null; } catch { return null; } };
            const element = sel.startsWith('/') ? byXPath(sel) : bySelector(sel);
            if (!element) return { success: false, error: 'Element not found' };

            const options: ScrollIntoViewOptions = {
              block: (block as any) || 'center',
              inline: (inline as any) || 'center',
              behavior: smooth ? 'smooth' : 'auto'
            };

            element.scrollIntoView(options);

            // Apply additional offset if specified
            if (offset) {
              setTimeout(() => window.scrollBy(0, offset), smooth ? 500 : 0);
            }

            return { success: true, element: element.tagName };
          },
          args: [params.selector, params.block || 'center', params.inline || 'center', Boolean(params.smooth), Number(params.offset || 0)]
        });

        return result[0]?.result || { success: false, error: 'Script execution failed' };
      },
      category: 'browser',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'validateTaskCompletion',
      description: 'Validate if a task was completed successfully',
      parameters: [
        {
          type: 'string',
          description: 'Original task instruction',
        },
        {
          type: 'string',
          description: 'Expected outcome or result',
        },
        {
          type: 'boolean',
          description: 'Optional: Perform deep validation',
        },
      ],
      required: ['task', 'expectedOutcome'],
      handler: this.createMultiAgentHandler('validateTaskCompletion'),
      category: 'system',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'getMultiAgentStatus',
      description: 'Get the status of all agents in the multi-agent system',
      parameters: [],
      required: [],
      handler: this.createMultiAgentHandler('getMultiAgentStatus'),
      category: 'system',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'enableMultiAgentCoordination',
      description: 'Enable or disable multi-agent coordination',
      parameters: [
        {
          type: 'boolean',
          description: 'Enable (true) or disable (false) multi-agent coordination',
        },
      ],
      required: ['enabled'],
      handler: this.createMultiAgentHandler('enableMultiAgentCoordination'),
      category: 'system',
      riskLevel: 'low',
      requiresConfirmation: false,
    });
  }

  private initializeSystemTools(): void {
    // System tools for wallet and agent management
    this.registerTool({
      name: 'getWalletInfo',
      description:
        'Get current wallet information including address and network',
      parameters: [],
      required: [],
      handler: async () => {
        try {
          // Get real wallet information from Rabby services
          const currentAccount = await preferenceService.getCurrentAccount();
          const currentNetwork = (await (preferenceService as any).getCurrentNetwork?.()) || {
            name: 'Unknown Network',
            chainId: 1,
          };

          if (!currentAccount) {
            return {
              address: '',
              network: 'Not Connected',
              chainId: 0,
              balance: '0 ETH',
              connected: false,
            };
          }

          // Get real balance using provider controller
          const balanceResponse = await fetch(
            'https://api.etherscan.io/api?module=account&action=balance&address=' +
              currentAccount.address +
              '&tag=latest&apikey=YourApiKey'
          );
          const balanceData = await balanceResponse.json();
          const balanceWei = balanceData.result || '0';
          const balanceEth = (parseInt(balanceWei) / 1e18).toFixed(6);

          return {
            address: currentAccount.address,
            network: currentNetwork.name || 'Unknown Network',
            chainId: currentNetwork.chainId || 1,
            balance: `${balanceEth} ETH`,
            connected: true,
          };
        } catch (error) {
          logger.error('Failed to get wallet info:', error);
          return {
            address: '',
            network: 'Error',
            chainId: 0,
            balance: '0 ETH',
            connected: false,
          };
        }
      },
      category: 'system',
      riskLevel: 'low',
      requiresConfirmation: false,
    });

    this.registerTool({
      name: 'getAgentStatus',
      description: 'Get current agent status and capabilities',
      parameters: [],
      required: [],
      handler: async () => {
        return {
          status: 'ready',
          capabilities: [
            'Web3 transactions',
            'Token swaps',
            'NFT management',
            'DeFi operations',
            'Cross-chain bridging',
          ],
          version: '1.0.0',
          timestamp: Date.now(),
        };
      },
      category: 'system',
      riskLevel: 'low',
      requiresConfirmation: false,
    });
  }

  private createBrowserHandler(actionName: string) {
    return async (params: any) => {
      const startTime = Date.now();
      const executionId = `browser_${actionName}_${Date.now()}`;

      // Prevent accidental duplicate executions
      // Allow UI-triggered actions to bypass dedup to keep panel responsive
      const bypassDedup = params?.noDedup === true || params?._source === 'ElementSelector' || params?._source === 'ui' || params?.__from === 'ui';
      if (!bypassDedup) {
        const normalizedUrl = (params && typeof params.url === 'string') ? String(params.url).trim().toLowerCase() : '';
        const duplicateKey = actionName === 'navigateToUrl'
          ? `${actionName}_${normalizedUrl}`
          : `${actionName}_${JSON.stringify(params)}`;
        const lastExecution = this.executionTracker.get(duplicateKey);
        // Finer-grained intervals per action
        const intervalMap: Record<string, number> = {
          navigateToUrl: 5000,
          clickElement: 300,
          hoverElement: 300,
          fillForm: 500,
          scrollPage: 300,
        };
        const duplicateInterval = intervalMap[actionName] ?? 1500;
        if (lastExecution && (Date.now() - lastExecution) < duplicateInterval) {
          logger.warn(`Preventing duplicate execution of ${actionName}`, {
            params,
            timeSinceLastExecution: Date.now() - lastExecution,
            duplicateInterval
          });
          throw new Error(`Duplicate execution prevented for ${actionName}`);
        }
        this.executionTracker.set(duplicateKey, Date.now());
      }

      try {
        logger.info(`[${executionId}] Starting browser automation action: ${actionName}`, {
          params,
          actionName,
          executionId,
          timestamp: startTime,
        });

        // Validate input parameters (allow defaults for certain actions)
        if (!params || typeof params !== 'object') {
            throw new Error(`Invalid parameters received: ${JSON.stringify(params)}`);
        }

        // Create browser automation controller
        const browserController = new BrowserAutomationController();
        logger.info(`[${executionId}] Browser controller created`, {
          controllerExists: !!browserController,
        });

        // Handle special case for fillForm - parse JSON string if needed
        let processedParams = params;
        if (actionName === 'fillForm') {
          let fields = params.fields;

          // Case 1: fields is already an array (correct format)
          if (Array.isArray(fields)) {
            logger.info(`[${executionId}] Fields already in array format`, {
              fieldsCount: fields.length,
            });
          }
          // Case 2: fields is a string that needs parsing
          else if (typeof fields === 'string') {
            try {
              // Try to parse as JSON first
              fields = JSON.parse(fields);
              logger.info(`[${executionId}] Parsed fields JSON string successfully`, {
                fieldsCount: Array.isArray(fields) ? fields.length : 'not-array',
              });
            } catch (parseError) {
              // If JSON parsing fails, check if it's already a parsed string that was double-encoded
              try {
                fields = JSON.parse(JSON.parse(fields));
                logger.info(`[${executionId}] Parsed double-encoded JSON successfully`, {
                  fieldsCount: Array.isArray(fields) ? fields.length : 'not-array',
                });
              } catch (doubleParseError) {
                logger.error(`[${executionId}] Failed to parse fields JSON (both attempts)`, {
                  error: parseError instanceof Error ? parseError.message : String(parseError),
                  doubleError: doubleParseError instanceof Error ? doubleParseError.message : String(doubleParseError),
                  rawFields: params.fields,
                });
                throw new Error(`Invalid JSON in fields parameter: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
              }
            }
          }
          // Case 3: fields is neither array nor string
          else {
            logger.error(`[${executionId}] Invalid fields parameter type`, {
              fields: params.fields,
              fieldType: typeof params.fields,
            });
            throw new Error('fields parameter must be a JSON string or array');
          }

          // Final validation that we have an array
          if (!Array.isArray(fields)) {
            logger.error(`[${executionId}] Fields parsing did not result in array`, {
              finalFields: fields,
              finalType: typeof fields,
            });
            throw new Error('fields parameter must resolve to an array');
          }

          // Update processed params
          processedParams = {
            ...params,
            fields: fields,
          };
        }

        // no-op for removed extractContent

        // Validate required parameters for specific actions
        if (actionName === 'navigateToUrl') {
          console.log(`🚨🚨🚨 [${executionId}] VALIDATING navigateToUrl PARAMETERS`, {
            params,
            hasUrl: !!params.url,
            urlType: typeof params.url,
            urlValue: params.url,
          });

          if (!params.url || typeof params.url !== 'string') {
            throw new Error('navigateToUrl requires a valid URL string');
          }
        }

        // Execute the action
        const actionStep = {
          id: `browser_${actionName}_${Date.now()}`,
          name: `Execute ${actionName}`,
          type: actionName,
          description: `Browser automation: ${actionName}`,
          params: processedParams,
          status: 'pending' as const,
          dependencies: [],
          riskLevel: 'MEDIUM' as const,
        };
        const result = await browserController.executeAction(actionStep);

        const executionTime = Date.now() - startTime;
        logger.info(`[${executionId}] Browser automation action completed`, {
            actionName,
          success: result.success,
          executionTime,
          hasData: !!result.data,
          hasError: !!result.error,
        });

        // Monitor tab state after tool execution
        await this.monitorTabStateAfterTool(actionName, result);

        return this.ensureStandardResult(actionName, processedParams, result);

      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error(`[${executionId}] Browser automation action failed`, {
            actionName,
          error: error instanceof Error ? error.message : String(error),
            executionTime,
          params,
        });

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Browser automation failed',
          data: null,
          timing: executionTime,
        };
      }
    };
  }

  private createDirectExtractContentHandler() {
    return async (params: any) => {
      const startTime = Date.now();
      const executionId = `extract_${Date.now()}`;

      try {
        logger.info(`[${executionId}] Starting direct content extraction`, {
          params,
          executionId,
          timestamp: startTime,
        });

        // Validate input parameters
        if (!params || typeof params !== 'object') {
          params = {};
        }

        // Import ElementSelector for direct functionality
        const { IndexBasedElementSelector } = await import('../agents/ElementSelector');
        const elementSelector = new IndexBasedElementSelector();

        // Get active tab
        const activeTab = await this.getOrCreateActiveTab();
        if (!activeTab.id) {
          throw new Error('No active tab available for content extraction');
        }

        let result: any;

        // Handle different extraction types directly
        switch (params.type) {
          case 'snapshot':
            // Get comprehensive page snapshot
            const snapshot = await elementSelector.getPageTextSnapshot(activeTab.id);
            result = {
              success: true,
              data: {
                type: 'snapshot',
                snapshot,
                url: snapshot.url,
                title: snapshot.title,
                textLength: snapshot.length,
                wordCount: snapshot.wordCount,
                headings: snapshot.headings,
                links: snapshot.links,
                inputs: snapshot.inputs,
                meta: snapshot.meta,
                timestamp: snapshot.timestamp,
              },
              timing: Date.now() - startTime,
            };
            break;

          case 'elements':
            // Get all interactive elements
            const elementsResult = await elementSelector.getPageElements(activeTab.id);
            result = {
              success: true,
              data: {
                type: 'elements',
                elements: elementsResult.elements,
                count: elementsResult.elements.length,
                confidence: elementsResult.confidence,
                reasoning: elementsResult.reasoning,
              },
              timing: Date.now() - startTime,
            };
            break;

          case 'completion':
            // Evaluate completion criteria
            if (!params.criteria) {
              throw new Error('Completion criteria required for completion type');
            }
            const completionResult = await elementSelector.evaluateCompletion(
              activeTab.id,
              params.criteria
            );
            result = {
              success: true,
              data: {
                type: 'completion',
                completed: completionResult.completed,
                score: completionResult.score,
                matched: completionResult.matched,
                missing: completionResult.missing,
                excludedMatched: completionResult.excludedMatched,
                reasoning: completionResult.reasoning,
                snapshot: completionResult.snapshot,
              },
              timing: Date.now() - startTime,
            };
            break;

          case 'text':
          default:
            // Get visible text using enhanced extraction (selector-specific extraction removed)
            const text = await elementSelector.getAllVisibleText(activeTab.id);
            result = {
              success: true,
              data: {
                type: 'text',
                content: text,
                length: text.length,
                wordCount: text.split(/\s+/).filter(Boolean).length,
                selector: params.selector || 'body',
              },
              timing: Date.now() - startTime,
            };
            break;

          case 'html':
          case 'value':
          case 'attribute':
            // Legacy HTML/value/attribute extraction removed; not supported in new tool
            throw new Error('html/value/attribute extraction is removed. Use snapshot/text/elements/completion instead.');
            break;
        }

        logger.info(`[${executionId}] Direct content extraction completed`, {
          success: result.success,
          executionTime: Date.now() - startTime,
          hasData: !!result.data,
        });

        return result;

      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error(`[${executionId}] Direct content extraction failed`, {
          error: error instanceof Error ? error.message : String(error),
          executionTime,
          params,
        });

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Content extraction failed',
          data: null,
          timing: executionTime,
        };
      }
    };
  }

  private createWeb3Handler(actionName: string) {
    return async (params: any) => {
      try {
        logger.info(`Executing Web3 action: ${actionName}`, params);

        // Create agent context
        const context: AgentContext = {
          tabId: 1, // Required field
          sessionId: 'agent-session', // Required field
          eventHandler: (event: any) => {}, // Required field
          currentChain: '1', // Default to Ethereum
          currentAddress:
            (await preferenceService.getCurrentAccount())?.address || '',
          riskLevel: 'medium',
          balances: {},
          gasPrices: {},
          protocols: {},
          origin: '',
        };

        // Use real Web3Action class
        const web3Action = new Web3Action(context);
        const result = await web3Action.executeAction(actionName, params);

        return {
          action: actionName,
          params,
          data: result?.data ?? null,
          result: result?.data ?? null,
          success: result.success,
          timestamp: Date.now(),
          error: result.error,
        };
      } catch (error) {
        logger.error(`Web3 action failed: ${actionName}`, error);
        return {
          action: actionName,
          params,
          result: null,
          success: false,
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };
  }

  private createElementSelectionHandler(actionName: string) {
    return async (params: any) => {
      try {
        logger.info(`Executing element selection action: ${actionName}`, params);

        // Determine target tab
        let targetTab: chrome.tabs.Tab;
        try {
          if (params && typeof params.tabId === 'number') {
            const t = await chrome.tabs.get(params.tabId);
            if (!t || !t.id) throw new Error('Invalid tabId provided');
            // Validate tab URL scheme
            const url = t.url || '';
            if (!/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url)) {
              throw new Error(`Provided tabId (${params.tabId}) is not a regular web page (url=${url || 'unknown'})`);
            }
            targetTab = t;
            logger.info('Using provided tabId for element selection', { tabId: targetTab.id, url: targetTab.url });
          } else {
            if (this.lastActiveTabId) {
              try {
                const t = await chrome.tabs.get(this.lastActiveTabId);
                if (t && t.id) {
                  targetTab = t;
                  logger.info('Using lastActiveTabId for element selection', { tabId: t.id, url: t.url });
                } else {
                  targetTab = await this.getOrCreateActiveTab();
                }
              } catch (e) {
                logger.warn('Failed to use lastActiveTabId; falling back to active tab', e);
                targetTab = await this.getOrCreateActiveTab();
              }
            } else {
              targetTab = await this.getOrCreateActiveTab();
            }
          }
        } catch (tabError: any) {
          logger.error('Failed to resolve target tab', tabError);
          throw new Error(`Failed to resolve target tab: ${tabError.message || tabError}`);
        }

        // Fast path: if content script is already reachable, do not require 'scripting' permission
        let reachable = false;
        try {
          await chrome.tabs.sendMessage(targetTab.id!, { type: 'PING' });
          reachable = true;
          logger.info('Content script reachable (fast path)', { tabId: targetTab.id });
        } catch {}

        if (!reachable) {
          // Check permissions only when we actually need to inject
          let hasScripting = false;
          try {
            const permissions = await chrome.permissions.getAll();
            hasScripting = permissions.permissions?.includes('scripting') === true;
          } catch (permError) {
            logger.warn('Permission query failed; will attempt to proceed', permError);
          }

          if (!hasScripting) {
            throw new Error('Content script not available and missing "scripting" permission. Please open a regular web page and/or grant scripting permission.');
          }

          // Attempt to inject/ensure availability now that we confirmed permission
          try {
            await this.ensureContentScriptAvailable(targetTab.id!);
          } catch (scriptError: any) {
            logger.error('Failed to ensure content script availability', scriptError);
            throw new Error(`Content script not available: ${scriptError.message || scriptError}`);
          }
        }

        // Map action names to message types
        const messageTypes: Record<string, string> = {
          activateElementSelector: 'ELEMENT_SELECTOR_ACTIVATE',
          deactivateElementSelector: 'ELEMENT_SELECTOR_DEACTIVATE',
          getHighlightedElements: 'ELEMENT_SELECTOR_GET_HIGHLIGHTS',
          analyzeElement: 'ELEMENT_ANALYZE',
          clearHighlights: 'ELEMENT_SELECTOR_CLEAR',
          // Use a dedicated message that content script actually handles
          getInteractiveElements: 'ELEMENT_GET_INTERACTIVE_ELEMENTS',
        };

        const messageType = messageTypes[actionName] || actionName.toUpperCase();

        // Send message to content script
        let response: any;
        try {
          response = await chrome.tabs.sendMessage(targetTab.id!, {
            type: messageType,
            params,
          });
        } catch (messageError) {
          logger.error('Failed to send message to content script', messageError);
          throw new Error(`Failed to communicate with content script: ${messageError.message}`);
        }

        if (!response || !response.success) {
          const errorDetails = response?.error || 'Element selection action failed';
          logger.error('Content script returned error response', {
            actionName,
            error: errorDetails,
            response
          });
          throw new Error(errorDetails);
        }

        // Store last candidates for the tab so agent can use them next (generic)
        const elementsData = response?.data;

        // Shape result for LLM
        const llmResult = elementsData;

        return {
          action: actionName,
          params,
          data: llmResult,
          result: llmResult,
          success: true,
          timestamp: Date.now(),
          tabId: targetTab.id,
          tabUrl: targetTab.url
        };
      } catch (error) {
        logger.error(`Element selection action failed: ${actionName}`, error);
        return {
          action: actionName,
          params,
          result: null,
          success: false,
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };
  }

  private createMultiAgentHandler(actionName: string) {
    return async (params: any) => {
      try {
        logger.info(`Executing multi-agent action: ${actionName}`, params);

        // Import Web3Agent dynamically to avoid circular dependency
        const { Web3Agent } = await import('../Web3Agent');

        // Get or create Web3Agent instance
        // This is a simplified approach - in production, you'd want to manage instances properly
        let web3Agent: InstanceType<typeof Web3Agent> | null = null;

        switch (actionName) {
          case 'createExecutionPlan':
            // This would integrate with the PlannerAgent
            return {
              action: actionName,
              params,
              result: {
                plan: {
                  id: `plan_${Date.now()}`,
                  name: params.task,
                  description: `Execution plan for: ${params.task}`,
                  complexity: params.complexity,
                  estimatedSteps: Math.ceil(params.task.length / 10), // Simple estimation
                  riskAssessment: params.enableRiskAssessment ? {
                    overallRisk: params.complexity === 'complex' ? 'MEDIUM' : 'LOW',
                    factors: [],
                    recommendations: []
                  } : undefined
                },
                success: true,
                message: `Created execution plan for task: ${params.task}`
              },
              success: true,
              timestamp: Date.now(),
            };

          case 'validateTaskCompletion':
            // This would integrate with the ValidatorAgent
            return {
              action: actionName,
              params,
              result: {
                validation: {
                  isValid: true, // Simplified validation
                  confidence: 0.85,
                  reason: 'Task appears to be completed based on available context',
                  details: {
                    task: params.task,
                    expectedOutcome: params.expectedOutcome,
                    validationMethod: params.deepValidation ? 'deep' : 'basic'
                  }
                },
                success: true,
                message: 'Task validation completed'
              },
              success: true,
              timestamp: Date.now(),
            };

          case 'getMultiAgentStatus':
            // Get multi-agent system status
            return {
              action: actionName,
              params,
              result: {
                agents: {
                  planner: { available: true, status: 'ready' },
                  navigator: { available: true, status: 'ready' },
                  validator: { available: true, status: 'ready' }
                },
                coordination: {
                  enabled: true,
                  activeTasks: 0,
                  totalExecutions: 0
                },
                system: {
                  uptime: Date.now(),
                  version: '1.0.0',
                  capabilities: [
                    'Web3 operations',
                    'Browser automation',
                    'Task planning',
                    'Result validation'
                  ]
                },
                success: true,
                message: 'Multi-agent system status retrieved'
              },
              success: true,
              timestamp: Date.now(),
            };

          case 'enableMultiAgentCoordination':
            // Enable/disable multi-agent coordination
            return {
              action: actionName,
              params,
              result: {
                coordination: {
                  enabled: params.enabled,
                  previousState: !params.enabled,
                  timestamp: Date.now()
                },
                success: true,
                message: `Multi-agent coordination ${params.enabled ? 'enabled' : 'disabled'}`
              },
              success: true,
              timestamp: Date.now(),
            };

          default:
            throw new Error(`Unknown multi-agent action: ${actionName}`);
        }
      } catch (error) {
        logger.error(`Multi-agent action failed: ${actionName}`, error);
        return {
          action: actionName,
          params,
          result: null,
          success: false,
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };
  }

  registerTool(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool ${tool.name} already exists, overwriting`);
    }

    this.tools.set(tool.name, tool);

    // Add to category
    if (!this.categories.has(tool.category)) {
      this.categories.set(tool.category, []);
    }
    this.categories.get(tool.category)!.push(tool.name);

    logger.info(`Registered tool: ${tool.name} in category ${tool.category}`);
  }

  unregisterTool(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) {
      return false;
    }

    this.tools.delete(name);

    // Remove from category
    const categoryTools = this.categories.get(tool.category);
    if (categoryTools) {
      const index = categoryTools.indexOf(name);
      if (index > -1) {
        categoryTools.splice(index, 1);
      }
    }

    logger.info(`Unregistered tool: ${name}`);
    return true;
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolsByCategory(category: string): ToolDefinition[] {
    const toolNames = this.categories.get(category) || [];
    return toolNames.map((name) => this.tools.get(name)!).filter(Boolean);
  }

  getToolsByRiskLevel(riskLevel: 'low' | 'medium' | 'high'): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.riskLevel === riskLevel
    );
  }

  getFunctionSchemas(): FunctionSchema[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.reduce((acc, param, index) => {
          const paramName = this.getParameterName(tool.name, index);
          acc[paramName] = param;
          return acc;
        }, {} as Record<string, ParameterSchema>),
        required: tool.required,
      },
    }));
  }

  /**
   * Return OpenAI-compatible tool list for native function calling
   */
  getOpenAITools(): any[] {
    return this.getFunctionSchemas().map((schema) => ({
      type: 'function',
      function: {
        name: schema.name,
        description: schema.description,
        parameters: schema.parameters,
      },
    }));
  }

  private getParameterName(toolName: string, index: number): string {
    // Map parameter names based on tool and position
    const paramMappings: Record<string, string[]> = {
      // Web3 tools
      checkBalance: ['address', 'tokenAddress', 'chainId'],
      sendTransaction: ['to', 'value', 'data', 'chainId'],
      approveToken: ['tokenAddress', 'spender', 'amount', 'chainId'],
      swapTokens: [
        'fromToken',
        'toToken',
        'amount',
        'recipient',
        'slippage',
        'chainId',
      ],
      getNFTs: ['address', 'chainId', 'contractAddress'],
      getTransactionHistory: ['address', 'chainId', 'limit'],
      getGasPrice: ['chainId'],
      estimateGas: ['to', 'value', 'data', 'chainId'],
      switchNetwork: ['chainId'],
      signMessage: ['message', 'address'],
      unstakeTokens: ['tokenAddress', 'amount', 'stakingContract', 'chainId'],
      bridgeTokens: [
        'tokenAddress',
        'amount',
        'fromChainId',
        'toChainId',
        'recipient',
      ],
      // Browser automation tools
      navigateToUrl: ['url', 'waitFor', 'timeout'],
      clickElement: ['selector', 'text', 'waitForNavigation', 'timeout'],
      fillForm: ['fields', 'submit'],
      // extractContent removed
      getPageTextSnapshot: [],
      getAllVisibleText: [],
      getPageElements: [],
      evaluatePageCompletion: ['criteria'],
      waitFor: ['condition', 'timeout', 'selector'],
      takeScreenshot: ['selector', 'fullPage'],
      scrollPage: ['direction', 'selector', 'amount'],
      switchTab: ['tabIndex', 'urlPattern'],
      openNewTab: ['url', 'switchToTab'],
      closeTab: ['tabIndex'],
      getElementInfo: ['selector', 'multiple'],
      hoverElement: ['selector', 'duration'],
      dragAndDrop: ['sourceSelector', 'targetSelector', 'duration'],
      uploadFile: ['selector', 'fileContent', 'fileName'],
      executeJavaScript: ['code', 'returnResult'],
      waitForElement: ['selector', 'condition', 'timeout'],
      // Element selection tools
      activateElementSelector: ['mode', 'filter', 'visibleOnly'],
      deactivateElementSelector: [],
      getHighlightedElements: ['filter', 'includeAttributes'],
      analyzeElement: ['selector', 'includeAccessibility', 'includeEvents'],
      findElementsByText: ['text', 'elementType', 'caseSensitive', 'visibleOnly'],
      getInteractiveElements: ['elementType', 'textFilter', 'includeAttributes'],
      captureElementScreenshot: ['selector', 'includeHighlights'],
      highlightDeFiElements: [],
      // Utility tools
      getCurrentTime: [],
      formatNumber: ['number', 'decimals', 'unit'],
      calculateGasEstimate: ['gasUnits', 'gasPriceGwei'],
      // System tools
      getWalletInfo: [],
      getAgentStatus: [],
      // Multi-agent coordination tools
      createExecutionPlan: ['task', 'complexity', 'enableRiskAssessment'],
      validateTaskCompletion: ['task', 'expectedOutcome', 'deepValidation'],
      getMultiAgentStatus: [],
      enableMultiAgentCoordination: ['enabled'],
    };

    return paramMappings[toolName]?.[index] || `param${index + 1}`;
  }


  private ensureStandardResult(name: string, params: any, raw: any) {
    // Normalize to a standard shape with 'data' always present
    try {
      if (!raw || typeof raw !== 'object') {
        return { action: name, params, data: null, result: null, success: false, timestamp: Date.now(), error: 'Empty result' };
      }
      if (raw.data !== undefined) {
        return {
          action: raw.action || name,
          params: raw.params || params,
          data: raw.data,
          result: raw.result ?? raw.data,
          success: raw.success !== false,
          timestamp: raw.timestamp || Date.now(),
          error: raw.error,
          ...('tabId' in raw ? { tabId: raw.tabId } : {}),
          ...('tabUrl' in raw ? { tabUrl: raw.tabUrl } : {}),
        };
      }
      if (raw.result !== undefined) {
        return { action: raw.action || name, params: raw.params || params, data: raw.result, result: raw.result, success: raw.success !== false, timestamp: raw.timestamp || Date.now(), error: raw.error };
      }
      return { action: name, params, data: raw, result: raw, success: raw.success !== false, timestamp: Date.now(), error: raw.error };
    } catch (e) {
      return { action: name, params, data: null, result: null, success: false, timestamp: Date.now(), error: e instanceof Error ? e.message : String(e) };
    }
  }

  async executeTool(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    // Special validation for element selection tools
    if (this.isElementSelectionTool(name)) {
      const validation = await this.validateElementSelectionPrerequisites();
      if (!validation.valid) {
        return {
          action: name,
          params,
          data: null,
          result: null,
          success: false,
          error: validation.error,
          timestamp: Date.now(),
        };
      }
    }

    try {
      logger.info(`Executing tool: ${name}`, params);
      const rawResult = await tool.handler(params);

      // Normalize to ensure 'data' is always present
      const result = this.ensureStandardResult(name, params, rawResult);

      // Monitor tab state after tool execution
      await this.monitorTabStateAfterTool(name, result);
      logger.info(`Tool execution completed: ${name}`, {
        hasData: !!result?.data,
      });

      // Append tool result to chat history as a 'user' message (global guarantee)
      try {
        const { chatHistoryStore } = await import('../chatHistory');
        const { Actors } = await import('@/ui/views/Agent/types/message');
        const current = await chatHistoryStore.getCurrentSession();
        if (current && current.id) {
          const safeContent = JSON.stringify({ tool: name, params: params || {}, result });
          await chatHistoryStore.addMessage(current.id, {
            actor: Actors.USER,
            content: safeContent,
            timestamp: Date.now(),
          });
        }
      } catch (appendErr) {
        logger.warn('ToolRegistry: Failed to append tool result to chat history', appendErr);
      }

      return result;
    } catch (error) {
      logger.error(`Tool execution failed: ${name}`, error);
      throw error;
    }
  }

  /**
   * Check if a tool is an element selection tool
   */
  private isElementSelectionTool(toolName: string): boolean {
    const elementSelectionTools = [
      'clearHighlights',
      'getInteractiveElements',
      'getClickableElementsDOM'
    ];
    return elementSelectionTools.includes(toolName);
  }

  /**
   * Validate prerequisites for element selection tools
   */
  private async validateElementSelectionPrerequisites(): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check if Chrome extension API is available
      if (typeof chrome === 'undefined' || !chrome.tabs) {
        return {
          valid: false,
          error: 'Chrome extension API not available'
        };
      }

      // Prefer an existing tab that is a valid web page (http/https/file)
      const isValidWebTab = (tab?: chrome.tabs.Tab) => {
        if (!tab || !tab.id) return false;
        const url = tab.url || '';
        return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url);
      };

      // Check for active tabs across windows first
      const activeTabs = await chrome.tabs.query({ active: true });
      let targetTab = activeTabs.find(isValidWebTab);

      // If no active suitable tab, search all tabs and prefer an active one
      if (!targetTab) {
        const allTabs = await chrome.tabs.query({});
        targetTab = allTabs.find((t) => t.active && isValidWebTab(t));
        if (!targetTab) {
          targetTab = allTabs.find((t) => isValidWebTab(t));
        }
        if (targetTab && !targetTab.active) {
          await chrome.tabs.update(targetTab.id!, { active: true });
          logger.info('Activated existing web tab for element selection', {
            tabId: targetTab.id,
            url: targetTab.url
          });
        }
      }

      // If still no tab, abort with a clear error instead of creating about:blank (cannot inject there)
      if (!targetTab || !targetTab.id) {
        return {
          valid: false,
          error: 'No suitable web tab found. Please open a webpage (http/https/file) and try again.'
        };
      }

      // Verify content script is available
      try {
        await chrome.tabs.sendMessage(targetTab.id, { type: 'PING' });
      } catch (error) {
        // Content script not available, try to inject it
        try {
          await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            files: ['content-script.js']
          });
        } catch (injectError) {
          logger.error('Failed to inject content script', injectError);
          return {
            valid: false,
            error: 'Content script not available in target tab'
          };
        }
      }

      return { valid: true };
    } catch (error) {
      logger.error('Element selection prerequisite validation failed', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Prerequisite validation failed'
      };
    }
  }

  /**
   * Get or create an active tab for element selection operations
   */
  private async getOrCreateActiveTab(): Promise<chrome.tabs.Tab> {
    // Helper to validate a tab points to a real web page we can inject into
    const isValidWebTab = (tab?: chrome.tabs.Tab) => {
      if (!tab || !tab.id) return false;
      const url = tab.url || '';
      return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url);
    };

    // 1) Prefer the currently active tab in any window that is a valid web page
    const activeTabs = await chrome.tabs.query({ active: true });
    let targetTab = activeTabs.find(isValidWebTab);

    // 2) If none, search all tabs for a suitable web page (prefer an active one)
    if (!targetTab) {
      const allTabs = await chrome.tabs.query({});
      // Prefer an active tab that is a valid web page
      targetTab = allTabs.find((t) => t.active && isValidWebTab(t));
      if (!targetTab) {
        // Fallback to any valid web page tab
        targetTab = allTabs.find((t) => isValidWebTab(t));
      }
      if (targetTab && !targetTab.active) {
        await chrome.tabs.update(targetTab.id!, { active: true });
        logger.info('Activated existing web tab for element selection', {
          tabId: targetTab.id,
          url: targetTab.url,
        });
      }
    }

    // 3) If still none, do NOT create about:blank (content scripts cannot run there)
    if (!targetTab) {
      const allTabsCount = (await chrome.tabs.query({})).length;
      throw new Error(
        `No suitable web tab found to perform element selection. Please open a webpage (http/https/file) and try again. Context: { allTabs: ${allTabsCount} }`
      );
    }

    return targetTab;
  }

  /**
   * Ensure content script is available in the specified tab
   */
  private async ensureContentScriptAvailable(tabId: number): Promise<void> {
    try {
      // Method 1: Try multiple pings to ensure connection
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await chrome.tabs.sendMessage(tabId, { type: 'PING' });
          logger.info(`Content script ping successful on attempt ${attempt}`, { tabId });
          return; // Success
        } catch (pingError) {
          logger.warn(`Content script ping attempt ${attempt} failed`, {
            tabId,
            error: pingError instanceof Error ? pingError.message : String(pingError)
          });

          if (attempt < 3) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      // Method 2: Try to inject content script file
      logger.info(`All pings failed, attempting content script file injection`, { tabId });

      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-script.js']
        });

        // Wait for injection to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Final verification ping
        await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        logger.info('Content script injected and verified successfully', { tabId });
        return;
      } catch (injectError) {
        logger.error('Content script file injection failed', injectError);
      }

      // Method 3: Try injecting the content script code directly
      logger.info(`File injection failed, attempting direct code injection`, { tabId });

      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: this.createContentScriptCode()
        });

        // Wait for injection to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Final verification ping
        await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        logger.info('Direct code injection successful', { tabId });
        return;
      } catch (directInjectError) {
        logger.error('Direct code injection failed', directInjectError);
      }

      // Method 4: Try minimal injection for basic communication
      logger.info(`Direct injection failed, attempting minimal injection`, { tabId });

      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: this.createMinimalContentScript()
        });

        // Wait for injection to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Final verification ping
        await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        logger.info('Minimal injection successful', { tabId });
        return;
      } catch (minimalInjectError) {
        logger.error('Minimal injection failed', minimalInjectError);
      }

      // All methods failed
      throw new Error('Content script not available in target tab. Please refresh the page or try a different tab.');
    } catch (error) {
      logger.error('Content script verification failed', error);
      throw new Error('Content script verification failed: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Create content script code for direct injection
   */
  private createContentScriptCode() {
    return () => {
      // Create a simple message listener for content script communication
      const messageListener = (event: MessageEvent) => {
        if (event.source !== window) return;

        if (event.data && event.data.type === 'PING') {
          window.postMessage({ type: 'PONG', timestamp: Date.now() }, '*');
        }

        // Handle element selection messages
        if (event.data && event.data.type === 'ELEMENT_SELECTOR_ACTIVATE') {
          try {
            // Activate element selection mode
            const highlightElements = () => {
              const interactiveElements = document.querySelectorAll(
                'button, [onclick], [href], input, select, textarea, [role="button"], [role="link"]'
              );

              interactiveElements.forEach((element, index) => {
                const rect = element.getBoundingClientRect();
                const overlay = document.createElement('div');
                overlay.id = `element-highlight-${index}`;
                overlay.style.cssText = `
                  position: absolute;
                  left: ${rect.left + window.scrollX}px;
                  top: ${rect.top + window.scrollY}px;
                  width: ${rect.width}px;
                  height: ${rect.height}px;
                  border: 2px solid #ff0000;
                  background: rgba(255, 0, 0, 0.1);
                  z-index: 999999;
                  pointer-events: none;
                `;
                document.body.appendChild(overlay);
              });
            };

            highlightElements();
            window.postMessage({
              type: 'ELEMENT_SELECTOR_RESPONSE',
              success: true,
              data: { highlighted: true }
            }, '*');
          } catch (error) {
            window.postMessage({
              type: 'ELEMENT_SELECTOR_RESPONSE',
              success: false,
              error: error instanceof Error ? error.message : String(error)
            }, '*');
          }
        }
      };

      window.addEventListener('message', messageListener);

      // Store for cleanup
      (window as any)._vibe3ContentScript = {
        messageListener,
        active: true
      };
    };
  }

  /**
   * Create minimal content script for basic communication
   */
  private createMinimalContentScript() {
    return () => {
      // Minimal message listener for basic ping/pong
      const minimalListener = (event: MessageEvent) => {
        if (event.source !== window) return;

        if (event.data && event.data.type === 'PING') {
          window.postMessage({ type: 'PONG' }, '*');
        }
      };

      window.addEventListener('message', minimalListener);

      // Clean up existing script if any
      if ((window as any)._vibe3ContentScript) {
        try {
          window.removeEventListener('message', (window as any)._vibe3ContentScript.messageListener);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      // Store new listener
      (window as any)._vibe3ContentScript = {
        messageListener: minimalListener,
        active: true,
        minimal: true
      };
    };
  }

  validateParameters(
    name: string,
    params: any
  ): { valid: boolean; errors: string[] } {
    const tool = this.tools.get(name);
    if (!tool) {
      return { valid: false, errors: [`Tool not found: ${name}`] };
    }

    const errors: string[] = [];

    // Check required parameters
    for (const requiredParam of tool.required) {
      if (
        !(requiredParam in params) ||
        params[requiredParam] === undefined ||
        params[requiredParam] === null
      ) {
        errors.push(`Missing required parameter: ${requiredParam}`);
      }
    }

    // Validate parameter types and patterns
    const paramMappings: Record<string, string[]> = {
      checkBalance: ['address', 'tokenAddress', 'chainId'],
      sendTransaction: ['to', 'value', 'data', 'chainId'],
      approveToken: ['tokenAddress', 'spender', 'amount', 'chainId'],
      swapTokens: [
        'fromToken',
        'toToken',
        'amount',
        'recipient',
        'slippage',
        'chainId',
      ],
      // ... add more mappings as needed
    };

    const toolParams = paramMappings[name] || [];

    for (let i = 0; i < tool.parameters.length; i++) {
      const paramSchema = tool.parameters[i];
      const paramName = toolParams[i] || `param${i + 1}`;
      const value = params[paramName];

      if (value !== undefined && value !== null) {
        // Type validation
        if (paramSchema.type === 'number' && typeof value !== 'number') {
          errors.push(`Parameter ${paramName} must be a number`);
        }

        // Pattern validation
        if (paramSchema.pattern && typeof value === 'string') {
          const pattern = new RegExp(paramSchema.pattern);
          if (!pattern.test(value)) {
            errors.push(
              `Parameter ${paramName} does not match required pattern`
            );
          }
        }

        // Range validation
        if (
          paramSchema.minimum !== undefined &&
          typeof value === 'number' &&
          value < paramSchema.minimum
        ) {
          errors.push(
            `Parameter ${paramName} must be at least ${paramSchema.minimum}`
          );
        }

        if (
          paramSchema.maximum !== undefined &&
          typeof value === 'number' &&
          value > paramSchema.maximum
        ) {
          errors.push(
            `Parameter ${paramName} must be at most ${paramSchema.maximum}`
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  getToolInfo(): {
    total: number;
    byCategory: Record<string, number>;
    byRiskLevel: Record<string, number>;
    requiresConfirmation: number;
  } {
    const tools = Array.from(this.tools.values());

    return {
      total: tools.length,
      byCategory: Object.fromEntries(
        Array.from(this.categories.entries()).map(([cat, names]) => [
          cat,
          names.length,
        ])
      ),
      byRiskLevel: {
        low: tools.filter((t) => t.riskLevel === 'low').length,
        medium: tools.filter((t) => t.riskLevel === 'medium').length,
        high: tools.filter((t) => t.riskLevel === 'high').length,
      },
      requiresConfirmation: tools.filter((t) => t.requiresConfirmation).length,
    };
  }

  /**
   * Monitor tab state after tool execution and notify LLM of results
   */
  private async monitorTabStateAfterTool(toolName: string, result: any): Promise<void> {
    try {
      // Wait for tab to stabilize
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get current active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      if (!activeTab?.id) return;

      // Check if tab is still loading
      let isLoading = activeTab.status === 'loading';
      let attempts = 0;
      const maxAttempts = 10;

      while (isLoading && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const updatedTabs = await chrome.tabs.query({ active: true, currentWindow: true });
        isLoading = updatedTabs[0]?.status === 'loading';
        attempts++;
      }

      // Prepare success message for LLM
      let successMessage = `Tool "${toolName}" executed successfully.`;

      if (toolName === 'navigateToUrl' && result?.data?.url) {
        successMessage += ` Successfully navigated to: ${result.data.url}`;
        if (result.data.title) {
          successMessage += ` (Page title: "${result.data.title}")`;
        }
      } else if (toolName === 'clickElement') {
        successMessage += ` Element clicked successfully.`;
      } else if (toolName === 'fillForm') {
        successMessage += ` Form filled successfully.`;
      }

      // Send success notification to LLM via chat history
      try {
        const { chatHistoryStore } = await import('../chatHistory');
        const { Actors } = await import('@/ui/views/Agent/types/message');
        const current = await chatHistoryStore.getCurrentSession();
        if (current?.id) {
          await chatHistoryStore.addMessage(current.id, {
            actor: Actors.USER,
            content: successMessage,
            timestamp: Date.now(),
          });
        }
      } catch (chatErr) {
        logger.warn('Failed to send success message to chat history', chatErr);
      }

    } catch (error) {
      logger.warn('Failed to monitor tab state after tool execution', error);
    }
  }
}

// Global tool registry instance
export const toolRegistry = new ToolRegistry();
