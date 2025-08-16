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
  onMicClick?: () => void;
  isRecording?: boolean;
  isProcessingSpeech?: boolean;
  disabled: boolean;
  showStopButton: boolean;
  setContent?: (setter: (text: string) => void) => void;
  isDarkMode?: boolean;
}

export default function ChatInput({
  onSendMessage,
  onStopTask,
  onMicClick,
  isRecording = false,
  isProcessingSpeech = false,
  disabled,
  showStopButton,
  setContent,
  isDarkMode = false,
}: ChatInputProps) {
  const [text, setText] = useState('');
  
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
        textarea.style.height = `${Math.min(textarea.scrollHeight, 100)}px`;
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
      textarea.style.height = `${Math.min(textarea.scrollHeight, 100)}px`;
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
      className={`chat-input-form ${disabled ? 'disabled' : ''}`}
      aria-label="Chat input form"
    >
      <div className="input-container">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-disabled={disabled}
          rows={5}
          className="textarea"
          placeholder='What can I help you with?'
          aria-label="Message input"
        />

        <div className={`controls-area ${disabled ? 'disabled' : ''}`}>
          <div className="left-controls">
            {onMicClick && (
              <button
                type="button"
                onClick={(e) => {
                  logger.debug('ChatInput', 'Mic button clicked', {
                    disabled,
                    isProcessingSpeech,
                  });
                  e.preventDefault();
                  e.stopPropagation();
                  if (!disabled && !isProcessingSpeech) {
                    try {
                      onMicClick();
                    } catch (error) {
                      logger.error(
                        'ChatInput',
                        'Error calling onMicClick',
                        error
                      );
                    }
                  }
                }}
                disabled={disabled || isProcessingSpeech}
                aria-label={
                  isProcessingSpeech
                    ? 'Processing speech...'
                    : isRecording
                    ? 'Stop recording'
                    : 'Start voice input'
                }
                className={`mic-button ${isRecording ? 'recording' : ''}`}
              >
                {isProcessingSpeech ? (
                  <div className="mic-icon processing" />
                ) : (
                  <div
                    className={`mic-icon ${isRecording ? 'recording' : ''}`}
                  />
                )}
              </button>
            )}
          </div>

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
              className="action-button stop-button"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSendButtonDisabled}
              aria-disabled={isSendButtonDisabled}
              className="action-button send-button"
              onClick={(e) => {
                logger.debug('ChatInput', 'Send button clicked', {
                  isSendButtonDisabled,
                  textLength: text.length,
                });
                if (!isSendButtonDisabled) {
                  // Let form submission handle this
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </form>
  );
}