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

  return (
    <div className={`message-block ${!isSameActor ? 'with-separator' : ''}`}>
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
        {!isSameActor && <div className="actor-name">{actor.name}</div>}

        <div>
          <div className="message-text">
            {isProgress ? (
              <div className="progress-indicator">
                <div className="progress-bar" />
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
