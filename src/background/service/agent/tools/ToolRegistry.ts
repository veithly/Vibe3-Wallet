// Function calling tool registry for dynamic Web3 tool management
import { FunctionSchema, ParameterSchema } from '../llm/types';
import { web3ActionSchemas } from '../actions/web3-schemas';
import { createLogger } from '@/utils/logger';

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
    this.initializeWeb3Tools();
    this.initializeUtilityTools();
    this.initializeSystemTools();
  }

  private initializeWeb3Tools(): void {
    // Core Web3 tools
    this.registerTool({
      name: 'checkBalance',
      description: 'Check token balance for a specific address on any blockchain',
      parameters: [
        {
          type: 'string',
          description: 'The wallet address to check balance for',
          pattern: '^0x[a-fA-F0-9]{40}$'
        },
        {
          type: 'string',
          description: 'Optional: Specific token contract address to check (leave empty for native token)',
          pattern: '^0x[a-fA-F0-9]{40}$'
        },
        {
          type: 'number',
          description: 'Optional: Chain ID (1 for Ethereum, 56 for BSC, 137 for Polygon, etc.)',
          minimum: 1
        }
      ],
      required: [],
      handler: this.createWeb3Handler('checkBalance'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false
    });

    this.registerTool({
      name: 'sendTransaction',
      description: 'Send a transaction with ETH or tokens to another address',
      parameters: [
        {
          type: 'string',
          description: 'Recipient wallet address',
          pattern: '^0x[a-fA-F0-9]{40}$'
        },
        {
          type: 'string',
          description: 'Amount to send in wei (e.g., "1000000000000000000" for 1 ETH)'
        },
        {
          type: 'string',
          description: 'Optional: Transaction data (hex string)',
          pattern: '^0x[0-9a-fA-F]*$'
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1
        }
      ],
      required: ['to', 'value'],
      handler: this.createWeb3Handler('sendTransaction'),
      category: 'web3',
      riskLevel: 'high',
      requiresConfirmation: true
    });

    this.registerTool({
      name: 'approveToken',
      description: 'Approve a smart contract to spend your tokens',
      parameters: [
        {
          type: 'string',
          description: 'Token contract address',
          pattern: '^0x[a-fA-F0-9]{40}$'
        },
        {
          type: 'string',
          description: 'Spender contract address',
          pattern: '^0x[a-fA-F0-9]{40}$'
        },
        {
          type: 'string',
          description: 'Amount to approve in token units (with decimals)'
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1
        }
      ],
      required: ['tokenAddress', 'spender', 'amount'],
      handler: this.createWeb3Handler('approveToken'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true
    });

    this.registerTool({
      name: 'swapTokens',
      description: 'Swap tokens using decentralized exchanges (DEX aggregators)',
      parameters: [
        {
          type: 'string',
          description: 'From token address or symbol (e.g., "ETH", "USDC", "0x...")'
        },
        {
          type: 'string',
          description: 'To token address or symbol'
        },
        {
          type: 'string',
          description: 'Amount to swap (with decimals)'
        },
        {
          type: 'string',
          description: 'Optional: Recipient address (defaults to current wallet)'
        },
        {
          type: 'number',
          description: 'Optional: Slippage tolerance percentage (default 0.5)',
          minimum: 0.1,
          maximum: 5
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1
        }
      ],
      required: ['fromToken', 'toToken', 'amount'],
      handler: this.createWeb3Handler('swapTokens'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true
    });

    this.registerTool({
      name: 'getNFTs',
      description: 'Get NFTs owned by a specific address',
      parameters: [
        {
          type: 'string',
          description: 'Wallet address to check NFTs for',
          pattern: '^0x[a-fA-F0-9]{40}$'
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1
        },
        {
          type: 'string',
          description: 'Optional: Specific NFT contract address',
          pattern: '^0x[a-fA-F0-9]{40}$'
        }
      ],
      required: ['address'],
      handler: this.createWeb3Handler('getNFTs'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false
    });

    this.registerTool({
      name: 'getTransactionHistory',
      description: 'Get transaction history for a wallet address',
      parameters: [
        {
          type: 'string',
          description: 'Wallet address',
          pattern: '^0x[a-fA-F0-9]{40}$'
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1
        },
        {
          type: 'number',
          description: 'Optional: Number of transactions to return (default 50)',
          minimum: 1,
          maximum: 200
        }
      ],
      required: ['address'],
      handler: this.createWeb3Handler('getTransactionHistory'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false
    });

    this.registerTool({
      name: 'getGasPrice',
      description: 'Get current gas price for a specific blockchain network',
      parameters: [
        {
          type: 'number',
          description: 'Chain ID (1 for Ethereum, 56 for BSC, 137 for Polygon, etc.)',
          minimum: 1
        }
      ],
      required: [],
      handler: this.createWeb3Handler('getGasPrice'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false
    });

    this.registerTool({
      name: 'estimateGas',
      description: 'Estimate gas cost for a transaction',
      parameters: [
        {
          type: 'string',
          description: 'Recipient address',
          pattern: '^0x[a-fA-F0-9]{40}$'
        },
        {
          type: 'string',
          description: 'Optional: Transaction value in wei',
          // default: '0x0' // default property not supported in ParameterSchema
        },
        {
          type: 'string',
          description: 'Optional: Transaction data (hex string)',
          pattern: '^0x[0-9a-fA-F]*$'
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1
        }
      ],
      required: ['to'],
      handler: this.createWeb3Handler('estimateGas'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false
    });

    this.registerTool({
      name: 'switchNetwork',
      description: 'Switch to a different blockchain network',
      parameters: [
        {
          type: 'number',
          description: 'Chain ID to switch to',
          minimum: 1
        }
      ],
      required: ['chainId'],
      handler: this.createWeb3Handler('switchNetwork'),
      category: 'web3',
      riskLevel: 'low',
      requiresConfirmation: false
    });

    this.registerTool({
      name: 'signMessage',
      description: 'Sign a message with the current wallet',
      parameters: [
        {
          type: 'string',
          description: 'Message to sign'
        },
        {
          type: 'string',
          description: 'Optional: Specific address to sign with (defaults to current account)',
          pattern: '^0x[a-fA-F0-9]{40}$'
        }
      ],
      required: ['message'],
      handler: this.createWeb3Handler('signMessage'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true
    });

    // Advanced DeFi tools
    this.registerTool({
      name: 'addLiquidity',
      description: 'Add liquidity to a decentralized exchange pool',
      parameters: [
        {
          type: 'string',
          description: 'First token address or symbol'
        },
        {
          type: 'string',
          description: 'Second token address or symbol'
        },
        {
          type: 'string',
          description: 'Amount of first token'
        },
        {
          type: 'string',
          description: 'Amount of second token'
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1
        }
      ],
      required: ['tokenA', 'tokenB', 'amountA', 'amountB'],
      handler: this.createWeb3Handler('addLiquidity'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true
    });

    this.registerTool({
      name: 'removeLiquidity',
      description: 'Remove liquidity from a decentralized exchange pool',
      parameters: [
        {
          type: 'string',
          description: 'First token address or symbol'
        },
        {
          type: 'string',
          description: 'Second token address or symbol'
        },
        {
          type: 'string',
          description: 'Amount of LP tokens to remove'
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1
        }
      ],
      required: ['tokenA', 'tokenB', 'liquidityTokenAmount'],
      handler: this.createWeb3Handler('removeLiquidity'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true
    });

    this.registerTool({
      name: 'stakeTokens',
      description: 'Stake tokens in a staking contract',
      parameters: [
        {
          type: 'string',
          description: 'Token address to stake'
        },
        {
          type: 'string',
          description: 'Amount to stake'
        },
        {
          type: 'string',
          description: 'Staking contract address',
          pattern: '^0x[a-fA-F0-9]{40}$'
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1
        }
      ],
      required: ['tokenAddress', 'amount', 'stakingContract'],
      handler: this.createWeb3Handler('stakeTokens'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true
    });

    this.registerTool({
      name: 'unstakeTokens',
      description: 'Unstake tokens from a staking contract',
      parameters: [
        {
          type: 'string',
          description: 'Token address to unstake'
        },
        {
          type: 'string',
          description: 'Amount to unstake'
        },
        {
          type: 'string',
          description: 'Staking contract address',
          pattern: '^0x[a-fA-F0-9]{40}$'
        },
        {
          type: 'number',
          description: 'Optional: Chain ID',
          minimum: 1
        }
      ],
      required: ['tokenAddress', 'amount', 'stakingContract'],
      handler: this.createWeb3Handler('unstakeTokens'),
      category: 'web3',
      riskLevel: 'medium',
      requiresConfirmation: true
    });

    this.registerTool({
      name: 'bridgeTokens',
      description: 'Bridge tokens across different blockchain networks',
      parameters: [
        {
          type: 'string',
          description: 'Token address to bridge'
        },
        {
          type: 'string',
          description: 'Amount to bridge'
        },
        {
          type: 'number',
          description: 'Source chain ID'
        },
        {
          type: 'number',
          description: 'Destination chain ID'
        },
        {
          type: 'string',
          description: 'Optional: Recipient address on destination chain'
        }
      ],
      required: ['tokenAddress', 'amount', 'fromChainId', 'toChainId'],
      handler: this.createWeb3Handler('bridgeTokens'),
      category: 'web3',
      riskLevel: 'high',
      requiresConfirmation: true
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
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
      },
      category: 'utility',
      riskLevel: 'low',
      requiresConfirmation: false
    });

    this.registerTool({
      name: 'formatNumber',
      description: 'Format numbers with proper decimal places and units',
      parameters: [
        {
          type: 'string',
          description: 'Number to format'
        },
        {
          type: 'number',
          description: 'Number of decimal places',
          minimum: 0,
          maximum: 18
        },
        {
          type: 'string',
          description: 'Optional: Unit symbol (e.g., "ETH", "USDC")'
        }
      ],
      required: ['number', 'decimals'],
      handler: async (params) => {
        const num = parseFloat(params.number);
        if (isNaN(num)) {
          throw new Error('Invalid number format');
        }
        
        const formatted = num.toFixed(params.decimals);
        const withUnit = params.unit ? `${formatted} ${params.unit}` : formatted;
        
        return {
          original: params.number,
          formatted: formatted,
          withUnit: withUnit,
          numeric: num
        };
      },
      category: 'utility',
      riskLevel: 'low',
      requiresConfirmation: false
    });

    this.registerTool({
      name: 'calculateGasEstimate',
      description: 'Calculate estimated gas cost in ETH for a transaction',
      parameters: [
        {
          type: 'number',
          description: 'Estimated gas units',
          minimum: 21000
        },
        {
          type: 'string',
          description: 'Gas price in Gwei',
          pattern: '^[0-9]+(\\.[0-9]+)?$'
        }
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
          formatted: `${totalCostEth.toFixed(6)} ETH`
        };
      },
      category: 'utility',
      riskLevel: 'low',
      requiresConfirmation: false
    });
  }

  private initializeSystemTools(): void {
    // System tools for wallet and agent management
    this.registerTool({
      name: 'getWalletInfo',
      description: 'Get current wallet information including address and network',
      parameters: [],
      required: [],
      handler: async () => {
        // This would integrate with the actual wallet service
        return {
          address: '0x0000000000000000000000000000000000000000', // Mock
          network: 'Ethereum Mainnet',
          chainId: 1,
          balance: '0 ETH', // Mock
          connected: true
        };
      },
      category: 'system',
      riskLevel: 'low',
      requiresConfirmation: false
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
            'Cross-chain bridging'
          ],
          version: '1.0.0',
          timestamp: Date.now()
        };
      },
      category: 'system',
      riskLevel: 'low',
      requiresConfirmation: false
    });
  }

  private createWeb3Handler(actionName: string) {
    return async (params: any) => {
      // This would integrate with the actual Web3Action class
      logger.info(`Executing Web3 action: ${actionName}`, params);
      
      // Mock implementation for now
      return {
        action: actionName,
        params,
        result: `Mock result for ${actionName}`,
        success: true,
        timestamp: Date.now()
      };
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
    return toolNames.map(name => this.tools.get(name)!).filter(Boolean);
  }

  getToolsByRiskLevel(riskLevel: 'low' | 'medium' | 'high'): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(tool => tool.riskLevel === riskLevel);
  }

  getFunctionSchemas(): FunctionSchema[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.reduce((acc, param, index) => {
          const paramName = this.getParameterName(tool.name, index);
          acc[paramName] = param;
          return acc;
        }, {} as Record<string, ParameterSchema>),
        required: tool.required
      }
    }));
  }

  private getParameterName(toolName: string, index: number): string {
    // Map parameter names based on tool and position
    const paramMappings: Record<string, string[]> = {
      checkBalance: ['address', 'tokenAddress', 'chainId'],
      sendTransaction: ['to', 'value', 'data', 'chainId'],
      approveToken: ['tokenAddress', 'spender', 'amount', 'chainId'],
      swapTokens: ['fromToken', 'toToken', 'amount', 'recipient', 'slippage', 'chainId'],
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
      bridgeTokens: ['tokenAddress', 'amount', 'fromChainId', 'toChainId', 'recipient'],
      getCurrentTime: [],
      formatNumber: ['number', 'decimals', 'unit'],
      calculateGasEstimate: ['gasUnits', 'gasPriceGwei'],
      getWalletInfo: [],
      getAgentStatus: []
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

  validateParameters(name: string, params: any): { valid: boolean; errors: string[] } {
    const tool = this.tools.get(name);
    if (!tool) {
      return { valid: false, errors: [`Tool not found: ${name}`] };
    }

    const errors: string[] = [];

    // Check required parameters
    for (const requiredParam of tool.required) {
      if (!(requiredParam in params) || params[requiredParam] === undefined || params[requiredParam] === null) {
        errors.push(`Missing required parameter: ${requiredParam}`);
      }
    }

    // Validate parameter types and patterns
    const paramMappings: Record<string, string[]> = {
      checkBalance: ['address', 'tokenAddress', 'chainId'],
      sendTransaction: ['to', 'value', 'data', 'chainId'],
      approveToken: ['tokenAddress', 'spender', 'amount', 'chainId'],
      swapTokens: ['fromToken', 'toToken', 'amount', 'recipient', 'slippage', 'chainId'],
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
            errors.push(`Parameter ${paramName} does not match required pattern`);
          }
        }

        // Range validation
        if (paramSchema.minimum !== undefined && typeof value === 'number' && value < paramSchema.minimum) {
          errors.push(`Parameter ${paramName} must be at least ${paramSchema.minimum}`);
        }

        if (paramSchema.maximum !== undefined && typeof value === 'number' && value > paramSchema.maximum) {
          errors.push(`Parameter ${paramName} must be at most ${paramSchema.maximum}`);
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
        Array.from(this.categories.entries()).map(([cat, names]) => [cat, names.length])
      ),
      byRiskLevel: {
        low: tools.filter(t => t.riskLevel === 'low').length,
        medium: tools.filter(t => t.riskLevel === 'medium').length,
        high: tools.filter(t => t.riskLevel === 'high').length
      },
      requiresConfirmation: tools.filter(t => t.requiresConfirmation).length
    };
  }
}

// Global tool registry instance
export const toolRegistry = new ToolRegistry();