// Action planning system for mapping Web3 intents to executable action sequences
import {
  Web3Intent,
  Web3ActionType,
  Web3Entities,
  Web3Constraints,
} from '../intent/IntentRecognizer';
import type { AgentContext } from '../types';

export interface ActionStep {
  id: string;
  name: string;
  type: string;
  protocol?: string;
  params: Record<string, any>;
  description: string;
  dependencies: string[];
  estimatedGas?: string;
  estimatedTime?: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: any;
}

export interface ActionPlan {
  id: string;
  intent: Web3Intent;
  actions: ActionStep[];
  estimatedTotalGas: string;
  estimatedTotalTime: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  requiresConfirmation: boolean;
  fallbackOptions?: ActionPlan[];
}

export interface SwapPath {
  fromToken: string;
  toToken: string;
  amount: string;
  fromChain: number;
  toChain: number;
  protocol: string;
  estimatedGas: string;
  estimatedTime: number;
  outputAmount: string;
  priceImpact: number;
  slippage: number;
  needsBridge: boolean;
  bridgeProtocol?: string;
  bridgeToken?: string;
  bridgeAmount?: string;
}

export interface StakeOptions {
  protocol: string;
  poolId: string;
  rewardTokens: string[];
  apr: number;
  lockPeriod?: number;
  unstakePeriod: number;
  estimatedGas: string;
}

export class ActionPlanner {
  private context: AgentContext;
  private aggregatorIntegrator: AggregatorIntegrator;

  constructor(context: AgentContext) {
    this.context = context;
    this.aggregatorIntegrator = new AggregatorIntegrator(context);
  }

  async createPlan(intent: Web3Intent): Promise<ActionPlan> {
    switch (intent.action) {
      case 'SWAP':
        return await this.planSwap(intent);
      case 'BRIDGE':
        return await this.planBridge(intent);
      case 'STAKE':
        return await this.planStake(intent);
      case 'UNSTAKE':
        return await this.planUnstake(intent);
      case 'SEND':
        return await this.planSend(intent);
      case 'APPROVE':
        return await this.planApprove(intent);
      case 'ADD_LIQUIDITY':
        return await this.planAddLiquidity(intent);
      case 'REMOVE_LIQUIDITY':
        return await this.planRemoveLiquidity(intent);
      case 'QUERY':
        return await this.planQuery(intent);
      case 'CONNECT_WALLET':
        return await this.planConnectWallet(intent);
      case 'SWITCH_NETWORK':
        return await this.planSwitchNetwork(intent);
      default:
        throw new Error(`Unsupported action type: ${intent.action}`);
    }
  }

  private async planSwap(intent: Web3Intent): Promise<ActionPlan> {
    const { entities, chains, constraints } = intent;

    // Get best swap path from aggregators
    const swapPath = await this.aggregatorIntegrator.getBestSwapPath({
      fromToken: entities.fromToken!,
      toToken: entities.toToken!,
      amount: entities.amount!,
      fromChain: chains[0] || 1,
      toChain: chains[1] || chains[0] || 1,
      slippage: constraints.slippage || 0.5,
      preference: constraints.preference || 'BEST_RATE',
    });

    const actions: ActionStep[] = [];
    let totalGas = '0';
    let totalTime = 0;

    // Check if approval is needed
    const approvalNeeded = await this.checkApprovalNeeded(
      entities.fromToken!,
      swapPath.protocol,
      entities.amount!,
      chains[0] || 1
    );

    if (approvalNeeded) {
      actions.push({
        id: 'approve-1',
        name: 'Approve Token',
        type: 'approveToken',
        status: 'pending',
        protocol: swapPath.protocol,
        params: {
          tokenAddress: entities.fromToken!,
          spender: this.getProtocolAddress(swapPath.protocol, chains[0] || 1),
          amount: entities.amount!,
          chainId: chains[0] || 1,
          intent: intent.rawInstruction,
        },
        description: `Approve ${entities.amount} ${entities.fromToken} for ${swapPath.protocol}`,
        dependencies: [],
        estimatedGas: '50000',
        estimatedTime: 30,
        riskLevel: 'LOW',
      });
      totalGas = this.addGas(totalGas, '50000');
      totalTime += 30;
    }

    // Execute swap
    if (swapPath.needsBridge) {
      // Multi-step swap with bridge
      actions.push({
        id: 'swap-1',
        name: 'Swap Tokens',
        type: 'swapTokens',
        status: 'pending',
        protocol: swapPath.protocol,
        params: {
          fromToken: entities.fromToken!,
          toToken: swapPath.bridgeToken!,
          amount: entities.amount!,
          recipient: entities.recipient || (await this.getCurrentAddress()),
          slippage: constraints.slippage || 0.5,
          chainId: chains[0] || 1,
          intent: intent.rawInstruction,
        },
        description: `Swap ${entities.amount} ${entities.fromToken} to ${
          swapPath.bridgeToken
        } on chain ${chains[0] || 1}`,
        dependencies: approvalNeeded ? ['approve-1'] : [],
        estimatedGas: swapPath.estimatedGas,
        estimatedTime: swapPath.estimatedTime,
        riskLevel: this.calculateRiskLevel(swapPath.priceImpact),
      });

      actions.push({
        id: 'bridge-1',
        name: 'Bridge Tokens',
        type: 'bridgeTokens',
        status: 'pending',
        protocol: swapPath.bridgeProtocol!,
        params: {
          tokenAddress: swapPath.bridgeToken!,
          amount: swapPath.bridgeAmount!,
          fromChainId: chains[0] || 1,
          toChainId: chains[1] || 1,
          recipient: entities.recipient || (await this.getCurrentAddress()),
          intent: intent.rawInstruction,
        },
        description: `Bridge ${swapPath.bridgeAmount} ${
          swapPath.bridgeToken
        } from chain ${chains[0] || 1} to ${chains[1] || 1}`,
        dependencies: ['swap-1'],
        estimatedGas: '150000',
        estimatedTime: 300,
        riskLevel: 'MEDIUM',
      });

      actions.push({
        id: 'swap-2',
        name: 'Swap Tokens',
        type: 'swapTokens',
        status: 'pending',
        protocol: swapPath.protocol,
        params: {
          fromToken: swapPath.bridgeToken!,
          toToken: entities.toToken!,
          amount: swapPath.amount,
          recipient: entities.recipient || (await this.getCurrentAddress()),
          slippage: constraints.slippage || 0.5,
          chainId: chains[1] || 1,
          intent: intent.rawInstruction,
        },
        description: `Swap ${swapPath.bridgeAmount} ${
          swapPath.bridgeToken
        } to ${entities.toToken} on chain ${chains[1] || 1}`,
        dependencies: ['bridge-1'],
        estimatedGas: swapPath.estimatedGas,
        estimatedTime: swapPath.estimatedTime,
        riskLevel: this.calculateRiskLevel(swapPath.priceImpact),
      });

      totalGas = this.addGas(
        totalGas,
        this.addGas(
          swapPath.estimatedGas,
          this.addGas('150000', swapPath.estimatedGas)
        )
      );
      totalTime += swapPath.estimatedTime + 300 + swapPath.estimatedTime;
    } else {
      // Single swap
      actions.push({
        id: 'swap-1',
        name: 'Swap Tokens',
        type: 'swapTokens',
        status: 'pending',
        protocol: swapPath.protocol,
        params: {
          fromToken: entities.fromToken!,
          toToken: entities.toToken!,
          amount: entities.amount!,
          recipient: entities.recipient || (await this.getCurrentAddress()),
          slippage: constraints.slippage || 0.5,
          chainId: chains[0] || 1,
          intent: intent.rawInstruction,
        },
        description: `Swap ${entities.amount} ${entities.fromToken} to ${
          entities.toToken
        } on chain ${chains[0] || 1}`,
        dependencies: approvalNeeded ? ['approve-1'] : [],
        estimatedGas: swapPath.estimatedGas,
        estimatedTime: swapPath.estimatedTime,
        riskLevel: this.calculateRiskLevel(swapPath.priceImpact),
      });

      totalGas = this.addGas(totalGas, swapPath.estimatedGas);
      totalTime += swapPath.estimatedTime;
    }

    return {
      id: `plan-${Date.now()}`,
      intent,
      actions,
      estimatedTotalGas: totalGas,
      estimatedTotalTime: totalTime,
      riskLevel: this.calculateOverallRiskLevel(actions),
      requiresConfirmation: this.requiresConfirmation(actions),
    };
  }

  private async planBridge(intent: Web3Intent): Promise<ActionPlan> {
    const { entities, chains } = intent;

    const actions: ActionStep[] = [];

    // Get bridge options
    const bridgeOptions = await this.aggregatorIntegrator.getBridgeOptions({
      token: entities.tokenAddress!,
      amount: entities.amount!,
      fromChain: entities.chainId || chains[0] || 1,
      toChain: chains[1] || 1,
      recipient: entities.recipient || (await this.getCurrentAddress()),
    });

    const bestOption = bridgeOptions[0]; // Use first option for now

    // Check approval
    const approvalNeeded = await this.checkApprovalNeeded(
      entities.tokenAddress!,
      bestOption.protocol,
      entities.amount!,
      entities.chainId || chains[0] || 1
    );

    if (approvalNeeded) {
      actions.push({
        id: 'approve-1',
        name: 'Approve Token',
        type: 'approveToken',
        status: 'pending',
        protocol: bestOption.protocol,
        params: {
          tokenAddress: entities.tokenAddress!,
          spender: this.getProtocolAddress(
            bestOption.protocol,
            entities.chainId || chains[0] || 1
          ),
          amount: entities.amount!,
          chainId: entities.chainId || chains[0] || 1,
          intent: intent.rawInstruction,
        },
        description: `Approve ${entities.amount} ${entities.tokenAddress} for ${bestOption.protocol}`,
        dependencies: [],
        estimatedGas: '50000',
        estimatedTime: 30,
        riskLevel: 'LOW',
      });
    }

    actions.push({
      id: 'bridge-1',
      name: 'Bridge Tokens',
      type: 'bridgeTokens',
      protocol: bestOption.protocol,
      params: {
        tokenAddress: entities.tokenAddress!,
        amount: entities.amount!,
        fromChainId: entities.chainId || chains[0] || 1,
        toChainId: chains[1] || 1,
        recipient: entities.recipient || (await this.getCurrentAddress()),
        intent: intent.rawInstruction,
      },
      description: `Bridge ${entities.amount} ${
        entities.tokenAddress
      } from chain ${entities.chainId || chains[0] || 1} to ${chains[1] || 1}`,
      dependencies: approvalNeeded ? ['approve-1'] : [],
      estimatedGas: bestOption.estimatedGas,
      estimatedTime: bestOption.estimatedTime,
      riskLevel: 'MEDIUM',
      status: 'pending',
    });

    return {
      id: `plan-${Date.now()}`,
      intent,
      actions,
      estimatedTotalGas: this.addGas(
        approvalNeeded ? '50000' : '0',
        bestOption.estimatedGas
      ),
      estimatedTotalTime: (approvalNeeded ? 30 : 0) + bestOption.estimatedTime,
      riskLevel: 'MEDIUM',
      requiresConfirmation: true,
    };
  }

  private async planStake(intent: Web3Intent): Promise<ActionPlan> {
    const { entities, chains } = intent;

    // Get staking options
    const stakeOptions = await this.aggregatorIntegrator.getStakeOptions({
      token: entities.tokenAddress!,
      amount: entities.amount!,
      chainId: chains[0] || 1,
    });

    const bestOption = stakeOptions[0];

    const actions: ActionStep[] = [];

    // Check approval
    const approvalNeeded = await this.checkApprovalNeeded(
      entities.tokenAddress!,
      bestOption.protocol,
      entities.amount!,
      chains[0] || 1
    );

    if (approvalNeeded) {
      actions.push({
        id: 'approve-1',
        name: 'Approve Token',
        type: 'approveToken',
        status: 'pending',
        protocol: bestOption.protocol,
        params: {
          tokenAddress: entities.tokenAddress!,
          spender: entities.stakingContract!,
          amount: entities.amount!,
          chainId: chains[0] || 1,
          intent: intent.rawInstruction,
        },
        description: `Approve ${entities.amount} ${entities.tokenAddress} for staking`,
        dependencies: [],
        estimatedGas: '50000',
        estimatedTime: 30,
        riskLevel: 'LOW',
      });
    }

    actions.push({
      id: 'stake-1',
      name: 'Stake Tokens',
      type: 'stakeTokens',
      status: 'pending',
      protocol: bestOption.protocol,
      params: {
        tokenAddress: entities.tokenAddress!,
        amount: entities.amount!,
        stakingContract: entities.stakingContract!,
        chainId: chains[0] || 1,
        intent: intent.rawInstruction,
      },
      description: `Stake ${entities.amount} ${entities.tokenAddress} in ${bestOption.protocol}`,
      dependencies: approvalNeeded ? ['approve-1'] : [],
      estimatedGas: bestOption.estimatedGas,
      estimatedTime: 60,
      riskLevel: 'MEDIUM',
    });

    return {
      id: `plan-${Date.now()}`,
      intent,
      actions,
      estimatedTotalGas: this.addGas(
        approvalNeeded ? '50000' : '0',
        bestOption.estimatedGas
      ),
      estimatedTotalTime: (approvalNeeded ? 30 : 0) + 60,
      riskLevel: 'MEDIUM',
      requiresConfirmation: true,
    };
  }

  private async planApprove(intent: Web3Intent): Promise<ActionPlan> {
    const { entities, chains } = intent;

    const actions: ActionStep[] = [
      {
        id: 'approve-1',
        name: 'Approve Token',
        type: 'approveToken',
        params: {
          tokenAddress: entities.tokenAddress!,
          spender: entities.spender!,
          amount:
            entities.amount ||
            '115792089237316195423570985008687907853269984665640564039457584007913129639935', // Max uint256
          chainId: chains[0] || 1,
          intent: intent.rawInstruction,
        },
        description: `Approve ${entities.amount || 'unlimited'} ${
          entities.tokenAddress
        } for ${entities.spender}`,
        dependencies: [],
        estimatedGas: '50000',
        estimatedTime: 30,
        riskLevel: 'LOW',
        status: 'pending',
      },
    ];

    return {
      id: `plan-${Date.now()}`,
      intent,
      actions,
      estimatedTotalGas: '50000',
      estimatedTotalTime: 30,
      riskLevel: 'LOW',
      requiresConfirmation: true,
    };
  }

  private async planSend(intent: Web3Intent): Promise<ActionPlan> {
    const { entities, chains } = intent;

    const actions: ActionStep[] = [
      {
        id: 'send-1',
        name: 'Send Transaction',
        type: 'sendTransaction',
        params: {
          to: entities.recipient!,
          value: entities.amount!,
          data: '0x',
          chainId: chains[0] || 1,
          intent: intent.rawInstruction,
        },
        description: `Send ${entities.amount} ${entities.tokenAddress} to ${entities.recipient}`,
        dependencies: [],
        estimatedGas: '21000',
        estimatedTime: 30,
        riskLevel: 'LOW',
        status: 'pending',
      },
    ];

    return {
      id: `plan-${Date.now()}`,
      intent,
      actions,
      estimatedTotalGas: '21000',
      estimatedTotalTime: 30,
      riskLevel: 'LOW',
      requiresConfirmation: true,
    };
  }

  private async planQuery(intent: Web3Intent): Promise<ActionPlan> {
    const { entities, chains } = intent;

    const actions: ActionStep[] = [
      {
        id: 'query-1',
        name: 'Check Balance',
        type: 'checkBalance',
        params: {
          address: entities.address || (await this.getCurrentAddress()),
          tokenAddress: entities.tokenAddress,
          chainId: chains[0] || 1,
          intent: intent.rawInstruction,
        },
        description: `Check ${entities.tokenAddress || 'native'} token balance`,
        dependencies: [],
        estimatedGas: '0',
        estimatedTime: 10,
        riskLevel: 'LOW',
        status: 'pending',
      },
    ];

    return {
      id: `plan-${Date.now()}`,
      intent,
      actions,
      estimatedTotalGas: '0',
      estimatedTotalTime: 10,
      riskLevel: 'LOW',
      requiresConfirmation: false,
    };
  }

  private async planConnectWallet(intent: Web3Intent): Promise<ActionPlan> {
    const { entities } = intent;

    const actions: ActionStep[] = [
      {
        id: 'connect-1',
        name: 'Connect Wallet',
        type: 'connectWallet',
        params: {
          dappName: entities.dappName!,
          dappUrl: entities.dappUrl!,
          chainId: entities.chainId,
          intent: intent.rawInstruction,
        },
        description: `Connect wallet to ${entities.dappName}`,
        dependencies: [],
        estimatedGas: '0',
        estimatedTime: 15,
        riskLevel: 'LOW',
        status: 'pending',
      },
    ];

    return {
      id: `plan-${Date.now()}`,
      intent,
      actions,
      estimatedTotalGas: '0',
      estimatedTotalTime: 15,
      riskLevel: 'LOW',
      requiresConfirmation: true,
    };
  }

  private async planSwitchNetwork(intent: Web3Intent): Promise<ActionPlan> {
    const { entities } = intent;

    const actions: ActionStep[] = [
      {
        id: 'switch-1',
        name: 'Switch Network',
        type: 'switchNetwork',
        params: {
          chainId: entities.chainId!,
          intent: intent.rawInstruction,
        },
        description: `Switch to network with chain ID ${entities.chainId}`,
        dependencies: [],
        estimatedGas: '0',
        estimatedTime: 10,
        riskLevel: 'LOW',
        status: 'pending',
      },
    ];

    return {
      id: `plan-${Date.now()}`,
      intent,
      actions,
      estimatedTotalGas: '0',
      estimatedTotalTime: 10,
      riskLevel: 'LOW',
      requiresConfirmation: true,
    };
  }

  // Helper methods for other action types
  private async planAddLiquidity(intent: Web3Intent): Promise<ActionPlan> {
    // Implementation for add liquidity
    throw new Error('Add liquidity planning not implemented yet');
  }

  private async planRemoveLiquidity(intent: Web3Intent): Promise<ActionPlan> {
    // Implementation for remove liquidity
    throw new Error('Remove liquidity planning not implemented yet');
  }

  private async planUnstake(intent: Web3Intent): Promise<ActionPlan> {
    // Implementation for unstake
    throw new Error('Unstake planning not implemented yet');
  }

  // Utility methods
  private async checkApprovalNeeded(
    tokenAddress: string,
    protocol: string,
    amount: string,
    chainId: number
  ): Promise<boolean> {
    // Check if token is native (no approval needed)
    if (tokenAddress === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
      return false;
    }

    // TODO: Implement actual approval check
    return true;
  }

  private getProtocolAddress(protocol: string, chainId: number): string {
    // TODO: Implement protocol address mapping
    return '0x0000000000000000000000000000000000000000';
  }

  private async getCurrentAddress(): Promise<string> {
    // TODO: Get current wallet address
    return '0x0000000000000000000000000000000000000000';
  }

  private addGas(gas1: string, gas2: string): string {
    const g1 = BigInt(gas1);
    const g2 = BigInt(gas2);
    return (g1 + g2).toString();
  }

  private calculateRiskLevel(priceImpact: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (priceImpact < 0.5) return 'LOW';
    if (priceImpact < 2.0) return 'MEDIUM';
    return 'HIGH';
  }

  private calculateOverallRiskLevel(
    actions: ActionStep[]
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    const hasHighRisk = actions.some((action) => action.riskLevel === 'HIGH');
    const hasMediumRisk = actions.some(
      (action) => action.riskLevel === 'MEDIUM'
    );

    if (hasHighRisk) return 'HIGH';
    if (hasMediumRisk) return 'MEDIUM';
    return 'LOW';
  }

  private requiresConfirmation(actions: ActionStep[]): boolean {
    return actions.some(
      (action) =>
        action.type !== 'checkBalance' &&
        action.type !== 'query' &&
        action.riskLevel !== 'LOW'
    );
  }
}

// Aggregator integrator interface
class AggregatorIntegrator {
  private context: AgentContext;

  constructor(context: AgentContext) {
    this.context = context;
  }

  async getBestSwapPath(params: {
    fromToken: string;
    toToken: string;
    amount: string;
    fromChain: number;
    toChain: number;
    slippage: number;
    preference: 'FASTEST' | 'CHEAPEST' | 'BEST_RATE';
  }): Promise<SwapPath> {
    // TODO: Implement actual aggregator integration
    return {
      fromToken: params.fromToken,
      toToken: params.toToken,
      amount: params.amount,
      fromChain: params.fromChain,
      toChain: params.toChain,
      protocol: '1inch',
      estimatedGas: '200000',
      estimatedTime: 30,
      outputAmount: '0', // Calculate based on amount and price
      priceImpact: 0.1,
      slippage: params.slippage,
      needsBridge: params.fromChain !== params.toChain,
    };
  }

  async getBridgeOptions(params: {
    token: string;
    amount: string;
    fromChain: number;
    toChain: number;
    recipient: string;
  }): Promise<any[]> {
    // TODO: Implement actual bridge integration
    return [
      {
        protocol: 'Hop',
        estimatedGas: '150000',
        estimatedTime: 300,
      },
    ];
  }

  async getStakeOptions(params: {
    token: string;
    amount: string;
    chainId: number;
  }): Promise<StakeOptions[]> {
    // TODO: Implement actual staking integration
    return [
      {
        protocol: 'Aave',
        poolId: 'aave-v2',
        rewardTokens: ['AAVE'],
        apr: 5.5,
        unstakePeriod: 0,
        estimatedGas: '100000',
      },
    ];
  }
}
