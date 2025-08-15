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
  return (
    <div className="message-list">
      {messages.map((message, index) => (
        <MessageBlock
          key={`${message.actor}-${message.timestamp}-${index}`}
          message={message}
          isSameActor={
            index > 0 ? messages[index - 1].actor === message.actor : false
          }
          isDarkMode={isDarkMode}
        />
      ))}
    </div>
  );
});

interface MessageBlockProps {
  message: Message;
  isSameActor: boolean;
  isDarkMode?: boolean;
}

function MessageBlock({
  message,
  isSameActor,
  isDarkMode = false,
}: MessageBlockProps) {
  if (!message.actor) {
    logger.error('MessageList', 'No actor found in message', {
      messageId: message.timestamp,
    });
    return <div />;
  }

  // Get actor profile with fallback handling
  const actor = getActorProfile(message.actor);

  const isProgress = message.content === 'Showing progress...';
  const isThinking = message.messageType === 'thinking';
  const isReActStatus = message.messageType === 'react_status';

  return (
    <div className={`message-block ${!isSameActor ? 'with-separator' : ''} ${isThinking ? 'thinking-message' : ''} ${isReActStatus ? 'react-status-message' : ''}`}>
      {!isSameActor && (
        <div
          className="avatar-container"
          style={{ backgroundColor: actor.iconBackground }}
        >
          <img src={actor.icon} alt={actor.name} />
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
          </div>
        )}

        <div>
          <div className={`message-text ${isThinking ? 'thinking-text' : ''} ${isReActStatus ? 'react-status-text' : ''}`}>
            {isProgress ? (
              <div className="progress-indicator">
                <div className="progress-bar" />
              </div>
            ) : isThinking ? (
              <div className="thinking-content">
                <div className="thinking-icon">🤔</div>
                <div className="thinking-message-content">{message.content}</div>
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
            ) : (
              message.content
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
  const date = new Date(timestamp);
  const now = new Date();

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
}
