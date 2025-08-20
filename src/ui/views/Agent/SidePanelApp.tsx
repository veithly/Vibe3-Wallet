import { Typography } from 'antd';
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
import ElementSelector from './components/ElementSelector';
import {
  StreamingMessage,
  useStreamingMessage,
} from './components/StreamingMessage';
import { AgentStatus, useAgentStatus } from './components/AgentStatus';
import { Message, Actors, ReActStatusMessage } from './types/message';

import { EventType, AgentEvent, ExecutionState } from './types/event';
import { chatHistoryStore } from '@/background/service/agent/chatHistory';
import favoritesStorage from '@/background/service/agent/storage/favorites';
import type { FavoritePrompt } from '@/background/service/agent/storage/favorites';
import './styles/SidePanelApp.less';
import {
  connectionMonitor,
  generateMessageId,
} from './utils/connectionMonitor';
import { logger } from './utils/logger';
import { DelayUtil, TIMING_CONSTANTS } from './utils/timing';

const { Paragraph } = Typography;

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

  const [showSettings, setShowSettings] = useState(false);
  const [favoritePrompts, setFavoritePrompts] = useState<FavoritePrompt[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isFollowUpMode, setIsFollowUpMode] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasError, setHasError] = useState<string | null>(null);
  const [agentCapabilities, setAgentCapabilities] = useState<any>(null);

  const [showAgentStatus, setShowAgentStatus] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  const [reactStatus, setReactStatus] = useState<ReActStatusMessage | null>(null);
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false);
  const [showElementSelector, setShowElementSelector] = useState(false);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const setInputTextRef = useRef<((text: string) => void) | null>(null);

  const isConnectingRef = useRef(false);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const connectionRetryCount = useRef(0);
  const maxRetries = TIMING_CONSTANTS.MAX_RETRIES;
  const retryDelay = TIMING_CONSTANTS.RECONNECTION_BASE_DELAY;
  const streamingTimeoutRef = useRef<number | null>(null);
  // Track tool_call IDs seen during current streaming to avoid duplicate top-level messages
  const seenToolCallIdsRef = useRef<Set<string>>(new Set());
  // Map OpenAI delta.tool_calls index -> callId across chunks
  const toolCallIndexToIdRef = useRef<Record<number, string>>({});
  // Accumulate arguments text per callId across chunks
  const toolCallArgsBufferRef = useRef<Record<string, string>>({});
  // Track function name by callId
  const toolCallNameByIdRef = useRef<Record<string, string>>({});
  // Ignore any further streaming events after a Stop until next user send
  const ignoreStreamingRef = useRef<boolean>(false);

  // Enhanced message appender with comprehensive logging and validation
  const appendMessage = useCallback(
    (newMessage: Message, sessionId?: string) => {
      logger.debug(COMPONENT_NAME, 'AppendMessage called', {
        actor: newMessage.actor,
        contentLength: typeof newMessage.content === 'string' ? newMessage.content.length : 0,
        messageType: newMessage.messageType,
        messageId: newMessage.messageId,
        isStreaming: newMessage.isStreaming,
        timestamp: newMessage.timestamp,
      });

      // Validate message before adding
      if (!newMessage.actor) {
        logger.error(COMPONENT_NAME, 'Invalid message structure (missing actor)', {
          message: newMessage,
          hasActor: !!newMessage.actor,
        });
        return;
      }

      // Generate message ID if not provided
      const messageWithId = {
        ...newMessage,
        messageId: newMessage.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: newMessage.timestamp || Date.now(),
      };

      setMessages((prev) => {
        const updatedMessages = [...prev, messageWithId];
        logger.debug(COMPONENT_NAME, 'Message appended to state', {
          totalMessages: updatedMessages.length,
          lastMessageActor: messageWithId.actor,
          lastMessageLength: typeof messageWithId.content === 'string' ? messageWithId.content.length : 0,
        });
        return updatedMessages;
      });

      const effectiveSessionId = sessionId || currentSessionId;
      if (effectiveSessionId) {
        try {
          chatHistoryStore.addMessage(effectiveSessionId, messageWithId);
          logger.debug(COMPONENT_NAME, 'Message saved to history', {
            sessionId: effectiveSessionId,
          });
        } catch (error) {
          logger.warn(COMPONENT_NAME, 'Failed to save message to history', {
            error,
            sessionId: effectiveSessionId,
          });
        }
      }
    },
    [currentSessionId]
  );

  // ReAct state management functions
  const updateReActStatus = useCallback((newStatus: Partial<ReActStatusMessage>) => {
    const updatedStatus: ReActStatusMessage = {
      isThinking: false,
      isActing: false,
      currentStep: 0,
      maxSteps: 5,
      isActive: false,
      timestamp: Date.now(),
      ...reactStatus,
      ...newStatus
    };
    setReactStatus(updatedStatus);
  }, [reactStatus, appendMessage]);

  const resetReActStatus = useCallback(() => {
    setReactStatus(null);
  }, []);

  // Handle tool call results and send them back to LLM
  const handleToolResults = useCallback(async (toolResults: any[], originalMessage: Message) => {
    logger.debug(COMPONENT_NAME, 'Handling tool results', {
      resultsCount: toolResults.length,
      originalMessageId: originalMessage.messageId,
    });

    // Display tool results in the UI
    for (const result of toolResults) {
      appendMessage({
        actor: Actors.SYSTEM,
        content: `Tool "${result.toolName}" completed`,
        timestamp: Date.now(),
        messageType: 'tool_result',
        toolResults: [result],
      });
    }

    // If the original message had finish_reason "tool_calls", send results back to LLM
    if (originalMessage.finishReason === 'tool_calls') {
      logger.info(COMPONENT_NAME, 'Sending tool results back to LLM', {
        resultsCount: toolResults.length,
      });

      // Format tool results as user message for LLM
      const toolResultsContent = toolResults.map(result =>
        `Tool "${result.toolName}" result: ${JSON.stringify(result.result, null, 2)}`
      ).join('\n\n');

      // Send tool results as user message to continue the conversation
      appendMessage({
        actor: Actors.USER,
        content: `Tool execution results:\n\n${toolResultsContent}`,
        timestamp: Date.now(),
        messageType: 'standard',
      });

      // Trigger LLM to continue processing with the tool results
      // This would typically involve calling the agent service again
      try {
        if (portRef.current) {
          portRef.current.postMessage({
            type: 'continue_with_tool_results',
            data: {
              toolResults: toolResults,
              sessionId: currentSessionId,
            },
          });
        }
      } catch (error) {
        logger.error(COMPONENT_NAME, 'Failed to send tool results to LLM', error);
      }
    }
  }, [appendMessage, currentSessionId]);

  // Enhanced task state handler with improved streaming completion detection
  const handleTaskState = useCallback(
    (event: AgentEvent) => {
      const { actor, state, timestamp, data } = event;
      const content = (data?.details ?? data?.content ?? '') as string;

      const mapActionsToFunctionCalls = (actions?: any[]) => {
        if (!Array.isArray(actions)) return undefined;
        return actions.map((a: any, idx: number) => ({
          id: a.id || `action_${idx}`,
          name: a.type || a.name || 'action',
          arguments: a.params || {},
          result: a.result,
          status: (['pending','executing','completed','failed'] as const).includes(a.status)
            ? a.status
            : 'completed',
          timestamp: Date.now(),
        }));
      };

      const mapOpenAIToolCalls = (toolCalls?: any[]) => {
        if (!Array.isArray(toolCalls)) return undefined;
        return toolCalls.map((tc: any, idx: number) => ({
          id: tc.id || `call_${idx}`,
          name: tc.function?.name || 'function',
          arguments: (() => {
            try {
              if (typeof tc.function?.arguments === 'string') {
                return JSON.parse(tc.function.arguments);
              }
              return tc.function?.arguments || {};
            } catch {
              return { raw: tc.function?.arguments };
            }
          })(),
          status: 'executing' as const,
          timestamp: Date.now(),
        }));
      };

      logger.debug(COMPONENT_NAME, 'Handling task state', {
        actor,
        state,
        hasContent: !!content,
        hasData: !!data,
        timestamp,
        isStreamingResponse: data?.isStreaming,
        streamingMessageId,
      });

      if (actor === Actors.SYSTEM) {
        // Only reset UI on terminal task states
        if (
          state === ExecutionState.TASK_OK ||
          state === ExecutionState.TASK_FAIL ||
          state === ExecutionState.TASK_CANCEL
        ) {
          logger.debug(COMPONENT_NAME, 'Task completed, resetting UI state', {
            state,
            hasContent: !!content,
          });
          setInputEnabled(true);
          setShowStopButton(false);
          setIsReplaying(false);
          resetReActStatus();
        }
        if (state === ExecutionState.TASK_OK) {
          setIsFollowUpMode(true);
        }
      }

      if (content) {
        // Treat as streaming update only if backend marks it as streaming AND we have an active streaming message
        const isStreamingResponse = !!(data?.isStreaming && streamingMessageId);

        if (isStreamingResponse) {
          logger.debug(COMPONENT_NAME, 'Updating existing streaming message', {
            streamingMessageId,
            contentLength: content.length,
          });

          // If we have an active streaming message, update it instead of creating a new one
          setMessages((prev) => {
            const updatedMessages = prev.map((msg) =>
              msg.messageId === streamingMessageId
                ? {
                    ...msg,
                    content: content,
                    isStreaming: false,
                    messageType: 'execution' as const,
                  }
                : msg
            );

            logger.debug(COMPONENT_NAME, 'Streaming message updated via execution', {
              wasStreaming: true,
              newContentLength: content.length,
            });

            return updatedMessages;
          });
          setStreamingMessageId(null);
        } else {
          logger.debug(COMPONENT_NAME, 'Adding regular execution message', {
            actor,
            contentLength: content.length,
            state,
          });

          // Regular message handling with defensive functionCalls mapping
          const normalizeFunctionCalls = (arr?: any[]) => {
            if (!Array.isArray(arr)) return [] as any[];
            const now = Date.now();
            return arr.map((c: any, idx: number) => {
              // Build stable id: prefer provided id; else synthesize from name+index+time
              const name = c?.name || c?.type || c?.function?.name || 'function';
              let id = c?.id as string | undefined;
              if (!id) id = `${name}_${now}_${idx}`;

              // Safely assemble arguments and guard against extremely large payloads
              let args: any = {};
              try {
                if (typeof c?.arguments === 'string') args = JSON.parse(c.arguments);
                else if (c?.arguments) args = c.arguments;
                else if (c?.params) args = c.params;
                else if (typeof c?.function?.arguments === 'string') args = JSON.parse(c.function.arguments);
                else args = c?.function?.arguments || {};
              } catch {
                args = { raw: c?.arguments ?? c?.function?.arguments };
              }
              try {
                const s = JSON.stringify(args);
                if (s && s.length > 50000) {
                  // 对特别长的 arguments 只在展示层截断，保留全量在消息对象，避免 UI 崩溃
                  (args as any).__display_truncated__ = true;
                  (args as any).__display_preview__ = s.slice(0, 50000);
                }
              } catch {}

              const status = (['pending','executing','completed','failed'] as const).includes(c?.status) ? c.status : 'executing';
              const ts = c?.timestamp || now + idx;

              return { id, name, arguments: args, result: c?.result, status, timestamp: ts };
            });
          };

          const fcFromActions = normalizeFunctionCalls(data?.actions);
          const fcFromToolCalls = normalizeFunctionCalls(mapOpenAIToolCalls?.(data?.tool_calls));
          const fcFromFunctionCalls = normalizeFunctionCalls(data?.functionCalls);
          const functionCalls = [...fcFromActions, ...fcFromToolCalls, ...fcFromFunctionCalls];

          // Check if we have both content and function calls
          const hasContent = content && content.trim().length > 0;
          const hasFunctionCalls = functionCalls && functionCalls.length > 0;

          // If backend provides multiple contents as an array, handle them; otherwise wrap single content
          const contentsArr: string[] = Array.isArray(data?.contents)
            ? (data.contents as any[]).filter((s) => typeof s === 'string' && s.trim().length > 0)
            : (hasContent ? [content] : []);

          if (contentsArr.length > 0) {
            logger.debug(COMPONENT_NAME, 'Appending assistant contents individually', {
              count: contentsArr.length,
            });
            contentsArr.forEach((c, idx) => {
              appendMessage({
                actor: actor as Actors,
                content: c,
                timestamp: timestamp + idx,
                messageType: 'assistant_content',
                finishReason: data?.finish_reason,
              });
            });
          }

          if (hasFunctionCalls) {
            logger.debug(COMPONENT_NAME, 'Appending function calls individually', {
              functionCallsCount: functionCalls!.length,
            });
            functionCalls!.forEach((call, idx) => {
              appendMessage({
                actor: actor as Actors,
                content: `Executing function ${call.name}...`,
                timestamp: timestamp + contentsArr.length + idx,
                messageType: 'function_call',
                functionCalls: [call],
                finishReason: data?.finish_reason,
              });
            });
          }

          if (contentsArr.length === 0 && !hasFunctionCalls) {
            // Fallback: Only content (possibly empty) and no function calls
            appendMessage({
              actor: actor as Actors,
              content,
              timestamp,
              messageType: hasContent ? 'execution' : 'standard',
              finishReason: data?.finish_reason,
            });
          }
        }
      } else {
        logger.debug(COMPONENT_NAME, 'Task state event with no content', {
          actor,
          state,
          data,
        });
      }
    },
    [appendMessage, resetReActStatus, streamingMessageId]
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

  // Enhanced message handlers with comprehensive logging and error recovery
  const setupMessageHandlers = useCallback(
    (port: chrome.runtime.Port) => {
      port.onMessage.addListener((message: any) => {
        logger.debug(COMPONENT_NAME, 'Received message from backend', {
          type: message.type,
          hasTaskId: !!message.taskId,
          hasData: !!message.data,
          timestamp: Date.now(),
        });
        logEvent('message_received', { type: message.type });

        // If user has pressed Stop, ignore subsequent stream/function/react messages until a new streaming_start
        const ignorableTypes = new Set(['streaming_chunk', 'streaming_complete', 'function_call', 'react_status', EventType.EXECUTION]);
        if (ignoreStreamingRef.current && message?.type && ignorableTypes.has(message.type)) {
          if (message.type === 'streaming_start') {
            // allow new session to start
          } else {
            logger.debug(COMPONENT_NAME, 'Ignoring message due to Stop', { type: message.type });
            return;
          }
        }

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
          logger.debug(COMPONENT_NAME, 'Processing execution message', {
            actor: message.actor,
            state: message.state,
            hasData: !!message.data,
          });
          handleTaskState(message);
        } else if (message && message.type === 'error') {
          logger.error(COMPONENT_NAME, 'Received error message', {
            error: message.error,
            fullMessage: message,
          });
          const rawError = message.rawError ?? message.error ?? message.data;
          const normalizedError = typeof rawError === 'string' ? rawError : JSON.stringify(rawError);
          logEvent('error', { error: normalizedError || 'Unknown error' });
          appendMessage({
            actor: Actors.SYSTEM,
            content: normalizedError || 'Unknown error',
            timestamp: Date.now(),
            messageType: 'error',
          });
          setInputEnabled(true);
          setShowStopButton(false);
          resetReActStatus();
        } else if (message && message.type === 'function_call') {
          logger.debug(COMPONENT_NAME, 'Received function_call event', {
            contentLength: message.data?.details?.length || 0,
            calls: message.data?.functionCalls?.length || 0,
          });

          const calls: any[] = Array.isArray(message.data?.functionCalls)
            ? message.data.functionCalls
            : (message.data?.functionCall ? [message.data.functionCall] : []);
          const baseTs = message.timestamp || Date.now();

          // 先输出细节内容（如果有）
          if (message.data?.details) {
            appendMessage({
              actor: Actors.ASSISTANT,
              content: message.data.details,
              timestamp: baseTs,
              messageType: 'assistant_content',
              finishReason: message.data?.finish_reason,
            });
          }

          // 将每个函数调用拆分成独立消息
          calls.forEach((call, idx) => {
            appendMessage({
              actor: Actors.ASSISTANT,
              content: `Executing function ${call?.name || 'function'}...`,
              timestamp: baseTs + (message.data?.details ? 1 : 0) + idx,
              messageType: 'function_call' as const,
              functionCalls: [call],
              finishReason: message.data?.finish_reason,
            });
          });

          // If this is a tool_calls finish reason, we need to handle the results
          if (message.data?.finish_reason === 'tool_calls' && message.data?.functionCalls?.length > 0) {
            logger.info(COMPONENT_NAME, 'Function call with tool_calls finish reason detected', {
              functionCallsCount: message.data.functionCalls.length,
            });

            // Monitor for tool execution completion
            // This will be handled when we receive tool results from the backend
          }
        } else if (message && message.type === 'tool_result') {
          logger.debug(COMPONENT_NAME, 'Received tool_result event', {
            toolName: message.data?.toolName,
            success: message.data?.success,
          });

          // Display tool result
          appendMessage({
            actor: Actors.SYSTEM,
            content: `Tool "${message.data?.toolName || 'unknown'}" ${message.data?.success ? 'completed successfully' : 'failed'}`,
            timestamp: message.timestamp || Date.now(),
            messageType: 'tool_result',
            toolResults: message.data ? [{
              toolCallId: message.data.toolCallId || '',
              toolName: message.data.toolName || '',
              result: message.data.result,
              success: message.data.success || false,
              timestamp: message.timestamp || Date.now(),
            }] : [],
          });

          // If we have tool results and need to continue the conversation
          if (message.data?.continueConversation) {
            logger.info(COMPONENT_NAME, 'Continuing conversation with tool results');

            // Send tool results back to LLM as user message
            const toolResultContent = `Tool execution result: ${JSON.stringify(message.data.result, null, 2)}`;
            appendMessage({
              actor: Actors.USER,
              content: toolResultContent,
              timestamp: Date.now(),
              messageType: 'standard',
            });
          }
        } else if (message && message.type === 'streaming_start') {
          logger.info(COMPONENT_NAME, 'Starting streaming response', {
            taskId: message.taskId,
          });

          // If user pressed Stop previously, clear the ignore flag for new stream
          try { ignoreStreamingRef.current = false; } catch {}

          // Start streaming response
          const messageId = `streaming_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
          setStreamingMessageId(messageId);
          // Reset seen tool_call IDs and index->id map for this streaming session
          try { seenToolCallIdsRef.current = new Set(); } catch {}
          try { toolCallIndexToIdRef.current = {}; } catch {}

          // Add initial streaming message
          appendMessage({
            actor: Actors.ASSISTANT,
            content: '',
            timestamp: Date.now(),
            isStreaming: true,
            messageId,
            functionCalls: [],
            messageType: 'streaming_start',
          });

          logEvent('streaming_start', { taskId: message.taskId });
        } else if (message && message.type === 'streaming_chunk') {
          logger.debug(COMPONENT_NAME, 'Processing streaming chunk', {
            taskId: message.taskId,
            chunkType: message.chunk?.type,
            hasContent: !!message.chunk?.content,
            streamingMessageId,
          });

          // Handle streaming chunk
          if (streamingMessageId && message.chunk) {
            // Extract tool_calls from various OpenAI chunk shapes
            const extractToolCalls = (chunk: any) => {
              const calls: any[] = [];
              try {
                const choices = chunk?.choices;
                if (Array.isArray(choices)) {
                  choices.forEach((ch: any) => {
                    const arr = ch?.delta?.tool_calls || ch?.tool_calls;
                    if (Array.isArray(arr)) calls.push(...arr);
                  });
                }
                const directDelta = chunk?.delta?.tool_calls;
                if (Array.isArray(directDelta)) calls.push(...directDelta);
                const direct = chunk?.tool_calls;
                if (Array.isArray(direct)) calls.push(...direct);
              } catch {}
              return calls;
            };

            // Normalize chunk(s) in case backend forwarded SSE 'data: ...' strings
            const toChunkObjects = (raw: any): any[] => {
              if (!raw) return [];
              if (typeof raw !== 'string') return [raw];
              try {
                const lines = raw.split('\n').map((l: string) => l.trim()).filter(Boolean);
                const objs: any[] = [];
                for (const line of lines) {
                  if (!line.startsWith('data:')) continue;
                  const payload = line.slice(5).trim();
                  if (payload === '[DONE]') continue;
                  try { objs.push(JSON.parse(payload)); } catch {}
                }
                return objs;
              } catch { return []; }
            };

            const rawChunk = (message as any).chunk;
            let chunkObjs: any[];
            if (typeof rawChunk === 'string') {
              chunkObjs = toChunkObjects(rawChunk);
            } else if (rawChunk && typeof rawChunk.raw === 'string') {
              chunkObjs = toChunkObjects(rawChunk.raw);
            } else if (Array.isArray(rawChunk)) {
              chunkObjs = rawChunk as any[];
            } else if (rawChunk && typeof rawChunk === 'object') {
              chunkObjs = [rawChunk];
            } else {
              chunkObjs = [];
            }

            const toolCallsArr = chunkObjs.flatMap(extractToolCalls);

            if (toolCallsArr.length > 0) {
              toolCallsArr.forEach((tc: any) => {
                const idx = typeof tc?.index === 'number' ? tc.index : (tc?.index ? Number(tc.index) : undefined);
                const name = tc?.function?.name || 'function';
                let id = tc?.id as string | undefined;

                if (typeof idx === 'number') {
                  if (!id && toolCallIndexToIdRef.current[idx]) id = toolCallIndexToIdRef.current[idx];
                  if (!id) {
                    id = `call_idx_${idx}_${Date.now()}`;
                    toolCallIndexToIdRef.current[idx] = id;
                  } else {
                    toolCallIndexToIdRef.current[idx] = id;
                  }
                } else if (!id) {
                  id = `call_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
                }

                if (id && !seenToolCallIdsRef.current.has(id)) {
                  seenToolCallIdsRef.current.add(id);
                  logger.debug(COMPONENT_NAME, 'New tool_call detected in streaming (OpenAI delta)', { id, idx, name });
                  appendMessage({
                    actor: Actors.ASSISTANT,
                    content: `Executing function ${name}...`,
                    timestamp: Date.now(),
                    messageType: 'function_call' as const,
                    functionCalls: [{ id, name, arguments: {}, status: 'executing' as const, timestamp: Date.now() }],
                  });
                }
              });
            }

            // Also handle non-OpenAI shaped streaming chunk that carries functionCalls array
            const functionCallsFromChunks = chunkObjs.flatMap((c: any) => Array.isArray(c?.functionCalls) ? c.functionCalls : []);
            if (functionCallsFromChunks.length > 0) {
              functionCallsFromChunks.forEach((call: any, idx: number) => {
                let id = call?.id as string | undefined;
                const name = call?.name || call?.function?.name || 'function';
                if (!id) {
                  // Synthesize a stable id from name + index if needed
                  id = `${name}_${Date.now()}_${idx}`;
                }
                if (!seenToolCallIdsRef.current.has(id)) {
                  seenToolCallIdsRef.current.add(id);
                  logger.debug(COMPONENT_NAME, 'New tool_call detected in streaming (functionCalls array)', { id, name });
                  appendMessage({
                    actor: Actors.ASSISTANT,
                    content: `Executing function ${name}...`,
                    timestamp: Date.now(),
                    messageType: 'function_call' as const,
                    functionCalls: [{
                      id,
                      name,
                      arguments: call?.arguments || call?.function?.arguments || {},
                      status: call?.status || 'executing',
                      timestamp: Date.now(),
                    }],
                  });
                }
              });
            }

            // Extract text deltas from chunk objects (OpenAI-style and custom)
            const textPieces: string[] = [];
            try {
              chunkObjs.forEach((co: any) => {
                if (typeof co?.content === 'string') textPieces.push(co.content);
                if (co?.delta && typeof co.delta?.content === 'string') textPieces.push(co.delta.content);
                if (Array.isArray(co?.choices)) {
                  co.choices.forEach((ch: any) => {
                    const d = ch?.delta || {};
                    if (typeof d?.content === 'string') textPieces.push(d.content);
                  });
                }
              });
            } catch {}
            const textToAppend = textPieces.join('');

            setMessages((prev) => {
              const updatedMessages = prev.map((msg) => {
                if (msg.messageId !== streamingMessageId) return msg;

                const prevCalls = msg.functionCalls || [];
                const chunkCalls = (message.chunk as any).functionCalls
                  ? (message.chunk as any).functionCalls
                  : (message.chunk as any).functionCall
                  ? [(message.chunk as any).functionCall]
                  : [];
                const mergedCalls = [...prevCalls, ...chunkCalls];

                return {
                  ...msg,
                  content: (msg.content || '') + (typeof textToAppend === 'string' ? textToAppend : ''),
                  functionCalls: mergedCalls,
                };
              });

              // Log the update
              const streamingMsg = updatedMessages.find(m => m.messageId === streamingMessageId);
              if (streamingMsg) {
                logger.debug(COMPONENT_NAME, 'Streaming message updated', {
                  contentLength: streamingMsg.content.length,
                  functionCallsCount: streamingMsg.functionCalls?.length || 0,
                });
              }

              return updatedMessages;
            });
          } else {
            logger.warn(COMPONENT_NAME, 'Received streaming chunk but no active streaming message', {
              hasStreamingMessageId: !!streamingMessageId,
              hasChunk: !!message.chunk,
            });
          }

          logEvent('streaming_chunk', {
            taskId: message.taskId,
            chunkType: message.chunk?.type,
          });
        } else if (message && message.type === 'streaming_complete') {
          logger.info(COMPONENT_NAME, 'Streaming response completed', {
            taskId: message.taskId,
            hasData: !!message.data,
            streamingMessageId,
          });

          // Complete streaming response
          if (streamingMessageId) {
            let finalContent = '';
            let finalFunctionCalls: any[] = [];

            if (message.data) {
              finalContent = message.data.details || message.data.content || '';

              // Normalize potential function call sources from streaming completion payload
              const normalizeEndCalls = (arr?: any[]) => {
                if (!Array.isArray(arr)) return [] as any[];
                const now = Date.now();
                return arr.map((c: any, idx: number) => ({
                  id: c?.id || `call_${idx}`,
                  name: c?.name || c?.type || c?.function?.name || 'function',
                  arguments: (() => {
                    try {
                      if (typeof c?.arguments === 'string') return JSON.parse(c.arguments);
                      if (c?.arguments) return c.arguments;
                      if (c?.params) return c.params;
                      if (typeof c?.function?.arguments === 'string') return JSON.parse(c.function.arguments);
                      return c?.function?.arguments || {};
                    } catch {
                      return { raw: c?.arguments ?? c?.function?.arguments };
                    }
                  })(),
                  result: c?.result,
                  status: (['pending','executing','completed','failed'] as const).includes(c?.status) ? c.status : 'executing',
                  timestamp: c?.timestamp || now + idx,
                }));
              };

              const fcFromEndActions = normalizeEndCalls(message.data.actions);
              const fcFromEndToolCalls = normalizeEndCalls(message.data.tool_calls);
              const fcFromEndFunctionCalls = normalizeEndCalls(message.data.functionCalls);
              const currentMsg = messages.find(m => m.messageId === streamingMessageId);
              const fcFromStream = normalizeEndCalls(currentMsg?.functionCalls as any[]);

              // Merge and de-duplicate by (name + arguments JSON)
              const merged = [
                ...fcFromEndFunctionCalls,
                ...fcFromEndActions,
                ...fcFromEndToolCalls,
                ...fcFromStream,
              ];
              // 只按 id 去重；没有 id 的调用一律保留，避免误伤“相同参数的重复调用”
              const seenIds = new Set<string>();
              finalFunctionCalls = merged.filter((c) => {
                const id = c?.id ? String(c.id) : '';
                if (!id) return true;
                if (seenIds.has(id)) return false;
                seenIds.add(id);
                return true;
              });

              logger.debug(COMPONENT_NAME, 'Streaming complete with data', {
                streamingMessageId,
                contentLength: finalContent.length,
                hasDetails: !!message.data.details,
                hasContent: !!message.data.content,
                functionCallsCount: finalFunctionCalls.length,
              });
            } else {
              logger.warn(COMPONENT_NAME, 'Streaming complete but no data provided', {
                streamingMessageId,
                hasData: !!message.data,
              });

              // Fallback: Get current content from the streaming message
              const currentMsg = messages.find(m => m.messageId === streamingMessageId);
              finalContent = currentMsg?.content || '';
              finalFunctionCalls = currentMsg?.functionCalls || [];
            }

            setMessages((prev) => {
              const updatedMessages = prev.map((msg) =>
                msg.messageId === streamingMessageId
                  ? {
                      ...msg,
                      content: finalContent,
                      isStreaming: false,
                      functionCalls: [], // 清空以避免把所有调用挤在一条消息里
                      messageType: 'assistant_content' as const, // 用内容消息展示文本
                    }
                  : msg
              );

              logger.debug(COMPONENT_NAME, 'Streaming message finalized (content separated)', {
                finalContentLength: finalContent.length,
                wasEmpty: finalContent.length === 0,
                functionCallsSeparated: finalFunctionCalls.length,
              });

              return updatedMessages;
            });

            // 将每个函数调用拆分成独立消息，避免只显示一条
            if (finalFunctionCalls && finalFunctionCalls.length > 0) {
              finalFunctionCalls.forEach((call, idx) => {
                appendMessage({
                  actor: Actors.ASSISTANT,
                  content: `Executing function ${call?.name || 'function'}...`,
                  timestamp: Date.now() + idx,
                  messageType: 'function_call' as const,
                  functionCalls: [call],
                });
              });
            }
          } else {
            logger.error(COMPONENT_NAME, 'Streaming complete but no streaming message ID', {
              hasStreamingMessageId: !!streamingMessageId,
            });

            // Fallback: Create a new message with the response
            if (message.data) {
              appendMessage({
                actor: Actors.SYSTEM,
                content: message.data.details || message.data.content || 'Response received',
                timestamp: Date.now(),
                messageType: 'streaming_complete',
                functionCalls: message.data.functionCalls || [],
              });
            }
          }

          setStreamingMessageId(null);
          setInputEnabled(true);
          setShowStopButton(false);
          setIsFollowUpMode(true);
          resetReActStatus();

          logEvent('streaming_complete', { taskId: message.taskId });
        } else if (message && message.type === 'streaming_error') {
          logger.error(COMPONENT_NAME, 'Streaming error occurred', {
            taskId: message.taskId,
            error: message.error,
            streamingMessageId,
          });

          const rawError = message.error ?? message.data?.error ?? message.data;
          const normalizedError = typeof rawError === 'string' ? rawError : JSON.stringify(rawError);

          // Handle streaming error - always display the raw/normalized error
          if (streamingMessageId) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.messageId === streamingMessageId
                  ? {
                      ...msg,
                      content: normalizedError,
                      isStreaming: false,
                      messageType: 'streaming_error' as const,
                    }
                  : msg
              )
            );
          } else {
            // Fallback: Create error message with raw error
            appendMessage({
              actor: Actors.SYSTEM,
              content: normalizedError,
              timestamp: Date.now(),
              messageType: 'streaming_error',
            });
          }

          setStreamingMessageId(null);
          setInputEnabled(true);
          setShowStopButton(false);
          resetReActStatus();

          logEvent('streaming_error', {
            taskId: message.taskId,
            error: normalizedError,
          });
        } else if (message && message.type === 'thinking') {
          logger.debug(COMPONENT_NAME, 'Processing thinking message', {
            thinkingType: message.data.thinkingType,
            contentLength: message.data.details?.length || 0,
          });

          // Only append thinking if it's explicitly provided by model responses
          if (message.data?.fromModel === true) {
            appendMessage({
              actor: Actors.SYSTEM,
              content: message.data.details,
              timestamp: Date.now(),
              messageType: 'thinking',
              thinking: [{
                step: 1,
                content: message.data.details,
                type: message.data.thinkingType || 'thinking',
                timestamp: Date.now(),
              }],
            });
          }
        } else if (message && message.type === 'react_status') {
          logger.debug(COMPONENT_NAME, 'Processing ReAct status message', {
            isThinking: message.data.isThinking,
            isActing: message.data.isActing,
            currentStep: message.data.currentStep,
            maxSteps: message.data.maxSteps,
          });

          // Handle ReAct status messages
          const reactStatusData: ReActStatusMessage = {
            isThinking: message.data.isThinking || false,
            isActing: message.data.isActing || false,
            currentStep: message.data.currentStep || 1,
            maxSteps: message.data.maxSteps || 5,
            currentAction: message.data.currentAction,
            thinkingContent: message.data.thinkingContent,
            isActive: message.data.isActive || false,
            timestamp: Date.now(),
          };
          setReactStatus(reactStatusData);

          // Do not auto-add react status messages to chat; only show if model includes them
        } else if (message && message.type === 'agent_capabilities') {
          logger.debug(COMPONENT_NAME, 'Agent capabilities updated', {
            capabilities: message.capabilities,
          });
          setAgentCapabilities(message.capabilities);
          logEvent('agent_capabilities', message.capabilities);
        } else if (message && message.type === 'available_tools') {
          logger.info(
            COMPONENT_NAME,
            'Available tools updated',
            `${message.tools?.length || 0} tools available`
          );
          logEvent('available_tools', { count: message.tools?.length || 0 });
        } else {
          logger.warn(COMPONENT_NAME, 'Unknown message type received', {
            type: message.type,
            fullMessage: message,
          });
        }
      });
    },
    [handleTaskState, appendMessage, logEvent, resetReActStatus, messages]
  );

  // Fallback message handler for cases where streaming might not work properly
  const ensureMessageVisibility = useCallback((content: string, actor: Actors = Actors.SYSTEM) => {
    logger.debug(COMPONENT_NAME, 'Ensuring message visibility', {
      contentLength: content.length,
      actor,
      currentMessagesCount: messages.length,
      hasStreamingMessage: !!streamingMessageId,
    });

    // If we have an active streaming message, try to complete it
    if (streamingMessageId) {
      setMessages((prev) => {
        const streamingMsg = prev.find(m => m.messageId === streamingMessageId);
        if (streamingMsg && streamingMsg.isStreaming) {
          logger.debug(COMPONENT_NAME, 'Completing streaming message via fallback', {
            streamingMessageId,
            currentContent: streamingMsg.content,
            newContent: content,
          });

          return prev.map((msg) =>
            msg.messageId === streamingMessageId
              ? {
                  ...msg,
                  content: content || msg.content,
                  isStreaming: false,
                  messageType: 'fallback_complete' as const,
                }
              : msg
          );
        }
        return prev;
      });
      setStreamingMessageId(null);
    } else {
      // Create a new message
      appendMessage({
        actor,
        content,
        timestamp: Date.now(),
        messageType: 'fallback',
      });
    }
  }, [messages, streamingMessageId, appendMessage]);

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

        // Initialize ReAct status
        updateReActStatus({
          isActive: true,
          isThinking: true,
          isActing: false,
          currentStep: 1,
          maxSteps: 5,
          thinkingContent: ''
        });

        // Create session and message
        const { sessionId, userMessage } = createSessionAndMessage(text);
        logger.debug(COMPONENT_NAME, 'Created session and message', {
          sessionId,
          messageActor: userMessage.actor,
        });

        appendMessage(userMessage, sessionId || undefined);
        logger.debug(COMPONENT_NAME, 'User message appended');

        // Check if we should use streaming based on agent capabilities
        // Default to streaming to ensure compatibility with backend
        const useStreaming = agentCapabilities?.streaming !== false;

        // Prepare and send message
        const messageId = generateMessageId();
        const messagePayload = {
          type: useStreaming
            ? 'streaming_task'
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
        resetReActStatus();

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
      // Ignore any further streaming/tool/status messages until next user send
      try { ignoreStreamingRef.current = true; } catch {}

      if (portRef.current) {
        portRef.current.postMessage({ type: 'cancel_task' });
        logger.info(COMPONENT_NAME, 'Stop task message sent');
      } else {
        logger.warn(COMPONENT_NAME, 'No active connection to send stop task');
      }

      // Mark current streaming message as stopped/cancelled in UI
      if (streamingMessageId) {
        setMessages(prev => prev.map(msg =>
          msg.messageId === streamingMessageId
            ? { ...msg, isStreaming: false, messageType: 'streaming_error' as const, content: (msg.content || '') || 'Task stopped by user' }
            : msg
        ));
        setStreamingMessageId(null);
      }

      // Reset UI state regardless
      setInputEnabled(true);
      setShowStopButton(false);
      resetReActStatus();
    } catch (error) {
      logger.error(COMPONENT_NAME, 'Error stopping task', { error });
      // Still reset UI state on error
      setInputEnabled(true);
      setShowStopButton(false);
    }
  }, [streamingMessageId, resetReActStatus]);

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
      if (!showHistory) {
        await loadChatSessions();
      }
      setShowHistory(prev => !prev);
      setShowSettings(false);
      logger.info(COMPONENT_NAME, 'History toggled');
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
    setShowNewChatConfirm(true);
  }, []);

  const confirmNewChat = useCallback(() => {
    logger.debug(COMPONENT_NAME, 'HandleNewChat called');

    // Clear all messages and reset state
    setMessages([]);
    setCurrentSessionId(null);
    setIsHistoricalSession(false);
    setShowHistory(false);
    setIsFollowUpMode(false);
    setInputEnabled(true);
    setShowStopButton(false);
    setShowNewChatConfirm(false);
    resetReActStatus();

    // Clear any streaming state
    setStreamingMessageId(null);

    logger.info(COMPONENT_NAME, 'New chat initialized successfully');
  }, [resetReActStatus]);

  const cancelNewChat = useCallback(() => {
    setShowNewChatConfirm(false);
  }, []);



  const handleOpenSettings = useCallback(() => {
    logger.debug(COMPONENT_NAME, 'HandleOpenSettings called');
    setShowSettings(prev => !prev);
    setShowHistory(false);
  }, []);

  const handleCloseSettings = useCallback(() => {
    logger.debug(COMPONENT_NAME, 'HandleCloseSettings called');
    setShowSettings(false);
  }, []);

  const handleOpenElementSelector = useCallback(() => {
    logger.debug(COMPONENT_NAME, 'HandleOpenElementSelector called');
    setShowElementSelector(prev => !prev);
    setShowSettings(false);
    setShowHistory(false);
  }, []);

  const handleCloseElementSelector = useCallback(() => {
    logger.debug(COMPONENT_NAME, 'HandleCloseElementSelector called');
    setShowElementSelector(false);
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
        {/* New Chat Confirmation Modal */}
        {showNewChatConfirm && (
          <div className="flex fixed inset-0 z-50 justify-center items-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black bg-opacity-50"
              onClick={cancelNewChat}
            />

            {/* Modal */}
            <div className="relative mx-4 w-full max-w-md bg-white rounded-lg shadow-xl">
              {/* Header */}
              <div className="flex justify-between items-center p-6 border-b">
                <div className="flex items-center space-x-2">
                  <div className="flex justify-center items-center w-5 h-5 bg-blue-500 rounded-full">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Start New Conversation</h3>
                </div>
              </div>

              {/* Body */}
              <div className="p-6">
                <div className="p-4 mb-4 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-amber-800">Clear Current Conversation</h3>
                      <div className="mt-2 text-sm text-amber-700">
                        <p>This will clear the current chat history and start fresh. Any unsaved information will be lost.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-600">
                  Are you sure you want to start a new conversation?
                </p>
              </div>

              {/* Footer */}
              <div className="flex justify-end p-6 space-x-3 bg-gray-50 rounded-b-lg border-t">
                <button
                  onClick={cancelNewChat}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmNewChat}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md border border-transparent hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Start New Chat
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="header">
          <div className="header-left">
            <h3 className="header-title">AI Agent</h3>
          </div>
          <div className="header-right">
            <IconButton
              icon={isDarkMode ? 'sun' : 'moon'}
              onClick={handleToggleDarkMode}
              data-testid="dark-mode-button"
              active={isDarkMode}
              size="medium"
            />
            <IconButton
              icon="history"
              onClick={handleLoadHistory}
              data-testid="history-button"
              active={showHistory}
              size="medium"
            />
              <IconButton
              icon="plus"
              onClick={handleNewChat}
              data-testid="new-chat-button"
              size="medium"
            />
            <IconButton
              icon="target"
              onClick={handleOpenElementSelector}
              data-testid="element-selector-button"
              active={showElementSelector}
              tooltip="Element Selector"
              size="medium"
            />
            <IconButton
              icon="settings"
              onClick={handleOpenSettings}
              data-testid="settings-button"
              active={showSettings}
              size="medium"
            />

          </div>
        </div>
        <div className="content-area">
          {showSettings ? (
            <div className="settings-overlay">
              <ErrorBoundary componentName="Settings">
                <Settings onClose={handleCloseSettings} />
              </ErrorBoundary>
            </div>
          ) : showElementSelector ? (
            <ErrorBoundary componentName="ElementSelector">
              <ElementSelector
                isActive={showElementSelector}
                onActivate={(mode) => {
                  logger.info(COMPONENT_NAME, 'Element selector activated', { mode });
                }}
                onDeactivate={handleCloseElementSelector}
                onElementSelect={(element) => {
                  logger.info(COMPONENT_NAME, 'Element selected', { element });
                  handleCloseElementSelector();
                }}
              />
            </ErrorBoundary>
          ) : showHistory ? (
            <ErrorBoundary componentName="ChatHistoryList">
              <ChatHistoryList
                sessions={chatSessions}
                onSessionSelect={handleSessionSelect}
                onNewChat={handleNewChat}
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
              disabled={!inputEnabled || (isHistoricalSession && !isReplaying)}
              showStopButton={showStopButton}
              setContent={(setter) => (setInputTextRef.current = setter)}
            />
          </ErrorBoundary>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default SidePanelApp;
