/**
 * Agent 资产查询工具使用示例
 * 
 * 这个文件展示了如何在 Agent 中使用新的资产查询功能
 */

import { ActionRegistry } from '../actions/ActionRegistry';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AssetQueryExample');

/**
 * 示例：查询用户的所有资产
 */
export async function exampleGetAllAssets(actionRegistry: ActionRegistry) {
  logger.info('Example: Getting all assets for current user');
  
  try {
    const result = await actionRegistry.executeAction('getAllAssets', {
      chainId: '1', // Ethereum mainnet
      includeZeroBalances: false,
    });
    
    if (result.success) {
      const { totalValue, totalAssets, assets } = result.data;
      
      logger.info(`Portfolio Summary:`, {
        totalValue: `$${totalValue.toFixed(2)}`,
        totalAssets,
        topAssets: assets.slice(0, 5).map((asset: any) => ({
          symbol: asset.symbol,
          value: `$${asset.value?.toFixed(2) || '0'}`,
          balance: asset.balance,
        })),
      });
      
      return {
        success: true,
        message: `Found ${totalAssets} assets with total value of $${totalValue.toFixed(2)}`,
        data: result.data,
      };
    } else {
      logger.error('Failed to get assets:', result.error);
      return {
        success: false,
        message: `Failed to get assets: ${result.error}`,
      };
    }
  } catch (error) {
    logger.error('Error in getAllAssets example:', error);
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * 示例：查询特定代币的余额
 */
export async function exampleGetSpecificTokens(actionRegistry: ActionRegistry) {
  logger.info('Example: Getting specific token balances');
  
  const popularTokens = [
    '0xA0b86a33E6441b8C4505B8C4505B8C4505B8C4505', // USDC
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  ];
  
  try {
    const result = await actionRegistry.executeAction('getTokenBalances', {
      chainId: '1',
      tokenAddresses: popularTokens,
    });
    
    if (result.success) {
      const { tokenBalances } = result.data;
      
      const nonZeroBalances = tokenBalances.filter((token: any) => 
        token.balance && token.balance !== '0'
      );
      
      logger.info(`Token Balances:`, {
        totalTokensChecked: tokenBalances.length,
        tokensWithBalance: nonZeroBalances.length,
        balances: nonZeroBalances.map((token: any) => ({
          address: token.tokenAddress,
          balance: token.balance,
        })),
      });
      
      return {
        success: true,
        message: `Found balances for ${nonZeroBalances.length} out of ${tokenBalances.length} tokens`,
        data: result.data,
      };
    } else {
      logger.error('Failed to get token balances:', result.error);
      return {
        success: false,
        message: `Failed to get token balances: ${result.error}`,
      };
    }
  } catch (error) {
    logger.error('Error in getTokenBalances example:', error);
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * 示例：查询原生代币余额
 */
export async function exampleGetNativeBalance(actionRegistry: ActionRegistry) {
  logger.info('Example: Getting native token balance');
  
  try {
    const result = await actionRegistry.executeAction('getNativeBalance', {
      chainId: '1', // Ethereum
    });
    
    if (result.success) {
      const { nativeBalance } = result.data;
      
      // 将 wei 转换为 ETH
      const balanceInEth = parseFloat(nativeBalance.balance) / Math.pow(10, 18);
      
      logger.info(`Native Balance:`, {
        symbol: nativeBalance.symbol,
        balance: `${balanceInEth.toFixed(6)} ${nativeBalance.symbol}`,
        raw: nativeBalance.balance,
      });
      
      return {
        success: true,
        message: `${nativeBalance.symbol} balance: ${balanceInEth.toFixed(6)}`,
        data: result.data,
      };
    } else {
      logger.error('Failed to get native balance:', result.error);
      return {
        success: false,
        message: `Failed to get native balance: ${result.error}`,
      };
    }
  } catch (error) {
    logger.error('Error in getNativeBalance example:', error);
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * 示例：多链资产查询
 */
export async function exampleMultiChainAssets(actionRegistry: ActionRegistry) {
  logger.info('Example: Getting assets across multiple chains');
  
  const chains = [
    { id: '1', name: 'Ethereum' },
    { id: '56', name: 'BSC' },
    { id: '137', name: 'Polygon' },
  ];
  
  const results: any[] = [];
  
  for (const chain of chains) {
    try {
      logger.info(`Checking assets on ${chain.name}...`);
      
      const result = await actionRegistry.executeAction('getAllAssets', {
        chainId: chain.id,
        includeZeroBalances: false,
      });
      
      if (result.success) {
        results.push({
          chain: chain.name,
          chainId: chain.id,
          totalValue: result.data.totalValue,
          totalAssets: result.data.totalAssets,
          topAssets: result.data.assets.slice(0, 3),
        });
      } else {
        logger.warn(`Failed to get assets for ${chain.name}:`, result.error);
        results.push({
          chain: chain.name,
          chainId: chain.id,
          error: result.error,
        });
      }
    } catch (error) {
      logger.error(`Error checking ${chain.name}:`, error);
      results.push({
        chain: chain.name,
        chainId: chain.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  const totalValue = results
    .filter(r => !r.error)
    .reduce((sum, r) => sum + (r.totalValue || 0), 0);
  
  logger.info('Multi-chain Portfolio Summary:', {
    totalValue: `$${totalValue.toFixed(2)}`,
    chains: results.map(r => ({
      chain: r.chain,
      value: r.error ? 'Error' : `$${r.totalValue?.toFixed(2) || '0'}`,
      assets: r.error ? 'Error' : r.totalAssets,
    })),
  });
  
  return {
    success: true,
    message: `Multi-chain portfolio value: $${totalValue.toFixed(2)}`,
    data: {
      totalValue,
      chains: results,
    },
  };
}

/**
 * Agent 提示词示例
 * 
 * 这些是可以在 Agent 中使用的自然语言提示词示例
 */
export const ASSET_QUERY_PROMPTS = {
  getAllAssets: [
    "查询我的所有资产",
    "显示我的投资组合",
    "我有哪些代币？",
    "Show me my portfolio",
    "What tokens do I have?",
    "List all my assets",
  ],
  
  getNativeBalance: [
    "查询我的ETH余额",
    "我有多少ETH？",
    "Check my ETH balance",
    "How much ETH do I have?",
    "Show my native token balance",
  ],
  
  getTokenBalances: [
    "查询USDC余额",
    "我有多少USDT？",
    "Check my USDC balance",
    "How much USDT do I have?",
    "Show balances for specific tokens",
  ],
  
  multiChain: [
    "查询我在所有链上的资产",
    "显示多链投资组合",
    "Show my multi-chain portfolio",
    "Check assets across all networks",
    "What's my total portfolio value?",
  ],
};

/**
 * 运行所有示例
 */
export async function runAllExamples() {
  logger.info('Running all asset query examples...');
  
  const actionRegistry = new ActionRegistry();
  
  try {
    await exampleGetNativeBalance(actionRegistry);
    await exampleGetSpecificTokens(actionRegistry);
    await exampleGetAllAssets(actionRegistry);
    await exampleMultiChainAssets(actionRegistry);
    
    logger.info('All examples completed successfully');
  } catch (error) {
    logger.error('Error running examples:', error);
  }
}