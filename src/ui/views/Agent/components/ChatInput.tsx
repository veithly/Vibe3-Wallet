import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import '../styles/ChatInput.less';
import { logger } from '../utils/logger';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  onStopTask: () => void;
  disabled: boolean;
  showStopButton: boolean;
  setContent?: (setter: (text: string) => void) => void;
  isDarkMode?: boolean;
}

export default function ChatInput({
  onSendMessage,
  onStopTask,
  disabled,
  showStopButton,
  setContent,
  isDarkMode = false,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const isSendButtonDisabled = useMemo(() => {
    return disabled || text.trim() === '';
  }, [disabled, text]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      logger.debug('ChatInput', 'Text changed', { length: newText.length });
      setText(newText);

      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
      }
    },
    []
  );

  useEffect(() => {
    if (setContent) {
      setContent(setText);
    }
  }, [setContent]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      logger.debug('ChatInput', 'Submit handler called', {
        textLength: text.length,
        disabled,
      });
      e.preventDefault();
      e.stopPropagation();

      if (disabled) {
        logger.debug('ChatInput', 'Submit blocked - input disabled');
        return;
      }

      if (text.trim()) {
        logger.info('ChatInput', 'Sending message', { length: text.length });
        try {
          onSendMessage(text);
          setText('');
          // Reset textarea height after sending
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
          }
        } catch (error) {
          logger.error('ChatInput', 'Error in onSendMessage', error);
        }
      } else {
        logger.debug('ChatInput', 'Submit blocked - empty text');
      }
    },
    [text, onSendMessage, disabled]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      logger.debug('ChatInput', 'Key down', {
        key: e.key,
        shiftKey: e.shiftKey,
        disabled,
      });
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        logger.debug('ChatInput', 'Enter key pressed - calling handleSubmit');
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit, disabled]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="chat-input-wrapper"
      aria-label="Chat input form"
      style={{
        padding: '12px 12px 0 12px',
        borderTop: '1px solid rgba(0, 0, 0, 0.08)',
        background: isDarkMode
          ? 'linear-gradient(to bottom, #1a1a1a, #0f0f0f)'
          : 'linear-gradient(to bottom, #ffffff, #fafafa)',
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)',
        margin: 0,
      }}
    >
      <div
        className="chat-input-container"
        style={{
          position: 'relative',
          background: isDarkMode ? '#1e1e1e' : '#ffffff',
          borderRadius: '12px',
          border: `2px solid ${
            isFocused
              ? (isDarkMode ? '#468585' : '#468585')
              : (isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)')
          }`,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isFocused
            ? '0 0 0 4px rgba(70, 133, 133, 0.1), 0 4px 12px rgba(0, 0, 0, 0.1)'
            : '0 2px 8px rgba(0, 0, 0, 0.05)',
          marginBottom: '8px',
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          rows={1}
          style={{
            width: '100%',
            padding: '12px 50px 12px 16px',
            border: 'none',
            borderRadius: '10px',
            resize: 'none',
            outline: 'none',
            background: 'transparent',
            color: isDarkMode ? '#ffffff' : '#1a1a1a',
            fontSize: '15px',
            lineHeight: '1.5',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            minHeight: '44px',
            maxHeight: '120px',
            transition: 'all 0.2s ease',
            opacity: disabled ? 0.5 : 1,
          }}
          placeholder={disabled ? 'Please wait...' : 'Ask me anything...'}
          aria-label="Message input"
        />

        <div 
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          {/* Optional features indicator */}
          {text.length > 0 && !showStopButton && (
            <span 
              style={{
                fontSize: '11px',
                color: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)',
                marginRight: '4px',
                transition: 'opacity 0.2s',
              }}
            >
              {text.length}/4000
            </span>
          )}

          {showStopButton ? (
            <button
              type="button"
              onClick={(e) => {
                logger.info('ChatInput', 'Stop button clicked', {});
                e.preventDefault();
                e.stopPropagation();
                try {
                  onStopTask();
                } catch (error) {
                  logger.error('ChatInput', 'Error calling onStopTask', error);
                }
              }}
              style={{
                padding: '8px 16px',
                background: 'linear-gradient(135deg, #ff4b4b, #ff6b6b)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 2px 8px rgba(255, 75, 75, 0.3)',
                animation: 'fadeIn 0.3s ease-in-out',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 75, 75, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 75, 75, 0.3)';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
              </svg>
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSendButtonDisabled}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: 'none',
                background: isSendButtonDisabled
                  ? (isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)')
                  : 'linear-gradient(135deg, #468585, #50a0a0)',
                color: isSendButtonDisabled
                  ? (isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)')
                  : '#ffffff',
                cursor: isSendButtonDisabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isSendButtonDisabled
                  ? 'none'
                  : '0 2px 8px rgba(70, 133, 133, 0.3)',
                transform: 'scale(1)',
                animation: 'fadeIn 0.3s ease-in-out',
              }}
              onMouseEnter={(e) => {
                if (!isSendButtonDisabled) {
                  e.currentTarget.style.transform = 'scale(1.1) rotate(15deg)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(70, 133, 133, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSendButtonDisabled) {
                  e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(70, 133, 133, 0.3)';
                }
              }}
              onClick={(e) => {
                logger.debug('ChatInput', 'Send button clicked', {
                  isSendButtonDisabled,
                  textLength: text.length,
                });
                if (!isSendButtonDisabled) {
                  // Add click animation
                  e.currentTarget.style.transform = 'scale(0.95)';
                  setTimeout(() => {
                    if (e.currentTarget) {
                      e.currentTarget.style.transform = 'scale(1)';
                    }
                  }, 100);
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {/* Send icon with better design */}
              <svg 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22l-4-9-9-4 20-7z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Helper text */}
      <div
        style={{
          padding: '0 0 8px 0',
          margin: 0,
          fontSize: '12px',
          color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)',
          textAlign: 'center',
          transition: 'opacity 0.2s',
          opacity: disabled ? 0 : 1,
        }}
      >
        Press <kbd style={{
          padding: '2px 6px',
          borderRadius: '4px',
          background: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          fontSize: '11px',
          fontFamily: 'monospace',
        }}>Enter</kbd> to send, <kbd style={{
          padding: '2px 6px',
          borderRadius: '4px',
          background: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          fontSize: '11px',
          fontFamily: 'monospace',
        }}>Shift+Enter</kbd> for new line
      </div>
    </form>
  );
}