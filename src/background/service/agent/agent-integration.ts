/**
 * Agent Integration for Rabby Wallet
 *
 * PRODUCTION READINESS STATUS: DEVELOPMENT MODE
 *
 * This file provides integration between Rabby wallet and the nanobrowser AI automation system.
 *
 * CURRENT IMPLEMENTATION:
 * - Enhanced mock executor with realistic behavior simulation
 * - Comprehensive error handling and retry logic
 * - Execution history tracking and analytics
 * - Production-ready interface design
 *
 * PRODUCTION TODO:
 * 1. Replace MockAgentExecutor with actual nanobrowser connection
 * 2. Implement real WebSocket/IPC communication with nanobrowser extension
 * 3. Add authentication and secure communication protocols
 * 4. Integrate actual browser automation capabilities
 * 5. Add real session management and persistence
 * 6. Implement comprehensive logging and monitoring
 * 7. Add rate limiting and resource management
 *
 * INTEGRATION REQUIREMENTS:
 * - nanobrowser extension must be installed and running
 * - Communication bridge (WebSocket/Native messaging) setup
 * - Shared session management between extensions
 * - Security validation for cross-extension communication
 *
 * @author Rabby Development Team
 * @version 1.0.0-dev
 */

import { createLogger } from '@/utils/logger';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const logger = createLogger('agent-integration');

// Import nanobrowser types and classes
type AgentEvent = {
  actor: string;
  state: string;
  data: {
    taskId: string;
    step: number;
    maxSteps: number;
    details: string;
  };
  timestamp: number;
  type: string;
};

type EventCallback = (event: AgentEvent) => Promise<void>;

// Browser context interface for nanobrowser integration
interface BrowserContext {
  getActiveTab(): Promise<chrome.tabs.Tab>;
  createTab(url: string): Promise<chrome.tabs.Tab>;
  switchToTab(tabId: number): Promise<void>;
  closeTab(tabId: number): Promise<void>;
  cleanup(): Promise<void>;
}

// Simple browser context implementation
class RabbyBrowserContext implements BrowserContext {
  async getActiveTab(): Promise<chrome.tabs.Tab> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
      throw new Error('No active tab found');
    }
    return tabs[0];
  }

  async createTab(url: string): Promise<chrome.tabs.Tab> {
    return await chrome.tabs.create({ url });
  }

  async switchToTab(tabId: number): Promise<void> {
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, {
      focused: true,
    });
  }

  async closeTab(tabId: number): Promise<void> {
    await chrome.tabs.remove(tabId);
  }

  async cleanup(): Promise<void> {
    // Cleanup any resources if needed
  }
}

// This interface defines the bridge between Rabby and nanobrowser agent systems.
export interface AgentExecutorBridge {
  execute(task: string, tabId: number): Promise<void>;
  cancel(): Promise<void>;
  replay(sessionId: string): Promise<void>;
  getStatus(): {
    isRunning: boolean;
    currentTask?: string;
    currentStep?: number;
  };
  subscribeToEvents(callback: EventCallback): void;
  unsubscribeFromEvents(): void;
  addFollowUpTask(task: string): void;
  cleanup?(): void; // Optional cleanup method for proper resource management
}

/**
 * Enhanced mock implementation of nanobrowser executor
 *
 * TODO: Replace with actual nanobrowser integration for production
 * This implementation provides realistic simulation for development and testing
 */
class MockAgentExecutor {
  private eventSubscribers: EventCallback[] = [];
  private isRunning = false;
  private currentTask: string | null = null;
  private currentStep = 0;
  private taskId: string | null = null;
  private cancelled = false;
  private tabId: number | null = null;
  private executionHistory: Array<{
    taskId: string;
    task: string;
    timestamp: number;
    status: 'completed' | 'failed' | 'cancelled';
  }> = [];

  constructor() {
    logger.info(
      'MockAgentExecutor',
      'Initialized enhanced mock nanobrowser executor (Development Mode)'
    );

    // Load execution history from storage if available
    this.loadExecutionHistory();
  }

  async execute(options: {
    task: string;
    taskId: string;
    tabId: number;
  }): Promise<void> {
    this.isRunning = true;
    this.currentTask = options.task;
    this.taskId = options.taskId;
    this.tabId = options.tabId;
    this.currentStep = 0;
    this.cancelled = false;

    logger.info('MockAgentExecutor', `Executing task: ${options.task}`, {
      taskId: options.taskId,
      tabId: options.tabId,
    });

    try {
      await this.emitEvent('system', 'task.start', 'Task started');

      // Enhanced task analysis with realistic web automation steps
      const steps = this.getTaskSteps(options.task);

      // Simulate realistic processing with variable timing
      for (let i = 0; i < steps.length; i++) {
        if (this.cancelled) {
          await this.recordExecution('cancelled');
          await this.emitEvent(
            'system',
            'task.cancel',
            'Task cancelled by user'
          );
          return;
        }

        this.currentStep = i + 1;
        await this.emitEvent('navigator', 'step.start', steps[i]);

        // Simulate realistic processing time based on step complexity
        const processingTime = this.getStepProcessingTime(steps[i]);
        await new Promise((resolve) => setTimeout(resolve, processingTime));

        if (this.cancelled) {
          await this.recordExecution('cancelled');
          await this.emitEvent(
            'system',
            'task.cancel',
            'Task cancelled by user'
          );
          return;
        }

        // Simulate occasional step failures for realistic testing
        if (this.shouldSimulateStepFailure(steps[i])) {
          await this.emitEvent(
            'navigator',
            'step.fail',
            `${steps[i]} encountered an issue`
          );
          await this.emitEvent(
            'navigator',
            'step.retry',
            `Retrying ${steps[i]}...`
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        await this.emitEvent('navigator', 'step.ok', `${steps[i]} completed`);
      }

      await this.recordExecution('completed');
      await this.emitEvent('system', 'task.ok', 'Task completed successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.recordExecution('failed');
      await this.emitEvent(
        'system',
        'task.fail',
        `Task failed: ${errorMessage}`
      );
      throw error;
    } finally {
      this.cleanup();
    }
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    logger.info('MockAgentExecutor', 'Cancel requested');
  }

  private async createReplaySession(sessionId: string): Promise<void> {
    logger.info(
      'MockAgentExecutor',
      `Creating new replay session: ${sessionId}`
    );

    // Create a synthetic session record for replay
    const syntheticRecord = {
      taskId: sessionId,
      status: 'completed' as const,
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 1000,
      steps: 7,
      error: null,
    };

    // Add to history for future replays
    this.executionHistory.push({
      taskId: syntheticRecord.taskId,
      task: `Synthetic session ${sessionId}`,
      timestamp: syntheticRecord.startTime,
      status: syntheticRecord.status,
    });

    this.isRunning = true;
    this.currentTask = `Replay session ${sessionId}`;
    this.taskId = `replay-${sessionId}`;
    this.cancelled = false;

    try {
      await this.emitEvent('system', 'task.start', 'Synthetic replay started');

      // Basic replay simulation
      const replaySteps = [
        'Creating synthetic session...',
        'Simulating replay execution...',
        'Generating replay events...',
        'Validating synthetic data...',
        'Finalizing replay session...',
      ];

      for (let i = 0; i < replaySteps.length; i++) {
        if (this.cancelled) {
          await this.recordExecution('cancelled');
          await this.emitEvent(
            'system',
            'task.cancel',
            'Synthetic replay cancelled'
          );
          return;
        }

        this.currentStep = i + 1;
        await this.emitEvent('navigator', 'step.start', replaySteps[i]);

        const replayTime = 400 + Math.random() * 600;
        await new Promise((resolve) => setTimeout(resolve, replayTime));

        await this.emitEvent(
          'navigator',
          'step.ok',
          `${replaySteps[i]} completed`
        );
      }

      await this.recordExecution('completed');
      await this.emitEvent('system', 'task.ok', 'Synthetic replay completed');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.recordExecution('failed');
      await this.emitEvent(
        'system',
        'task.fail',
        `Synthetic replay failed: ${errorMessage}`
      );
      throw error;
    } finally {
      this.cleanup();
    }
  }

  async replay(sessionId: string): Promise<void> {
    logger.info('MockAgentExecutor', `Replaying session: ${sessionId}`);

    // Check if session exists in history with more flexible matching
    const sessionRecord = this.executionHistory.find(
      (record) =>
        record.taskId.includes(sessionId) ||
        record.taskId === sessionId ||
        sessionId.includes(record.taskId)
    );

    if (!sessionRecord) {
      logger.warn(
        'MockAgentExecutor',
        `Session ${sessionId} not found in history, creating new session replay`
      );
      // Instead of throwing error, create a new replay session
      return this.createReplaySession(sessionId);
    }

    if (sessionRecord.status !== 'completed') {
      logger.warn(
        'MockAgentExecutor',
        `Session ${sessionId} was not completed, attempting replay anyway`
      );
      // Continue with replay even if not completed
    }

    this.isRunning = true;
    this.currentTask = `Replay session ${sessionId}`;
    this.taskId = `replay-${sessionId}`;
    this.cancelled = false;

    try {
      await this.emitEvent('system', 'task.start', 'Replay started');

      // Enhanced replay simulation with more realistic steps
      const replaySteps = [
        'Loading session metadata...',
        'Validating execution context...',
        'Restoring browser state...',
        'Loading recorded actions...',
        'Executing recorded steps...',
        'Verifying replay consistency...',
        'Validating final state...',
      ];

      for (let i = 0; i < replaySteps.length; i++) {
        if (this.cancelled) {
          await this.recordExecution('cancelled');
          await this.emitEvent(
            'system',
            'task.cancel',
            'Replay cancelled by user'
          );
          return;
        }

        this.currentStep = i + 1;
        await this.emitEvent('navigator', 'step.start', replaySteps[i]);

        // Simulate more realistic timing for replay operations
        const replayTime = 600 + Math.random() * 800;
        await new Promise((resolve) => setTimeout(resolve, replayTime));

        // Simulate potential replay issues
        if (i === 4 && Math.random() < 0.1) {
          // 10% chance of replay inconsistency
          await this.emitEvent(
            'navigator',
            'step.warning',
            'State inconsistency detected, attempting correction...'
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        await this.emitEvent(
          'navigator',
          'step.ok',
          `${replaySteps[i]} completed`
        );
      }

      await this.recordExecution('completed');
      await this.emitEvent(
        'system',
        'task.ok',
        'Replay completed successfully'
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.recordExecution('failed');
      await this.emitEvent(
        'system',
        'task.fail',
        `Replay failed: ${errorMessage}`
      );
      throw error;
    } finally {
      this.cleanup();
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      currentTask: this.currentTask || undefined,
      currentStep: this.currentStep > 0 ? this.currentStep : undefined,
    };
  }

  subscribeToEvents(callback: EventCallback): void {
    this.eventSubscribers.push(callback);
  }

  unsubscribeFromEvents(): void {
    this.eventSubscribers = [];
  }

  addFollowUpTask(task: string): void {
    logger.info('MockAgentExecutor', `Adding follow-up task: ${task}`);

    // Enhanced mock implementation with task queue simulation
    if (this.isRunning) {
      logger.warn(
        'MockAgentExecutor',
        'Cannot add follow-up task while another task is running'
      );
      return;
    }

    // In a real implementation, this would add the task to a queue
    // For now, simulate immediate execution of follow-up task
    setTimeout(async () => {
      if (!this.isRunning && this.tabId) {
        const followUpTaskId = `followup-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        await this.execute({ task, taskId: followUpTaskId, tabId: this.tabId });
      }
    }, 1000);
  }

  /**
   * Enhanced cleanup method with proper resource management
   */
  private cleanup(): void {
    this.isRunning = false;
    this.currentTask = null;
    this.currentStep = 0;
    this.taskId = null;
    this.tabId = null;
    this.cancelled = false;

    logger.info('MockAgentExecutor', 'Cleaned up executor state');
  }

  /**
   * Get task-specific execution steps based on task content
   */
  private getTaskSteps(task: string): string[] {
    const lowercaseTask = task.toLowerCase();

    if (lowercaseTask.includes('swap') || lowercaseTask.includes('trade')) {
      return [
        'Analyzing DeFi protocols...',
        'Finding optimal swap routes...',
        'Checking token allowances...',
        'Calculating gas estimates...',
        'Executing swap transaction...',
        'Confirming transaction...',
      ];
    }

    if (lowercaseTask.includes('send') || lowercaseTask.includes('transfer')) {
      return [
        'Validating recipient address...',
        'Checking account balance...',
        'Preparing transaction...',
        'Estimating gas fees...',
        'Executing transfer...',
        'Confirming transaction...',
      ];
    }

    if (
      lowercaseTask.includes('connect') ||
      lowercaseTask.includes('approve')
    ) {
      return [
        'Analyzing dApp connection request...',
        'Checking security reputation...',
        'Preparing connection approval...',
        'Establishing secure connection...',
        'Finalizing permissions...',
      ];
    }

    // Default generic steps
    return [
      'Analyzing page content...',
      'Identifying interactive elements...',
      'Planning execution strategy...',
      'Executing actions...',
      'Validating results...',
    ];
  }

  /**
   * Get realistic processing time based on step complexity
   */
  private getStepProcessingTime(step: string): number {
    const baseTime = 800;
    const randomVariation = Math.random() * 1200;

    // Add extra time for complex operations
    if (
      step.includes('transaction') ||
      step.includes('swap') ||
      step.includes('gas')
    ) {
      return baseTime + randomVariation + 1000;
    }

    if (step.includes('analyzing') || step.includes('calculating')) {
      return baseTime + randomVariation + 500;
    }

    return baseTime + randomVariation;
  }

  /**
   * Simulate realistic step failures for testing
   */
  private shouldSimulateStepFailure(step: string): boolean {
    // 5% chance of temporary failure for network-related steps
    if (
      step.includes('gas') ||
      step.includes('transaction') ||
      step.includes('network')
    ) {
      return Math.random() < 0.05;
    }

    // 2% chance of temporary failure for other steps
    return Math.random() < 0.02;
  }

  /**
   * Record execution history for development insights
   */
  private async recordExecution(
    status: 'completed' | 'failed' | 'cancelled'
  ): Promise<void> {
    if (!this.taskId || !this.currentTask) return;

    const record = {
      taskId: this.taskId,
      task: this.currentTask,
      timestamp: Date.now(),
      status,
    };

    this.executionHistory.push(record);

    // Keep only last 50 executions
    if (this.executionHistory.length > 50) {
      this.executionHistory = this.executionHistory.slice(-50);
    }

    // Save to chrome storage for persistence
    try {
      await chrome.storage.local.set({
        mockExecutorHistory: this.executionHistory,
      });
    } catch (error) {
      logger.warn(
        'MockAgentExecutor',
        'Failed to save execution history',
        error
      );
    }
  }

  /**
   * Load execution history from storage
   */
  private async loadExecutionHistory(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('mockExecutorHistory');
      if (result.mockExecutorHistory) {
        this.executionHistory = result.mockExecutorHistory;
        logger.info(
          'MockAgentExecutor',
          `Loaded ${this.executionHistory.length} historical executions`
        );
      }
    } catch (error) {
      logger.warn(
        'MockAgentExecutor',
        'Failed to load execution history',
        error
      );
    }
  }

  /**
   * Get execution statistics for development insights
   */
  getExecutionStats(): {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const stats = this.executionHistory.reduce(
      (acc, record) => {
        acc.total++;
        acc[record.status]++;
        return acc;
      },
      { total: 0, completed: 0, failed: 0, cancelled: 0 }
    );

    return stats;
  }

  private async emitEvent(
    actor: string,
    state: string,
    details: string
  ): Promise<void> {
    const event: AgentEvent = {
      actor,
      state,
      data: {
        taskId: this.taskId || 'unknown',
        step: this.currentStep,
        maxSteps: 5,
        details,
      },
      timestamp: Date.now(),
      type: 'execution',
    };

    for (const callback of this.eventSubscribers) {
      try {
        await callback(event);
      } catch (error) {
        logger.error('MockAgentExecutor', 'Error in event callback', {
          error,
        });
      }
    }
  }
}

/**
 * Production-ready bridge for nanobrowser integration
 *
 * Current Implementation: Enhanced mock for development and testing
 * Production TODO: Replace MockAgentExecutor with actual nanobrowser connection
 */
class AgentIntegrationBridge implements AgentExecutorBridge {
  private executor: MockAgentExecutor;
  private browserContext: BrowserContext;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 3;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.executor = new MockAgentExecutor();
    this.browserContext = new RabbyBrowserContext();
    this.startHealthCheck();

    logger.info(
      'AgentIntegrationBridge',
      'Initialized enhanced nanobrowser agent executor bridge (Development Mode)'
    );
    logger.warn(
      'AgentIntegrationBridge',
      'Currently using mock implementation. Replace with actual nanobrowser for production.'
    );
  }

  async execute(task: string, tabId: number): Promise<void> {
    logger.info('AgentIntegrationBridge', `Executing task: ${task}`, { tabId });

    // Validate input parameters
    if (!task || task.trim().length === 0) {
      throw new Error('Task description cannot be empty');
    }

    if (!tabId || tabId <= 0) {
      throw new Error('Invalid tab ID provided');
    }

    try {
      // Verify tab exists and is accessible
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url) {
        throw new Error(`Tab ${tabId} is not accessible or does not exist`);
      }

      // Check for restricted URLs
      if (this.isRestrictedUrl(tab.url)) {
        throw new Error(`Cannot execute tasks on restricted URL: ${tab.url}`);
      }

      // Generate a unique task ID with better entropy
      const taskId = `task-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}-${this.connectionAttempts}`;

      // Attempt connection retry logic
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= this.maxConnectionAttempts; attempt++) {
        try {
          this.connectionAttempts++;

          // Switch to the target tab
          await this.browserContext.switchToTab(tabId);

          // Wait for tab to be ready
          await this.waitForTabReady(tabId);

          // Execute the task
          await this.executor.execute({ task, taskId, tabId });

          logger.info('AgentIntegrationBridge', 'Task execution completed', {
            taskId,
            attempt,
          });
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          logger.warn(
            'AgentIntegrationBridge',
            `Task execution attempt ${attempt} failed`,
            {
              error: lastError.message,
              taskId,
            }
          );

          if (attempt < this.maxConnectionAttempts) {
            // Wait before retry with exponential backoff
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      // All attempts failed
      throw (
        lastError || new Error('Task execution failed after all retry attempts')
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('AgentIntegrationBridge', 'Task execution failed', {
        error: errorMessage,
        tabId,
      });
      throw error;
    }
  }

  async cancel(): Promise<void> {
    logger.info('AgentIntegrationBridge', 'Canceling current task');
    try {
      await this.executor.cancel();
      logger.info('AgentIntegrationBridge', 'Task cancelled successfully');
    } catch (error) {
      logger.error('AgentIntegrationBridge', 'Failed to cancel task', {
        error,
      });
      throw error;
    }
  }

  async replay(sessionId: string): Promise<void> {
    logger.info('AgentIntegrationBridge', `Replaying session: ${sessionId}`);
    try {
      await this.executor.replay(sessionId);
      logger.info('AgentIntegrationBridge', 'Session replay completed', {
        sessionId,
      });
    } catch (error) {
      logger.error('AgentIntegrationBridge', 'Session replay failed', {
        error,
        sessionId,
      });
      throw error;
    }
  }

  getStatus() {
    return this.executor.getStatus();
  }

  subscribeToEvents(callback: EventCallback): void {
    this.executor.subscribeToEvents(callback);
    logger.info('AgentIntegrationBridge', 'Event subscription added');
  }

  unsubscribeFromEvents(): void {
    this.executor.unsubscribeFromEvents();
    logger.info('AgentIntegrationBridge', 'Event subscriptions cleared');
  }

  addFollowUpTask(task: string): void {
    if (!task || task.trim().length === 0) {
      logger.warn('AgentIntegrationBridge', 'Cannot add empty follow-up task');
      return;
    }

    this.executor.addFollowUpTask(task);
    logger.info('AgentIntegrationBridge', 'Follow-up task queued', { task });
  }

  /**
   * Check if URL is restricted for automation
   */
  private isRestrictedUrl(url: string): boolean {
    const restrictedPatterns = [
      /^chrome:\/\//,
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^about:\/\//,
      /^file:\/\//,
    ];

    return restrictedPatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Wait for tab to be in ready state
   */
  private async waitForTabReady(
    tabId: number,
    timeout: number = 5000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          return;
        }
      } catch (error) {
        throw new Error(`Tab ${tabId} became inaccessible`);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Tab ${tabId} did not become ready within ${timeout}ms`);
  }

  /**
   * Start periodic health check for the bridge
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      try {
        const stats = this.executor.getExecutionStats();
        logger.debug('AgentIntegrationBridge', 'Health check completed', {
          executionStats: stats,
          connectionAttempts: this.connectionAttempts,
        });
      } catch (error) {
        logger.warn('AgentIntegrationBridge', 'Health check failed', { error });
      }
    }, 60000); // Every minute
  }

  /**
   * Cleanup method for proper resource management
   */
  cleanup(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    try {
      this.browserContext.cleanup();
    } catch (error) {
      logger.warn(
        'AgentIntegrationBridge',
        'Error during browser context cleanup',
        {
          error,
        }
      );
    }

    logger.info('AgentIntegrationBridge', 'Bridge cleanup completed');
  }
}

// Singleton instance of the bridge
export const agentIntegrationBridge = new AgentIntegrationBridge();
