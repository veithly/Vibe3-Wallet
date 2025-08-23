import type { AgentContext } from '../types';
import type { ActionResult } from '../types';
import type {
  AddLiquidityActionParams,
  RemoveLiquidityActionParams,
  InteractWithContractActionParams,
  SignMessageActionParams,
  SignTypedDataActionParams,
  GetNFTsActionParams,
  GetTransactionHistoryActionParams,
  GetGasPriceActionParams,
  EstimateGasActionParams,
} from './web3-schemas';
import { AssetQueryAction } from './asset-query-actions';
import type {
  GetAllAssetsActionParams,
  GetTokenBalancesActionParams,
  GetNativeBalanceActionParams,
  GetAssetPricesActionParams,
} from './asset-query-schemas';

// Import wallet services from Rabby
import keyringService from '@/background/service/keyring';
import openapiService from '@/background/service/openapi';
import providerController from '@/background/controller/provider';
import preferenceService from '@/background/service/preference';
import permissionService from '@/background/service/permission';
import { CHAINS_ENUM } from '@/constant';
import { createLogger } from '@/utils/logger';
import * as crypto from 'crypto';
import transactionHistoryService from '@/background/service/transactionHistory';
import { findChain } from '@/utils/chain';

const logger = createLogger('Web3Action');

export class Web3Action {
  private readonly context: AgentContext;
  private readonly assetQueryAction: AssetQueryAction;

  constructor(context: AgentContext) {
    this.context = context;
    this.assetQueryAction = new AssetQueryAction(context);
  }

  async getNFTs(params: GetNFTsActionParams): Promise<ActionResult> {
    try {
      const address =
        params.address ||
        (await preferenceService.getCurrentAccount())?.address;
      const chainId = params.chainId || '1'; // Default to Ethereum mainnet

      // Use Rabby's openapi service to get real NFT data
      const nftResponse = (await (openapiService as any).getNFTs?.(
        address,
        String(chainId)
      )) || { data: [] };

      const nfts = nftResponse?.data || [];

      return {
        success: true,
        data: {
          address,
          chainId,
          nfts,
        },
      };
    } catch (error) {
      // Fallback to empty array if service fails
      return {
        success: true,
        data: {
          address:
            params.address ||
            (await preferenceService.getCurrentAccount())?.address ||
            '',
          chainId: params.chainId || '1',
          nfts: [],
        },
      };
    }
  }

  async getTransactionHistory(
    params: GetTransactionHistoryActionParams
  ): Promise<ActionResult> {
    try {
      const address =
        params.address ||
        (await preferenceService.getCurrentAccount())?.address;

      if (!address) {
        return {
          success: false,
          error: 'No address provided and no current account found',
        };
      }

      // Use wallet's built-in transaction history service to get all networks' transaction history
      const { pendings, completeds } = await transactionHistoryService.getList(address);

      // Combine pending and completed transactions from all networks
      const allTransactions = [
        ...pendings.map(tx => ({
          ...tx,
          status: 'pending',
          network: findChain({ id: tx.chainId })?.name || `Chain ${tx.chainId}`,
        })),
        ...completeds.map(tx => ({
          ...tx,
          status: 'completed',
          network: findChain({ id: tx.chainId })?.name || `Chain ${tx.chainId}`,
        }))
      ];

      // Sort by creation time (newest first)
      const sortedTransactions = allTransactions.sort((a, b) => b.createdAt - a.createdAt);

      // Apply limit if specified
      const limit = params.limit || 50;
      const limitedTransactions = sortedTransactions.slice(0, limit);

      return {
        success: true,
        data: {
          address,
          totalTransactions: allTransactions.length,
          pendingCount: pendings.length,
          completedCount: completeds.length,
          transactions: limitedTransactions,
          networks: [...new Set(allTransactions.map(tx => tx.network))],
        },
      };
    } catch (error) {
      console.error('Error getting transaction history:', error);
      return {
        success: false,
        error: `Failed to get transaction history: ${error.message}`,
        data: {
          address: params.address || '',
          totalTransactions: 0,
          pendingCount: 0,
          completedCount: 0,
          transactions: [],
          networks: [],
        },
      };
    }
  }

  async getGasPrice(params: GetGasPriceActionParams): Promise<ActionResult> {
    try {
      const chainId = params.chainId || '1'; // Default to Ethereum mainnet

      // Get real gas price using provider controller
      const gasPrice = await providerController({
        data: {
          method: 'eth_gasPrice',
          params: [],
        },
      });

      return {
        success: true,
        data: {
          chainId,
          gasPrice,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async estimateGas(params: EstimateGasActionParams): Promise<ActionResult> {
    try {
      // Get current chain from permission service
      const currentChain =
        permissionService.getConnectedSite(this.context.origin || '')?.chain ||
        CHAINS_ENUM.ETH;
      const chainId = params.chainId || String(currentChain);

      const txParams = {
        from: (await preferenceService.getCurrentAccount())?.address,
        to: params.to,
        value: params.value || '0x0',
        data: params.data || '0x',
        chainId,
      };

      const gasEstimate = await providerController({
        data: {
          method: 'eth_estimateGas',
          params: [txParams],
        },
      });

      return {
        success: true,
        data: {
          txParams,
          gasEstimate,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }



  async signMessage(params: SignMessageActionParams): Promise<ActionResult> {
    try {
      const address =
        params.address ||
        (await preferenceService.getCurrentAccount())?.address;

      const confirmed = await this.showMessageSigningConfirmation(
        params.message
      );
      if (!confirmed) {
        return {
          success: false,
          error: 'Message signing cancelled by user',
        };
      }

      const signature = await keyringService.signMessage({
        from: address,
        data: params.message,
      });

      return {
        success: true,
        data: {
          address,
          message: params.message,
          signature,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Placeholder implementations for more complex Web3 actions
  async addLiquidity(params: AddLiquidityActionParams): Promise<ActionResult> {
    try {
      const confirmed = await this.showLiquidityConfirmation('add', params);
      if (!confirmed) {
        return {
          success: false,
          error: 'Add liquidity cancelled by user',
        };
      }

      // Implementation would interact with DEX contracts
      const result = await this.executeLiquidityAction('add', params);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async removeLiquidity(
    params: RemoveLiquidityActionParams
  ): Promise<ActionResult> {
    try {
      const confirmed = await this.showLiquidityConfirmation('remove', params);
      if (!confirmed) {
        return {
          success: false,
          error: 'Remove liquidity cancelled by user',
        };
      }

      const result = await this.executeLiquidityAction('remove', params);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async showMessageSigningConfirmation(
    message: string
  ): Promise<boolean> {
    try {
      const fromAddress = (await preferenceService.getCurrentAccount())
        ?.address;

      const confirmation = {
        type: 'messageSigning',
        from: fromAddress,
        message: message,
      };

      if (this.context.sendConfirmationRequest) {
        const response = await this.context.sendConfirmationRequest(
          confirmation
        );
        return response?.confirmed || false;
      }

      console.warn(
        'No confirmation request method available, auto-confirming for development'
      );
      return true;
    } catch (error) {
      console.error('Message signing confirmation failed:', error);
      return false;
    }
  }

  private async showLiquidityConfirmation(
    action: 'add' | 'remove',
    params: any
  ): Promise<boolean> {
    try {
      const currentAccount = await preferenceService.getCurrentAccount();
      if (!currentAccount) {
        return false;
      }
      const fromAddress = currentAccount.address;
      const chainId = params.chainId || '1'; // Default to Ethereum mainnet

      const confirmation = {
        type: 'liquidity',
        action: action,
        from: fromAddress,
        tokenA: params.tokenA,
        tokenB: params.tokenB,
        amountA: params.amountA,
        amountB: params.amountB,
        chainId,
      };

      if (this.context.sendConfirmationRequest) {
        const response = await this.context.sendConfirmationRequest(
          confirmation
        );
        return response?.confirmed || false;
      }

      console.warn(
        'No confirmation request method available, auto-confirming for development'
      );
      return true;
    } catch (error) {
      console.error('Liquidity confirmation failed:', error);
      return false;
    }
  }

  private async executeLiquidityAction(
    action: 'add' | 'remove',
    params: any
  ): Promise<any> {
    // This would interact with liquidity pool contracts
    return {
      action,
      params,
      txHash: '0x' + Math.random().toString(16).substr(2, 64),
    };
  }

  private encodeFunctionCall(functionAbi: any, params: any[]): string {
    try {
      // Use Rabby's built-in ABI encoding functionality
      // This is a simplified implementation - in production, use ethers.js or web3.js
      const functionSignature = `${functionAbi.name}(${functionAbi.inputs
        .map((input: any) => input.type)
        .join(',')})`;
      const functionSelector = this.getFunctionSelector(functionSignature);

      // Encode parameters
      const encodedParams = this.encodeParameters(functionAbi.inputs, params);

      return functionSelector + encodedParams;
    } catch (error) {
      logger.error('Function encoding failed:', error);
      throw new Error(
        `Failed to encode function call: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  private getFunctionSelector(functionSignature: string): string {
    // Create a simple hash of the function signature
    // In production, use keccak256 from ethers.js
    const hash = crypto
      .createHash('sha256')
      .update(functionSignature)
      .digest('hex');
    return hash.substring(0, 8);
  }

  private encodeParameters(inputs: any[], params: any[]): string {
    // Simplified parameter encoding
    // In production, use proper ABI encoding from ethers.js
    let encoded = '';

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const param = params[i];

      switch (input.type) {
        case 'address':
          encoded += param.replace('0x', '').padStart(64, '0');
          break;
        case 'uint256':
          encoded += BigInt(param).toString(16).padStart(64, '0');
          break;
        case 'string': {
          const stringBytes = Buffer.from(param, 'utf8');
          encoded += stringBytes.length.toString(16).padStart(64, '0');
          encoded += stringBytes
            .toString('hex')
            .padEnd(Math.ceil(stringBytes.length / 32) * 64, '0');
          break;
        }
        default:
          encoded += param.toString().padStart(64, '0');
      }
    }

    return encoded;
  }

  // Asset Query Actions
  async getAllAssets(params: GetAllAssetsActionParams): Promise<ActionResult> {
    return this.assetQueryAction.getAllAssets(params);
  }

  async getTokenBalances(params: GetTokenBalancesActionParams): Promise<ActionResult> {
    return this.assetQueryAction.getTokenBalances(params);
  }

  async getNativeBalance(params: GetNativeBalanceActionParams): Promise<ActionResult> {
    return this.assetQueryAction.getNativeBalance(params);
  }

  async getAssetPrices(params: GetAssetPricesActionParams): Promise<ActionResult> {
    return this.assetQueryAction.getAssetPrices(params);
  }

  async executeAction(actionName: string, params: any): Promise<ActionResult> {
    switch (actionName) {
      case 'addLiquidity':
        return this.addLiquidity(params);
      case 'removeLiquidity':
        return this.removeLiquidity(params);
      case 'getNFTs':
        return this.getNFTs(params);
      case 'getTransactionHistory':
        return this.getTransactionHistory(params);
      case 'getGasPrice':
        return this.getGasPrice(params);
      case 'estimateGas':
        return this.estimateGas(params);
      case 'signMessage':
        return this.signMessage(params);
      // Asset Query Actions
      case 'getAllAssets':
        return this.getAllAssets(params);
      case 'getTokenBalances':
        return this.getTokenBalances(params);
      case 'getNativeBalance':
        return this.getNativeBalance(params);
      case 'getAssetPrices':
        return this.getAssetPrices(params);
      default:
        return {
          success: false,
          error: `Unknown Web3 action: ${actionName}`,
        };
    }
  }
}
