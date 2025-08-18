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
      className={`p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${disabled ? 'opacity-50' : ''}`}
      aria-label="Chat input form"
    >
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={3}
          className={`
            w-full p-3 pr-12
            border border-gray-300 dark:border-gray-600 rounded-lg
            resize-none
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            bg-white dark:bg-gray-800 text-gray-900 dark:text-white
            placeholder-gray-500 dark:placeholder-gray-400
            disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500
          `}
          placeholder='What can I help you with?'
          aria-label="Message input"
        />

        <div className={`absolute bottom-3 right-3 flex gap-2 ${disabled ? 'opacity-50' : ''}`}>


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
              className="px-3 py-1.5 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200"
              style={{
                padding: '4px 8px',
                minWidth: '40px',
                minHeight: '28px',
                marginBottom: '4px'
              }}
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSendButtonDisabled}
              className={`
                p-1.5 rounded-md
                ${isSendButtonDisabled
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
                }
                transition-colors duration-200
              `}
              style={{
                padding: '4px',
                minWidth: '28px',
                minHeight: '28px',
                marginBottom: '4px'
              }}
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
              {/* Send icon */}
              <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22l-4-9-9-4 20-7z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </form>
  );
}