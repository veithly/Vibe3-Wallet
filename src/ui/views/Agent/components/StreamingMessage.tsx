// Enhanced streaming message component for real-time AI responses
import React, { useState, useEffect, useCallback } from 'react';
import { FunctionCall } from '@/background/service/agent/llm/types';
import { createLogger } from '@/utils/logger';
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
      <div className={`p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg ${className}`}>
        <div className="flex items-start gap-2">
          <span className="text-red-500">❌</span>
          <div>
            <div className="font-medium text-red-800 dark:text-red-300">Streaming Error</div>
            <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`m-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Content display */}
      {content && (
        <div className="mb-3">
          <p className="m-0 leading-relaxed whitespace-pre-wrap">
            {content}
            {isActive && (
              <span className="inline-block align-text-bottom ml-1">
                <span className="animate-spin">⟳</span>
              </span>
            )}
          </p>
        </div>
      )}

      {/* Function calls display */}
      {functionCalls.length > 0 && showFunctionCalls && (
        <div className="mt-4 p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
          <div className="font-medium text-gray-900 dark:text-white mb-2">Function Calls:</div>
          <div className="mt-2">
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
        <div className="flex items-center mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm">
          <span className="animate-spin mr-2">⟳</span>
          <span className="text-gray-600 dark:text-gray-400">
            Thinking... ({chunksReceived} chunks)
          </span>
        </div>
      )}

      {/* Completion indicator */}
      {isComplete && (
        <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm text-green-700 dark:text-green-400">
          ✓ Response complete
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
        return 'text-yellow-500';
      case 'executing':
        return 'text-blue-500';
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="m-2 p-2 bg-gray-50 dark:bg-gray-700 rounded border-l-3 border-l-gray-200 dark:border-l-gray-600">
      <div
        className="flex items-center text-sm cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={`mr-2 ${getStatusColor(functionCall.status)}`}>
          {getStatusIcon(functionCall.status)}
        </span>
        <span className="font-medium text-gray-900 dark:text-white">{functionCall.name}</span>
        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
          ({functionCall.status})
        </span>
        <span className="ml-auto">{isExpanded ? '▲' : '▼'}</span>
      </div>

      {isExpanded && (
        <div className="mt-2 pl-6">
          <div className="m-2">
            <div className="font-medium text-gray-900 dark:text-white mb-1">Arguments:</div>
            <pre className="bg-gray-100 dark:bg-gray-600 p-2 rounded text-xs whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(functionCall.arguments, null, 2)}
            </pre>
          </div>

          {(functionCall.status === 'completed' ||
            functionCall.status === 'failed') && (
            <div className="m-2">
              <div className="font-medium text-gray-900 dark:text-white mb-1">
                {functionCall.status === 'completed' ? 'Result:' : 'Error:'}
              </div>
              <pre className="bg-gray-100 dark:bg-gray-600 p-2 rounded text-xs whitespace-pre-wrap overflow-x-auto">
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

