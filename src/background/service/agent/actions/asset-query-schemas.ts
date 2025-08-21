// Type definitions for Asset Query action parameters
import { ActionSchema } from './schemas';

export interface GetAllAssetsActionParams {
  intent?: string;
  address?: string;
  chainId?: string;
  includeZeroBalances?: boolean;
}

export interface GetTokenBalancesActionParams {
  intent?: string;
  address?: string;
  chainId?: string;
  tokenAddresses?: string[];
}

export interface GetNativeBalanceActionParams {
  intent?: string;
  address?: string;
  chainId?: string;
}

export interface GetAssetPricesActionParams {
  intent?: string;
  chainId?: string;
  tokenAddresses?: string[];
}

// Asset query action schemas
export const getAllAssetsActionSchema: ActionSchema = {
  name: 'get_all_assets',
  description: 'Get all assets (native tokens and ERC20 tokens) for the current wallet address on the specified chain. This includes token balances, prices, and total portfolio value.',
};

export const getTokenBalancesActionSchema: ActionSchema = {
  name: 'get_token_balances',
  description: 'Get balances for specific ERC20 tokens for the current wallet address',
};

export const getNativeBalanceActionSchema: ActionSchema = {
  name: 'get_native_balance',
  description: 'Get native token balance (ETH, BNB, MATIC, etc.) for the current wallet address',
};

export const getAssetPricesActionSchema: ActionSchema = {
  name: 'get_asset_prices',
  description: 'Get current market prices for specified tokens',
};

// Type guard functions for Asset Query action runtime validation
export function isGetAllAssetsActionParams(
  obj: any
): obj is GetAllAssetsActionParams {
  return typeof obj === 'object';
}

export function isGetTokenBalancesActionParams(
  obj: any
): obj is GetTokenBalancesActionParams {
  return typeof obj === 'object';
}

export function isGetNativeBalanceActionParams(
  obj: any
): obj is GetNativeBalanceActionParams {
  return typeof obj === 'object';
}

export function isGetAssetPricesActionParams(
  obj: any
): obj is GetAssetPricesActionParams {
  return typeof obj === 'object';
}

// Export all Asset Query action schemas
export const assetQueryActionSchemas = [
  getAllAssetsActionSchema,
  getTokenBalancesActionSchema,
  getNativeBalanceActionSchema,
  getAssetPricesActionSchema,
] as const;