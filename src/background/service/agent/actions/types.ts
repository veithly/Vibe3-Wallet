// Optimized TypeScript interfaces for action schemas
// These provide better compile-time type checking while reducing Zod dependency

// Base interfaces for all actions
export interface BaseActionParams {
  intent?: string;
}

export interface ActionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

// Navigation Actions
export interface SearchGoogleParams extends BaseActionParams {
  query: string;
}

export interface GoToUrlParams extends BaseActionParams {
  url: string;
}

export interface GoBackParams extends BaseActionParams {}

export interface ClickElementParams extends BaseActionParams {
  index: number;
  xpath?: string | null;
}

export interface InputTextParams extends BaseActionParams {
  index: number;
  text: string;
  xpath?: string | null;
}

// Tab Management Actions
export interface SwitchTabParams extends BaseActionParams {
  tab_id: number;
}

export interface OpenTabParams extends BaseActionParams {
  url: string;
}

export interface CloseTabParams extends BaseActionParams {
  tab_id: number;
}

// Scroll Actions
export interface ScrollToPercentParams extends BaseActionParams {
  yPercent: number;
  index?: number | null;
}

export interface ScrollToTopParams extends BaseActionParams {
  index?: number | null;
}

export interface ScrollToBottomParams extends BaseActionParams {
  index?: number | null;
}

export interface ScrollToTextParams extends BaseActionParams {
  text: string;
  nth?: number;
}

// Utility Actions
export interface SendKeysParams extends BaseActionParams {
  keys: string;
}

export interface GetDropdownOptionsParams extends BaseActionParams {
  index: number;
}

export interface SelectDropdownOptionParams extends BaseActionParams {
  index: number;
  text: string;
}

export interface WaitParams extends BaseActionParams {
  seconds?: number;
}

// Web3 Actions

export interface AddLiquidityParams extends BaseActionParams {
  tokenA: string;
  tokenB: string;
  amountA: string;
  amountB: string;
  chainId?: number;
}

export interface RemoveLiquidityParams extends BaseActionParams {
  tokenA: string;
  tokenB: string;
  liquidityTokenAmount: string;
  chainId?: number;
}



export interface InteractWithContractParams extends BaseActionParams {
  contractAddress: string;
  abi: Array<{
    inputs: Array<{ name: string; type: string }>;
    name: string;
    outputs: Array<{ name: string; type: string }>;
    stateMutability?: string;
    type: string;
  }>;
  functionName: string;
  params: any[];
  value?: string;
  chainId?: number;
}

export interface SignMessageParams extends BaseActionParams {
  message: string;
  address?: string;
}

export interface SignTypedDataParams extends BaseActionParams {
  domain: Record<string, any>;
  types: Record<string, Array<{ name: string; type: string }>>;
  value: Record<string, any>;
  address?: string;
}



export interface GetNFTsParams extends BaseActionParams {
  address: string;
  chainId?: number;
  contractAddress?: string;
}

export interface GetTransactionHistoryParams extends BaseActionParams {
  address: string;
  chainId?: number;
  limit?: number;
}

export interface GetGasPriceParams extends BaseActionParams {
  chainId?: number;
}

export interface EstimateGasParams extends BaseActionParams {
  to: string;
  value?: string;
  data?: string;
  chainId?: number;
}

// Action type mapping
export type ActionParams =
  | SearchGoogleParams
  | GoToUrlParams
  | GoBackParams
  | ClickElementParams
  | InputTextParams
  | SwitchTabParams
  | OpenTabParams
  | CloseTabParams
  | ScrollToPercentParams
  | ScrollToTopParams
  | ScrollToBottomParams
  | ScrollToTextParams
  | SendKeysParams
  | GetDropdownOptionsParams
  | SelectDropdownOptionParams
  | WaitParams
  | AddLiquidityParams
  | RemoveLiquidityParams
  | InteractWithContractParams
  | SignMessageParams
  | SignTypedDataParams

  | GetNFTsParams
  | GetTransactionHistoryParams
  | GetGasPriceParams
  | EstimateGasParams;

// Action name to params mapping
export interface ActionParamsMap {
  search_google: SearchGoogleParams;
  go_to_url: GoToUrlParams;
  go_back: GoBackParams;
  click_element: ClickElementParams;
  input_text: InputTextParams;
  switch_tab: SwitchTabParams;
  open_tab: OpenTabParams;
  close_tab: CloseTabParams;
  scroll_to_percent: ScrollToPercentParams;
  scroll_to_top: ScrollToTopParams;
  scroll_to_bottom: ScrollToBottomParams;
  scroll_to_text: ScrollToTextParams;
  send_keys: SendKeysParams;
  get_dropdown_options: GetDropdownOptionsParams;
  select_dropdown_option: SelectDropdownOptionParams;
  wait: WaitParams;
  add_liquidity: AddLiquidityParams;
  remove_liquidity: RemoveLiquidityParams;
  interact_with_contract: InteractWithContractParams;
  sign_message: SignMessageParams;
  sign_typed_data: SignTypedDataParams;

  get_nfts: GetNFTsParams;
  get_transaction_history: GetTransactionHistoryParams;
  get_gas_price: GetGasPriceParams;
  estimate_gas: EstimateGasParams;
}

// Type-safe action execution
export type ActionName = keyof ActionParamsMap;

export interface TypedAction<T extends ActionName> {
  name: T;
  params: ActionParamsMap[T];
  options?: {
    timeout?: number;
    retryCount?: number;
    retryDelay?: number;
    validateResult?: boolean;
  };
}

// Helper functions for type-safe action creation
export function createAction<T extends ActionName>(
  name: T,
  params: ActionParamsMap[T],
  options?: TypedAction<T>['options']
): TypedAction<T> {
  return { name, params, options };
}

// Runtime validation helpers (keeping some Zod for critical validation)
import { z } from 'zod';

// Keep essential Zod schemas for runtime validation
export const essentialValidationSchemas = {
  // Critical validations that need runtime checking
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  url: z.string().url('Invalid URL'),
  positiveNumber: z.number().positive('Must be positive'),
  nonEmptyString: z.string().min(1, 'Cannot be empty'),

  // Web3 specific validations
  transactionHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash'),
  chainId: z.number().int().positive('Invalid chain ID'),
  tokenAmount: z.string().regex(/^\d*\.?\d+$/, 'Invalid token amount'),
};

// Validation functions
export function validateAddress(address: string): boolean {
  try {
    essentialValidationSchemas.address.parse(address);
    return true;
  } catch {
    return false;
  }
}

export function validateUrl(url: string): boolean {
  try {
    essentialValidationSchemas.url.parse(url);
    return true;
  } catch {
    return false;
  }
}

export function validateParams<T extends ActionName>(
  actionName: T,
  params: ActionParamsMap[T]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Action-specific validations
  switch (actionName) {


    case 'go_to_url': {
      const navParams = params as GoToUrlParams;
      if (!validateUrl(navParams.url)) {
        errors.push('Invalid URL');
      }
      break;
    }


  }

  return { valid: errors.length === 0, errors };
}

// Type guards
export function isWeb3Action(actionName: ActionName): boolean {
  const web3Actions: ActionName[] = [
    'add_liquidity',
    'remove_liquidity',
    'interact_with_contract',
    'sign_message',
    'sign_typed_data',
    'get_nfts',
    'get_transaction_history',
    'get_gas_price',
    'estimate_gas',
  ];

  return web3Actions.includes(actionName);
}

export function isNavigationAction(actionName: ActionName): boolean {
  const navActions: ActionName[] = [
    'search_google',
    'go_to_url',
    'go_back',
    'click_element',
    'input_text',
    'scroll_to_percent',
    'scroll_to_top',
    'scroll_to_bottom',
    'scroll_to_text',
  ];

  return navActions.includes(actionName);
}

export function isTabAction(actionName: ActionName): boolean {
  const tabActions: ActionName[] = ['switch_tab', 'open_tab', 'close_tab'];

  return tabActions.includes(actionName);
}
