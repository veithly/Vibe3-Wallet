// User confirmation management system for transaction approval
import { ActionPlan, ActionStep } from '../planning/ActionPlanner';
import { SimulationResult } from '../simulation/TransactionSimulator';
import type { AgentContext } from '../types';

export interface ConfirmationRequest {
  id: string;
  plan: ActionPlan;
  simulation?: SimulationResult;
  timestamp: number;
  expiresAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export interface ConfirmationOptions {
  method: 'NONE' | 'BIOMETRIC' | 'PASSWORD' | 'TWO_FACTOR';
  timeoutMs: number;
  autoApproveLowRisk: boolean;
  requireExplicitHighRisk: boolean;
  riskThresholds: {
    lowRisk: number;
    mediumRisk: number;
    highRisk: number;
  };
}

export interface BiometricAuth {
  authenticate(): Promise<boolean>;
  isAvailable(): boolean;
}

export interface UIController {
  showConfirmation(request: ConfirmationRequest): Promise<boolean>;
  showDetailedConfirmation(data: DetailedConfirmationData): Promise<boolean>;
  showError(message: string): void;
  showSuccess(message: string): void;
}

export interface DetailedConfirmationData {
  plan: ActionPlan;
  simulation?: SimulationResult;
  riskFactors: RiskFactor[];
  summary: ConfirmationSummary;
  breakdown: ActionBreakdown[];
}

export interface RiskFactor {
  type: 'CONTRACT' | 'SLIPPAGE' | 'LIQUIDITY' | 'MARKET' | 'TIME' | 'NETWORK';
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  impact: string;
  mitigation?: string;
}

export interface ConfirmationSummary {
  totalCost: string;
  totalGas: string;
  totalTime: number;
  successRate: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  mainAction: string;
  tokenChanges: TokenChange[];
}

export interface TokenChange {
  token: string;
  amount: string;
  change: 'IN' | 'OUT';
  chain: number;
}

export interface ActionBreakdown {
  step: number;
  action: ActionStep;
  description: string;
  cost: string;
  time: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  dependencies: string[];
}

export class ConfirmationManager {
  private context: AgentContext;
  private options: ConfirmationOptions;
  private biometricAuth: BiometricAuth;
  private uiController: UIController;
  private pendingConfirmations: Map<string, ConfirmationRequest> = new Map();

  constructor(
    context: AgentContext,
    options?: Partial<ConfirmationOptions>,
    biometricAuth?: BiometricAuth,
    uiController?: UIController
  ) {
    this.context = context;
    this.options = {
      method: 'BIOMETRIC',
      timeoutMs: 300000, // 5 minutes
      autoApproveLowRisk: true,
      requireExplicitHighRisk: true,
      riskThresholds: {
        lowRisk: 0.3,
        mediumRisk: 0.7,
        highRisk: 1.0,
      },
      ...options,
    };

    this.biometricAuth = biometricAuth || new DefaultBiometricAuth();
    this.uiController = uiController || new DefaultUIController();

    // Start cleanup timer
    this.startCleanupTimer();
  }

  async requestConfirmation(
    plan: ActionPlan,
    simulation?: SimulationResult
  ): Promise<boolean> {
    try {
      // Check if auto-approval is possible
      if (await this.shouldAutoApprove(plan, simulation)) {
        return true;
      }

      // Determine confirmation method
      const method = await this.determineConfirmationMethod(plan, simulation);

      // Create confirmation request
      const request: ConfirmationRequest = {
        id: `conf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        plan,
        simulation,
        timestamp: Date.now(),
        expiresAt: Date.now() + this.options.timeoutMs,
        status: 'pending',
      };

      // Store request
      this.pendingConfirmations.set(request.id, request);

      // Request user confirmation
      const approved = await this.executeConfirmation(request, method);

      // Update request status
      request.status = approved ? 'approved' : 'rejected';
      this.pendingConfirmations.set(request.id, request);

      // Clean up expired requests
      this.cleanupExpiredRequests();

      return approved;
    } catch (error) {
      console.error('Error in confirmation process:', error);
      return false;
    }
  }

  private async shouldAutoApprove(
    plan: ActionPlan,
    simulation?: SimulationResult
  ): Promise<boolean> {
    if (!this.options.autoApproveLowRisk) {
      return false;
    }

    // Check if all actions are low risk
    const allLowRisk = plan.actions.every(
      (action) => action.riskLevel === 'LOW'
    );

    // Check if simulation shows low risk
    const simulationLowRisk = simulation?.riskLevel === 'LOW';

    // Check if total cost is below threshold
    const totalCost = this.calculateTotalCost(plan);
    const lowCost = BigInt(totalCost) < BigInt('1000000000000000000'); // 1 ETH

    return allLowRisk && simulationLowRisk && lowCost;
  }

  private async determineConfirmationMethod(
    plan: ActionPlan,
    simulation?: SimulationResult
  ): Promise<'NONE' | 'BIOMETRIC' | 'PASSWORD' | 'TWO_FACTOR'> {
    const riskLevel = this.calculateOverallRiskLevel(plan, simulation);

    if (riskLevel === 'LOW') {
      return 'NONE';
    }

    if (riskLevel === 'MEDIUM') {
      // Use biometric if available, otherwise password
      if (this.biometricAuth.isAvailable()) {
        return 'BIOMETRIC';
      }
      return 'PASSWORD';
    }

    // High risk - use strongest available method
    if (this.biometricAuth.isAvailable()) {
      return 'BIOMETRIC';
    }
    return 'PASSWORD';
  }

  private async executeConfirmation(
    request: ConfirmationRequest,
    method: string
  ): Promise<boolean> {
    switch (method) {
      case 'NONE':
        return true;

      case 'BIOMETRIC':
        return await this.executeBiometricConfirmation(request);

      case 'PASSWORD':
        return await this.executePasswordConfirmation(request);

      case 'TWO_FACTOR':
        return await this.executeTwoFactorConfirmation(request);

      default:
        return false;
    }
  }

  private async executeBiometricConfirmation(
    request: ConfirmationRequest
  ): Promise<boolean> {
    // First show basic confirmation
    const basicApproved = await this.uiController.showConfirmation(request);
    if (!basicApproved) {
      return false;
    }

    // Then require biometric authentication
    const biometricApproved = await this.biometricAuth.authenticate();
    if (!biometricApproved) {
      this.uiController.showError('Biometric authentication failed');
      return false;
    }

    return true;
  }

  private async executePasswordConfirmation(
    request: ConfirmationRequest
  ): Promise<boolean> {
    // Show detailed confirmation with password input
    const detailedData = await this.createDetailedConfirmationData(request);
    return await this.uiController.showDetailedConfirmation(detailedData);
  }

  private async executeTwoFactorConfirmation(
    request: ConfirmationRequest
  ): Promise<boolean> {
    // Show detailed confirmation
    const detailedData = await this.createDetailedConfirmationData(request);
    const approved = await this.uiController.showDetailedConfirmation(
      detailedData
    );

    if (!approved) {
      return false;
    }

    // TODO: Implement 2FA verification
    return true;
  }

  private async createDetailedConfirmationData(
    request: ConfirmationRequest
  ): Promise<DetailedConfirmationData> {
    const { plan, simulation } = request;

    const summary = this.createConfirmationSummary(plan, simulation);
    const breakdown = this.createActionBreakdown(plan);
    const riskFactors = this.createRiskFactors(plan, simulation);

    return {
      plan,
      simulation,
      riskFactors,
      summary,
      breakdown,
    };
  }

  private createConfirmationSummary(
    plan: ActionPlan,
    simulation?: SimulationResult
  ): ConfirmationSummary {
    const totalCost = this.calculateTotalCost(plan);
    const totalGas = simulation?.totalGas || plan.estimatedTotalGas;
    const totalTime = simulation?.totalTime || plan.estimatedTotalTime;
    const successRate = simulation?.successRate || 0.9;
    const riskLevel = simulation?.riskLevel || plan.riskLevel;
    const mainAction = this.getMainActionDescription(plan);
    const tokenChanges = this.getTokenChanges(plan);

    return {
      totalCost,
      totalGas,
      totalTime,
      successRate,
      riskLevel,
      mainAction,
      tokenChanges,
    };
  }

  private createActionBreakdown(plan: ActionPlan): ActionBreakdown[] {
    return plan.actions.map((action, index) => ({
      step: index + 1,
      action,
      description: action.description,
      cost: this.calculateActionCost(action),
      time: action.estimatedTime || 30,
      risk: action.riskLevel,
      dependencies: action.dependencies,
    }));
  }

  private createRiskFactors(
    plan: ActionPlan,
    simulation?: SimulationResult
  ): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // Add simulation risks if available
    if (simulation) {
      for (const risk of simulation.risks) {
        factors.push({
          type: this.mapRiskType(risk.type),
          level: risk.level,
          description: risk.description,
          impact: risk.impact,
          mitigation: risk.mitigation,
        });
      }
    }

    // Add plan-specific risks
    for (const action of plan.actions) {
      if (action.riskLevel === 'HIGH') {
        factors.push({
          type: 'CONTRACT',
          level: 'HIGH',
          description: `High-risk action: ${action.description}`,
          impact: 'SECURITY',
        });
      }
    }

    return factors;
  }

  private calculateTotalCost(plan: ActionPlan): string {
    // This is a simplified calculation
    return plan.estimatedTotalGas;
  }

  private calculateActionCost(action: ActionStep): string {
    return action.estimatedGas || '0';
  }

  private calculateOverallRiskLevel(
    plan: ActionPlan,
    simulation?: SimulationResult
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (simulation) {
      return simulation.riskLevel;
    }
    return plan.riskLevel;
  }

  private getMainActionDescription(plan: ActionPlan): string {
    const mainAction = plan.actions[0];
    if (!mainAction) return 'Execute plan';

    const actionDescriptions: Record<string, string> = {
    };

    return actionDescriptions[mainAction.type] || 'Execute action';
  }

  private getTokenChanges(plan: ActionPlan): TokenChange[] {
    const changes: TokenChange[] = [];

    for (const action of plan.actions) {

    }

    return changes;
  }

  private mapRiskType(type: string): RiskFactor['type'] {
    const typeMap: Record<string, RiskFactor['type']> = {
      CONTRACT_RISK: 'CONTRACT',
      SLIPPAGE_RISK: 'SLIPPAGE',
      LIQUIDITY_RISK: 'LIQUIDITY',
      MARKET_RISK: 'MARKET',
      TIME_RISK: 'TIME',
    };

    return typeMap[type] || 'CONTRACT';
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupExpiredRequests();
    }, 60000); // Clean up every minute
  }

  private cleanupExpiredRequests(): void {
    const now = Date.now();

    for (const [id, request] of this.pendingConfirmations) {
      if (now > request.expiresAt) {
        request.status = 'expired';
        this.pendingConfirmations.delete(id);
      }
    }
  }

  // Public methods
  async getPendingConfirmations(): Promise<ConfirmationRequest[]> {
    return Array.from(this.pendingConfirmations.values()).filter(
      (req) => req.status === 'pending'
    );
  }

  async getConfirmationHistory(): Promise<ConfirmationRequest[]> {
    return Array.from(this.pendingConfirmations.values());
  }

  async cancelConfirmation(requestId: string): Promise<boolean> {
    const request = this.pendingConfirmations.get(requestId);
    if (request && request.status === 'pending') {
      request.status = 'rejected';
      this.pendingConfirmations.delete(requestId);
      return true;
    }
    return false;
  }

  async updateOptions(newOptions: Partial<ConfirmationOptions>): Promise<void> {
    this.options = { ...this.options, ...newOptions };
  }
}

// Default implementations
class DefaultBiometricAuth implements BiometricAuth {
  async authenticate(): Promise<boolean> {
    // In a real implementation, this would use the browser's WebAuthn API
    // or native biometric APIs
    console.log('Biometric authentication requested');
    return true; // Mock successful authentication
  }

  isAvailable(): boolean {
    // Check if biometric authentication is available
    return 'credentials' in navigator;
  }
}

class DefaultUIController implements UIController {
  async showConfirmation(request: ConfirmationRequest): Promise<boolean> {
    // In a real implementation, this would show a browser popup or extension UI
    const message =
      `Confirm action: ${request.plan.intent.action}\n` +
      `Total actions: ${request.plan.actions.length}\n` +
      `Risk level: ${request.plan.riskLevel}`;

    // For now, return true to simulate user approval
    console.log('Confirmation request:', message);
    return true;
  }

  async showDetailedConfirmation(
    data: DetailedConfirmationData
  ): Promise<boolean> {
    // In a real implementation, this would show a detailed confirmation UI
    const message =
      `Detailed confirmation for: ${data.summary.mainAction}\n` +
      `Total cost: ${data.summary.totalCost}\n` +
      `Risk level: ${data.summary.riskLevel}\n` +
      `Success rate: ${Math.round(data.summary.successRate * 100)}%`;

    console.log('Detailed confirmation request:', message);
    return true; // Mock user approval
  }

  showError(message: string): void {
    console.error('Confirmation error:', message);
    // In a real implementation, this would show an error notification
  }

  showSuccess(message: string): void {
    console.log('Confirmation success:', message);
    // In a real implementation, this would show a success notification
  }
}
