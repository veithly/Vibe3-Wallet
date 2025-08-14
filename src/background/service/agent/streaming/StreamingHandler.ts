// Streaming response handler for real-time AI interactions
import { createLogger } from '@/utils/logger';
import { StreamingLLMResponse, FunctionCall } from '../llm/types';

const logger = createLogger('StreamingHandler');

export interface StreamingOptions {
  enableStreaming: boolean;
  chunkDelay?: number;
  maxRetries?: number;
  onChunk?: (chunk: StreamingLLMResponse) => void;
  onError?: (error: Error) => void;
  onComplete?: (response: string) => void;
  onFunctionCall?: (functionCall: FunctionCall) => void;
}

export interface StreamingState {
  isActive: boolean;
  currentContent: string;
  functionCalls: FunctionCall[];
  startTime: number;
  chunksReceived: number;
  lastChunkTime: number;
}

export class StreamingHandler {
  private state: StreamingState;
  private options: StreamingOptions;
  private abortController: AbortController;
  private retryCount: number = 0;

  constructor(options: StreamingOptions) {
    this.options = {
      chunkDelay: 50,
      maxRetries: 3,
      ...options,
    };

    this.state = {
      isActive: false,
      currentContent: '',
      functionCalls: [],
      startTime: 0,
      chunksReceived: 0,
      lastChunkTime: 0,
    };

    this.abortController = new AbortController();
  }

  async startStreaming(
    generateResponse: () => Promise<{
      content: string;
      functionCalls?: FunctionCall[];
    }>
  ): Promise<{ content: string; functionCalls: FunctionCall[] }> {
    if (!this.options.enableStreaming) {
      // Fall back to non-streaming response
      const response = await generateResponse();
      return {
        content: response.content,
        functionCalls: response.functionCalls || [],
      };
    }

    this.state.isActive = true;
    this.state.startTime = Date.now();
    this.state.currentContent = '';
    this.state.functionCalls = [];
    this.state.chunksReceived = 0;

    try {
      // Simulate streaming by breaking the response into chunks
      const response = await generateResponse();
      await this.simulateStreaming(response);

      return {
        content: this.state.currentContent,
        functionCalls: this.state.functionCalls,
      };
    } catch (error) {
      logger.error('Streaming failed:', error);

      if (this.retryCount < (this.options.maxRetries || 3)) {
        this.retryCount++;
        logger.info(`Retrying streaming (attempt ${this.retryCount})`);
        return this.startStreaming(generateResponse);
      }

      if (this.options.onError) {
        this.options.onError(error as Error);
      }

      throw error;
    } finally {
      this.state.isActive = false;
      if (this.options.onComplete) {
        this.options.onComplete(this.state.currentContent);
      }
    }
  }

  private async simulateStreaming(response: {
    content: string;
    functionCalls?: FunctionCall[];
  }): Promise<void> {
    const chunks = this.chunkResponse(response.content);

    for (let i = 0; i < chunks.length; i++) {
      if (!this.state.isActive || this.abortController.signal.aborted) {
        break;
      }

      const chunk = chunks[i];
      this.state.currentContent += chunk;
      this.state.chunksReceived++;
      this.state.lastChunkTime = Date.now();

      // Send content chunk
      const chunkResponse: StreamingLLMResponse = {
        id: `chunk_${this.state.chunksReceived}`,
        type: 'content',
        content: chunk,
      };

      if (this.options.onChunk) {
        this.options.onChunk(chunkResponse);
      }

      // Simulate network delay
      if (i < chunks.length - 1) {
        await this.delay(this.options.chunkDelay || 50);
      }
    }

    // Handle function calls if any
    if (response.functionCalls && response.functionCalls.length > 0) {
      for (const functionCall of response.functionCalls) {
        if (!this.state.isActive || this.abortController.signal.aborted) {
          break;
        }

        this.state.functionCalls.push(functionCall);

        const functionCallResponse: StreamingLLMResponse = {
          id: `function_${functionCall.name}_${Date.now()}`,
          type: 'function_call',
          functionCall,
        };

        if (this.options.onChunk) {
          this.options.onChunk(functionCallResponse);
        }

        if (this.options.onFunctionCall) {
          this.options.onFunctionCall(functionCall);
        }

        await this.delay(this.options.chunkDelay || 50);
      }
    }

    // Send completion signal
    if (this.state.isActive && !this.abortController.signal.aborted) {
      const completionResponse: StreamingLLMResponse = {
        id: `complete_${Date.now()}`,
        type: 'done',
        done: true,
      };

      if (this.options.onChunk) {
        this.options.onChunk(completionResponse);
      }
    }
  }

  private chunkResponse(content: string): string[] {
    const chunks: string[] = [];
    const chunkSize = 20; // characters per chunk

    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  abort(): void {
    this.state.isActive = false;
    this.abortController.abort();
    logger.info('Streaming aborted');
  }

  getState(): StreamingState {
    return { ...this.state };
  }

  getStats(): {
    duration: number;
    chunksPerSecond: number;
    averageChunkSize: number;
    totalChunks: number;
  } {
    const duration = this.state.lastChunkTime - this.state.startTime;
    const chunksPerSecond =
      duration > 0 ? (this.state.chunksReceived / duration) * 1000 : 0;
    const averageChunkSize =
      this.state.chunksReceived > 0
        ? this.state.currentContent.length / this.state.chunksReceived
        : 0;

    return {
      duration,
      chunksPerSecond,
      averageChunkSize,
      totalChunks: this.state.chunksReceived,
    };
  }
}

// Real-time streaming adapter for different LLM providers
export class RealTimeStreamingAdapter {
  private streamingHandlers: Map<string, StreamingHandler> = new Map();

  createStream(
    streamId: string,
    options: StreamingOptions,
    generateResponse: () => Promise<{
      content: string;
      functionCalls?: FunctionCall[];
    }>
  ): Promise<{ content: string; functionCalls: FunctionCall[] }> {
    const handler = new StreamingHandler(options);
    this.streamingHandlers.set(streamId, handler);

    return handler.startStreaming(generateResponse);
  }

  abortStream(streamId: string): boolean {
    const handler = this.streamingHandlers.get(streamId);
    if (handler) {
      handler.abort();
      this.streamingHandlers.delete(streamId);
      return true;
    }
    return false;
  }

  getStreamState(streamId: string): StreamingState | undefined {
    const handler = this.streamingHandlers.get(streamId);
    return handler?.getState();
  }

  getAllStreams(): { streamId: string; state: StreamingState }[] {
    return Array.from(this.streamingHandlers.entries()).map(
      ([streamId, handler]) => ({
        streamId,
        state: handler.getState(),
      })
    );
  }

  cleanup(): void {
    // Abort all active streams
    for (const [streamId, handler] of this.streamingHandlers.entries()) {
      handler.abort();
    }
    this.streamingHandlers.clear();
    logger.info('All streams cleaned up');
  }
}

// Global streaming adapter instance
export const streamingAdapter = new RealTimeStreamingAdapter();

// Utility functions for streaming
export function createStreamingChunk(
  type: 'content' | 'function_call' | 'done',
  data?: { content?: string; functionCall?: FunctionCall }
): StreamingLLMResponse {
  const baseChunk: StreamingLLMResponse = {
    id: `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
  };

  if (data?.content) {
    baseChunk.content = data.content;
  }

  if (data?.functionCall) {
    baseChunk.functionCall = data.functionCall;
  }

  if (type === 'done') {
    baseChunk.done = true;
  }

  return baseChunk;
}

export function isStreamingComplete(chunk: StreamingLLMResponse): boolean {
  return chunk.type === 'done' && chunk.done === true;
}

export function extractFinalContent(chunks: StreamingLLMResponse[]): string {
  return chunks
    .filter((chunk) => chunk.type === 'content' && chunk.content)
    .map((chunk) => chunk.content!)
    .join('');
}

export function extractFunctionCalls(
  chunks: StreamingLLMResponse[]
): FunctionCall[] {
  return chunks
    .filter((chunk) => chunk.type === 'function_call' && chunk.functionCall)
    .map((chunk) => chunk.functionCall!);
}
