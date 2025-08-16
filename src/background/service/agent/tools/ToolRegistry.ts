// Function calling tool registry for dynamic Web3 tool management
import { FunctionSchema, ParameterSchema } from '../llm/types';
import { web3ActionSchemas } from '../actions/web3-schemas';
import { createLogger } from '@/utils/logger';
import { Web3Action } from '../actions/web3-actions';
import { BrowserAutomationController } from '../automation/BrowserAutomationController';
import type { AgentContext } from '../types';
import preferenceService from '@/background/service/preference';
import keyringService from '@/background/service/keyring';

const logger = createLogger('ToolRegistry');

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ParameterSchema[];
  required: string[];
  handler: (params: any) => Promise<any>;
  category: 'web3' | 'utility' | 'system';
  riskLevel: 'low' | 'medium' | 'high';
  requiresConfirmation: boolean;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private categories: Map<string, string[]> = new Map();

  constructor() {
    // 🔥🔥🔥 EXTREMELY AGGRESSIVE DEBUGGING - TOOLREGISTRY CONSTRUCTOR! 🔥🔥🔥
    console.log('🔥🔥🔥 TOOLREGISTRY CONSTRUCTOR - THIS MUST BE VISIBLE! 🔥🔥🔥', {
      timestamp: Date.now(),
      constructorStack: new Error().stack,
      toolsMapSize: this.tools.size,
      categoriesMapSize: this.categories.size
    });
    
    this.initializeWeb3Tools();
    this.initializeBrowserTools();
    this.initializeUtilityTools();
    this.initializeSystemTools();
    console.log('🚨🚨🚨 ToolRegistry initialized with debug version! 🚨🚨🚨');
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

    // Advanced DeFi tools
    this.registerTool({
      name: 'addLiquidity',
      description: 'Add liquidity to a decentralized exchange pool',
      parameters: [
        {
          type: 'string',
          description: 'First token address or symbol',
        },
        {
          type: 'string',
          description: 'Second token address or symbol',
        },
        {
          type: 'string',
          description: 'Amount of first token',
        },
        {
          type: 'string',
          description: 'Amount of second token',
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1,
        },
      ],
      required: ['tokenA', 'tokenB', 'amountA', 'amountB'],
      handler: this.createWeb3Handler('addLiquidity'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true,
    });

    this.registerTool({
      name: 'removeLiquidity',
      description: 'Remove liquidity from a decentralized exchange pool',
      parameters: [
        {
          type: 'string',
          description: 'First token address or symbol',
        },
        {
          type: 'string',
          description: 'Second token address or symbol',
        },
        {
          type: 'string',
          description: 'Amount of LP tokens to remove',
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1,
        },
      ],
      required: ['tokenA', 'tokenB', 'liquidityTokenAmount'],
      handler: this.createWeb3Handler('removeLiquidity'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true,
    });

    this.registerTool({
      name: 'stakeTokens',
      description: 'Stake tokens in a staking contract',
      parameters: [
        {
          type: 'string',
          description: 'Token address to stake',
        },
        {
          type: 'string',
          description: 'Amount to stake',
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
      handler: this.createWeb3Handler('stakeTokens'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true,
    });

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

    this.registerTool({
      name: 'extractContent',
      description: 'Extract content from web pages using CSS selectors',
      parameters: [
        {
          type: 'string',
          description: 'CSS selector to extract content from',
        },
        {
          type: 'string',
          description: 'Type of content to extract',
          enum: ['text', 'html', 'value', 'attribute'],
        },
        {
          type: 'boolean',
          description: 'Optional: Extract multiple elements',
        },
        {
          type: 'string',
          description: 'Optional: Attribute name if type is "attribute"',
        },
      ],
      required: ['selector'],
      handler: this.createBrowserHandler('extractContent'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false,
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
      category: 'web3',
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
      
      try {
        logger.info(`[${executionId}] Starting browser automation action: ${actionName}`, {
          params,
          actionName,
          executionId,
          timestamp: startTime,
        });

        // Validate input parameters
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

        // Validate required parameters for specific actions
        if (actionName === 'navigateToUrl') {
          console.log(`🚨🚨🚨 [${executionId}] VALIDATING navigateToUrl PARAMETERS`, {
            params,
            hasUrl: !!params.url,
            urlValue: params.url,
            urlType: typeof params.url,
            isUrlOf: params.url === 'of',
            urlStartsWithHttp: params.url && params.url.startsWith('http'),
            fullParams: JSON.stringify(params),
          });
          
          if (!params.url) {
            throw new Error('url parameter is required for navigateToUrl');
          }
          
          // CRITICAL: Check for "of" corruption
          if (params.url === 'of') {
            console.error(`🚨🚨🚨 [${executionId}] URL CORRUPTION DETECTED: URL parameter is "of"`, {
              params,
              executionId,
              actionName,
              corruptionPoint: 'ToolRegistry parameter validation',
              timestamp: Date.now(),
            });
            throw new Error(`URL parameter corruption detected: url is "of" instead of a valid URL`);
          }
          
          // Validate URL format
          if (!params.url.startsWith('http')) {
            logger.warn(`[${executionId}] Invalid URL format detected`, {
              url: params.url,
              urlType: typeof params.url,
              executionId,
            });
            throw new Error(`Invalid URL format: ${params.url}. URL must start with http:// or https://`);
          }
        }

        // Create action step for compatibility
        const actionStep = {
          id: executionId,
          name: `Execute ${actionName}`,
          type: actionName,
          description: `Browser automation: ${actionName}`,
          params: processedParams,
          status: 'pending' as const,
          dependencies: [],
          riskLevel: 'MEDIUM' as const,
        };

        // Enhanced debugging for navigateToUrl
        if (actionName === 'navigateToUrl') {
          logger.info(`[${executionId}] EXECUTING navigateToUrl - FINAL PARAMETER CHECK`, {
            actionName,
            processedParams,
            urlValue: processedParams.url,
            urlType: typeof processedParams.url,
            isUrlOf: processedParams.url === 'of',
            hasValidUrl: processedParams.url && processedParams.url !== 'of' && processedParams.url.startsWith('http'),
            fullProcessedParams: JSON.stringify(processedParams),
            actionStepId: actionStep.id,
          });
        }

        // Execute browser action
        const result = await browserController.executeAction(actionStep);

        const executionTime = Date.now() - startTime;
        
        // Enhanced result debugging for navigateToUrl
        if (actionName === 'navigateToUrl') {
          logger.info(`[${executionId}] navigateToUrl COMPLETED - RESULT ANALYSIS`, {
            actionName,
            success: result.success,
            hasData: !!result.data,
            hasError: !!result.error,
            executionTime,
            resultData: result.data ? JSON.stringify(result.data) : null,
            urlInResult: result.data?.url,
            urlInResultType: typeof result.data?.url,
            isUrlInResultOf: result.data?.url === 'of',
            methodUsed: result.data?.method,
            fullResult: JSON.stringify(result),
          });
        }
        
        logger.info(`[${executionId}] Browser action completed`, {
          actionName,
          success: result.success,
          hasData: !!result.data,
          hasError: !!result.error,
          executionTime,
          resultData: result.data ? JSON.stringify(result.data).substring(0, 200) : undefined,
        });

        return {
          action: actionName,
          params: processedParams,
          result: result.data,
          success: result.success,
          timestamp: Date.now(),
          error: result.error,
          screenshot: result.screenshot,
          timing: result.timing || executionTime,
          executionId,
        };
      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error(`[${executionId}] Browser automation action failed: ${actionName}`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          params,
          executionTime,
          executionId,
        });
        return {
          action: actionName,
          params,
          result: null,
          success: false,
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : 'Unknown error',
          executionId,
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
          result: result.data,
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
      addLiquidity: ['tokenA', 'tokenB', 'amountA', 'amountB', 'chainId'],
      removeLiquidity: ['tokenA', 'tokenB', 'liquidityTokenAmount', 'chainId'],
      stakeTokens: ['tokenAddress', 'amount', 'stakingContract', 'chainId'],
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
      extractContent: ['selector', 'type', 'multiple', 'attribute'],
      waitFor: ['condition', 'timeout', 'selector'],
      takeScreenshot: ['selector', 'fullPage'],
      // Utility tools
      getCurrentTime: [],
      formatNumber: ['number', 'decimals', 'unit'],
      calculateGasEstimate: ['gasUnits', 'gasPriceGwei'],
      // System tools
      getWalletInfo: [],
      getAgentStatus: [],
    };

    return paramMappings[toolName]?.[index] || `param${index + 1}`;
  }

  async executeTool(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    try {
      logger.info(`Executing tool: ${name}`, params);
      const result = await tool.handler(params);
      logger.info(`Tool execution completed: ${name}`);
      return result;
    } catch (error) {
      logger.error(`Tool execution failed: ${name}`, error);
      throw error;
    }
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
}

// Global tool registry instance
export const toolRegistry = new ToolRegistry();
