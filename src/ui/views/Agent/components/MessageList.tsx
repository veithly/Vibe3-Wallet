import type { Message } from '../types/message';
import { ACTOR_PROFILES, Actors, getActorProfile } from '../types/message';
import { memo } from 'react';
import React from 'react';
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
  // Enhanced validation and filtering
  const validMessages = React.useMemo(() => {
    if (!Array.isArray(messages)) {
      logger.warn('MessageList', 'Messages is not an array', { messages });
      return [];
    }

    return messages.filter((message, index) => {
      // Validate message structure
      if (!message || typeof message !== 'object') {
        logger.warn('MessageList', `Invalid message at index ${index}`, { message });
        return false;
      }

      // Validate required fields
      if (!message.actor || !message.content) {
        logger.warn('MessageList', `Message missing required fields at index ${index}`, { message });
        return false;
      }

      // Validate timestamp
      if (!message.timestamp || typeof message.timestamp !== 'number') {
        logger.warn('MessageList', `Invalid timestamp at index ${index}`, { message });
        return false;
      }

      return true;
    });
  }, [messages]);

  // Sort messages by timestamp to ensure proper ordering
  const sortedMessages = React.useMemo(() => {
    return [...validMessages].sort((a, b) => a.timestamp - b.timestamp);
  }, [validMessages]);

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
    <div className="message-list">
      {sortedMessages.length === 0 ? (
        <div className="empty-message-list">
          <div className="empty-state-icon">💬</div>
          <div className="empty-state-text">No messages yet</div>
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
      <div className="message-error">
        <div className="error-icon">⚠️</div>
        <div className="error-text">Invalid message</div>
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
  const isReActStatus = message.messageType === 'react_status';
  const isStreaming = message.messageType === 'streaming_chunk' || message.isStreaming;
  const isStreamingComplete = message.messageType === 'streaming_complete';
  const isStreamingError = message.messageType === 'streaming_error';

  // Enhanced content validation
  const content = React.useMemo(() => {
    if (!message.content) {
      return '[No content]';
    }
    if (typeof message.content !== 'string') {
      return String(message.content);
    }
    return message.content;
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
    <div className={`message-block ${!isSameActor ? 'with-separator' : ''} ${isThinking ? 'thinking-message' : ''} ${isReActStatus ? 'react-status-message' : ''} ${isStreaming ? 'streaming-message' : ''} ${isStreamingComplete ? 'streaming-complete' : ''} ${isStreamingError ? 'streaming-error' : ''}`}>
      {!isSameActor && (
        <div
          className="avatar-container"
          style={{ backgroundColor: actor.iconBackground }}
        >
          <img 
            src={actor.icon} 
            alt={actor.name}
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
      {isSameActor && <div className="avatar-spacer" />}

      <div className="message-content">
        {!isSameActor && (
          <div className="actor-name">
            {actor.name}
            {isThinking && (
              <span className="thinking-indicator">Thinking...</span>
            )}
            {isReActStatus && message.reactStatus && (
              <span className="react-indicator">
                {message.reactStatus.isThinking ? '🤔 Thinking...' : 
                 message.reactStatus.isActing ? '🔧 Executing...' : 
                 '⚡ Processing...'}
                {message.reactStatus.isActive && (
                  <span className="step-info">
                    (Step {message.reactStatus.currentStep}/{message.reactStatus.maxSteps})
                  </span>
                )}
              </span>
            )}
            {isStreaming && (
              <span className="streaming-indicator">📡 Streaming...</span>
            )}
            {isStreamingComplete && (
              <span className="streaming-complete-indicator">✅ Complete</span>
            )}
            {isStreamingError && (
              <span className="streaming-error-indicator">❌ Error</span>
            )}
          </div>
        )}

        <div>
          <div className={`message-text ${isThinking ? 'thinking-text' : ''} ${isReActStatus ? 'react-status-text' : ''} ${isStreaming ? 'streaming-text' : ''} ${isStreamingComplete ? 'streaming-complete-text' : ''} ${isStreamingError ? 'streaming-error-text' : ''}`}>
            {isProgress ? (
              <div className="progress-indicator">
                <div className="progress-bar" />
              </div>
            ) : isThinking ? (
              <div className="thinking-content">
                <div className="thinking-icon">🤔</div>
                <div className="thinking-message-content">{content}</div>
              </div>
            ) : isReActStatus && message.reactStatus ? (
              <div className="react-status-content">
                {message.reactStatus.thinkingContent && (
                  <div className="thinking-content">
                    <div className="thinking-icon">💭</div>
                    <div className="thinking-message-content">{message.reactStatus.thinkingContent}</div>
                  </div>
                )}
                {message.reactStatus.currentAction && (
                  <div className="current-action">
                    <div className="action-icon">⚡</div>
                    <div className="action-content">{message.reactStatus.currentAction}</div>
                  </div>
                )}
              </div>
            ) : isStreamingError ? (
              <div className="streaming-error-content">
                <div className="error-icon">❌</div>
                <div className="error-message">{content}</div>
              </div>
            ) : (
              <div className="message-content-text">{content}</div>
            )}
          </div>
          {!isProgress && (
            <div className="timestamp">
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
