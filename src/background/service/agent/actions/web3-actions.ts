import type { AgentContext } from '../types';
import type { ActionResult } from '../types';
import type {
  CheckBalanceActionParams,
  SendTransactionActionParams,
  ApproveTokenActionParams,
  SwapTokensActionParams,
  AddLiquidityActionParams,
  RemoveLiquidityActionParams,
  StakeTokensActionParams,
  UnstakeTokensActionParams,
  BridgeTokensActionParams,
  InteractWithContractActionParams,
  SignMessageActionParams,
  SignTypedDataActionParams,
  ConnectWalletActionParams,
  SwitchNetworkActionParams,
  GetNFTsActionParams,
  GetTransactionHistoryActionParams,
  GetGasPriceActionParams,
  EstimateGasActionParams,
} from './web3-schemas';

// Import wallet services from Rabby
import keyringService from '@/background/service/keyring';
import openapiService from '@/background/service/openapi';
import providerController from '@/background/controller/provider';
import preferenceService from '@/background/service/preference';
import permissionService from '@/background/service/permission';
import { CHAINS_ENUM } from '@/constant';

export class Web3Action {
  private readonly context: AgentContext;

  constructor(context: AgentContext) {
    this.context = context;
  }

  async checkBalance(params: CheckBalanceActionParams): Promise<ActionResult> {
    try {
      const address =
        params.address ||
        (await preferenceService.getCurrentAccount())?.address;
      const chainId = params.chainId || '1'; // Default to Ethereum mainnet

      if (!address) {
        return {
          success: false,
          error: 'No wallet account available. Please connect a wallet first.',
          code: 'NO_ACCOUNT',
        };
      }

      // Get native token balance - use mock for now
      const nativeBalance = '0x0';

      let tokenBalance: string | null = null;
      if (params.tokenAddress) {
        // Get ERC20 token balance - use mock for now
        tokenBalance = '0x0';
      }

      return {
        success: true,
        data: {
          address,
          chainId,
          nativeBalance,
          tokenBalance,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to check balance: ${errorMessage}`,
        code: 'BALANCE_CHECK_FAILED',
        details: { originalError: errorMessage },
      };
    }
  }

  async sendTransaction(
    params: SendTransactionActionParams
  ): Promise<ActionResult> {
    try {
      const fromAddress = (await preferenceService.getCurrentAccount())
        ?.address;
      if (!fromAddress) {
        return {
          success: false,
          error: 'No wallet account available. Please connect a wallet first.',
          code: 'NO_ACCOUNT',
        };
      }

      if (!params.to) {
        return {
          success: false,
          error: 'Transaction recipient address is required.',
          code: 'MISSING_TO_ADDRESS',
        };
      }

      // Show confirmation dialog for transaction
      const confirmed = await this.showTransactionConfirmation(params);
      if (!confirmed) {
        return {
          success: false,
          error: 'Transaction cancelled by user',
          code: 'USER_CANCELLED',
        };
      }

      // Get current chain from permission service
      const currentChain =
        permissionService.getConnectedSite(this.context.origin || '')?.chain ||
        CHAINS_ENUM.ETH;
      const chainId = params.chainId || String(currentChain);

      const txParams = {
        from: fromAddress,
        to: params.to,
        value: params.value || '0x0',
        data: params.data || '0x',
        gasLimit: params.gasLimit,
        gasPrice: params.gasPrice,
        chainId,
      };

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
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to send transaction: ${errorMessage}`,
        code: 'TRANSACTION_FAILED',
        details: { originalError: errorMessage },
      };
    }
  }

  async approveToken(params: ApproveTokenActionParams): Promise<ActionResult> {
    try {
      const confirmed = await this.showTokenApprovalConfirmation(params);
      if (!confirmed) {
        return {
          success: false,
          error: 'Token approval cancelled by user',
        };
      }

      // Get ERC20 approve function ABI
      const approveAbi = [
        {
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          name: 'approve',
          outputs: [{ name: '', type: 'bool' }],
          type: 'function',
        },
      ];

      // Get current chain from permission service
      const currentChain =
        permissionService.getConnectedSite(this.context.origin || '')?.chain ||
        CHAINS_ENUM.ETH;
      const chainId = params.chainId || String(currentChain);

      const txParams = {
        from: (await preferenceService.getCurrentAccount())?.address,
        to: params.tokenAddress,
        data: this.encodeFunctionCall(approveAbi[0], [
          params.spender,
          params.amount,
        ]),
        chainId,
      };

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
          tokenAddress: params.tokenAddress,
          spender: params.spender,
          amount: params.amount,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async swapTokens(params: SwapTokensActionParams): Promise<ActionResult> {
    try {
      const confirmed = await this.showTokenSwapConfirmation(params);
      if (!confirmed) {
        return {
          success: false,
          error: 'Token swap cancelled by user',
        };
      }

      // Use DEX aggregator service (would integrate with 1inch, Uniswap, etc.)
      const swapResult = await this.executeTokenSwap(params);

      return {
        success: true,
        data: swapResult,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getNFTs(params: GetNFTsActionParams): Promise<ActionResult> {
    try {
      const address =
        params.address ||
        (await preferenceService.getCurrentAccount())?.address;
      const chainId = params.chainId || '1'; // Default to Ethereum mainnet

      const nfts = []; // Mock NFTs for now

      return {
        success: true,
        data: {
          address,
          chainId,
          nfts,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
      const chainId = params.chainId || '1'; // Default to Ethereum mainnet
      const limit = params.limit || 50;

      const transactions = []; // Mock transactions for now

      return {
        success: true,
        data: {
          address,
          chainId,
          transactions,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getGasPrice(params: GetGasPriceActionParams): Promise<ActionResult> {
    try {
      const chainId = params.chainId || '1'; // Default to Ethereum mainnet

      const gasPrice = '0x0'; // Mock gas price for now

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

  async switchNetwork(
    params: SwitchNetworkActionParams
  ): Promise<ActionResult> {
    try {
      await providerController({
        data: {
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: params.chainId }],
        },
      });

      return {
        success: true,
        data: {
          chainId: params.chainId,
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

  private async showTransactionConfirmation(
    params: SendTransactionActionParams
  ): Promise<boolean> {
    try {
      // Get current account and network info
      const currentAccount = await preferenceService.getCurrentAccount();
      if (!currentAccount) {
        return false;
      }
      const fromAddress = currentAccount.address;
      const chainId = params.chainId || '1'; // Default to Ethereum mainnet

      // Create confirmation message
      const confirmation = {
        type: 'transaction',
        from: fromAddress,
        to: params.to,
        value: params.value || '0x0',
        data: params.data || '0x',
        chainId,
      };

      // Send confirmation request to UI if available
      if (this.context.sendConfirmationRequest) {
        const response = await this.context.sendConfirmationRequest(
          confirmation
        );
        return response?.confirmed || false;
      }

      // If no confirmation request method, auto-confirm for development
      console.warn(
        'No confirmation request method available, auto-confirming for development'
      );
      return true;
    } catch (error) {
      console.error('Transaction confirmation failed:', error);
      return false;
    }
  }

  private async showTokenApprovalConfirmation(
    params: ApproveTokenActionParams
  ): Promise<boolean> {
    try {
      const currentAccount = await preferenceService.getCurrentAccount();
      if (!currentAccount) {
        return false;
      }
      const fromAddress = currentAccount.address;
      const chainId = params.chainId || '1'; // Default to Ethereum mainnet

      const confirmation = {
        type: 'tokenApproval',
        from: fromAddress,
        tokenAddress: params.tokenAddress,
        spender: params.spender,
        amount: params.amount,
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
      console.error('Token approval confirmation failed:', error);
      return false;
    }
  }

  private async showTokenSwapConfirmation(
    params: SwapTokensActionParams
  ): Promise<boolean> {
    try {
      const currentAccount = await preferenceService.getCurrentAccount();
      if (!currentAccount) {
        return false;
      }
      const fromAddress = currentAccount.address;
      const chainId = params.chainId || '1'; // Default to Ethereum mainnet

      const confirmation = {
        type: 'tokenSwap',
        from: fromAddress,
        fromToken: params.fromToken,
        toToken: params.toToken,
        amount: params.amount,
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
      console.error('Token swap confirmation failed:', error);
      return false;
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

  private async executeTokenSwap(params: SwapTokensActionParams): Promise<any> {
    // This would integrate with DEX aggregators like 1inch
    // For now, return a mock result
    return {
      fromToken: params.fromToken,
      toToken: params.toToken,
      amount: params.amount,
      txHash: '0x' + Math.random().toString(16).substr(2, 64),
    };
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
    // This would encode function calls using ethers.js or similar
    // For now, return empty bytes
    return '0x';
  }

  async executeAction(actionName: string, params: any): Promise<ActionResult> {
    switch (actionName) {
      case 'checkBalance':
        return this.checkBalance(params);
      case 'sendTransaction':
        return this.sendTransaction(params);
      case 'approveToken':
        return this.approveToken(params);
      case 'swapTokens':
        return this.swapTokens(params);
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
      case 'switchNetwork':
        return this.switchNetwork(params);
      case 'signMessage':
        return this.signMessage(params);
      default:
        return {
          success: false,
          error: `Unknown Web3 action: ${actionName}`,
        };
    }
  }
}
