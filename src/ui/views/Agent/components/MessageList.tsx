import type { Message } from '../types/message';
import { getActorProfile } from '../types/message';
import { memo } from 'react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../styles/MessageList.less';
import { logger } from '../utils/logger';

interface MessageListProps {
  messages: Message[];
  isDarkMode?: boolean;
}

export default memo(function MessageList({
  messages,
  isDarkMode = false,
}: MessageListProps) {
  // Remove filtering: do not drop any LLM messages; normalize instead
  const validMessages = React.useMemo(() => {
    if (!Array.isArray(messages)) {
      logger.warn('MessageList', 'Messages is not an array', { messages });
      return [];
    }

    return messages.map((message, index) => {
      const actor = (message && (message as any).actor) || 'assistant';
      const ts = (message && typeof (message as any).timestamp === 'number')
        ? (message as any).timestamp
        : Date.now() + index;
      return { ...message, actor, timestamp: ts } as Message;
    });
  }, [messages]);

  // Sort messages by timestamp to ensure proper ordering (use normalized timestamp)
  const sortedMessages = React.useMemo(() => {
    return [...validMessages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }, [validMessages]);
  // Auto-scroll to bottom whenever messages change
  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    try { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); } catch {}
  }, [sortedMessages.length]);


  // Log message statistics for debugging
  React.useEffect(() => {
    logger.debug('MessageList', 'Rendering messages', {
      total: messages?.length || 0,
      valid: validMessages.length,
      filtered: (messages?.length || 0) - validMessages.length,
      uniqueActors: [...new Set(validMessages.map(m => m.actor))].join(', '),
    });
  }, [messages, validMessages]);

  return (
    <div className="p-4 space-y-4 max-w-full">
      {sortedMessages.length === 0 ? (
        <div className="flex flex-col justify-center items-center py-16 text-center">
          <div className="mb-4 text-4xl opacity-50">💬</div>
          <div className="text-gray-500 dark:text-gray-400">No messages yet</div>
        </div>
      ) : (
        sortedMessages.map((message, index) => (
          <MessageBlock
            key={`${message.actor}-${message.timestamp}-${index}`}
            message={message}
            isSameActor={
              index > 0 ? sortedMessages[index - 1].actor === message.actor : false
            }
            isDarkMode={isDarkMode}
            messageIndex={index}
            totalMessages={sortedMessages.length}
          />
        ))
      )}
      <div ref={(el) => { try { (MessageList as any)._bottom = el; } catch {} }} />
    </div>
  );
});

interface MessageBlockProps {
  message: Message;
  isSameActor: boolean;
  isDarkMode?: boolean;
  messageIndex?: number;
  totalMessages?: number;
}

function MessageBlock({
  message,
  isSameActor,
  isDarkMode = false,
  messageIndex = 0,
  totalMessages = 0,
}: MessageBlockProps) {
  // Enhanced validation with error boundaries
  if (!message || !message.actor) {
    logger.error('MessageList', 'Invalid message structure', {
      message,
      messageIndex,
      totalMessages,
    });
    return (
      <div className="flex gap-2 items-center p-3 bg-red-50 rounded-lg border border-red-200">
        <div className="text-red-500">⚠️</div>
        <div className="text-sm text-red-700">Invalid message</div>
      </div>
    );
  }

  // Get actor profile with enhanced fallback handling
  let actor;
  try {
    actor = getActorProfile(message.actor);
  } catch (error) {
    logger.warn('MessageList', 'Failed to get actor profile', {
      actor: message.actor,
      error,
      messageIndex,
    });
    // Use default actor profile
    actor = {
      name: message.actor,
      icon: '🤖',
      iconBackground: '#6366f1',
    };
  }

  // Enhanced message type detection with fallbacks
  const isProgress = message.content === 'Showing progress...';
  const isThinking = message.messageType === 'thinking';
  // Only render ReAct status if it came from model output (thinking content was included by model)
  const isReActStatus = message.messageType === 'react_status' && !!message.reactStatus?.thinkingContent;
  const isStreaming = message.messageType === 'streaming_chunk' || message.isStreaming;
  const isStreamingComplete = message.messageType === 'streaming_complete';
  const isStreamingError = message.messageType === 'streaming_error';
  const isToolResult = message.messageType === 'tool_result';
  const isAssistantContent = message.messageType === 'assistant_content';


  // Collapsible state for tool results (default collapsed)
  const [toolCollapsed, setToolCollapsed] = React.useState(true);

  const toolSummary = React.useMemo(() => {
    const list = message.toolResults || [];
    const total = list.length;
    const success = list.filter(r => r.success).length;
    const failed = total - success;
    const names = Array.from(new Set(list.map(r => r.toolName).filter(Boolean)));
    return { total, success, failed, names };
  }, [message.toolResults]);

  // Map OpenAI tool_calls to UI FunctionCall format when needed
  const mapOpenAIToolCalls = (toolCalls?: any[]) => {
    if (!Array.isArray(toolCalls)) return [] as any[];
    const now = Date.now();
    return toolCalls.map((tc: any, idx: number) => {
      let args: any = {};
      try {
        args = typeof tc?.function?.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : (tc?.function?.arguments || {});
      } catch {
        args = { raw: tc?.function?.arguments };
      }
      return {
        id: tc?.id || `call_${tc?.function?.name || 'fn'}_${now}_${idx}`,
        name: tc?.function?.name || 'function',
        arguments: args,
        status: 'executing',
        timestamp: now,
      };
    });
  };

  const openAiCalls = (message as any)?.tool_calls ? mapOpenAIToolCalls((message as any).tool_calls) : [];
  const effectiveFunctionCalls = (message.functionCalls && message.functionCalls.length > 0) ? message.functionCalls : openAiCalls;
  const isFunctionCall = message.messageType === 'function_call' || (effectiveFunctionCalls && effectiveFunctionCalls.length > 0);

  // Get function call status for styling
  const getFunctionCallStatus = () => {
    if (!message.functionCalls || message.functionCalls.length === 0) return null;
    return message.functionCalls[0].status;
  };

  // Enhanced content validation (avoid placeholder like "[No content]")
  const content = React.useMemo(() => {
    // Prefer actual string content
    if (typeof message.content === 'string' && message.content.length > 0) {
      return message.content;
    }
    // If content is an object or non-string, stringify
    if (message.content && typeof message.content !== 'string') {
      try { return JSON.stringify(message.content); } catch { return String(message.content); }
    }
    // Otherwise, no content string; return empty to avoid showing placeholders
    return '';
  }, [message.content]);

  // Log message rendering for debugging
  React.useEffect(() => {
    logger.debug('MessageList', 'Rendering message block', {
      messageIndex,
      totalMessages,
      actor: message.actor,
      messageType: message.messageType,
      contentLength: content.length,
      timestamp: message.timestamp,
    });
  }, [message, messageIndex, totalMessages, content]);

  return (
    <div className={`flex gap-3 w-full items-start ${!isSameActor ? 'pt-4 mt-4 border-t border-gray-100 dark:border-gray-800' : ''} ${isThinking ? 'p-2 bg-purple-50 rounded-lg opacity-80 dark:bg-purple-900/10' : ''} ${isReActStatus ? 'p-2 bg-green-50 rounded-lg border-l-4 border-green-300 opacity-90 dark:bg-green-900/10' : ''} ${isStreamingError ? 'p-2 bg-red-50 rounded-lg dark:bg-red-900/10' : ''} ${isFunctionCall ? 'p-2 bg-blue-50 rounded-lg border-l-4 border-blue-300 opacity-90 dark:bg-blue-900/10' : ''} ${isToolResult ? 'p-2 bg-green-50 rounded-lg border-l-4 border-green-400 opacity-90 dark:bg-green-900/10' : ''} ${isAssistantContent ? 'p-2 bg-gray-50 rounded-lg dark:bg-gray-900/10' : ''}`}>
      {!isSameActor && (
        <div
          className="flex flex-shrink-0 justify-center items-center w-8 h-8 rounded-full shadow-md"
          style={{ backgroundColor: actor.iconBackground }}
        >
          <img
            src={actor.icon}
            alt={actor.name}
            className="w-6 h-6"
            onError={(e) => {
              logger.warn('MessageList', 'Failed to load actor icon', {
                actor: actor.name,
                icon: actor.icon,
              });
              (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyUzYuNDggMjIgMTIgMjJTMjIgMTcuNTIgMjIgMTJTMTcuNTIgMiAxMiAyWk0xMiAxNEM5Ljc5IDE0IDggMTIuMjEgOCAxMFM5Ljc5IDggMTIgOFMxNiA5Ljc5IDE2IDEyUzE0LjIxIDE0IDEyIDE0Wk0xMiAxOEMxMC45IDE4IDEwIDE3LjEgMTAgMTZDMTAgMTUuOSAxMC45IDE1IDEyIDE1UzE0IDE1LjkgMTQgMTZDMTQgMTcuMSAxMy4xIDE4IDEyIDE4WiIgZmlsbD0iY3VycmVudENvbG9yIi8+Cjwvc3ZnPgo=';
            }}
          />
        </div>
      )}
      {isSameActor && <div className="flex-shrink-0 w-8" />}

      <div className="flex-1 min-w-0">
        <div className="w-full">
          <div className={`text-sm break-words whitespace-pre-wrap ${isThinking ? 'italic text-gray-600 dark:text-gray-300' : ''} ${isReActStatus ? 'text-gray-700 dark:text-gray-300' : ''} ${isStreamingError ? 'text-red-700 dark:text-red-300' : ''} ${isFunctionCall ? 'text-blue-700 dark:text-blue-300' : ''} ${isToolResult ? 'text-green-700 dark:text-green-300' : ''} ${isAssistantContent ? 'text-gray-800 dark:text-gray-200' : ''}`}>
            {isProgress ? (
              <div className="overflow-hidden h-1 bg-gray-200 rounded-full dark:bg-gray-700">
                <div className="h-full bg-blue-500 animate-pulse" style={{ animation: 'progress-animation 2s linear infinite' }} />
              </div>
            ) : isThinking ? (
              <div className="flex gap-2 items-start">
                <div className="text-lg opacity-70">🤔</div>
                <div className="flex-1">{content}</div>
              </div>
            ) : isReActStatus && message.reactStatus ? (
              <div className="space-y-2">
                {message.reactStatus.thinkingContent && (
                  <div className="flex gap-2 items-start">
                    <div className="text-lg opacity-70">💭</div>
                    <div className="flex-1 italic text-gray-600 dark:text-gray-300">{message.reactStatus.thinkingContent}</div>
                  </div>
                )}
                {message.reactStatus.currentAction && (
                  <div className="flex gap-2 items-start">
                    <div className="text-lg opacity-70">⚡</div>
                    <div className="flex-1 text-sm text-gray-700 opacity-80 dark:text-gray-300">{message.reactStatus.currentAction}</div>
                  </div>
                )}
              </div>
            ) : isStreamingError ? (
              <div className="flex gap-2 items-start">
                <div className="text-lg">❌</div>
                <div className="flex-1 text-red-700 dark:text-red-300">{content}</div>
              </div>
            ) : isToolResult ? (
              <div className="space-y-2">
                <div className="flex gap-2 items-start">
                  <div className="text-lg">✅</div>
                  <div className="flex-1">
                    <div className="font-medium text-green-700 dark:text-green-300">Tool Result</div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">{content}</div>
                  </div>
                </div>
                {/* Collapsible tool results */}
                {message.toolResults && message.toolResults.length > 0 && (
                  <div className="ml-8">
                    <button
                      type="button"
                      className="flex gap-2 items-center px-2 py-1 text-xs bg-green-50 rounded border border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:border-green-800"
                      onClick={() => setToolCollapsed(prev => !prev)}
                    >
                      <span className="font-medium text-green-700 dark:text-green-300">
                        {toolCollapsed ? 'Show' : 'Hide'} {toolSummary.total} result{toolSummary.total !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        {toolSummary.success} ok / {toolSummary.failed} fail{toolSummary.failed !== 1 ? 's' : ''}
                      </span>
                      {toolSummary.names.length > 0 && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[160px]">
                          ({toolSummary.names.join(', ')})
                        </span>
                      )}
                    </button>

                    {!toolCollapsed && (
                      <div className="mt-2 space-y-2">
                        {message.toolResults.map((result, index) => (
                          <div key={index} className="p-2 bg-white rounded border border-green-200 dark:bg-gray-800 dark:border-green-700">
                            <div className="flex gap-2 items-center mb-1">
                              <span className="font-mono text-sm font-medium text-green-600 dark:text-green-400">{result.toolName}</span>
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                result.success ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                              }`}>
                                {result.success ? 'Success' : 'Failed'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              <div className="mb-1 font-medium">Result:</div>
                              <pre className="overflow-x-auto text-xs">
                                {typeof result.result === 'object' ? JSON.stringify(result.result, null, 2) : String(result.result)}
                              </pre>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : isAssistantContent ? (
              <div className="flex gap-2 items-start">
                <div className="text-lg">🤖</div>
                <div className="flex-1">
                  <div className="max-w-none break-words prose prose-sm dark:prose-invert">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {content}
                    </ReactMarkdown>
                  </div>
                  {message.finishReason && (
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Finish reason: {message.finishReason}
                    </div>
                  )}
                </div>
              </div>
            ) : isFunctionCall ? (
              <div className="space-y-2">
                <div className="flex gap-2 items-start">
                  <div className="text-lg">🔧</div>
                  <div className="flex-1">
                    <div className="font-medium text-blue-700 dark:text-blue-300">Function Call</div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">{content}</div>
                  </div>
                </div>
                {effectiveFunctionCalls.map((call, index) => (
                  <div key={call.id || index} className="p-2 ml-8 bg-white rounded border border-blue-200 dark:bg-gray-800 dark:border-blue-700">
                    <div className="flex gap-2 items-center mb-1">
                      <span className="font-mono text-sm font-medium text-blue-600 dark:text-blue-400">{call.name}</span>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        call.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        call.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                        call.status === 'executing' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                      }`}>
                        {call.status}
                      </span>
                    </div>
                    {call.arguments && Object.keys(call.arguments).length > 0 && (
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        <div className="mb-1 font-medium">Arguments:</div>
                        <pre className="overflow-x-auto text-xs">
                          {(() => {
                            try {
                              const args: any = call.arguments;
                              if (args && args.__display_truncated__ && typeof args.__display_preview__ === 'string') {
                                return args.__display_preview__;
                              }
                              return typeof args === 'object' ? JSON.stringify(args, null, 2) : String(args);
                            } catch {
                              try { return String(call.arguments); } catch { return '[Unrenderable arguments]'; }
                            }
                          })()}
                        </pre>
                      </div>
                    )}

                  </div>
                ))}
              </div>
            ) : (
              <div className="max-w-none break-words prose prose-sm dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            )}
          </div>
          {/* 只在顶层消息显示时间，内部卡片（函数调用/工具结果）不重复显示 */}
          {!isProgress && (
            <div className="mt-1 text-xs text-right text-gray-400 dark:text-gray-500">
              {formatTimestamp(message.timestamp)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(timestamp: number): string {
  // Enhanced timestamp validation and formatting
  if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) {
    logger.warn('MessageList', 'Invalid timestamp', { timestamp });
    return 'Invalid time';
  }

  try {
    const date = new Date(timestamp);
    const now = new Date();

    // Validate date creation
    if (isNaN(date.getTime())) {
      logger.warn('MessageList', 'Invalid date created from timestamp', { timestamp });
      return 'Invalid time';
    }

    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const isThisYear = date.getFullYear() === now.getFullYear();

    const timeStr = date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    if (isToday) {
      return timeStr;
    }

    if (isYesterday) {
      return `Yesterday, ${timeStr}`;
    }

    if (isThisYear) {
      return `${date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      })}, ${timeStr}`;
    }

    return `${date.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })}, ${timeStr}`;
  } catch (error) {
    logger.error('MessageList', 'Error formatting timestamp', {
      timestamp,
      error,
    });
    return 'Time error';
  }
}
