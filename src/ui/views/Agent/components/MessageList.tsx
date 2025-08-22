import type { Message } from '../types/message';
import { getActorProfile, Actors } from '../types/message';
import { memo } from 'react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../styles/MessageList.less';
import { logger } from '../utils/logger';

interface MessageListProps {
  messages: Message[];
  isDarkMode?: boolean;
  onWalletConfirm?: (approvalId: string, data: any, addToWhitelist?: boolean) => void;
  onWalletReject?: (approvalId: string, data: any) => void;
}

export default memo(function MessageList({
  messages,
  isDarkMode = false,
  onWalletConfirm,
  onWalletReject,
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
    // 使用 requestAnimationFrame 确保在DOM更新后执行滚动
    const scrollToBottom = () => {
      try {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      } catch (e) {
        logger.warn('MessageList', 'Failed to scroll to bottom', e);
      }
    };

    // 延迟执行滚动，确保消息内容已经渲染完成
    const timeoutId = setTimeout(() => {
      requestAnimationFrame(scrollToBottom);
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [sortedMessages.length, sortedMessages]); // 添加 sortedMessages 作为依赖，确保每次消息变化都触发滚动


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
    <div className="message-list-container" style={{ padding: '16px' }}>
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
            onWalletConfirm={onWalletConfirm}
            onWalletReject={onWalletReject}
          />
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
});

interface MessageBlockProps {
  message: Message;
  isSameActor: boolean;
  isDarkMode?: boolean;
  messageIndex?: number;
  totalMessages?: number;
  onWalletConfirm?: (approvalId: string, data: any, addToWhitelist?: boolean) => void;
  onWalletReject?: (approvalId: string, data: any) => void;
}

function MessageBlock({
  message,
  isSameActor,
  isDarkMode = false,
  messageIndex = 0,
  totalMessages = 0,
  onWalletConfirm,
  onWalletReject,
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

  // Check if this is a user message
  const isUserMessage = message.actor === Actors.USER;
  
  // Enhanced message type detection with fallbacks
  const isProgress = message.content === 'Showing progress...';
  const isThinking = message.messageType === 'thinking';
  const isReActStatus = message.messageType === 'react_status' && !!message.reactStatus?.thinkingContent;
  const isStreaming = message.messageType === 'streaming_chunk' || message.isStreaming;
  const isStreamingComplete = message.messageType === 'streaming_complete';
  const isStreamingError = message.messageType === 'streaming_error';
  const isToolResult = message.messageType === 'tool_result';
  const isAssistantContent = message.messageType === 'assistant_content';
  const isWalletAutoConnected = message.messageType === 'wallet_auto_connected';
  const isWalletAutoSigned = message.messageType === 'wallet_auto_signed';
  const isWalletAutoApprovedTx = message.messageType === 'wallet_auto_approved_tx';
  const isWalletConfirmationRequest = message.messageType === 'wallet_confirmation_request';
  const isFunctionCall = message.messageType === 'function_call';
  
  // Special message types that should always be centered
  const isCenteredMessage = isWalletAutoConnected || isWalletAutoSigned || 
                           isWalletAutoApprovedTx || isWalletConfirmationRequest;
  
  // Local state for wallet confirmation checkbox within this message block
  const [addToWhitelist, setAddToWhitelist] = React.useState(false);
  const [toolCollapsed, setToolCollapsed] = React.useState(true);

  // Enhanced content validation
  const content = React.useMemo(() => {
    if (typeof message.content === 'string' && message.content.length > 0) {
      return message.content;
    }
    if (message.content && typeof message.content !== 'string') {
      try { return JSON.stringify(message.content); } catch { return String(message.content); }
    }
    return '';
  }, [message.content]);

  // Tool summary for tool results
  const toolSummary = React.useMemo(() => {
    const list = message.toolResults || [];
    const total = list.length;
    const success = list.filter(r => r.success).length;
    const failed = total - success;
    const names = Array.from(new Set(list.map(r => r.toolName).filter(Boolean)));
    return { total, success, failed, names };
  }, [message.toolResults]);

  // For special cards (wallet confirmations etc.), render centered
  if (isCenteredMessage) {
    return (
      <div style={{ 
        marginBottom: '16px',
        animation: 'slideUp 0.3s ease-out'
      }}>
        {renderSpecialMessageCard(message, isWalletAutoConnected, isWalletAutoSigned, 
                                 isWalletAutoApprovedTx, isWalletConfirmationRequest,
                                 addToWhitelist, setAddToWhitelist, onWalletConfirm, 
                                 onWalletReject, isDarkMode)}
      </div>
    );
  }

  return (
    <div 
      className={`message-block ${isUserMessage ? 'user-message' : 'agent-message'}`}
      style={{
        display: 'flex',
        flexDirection: isUserMessage ? 'row-reverse' : 'row',
        gap: '12px',
        marginBottom: isSameActor ? '8px' : '20px',
        paddingTop: !isSameActor && messageIndex > 0 ? '16px' : '0',
        borderTop: !isSameActor && messageIndex > 0 
          ? `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}` 
          : 'none',
        alignItems: 'flex-start',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      {/* Avatar */}
      {!isSameActor && (
        <div
          className="message-avatar"
          style={{
            flexShrink: 0,
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: isUserMessage
              ? 'linear-gradient(135deg, #468585, #50a0a0)'
              : actor.iconBackground,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            border: `2px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.8)'}`,
            alignSelf: 'flex-start', // Ensure avatar aligns to top
          }}
        >
          {isUserMessage ? (
            <div style={{ fontSize: '20px' }}>👤</div>
          ) : (
            <img
              src={actor.icon}
              alt={actor.name}
              style={{ width: '24px', height: '24px' }}
              onError={(e) => {
                logger.warn('MessageList', 'Failed to load actor icon', {
                  actor: actor.name,
                  icon: actor.icon,
                });
                (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyUzYuNDggMjIgMTIgMjJTMjIgMTcuNTIgMjIgMTJTMTcuNTIgMiAxMiAyWk0xMiAxNEM5Ljc5IDE0IDggMTIuMjEgOCAxMFM5Ljc5IDggMTIgOFMxNiA5Ljc5IDE2IDEyUzE0LjIxIDE0IDEyIDE0Wk0xMiAxOEMxMC45IDE4IDEwIDE3LjEgMTAgMTZDMTAgMTUuOSAxMC45IDE1IDEyIDE1UzE0IDE1LjkgMTQgMTZDMTQgMTcuMSAxMy4xIDE4IDEyIDE4WiIgZmlsbD0iY3VycmVudENvbG9yIi8+Cjwvc3ZnPgo=';
              }}
            />
          )}
        </div>
      )}
      {isSameActor && <div style={{ width: '36px', flexShrink: 0 }} />}

      {/* Message bubble */}
      <div
        className="message-bubble"
        style={{
          maxWidth: '70%',
          minWidth: '100px',
          padding: '12px 16px',
          borderRadius: isUserMessage
            ? '4px 18px 18px 18px'
            : '18px 4px 18px 18px',
          background: isUserMessage
            ? 'linear-gradient(135deg, #468585, #50a0a0)'
            : (isDarkMode ? '#2a2a2a' : '#f5f5f5'),
          color: isUserMessage
            ? '#ffffff'
            : (isDarkMode ? '#ffffff' : '#1a1a1a'),
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
          border: `1px solid ${
            isUserMessage
              ? 'transparent'
              : (isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)')
          }`,
          position: 'relative',
          wordBreak: 'break-word',
          alignSelf: 'flex-start', // Ensure bubble aligns to top
        }}
      >
        {/* Message type indicator */}
        {(isThinking || isFunctionCall || isToolResult) && (
          <div style={{
            position: 'absolute',
            top: '-8px',
            left: isUserMessage ? 'auto' : '12px',
            right: isUserMessage ? '12px' : 'auto',
            background: isThinking ? '#9333ea' : isFunctionCall ? '#3b82f6' : '#10b981',
            color: '#ffffff',
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '10px',
            fontWeight: '600',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          }}>
            {isThinking ? 'Thinking' : isFunctionCall ? 'Function' : 'Result'}
          </div>
        )}

        {/* Content rendering based on type */}
        <div className="message-content">
          {isProgress ? (
            <div style={{
              height: '4px',
              background: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                background: 'linear-gradient(90deg, #468585, #50a0a0)',
                width: '50%',
                animation: 'progressSlide 1.5s linear infinite',
              }} />
            </div>
          ) : isThinking ? (
            <div style={{ fontStyle: 'italic', opacity: 0.9 }}>
              {content}
            </div>
          ) : isFunctionCall && message.functionCalls ? (
            <div>
              {content && <div style={{ marginBottom: '8px' }}>{content}</div>}
              {message.functionCalls.map((call, idx) => (
                <div key={idx} style={{
                  marginTop: '8px',
                  padding: '8px',
                  background: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                    {call.name}
                  </div>
                  {call.arguments && Object.keys(call.arguments).length > 0 && (
                    <pre style={{
                      fontSize: '11px',
                      overflow: 'auto',
                      maxHeight: '100px',
                      background: isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.8)',
                      padding: '6px',
                      borderRadius: '4px',
                      margin: '4px 0 0 0',
                    }}>
                      {JSON.stringify(call.arguments, null, 2)}
                    </pre>
                  )}
                  <div style={{
                    display: 'inline-block',
                    marginTop: '6px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '600',
                    background: call.status === 'completed' ? '#10b981' 
                             : call.status === 'failed' ? '#ef4444'
                             : '#f59e0b',
                    color: '#ffffff',
                  }}>
                    {call.status}
                  </div>
                </div>
              ))}
            </div>
          ) : isToolResult && message.toolResults ? (
            <div>
              <div style={{ marginBottom: '8px' }}>{content}</div>
              <button
                onClick={() => setToolCollapsed(!toolCollapsed)}
                style={{
                  padding: '6px 12px',
                  background: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{toolCollapsed ? '▶' : '▼'}</span>
                {toolSummary.total} Result{toolSummary.total !== 1 ? 's' : ''}
                ({toolSummary.success} ok, {toolSummary.failed} failed)
              </button>
              {!toolCollapsed && (
                <div style={{ marginTop: '8px' }}>
                  {message.toolResults.map((result, idx) => (
                    <div key={idx} style={{
                      marginTop: '8px',
                      padding: '8px',
                      background: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                        {result.toolName}
                        <span style={{
                          marginLeft: '8px',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          fontSize: '10px',
                          background: result.success ? '#10b981' : '#ef4444',
                          color: '#ffffff',
                        }}>
                          {result.success ? 'Success' : 'Failed'}
                        </span>
                      </div>
                      <pre style={{
                        fontSize: '11px',
                        overflow: 'auto',
                        maxHeight: '100px',
                        background: isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.8)',
                        padding: '6px',
                        borderRadius: '4px',
                        margin: '4px 0 0 0',
                      }}>
                        {typeof result.result === 'object' 
                          ? JSON.stringify(result.result, null, 2) 
                          : String(result.result)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Timestamp */}
        <div style={{
          marginTop: '8px',
          fontSize: '11px',
          opacity: 0.6,
          textAlign: isUserMessage ? 'right' : 'left',
        }}>
          {formatTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

// Helper function to render special message cards
function renderSpecialMessageCard(
  message: Message,
  isWalletAutoConnected: boolean,
  isWalletAutoSigned: boolean,
  isWalletAutoApprovedTx: boolean,
  isWalletConfirmationRequest: boolean,
  addToWhitelist: boolean,
  setAddToWhitelist: (value: boolean) => void,
  onWalletConfirm?: (approvalId: string, data: any, addToWhitelist?: boolean) => void,
  onWalletReject?: (approvalId: string, data: any) => void,
  isDarkMode?: boolean
) {
  const wc: any = (message as any).walletConfirmation || {};
  const approvalId: string = (message as any).approvalId || '';
  
  if (isWalletAutoConnected) {
    return (
      <div style={{
        padding: '16px',
        background: 'linear-gradient(135deg, #10b981, #059669)',
        borderRadius: '12px',
        color: '#ffffff',
        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '24px' }}>🔗</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', fontSize: '16px' }}>Wallet Connected</div>
            <div style={{ fontSize: '14px', opacity: 0.9 }}>{message.content}</div>
          </div>
        </div>
      </div>
    );
  }

  if (isWalletAutoSigned) {
    return (
      <div style={{
        padding: '16px',
        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        borderRadius: '12px',
        color: '#ffffff',
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '24px' }}>✍️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', fontSize: '16px' }}>Message Signed</div>
            <div style={{ fontSize: '14px', opacity: 0.9 }}>{message.content}</div>
          </div>
        </div>
      </div>
    );
  }

  if (isWalletAutoApprovedTx) {
    return (
      <div style={{
        padding: '16px',
        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
        borderRadius: '12px',
        color: '#ffffff',
        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '24px' }}>🚀</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', fontSize: '16px' }}>Transaction Approved</div>
            <div style={{ fontSize: '14px', opacity: 0.9 }}>{message.content}</div>
          </div>
        </div>
      </div>
    );
  }

  if (isWalletConfirmationRequest) {
    return (
      <div style={{
        padding: '16px',
        background: isDarkMode 
          ? 'linear-gradient(135deg, #1e1e1e, #2a2a2a)'
          : 'linear-gradient(135deg, #ffffff, #f9fafb)',
        borderRadius: '12px',
        border: `2px solid ${isDarkMode ? '#468585' : '#468585'}`,
        boxShadow: '0 4px 16px rgba(70, 133, 133, 0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ fontSize: '24px' }}>🔐</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', fontSize: '16px', color: isDarkMode ? '#ffffff' : '#1a1a1a' }}>
              Transaction Confirmation Required
            </div>
            <div style={{ fontSize: '14px', color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)' }}>
              {wc.origin || 'dApp'}
            </div>
          </div>
        </div>
        
        {/* Transaction details */}
        <div style={{
          padding: '12px',
          background: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
          borderRadius: '8px',
          fontSize: '13px',
          color: isDarkMode ? '#ffffff' : '#1a1a1a',
        }}>
          {/* Add transaction details here if needed */}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => onWalletReject && onWalletReject(approvalId, wc)}
            style={{
              padding: '8px 16px',
              background: isDarkMode ? '#3a3a3a' : '#e5e5e5',
              color: isDarkMode ? '#ffffff' : '#1a1a1a',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
            }}
          >
            Reject
          </button>
          <button
            onClick={() => onWalletConfirm && onWalletConfirm(approvalId, wc, addToWhitelist)}
            style={{
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #468585, #50a0a0)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) {
    return 'Invalid time';
  }

  try {
    const date = new Date(timestamp);
    const now = new Date();

    if (isNaN(date.getTime())) {
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
    return 'Time error';
  }
}
