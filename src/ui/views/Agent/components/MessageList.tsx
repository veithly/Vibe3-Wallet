import type { Message } from '../types/message';
import { ACTOR_PROFILES, Actors, getActorProfile } from '../types/message';
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
    <div className={`flex gap-3 max-w-full ${!isSameActor ? 'pt-4 mt-4 border-t border-gray-100 dark:border-gray-800' : ''} ${isThinking ? 'p-2 bg-purple-50 rounded-lg opacity-80 dark:bg-purple-900/10' : ''} ${isReActStatus ? 'p-2 bg-green-50 rounded-lg opacity-90 dark:bg-green-900/10 border-l-3 border-l-green-300' : ''} ${isStreamingError ? 'p-2 bg-red-50 rounded-lg dark:bg-red-900/10' : ''}`}>
      {!isSameActor && (
        <div
          className="flex flex-shrink-0 justify-center items-center w-24 h-24 rounded-full shadow-md"
          style={{ backgroundColor: actor.iconBackground }}
        >
          <img
            src={actor.icon}
            alt={actor.name}
            className="w-16 h-16"
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
      {isSameActor && <div className="flex-shrink-0 w-10" />}

      <div className="flex-1 min-w-0">
        <div>
          <div className={`text-sm ${isThinking ? 'italic text-gray-600 dark:text-gray-300' : ''} ${isReActStatus ? 'text-gray-700 dark:text-gray-300' : ''} ${isStreamingError ? 'text-red-700 dark:text-red-300' : ''}`}>
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
            ) : (
              <div className="max-w-none prose prose-sm dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            )}
          </div>
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
