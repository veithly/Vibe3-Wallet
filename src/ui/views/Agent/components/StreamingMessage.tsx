// Enhanced streaming message component for real-time AI responses
import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Spin, Alert } from 'antd';
import { FunctionCall } from '@/background/service/agent/llm/types';
import { createLogger } from '@/utils/logger';

const { Text, Paragraph } = Typography;
const logger = createLogger('StreamingMessage');

interface StreamingMessageProps {
  messageId: string;
  initialContent?: string;
  onChunk?: (chunk: any) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: string) => void;
  showFunctionCalls?: boolean;
  className?: string;
}

interface StreamingChunk {
  id: string;
  type: 'content' | 'function_call' | 'done';
  content?: string;
  functionCall?: FunctionCall;
  done?: boolean;
  timestamp: number;
}

interface FunctionCallDisplay {
  name: string;
  arguments: Record<string, any>;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export const StreamingMessage: React.FC<StreamingMessageProps> = ({
  messageId,
  initialContent = '',
  onChunk,
  onComplete,
  onError,
  showFunctionCalls = true,
  className = '',
}) => {
  const [content, setContent] = useState<string>(initialContent);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [functionCalls, setFunctionCalls] = useState<FunctionCallDisplay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chunksReceived, setChunksReceived] = useState<number>(0);

  // Handle incoming streaming chunks
  const handleChunk = useCallback(
    (chunk: StreamingChunk) => {
      try {
        setChunksReceived((prev) => prev + 1);
        logger.debug('Received streaming chunk', {
          messageId,
          chunkType: chunk.type,
        });

        switch (chunk.type) {
          case 'content':
            if (chunk.content) {
              setContent((prev) => prev + chunk.content);
            }
            break;

          case 'function_call':
            if (chunk.functionCall && showFunctionCalls) {
              setFunctionCalls((prev) => [
                ...prev,
                {
                  name: chunk.functionCall?.name || '',
                  arguments: chunk.functionCall?.arguments || {},
                  status: 'pending',
                },
              ]);
            }
            break;

          case 'done':
            setIsActive(false);
            setIsComplete(true);
            if (onComplete) {
              onComplete(content);
            }
            logger.info('Streaming completed', {
              messageId,
              chunksReceived: chunksReceived + 1,
            });
            break;
        }

        if (onChunk) {
          onChunk(chunk);
        }
      } catch (err) {
        const errorMessage = `Error processing streaming chunk: ${
          err instanceof Error ? err.message : String(err)
        }`;
        logger.error('Chunk processing error', err);
        setError(errorMessage);
        if (onError) {
          onError(errorMessage);
        }
      }
    },
    [
      messageId,
      showFunctionCalls,
      onChunk,
      onComplete,
      onError,
      content,
      chunksReceived,
    ]
  );

  // Simulate streaming for demonstration (would be replaced with real streaming data)
  useEffect(() => {
    if (!isActive && !isComplete && !error) {
      setIsActive(true);

      // Simulate streaming chunks
      const simulateStreaming = async () => {
        const chunks = generateMockChunks(initialContent);

        for (let i = 0; i < chunks.length; i++) {
          if (!isActive) break;

          await new Promise((resolve) =>
            setTimeout(resolve, 50 + Math.random() * 100)
          );
          handleChunk(chunks[i]);
        }
      };

      simulateStreaming();
    }
  }, [isActive, isComplete, error, initialContent]);

  // Update function call status
  const updateFunctionCallStatus = useCallback(
    (
      index: number,
      status: FunctionCallDisplay['status'],
      result?: any,
      error?: string
    ) => {
      setFunctionCalls((prev) => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = {
            ...updated[index],
            status,
            result,
            error,
          };
        }
        return updated;
      });
    },
    []
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      setIsActive(false);
    };
  }, []);

  if (error) {
    return (
      <div className={`streaming-message-error ${className}`}>
        <Alert
          message="Streaming Error"
          description={error}
          type="error"
          showIcon
        />
      </div>
    );
  }

  return (
    <div className={`streaming-message ${className}`}>
      {/* Content display */}
      {content && (
        <div className="streaming-content">
          <Paragraph className="streaming-text">
            {content}
            {isActive && (
              <span className="streaming-cursor">
                <Spin size="small" className="inline-spin" />
              </span>
            )}
          </Paragraph>
        </div>
      )}

      {/* Function calls display */}
      {functionCalls.length > 0 && showFunctionCalls && (
        <div className="function-calls-container">
          <Text strong>Function Calls:</Text>
          <div className="function-calls-list">
            {functionCalls.map((funcCall, index) => (
              <FunctionCallComponent
                key={`${funcCall.name}-${index}`}
                functionCall={funcCall}
                onUpdateStatus={(status, result, error) =>
                  updateFunctionCallStatus(index, status, result, error)
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Streaming indicator */}
      {isActive && (
        <div className="streaming-indicator">
          <Spin size="small" />
          <Text type="secondary" style={{ marginLeft: 8 }}>
            Thinking... ({chunksReceived} chunks)
          </Text>
        </div>
      )}

      {/* Completion indicator */}
      {isComplete && (
        <div className="streaming-complete">
          <Text type="success">✓ Response complete</Text>
        </div>
      )}
    </div>
  );
};

// Individual function call component
interface FunctionCallComponentProps {
  functionCall: FunctionCallDisplay;
  onUpdateStatus: (
    status: FunctionCallDisplay['status'],
    result?: any,
    error?: string
  ) => void;
}

const FunctionCallComponent: React.FC<FunctionCallComponentProps> = ({
  functionCall,
  onUpdateStatus,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Simulate function call execution
  useEffect(() => {
    if (functionCall.status === 'pending') {
      onUpdateStatus('executing');

      // Simulate execution delay
      setTimeout(() => {
        const success = Math.random() > 0.2; // 80% success rate

        if (success) {
          onUpdateStatus('completed', {
            result: `Mock result for ${functionCall.name}`,
            timestamp: Date.now(),
          });
        } else {
          onUpdateStatus('failed', undefined, 'Mock execution error');
        }
      }, 1000 + Math.random() * 2000);
    }
  }, [functionCall.status, onUpdateStatus]);

  const getStatusIcon = (status: FunctionCallDisplay['status']) => {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'executing':
        return '⚡';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      default:
        return '❓';
    }
  };

  const getStatusColor = (status: FunctionCallDisplay['status']) => {
    switch (status) {
      case 'pending':
        return '#faad14';
      case 'executing':
        return '#1890ff';
      case 'completed':
        return '#52c41a';
      case 'failed':
        return '#ff4d4f';
      default:
        return '#d9d9d9';
    }
  };

  return (
    <div className="function-call-item">
      <div
        className="function-call-header"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer' }}
      >
        <span
          style={{ marginRight: 8, color: getStatusColor(functionCall.status) }}
        >
          {getStatusIcon(functionCall.status)}
        </span>
        <Text strong>{functionCall.name}</Text>
        <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
          ({functionCall.status})
        </Text>
        <span style={{ marginLeft: 'auto' }}>{isExpanded ? '▲' : '▼'}</span>
      </div>

      {isExpanded && (
        <div className="function-call-details">
          <div className="function-call-arguments">
            <Text strong>Arguments:</Text>
            <pre className="arguments-json">
              {JSON.stringify(functionCall.arguments, null, 2)}
            </pre>
          </div>

          {(functionCall.status === 'completed' ||
            functionCall.status === 'failed') && (
            <div className="function-call-result">
              <Text strong>
                {functionCall.status === 'completed' ? 'Result:' : 'Error:'}
              </Text>
              <pre className="result-content">
                {functionCall.status === 'completed'
                  ? JSON.stringify(functionCall.result, null, 2)
                  : functionCall.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Mock chunk generation for demonstration
function generateMockChunks(content: string): StreamingChunk[] {
  const chunks: StreamingChunk[] = [];
  const words = content.split(' ');

  let currentContent = '';
  for (let i = 0; i < words.length; i++) {
    currentContent += (i > 0 ? ' ' : '') + words[i];

    if (i % 3 === 0 || i === words.length - 1) {
      chunks.push({
        id: `chunk_${i}`,
        type: 'content',
        content: currentContent,
        timestamp: Date.now() + i * 50,
      });
    }
  }

  // Add some function calls for demonstration
  if (Math.random() > 0.7) {
    chunks.push({
      id: 'func_1',
      type: 'function_call',
      functionCall: {
        name: 'checkBalance',
        arguments: { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f4e6d0' },
      },
      timestamp: Date.now() + chunks.length * 50,
    });
  }

  // Add completion signal
  chunks.push({
    id: 'complete',
    type: 'done',
    done: true,
    timestamp: Date.now() + chunks.length * 50,
  });

  return chunks;
}

// Hook for managing streaming messages
export function useStreamingMessage(initialContent: string = '') {
  const [content, setContent] = useState<string>(initialContent);
  const [functionCalls, setFunctionCalls] = useState<FunctionCall[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const startStreaming = useCallback(() => {
    setIsStreaming(true);
    setIsComplete(false);
    setError(null);
    setContent('');
    setFunctionCalls([]);
  }, []);

  const handleChunk = useCallback((chunk: StreamingChunk) => {
    if (chunk.type === 'content' && chunk.content) {
      setContent((prev) => prev + chunk.content);
    } else if (chunk.type === 'function_call' && chunk.functionCall) {
      setFunctionCalls((prev) => [...prev, chunk.functionCall as FunctionCall]);
    } else if (chunk.type === 'done') {
      setIsStreaming(false);
      setIsComplete(true);
    }
  }, []);

  const handleError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    setContent(initialContent);
    setFunctionCalls([]);
    setIsStreaming(false);
    setIsComplete(false);
    setError(null);
  }, [initialContent]);

  return {
    content,
    functionCalls,
    isStreaming,
    isComplete,
    error,
    startStreaming,
    handleChunk,
    handleError,
    reset,
  };
}

// CSS-in-JS styles for the streaming message component
export const streamingMessageStyles = `
  .streaming-message {
    margin: 12px 0;
    padding: 12px;
    border-radius: 8px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
  }

  .streaming-content {
    margin-bottom: 12px;
  }

  .streaming-text {
    margin: 0;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .streaming-cursor {
    display: inline-block;
    vertical-align: text-bottom;
  }

  .inline-spin {
    display: inline-block;
    margin-left: 4px;
  }

  .function-calls-container {
    margin-top: 16px;
    padding: 12px;
    background: white;
    border-radius: 6px;
    border: 1px solid #e9ecef;
  }

  .function-calls-list {
    margin-top: 8px;
  }

  .function-call-item {
    margin: 8px 0;
    padding: 8px;
    background: #f8f9fa;
    border-radius: 4px;
    border-left: 3px solid #e9ecef;
  }

  .function-call-header {
    display: flex;
    align-items: center;
    font-size: 14px;
  }

  .function-call-details {
    margin-top: 8px;
    padding-left: 24px;
  }

  .function-call-arguments,
  .function-call-result {
    margin: 8px 0;
  }

  .arguments-json,
  .result-content {
    background: #f1f3f4;
    padding: 8px;
    border-radius: 4px;
    font-size: 12px;
    white-space: pre-wrap;
    overflow-x: auto;
  }

  .streaming-indicator {
    display: flex;
    align-items: center;
    margin-top: 12px;
    padding: 8px;
    background: #e6f7ff;
    border-radius: 4px;
    font-size: 12px;
  }

  .streaming-complete {
    margin-top: 12px;
    padding: 8px;
    background: #f6ffed;
    border-radius: 4px;
    font-size: 12px;
  }

  .streaming-message-error {
    margin: 12px 0;
  }
`;
