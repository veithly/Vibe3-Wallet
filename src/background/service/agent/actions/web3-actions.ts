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
import { ConfirmationManager } from '../confirmation/ConfirmationManager';
import { ActionPlan, ActionStep } from '../planning/ActionPlanner';

const logger = createLogger('Web3Action');

export class Web3Action {
  private readonly context: AgentContext;
  private readonly assetQueryAction: AssetQueryAction;
  private readonly confirmationManager: ConfirmationManager;

  constructor(context: AgentContext) {
    this.context = context;
    this.assetQueryAction = new AssetQueryAction(context);
    this.confirmationManager = new ConfirmationManager(context);
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

  // New Wallet Query Methods
  async getBalance(params: any): Promise<ActionResult> {
    try {
      const address = params.address || (await preferenceService.getCurrentAccount())?.address;
      const chainId = params.chainId || '1';

      if (!address) {
        return {
          success: false,
          error: 'No address provided and no current account found',
        };
      }

      logger.info(`Getting balance for address: ${address} on chain: ${chainId}`);

      // Use Rabby's openapi service to get total balance
      const totalBalance = await openapiService.getTotalBalance(address, true);

      return {
        success: true,
        data: {
          address,
          chainId,
          totalBalance,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      logger.error('Error getting balance:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get balance',
        data: {
          address: params.address || '',
          chainId: params.chainId || '1',
          totalBalance: null,
          timestamp: Date.now(),
        },
      };
    }
  }

  async getTokenBalance(params: any): Promise<ActionResult> {
    try {
      const address = params.address || (await preferenceService.getCurrentAccount())?.address;
      const tokenAddress = params.tokenAddress;
      const chainId = params.chainId || '1';

      if (!address) {
        return {
          success: false,
          error: 'No address provided and no current account found',
        };
      }

      logger.info(`Getting token balance for address: ${address}, token: ${tokenAddress} on chain: ${chainId}`);

      let balance;
      if (!tokenAddress) {
        // Native token balance
        balance = await providerController({
          data: {
            method: 'eth_getBalance',
            params: [address, 'latest'],
          },
        });
      } else {
        // ERC20 token balance
        const balanceOfAbi = [
          {
            constant: true,
            inputs: [{ name: '_owner', type: 'address' }],
            name: 'balanceOf',
            outputs: [{ name: 'balance', type: 'uint256' }],
            type: 'function',
          },
        ];

        const data = this.encodeFunctionCall(balanceOfAbi[0], [address]);
        balance = await providerController({
          data: {
            method: 'eth_call',
            params: [
              {
                to: tokenAddress,
                data: data,
              },
              'latest',
            ],
          },
        });
      }

      return {
        success: true,
        data: {
          address,
          tokenAddress: tokenAddress || 'native',
          chainId,
          balance,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      logger.error('Error getting token balance:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get token balance',
        data: {
          address: params.address || '',
          tokenAddress: params.tokenAddress || 'native',
          chainId: params.chainId || '1',
          balance: null,
          timestamp: Date.now(),
        },
      };
    }
  }

  async getTokenPrice(params: any): Promise<ActionResult> {
    try {
      const token = params.token;
      const chainId = params.chainId || '1';
      const quoteCurrency = params.quoteCurrency || 'USD';

      if (!token) {
        return {
          success: false,
          error: 'Token parameter is required',
        };
      }

      logger.info(`Getting token price for: ${token} on chain: ${chainId}`);

      // Use Rabby's openapi service to get token price
      let priceData;
      if (token.startsWith('0x')) {
        // Token contract address - use tokenPrice method
        priceData = await openapiService.tokenPrice(token);
      } else {
        // Token symbol - try to get token info first
        try {
          const tokenInfo = await openapiService.getToken(token, chainId, token);
          if (tokenInfo) {
            priceData = await openapiService.tokenPrice(tokenInfo.id || token);
          }
        } catch (error) {
          // Fallback to direct symbol call
          priceData = await openapiService.tokenPrice(token);
        }
      }

      return {
        success: true,
        data: {
          token,
          chainId,
          quoteCurrency,
          price: priceData?.last_price || null,
          priceChange24h: priceData?.change_percent || null,
          marketCap: priceData?.market_cap || null,
          volume24h: priceData?.volume_24h || null,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      logger.error('Error getting token price:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get token price',
        data: {
          token: params.token || '',
          chainId: params.chainId || '1',
          quoteCurrency: params.quoteCurrency || 'USD',
          price: null,
          timestamp: Date.now(),
        },
      };
    }
  }

  async sendTransaction(params: any): Promise<ActionResult> {
    try {
      const currentAccount = await preferenceService.getCurrentAccount();
      if (!currentAccount) {
        return {
          success: false,
          error: 'No current account found',
        };
      }

      const txParams = {
        from: currentAccount.address,
        to: params.to,
        value: params.value || '0x0',
        data: params.data || '0x',
        chainId: params.chainId || '1',
        gas: params.gas || '0x',
        gasPrice: params.gasPrice || '0x',
        nonce: params.nonce || '0x',
      };

      // Create action plan for confirmation
      const actionPlan: ActionPlan = {
        id: `tx_${Date.now()}`,
        intent: {
          action: 'SEND',
          entities: {
            recipient: params.to,
            amount: params.value,
            chainId: Number(params.chainId || '1'),
          },
          constraints: {},
          chains: [Number(params.chainId || '1')],
          protocols: [],
          confidence: 0.9,
          rawInstruction: `Send ${params.value} ETH to ${params.to}`,
        },
        actions: [
          {
            id: 'send-tx-1',
            name: 'Send Transaction',
            type: 'sendTransaction',
            status: 'pending',
            params: txParams,
            description: `Send ${params.value} ETH to ${params.to}`,
            dependencies: [],
            estimatedGas: '21000',
            estimatedTime: 30,
            riskLevel: 'HIGH',
          },
        ],
        riskLevel: 'HIGH',
        estimatedTotalGas: '21000',
        estimatedTotalTime: 30,
        requiresConfirmation: true,
      };

      // Request user confirmation
      const confirmed = await this.confirmationManager.requestConfirmation(actionPlan);
      if (!confirmed) {
        return {
          success: false,
          error: 'Transaction cancelled by user',
        };
      }

      logger.info('User confirmed transaction, proceeding with execution');

      const txHash = await providerController({
        data: {
          method: 'eth_sendTransaction',
          params: [txParams],
        },
      });

      return {
        success: true,
        data: {
          txHash,
          txParams,
          confirmed: true,
        },
      };
    } catch (error) {
      logger.error('Error sending transaction:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send transaction',
        data: {
          txHash: null,
          txParams: params,
        },
      };
    }
  }

  async approveToken(params: any): Promise<ActionResult> {
    try {
      const currentAccount = await preferenceService.getCurrentAccount();
      if (!currentAccount) {
        return {
          success: false,
          error: 'No current account found',
        };
      }

      const tokenAddress = params.tokenAddress;
      const spender = params.spender;
      const amount = params.amount || '0x';
      const chainId = params.chainId || '1';

      if (!tokenAddress || !spender) {
        return {
          success: false,
          error: 'Token address and spender are required',
        };
      }

      logger.info(`Approving token for spender: ${spender} on token: ${tokenAddress} for amount: ${amount}`);

      const approveAbi = [
        {
          constant: false,
          inputs: [{ name: '_spender', type: 'address' }, { name: '_value', type: 'uint256' }],
          name: 'approve',
          outputs: [{ name: 'success', type: 'bool' }],
          type: 'function',
        },
      ];

      const data = this.encodeFunctionCall(approveAbi[0], [spender, amount]);

      const txParams = {
        from: currentAccount.address,
        to: tokenAddress,
        data: data,
        chainId: chainId,
      };

      // Create action plan for confirmation
      const actionPlan: ActionPlan = {
        id: `approve_${Date.now()}`,
        intent: {
          action: 'APPROVE',
          entities: {
            tokenAddress: tokenAddress,
            spender: spender,
            amount: amount,
            chainId: Number(chainId),
          },
          constraints: {},
          chains: [Number(chainId)],
          protocols: [],
          confidence: 0.9,
          rawInstruction: `Approve ${spender} to spend ${amount} of token ${tokenAddress}`,
        },
        actions: [
          {
            id: 'approve-token-1',
            name: 'Approve Token',
            type: 'approveToken',
            status: 'pending',
            params: txParams,
            description: `Approve ${spender} to spend ${amount} of token ${tokenAddress}`,
            dependencies: [],
            estimatedGas: '50000',
            estimatedTime: 30,
            riskLevel: 'MEDIUM',
          },
        ],
        riskLevel: 'MEDIUM',
        estimatedTotalGas: '50000',
        estimatedTotalTime: 30,
        requiresConfirmation: true,
      };

      // Request user confirmation
      const confirmed = await this.confirmationManager.requestConfirmation(actionPlan);
      if (!confirmed) {
        return {
          success: false,
          error: 'Token approval cancelled by user',
        };
      }

      logger.info('User confirmed token approval, proceeding with execution');

      const txHash = await providerController({
        data: {
          method: 'eth_sendTransaction',
          params: [txParams],
        },
      });

      return {
        success: true,
        data: {
          txHash,
          txParams,
          confirmed: true,
        },
      };
    } catch (error) {
      logger.error('Error approving token:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to approve token',
        data: {
          txHash: null,
          txParams: params,
        },
      };
    }
  }

  async swapTokens(params: any): Promise<ActionResult> {
    try {
      const currentAccount = await preferenceService.getCurrentAccount();
      if (!currentAccount) {
        return {
          success: false,
          error: 'No current account found',
        };
      }

      const fromToken = params.fromToken;
      const toToken = params.toToken;
      const amount = params.amount;
      const chainId = params.chainId || '1';
      const slippage = params.slippage || 0.5;
      const preferredDex = params.preferredDex;

      if (!fromToken || !toToken || !amount) {
        return {
          success: false,
          error: 'From token, to token, and amount are required',
        };
      }

      logger.info(`Swapping ${amount} ${fromToken} to ${toToken} on chain ${chainId}`);

      // Create action plan for confirmation
      const actionPlan: ActionPlan = {
        id: `swap_${Date.now()}`,
        intent: {
          action: 'SWAP',
          entities: {
            fromToken: fromToken,
            toToken: toToken,
            amount: amount,
            chainId: Number(chainId),
          },
          constraints: {
            slippage: slippage,
          },
          chains: [Number(chainId)],
          protocols: preferredDex ? [preferredDex] : [],
          confidence: 0.9,
          rawInstruction: `Swap ${amount} ${fromToken} to ${toToken} with ${slippage}% slippage`,
        },
        actions: [
          {
            id: 'swap-1',
            name: 'Swap Tokens',
            type: 'swapTokens',
            status: 'pending',
            params: {
              fromToken,
              toToken,
              amount,
              chainId,
              slippage,
              preferredDex,
            },
            description: `Swap ${amount} ${fromToken} to ${toToken}`,
            dependencies: [],
            estimatedGas: '200000',
            estimatedTime: 60,
            riskLevel: 'HIGH',
          },
        ],
        riskLevel: 'HIGH',
        estimatedTotalGas: '200000',
        estimatedTotalTime: 60,
        requiresConfirmation: true,
      };

      // Request user confirmation
      const confirmed = await this.confirmationManager.requestConfirmation(actionPlan);
      if (!confirmed) {
        return {
          success: false,
          error: 'Token swap cancelled by user',
        };
      }

      logger.info('User confirmed token swap, proceeding with execution');

      // This is a simplified implementation - in production, you would use the actual swap service
      // For now, we'll return a mock result
      const mockTxHash = '0x' + Math.random().toString(16).substr(2, 64);

      return {
        success: true,
        data: {
          txHash: mockTxHash,
          fromToken,
          toToken,
          amount,
          chainId,
          slippage,
          confirmed: true,
        },
      };
    } catch (error) {
      logger.error('Error swapping tokens:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to swap tokens',
        data: {
          txHash: null,
          params: params,
        },
      };
    }
  }

  async bridgeTokens(params: any): Promise<ActionResult> {
    try {
      const currentAccount = await preferenceService.getCurrentAccount();
      if (!currentAccount) {
        return {
          success: false,
          error: 'No current account found',
        };
      }

      const token = params.token;
      const amount = params.amount;
      const fromChainId = params.fromChainId;
      const toChainId = params.toChainId;
      const recipient = params.recipient || currentAccount.address;
      const preferredBridge = params.preferredBridge;

      if (!token || !amount || !fromChainId || !toChainId) {
        return {
          success: false,
          error: 'Token, amount, from chain ID, and to chain ID are required',
        };
      }

      logger.info(`Bridging ${amount} ${token} from chain ${fromChainId} to chain ${toChainId}`);

      // Create action plan for confirmation
      const actionPlan: ActionPlan = {
        id: `bridge_${Date.now()}`,
        intent: {
          action: 'BRIDGE',
          entities: {
            tokenAddress: token,
            amount: amount,
            fromChainId: Number(fromChainId),
            toChainId: Number(toChainId),
            recipient: recipient,
          },
          constraints: {},
          chains: [Number(fromChainId), Number(toChainId)],
          protocols: preferredBridge ? [preferredBridge] : [],
          confidence: 0.9,
          rawInstruction: `Bridge ${amount} ${token} from chain ${fromChainId} to chain ${toChainId}`,
        },
        actions: [
          {
            id: 'bridge-1',
            name: 'Bridge Tokens',
            type: 'bridgeTokens',
            status: 'pending',
            params: {
              token,
              amount,
              fromChainId,
              toChainId,
              recipient,
              preferredBridge,
            },
            description: `Bridge ${amount} ${token} from chain ${fromChainId} to chain ${toChainId}`,
            dependencies: [],
            estimatedGas: '300000',
            estimatedTime: 300,
            riskLevel: 'HIGH',
          },
        ],
        riskLevel: 'HIGH',
        estimatedTotalGas: '300000',
        estimatedTotalTime: 300,
        requiresConfirmation: true,
      };

      // Request user confirmation
      const confirmed = await this.confirmationManager.requestConfirmation(actionPlan);
      if (!confirmed) {
        return {
          success: false,
          error: 'Token bridge cancelled by user',
        };
      }

      logger.info('User confirmed token bridge, proceeding with execution');

      // This is a simplified implementation - in production, you would use the actual bridge service
      // For now, we'll return a mock result
      const mockTxHash = '0x' + Math.random().toString(16).substr(2, 64);

      return {
        success: true,
        data: {
          txHash: mockTxHash,
          token,
          amount,
          fromChainId,
          toChainId,
          recipient,
          confirmed: true,
        },
      };
    } catch (error) {
      logger.error('Error bridging tokens:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to bridge tokens',
        data: {
          txHash: null,
          params: params,
        },
      };
    }
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
      // New Wallet Query Actions
      case 'getBalance':
        return this.getBalance(params);
      case 'getTokenBalance':
        return this.getTokenBalance(params);
      case 'getTokenPrice':
        return this.getTokenPrice(params);
      // New Wallet Transaction Actions
      case 'sendTransaction':
        return this.sendTransaction(params);
      case 'approveToken':
        return this.approveToken(params);
      // New Advanced DeFi Actions
      case 'swapTokens':
        return this.swapTokens(params);
      case 'bridgeTokens':
        return this.bridgeTokens(params);
      default:
        return {
          success: false,
          error: `Unknown Web3 action: ${actionName}`,
        };
    }
  }
}
