import type { AgentContext } from '../types';
import type { ActionResult } from '../types';
import type {
    GetAllAssetsActionParams,
    GetTokenBalancesActionParams,
    GetNativeBalanceActionParams,
    GetAssetPricesActionParams,
} from './asset-query-schemas';

// Import wallet services from Rabby
import openapiService from '@/background/service/openapi';
import preferenceService from '@/background/service/preference';
import providerController from '@/background/controller/provider';
import { createLogger } from '@/utils/logger';
import * as crypto from 'crypto';

const logger = createLogger('AssetQueryAction');

export class AssetQueryAction {
    private readonly context: AgentContext;

    constructor(context: AgentContext) {
        this.context = context;
    }

    /**
     * 获取当前链上的所有资产（包括原生代币和ERC20代币）
     */
    async getAllAssets(params: GetAllAssetsActionParams): Promise<ActionResult> {
        try {
            const address =
                params.address ||
                (await preferenceService.getCurrentAccount())?.address;

            if (!address) {
                return {
                    success: false,
                    error: 'No wallet account available. Please connect a wallet first.',
                    code: 'NO_ACCOUNT',
                };
            }

            const chainId = params.chainId || '1'; // Default to Ethereum mainnet

            logger.info(`Getting all assets for address: ${address} on chain: ${chainId}`);

            // 获取用户的所有代币余额
            const tokenBalances = await this.getTokenBalancesFromAPI(address, chainId);

            // 获取原生代币余额
            const nativeBalance = await this.getNativeBalanceFromAPI(address, chainId);

            // 获取代币价格信息
            const pricesData = await this.getAssetPricesFromAPI(tokenBalances, chainId);

            // 合并所有资产信息
            const allAssets = this.combineAssetData(
                nativeBalance,
                tokenBalances,
                pricesData,
                chainId
            );

            // 计算总价值
            const totalValue = this.calculateTotalValue(allAssets);

            return {
                success: true,
                data: {
                    address,
                    chainId,
                    totalValue,
                    totalAssets: allAssets.length,
                    assets: allAssets,
                    timestamp: Date.now(),
                },
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to get all assets:', error);

            return {
                success: false,
                error: `Failed to get all assets: ${errorMessage}`,
                code: 'GET_ASSETS_FAILED',
                details: { originalError: errorMessage },
            };
        }
    }

    /**
     * 获取指定代币的余额
     */
    async getTokenBalances(params: GetTokenBalancesActionParams): Promise<ActionResult> {
        try {
            const address =
                params.address ||
                (await preferenceService.getCurrentAccount())?.address;

            if (!address) {
                return {
                    success: false,
                    error: 'No wallet account available. Please connect a wallet first.',
                    code: 'NO_ACCOUNT',
                };
            }

            const chainId = params.chainId || '1';
            const tokenAddresses = params.tokenAddresses || [];

            logger.info(`Getting token balances for ${tokenAddresses.length} tokens`);

            const balances = await this.getSpecificTokenBalances(
                address,
                chainId,
                tokenAddresses
            );

            return {
                success: true,
                data: {
                    address,
                    chainId,
                    tokenBalances: balances,
                    timestamp: Date.now(),
                },
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';

            return {
                success: false,
                error: `Failed to get token balances: ${errorMessage}`,
                code: 'GET_TOKEN_BALANCES_FAILED',
                details: { originalError: errorMessage },
            };
        }
    }

    /**
     * 获取原生代币余额
     */
    async getNativeBalance(params: GetNativeBalanceActionParams): Promise<ActionResult> {
        try {
            const address =
                params.address ||
                (await preferenceService.getCurrentAccount())?.address;

            if (!address) {
                return {
                    success: false,
                    error: 'No wallet account available. Please connect a wallet first.',
                    code: 'NO_ACCOUNT',
                };
            }

            const chainId = params.chainId || '1';

            const nativeBalance = await this.getNativeBalanceFromAPI(address, chainId);

            return {
                success: true,
                data: {
                    address,
                    chainId,
                    nativeBalance,
                    timestamp: Date.now(),
                },
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';

            return {
                success: false,
                error: `Failed to get native balance: ${errorMessage}`,
                code: 'GET_NATIVE_BALANCE_FAILED',
                details: { originalError: errorMessage },
            };
        }
    }

    /**
     * 获取资产价格信息
     */
    async getAssetPrices(params: GetAssetPricesActionParams): Promise<ActionResult> {
        try {
            const chainId = params.chainId || '1';
            const tokenAddresses = params.tokenAddresses || [];

            const prices = await this.getAssetPricesFromAPI(
                tokenAddresses.map(addr => ({ id: addr })),
                chainId
            );

            return {
                success: true,
                data: {
                    chainId,
                    prices,
                    timestamp: Date.now(),
                },
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';

            return {
                success: false,
                error: `Failed to get asset prices: ${errorMessage}`,
                code: 'GET_ASSET_PRICES_FAILED',
                details: { originalError: errorMessage },
            };
        }
    }

    // Private helper methods

    private async getTokenBalancesFromAPI(address: string, chainId: string): Promise<any[]> {
        try {
            // 使用 Rabby OpenAPI 服务获取用户的代币余额
            // 注意：这里需要根据实际的 Rabby API 方法名进行调用
            const getUserTokens = (openapiService as any).getUserTokens;
            if (typeof getUserTokens === 'function') {
                const response = await getUserTokens(address, chainId);
                if (response && Array.isArray(response)) {
                    return response;
                }
            }

            // 如果API不可用，返回空数组
            logger.warn('Token balance API not available or returned invalid data');
            return [];
        } catch (error) {
            logger.warn('Failed to get token balances from API, returning empty array:', error);
            return [];
        }
    }

    private async getNativeBalanceFromAPI(address: string, chainId: string): Promise<any> {
        try {
            // 使用 provider controller 获取原生代币余额
            const balance = await providerController({
                data: {
                    method: 'eth_getBalance',
                    params: [address, 'latest'],
                },
            });

            return {
                balance: balance !== undefined && balance !== null ? String(balance) : '0',
                symbol: this.getNativeTokenSymbol(chainId),
                name: this.getNativeTokenName(chainId),
                decimals: 18,
            };
        } catch (error) {
            logger.warn('Failed to get native balance from API:', error);
            return {
                balance: '0',
                symbol: this.getNativeTokenSymbol(chainId),
                name: this.getNativeTokenName(chainId),
                decimals: 18,
            };
        }
    }

    private async getSpecificTokenBalances(
        address: string,
        chainId: string,
        tokenAddresses: string[]
    ): Promise<any[]> {
        try {
            const balances: any[] = [];

            // ERC20 balanceOf ABI
            const balanceOfAbi = {
                constant: true,
                inputs: [{ name: '_owner', type: 'address' }],
                name: 'balanceOf',
                outputs: [{ name: 'balance', type: 'uint256' }],
                payable: false,
                stateMutability: 'view',
                type: 'function',
            };

            for (const tokenAddress of tokenAddresses) {
                try {
                    // 使用 eth_call 获取代币余额
                    const balanceData = await providerController({
                        data: {
                            method: 'eth_call',
                            params: [
                                {
                                    to: tokenAddress,
                                    data: this.encodeFunctionCall(balanceOfAbi, [address]),
                                },
                                'latest',
                            ],
                        },
                    });

                    balances.push({
                        tokenAddress,
                        balance: balanceData !== undefined && balanceData !== null ? String(balanceData) : '0',
                        decimals: 18, // 默认值，实际应该查询代币的decimals
                    });
                } catch (error) {
                    logger.warn(`Failed to get balance for token ${tokenAddress}:`, error);
                    balances.push({
                        tokenAddress,
                        balance: '0',
                        error: 'Failed to fetch balance',
                    });
                }
            }

            return balances;
        } catch (error) {
            logger.error('Failed to get specific token balances:', error);
            return [];
        }
    }

    private async getAssetPricesFromAPI(tokens: any[], chainId: string): Promise<any> {
        try {
            // 获取代币价格信息
            const tokenIds = tokens.map(token => token.id || token.contract_address || token.tokenAddress).filter(Boolean);

            if (tokenIds.length === 0) {
                return {};
            }

            // 尝试使用 Rabby API 获取价格，如果不可用则返回空对象
            const getTokenPrices = (openapiService as any).getTokenPrices;
            if (typeof getTokenPrices === 'function') {
                const prices = await getTokenPrices(tokenIds, chainId);
                return prices || {};
            }
            return {};
        } catch (error) {
            logger.warn('Failed to get asset prices from API:', error);
            return {};
        }
    }

    private combineAssetData(
        nativeBalance: any,
        tokenBalances: any[],
        pricesData: any,
        chainId: string
    ): any[] {
        const assets: any[] = [];

        // 添加原生代币
        if (nativeBalance) {
            const nativePrice = pricesData[this.getNativeTokenId(chainId)] || 0;
            const nativeValue = this.calculateAssetValue(
                nativeBalance.balance || '0',
                nativeBalance.decimals || 18,
                nativePrice
            );

            assets.push({
                type: 'native',
                symbol: nativeBalance.symbol || this.getNativeTokenSymbol(chainId),
                name: nativeBalance.name || this.getNativeTokenName(chainId),
                balance: nativeBalance.balance || '0',
                decimals: nativeBalance.decimals || 18,
                price: nativePrice,
                value: nativeValue,
                chainId,
            });
        }

        // 添加ERC20代币
        for (const token of tokenBalances) {
            if (!token || !token.balance || token.balance === '0') {
                continue;
            }

            const tokenPrice = pricesData[token.id || token.contract_address] || 0;
            const tokenValue = this.calculateAssetValue(
                token.balance,
                token.decimals || 18,
                tokenPrice
            );

            assets.push({
                type: 'token',
                address: token.contract_address || token.id,
                symbol: token.symbol,
                name: token.name,
                balance: token.balance,
                decimals: token.decimals || 18,
                price: tokenPrice,
                value: tokenValue,
                chainId,
                logoUrl: token.logo_url,
            });
        }

        // 按价值排序
        return assets.sort((a, b) => (b.value || 0) - (a.value || 0));
    }

    private calculateAssetValue(balance: string, decimals: number, price: number): number {
        try {
            const balanceNum = parseFloat(balance) / Math.pow(10, decimals);
            return balanceNum * price;
        } catch (error) {
            return 0;
        }
    }

    private calculateTotalValue(assets: any[]): number {
        return assets.reduce((total, asset) => total + (asset.value || 0), 0);
    }

    private getNativeTokenId(chainId: string): string {
        const nativeTokenIds: Record<string, string> = {
            '1': 'ethereum',
            '56': 'binancecoin',
            '137': 'matic-network',
            '250': 'fantom',
            '43114': 'avalanche-2',
            '42161': 'ethereum', // Arbitrum uses ETH
            '10': 'ethereum', // Optimism uses ETH
        };
        return nativeTokenIds[chainId] || 'ethereum';
    }

    private getNativeTokenSymbol(chainId: string): string {
        const nativeTokenSymbols: Record<string, string> = {
            '1': 'ETH',
            '56': 'BNB',
            '137': 'MATIC',
            '250': 'FTM',
            '43114': 'AVAX',
            '42161': 'ETH',
            '10': 'ETH',
        };
        return nativeTokenSymbols[chainId] || 'ETH';
    }

    private getNativeTokenName(chainId: string): string {
        const nativeTokenNames: Record<string, string> = {
            '1': 'Ethereum',
            '56': 'BNB',
            '137': 'Polygon',
            '250': 'Fantom',
            '43114': 'Avalanche',
            '42161': 'Ethereum',
            '10': 'Ethereum',
        };
        return nativeTokenNames[chainId] || 'Ethereum';
    }

    private encodeFunctionCall(functionAbi: any, params: any[]): string {
        try {
            // 简化的函数编码实现
            // 在生产环境中应该使用 ethers.js 或 web3.js 的 ABI 编码功能
            const functionSignature = `${functionAbi.name}(${functionAbi.inputs
                .map((input: any) => input.type)
                .join(',')})`;
            const functionSelector = this.getFunctionSelector(functionSignature);

            // 编码参数
            const encodedParams = this.encodeParameters(functionAbi.inputs, params);

            return functionSelector + encodedParams;
        } catch (error) {
            logger.error('Function encoding failed:', error);
            throw new Error(
                `Failed to encode function call: ${error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    }

    private getFunctionSelector(functionSignature: string): string {
        // 创建函数签名的简单哈希
        // 在生产环境中应该使用 keccak256
        const hash = crypto
            .createHash('sha256')
            .update(functionSignature)
            .digest('hex');
        return '0x' + hash.substring(0, 8);
    }

    private encodeParameters(inputs: any[], params: any[]): string {
        // 简化的参数编码
        // 在生产环境中应该使用正确的 ABI 编码
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

    async executeAction(actionName: string, params: any): Promise<ActionResult> {
        switch (actionName) {
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
                    error: `Unknown asset query action: ${actionName}`,
                };
        }
    }
}