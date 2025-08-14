import { Button } from 'antd';
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import MessageList from './components/MessageList';
import ChatInput from './components/ChatInput';
import ChatHistoryList from './components/ChatHistoryList';
import BookmarkList from './components/BookmarkList';
import Settings from './components/Settings';
import { ErrorBoundary } from './components/ErrorBoundary';
import IconButton from './components/IconButton';
import {
  StreamingMessage,
  useStreamingMessage,
} from './components/StreamingMessage';
import { AgentStatus, useAgentStatus } from './components/AgentStatus';
import { Message, Actors } from './types/message';
import { EventType, AgentEvent, ExecutionState } from './types/event';
import { chatHistoryStore } from '@/background/service/agent/chatHistory';
import favoritesStorage from '@/background/service/agent/storage/favorites';
import type { FavoritePrompt } from '@/background/service/agent/storage/favorites';
import './styles/SidePanelApp.less';
import './styles/MessageList.less';
import './styles/ChatInput.less';
import './styles/ChatHistoryList.less';
import './styles/BookmarkList.less';
import './styles/IconButton.less';
import {
  connectionMonitor,
  generateMessageId,
} from './utils/connectionMonitor';
import { logger } from './utils/logger';
import { DelayUtil, TIMING_CONSTANTS } from './utils/timing';

// Connection states for better tracking
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}

const COMPONENT_NAME = 'SidePanelApp';

export const SidePanelApp = () => {
  logger.info(COMPONENT_NAME, 'component_mount', {
    timestamp: Date.now(),
    readyState: document.readyState,
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputEnabled, setInputEnabled] = useState(true);
  const [showStopButton, setShowStopButton] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState(
    ConnectionState.CONNECTING
  );
  const [showHistory, setShowHistory] = useState(false);
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [isHistoricalSession, setIsHistoricalSession] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingSpeech, setIsProcessingSpeech] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [favoritePrompts, setFavoritePrompts] = useState<FavoritePrompt[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isFollowUpMode, setIsFollowUpMode] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasError, setHasError] = useState<string | null>(null);
  const [showAgentStatus, setShowAgentStatus] = useState(false);
  const [agentCapabilities, setAgentCapabilities] = useState<any>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const setInputTextRef = useRef<((text: string) => void) | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isConnectingRef = useRef(false);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const connectionRetryCount = useRef(0);
  const maxRetries = TIMING_CONSTANTS.MAX_RETRIES;
  const retryDelay = TIMING_CONSTANTS.RECONNECTION_BASE_DELAY;

  // Simplified message appender with minimal dependencies
  const appendMessage = useCallback(
    (newMessage: Message, sessionId?: string) => {
      logger.debug(COMPONENT_NAME, 'AppendMessage called', {
        actor: newMessage.actor,
        contentLength: newMessage.content.length,
      });
      setMessages((prev) => [...prev, newMessage]);
      const effectiveSessionId = sessionId || currentSessionId;
      if (effectiveSessionId) {
        try {
          chatHistoryStore.addMessage(effectiveSessionId, newMessage);
        } catch (error) {
          logger.warn(COMPONENT_NAME, 'Failed to save message to history', {
            error,
          });
        }
      }
    },
    [currentSessionId]
  );

  // Memoized task state handler with stable appendMessage dependency
  const handleTaskState = useCallback(
    (event: AgentEvent) => {
      const { actor, state, timestamp, data } = event;
      const content = data?.details;

      if (actor === Actors.SYSTEM) {
        if (
          state === ExecutionState.TASK_OK ||
          state === ExecutionState.TASK_FAIL ||
          state === ExecutionState.TASK_CANCEL ||
          // Also reset for any response that contains a message (indicates completion)
          (content && !state.startsWith('step_') && !state.startsWith('act_'))
        ) {
          setInputEnabled(true);
          setShowStopButton(false);
          setIsReplaying(false);
        }
        if (state === ExecutionState.TASK_OK) {
          setIsFollowUpMode(true);
        }
      }

      if (content) {
        appendMessage({
          actor: actor as Actors,
          content,
          timestamp,
        });
      }
    },
    [appendMessage]
  );

  // Helper function to log connection events
  const logEvent = useCallback((type: any, details?: any) => {
    connectionMonitor.logEvent(type, details);
  }, []);

  // Clean connection teardown
  const stopConnection = useCallback(() => {
    logger.debug(COMPONENT_NAME, 'Stopping connection');
    logEvent('disconnect', 'Stopping connection');

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (portRef.current) {
      try {
        portRef.current.disconnect();
      } catch (error) {
        logger.warn(COMPONENT_NAME, 'Error disconnecting port', { error });
        logEvent('error', { error: `Disconnect error: ${error}` });
      }
      portRef.current = null;
    }

    isConnectingRef.current = false;
  }, [logEvent]);

  // Validate runtime environment
  const validateEnvironment = useCallback((): boolean => {
    if (!chrome?.runtime?.connect) {
      logger.error(COMPONENT_NAME, 'Chrome runtime not available');
      logEvent('error', { error: 'Chrome runtime not available' });
      return false;
    }
    return true;
  }, [logEvent]);

  // Memoized message handlers with optimized dependencies
  const setupMessageHandlers = useCallback(
    (port: chrome.runtime.Port) => {
      port.onMessage.addListener((message: any) => {
        logEvent('message_received', { type: message.type });

        if (message.type === 'heartbeat_ack') {
          logEvent('heartbeat');
          return;
        }
        if (message.type === 'connected') {
          setConnectionStatus(ConnectionState.CONNECTED);
          connectionRetryCount.current = 0;
          logger.info(COMPONENT_NAME, 'Connected successfully');
          logEvent('connect', 'Connected successfully');
          return;
        }
        if (message && message.type === EventType.EXECUTION) {
          handleTaskState(message);
        } else if (message && message.type === 'error') {
          logger.error(COMPONENT_NAME, 'Received error message', {
            error: message.error,
          });
          logEvent('error', { error: message.error || 'Unknown error' });
          appendMessage({
            actor: Actors.SYSTEM,
            content: message.error || 'Unknown error occurred',
            timestamp: Date.now(),
          });
          setInputEnabled(true);
          setShowStopButton(false);
        } else if (message && message.type === 'streaming_start') {
          // Start streaming response
          const messageId = `streaming_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
          setStreamingMessageId(messageId);

          // Add initial streaming message
          appendMessage({
            actor: Actors.SYSTEM,
            content: '',
            timestamp: Date.now(),
            isStreaming: true,
            messageId,
            functionCalls: [],
          });

          logEvent('streaming_start', { taskId: message.taskId });
        } else if (message && message.type === 'streaming_chunk') {
          // Handle streaming chunk
          if (streamingMessageId && message.chunk) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.messageId === streamingMessageId
                  ? {
                      ...msg,
                      content:
                        (msg.content || '') + (message.chunk.content || ''),
                      functionCalls:
                        message.chunk.functionCalls || msg.functionCalls || [],
                    }
                  : msg
              )
            );
          }

          logEvent('streaming_chunk', {
            taskId: message.taskId,
            chunkType: message.chunk?.type,
          });
        } else if (message && message.type === 'streaming_complete') {
          // Complete streaming response
          if (streamingMessageId && message.data) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.messageId === streamingMessageId
                  ? {
                      ...msg,
                      content: message.data.details,
                      isStreaming: false,
                      functionCalls:
                        message.data.functionCalls || msg.functionCalls || [],
                    }
                  : msg
              )
            );
          }
          setStreamingMessageId(null);
          setInputEnabled(true);
          setShowStopButton(false);

          logEvent('streaming_complete', { taskId: message.taskId });
        } else if (message && message.type === 'streaming_error') {
          // Handle streaming error
          if (streamingMessageId) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.messageId === streamingMessageId
                  ? {
                      ...msg,
                      content: message.error || 'Streaming error occurred',
                      isStreaming: false,
                    }
                  : msg
              )
            );
          }
          setStreamingMessageId(null);
          setInputEnabled(true);
          setShowStopButton(false);

          logEvent('streaming_error', {
            taskId: message.taskId,
            error: message.error,
          });
        } else if (message && message.type === 'agent_capabilities') {
          // Update agent capabilities
          setAgentCapabilities(message.capabilities);
          logEvent('agent_capabilities', message.capabilities);
        } else if (message && message.type === 'available_tools') {
          // Update available tools
          logger.info('Available tools updated', `${message.tools?.length || 0} tools available`);
          logEvent('available_tools', { count: message.tools?.length || 0 });
        } else if (message && message.type === 'speech_to_text_result') {
          if (message.text && setInputTextRef.current) {
            logger.debug(COMPONENT_NAME, 'Speech recognition successful', {
              textLength: message.text.length,
            });
            setInputTextRef.current(message.text);
          }
          setIsProcessingSpeech(false);
        } else if (message && message.type === 'speech_to_text_error') {
          logger.error(COMPONENT_NAME, 'Speech recognition failed', {
            error: message.error,
          });
          logEvent('error', {
            error: message.error || 'Speech recognition failed',
          });
          appendMessage({
            actor: Actors.SYSTEM,
            content: message.error || 'Speech recognition failed',
            timestamp: Date.now(),
          });
          setIsProcessingSpeech(false);
        }
      });
    },
    [handleTaskState, appendMessage, logEvent]
  );

  const setupConnectionRef = useRef<() => void>();

  // Schedule reconnection with exponential backoff (moved before usage)
  const scheduleReconnection = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    connectionRetryCount.current += 1;
    const delay = retryDelay * Math.pow(2, connectionRetryCount.current - 1);

    logger.info(COMPONENT_NAME, 'Scheduling reconnection', {
      attempt: connectionRetryCount.current,
      delay,
      maxRetries,
    });
    logEvent('connect', {
      action: 'scheduling_reconnection',
      attempt: connectionRetryCount.current,
      delay,
      maxRetries,
    });

    setConnectionStatus(ConnectionState.RECONNECTING);

    reconnectTimeoutRef.current = window.setTimeout(() => {
      if (connectionRetryCount.current <= maxRetries) {
        setupConnectionRef.current?.();
      } else {
        setConnectionStatus(ConnectionState.FAILED);
        logger.error(COMPONENT_NAME, 'Max reconnection attempts reached', {
          attempts: connectionRetryCount.current,
        });
        logEvent('error', { error: 'Max reconnection attempts reached' });
      }
    }, delay);
  }, [logEvent]);

  // Memoized disconnect handlers with improved error handling
  const setupDisconnectHandlers = useCallback(
    (port: chrome.runtime.Port) => {
      port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        const errorMessage = error ? error.message : 'No error';

        logger.info(COMPONENT_NAME, 'Connection disconnected', {
          error: errorMessage,
          retryCount: connectionRetryCount.current,
          maxRetries,
        });
        logEvent('disconnect', { error: errorMessage });

        setConnectionStatus(ConnectionState.DISCONNECTED);
        portRef.current = null;
        setInputEnabled(true);
        setShowStopButton(false);
        isConnectingRef.current = false;

        // Attempt reconnection if not manually disconnected and under max retries
        if (connectionRetryCount.current < maxRetries) {
          logger.info(
            COMPONENT_NAME,
            'Scheduling reconnection after disconnect',
            {
              currentRetry: connectionRetryCount.current,
              maxRetries,
            }
          );
          scheduleReconnection();
        } else {
          logger.warn(COMPONENT_NAME, 'Max retries reached, not reconnecting', {
            retryCount: connectionRetryCount.current,
            maxRetries,
          });
        }
      });
    },
    [logEvent, scheduleReconnection]
  );

  // Setup heartbeat mechanism with improved error handling
  const setupHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = window.setInterval(() => {
      if (portRef.current) {
        try {
          portRef.current.postMessage({ type: 'heartbeat' });
          logEvent('message_sent', { type: 'heartbeat' });
        } catch (error) {
          logger.warn(COMPONENT_NAME, 'Heartbeat failed', { error });
          logEvent('error', { error: `Heartbeat failed: ${error}` });
          // Don't immediately stop connection, let the reconnect logic handle it
          if (connectionRetryCount.current < maxRetries) {
            scheduleReconnection();
          } else {
            stopConnection();
          }
        }
      } else {
        // Only attempt reconnection if we're not at max retries
        if (connectionRetryCount.current < maxRetries) {
          scheduleReconnection();
        }
      }
    }, TIMING_CONSTANTS.HEARTBEAT_INTERVAL);
  }, [stopConnection, logEvent, scheduleReconnection]);

  // Memoized connection setup with optimized dependencies
  const setupConnection = useCallback(() => {
    // Prevent multiple simultaneous connection attempts with singleton lock
    if (isConnectingRef.current) {
      logger.debug(
        COMPONENT_NAME,
        'Connection setup blocked - another setup is in progress'
      );
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (portRef.current) {
      logger.debug(
        COMPONENT_NAME,
        'Connection setup blocked - already connected',
        {
          hasPort: !!portRef.current,
        }
      );
      logEvent('connect', {
        action: 'blocked',
        reason: 'already_connected',
        hasPort: !!portRef.current,
      });
      return;
    }

    isConnectingRef.current = true;

    logger.debug(COMPONENT_NAME, 'Starting connection setup');
    logEvent('connect', { action: 'starting_setup' });
    setConnectionStatus(ConnectionState.CONNECTING);

    try {
      if (!validateEnvironment()) {
        throw new Error('Chrome runtime not available');
      }

      const port = chrome.runtime.connect({
        name: 'rabby-agent-connection',
      });

      portRef.current = port;

      setupMessageHandlers(port);
      setupDisconnectHandlers(port);
      setupHeartbeat();

      logger.info(COMPONENT_NAME, 'Connection established successfully');
      logEvent('connect', { action: 'established' });

      // Release the lock
      isConnectingRef.current = false;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(COMPONENT_NAME, 'Connection failed', {
        error: errorMessage,
      });
      logEvent('error', { error: `Connection failed: ${errorMessage}` });

      setConnectionStatus(ConnectionState.FAILED);

      // Release the lock
      isConnectingRef.current = false;

      appendMessage({
        actor: Actors.SYSTEM,
        content: 'Failed to connect to agent service',
        timestamp: Date.now(),
      });

      // Schedule retry if appropriate
      if (connectionRetryCount.current < maxRetries) {
        scheduleReconnection();
      }
    }
  }, [
    validateEnvironment,
    setupMessageHandlers,
    setupDisconnectHandlers,
    setupHeartbeat,
    logEvent,
    appendMessage,
    scheduleReconnection,
  ]);

  setupConnectionRef.current = setupConnection;

  // Initialize component with improved async handling
  useEffect(() => {
    let initializationCancelled = false;

    const initialize = async () => {
      try {
        logger.info(COMPONENT_NAME, 'Starting initialization', {
          timestamp: Date.now(),
          readyState: document.readyState,
          hasChrome: typeof chrome !== 'undefined',
        });
        logEvent('connect', { action: 'starting_initialization' });

        // Check environment
        if (typeof chrome === 'undefined') {
          throw new Error('Not running in Chrome extension environment');
        }

        // Wait for DOM to be ready and proper initialization
        await DelayUtil.wait(
          TIMING_CONSTANTS.INITIALIZATION_DELAY,
          'component initialization'
        );

        // Check if initialization was cancelled during the delay
        if (initializationCancelled) {
          logger.debug(COMPONENT_NAME, 'Initialization cancelled');
          logEvent('connect', { action: 'initialization_cancelled' });
          return;
        }

        // Additional wait for extension context to be fully ready
        await DelayUtil.wait(200, 'extension context ready');

        setupConnection();
        setIsInitialized(true);
        logger.info(COMPONENT_NAME, 'Initialization completed successfully');
        logEvent('connect', { action: 'initialization_completed' });
      } catch (error) {
        if (!initializationCancelled) {
          const errorMessage =
            error instanceof Error ? error.message : 'Initialization failed';
          logger.error(COMPONENT_NAME, 'Initialization error', {
            error: errorMessage,
          });
          logEvent('error', {
            error: `Initialization failed: ${errorMessage}`,
          });
          setHasError(errorMessage);
          setConnectionStatus(ConnectionState.FAILED);
          setIsInitialized(true);
        }
      }
    };

    initialize();

    return () => {
      initializationCancelled = true;
      logger.debug(COMPONENT_NAME, 'Component unmounting');
      logEvent('disconnect', { action: 'component_unmounting' });
      stopConnection();
    };
  }, []);

  // Verify button handlers are properly attached after initialization
  useEffect(() => {
    if (isInitialized) {
      const timeoutId = setTimeout(() => {
        const buttons = document.querySelectorAll(
          '.side-panel-app .header button'
        );
        logger.debug(COMPONENT_NAME, 'Button verification', {
          buttonCount: buttons.length,
          buttonsFound: Array.from(buttons).map((btn) =>
            btn.textContent?.trim()
          ),
        });

        // Test button clickability
        buttons.forEach((button, index) => {
          const isDisabled = (button as HTMLButtonElement).disabled;
          logger.debug(COMPONENT_NAME, `Button ${index + 1} state`, {
            text: button.textContent?.trim(),
            disabled: isDisabled,
            hasClickListener: (button as HTMLButtonElement).onclick !== null,
          });
        });
      }, TIMING_CONSTANTS.BUTTON_VERIFICATION_DELAY);

      return () => clearTimeout(timeoutId);
    }
  }, [isInitialized]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ========== OPTIMIZED MESSAGE HANDLING ==========
  // The following functions break down the large handleSendMessage into smaller,
  // focused helpers to improve maintainability and reduce dependency complexity.
  // Each function has a single responsibility and minimal dependencies.

  // Helper function to get active tab with fallback handling
  const getActiveTabId = useCallback(async (): Promise<number> => {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tabId = tabs[0]?.id;
      if (tabId) return tabId;
    } catch (tabQueryError) {
      logger.warn(COMPONENT_NAME, 'Failed to query active tabs', {
        error: tabQueryError,
      });
    }

    // Fallback: try to get any available tab
    try {
      const allTabs = await chrome.tabs.query({});
      const fallbackTabId =
        allTabs.find((tab) => tab.active)?.id || allTabs[0]?.id;
      if (fallbackTabId) return fallbackTabId;
    } catch (fallbackError) {
      logger.warn(COMPONENT_NAME, 'Fallback tab query failed', {
        error: fallbackError,
      });
    }

    throw new Error(
      'No active tab found. Please ensure a tab is open and try again.'
    );
  }, []);

  // Helper function to ensure connection is established
  const ensureConnection = useCallback(async (): Promise<void> => {
    if (portRef.current) return;

    setupConnection();

    await DelayUtil.waitUntil(
      () => !!portRef.current,
      TIMING_CONSTANTS.CONNECTION_TIMEOUT,
      TIMING_CONSTANTS.CONNECTION_CHECK_INTERVAL,
      'connection establishment'
    );
  }, [setupConnection]);

  // Helper function to create session and user message
  const createSessionAndMessage = useCallback(
    (text: string) => {
      let sessionId = currentSessionId;
      if (!isFollowUpMode) {
        sessionId = `session-${Date.now()}`;
        setCurrentSessionId(sessionId);
        setIsFollowUpMode(false);
      }

      const userMessage = {
        actor: Actors.USER,
        content: text,
        timestamp: Date.now(),
      };

      return { sessionId, userMessage };
    },
    [currentSessionId, isFollowUpMode]
  );

  // Helper function to send message with retry logic
  const sendMessageWithRetry = useCallback(
    async (messagePayload: any, retryCount = 0): Promise<void> => {
      try {
        if (!portRef.current) {
          throw new Error('Connection lost, please try again');
        }

        portRef.current.postMessage(messagePayload);
        logEvent('message_sent', {
          type: messagePayload.type,
          messageId: messagePayload.messageId,
        });
      } catch (messageError) {
        logEvent('error', {
          error: `Message send failed: ${messageError}`,
          retryCount,
        });

        if (retryCount < 1) {
          logger.warn(
            COMPONENT_NAME,
            'PostMessage failed, attempting to reconnect',
            { error: messageError }
          );
          stopConnection();
          setupConnection();

          try {
            await DelayUtil.waitUntil(
              () => !!portRef.current,
              TIMING_CONSTANTS.RECONNECT_TIMEOUT,
              TIMING_CONSTANTS.CONNECTION_CHECK_INTERVAL,
              'message retry reconnection'
            );
            await sendMessageWithRetry(messagePayload, retryCount + 1);
          } catch (waitError) {
            throw new Error('Failed to reconnect for message retry');
          }
        } else {
          throw new Error(
            `Failed to send message after retry: ${messageError}`
          );
        }
      }
    },
    [logEvent, stopConnection, setupConnection]
  );

  // Memoized check for whether message sending is allowed
  const canSendMessage = useMemo(() => {
    return !(isHistoricalSession && !isReplaying);
  }, [isHistoricalSession, isReplaying]);

  // Simplified message handler with better error handling
  const handleSendMessage = useCallback(
    async (text: string) => {
      logger.debug(COMPONENT_NAME, 'HandleSendMessage called', {
        textLength: text.length,
      });

      if (!canSendMessage) {
        logger.debug(
          COMPONENT_NAME,
          'Cannot send message - canSendMessage is false'
        );
        return;
      }

      if (!text?.trim()) {
        logger.debug(COMPONENT_NAME, 'Cannot send empty message');
        return;
      }

      try {
        logger.debug(COMPONENT_NAME, 'Starting message send process');

        // Ensure connection is ready
        await ensureConnection();
        logger.debug(COMPONENT_NAME, 'Connection ensured');

        // Get active tab
        const tabId = await getActiveTabId();
        logger.debug(COMPONENT_NAME, 'Got tab ID', { tabId });

        // Set UI state immediately
        setInputEnabled(false);
        setShowStopButton(true);
        logger.debug(COMPONENT_NAME, 'UI state updated');

        // Create session and message
        const { sessionId, userMessage } = createSessionAndMessage(text);
        logger.debug(COMPONENT_NAME, 'Created session and message', {
          sessionId,
          messageActor: userMessage.actor,
        });

        appendMessage(userMessage, sessionId || undefined);
        logger.debug(COMPONENT_NAME, 'User message appended');

        // Check if we should use streaming based on agent capabilities
        const useStreaming = agentCapabilities?.streaming || false;

        // Prepare and send message
        const messageId = generateMessageId();
        const messagePayload = {
          type: useStreaming
            ? 'streaming_task'
            : isFollowUpMode
            ? 'follow_up_task'
            : 'new_task',
          task: text,
          taskId: sessionId,
          tabId,
          messageId,
          historySessionId: sessionId || undefined,
        };
        logger.debug(COMPONENT_NAME, 'Sending message payload', {
          type: messagePayload.type,
          messageId,
        });

        await sendMessageWithRetry(messagePayload);
        logger.info(COMPONENT_NAME, 'Message sent successfully', { messageId });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(COMPONENT_NAME, 'HandleSendMessage error', {
          error: errorMessage,
        });

        // Reset UI state on error
        setInputEnabled(true);
        setShowStopButton(false);

        appendMessage({
          actor: Actors.SYSTEM,
          content: `Failed to send message: ${errorMessage}`,
          timestamp: Date.now(),
        });
      }
    },
    [
      canSendMessage,
      ensureConnection,
      getActiveTabId,
      createSessionAndMessage,
      appendMessage,
      isFollowUpMode,
      sendMessageWithRetry,
    ]
  );

  // Memoized debug interface to prevent unnecessary re-creation (development only)
  const debugInterface = useMemo(() => {
    if (process.env.NODE_ENV !== 'development') {
      return null;
    }

    return {
      connectionMonitor,
      getMetrics: () => connectionMonitor.getMetrics(),
      getHealth: () => connectionMonitor.getHealthStatus(),
      generateReport: () => connectionMonitor.generateDiagnosticReport(),
      exportData: () => connectionMonitor.exportData(),
      getMessages: () => messages,
      getLogs: () => logger.getLogs(),
      exportLogs: () => logger.exportLogs(),
      connectionStatus,
      isInitialized,
      hasError,
      sendTestMessage: async (text: string) => {
        return handleSendMessage(`[TEST] ${text}`);
      },
      simulateConnectionLoss: () => {
        if (portRef.current) {
          portRef.current.disconnect();
        }
      },
      forceReconnect: () => {
        stopConnection();
        setTimeout(
          () => setupConnection(),
          TIMING_CONSTANTS.CONNECTION_CHECK_INTERVAL
        );
      },
      reset: () => {
        connectionMonitor.reset();
        connectionRetryCount.current = 0;
        logger.clearLogs();
      },
    };
  }, [
    connectionStatus,
    isInitialized,
    hasError,
    messages,
    handleSendMessage,
    stopConnection,
    setupConnection,
  ]);

  // Expose debugging interface in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && debugInterface) {
      (window as any).__AGENT_DEBUG = debugInterface;
    }
  }, [debugInterface]);

  const handleStopTask = useCallback(() => {
    logger.debug(COMPONENT_NAME, 'HandleStopTask called');
    try {
      if (portRef.current) {
        portRef.current.postMessage({ type: 'cancel_task' });
        logger.info(COMPONENT_NAME, 'Stop task message sent');
      } else {
        logger.warn(COMPONENT_NAME, 'No active connection to send stop task');
      }
      // Reset UI state regardless
      setInputEnabled(true);
      setShowStopButton(false);
    } catch (error) {
      logger.error(COMPONENT_NAME, 'Error stopping task', { error });
      // Still reset UI state on error
      setInputEnabled(true);
      setShowStopButton(false);
    }
  }, []);

  const loadChatSessions = useCallback(async () => {
    try {
      const sessions = await chatHistoryStore.getSessionsMetadata();
      setChatSessions(sessions);
    } catch (error) {
      logger.warn(COMPONENT_NAME, 'Failed to load chat sessions', { error });
      setChatSessions([]);
    }
  }, []);

  const handleLoadHistory = useCallback(async () => {
    logger.debug(COMPONENT_NAME, 'HandleLoadHistory called');
    try {
      await loadChatSessions();
      setShowHistory(true);
      logger.info(COMPONENT_NAME, 'History loaded and shown');
    } catch (error) {
      logger.error(COMPONENT_NAME, 'Error loading history', { error });
      appendMessage({
        actor: Actors.SYSTEM,
        content: 'Failed to load chat history',
        timestamp: Date.now(),
      });
    }
  }, [loadChatSessions, appendMessage]);

  const handleSessionSelect = async (sessionId: string) => {
    try {
      const sessionMessages = await chatHistoryStore.getSession(sessionId);
      setMessages(sessionMessages || []);
      setCurrentSessionId(sessionId);
      setIsHistoricalSession(true);
      setShowHistory(false);
      setIsFollowUpMode(true);
    } catch (error) {
      logger.warn(COMPONENT_NAME, 'Failed to load session', {
        error,
        sessionId,
      });
      appendMessage({
        actor: Actors.SYSTEM,
        content: 'Failed to load chat session',
        timestamp: Date.now(),
      });
    }
  };

  const handleNewChat = useCallback(() => {
    logger.debug(COMPONENT_NAME, 'HandleNewChat called');
    setMessages([]);
    setCurrentSessionId(null);
    setIsHistoricalSession(false);
    setShowHistory(false);
    setIsFollowUpMode(false);
    setInputEnabled(true);
    setShowStopButton(false);
    logger.info(COMPONENT_NAME, 'New chat initialized');
  }, []);

  const handleMicClick = async () => {
    if (isRecording) {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === 'recording'
      ) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: 'audio/webm',
          });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Audio = reader.result as string;
            if (!portRef.current) {
              setupConnection();
            }
            try {
              setIsProcessingSpeech(true);
              portRef.current?.postMessage({
                type: 'speech_to_text',
                audio: base64Audio,
              });
            } catch (error) {
              logger.error(
                COMPONENT_NAME,
                'Failed to send audio for speech-to-text',
                { error }
              );
              appendMessage({
                actor: Actors.SYSTEM,
                content: 'Failed to process speech recording',
                timestamp: Date.now(),
              });
              setIsRecording(false);
              setIsProcessingSpeech(false);
            }
          };
          reader.readAsDataURL(audioBlob);
        }
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      logger.error(COMPONENT_NAME, 'Error accessing microphone', { error });
      let errorMessage = 'Failed to access microphone. ';
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage += 'Please grant microphone permission.';
        } else if (error.name === 'NotFoundError') {
          errorMessage += 'No microphone found.';
        } else {
          errorMessage += error.message;
        }
      }

      appendMessage({
        actor: Actors.SYSTEM,
        content: errorMessage,
        timestamp: Date.now(),
      });
      setIsRecording(false);
    }
  };

  const handleOpenSettings = useCallback(() => {
    logger.debug(COMPONENT_NAME, 'HandleOpenSettings called');
    setShowSettings(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    logger.debug(COMPONENT_NAME, 'HandleCloseSettings called');
    setShowSettings(false);
  }, []);

  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const prompts = await favoritesStorage.getAllPrompts();
        setFavoritePrompts(prompts);
      } catch (error) {
        logger.warn(COMPONENT_NAME, 'Failed to load favorite prompts', {
          error,
        });
        // Set empty array as fallback
        setFavoritePrompts([]);
      }
    };
    loadFavorites();
  }, []);

  const handleBookmarkSelect = (content: string) => {
    if (setInputTextRef.current) {
      setInputTextRef.current(content);
    }
  };

  const handleBookmarkUpdateTitle = async (id: number, title: string) => {
    try {
      await favoritesStorage.updatePromptTitle(id, title);
      const prompts = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(prompts);
    } catch (error) {
      logger.warn(COMPONENT_NAME, 'Failed to update bookmark title', {
        error,
        id,
        title,
      });
    }
  };

  const handleBookmarkDelete = async (id: number) => {
    try {
      await favoritesStorage.removePrompt(id);
      const prompts = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(prompts);
    } catch (error) {
      logger.warn(COMPONENT_NAME, 'Failed to delete bookmark', { error, id });
    }
  };

  const handleBookmarkReorder = async (draggedId: number, targetId: number) => {
    try {
      await favoritesStorage.reorderPrompts(draggedId, targetId);
      const prompts = await favoritesStorage.getAllPrompts();
      setFavoritePrompts(prompts);
    } catch (error) {
      logger.warn(COMPONENT_NAME, 'Failed to reorder bookmarks', {
        error,
        draggedId,
        targetId,
      });
    }
  };

  const handleToggleDarkMode = useCallback(() => {
    logger.debug(COMPONENT_NAME, 'HandleToggleDarkMode called');
    setIsDarkMode((prev) => {
      const newMode = !prev;
      logger.debug(COMPONENT_NAME, 'Dark mode toggled', { newMode });
      return newMode;
    });
  }, []);

  // Helper function to setup replay state
  const setupReplayState = useCallback((sessionId: string) => {
    setMessages([]);
    setCurrentSessionId(sessionId);
    setIsHistoricalSession(false);
    setShowHistory(false);
    setIsFollowUpMode(true);
    setShowStopButton(true);
    setInputEnabled(false);
    setIsReplaying(true);
  }, []);

  // Optimized replay handler using helper functions
  const handleReplay = useCallback(
    async (sessionId: string) => {
      if (!portRef.current) return;

      try {
        const tabId = await getActiveTabId();

        setupReplayState(sessionId);

        const replayMessageId = generateMessageId();
        const messagePayload = {
          type: 'replay',
          historySessionId: sessionId,
          taskId: `session-${Date.now()}`,
          tabId,
          messageId: replayMessageId,
        };

        await sendMessageWithRetry(messagePayload);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        appendMessage({
          actor: Actors.SYSTEM,
          content: `Failed to replay session: ${errorMessage}`,
          timestamp: Date.now(),
        });
      }
    },
    [getActiveTabId, setupReplayState, sendMessageWithRetry, appendMessage]
  );

  // Request agent capabilities
  const requestAgentCapabilities = useCallback(() => {
    if (portRef.current) {
      portRef.current.postMessage({ type: 'get_agent_capabilities' });
      portRef.current.postMessage({ type: 'get_available_tools' });
    }
  }, [portRef]);

  // Toggle agent status panel
  const toggleAgentStatus = useCallback(() => {
    setShowAgentStatus(!showAgentStatus);
    if (!showAgentStatus) {
      requestAgentCapabilities();
    }
  }, [showAgentStatus, requestAgentCapabilities]);

  // Request capabilities when connection is established
  useEffect(() => {
    if (connectionStatus === ConnectionState.CONNECTED && !agentCapabilities) {
      requestAgentCapabilities();
    }
  }, [connectionStatus, agentCapabilities, requestAgentCapabilities]);

  // Show loading state while initializing
  if (!isInitialized) {
    return (
      <div className="side-panel-app">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid #f0f0f0',
              borderTop: '3px solid #1890ff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <div style={{ color: '#666', fontSize: '14px' }}>
            Initializing Agent sidebar...
          </div>
        </div>
      </div>
    );
  }

  // Show error state if initialization failed
  if (hasError) {
    return (
      <div className="side-panel-app">
        <div
          style={{
            padding: '20px',
            textAlign: 'center',
            color: '#666',
          }}
        >
          <h3 style={{ color: '#ff4d4f' }}>Initialization Error</h3>
          <p>{hasError}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              backgroundColor: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      componentName={COMPONENT_NAME}
      onError={(error, errorInfo) => {
        logger.error(COMPONENT_NAME, 'Component error boundary triggered', {
          error: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        });
      }}
    >
      <div className={`side-panel-app ${isDarkMode ? 'dark' : ''}`}>
        <div className="header">
          <div className="header-left">
            <h3 className="header-title">AI Agent</h3>
          </div>
          <div className="header-right">
            <IconButton
              icon={isDarkMode ? 'sun' : 'moon'}
              onClick={handleToggleDarkMode}
              tooltip={
                isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'
              }
              data-testid="dark-mode-button"
              active={isDarkMode}
            />
            <IconButton
              icon="history"
              onClick={handleLoadHistory}
              tooltip="View Chat History"
              data-testid="history-button"
              active={showHistory}
            />
            <IconButton
              icon="settings"
              onClick={toggleAgentStatus}
              tooltip="Agent Status & Capabilities"
              data-testid="agent-status-button"
              active={showAgentStatus}
              className={
                agentCapabilities?.streaming ? 'streaming-capable' : ''
              }
            />
            <IconButton
              icon="settings"
              onClick={handleOpenSettings}
              tooltip="Open Settings"
              data-testid="settings-button"
              active={showSettings}
            />
          </div>
        </div>
        <div className="content-area">
          {showAgentStatus ? (
            <ErrorBoundary componentName="AgentStatus">
              <AgentStatus
                onRefresh={requestAgentCapabilities}
                onSettings={handleOpenSettings}
              />
            </ErrorBoundary>
          ) : showSettings ? (
            <ErrorBoundary componentName="Settings">
              <Settings onClose={handleCloseSettings} />
            </ErrorBoundary>
          ) : showHistory ? (
            <ErrorBoundary componentName="ChatHistoryList">
              <ChatHistoryList
                sessions={chatSessions}
                onSessionSelect={handleSessionSelect}
                onNewChat={handleNewChat}
                onReplay={handleReplay}
              />
            </ErrorBoundary>
          ) : (
            <>
              {messages.length === 0 ? (
                <ErrorBoundary componentName="BookmarkList">
                  <BookmarkList
                    bookmarks={favoritePrompts}
                    onBookmarkSelect={handleBookmarkSelect}
                    onBookmarkUpdateTitle={handleBookmarkUpdateTitle}
                    onBookmarkDelete={handleBookmarkDelete}
                    onBookmarkReorder={handleBookmarkReorder}
                  />
                </ErrorBoundary>
              ) : (
                <ErrorBoundary componentName="MessageList">
                  <MessageList messages={messages} />
                </ErrorBoundary>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
        <div className="input-area">
          <div
            className="connection-status"
            title={`Status: ${connectionStatus}\nMessages: ${
              connectionMonitor.getMetrics().messagesSent
            }/${connectionMonitor.getMetrics().messagesReceived}\nRetries: ${
              connectionRetryCount.current
            }/${maxRetries}\nHealth: ${
              connectionMonitor.getHealthStatus().status
            }`}
          >
            {connectionStatus}
            {connectionRetryCount.current > 0 &&
              ` (retry ${connectionRetryCount.current}/${maxRetries})`}
          </div>
          <ErrorBoundary componentName="ChatInput">
            <ChatInput
              onSendMessage={handleSendMessage}
              onStopTask={handleStopTask}
              onMicClick={handleMicClick}
              isRecording={isRecording}
              isProcessingSpeech={isProcessingSpeech}
              disabled={!inputEnabled || (isHistoricalSession && !isReplaying)}
              showStopButton={showStopButton}
              setContent={(setter) => (setInputTextRef.current = setter)}
              onReplay={handleReplay}
              historicalSessionId={currentSessionId}
              isHistoricalSession={isHistoricalSession}
            />
          </ErrorBoundary>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default SidePanelApp;
