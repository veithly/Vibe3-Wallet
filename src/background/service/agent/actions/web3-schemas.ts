// Type definitions for Web3 action parameters without zod dependency
import { ActionSchema } from './schemas';



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



export interface GetNFTsActionParams {
  intent?: string;
  address: string;
  chainId?: number;
  contractAddress?: string;
}

export interface GetTransactionHistoryActionParams {
  intent?: string;
  address: string;
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



export const addLiquidityActionSchema: ActionSchema = {
  name: 'add_liquidity',
  description: 'Add liquidity to a liquidity pool',
};

export const removeLiquidityActionSchema: ActionSchema = {
  name: 'remove_liquidity',
  description: 'Remove liquidity from a liquidity pool',
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



export const getNFTsActionSchema: ActionSchema = {
  name: 'get_nfts',
  description: 'Get NFTs owned by an address',
};

export const getTransactionHistoryActionSchema: ActionSchema = {
  name: 'get_transaction_history',
  description: 'Get transaction history for an address across all networks using wallet built-in storage',
};

export const getGasPriceActionSchema: ActionSchema = {
  name: 'get_gas_price',
  description: 'Get current gas price for a network',
};

export const estimateGasActionSchema: ActionSchema = {
  name: 'estimate_gas',
  description: 'Estimate gas cost for a transaction',
};

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
  addLiquidityActionSchema,
  removeLiquidityActionSchema,
  interactWithContractActionSchema,
  signMessageActionSchema,
  signTypedDataActionSchema,
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
