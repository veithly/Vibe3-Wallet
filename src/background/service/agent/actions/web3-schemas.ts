// Type definitions for Web3 action parameters without zod dependency
import { ActionSchema } from './schemas';

export interface CheckBalanceActionParams {
  intent?: string;
  address: string;
  tokenAddress?: string;
  chainId?: number;
}

export interface SendTransactionActionParams {
  intent?: string;
  to: string;
  value: string;
  data?: string;
  gasLimit?: string;
  gasPrice?: string;
  chainId?: number;
}

export interface ApproveTokenActionParams {
  intent?: string;
  tokenAddress: string;
  spender: string;
  amount: string;
  chainId?: number;
}

export interface SwapTokensActionParams {
  intent?: string;
  fromToken: string;
  toToken: string;
  amount: string;
  recipient?: string;
  slippage?: number;
  chainId?: number;
}

export interface AddLiquidityActionParams {
  intent?: string;
  tokenA: string;
  tokenB: string;
  amountA: string;
  amountB: string;
  chainId?: number;
}

export interface RemoveLiquidityActionParams {
  intent?: string;
  tokenA: string;
  tokenB: string;
  liquidityTokenAmount: string;
  chainId?: number;
}

export interface StakeTokensActionParams {
  intent?: string;
  tokenAddress: string;
  amount: string;
  stakingContract: string;
  chainId?: number;
}

export interface UnstakeTokensActionParams {
  intent?: string;
  tokenAddress: string;
  amount: string;
  stakingContract: string;
  chainId?: number;
}

export interface BridgeTokensActionParams {
  intent?: string;
  tokenAddress: string;
  amount: string;
  fromChainId: number;
  toChainId: number;
  recipient?: string;
}

export interface ABIParameter {
  name: string;
  type: string;
}

export interface ABIFunction {
  inputs: ABIParameter[];
  name: string;
  outputs: ABIParameter[];
  stateMutability?: string;
  type: string;
}

export interface InteractWithContractActionParams {
  intent?: string;
  contractAddress: string;
  abi: ABIFunction[];
  functionName: string;
  params: any[];
  value?: string;
  chainId?: number;
}

export interface SignMessageActionParams {
  intent?: string;
  message: string;
  address?: string;
}

export interface SignTypedDataActionParams {
  intent?: string;
  domain: Record<string, any>;
  types: Record<string, { name: string; type: string }[]>;
  value: Record<string, any>;
  address?: string;
}

export interface ConnectWalletActionParams {
  intent?: string;
  dappName: string;
  dappUrl: string;
  chainId?: number;
}

export interface SwitchNetworkActionParams {
  intent?: string;
  chainId: number;
  chainName?: string;
  rpcUrl?: string;
}

export interface GetNFTsActionParams {
  intent?: string;
  address: string;
  chainId?: number;
  contractAddress?: string;
}

export interface GetTransactionHistoryActionParams {
  intent?: string;
  address: string;
  chainId?: number;
  limit?: number;
}

export interface GetGasPriceActionParams {
  intent?: string;
  chainId?: number;
}

export interface EstimateGasActionParams {
  intent?: string;
  to: string;
  value?: string;
  data?: string;
  chainId?: number;
}

// Blockchain-specific actions for Web3 operations
export const checkBalanceActionSchema: ActionSchema = {
  name: 'check_balance',
  description: 'Check token balance for a specific address',
};

export const sendTransactionActionSchema: ActionSchema = {
  name: 'send_transaction',
  description: 'Send a transaction on the blockchain',
};

export const approveTokenActionSchema: ActionSchema = {
  name: 'approve_token',
  description: 'Approve token spending for a contract',
};

export const swapTokensActionSchema: ActionSchema = {
  name: 'swap_tokens',
  description: 'Swap tokens using a DEX',
};

export const addLiquidityActionSchema: ActionSchema = {
  name: 'add_liquidity',
  description: 'Add liquidity to a liquidity pool',
};

export const removeLiquidityActionSchema: ActionSchema = {
  name: 'remove_liquidity',
  description: 'Remove liquidity from a liquidity pool',
};

export const stakeTokensActionSchema: ActionSchema = {
  name: 'stake_tokens',
  description: 'Stake tokens in a staking contract',
};

export const unstakeTokensActionSchema: ActionSchema = {
  name: 'unstake_tokens',
  description: 'Unstake tokens from a staking contract',
};

export const bridgeTokensActionSchema: ActionSchema = {
  name: 'bridge_tokens',
  description: 'Bridge tokens across different chains',
};

export const interactWithContractActionSchema: ActionSchema = {
  name: 'interact_with_contract',
  description: 'Interact with a smart contract (read or write)',
};

export const signMessageActionSchema: ActionSchema = {
  name: 'sign_message',
  description: 'Sign a message with the wallet',
};

export const signTypedDataActionSchema: ActionSchema = {
  name: 'sign_typed_data',
  description: 'Sign typed data (EIP-712) with the wallet',
};

export const connectWalletActionSchema: ActionSchema = {
  name: 'connect_wallet',
  description: 'Connect wallet to a dApp',
};

export const switchNetworkActionSchema: ActionSchema = {
  name: 'switch_network',
  description: 'Switch to a different blockchain network',
};

export const getNFTsActionSchema: ActionSchema = {
  name: 'get_nfts',
  description: 'Get NFTs owned by an address',
};

export const getTransactionHistoryActionSchema: ActionSchema = {
  name: 'get_transaction_history',
  description: 'Get transaction history for an address',
};

export const getGasPriceActionSchema: ActionSchema = {
  name: 'get_gas_price',
  description: 'Get current gas price for a network',
};

export const estimateGasActionSchema: ActionSchema = {
  name: 'estimate_gas',
  description: 'Estimate gas cost for a transaction',
};

// Type guard functions for Web3 action runtime validation
export function isCheckBalanceActionParams(
  obj: any
): obj is CheckBalanceActionParams {
  return typeof obj === 'object' && typeof obj.address === 'string';
}

export function isSendTransactionActionParams(
  obj: any
): obj is SendTransactionActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.to === 'string' &&
    typeof obj.value === 'string'
  );
}

export function isApproveTokenActionParams(
  obj: any
): obj is ApproveTokenActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.tokenAddress === 'string' &&
    typeof obj.spender === 'string' &&
    typeof obj.amount === 'string'
  );
}

export function isSwapTokensActionParams(
  obj: any
): obj is SwapTokensActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.fromToken === 'string' &&
    typeof obj.toToken === 'string' &&
    typeof obj.amount === 'string'
  );
}

export function isAddLiquidityActionParams(
  obj: any
): obj is AddLiquidityActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.tokenA === 'string' &&
    typeof obj.tokenB === 'string' &&
    typeof obj.amountA === 'string' &&
    typeof obj.amountB === 'string'
  );
}

export function isRemoveLiquidityActionParams(
  obj: any
): obj is RemoveLiquidityActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.tokenA === 'string' &&
    typeof obj.tokenB === 'string' &&
    typeof obj.liquidityTokenAmount === 'string'
  );
}

export function isStakeTokensActionParams(
  obj: any
): obj is StakeTokensActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.tokenAddress === 'string' &&
    typeof obj.amount === 'string' &&
    typeof obj.stakingContract === 'string'
  );
}

export function isUnstakeTokensActionParams(
  obj: any
): obj is UnstakeTokensActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.tokenAddress === 'string' &&
    typeof obj.amount === 'string' &&
    typeof obj.stakingContract === 'string'
  );
}

export function isBridgeTokensActionParams(
  obj: any
): obj is BridgeTokensActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.tokenAddress === 'string' &&
    typeof obj.amount === 'string' &&
    typeof obj.fromChainId === 'number' &&
    typeof obj.toChainId === 'number'
  );
}

export function isInteractWithContractActionParams(
  obj: any
): obj is InteractWithContractActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.contractAddress === 'string' &&
    Array.isArray(obj.abi) &&
    typeof obj.functionName === 'string' &&
    Array.isArray(obj.params)
  );
}

export function isSignMessageActionParams(
  obj: any
): obj is SignMessageActionParams {
  return typeof obj === 'object' && typeof obj.message === 'string';
}

export function isSignTypedDataActionParams(
  obj: any
): obj is SignTypedDataActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.domain === 'object' &&
    typeof obj.types === 'object' &&
    typeof obj.value === 'object'
  );
}

export function isConnectWalletActionParams(
  obj: any
): obj is ConnectWalletActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.dappName === 'string' &&
    typeof obj.dappUrl === 'string'
  );
}

export function isSwitchNetworkActionParams(
  obj: any
): obj is SwitchNetworkActionParams {
  return typeof obj === 'object' && typeof obj.chainId === 'number';
}

export function isGetNFTsActionParams(obj: any): obj is GetNFTsActionParams {
  return typeof obj === 'object' && typeof obj.address === 'string';
}

export function isGetTransactionHistoryActionParams(
  obj: any
): obj is GetTransactionHistoryActionParams {
  return typeof obj === 'object' && typeof obj.address === 'string';
}

export function isGetGasPriceActionParams(
  obj: any
): obj is GetGasPriceActionParams {
  return typeof obj === 'object';
}

export function isEstimateGasActionParams(
  obj: any
): obj is EstimateGasActionParams {
  return typeof obj === 'object' && typeof obj.to === 'string';
}

// Import asset query schemas
import {
  getAllAssetsActionSchema,
  getTokenBalancesActionSchema,
  getNativeBalanceActionSchema,
  getAssetPricesActionSchema,
} from './asset-query-schemas';

// Export all Web3 action schemas
export const web3ActionSchemas = [
  checkBalanceActionSchema,
  sendTransactionActionSchema,
  approveTokenActionSchema,
  swapTokensActionSchema,
  addLiquidityActionSchema,
  removeLiquidityActionSchema,
  stakeTokensActionSchema,
  unstakeTokensActionSchema,
  bridgeTokensActionSchema,
  interactWithContractActionSchema,
  signMessageActionSchema,
  signTypedDataActionSchema,
  connectWalletActionSchema,
  switchNetworkActionSchema,
  getNFTsActionSchema,
  getTransactionHistoryActionSchema,
  getGasPriceActionSchema,
  estimateGasActionSchema,
  // Asset Query Schemas
  getAllAssetsActionSchema,
  getTokenBalancesActionSchema,
  getNativeBalanceActionSchema,
  getAssetPricesActionSchema,
] as const;
