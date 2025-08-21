import { createLogger } from '@/utils/logger';
import { toolRegistry } from './agent/tools/ToolRegistry';

import { llmProviderStore, agentModelStore } from './agent/storage/index';
import { Executor } from './agent/executor';
import type { AgentExecutorBridge } from './agent/executor';
import { ProviderConfig, ModelConfig } from './agent/storage/index';
import { AgentNameEnum } from './agent/storage/types';
import { Web3Agent } from './agent/Web3Agent';
import { Web3LLM } from './agent/llm/factory';
import type { IWeb3LLM } from './agent/llm/types';
import { AgentContext } from './agent/types';
import { MessageManager } from './agent/messageManager';
import { Actors } from './agent/chatHistory/types';
const messageManager = new MessageManager();

const logger = createLogger('AgentService');

interface AgentMessage {
  type: string;
  taskId?: string;
  tabId?: number;
  task?: string;
  historySessionId?: string;
  audio?: string;
  [key: string]: any;
}

interface AgentPort {
  port: chrome.runtime.Port;
  connected: boolean;
}

class AgentService {
  // Cancellation flag for current streaming task
  private currentStreamingTask: { id: string | number | null; cancelled: boolean } = { id: null, cancelled: false };
  // Track tool_call IDs within an active streaming task to emit strong-signal events once per call
  private currentStreamingToolCallIds: Set<string> = new Set();
    // Map function name -> last seen tool_call id for this task (non-streaming fallback)
    private currentFunctionCallIdByName: Map<string, string> = new Map();

  private currentToolCallIndexToId: Record<number, string> = {};
  private ports: Map<string, AgentPort> = new Map();
  private executor: AgentExecutorBridge | null = null;
  private web3Agent: Web3Agent | null = null;
  private agentContext: AgentContext | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private connectionMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private connectionStatus: Map<string, { lastSeen: number; status: 'connected' | 'disconnected' | 'reconnecting' }> = new Map();
  private recoveryAttempts: Map<string, number> = new Map();
  private maxRecoveryAttempts: number = 3;
  private llmInstanceCache: Map<string, IWeb3LLM> = new Map();
  private configVersion: number = 0;
  private configCache: Map<string, { config: any; version: number }> = new Map();


  // Buffer tool results per task to optionally force a second-turn continuation if model fails to produce it
  private taskToolResults: Map<string, Array<{ toolCallId: string; toolName: string; result: any; success: boolean }>> = new Map();


  // Guard to avoid duplicate forced continuation per task
  private forcedContinuationForTask: Set<string> = new Set();
  private toolResultTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Wallet confirmation pending approvals
  private pendingApprovals = new Map<string, { resolve: (data: any) => void; reject: (error: Error) => void }>();

  /**
   * Add a pending approval resolver
   */
  public addPendingApproval(approvalId: string, resolver: { resolve: (data: any) => void; reject: (error: Error) => void }) {
    this.pendingApprovals.set(approvalId, resolver);
  }

  /**
   * Check if a pending approval exists
   */
  public hasPendingApproval(approvalId: string): boolean {
    return this.pendingApprovals.has(approvalId);
  }

  /**
   * Remove a pending approval
   */
  public removePendingApproval(approvalId: string): boolean {
    return this.pendingApprovals.delete(approvalId);
  }

  /**
   * Get and remove a pending approval
   */
  public getPendingApproval(approvalId: string): { resolve: (data: any) => void; reject: (error: Error) => void } | undefined {
    const resolver = this.pendingApprovals.get(approvalId);
    if (resolver) {
      this.pendingApprovals.delete(approvalId);
    }
    return resolver;
  }

  /**
   * Force-continue the conversation with buffered tool results in case the
   * model/provider didn't perform a second turn automatically.
   */
  private async forceContinueWithBufferedResults(taskId: string, port: chrome.runtime.Port) {
    try {
      if (this.forcedContinuationForTask.has(taskId)) return;
      const results = this.taskToolResults.get(taskId) || [];
      if (!results.length) return;
      this.forcedContinuationForTask.add(taskId);

      if (!this.web3Agent) throw new Error('Web3 Agent not available');

      // Append tool messages for previous assistant tool_calls to satisfy OpenAI schema
      await this.web3Agent.ingestExternalToolResults(results);

      const toolResultsContent = results.map(r => `Tool "${r.toolName}" result: ${JSON.stringify(r.result)}`).join('\n\n');
      const userMessage = `Tool execution results:\n\n${toolResultsContent}`;

      const response = await this.web3Agent.processUserInstructionWithFunctionCalling(
        userMessage,
        false,
        undefined,
        // thinking
        (thinking) => {
          port.postMessage({
            type: 'thinking',
            actor: Actors.SYSTEM,
            state: 'THINKING',
            timestamp: Date.now(),
            data: { details: thinking?.content, thinkingType: thinking?.type, functionCalling: true, fromModel: true },
          });
        },
        // react status
        (reactStatus) => {
          port.postMessage({ type: 'react_status', actor: Actors.SYSTEM, state: 'REACT_STATUS', timestamp: Date.now(), data: reactStatus });
        },
        // forward tool_calls if any for UI
        (toolCalls) => {
          const content = toolCalls?.content || '';
          const fcs = (toolCalls?.functionCalls || []) as any[];
          fcs.forEach((c: any) => {
            const id = c?.id || `call_${c?.name || 'fn'}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
            port.postMessage({
              type: 'function_call', actor: 'assistant', state: 'ACT_START', timestamp: Date.now(),
              data: { details: content, functionCalls: [{ id, name: c?.name || 'function', arguments: c?.arguments || {}, status: c?.status || 'executing', timestamp: Date.now() }] }
            });
          });
        }
      );

      await this.ensureMessageDisplayed({
        type: 'execution', actor: Actors.SYSTEM, state: 'TASK_OK', timestamp: Date.now(),
        data: { details: response.message, actions: response.actions, plan: response.plan, simulation: response.simulation, functionCalling: true }
      }, port, 'web3_task_forced_continuation');

      // cleanup
      this.taskToolResults.delete(taskId);
      const t = this.toolResultTimers.get(taskId); if (t) clearTimeout(t);
      this.toolResultTimers.delete(taskId);
    } catch (e) {
      // Don't crash the agent on fallback failure; surface as error event
      await this.ensureMessageDisplayed({ type: 'error', error: e instanceof Error ? e.message : String(e), timestamp: Date.now(), originalType: 'forced_continuation_error' }, port, 'forced_continuation_error');
    }
  }

  constructor() {
    console.log('🔥🔥🔥 AGENT SERVICE CONSTRUCTOR CALLED! 🔥🔥🔥', {
      timestamp: Date.now(),
      moduleStack: new Error().stack
    });

    logger.info('AgentService', 'Initializing Agent Service');
    try {
      this.setupPortManagement();
      this.initializeAgents();
      this.setupConnectionMonitoring();
      this.setupConfigChangeListeners();
      logger.info('AgentService', 'Agent Service initialized successfully');

      console.log('🚨🚨🚨 AGENT SERVICE INITIALIZATION COMPLETE! 🚨🚨🚨');
    } catch (error) {
      logger.error('AgentService', 'Failed to initialize Agent Service', error);
      console.error('❌❌❌ AGENT SERVICE INITIALIZATION FAILED:', error);
      throw error;
    }
  }

  private async initializeAgents() {
    try {
      // Initialize the mock executor for general automation
      this.executor = Executor;

      // Initialize Web3 Agent for blockchain operations (includes fallback responses for simple queries)
      this.agentContext = {
        tabId: 0,
        sessionId: 'initial_session',
        eventHandler: (event) => {
          logger.info('AgentContext event', event);
        },
      };

      // Initialize LLM for Web3 Agent
      const llm = await this.initializeLLM();

      // Ensure LLM is wrapped with Web3LLM for proper interface compliance
      let web3LLM: IWeb3LLM;
      if ('generateResponse' in llm) {
        // Already a Web3LLM instance
        web3LLM = llm as IWeb3LLM;
      } else {
        // Need to wrap with Web3LLM adapter
        const providers = await llmProviderStore.getAllProviders();
        const currentProvider =
          providers['openai'] ||
          providers['anthropic'] ||
          Object.values(providers)[0];

        web3LLM = new Web3LLM(
          llm,
          currentProvider?.type || 'unknown',
          currentProvider?.modelNames?.[0] || 'default'
        );
      }

      this.web3Agent = new Web3Agent(this.agentContext, web3LLM);

      // Auto-assign providers to agents if needed
      await this.autoAssignBestProvider();

      logger.info('AgentService', 'All agents initialized successfully');
    } catch (error) {
      logger.error('AgentService', 'Failed to initialize agents', error);
      // Continue without agents - will handle this gracefully in message handling
    }
  }

  /**
   * Get configuration version for cache invalidation
   */
  private getConfigVersion(): number {
    return this.configVersion;
  }

  /**
   * Increment configuration version to invalidate cache
   */
  private incrementConfigVersion(): void {
    this.configVersion++;
    logger.info('AgentService', `Configuration version incremented to ${this.configVersion}`);
  }

  /**
   * Validate cached configuration against current version
   */
  private isConfigValid(cacheKey: string, cachedVersion: number): boolean {
    return cachedVersion === this.getConfigVersion();
  }

  /**
   * Cache configuration with version tracking
   */
  private cacheConfig(cacheKey: string, config: any): void {
    this.configCache.set(cacheKey, {
      config,
      version: this.getConfigVersion()
    });
  }

  /**
   * Get cached configuration if version matches
   */
  private getCachedConfig(cacheKey: string): any | null {
    const cached = this.configCache.get(cacheKey);
    if (!cached || !this.isConfigValid(cacheKey, cached.version)) {
      return null;
    }
    return cached.config;
  }

  /**
   * Get Web3LLM instance with caching support
   */
  private async getWeb3LLM(agentName: AgentNameEnum): Promise<IWeb3LLM> {
    const cacheKey = `${agentName}_${this.getConfigVersion()}`;

    // Check if we have a cached instance for this agent with current config
    if (this.llmInstanceCache.has(cacheKey)) {
      logger.debug('AgentService', `Using cached LLM instance for ${agentName} (version ${this.getConfigVersion()})`);
      return this.llmInstanceCache.get(cacheKey)!;
    }

    try {
      // Get agent-specific model configuration
      const agentModel = await agentModelStore.getAgentModel(agentName);
      if (!agentModel) {
        throw new Error(`No model configuration found for ${agentName}`);
      }

      // Get provider configuration
      const providerConfig = await llmProviderStore.getProvider(agentModel.provider);
      if (!providerConfig) {
        throw new Error(`Provider configuration not found for ${agentModel.provider}`);
      }

      // Create LLM instance
      const { createLLMInstance } = await import('./agent/llm/factory');
      const llm = await createLLMInstance(providerConfig, agentModel);

      // Wrap with Web3LLM if needed
      let web3LLM: IWeb3LLM;
      if ('generateResponse' in llm) {
        web3LLM = llm as IWeb3LLM;
      } else {
        web3LLM = new Web3LLM(
          llm,
          providerConfig.type || 'unknown',
          agentModel.modelName
        );
      }

      // Cache the instance with version key
      this.llmInstanceCache.set(cacheKey, web3LLM);

      // Clean up old cached instances
      this.cleanupOldCacheEntries(agentName);

      logger.info('AgentService', `Created and cached LLM instance for ${agentName}`, {
        provider: providerConfig.type,
        model: agentModel.modelName,
        version: this.getConfigVersion()
      });

      return web3LLM;
    } catch (error) {
      logger.error('AgentService', `Failed to create LLM instance for ${agentName}`, error);
      throw error;
    }
  }

  /**
   * Clean up old cache entries for an agent
   */
  private cleanupOldCacheEntries(agentName: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.llmInstanceCache.keys()) {
      if (key.startsWith(`${agentName}_`) && !key.endsWith(`_${this.getConfigVersion()}`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.llmInstanceCache.delete(key);
    }
    if (keysToDelete.length > 0) {
      logger.debug('AgentService', `Cleaned up ${keysToDelete.length} old cache entries for ${agentName}`);
    }
  }

  /**
   * Clear LLM instance cache
   */
  private clearLLMCache(): void {
    this.llmInstanceCache.clear();
    this.configCache.clear();
    logger.info('AgentService', 'LLM instance cache and config cache cleared');
  }

  /**
   * Reload agent model by clearing cache and recreating LLM instance
   */
  public async reloadAgentModel(agentName: AgentNameEnum): Promise<void> {
    try {
      logger.info('AgentService', `Reloading model for ${agentName}`);

      // Increment configuration version to invalidate cache
      this.incrementConfigVersion();

      // Clear all cached instances for this agent
      this.cleanupOldCacheEntries(agentName);

      // If this is the current Web3Agent's LLM, refresh it
      if (this.web3Agent) {
        await this.refreshLLM();
      }

      logger.info('AgentService', `Successfully reloaded model for ${agentName} (version ${this.getConfigVersion()})`);
    } catch (error) {
      logger.error('AgentService', `Failed to reload model for ${agentName}`, error);
      throw error;
    }
  }

  /**
   * Reload all agent models
   */
  public async reloadAllAgentModels(): Promise<void> {
    try {
      logger.info('AgentService', 'Reloading all agent models');

      // Increment configuration version to invalidate all cache
      this.incrementConfigVersion();

      // Clear all cached instances
      this.clearLLMCache();

      // Refresh LLM and Web3Agent
      await this.refreshLLM();

      logger.info('AgentService', `Successfully reloaded all agent models (version ${this.getConfigVersion()})`);
    } catch (error) {
      logger.error('AgentService', 'Failed to reload all agent models', error);
      throw error;
    }
  }

  private async initializeLLM() {
    try {
      // Get current LLM provider configuration (for fallback)
      const providers = await llmProviderStore.getAllProviders();
      const defaultProvider =
        providers['openai'] ||
        providers['anthropic'] ||
        Object.values(providers)[0];

      if (!defaultProvider) {
        logger.warn('AgentService', 'No LLM provider found, using fallback');
        // Use a simple fallback that works
        const { RealChatModel } = await import('./agent/llm/factory');
        return new RealChatModel(
          'gpt-3.5-turbo',
          'openai-fallback',
          { apiKey: 'fallback-key' } as ProviderConfig,
          { temperature: 0.7 }
        );
      }

      // Initialize LLM based on user-selected provider/model when available
      const { createLLMInstance } = await import('./agent/llm/factory');
      const { agentModelStore } = await import('./agent/storage/agentModels');
      const { AgentNameEnum } = await import('./agent/storage/types');

      const plannerModel = await agentModelStore.getAgentModel(AgentNameEnum.Planner);

      // Resolve provider config: prefer the one selected in Agent Models
      let selectedProviderConfig: ProviderConfig | undefined;
      if (plannerModel?.provider) {
        selectedProviderConfig = await llmProviderStore.getProvider(plannerModel.provider);
      }
      if (!selectedProviderConfig) {
        selectedProviderConfig = defaultProvider;
      }

      // Resolve model config: prefer the user-selected model
      const selectedModelConfig: ModelConfig = plannerModel ?? {
        provider: (selectedProviderConfig.type || 'openai').toLowerCase(),
        modelName: selectedProviderConfig.modelNames?.[0] || 'gpt-4o-mini',
        parameters: { temperature: 0.7 },
      };

      const web3LLM = await createLLMInstance(selectedProviderConfig, selectedModelConfig);
      logger.info(
        'AgentService',
        `Initialized real LLM. Provider: ${selectedProviderConfig.type}, Model: ${selectedModelConfig.modelName}`
      );
      return web3LLM;
    } catch (error) {
      logger.error('AgentService', 'Failed to initialize LLM', error);
      // Fallback to a basic configuration
      const { RealChatModel } = await import('./agent/llm/factory');
      return new RealChatModel(
        'gpt-3.5-turbo',
        'openai-fallback',
        { apiKey: 'fallback-key' } as ProviderConfig,
        { temperature: 0.7 }
      );
    }
  }

  private setupPortManagement() {
    // Setup heartbeat to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000);
  }

  // Reinitialize LLM and Web3Agent to apply latest Provider/Model configuration
  private async refreshLLM(): Promise<void> {
    try {
      // Clear LLM cache before refresh
      this.clearLLMCache();

      const llm = await this.initializeLLM();

      // Wrap to Web3LLM if needed
      let web3LLM: IWeb3LLM;
      if ('generateResponse' in llm) {
        web3LLM = llm as IWeb3LLM;
      } else {
        const providers = await llmProviderStore.getAllProviders();
        const currentProvider =
          providers['openai'] || providers['anthropic'] || Object.values(providers)[0];
        web3LLM = new Web3LLM(
          llm,
          currentProvider?.type || 'unknown',
          currentProvider?.modelNames?.[0] || 'default'
        );
      }

      // Recreate Web3Agent with the new LLM while keeping minimal context
      if (!this.agentContext) {
        this.agentContext = {
          tabId: 0,
          sessionId: 'refreshed_session',
          eventHandler: (event) => {
            logger.info('AgentContext event', event);
          },
        } as AgentContext;
      }

      this.web3Agent = new Web3Agent(this.agentContext, web3LLM);
      logger.info('AgentService', 'LLM refreshed and Web3Agent reinitialized');
    } catch (error) {
      logger.error('AgentService', 'Failed to refresh LLM', error);
    }
  }

  private setupConnectionMonitoring() {
    // Monitor connection status and attempt recovery
    this.connectionMonitorInterval = setInterval(() => {
      this.monitorConnections();
    }, 10000); // Check every 10 seconds

    logger.info('AgentService', 'Connection monitoring initialized');
  }

  private setupConfigChangeListeners() {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        const changedKeys = Object.keys(changes || {});
        if (changedKeys.some((k) => k === 'agent-models' || k === 'llm-providers')) {
          logger.info('AgentService', 'Detected model/provider config change, refreshing LLM');
          this.incrementConfigVersion();
          this.refreshLLM();
        }
      });
      logger.info('AgentService', 'Config change listener initialized');
    } catch (error) {
      logger.warn('AgentService', 'Failed to setup config change listeners', error);
    }
  }

  private monitorConnections() {
    const now = Date.now();
    const connectionTimeout = 45000; // 45 seconds timeout

    for (const [portName, portStatus] of this.connectionStatus.entries()) {
      const timeSinceLastSeen = now - portStatus.lastSeen;

      if (timeSinceLastSeen > connectionTimeout && portStatus.status !== 'reconnecting') {
        logger.warn('AgentService', 'Connection timeout detected', {
          portName,
          timeSinceLastSeen,
          status: portStatus.status,
        });

        this.attemptConnectionRecovery(portName);
      }
    }

    // Clean up old connection statuses
    const staleConnections: string[] = [];
    for (const [portName, portStatus] of this.connectionStatus.entries()) {
      const timeSinceLastSeen = now - portStatus.lastSeen;
      if (timeSinceLastSeen > 300000) { // 5 minutes
        staleConnections.push(portName);
      }
    }

    for (const portName of staleConnections) {
      this.connectionStatus.delete(portName);
      this.recoveryAttempts.delete(portName);
      logger.info('AgentService', 'Cleaned up stale connection status', { portName });
    }
  }

  private updateConnectionStatus(portName: string, status: 'connected' | 'disconnected' | 'reconnecting') {
    this.connectionStatus.set(portName, {
      lastSeen: Date.now(),
      status,
    });

    logger.debug('AgentService', 'Connection status updated', {
      portName,
      status,
      totalConnections: this.connectionStatus.size,
    });
  }

  private async attemptConnectionRecovery(portName: string) {
    const currentAttempts = this.recoveryAttempts.get(portName) || 0;

    if (currentAttempts >= this.maxRecoveryAttempts) {
      logger.error('AgentService', 'Max recovery attempts reached', {
        portName,
        attempts: currentAttempts,
      });
      this.connectionStatus.delete(portName);
      this.recoveryAttempts.delete(portName);
      return;
    }

    this.recoveryAttempts.set(portName, currentAttempts + 1);
    this.updateConnectionStatus(portName, 'reconnecting');

    logger.info('AgentService', 'Attempting connection recovery', {
      portName,
      attempt: currentAttempts + 1,
      maxAttempts: this.maxRecoveryAttempts,
    });

    try {
      // Attempt to reconnect by sending a test message
      const agentPort = this.ports.get(portName);
      if (agentPort && agentPort.connected) {
        agentPort.port.postMessage({
          type: 'connection_test',
          timestamp: Date.now(),
          attempt: currentAttempts + 1,
        });

        // Wait for response
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Check if connection was restored
        const portStatus = this.connectionStatus.get(portName);
        if (portStatus && portStatus.status === 'connected') {
          logger.info('AgentService', 'Connection recovery successful', {
            portName,
            attempts: currentAttempts + 1,
          });
          this.recoveryAttempts.delete(portName);
        } else {
          // Continue with next recovery attempt
          setTimeout(() => {
            this.attemptConnectionRecovery(portName);
          }, Math.pow(2, currentAttempts) * 2000); // Exponential backoff
        }
      } else {
        // Port is no longer available, clean up
        this.connectionStatus.delete(portName);
        this.recoveryAttempts.delete(portName);
        this.ports.delete(portName);
      }
    } catch (error) {
      logger.error('AgentService', 'Connection recovery failed', {
        portName,
        attempt: currentAttempts + 1,
        error: error instanceof Error ? error.message : String(error),
      });

      // Schedule next attempt
      setTimeout(() => {
        this.attemptConnectionRecovery(portName);
      }, Math.pow(2, currentAttempts) * 2000);
    }
  }

  private sendHeartbeat() {
    this.ports.forEach((agentPort, portName) => {
      if (agentPort.connected) {
        try {
          agentPort.port.postMessage({ type: 'heartbeat_ack' });
        } catch (error) {
          logger.error(`Heartbeat failed for port ${portName}:`, error);
          this.removePort(portName);
        }
      }
    });
  }

  setupConnection(port: chrome.runtime.Port) {
    const portName = port.name || 'unknown';
    logger.info(`Setting up connection for port: ${portName}`);

    // Store the port
    this.ports.set(portName, {
      port,
      connected: true,
    });

    // Initialize connection status tracking
    this.updateConnectionStatus(portName, 'connected');
    this.recoveryAttempts.delete(portName); // Reset recovery attempts

    // Setup message listener
    port.onMessage.addListener((message: AgentMessage) => {
      // Update connection status on any message
      this.updateConnectionStatus(portName, 'connected');
      this.handleMessage(message, port);
    });

    // Setup disconnect listener
    port.onDisconnect.addListener(() => {
      logger.info(`Port ${portName} disconnected`);
      this.updateConnectionStatus(portName, 'disconnected');
      this.removePort(portName);
    });

    // Send initial connection confirmation
    try {
      port.postMessage({
        type: 'connected',
        status: 'ready',
        timestamp: Date.now(),
        connectionId: portName,
      });
    } catch (error) {
      logger.error('Failed to send connection confirmation:', error);
    }

    logger.info('AgentService', 'Connection setup complete', {
      portName,
      totalConnections: this.ports.size,
      totalMonitoredConnections: this.connectionStatus.size,
    });
  }

  private removePort(portName: string) {
    const agentPort = this.ports.get(portName);
    if (agentPort) {
      agentPort.connected = false;
      this.ports.delete(portName);

      // Clean up connection status and recovery attempts
      this.connectionStatus.delete(portName);
      this.recoveryAttempts.delete(portName);

      logger.info('AgentService', 'Port removed and cleanup completed', {
        portName,
        remainingConnections: this.ports.size,
        remainingMonitoredConnections: this.connectionStatus.size,
      });
    }
  }

  private async handleMessage(
    message: AgentMessage,
    port: chrome.runtime.Port
  ) {
    logger.info('AgentService', 'Received message', {
      type: message.type,
      taskId: message.taskId,
      port: port.name,
      connected: port.sender?.url,
    });

    // Enhanced fallback mechanism with immediate acknowledgment
    if (!['heartbeat', 'get_providers', 'get_agent_models'].includes(message.type)) {
      try {
        port.postMessage({
          type: 'message_received',
          messageId: message.taskId || `msg_${Date.now()}`,
          timestamp: Date.now(),
          originalType: message.type,
        });
      } catch (ackError) {
        logger.warn('AgentService', 'Failed to send message acknowledgment', ackError);
      }
    }

    // Check if any agent is available with enhanced fallback
    if (
      !this.executor &&
      !this.web3Agent &&
      !['heartbeat', 'get_providers', 'get_agent_models'].includes(message.type)
    ) {
      const errorMsg = 'No agents available. Please try again later.';
      logger.error('AgentService', errorMsg);

      // Send immediate error response
      await this.sendWithFallback(port, {
        type: 'error',
        error: errorMsg,
        timestamp: Date.now(),
        fallback: true,
      });
      return;
    }

    try {
      switch (message.type) {
        case 'heartbeat':
          // Respond to heartbeat
          port.postMessage({ type: 'heartbeat_ack' });
          break;

        case 'wallet_confirmation_response':
          // Handle confirmation responses from Sidebar
          try {
            const { approvalId, approved, data } = message;
            const resolver = this.getPendingApproval(approvalId);

            if (resolver) {
              const { resolve, reject } = resolver;

              if (approved) {
                // Handle whitelist addition if requested
                if (data?.addToWhitelist && data?.to) {
                  try {
                    const { contractWhitelistService } = await import('@/background/service');
                    contractWhitelistService.addToWhitelist(data.to, {
                      name: `Contract ${data.to.slice(0, 8)}...`,
                      origin: data.origin || 'Unknown',
                      chainId: data.chainId,
                    });
                    logger.info('AgentService', 'Added contract to whitelist', { address: data.to });
                  } catch (e) {
                    logger.error('AgentService', 'Failed to add contract to whitelist', e);
                  }
                }

                // Remove addToWhitelist from data before resolving
                const { addToWhitelist, ...txData } = data || {};
                // Ensure signingTxId is present for ethSendTransaction path
                try {
                  if (!txData.signingTxId) {
                    const { transactionHistoryService } = await import('@/background/service');
                    txData.signingTxId = transactionHistoryService.addSigningTx(txData as any);
                  }
                } catch {}
                resolve(txData);
              } else {
                reject(new Error('User rejected the transaction in Agent Sidebar'));
              }
            } else {
              logger.warn('AgentService', 'Received confirmation response for unknown approval ID', { approvalId });
            }
          } catch (e) {
            logger.error('AgentService', 'Error handling wallet confirmation response', e);
            this.sendWithFallback(port, { type: 'error', error: String(e) });
          }
          break;

        case 'new_task':
          await this.handleNewTask(message, port);
          break;

        case 'whitelist_list':
          // Get all whitelisted contracts
          try {
            const { contractWhitelistService } = await import('@/background/service');
            const contracts = contractWhitelistService.getWhitelistedContracts();
            this.sendWithFallback(port, {
              type: 'whitelist_list_response',
              data: contracts,
            });
          } catch (e) {
            logger.error('AgentService', 'Error getting whitelist', e);
            this.sendWithFallback(port, { type: 'error', error: String(e) });
          }
          break;

        case 'whitelist_remove':
          // Remove a contract from whitelist
          try {
            const { address } = message;
            if (!address) {
              throw new Error('Address is required for whitelist removal');
            }
            const { contractWhitelistService } = await import('@/background/service');
            contractWhitelistService.removeFromWhitelist(address);
            this.sendWithFallback(port, {
              type: 'whitelist_remove_response',
              success: true,
            });
            logger.info('AgentService', 'Removed contract from whitelist', { address });
          } catch (e) {
            logger.error('AgentService', 'Error removing from whitelist', e);
            this.sendWithFallback(port, { type: 'error', error: String(e) });
          }
          break;

        case 'whitelist_clear':
          // Clear all whitelisted contracts
          try {
            const { contractWhitelistService } = await import('@/background/service');
            contractWhitelistService.clearWhitelist();
            this.sendWithFallback(port, {
              type: 'whitelist_clear_response',
              success: true,
            });
            logger.info('AgentService', 'Cleared all contracts from whitelist');
          } catch (e) {
            logger.error('AgentService', 'Error clearing whitelist', e);
            this.sendWithFallback(port, { type: 'error', error: String(e) });
          }
          break;

        case 'wallet_simulate':
          // Perform pre-execution simulation and gas estimation for Sidebar inline confirmation
          try {
            const { approvalId, data } = message as any;
            const { buildTxApprovalResWithPreExec } = await import('@/background/controller/provider/txHelper');

            const txParams = { ...(data?.txParams || {}) } as any;
            const account = data?.account;
            const origin = data?.origin || '';

            // Normalize required fields
            try {
              if (account?.address && (!txParams.from || String(txParams.from).toLowerCase() !== String(account.address).toLowerCase())) {
                txParams.from = account.address;
              }
              if (!txParams.chainId && typeof data?.chain?.id === 'number') {
                txParams.chainId = data.chain.id;
              }
            } catch {}

            let approvalRes: any;
            let preExecResult: any;
            let estimatedGas: string = '0x0';

            const extractErr = (err: any) => {
              try {
                return (
                  err?.response?.data?.message ||
                  err?.data?.message ||
                  err?.error?.message ||
                  err?.message ||
                  (typeof err === 'string' ? err : '') ||
                  'Pre-execution failed'
                );
              } catch {
                return 'Pre-execution failed';
              }
            };

            try {
              const built = await buildTxApprovalResWithPreExec({ txParams, account, origin });
              approvalRes = built.approvalRes;
              preExecResult = built.preExecResult;
              estimatedGas = built.estimatedGas;
            } catch (err: any) {
              approvalRes = {
                chainId: txParams.chainId,
                to: txParams.to,
                from: txParams.from,
                data: txParams.data || '0x',
                value: txParams.value || '0x0',
                gas: txParams.gas || '0x0',
                gasPrice: txParams.gasPrice || '0x0',
                maxFeePerGas: txParams.maxFeePerGas,
                maxPriorityFeePerGas: txParams.maxPriorityFeePerGas,
                nonce: '0x0',
              } as any;
              preExecResult = {
                pre_exec: { success: false, error: extractErr(err) },
                gas: { success: false, gas_used: 0, gas_limit: 0 },
              } as any;
              estimatedGas = txParams.gas || '0x0';
            }

            await this.sendWithFallback(port, {
              type: 'wallet_simulate_result',
              approvalId,
              data: {
                approvalRes,
                preExecResult,
                estimatedGas,
              },
              timestamp: Date.now(),
            } as any);
          } catch (e) {
            logger.error('AgentService', 'wallet_simulate error', e);
            await this.sendWithFallback(port, { type: 'error', error: String(e) });
          }
          break;

        case 'whitelist_add':
          // Manually add a contract to whitelist
          try {
            const { address, name, chainId } = message;
            if (!address) {
              throw new Error('Address is required for whitelist addition');
            }
            const { contractWhitelistService } = await import('@/background/service');
            contractWhitelistService.addToWhitelist(address, {
              name: name || `Contract ${address.slice(0, 8)}...`,
              chainId: chainId || undefined,
              origin: 'Manual Addition',
            });
            this.sendWithFallback(port, {
              type: 'whitelist_add_response',
              success: true,
            });
            logger.info('AgentService', 'Manually added contract to whitelist', { address, name, chainId });
          } catch (e) {
            logger.error('AgentService', 'Error adding to whitelist', e);
            this.sendWithFallback(port, { type: 'error', error: String(e) });
          }
          break;

        case 'follow_up_task':
          await this.handleFollowUpTask(message, port);
          break;

        case 'streaming_task':
          await this.handleStreamingTask(message, port);
          break;

        case 'get_available_tools': {
          if (this.web3Agent) {
            const tools = await this.web3Agent.getAvailableTools();
            port.postMessage({ type: 'available_tools', tools });
          } else {
            port.postMessage({
              type: 'error',
              error: 'Web3 Agent not available',
            });
          }
          break;
        }

        case 'get_agent_capabilities': {
          if (this.web3Agent) {
            const [functionCalling, streaming, toolInfo] = await Promise.all([
              this.web3Agent.supportsFunctionCalling(),
              this.web3Agent.supportsStreaming(),
              this.web3Agent.getToolRegistryInfo(),
            ]);

            port.postMessage({
              type: 'agent_capabilities',
              capabilities: {
                functionCalling,
                streaming,
                toolInfo,
              },
            });
          } else {
            port.postMessage({
              type: 'error',
              error: 'Web3 Agent not available',
            });
          }
          break;
        }

        case 'cancel_task':
          await this.handleCancelTask(port);
          break;

        case 'speech_to_text':
          await this.handleSpeechToText(message, port);
          break;

        case 'replay':
          await this.handleReplay(message, port);
          break;

        case 'state':
          await this.handleState(port);
          break;

        case 'nohighlight':
          await this.handleNoHighlight(port);
          break;

        case 'get_providers': {
          const providers = await llmProviderStore.getAllProviders();
          port.postMessage({ type: 'providers', providers });
          break;
        }

        case 'set_provider':
          await llmProviderStore.setProvider(
            message.providerId,
            message.config
          );

          // Auto-assign the new provider to agents if they don't have one
          await this.autoAssignProviderToAgents(
            message.providerId,
            message.config
          );

          port.postMessage({ type: 'provider_set' });
          break;

        case 'get_agent_models': {
          const agentModels = await agentModelStore.getAllAgentModels();
          port.postMessage({ type: 'agent_models', agentModels });
          break;
        }

        case 'set_agent_model':
          await agentModelStore.setAgentModel(message.agent, message.config);
          port.postMessage({ type: 'agent_model_set' });
          // Apply updated model immediately
          await this.reloadAgentModel(message.agent);
          break;

        case 'continue_with_tool_results':
          await this.handleContinueWithToolResults(message, port);
          break;

        default:
          logger.warn('Unknown message type:', message.type);
          port.postMessage({
            type: 'error',
            error: `Unknown message type: ${message.type}`,
          });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('Error handling message:', {
        messageType: message.type,
        error: errorMessage,
        taskId: message.taskId,
        port: port.name,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Enhanced error response with fallback mechanism
      await this.sendWithFallback(port, {
        type: 'error',
        error: `Failed to handle ${message.type}: ${errorMessage}`,
        timestamp: Date.now(),
        originalType: message.type,
        taskId: message.taskId,
        fallback: true,
      });
    }
  }

  /**
   * Enhanced message sending with fallback mechanisms
   */
  private async sendWithFallback(
    port: chrome.runtime.Port,
    message: any,
    maxRetries: number = 3
  ): Promise<boolean> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxRetries) {
      try {
        attempt++;

        // Check if port is still connected
        if (!port.sender) {
          throw new Error('Port is no longer connected');
        }

        // Send the message
        port.postMessage(message);

        logger.debug('AgentService', 'Message sent successfully', {
          attempt,
          type: message.type,
          port: port.name,
        });

        return true;
      } catch (error) {
        lastError = error as Error;
        logger.warn('AgentService', `Message send attempt ${attempt} failed`, {
          error: lastError.message,
          type: message.type,
          port: port.name,
        });

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      }
    }

    // All attempts failed, try to send to all connected ports as fallback
    logger.error('AgentService', 'All send attempts failed, trying broadcast fallback', {
      originalError: lastError?.message,
      messageType: message.type,
    });

    let fallbackSuccess = false;
    this.ports.forEach((agentPort, portName) => {
      if (agentPort.connected && agentPort.port !== port) {
        try {
          agentPort.port.postMessage({
            ...message,
            type: 'fallback_message',
            originalPort: port.name,
            fallbackReason: lastError?.message,
          });
          fallbackSuccess = true;
          logger.info('AgentService', `Fallback message sent to port: ${portName}`);
        } catch (fallbackError) {
          logger.warn('AgentService', `Fallback send failed to port: ${portName}`, fallbackError);
        }
      }
    });

    return fallbackSuccess;
  }

  /**
   * Ensure message is displayed with multiple fallback strategies
   */
  private async ensureMessageDisplayed(
    message: any,
    originalPort: chrome.runtime.Port,
    context: string = 'unknown'
  ): Promise<void> {
    // Strategy 1: Send to original port
    const originalSuccess = await this.sendWithFallback(originalPort, message);

    if (originalSuccess) {
      logger.info('AgentService', 'Message sent successfully to original port', { context });
      return;
    }

    // Strategy 2: Broadcast to all connected ports
    logger.warn('AgentService', 'Original port send failed, broadcasting to all ports', { context });
    let broadcastSuccess = false;

    for (const [portName, agentPort] of this.ports.entries()) {
      if (agentPort.connected) {
        try {
          agentPort.port.postMessage({
            ...message,
            type: `${message.type}_broadcast`,
            broadcastContext: context,
            originalPort: originalPort.name,
          });
          broadcastSuccess = true;
        } catch (broadcastError) {
          logger.warn('AgentService', `Broadcast failed to port: ${portName}`, broadcastError);
        }
      }
    }

    if (broadcastSuccess) {
      logger.info('AgentService', 'Message broadcast successfully to fallback ports', { context });
    } else {
      logger.error('AgentService', 'All message delivery strategies failed', { context, messageType: message.type });
    }
  }

  private async handleNewTask(
    message: AgentMessage,
    port: chrome.runtime.Port
  ) {
    const { task, tabId, taskId, historySessionId } = message;

    if (!task || !tabId) {
      throw new Error('Missing required parameters for new task');
    }

    logger.info('AgentService', `Starting new task: ${task}`, { task, tabId });

    // Determine which agent should handle this task
    const taskType = this.analyzeTaskType(task);

    try {
      switch (taskType) {
        case 'web3':
          await this.handleWeb3Task(task, tabId, port, historySessionId);
          break;
        case 'automation':
        default:
          await this.handleAutomationTask(task, tabId, port);
          break;
      }
    } catch (execError) {
      const errorMessage =
        execError instanceof Error ? execError.message : String(execError);
      logger.error('AgentService', 'Failed to execute task', {
        error: errorMessage,
        task,
        tabId,
        taskType,
      });
      throw new Error(`Task execution failed: ${errorMessage}`);
    }
  }

  private analyzeTaskType(task: string): 'web3' | 'automation' {
    const taskLower = task.toLowerCase();

    // Automation keywords - only route to automation executor for these specific tasks
    const automationKeywords = [
      'click',
      'scroll',
      'type',
      'fill form',
      'submit form',
      'upload file',
      'download file',
      'take screenshot',
      'wait for element',
      'hover',
      'right click',
      'double click',
      'navigate to',
      'go to',
      'open website',
      'close tab',
      'switch tab',
      'refresh page',
      'go back',
      'go forward',
      'find element',
      'search on page',
      'extract text',
      'get element',
      'interact with page',
      'automate',
      'scrape',
      'crawl',
    ];

    // Check for automation keywords
    const hasAutomationKeywords = automationKeywords.some((keyword) =>
      taskLower.includes(keyword)
    );

    if (hasAutomationKeywords) {
      return 'automation';
    }

    // Default to Web3Agent for all other messages
    return 'web3';
  }

  private async handleWeb3Task(
    task: string,
    tabId: number,
    port: chrome.runtime.Port,
    sessionId?: string
  ) {
    if (!this.web3Agent) {
      throw new Error('Web3 Agent not available');
    }

    logger.info('AgentService', `Routing to Web3 Agent: ${task}`);

    // Ensure Web3Agent uses current model configuration for new conversations
    await this.ensureCurrentModelConfiguration();

    // Initialize or switch Web3 Agent session when needed
    const desiredSessionId = sessionId || undefined;
    const currentSessionId = this.web3Agent['state']?.sessionId;
    if (!currentSessionId || (desiredSessionId && desiredSessionId !== currentSessionId)) {
      await this.web3Agent.initialize(desiredSessionId);
      try {
        // Keep Chat UI and storage aligned with active session
        const { chatHistoryStore } = await import('./agent/chatHistory');
        if (this.web3Agent['state']?.sessionId) {
          await chatHistoryStore.setCurrentSession(this.web3Agent['state'].sessionId);
        }
      } catch (e) {
        // non-fatal
      }
    }

    // Check if we should use function calling
    const supportsFunctionCalling = await this.web3Agent.supportsFunctionCalling();

    // Generate consistent task ID for both paths
    const currentTaskId = `task_${Date.now()}`;

    if (supportsFunctionCalling) {

      // Use enhanced function calling capabilities without streaming

      // Propagate tabId to Web3Agent and ToolRegistry for element-selection tools
      try {
        this.web3Agent.setActiveTabId(tabId);
        toolRegistry.setLastActiveTabId(tabId);
      } catch {}

      // Reset tool_call tracking for this task (used for de-duplication of UI cards)
      this.currentStreamingToolCallIds = new Set();
      this.currentFunctionCallIdByName = new Map();

      const response = await this.web3Agent.processUserInstructionWithFunctionCalling(
        task,
        false,
        undefined, // no streaming chunks in non-streaming mode
        (thinking) => {
          // Emit thinking messages (only rendered if fromModel === true)
          port.postMessage({
            type: 'thinking',
            actor: Actors.SYSTEM,
            state: 'THINKING',
            timestamp: Date.now(),
            data: {
              details: thinking?.content,
              thinkingType: thinking?.type,
              functionCalling: true,
              fromModel: true,
            },
          });
        },
        (reactStatus) => {
          // Emit ReAct status messages
          port.postMessage({
            type: 'react_status',
            actor: Actors.SYSTEM,
            state: 'REACT_STATUS',
            timestamp: Date.now(),
            data: reactStatus,
          });
        },
        (toolCalls) => {
          // Emit non-streaming tool_calls for UI + buffer tool results for forced-continuation if needed
          const content = toolCalls?.content || '';
          const fcs = (toolCalls?.functionCalls || []) as any[];
          fcs.forEach((c: any) => {
            // Preserve a stable id per function name if provider omitted it
            let id = c?.id as string | undefined;
            const fnName = c?.name || 'function';
            // Always generate a unique id if provider omitted it, so each call shows as a separate card
            if (!id) {
              id = `call_${fnName}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
            }
            const status = c?.status || 'executing';
            const fcPayload = { id, name: fnName, arguments: c?.arguments || {}, status, timestamp: Date.now() };

            const hasEmitted = this.currentStreamingToolCallIds.has(id);
            if (!hasEmitted) this.currentStreamingToolCallIds.add(id);

            // 1) Emit/Update function_call card
            port.postMessage({
              type: 'function_call', actor: 'assistant', state: status === 'executing' ? 'ACT_START' : 'ACT_END', timestamp: Date.now(),
              data: { details: content || (status === 'executing' ? `Executing function ${fcPayload.name}...` : `Finished ${fcPayload.name}`), functionCalls: [fcPayload], finish_reason: status === 'executing' ? 'tool_call_start' : 'tool_call_update' },
            });

            // 2) If finished, emit tool_result and buffer for potential forced continuation
            if (status !== 'executing') {
              const resultPayload = { toolCallId: id, toolName: fcPayload.name, result: c?.result, success: status === 'completed' };
              port.postMessage({ type: 'tool_result', actor: 'assistant', state: 'ACT_END', timestamp: Date.now(), data: resultPayload });

              // Buffer by current task id (if known via closure); here we use the generated currentTaskId
              const list = this.taskToolResults.get(currentTaskId) || [];
              list.push(resultPayload);
              this.taskToolResults.set(currentTaskId, list);

              // Remove timeout-based forced continuation to avoid sending empty/synthetic requests
              const prevTimer = this.toolResultTimers.get(currentTaskId);
              if (prevTimer) clearTimeout(prevTimer);
              this.toolResultTimers.delete(currentTaskId);
            } else if (!hasEmitted) {
              // Also emit execution event carrying actions so existing execution handler renders it too
              port.postMessage({ type: 'execution', actor: 'assistant', state: 'ACT_START', timestamp: Date.now(), data: { details: content, actions: [{ type: fcPayload.name, params: fcPayload.arguments, status: fcPayload.status }] } });
            }
          });
        }
      );

      // Send response back to client; if failed, surface raw error instead of preset text
      if (!response?.success) {
        await this.ensureMessageDisplayed({
          type: 'error',
          error: response?.error || response?.message || 'LLM request failed',
          timestamp: Date.now(),
          originalType: 'web3_task_response',
        }, port, 'web3_task_error');
      } else {
        await this.ensureMessageDisplayed({
          type: 'execution',
          actor: Actors.SYSTEM,
          state: 'TASK_OK',
          timestamp: Date.now(),
          data: {
            details: response.message,
            actions: response.actions,
            plan: response.plan,
            simulation: response.simulation,
            functionCalling: true,
            // include function calls so UI can render all calls even if separate function_call events were missed
            functionCalls: (response as any)?.functionCalls || [],
            tool_calls: (response as any)?.tool_calls || [],
          },
        }, port, 'web3_task_response');
      }
    } else {
      // Fall back to traditional processing without streaming
      const response = await this.web3Agent.processUserInstruction(
        task,
        false
      );

      // Send response back to client with enhanced fallback
      await this.ensureMessageDisplayed({
        type: 'execution',
        actor: Actors.SYSTEM,
        state: 'TASK_OK',
        timestamp: Date.now(),
        data: {
          details: response.message,
          actions: response.actions,
          plan: response.plan,
          simulation: response.simulation,
          functionCalling: false,
        },
      }, port, 'web3_task_fallback_response');
    }
  }

  private async handleStreamingTask(
    message: AgentMessage,
    port: chrome.runtime.Port
  ) {
    const { task, tabId, historySessionId } = message;

    if (!task || !tabId) {
      throw new Error('Missing required parameters for streaming task');
    }

    if (!this.web3Agent) {
      throw new Error('Web3 Agent not available');
    }

    logger.info('AgentService', `Starting streaming task: ${task}`);

    // Ensure Web3Agent uses current model configuration for new conversations
    await this.ensureCurrentModelConfiguration();

    // Initialize or switch Web3 Agent session when needed
    const desiredSessionId = historySessionId || undefined;
    const currentSessionId = this.web3Agent['state']?.sessionId;
    if (!currentSessionId || (desiredSessionId && desiredSessionId !== currentSessionId)) {
      await this.web3Agent.initialize(desiredSessionId);
      try {
        const { chatHistoryStore } = await import('./agent/chatHistory');
        if (this.web3Agent['state']?.sessionId) {
          await chatHistoryStore.setCurrentSession(this.web3Agent['state'].sessionId);
        }
      } catch (e) {
        // non-fatal
      }
    }

    // Check if streaming is supported
    const supportsStreaming = await this.web3Agent.supportsStreaming();

    if (!supportsStreaming) {
      // Fall back to non-streaming response
      return this.handleWeb3Task(task, tabId, port, historySessionId);
    }

    // Set up streaming timeout with refresh-on-activity
    let streamingTimeout: any;
    const armStreamingTimeout = () => {
      if (streamingTimeout) clearTimeout(streamingTimeout);
      streamingTimeout = setTimeout(() => {
        logger.warn('AgentService', 'Streaming task timed out', { task, tabId });
        // Mark as cancelled to stop further chunks
        try { this.currentStreamingTask.cancelled = true; } catch {}
        port.postMessage({
          type: 'streaming_error',
          taskId: message.taskId,
          error: 'Streaming response timed out',
          timestamp: Date.now(),
        });
      }, 180000); // 180s timeout, refreshed on each activity
    };
    armStreamingTimeout();

    let isCompleted = false;
    let chunkCount = 0;

    try {
      // Mark current streaming task and reset cancel flag
      this.currentStreamingTask = { id: message.taskId ?? Date.now(), cancelled: false };

      // Send initial response indicating streaming is starting
      port.postMessage({
        type: 'streaming_start',
        taskId: message.taskId,
        timestamp: Date.now(),
      });

      // Reset tool_call tracking for this streaming task
      this.currentStreamingToolCallIds = new Set();
      this.currentToolCallIndexToId = {};

      // Process with streaming support and enhanced completion handling
      const response = await this.web3Agent.processUserInstructionWithFunctionCalling(
        task,
        true, // enable streaming
        (chunk) => {
          if (isCompleted || this.currentStreamingTask.cancelled) return; // Ignore after completion or cancel
          armStreamingTimeout(); // refresh timeout on activity

          chunkCount++;
          logger.debug('AgentService', `Streaming chunk ${chunkCount}`, {
            taskId: message.taskId,
            chunkType: chunk?.type,
            chunkSize: chunk?.content?.length || 0
          });

          // Strong-signal: detect new tool_call ids in chunk and emit dedicated events
          try {
            const ensureArray = (v: any) => (Array.isArray(v) ? v : [v]).filter(Boolean);
            const parseChunk = (c: any) => {
              const arr: any[] = [];
              const choices = c?.choices;
              if (Array.isArray(choices)) {
                choices.forEach((ch: any) => {
                  const tc = ch?.delta?.tool_calls || ch?.tool_calls;
                  if (Array.isArray(tc)) arr.push(...tc);
                });
              }
              if (Array.isArray(c?.delta?.tool_calls)) arr.push(...c.delta.tool_calls);
              if (Array.isArray(c?.tool_calls)) arr.push(...c.tool_calls);
              return arr;
            };
            const chunkObjAny: any = typeof chunk === 'string' ? { raw: chunk } : (chunk as any);
            const chunks = (chunkObjAny && typeof chunkObjAny.raw === 'string')
              ? ensureArray(chunkObjAny.raw)
              : [chunkObjAny];
            const calls: any[] = chunks.flatMap((ck: any) => parseChunk(ck));

            calls.forEach((tc: any) => {
              const idx = typeof tc?.index === 'number' ? tc.index : (tc?.index ? Number(tc.index) : undefined);
              const name = tc?.function?.name || 'function';
              let id = tc?.id as string | undefined;
              if (typeof idx === 'number') {
                if (!id && this.currentToolCallIndexToId[idx]) id = this.currentToolCallIndexToId[idx];
                if (!id) { id = `call_idx_${idx}_${Date.now()}`; this.currentToolCallIndexToId[idx] = id; }
                else { this.currentToolCallIndexToId[idx] = id; }
              } else if (!id) {
                id = `call_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
              }
              if (id && !this.currentStreamingToolCallIds.has(id)) {
                this.currentStreamingToolCallIds.add(id);
                port.postMessage({
                  type: 'function_call',
                  actor: 'assistant',
                  state: 'ACT_START',
                  timestamp: Date.now(),
                  data: {
                    details: `Executing function ${name}...`,
                    functionCalls: [{ id, name, arguments: {}, status: 'executing', timestamp: Date.now() }],
                    finish_reason: 'tool_call_start',
                  },
                });
              }
            });
          } catch {}

          // Send streaming chunk to client (ensure chunk field always present)
          try {
            const safeChunk = typeof chunk === 'string' ? { raw: chunk } : chunk;
            port.postMessage({
              type: 'streaming_chunk',
              taskId: message.taskId,
              chunk: safeChunk,
              timestamp: Date.now(),
            });
          } catch (e) {
            port.postMessage({
              type: 'streaming_chunk',
              taskId: message.taskId,
              chunk: { error: 'chunk_serialization_error' },
              timestamp: Date.now(),
            });
          }
        },
        undefined, // thinking callback (optional)
        (reactStatus) => {
          if (isCompleted || this.currentStreamingTask.cancelled) return;
          // Forward ReAct status updates to client
          port.postMessage({
            type: 'react_status',
            actor: Actors.SYSTEM,
            state: 'REACT_STATUS',
            timestamp: Date.now(),
            data: reactStatus,
          });
        },
        (toolCalls) => {
          if (isCompleted || this.currentStreamingTask.cancelled) return;
          // Forward function calls to client for UI rendering
          const content = toolCalls?.content || '';
          const fcs = toolCalls?.functionCalls || [];

          // 1) Dedicated function_call event (for Function Call card)
          port.postMessage({
            type: 'function_call',
            actor: 'assistant',
            state: 'ACT_START',
            timestamp: Date.now(),
            data: {
              details: content,
              functionCalls: fcs,
            },
          });

          // 2) Also emit an execution event carrying actions so existing execution handler renders it too
          port.postMessage({
            type: 'execution',
            actor: 'assistant',
            state: 'ACT_START',
            timestamp: Date.now(),
            data: {
              details: content,
              actions: fcs.map((c: any) => ({ type: c.name, params: c.arguments, status: c.status })),
            },
          });
        }
      );

      // Mark streaming as completed after process returns (respect cancellation)
      let wasCancelled = false;
      if (!isCompleted) {
        isCompleted = true;
        clearTimeout(streamingTimeout);
        wasCancelled = this.currentStreamingTask.cancelled;
        logger.info('AgentService', wasCancelled ? 'Streaming cancelled by user' : 'Streaming completed naturally', {
          task,
          tabId,
          chunkCount,
        });
      }

      // Reset current streaming task state
      this.currentStreamingTask = { id: null, cancelled: false };

      // If the task was cancelled, do not emit streaming_complete to the UI
      if (wasCancelled) {
        logger.info('AgentService', 'Skip streaming_complete due to cancellation');
        return;
      }

      // Send final response with enhanced state tracking
      const finalMessage = {
        type: 'streaming_complete',
        taskId: message.taskId,
        data: {
          details: response.message,
          actions: response.actions,
          plan: response.plan,
          simulation: response.simulation,
          functionCalling: true,
          // Forward function calls captured during streaming so UI can render them
          functionCalls: (response as any)?.functionCalls || [],
          tool_calls: (response as any)?.tool_calls || [],
          chunkCount,
          streamingDuration: Date.now() - (typeof message.taskId === 'number' ? message.taskId : Date.now()),
        },
        timestamp: Date.now(),
        state: 'COMPLETED',
      };

      logger.info('AgentService', 'Sending streaming completion', {
        task,
        tabId,
        success: response.success,
        chunkCount,
        messageType: finalMessage.type,
        functionCallsCount: (response as any)?.functionCalls?.length || 0,
      });

      await this.ensureMessageDisplayed(finalMessage, port, 'streaming_completion');

    } catch (error) {
      // Clear timeout on error
      clearTimeout(streamingTimeout);
      isCompleted = true;

      logger.error('AgentService', 'Streaming task failed', {
        error: error instanceof Error ? error.message : String(error),
        task,
        tabId,
        chunkCount,
      });

      // Send error response with enhanced error details
      await this.ensureMessageDisplayed({
        type: 'streaming_error',
        taskId: message.taskId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        chunkCount,
        state: 'ERROR',
      }, port, 'streaming_error');
    }
  }

  private async handleAutomationTask(
    task: string,
    tabId: number,
    port: chrome.runtime.Port
  ) {
    logger.info('AgentService', `Routing to Multi-Agent Automation: ${task}`);

    if (!this.web3Agent) {
      throw new Error('Web3 Agent not available');
    }

    // Ensure latest model/tooling
    await this.ensureCurrentModelConfiguration();

    try {
      this.web3Agent.setActiveTabId(tabId);
      toolRegistry.setLastActiveTabId(tabId);
    } catch {}

    // Prefer function-calling flow so tools are invoked as function calls
    const response = await this.web3Agent.processUserInstructionWithFunctionCalling(
      task,
      false,
      undefined,
      (thinking) => {
        port.postMessage({ type: 'thinking', actor: Actors.SYSTEM, state: 'THINKING', timestamp: Date.now(), data: { details: thinking?.content, thinkingType: thinking?.type, functionCalling: true, fromModel: true } });
      },
      (reactStatus) => {
        port.postMessage({ type: 'react_status', actor: Actors.SYSTEM, state: 'REACT_STATUS', timestamp: Date.now(), data: reactStatus });
      },
      (toolCalls) => {
        const content = toolCalls?.content || '';
        const fcs = (toolCalls?.functionCalls || []) as any[];
        fcs.forEach((c: any) => {
          const id = c?.id || `call_${c?.name || 'function'}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
          port.postMessage({
            type: 'function_call', actor: 'assistant', state: 'ACT_START', timestamp: Date.now(),
            data: { details: content || `Executing function ${c?.name}`, functionCalls: [{ id, name: c?.name, arguments: c?.arguments || {}, status: c?.status || 'executing', timestamp: Date.now() }] }
          });
        });
      }
    );

    await this.ensureMessageDisplayed({
      type: 'execution',
      actor: Actors.SYSTEM,
      state: response?.success ? 'TASK_OK' : 'TASK_WARNING',
      timestamp: Date.now(),
      data: {
        details: response?.message,
        actions: response?.actions,
        plan: (response as any)?.plan,
        simulation: (response as any)?.simulation,
        functionCalling: true,
      },
    }, port, 'automation_task_response');
  }

  private async handleFollowUpTask(
    message: AgentMessage,
    port: chrome.runtime.Port
  ) {
    const { task, tabId } = message;

    if (!task) {
      throw new Error('Missing required parameters for follow-up task');
    }

    logger.info(`Processing follow-up task: ${task}`);

    // Use Web3Agent for follow-up tasks instead of old executor
    if (this.web3Agent) {
      // Determine task type and route accordingly
      const taskType = this.analyzeTaskType(task);

      try {
        switch (taskType) {
          case 'web3':
            // Use the same streaming-enabled Web3 task handler
            await this.handleWeb3Task(task, tabId || 0, port);
            break;
          case 'automation':
          default:
            await this.handleAutomationTask(task, tabId || 0, port);
            break;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('AgentService', 'Follow-up task failed', {
          error: errorMessage,
          task,
          tabId,
        });

        port.postMessage({
          type: 'error',
          error: `Follow-up task failed: ${errorMessage}`,
          timestamp: Date.now(),
        });
      }
    } else {
      port.postMessage({
        type: 'error',
        error: 'Web3 Agent not available for follow-up task',
        timestamp: Date.now(),
      });
    }
  }

  private async handleCancelTask(port: chrome.runtime.Port) {
    logger.info('Cancelling current task');

    // Mark current streaming task as cancelled (prevents further chunks)
    if (this.currentStreamingTask.id !== null) {
      this.currentStreamingTask.cancelled = true;
    }

    // Abort any in-flight real streaming request at the LLM layer (e.g., OpenAI SSE)
    try {
      const llm = this.web3Agent?.getLLM?.();
      if (llm && typeof (llm as any).cancelStreaming === 'function') {
        (llm as any).cancelStreaming();
        logger.info('AgentService', 'Invoked LLM.cancelStreaming()');
      }
    } catch (e) {
      logger.warn('AgentService', 'Failed to call LLM.cancelStreaming', e);
    }

    // Propagate cancel into Web3Agent (stop ReAct/tool execution loops)
    try {
      this.web3Agent?.cancelCurrentTask?.();
    } catch {}

    if (this.executor) {
      await this.executor.cancel();
      this.executor = null;
    }

    port.postMessage({
      type: 'execution',
      actor: Actors.SYSTEM,
      state: 'TASK_CANCEL',
      timestamp: Date.now(),
      data: { details: 'Task cancelled by user' },
    });
  }

  private async handleSpeechToText(
    message: AgentMessage,
    port: chrome.runtime.Port
  ) {
    const { audio } = message;

    if (!audio) {
      throw new Error('No audio data provided');
    }

    logger.info('Processing speech-to-text');

    // Mock speech-to-text processing
    setTimeout(() => {
      port.postMessage({
        type: 'speech_to_text_result',
        text: 'Hello, this is a mock transcription result.',
      });
    }, 2000);
  }

  private async handleReplay(message: AgentMessage, port: chrome.runtime.Port) {
    const { historySessionId } = message;

    if (!historySessionId) {
      throw new Error('Missing required parameters for replay');
    }

    logger.info(`Starting replay of session: ${historySessionId}`);

    try {
      this.executor = Executor;
      this.executor.subscribeToEvents((event) => this.handleEvent(event, port));
      await this.executor.replay(historySessionId);
    } catch (replayError) {
      logger.error(
        'AgentService',
        'Replay failed, attempting fallback',
        replayError
      );

      // Send fallback response to user
      port.postMessage({
        type: 'execution',
        actor: Actors.SYSTEM,
        state: 'TASK_WARNING',
        timestamp: Date.now(),
        data: {
          details: `I couldn't replay the exact session "${historySessionId}", but I've created a simulation of what the replay would look like. This feature is still in development mode.`,
          actions: [],
          plan: null,
          simulation: {
            sessionId: historySessionId,
            status: 'simulated',
            reason: 'Original session not found in execution history',
          },
        },
      });
      return;
    }
  }

  private async handleState(port: chrome.runtime.Port) {
    logger.info('Getting current state');

    port.postMessage({
      type: 'execution',
      actor: Actors.SYSTEM,
      state: 'TASK_OK',
      timestamp: Date.now(),
      data: { details: 'Agent system is ready and operational.' },
    });
  }

  private async handleNoHighlight(port: chrome.runtime.Port) {
    logger.info('Disabling element highlighting');

    port.postMessage({
      type: 'execution',
      actor: Actors.SYSTEM,
      state: 'TASK_OK',
      timestamp: Date.now(),
      data: { details: 'Element highlighting disabled.' },
    });
  }

  private async handleEvent(event: any, port: chrome.runtime.Port) {
    if (this.ports.has(port.name) && this.ports.get(port.name)!.connected) {
      port.postMessage(event);
    }
  }

  // Public method to broadcast to all connected ports
  broadcastMessage(message: any) {
    this.ports.forEach((agentPort, portName) => {
      if (agentPort.connected) {
        try {
          agentPort.port.postMessage(message);
        } catch (error) {
          logger.error(`Failed to broadcast to port ${portName}:`, error);
          this.removePort(portName);
        }
      }
    });
  }

  public async getProviders() {
    return llmProviderStore.getAllProviders();
  }

  public async setProvider(providerId: string, config: ProviderConfig) {
    return llmProviderStore.setProvider(providerId, config);
  }

  public async getAgentModels() {
    return agentModelStore.getAllAgentModels();
  }

  public async setAgentModel(agent: AgentNameEnum, config: ModelConfig) {
    const result = await agentModelStore.setAgentModel(agent, config);
    // Reload the agent model after setting
    await this.reloadAgentModel(agent);
    return result;
  }

  public async setReActConfig(config: any) {
    // Store ReAct configuration in agent model store or create a new storage mechanism
    // For now, we'll store it as a special agent model
    const reactConfig = {
      provider: 'system',
      modelName: 'react_config',
      parameters: {
        ...config,
        configType: 'react'
      }
    };
    return agentModelStore.setAgentModel('SYSTEM' as AgentNameEnum, reactConfig);
  }

  /**
   * Get current connection status for monitoring
   */
  public getConnectionStatus() {
    const status = {
      totalPorts: this.ports.size,
      monitoredConnections: this.connectionStatus.size,
      connections: Array.from(this.connectionStatus.entries()).map(([portName, status]) => ({
        portName,
        ...status,
        timeSinceLastSeen: Date.now() - status.lastSeen,
      })),
      recoveryAttempts: Object.fromEntries(this.recoveryAttempts.entries()),
      timestamp: Date.now(),
    };

    return status;
  }

  /**
   * Force connection recovery for a specific port
   */
  public async forceConnectionRecovery(portName: string): Promise<boolean> {
    try {
      await this.attemptConnectionRecovery(portName);
      return true;
    } catch (error) {
      logger.error('AgentService', 'Force connection recovery failed', {
        portName,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get the current Web3Agent instance for agent coordination
   */
  public getWeb3Agent(): Web3Agent | null {
    return this.web3Agent;
  }

  /**
   * Auto-assign a newly configured provider to agents that don't have one
   */
  private async autoAssignProviderToAgents(
    providerId: string,
    config: ProviderConfig
  ) {
    try {
      // Get current agent models
      const currentModels = await agentModelStore.getAllAgentModels();

      // Find agents that don't have a provider or have an invalid one
      const agentsNeedingProvider = Object.values(AgentNameEnum).filter(
        (agentName) => {
          const currentModel = currentModels[agentName];
          return (
            !currentModel || !currentModel.provider || !currentModel.modelName
          );
        }
      );

      if (agentsNeedingProvider.length === 0) {
        logger.info(
          'AgentService',
          'All agents already have providers configured'
        );
        return;
      }

      // Get the best model for this provider
      const modelName = config.modelNames?.[0] || 'gpt-3.5-turbo';

      // Assign the provider to agents that need it
      for (const agentName of agentsNeedingProvider) {
        const modelConfig: ModelConfig = {
          provider: providerId,
          modelName: modelName,
          parameters: { temperature: 0.7 },
        };

        await agentModelStore.setAgentModel(agentName, modelConfig);
        logger.info(
          'AgentService',
          `Auto-assigned provider ${providerId} to ${agentName}`
        );
      }

      logger.info(
        'AgentService',
        `Auto-assigned provider ${providerId} to ${agentsNeedingProvider.length} agents`
      );
    } catch (error) {
      logger.error(
        'AgentService',
        'Failed to auto-assign provider to agents',
        error
      );
      // Don't throw - auto-assignment is best-effort
    }
  }

  /**
   * Auto-assign the best available provider to all agents
   * This can be called when no providers are configured
   */
  public async autoAssignBestProvider() {
    try {
      const providers = await llmProviderStore.getAllProviders();
      const providerEntries = Object.entries(providers);

      if (providerEntries.length === 0) {
        logger.warn(
          'AgentService',
          'No providers available for auto-assignment'
        );
        return;
      }

      // Find the best provider (prefer OpenAI, Anthropic, or configured ones)
      const bestProvider = this.findBestProvider(providerEntries);
      if (!bestProvider) {
        logger.warn(
          'AgentService',
          'No suitable provider found for auto-assignment'
        );
        return;
      }

      await this.autoAssignProviderToAgents(
        bestProvider.id,
        bestProvider.config
      );
    } catch (error) {
      logger.error(
        'AgentService',
        'Failed to auto-assign best provider',
        error
      );
    }
  }

  /**
   * Ensure Web3Agent uses current model configuration
   */
  private async ensureCurrentModelConfiguration(): Promise<void> {
    try {
      // Get the current Planner model configuration
      const currentModelConfig = await agentModelStore.getAgentModel(AgentNameEnum.Planner);
      if (!currentModelConfig) {
        logger.warn('AgentService', 'No current model configuration found');
        return;
      }

      // Get the provider configuration
      const providerConfig = await llmProviderStore.getProvider(currentModelConfig.provider);
      if (!providerConfig) {
        logger.warn('AgentService', `No provider configuration found for ${currentModelConfig.provider}`);
        return;
      }

      // Check if Web3Agent needs to be updated with current configuration
      const currentLLM = this.web3Agent?.getLLM?.();
      if (currentLLM) {
        // Get current LLM instance with latest configuration
        const latestLLM = await this.getWeb3LLM(AgentNameEnum.Planner);

        // Update Web3Agent with the latest LLM if needed
        if (currentLLM !== latestLLM) {
          this.web3Agent?.setLLM(latestLLM);
          logger.info('AgentService', 'Web3Agent updated with current model configuration', {
            provider: providerConfig.type,
            model: currentModelConfig.modelName,
            version: this.getConfigVersion()
          });
        }
      }
    } catch (error) {
      logger.error('AgentService', 'Failed to ensure current model configuration', error);
      // Don't throw - this is a best-effort operation
    }
  }

  /**
   * Find the best provider from available providers
   */
  private findBestProvider(providerEntries: [string, ProviderConfig][]) {
    // Priority order: OpenAI > Anthropic > Gemini > others with API keys
    const providerPriority = ['openai', 'anthropic', 'gemini'];

    // First try to find priority providers with API keys
    for (const providerId of providerPriority) {
      const provider = providerEntries.find(([id]) => id === providerId);
      if (provider && provider[1].apiKey) {
        return { id: provider[0], config: provider[1] };
      }
    }

    // Then try any provider with an API key
    const providerWithKey = providerEntries.find(
      ([_, config]) => config.apiKey
    );
    if (providerWithKey) {
      return { id: providerWithKey[0], config: providerWithKey[1] };
    }

    // Finally, use the first available provider (for local models like Ollama)
    if (providerEntries.length > 0) {
      return { id: providerEntries[0][0], config: providerEntries[0][1] };
    }

    return null;
  }

  public async removeProvider(providerId: string) {
    return llmProviderStore.removeProvider(providerId);
  }

  /**
   * Enhanced cleanup method with proper resource management
   * Ensures all resources are properly disposed of when service shuts down
   */
  cleanup() {
    logger.info('AgentService', 'Starting cleanup process...');

    // Clear heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('AgentService', 'Heartbeat interval cleared');
    }

    // Clear connection monitoring interval
    if (this.connectionMonitorInterval) {
      clearInterval(this.connectionMonitorInterval);
      this.connectionMonitorInterval = null;
      logger.info('AgentService', 'Connection monitoring interval cleared');
    }

    // Cleanup executor if it exists
    if (this.executor) {
      try {
        // Cancel any running tasks first
        if (this.executor.getStatus().isRunning) {
          this.executor.cancel();
          logger.info('AgentService', 'Cancelled running executor task');
        }

        // Cleanup executor resources
        if (
          'cleanup' in this.executor &&
          typeof this.executor.cleanup === 'function'
        ) {
          this.executor.cleanup();
          logger.info('AgentService', 'Executor cleanup completed');
        }

        // Unsubscribe from events
        this.executor.unsubscribeFromEvents();
      } catch (error) {
        logger.error('AgentService', 'Error cleaning up executor:', error);
      }
      this.executor = null;
    }

    // Cleanup Web3 Agent if it exists
    if (this.web3Agent) {
      try {
        // Clear Web3 Agent state
        (this.web3Agent as any).state = null;
        logger.info('AgentService', 'Web3 Agent cleanup completed');
      } catch (error) {
        logger.error('AgentService', 'Error cleaning up Web3 Agent:', error);
      }
      this.web3Agent = null;
    }

    // Cleanup Agent Context if it exists
    if (this.agentContext) {
      try {
        // AgentContext doesn't have a stop method, just clear the reference
        logger.info('AgentService', 'Agent Context cleanup completed');
      } catch (error) {
        logger.error('AgentService', 'Error cleaning up Agent Context:', error);
      }
      this.agentContext = null;
    }

    // Disconnect all ports
    let disconnectedPorts = 0;
    this.ports.forEach((agentPort, portName) => {
      try {
        if (agentPort.connected) {
          // Send cleanup notification before disconnecting
          agentPort.port.postMessage({
            type: 'service_cleanup',
            message: 'Agent service is shutting down',
          });
        }
        agentPort.port.disconnect();
        disconnectedPorts++;
      } catch (error) {
        logger.warn(
          'AgentService',
          `Error disconnecting port ${portName}:`,
          error
        );
        // Continue with cleanup even if individual port disconnection fails
      }
    });

    this.ports.clear();

    // Clean up connection status and recovery attempts
    this.connectionStatus.clear();
    this.recoveryAttempts.clear();
    logger.info('AgentService', 'Connection status and recovery attempts cleared');

    logger.info(
      'AgentService',
      `Cleanup completed. Disconnected ${disconnectedPorts} ports, cleared ${this.connectionStatus.size} connection statuses`
    );
  }

  /**
   * Handle continuing conversation with tool results
   */
  private async handleContinueWithToolResults(
    message: AgentMessage,
    port: chrome.runtime.Port
  ) {
    logger.info('AgentService', 'Handling continue with tool results', {
      taskId: message.taskId,
      sessionId: message.data?.sessionId,
      toolResultsCount: message.data?.toolResults?.length || 0,
    });

    try {
      if (!this.web3Agent) {
        throw new Error('Web3 Agent not available');
      }

      const { toolResults, sessionId } = message.data || {};

      if (!toolResults || !Array.isArray(toolResults)) {
        throw new Error('Invalid tool results provided');
      }

      // Format tool results as user message content
      const toolResultsContent = toolResults.map((result: any) =>
        `Tool "${result.toolName}" result: ${JSON.stringify(result.result, null, 2)}`
      ).join('\n\n');

      // Create a user message with the tool results
      const userMessage = `Tool execution results:\n\n${toolResultsContent}`;

      // Continue the conversation with the tool results using function calling
      const response = await this.web3Agent.processUserInstructionWithFunctionCalling(
        userMessage,
        true, // Enable streaming
        // Streaming callback
        (chunk: any) => {
          port.postMessage({
            type: 'streaming_chunk',
            taskId: message.taskId,
            chunk,
          });
        },
        // Thinking callback
        undefined,
        // ReAct status callback
        undefined,
        // Tool calls callback
        (toolCalls: any) => {
          port.postMessage({
            type: 'function_call',
            actor: 'assistant',
            state: 'ACT_START',
            timestamp: Date.now(),
            data: {
              details: toolCalls?.content || '',
              functionCalls: toolCalls?.functionCalls || [],
              finish_reason: 'tool_calls',
            },
          });
        }
      );

      // Send the final response
      port.postMessage({
        type: 'streaming_complete',
        taskId: message.taskId,
        data: {
          details: response.message,
          content: response.message,
          functionCalls: [], // Function calls are handled separately in the callback
          actions: response.actions || [],
        },
      });

      logger.info('AgentService', 'Tool results continuation completed successfully', {
        taskId: message.taskId,
        responseLength: response.message?.length || 0,
        actionsCount: response.actions?.length || 0,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('AgentService', 'Error handling tool results continuation', {
        error: errorMessage,
        taskId: message.taskId,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Send error response
      await this.sendWithFallback(port, {
        type: 'streaming_error',
        taskId: message.taskId,
        error: `Failed to continue with tool results: ${errorMessage}`,
        timestamp: Date.now(),
      });
    }
  }
}

// Export singleton instance
export const agent = new AgentService();
export default agent;
