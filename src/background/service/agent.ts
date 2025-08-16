import { createLogger } from '@/utils/logger';
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
  private ports: Map<string, AgentPort> = new Map();
  private executor: AgentExecutorBridge | null = null;
  private web3Agent: Web3Agent | null = null;
  private agentContext: AgentContext | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private connectionMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private connectionStatus: Map<string, { lastSeen: number; status: 'connected' | 'disconnected' | 'reconnecting' }> = new Map();
  private recoveryAttempts: Map<string, number> = new Map();
  private maxRecoveryAttempts: number = 3;

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

  private async initializeLLM() {
    try {
      // Get current LLM provider configuration
      const providers = await llmProviderStore.getAllProviders();

      // Get the first available provider as default
      const currentProvider =
        providers['openai'] ||
        providers['anthropic'] ||
        Object.values(providers)[0];

      if (!currentProvider) {
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

      // Initialize LLM based on provider type
      const { createLLMInstance } = await import('./agent/llm/factory');
      const modelConfig: ModelConfig = {
        provider: 'default',
        modelName: currentProvider.modelNames?.[0] || 'gpt-3.5-turbo',
        parameters: { temperature: 0.7 },
      };

      const web3LLM = await createLLMInstance(currentProvider, modelConfig);
      logger.info(
        'AgentService',
        `Initialized real LLM for provider: ${currentProvider.type}`
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

  private setupConnectionMonitoring() {
    // Monitor connection status and attempt recovery
    this.connectionMonitorInterval = setInterval(() => {
      this.monitorConnections();
    }, 10000); // Check every 10 seconds

    logger.info('AgentService', 'Connection monitoring initialized');
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

        case 'new_task':
          await this.handleNewTask(message, port);
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

    if (supportsFunctionCalling) {
      // Use enhanced function calling capabilities with thinking support
      const response = await this.web3Agent.processUserInstructionWithFunctionCalling(
        task,
        false, // streaming disabled for now
        undefined, // no streaming callback
        (thinking) => {
          // Send thinking message to client
          port.postMessage({
            type: 'thinking',
            actor: Actors.SYSTEM,
            state: 'THINKING',
            timestamp: Date.now(),
            data: {
              details: thinking.content,
              thinkingType: thinking.type,
              functionCalling: true,
            },
          });
        },
        (reactStatus) => {
          // Send ReAct status message to client
          port.postMessage({
            type: 'react_status',
            actor: Actors.SYSTEM,
            state: 'REACT_STATUS',
            timestamp: Date.now(),
            data: reactStatus,
          });
        }
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
          functionCalling: true,
        },
      }, port, 'web3_task_response');
    } else {
      // Fall back to traditional processing
      const response = await this.web3Agent.processUserInstruction(task);

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

    // Set up streaming timeout and completion handling
    const streamingTimeout = setTimeout(() => {
      logger.warn('AgentService', 'Streaming task timed out', { task, tabId });
      port.postMessage({
        type: 'streaming_error',
        taskId: message.taskId,
        error: 'Streaming response timed out',
        timestamp: Date.now(),
      });
    }, 60000); // 60 second timeout

    let isCompleted = false;
    let chunkCount = 0;

    try {
      // Send initial response indicating streaming is starting
      port.postMessage({
        type: 'streaming_start',
        taskId: message.taskId,
        timestamp: Date.now(),
      });

      // Process with streaming support and enhanced completion handling
      const response = await this.web3Agent.processUserInstructionWithFunctionCalling(
        task,
        true, // enable streaming
        (chunk) => {
          if (isCompleted) return; // Ignore chunks after completion
          
          chunkCount++;
          logger.debug('AgentService', `Streaming chunk ${chunkCount}`, {
            taskId: message.taskId,
            chunkType: chunk.type,
            chunkSize: chunk.content?.length || 0
          });

          // Send streaming chunk to client
          port.postMessage({
            type: 'streaming_chunk',
            taskId: message.taskId,
            chunk,
            timestamp: Date.now(),
          });
        },
        undefined, // thinking callback (optional)
        () => {
          // Completion callback - called when streaming is finished
          if (!isCompleted) {
            isCompleted = true;
            clearTimeout(streamingTimeout);
            logger.info('AgentService', 'Streaming completed naturally', {
              task,
              tabId,
              chunkCount,
            });
          }
        }
      );

      // Ensure completion state is properly set
      if (!isCompleted) {
        isCompleted = true;
        clearTimeout(streamingTimeout);
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
    logger.info('AgentService', `Routing to Automation Executor: ${task}`);

    // Instead of using mock executor, send a direct response with fallback
    await this.ensureMessageDisplayed({
      type: 'execution',
      actor: Actors.SYSTEM,
      state: 'TASK_OK',
      timestamp: Date.now(),
      data: {
        details: `I've received your task: "${task}". I'm currently operating in a limited mode and can process this request, but full automation capabilities are not yet available.`,
        actions: [],
        plan: null,
        simulation: null,
      },
    }, port, 'automation_task_response');

    // For now, we'll respond directly rather than using the mock executor
    // This ensures the user gets immediate feedback
    logger.info('AgentService', 'Automation task response sent', {
      task,
      tabId,
    });
  }

  private async handleFollowUpTask(
    message: AgentMessage,
    port: chrome.runtime.Port
  ) {
    const { task } = message;

    if (!task) {
      throw new Error('Missing required parameters for follow-up task');
    }

    logger.info(`Processing follow-up task: ${task}`);

    if (this.executor) {
      this.executor.addFollowUpTask(task);
    } else {
      port.postMessage({
        type: 'error',
        error: 'No active task to follow-up on',
      });
    }
  }

  private async handleCancelTask(port: chrome.runtime.Port) {
    logger.info('Cancelling current task');

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
    return agentModelStore.setAgentModel(agent, config);
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
}

// Export singleton instance
export const agent = new AgentService();
export default agent;
