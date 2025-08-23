import { createLogger } from '@/utils/logger';
import type { ProviderConfig, ModelConfig } from '../storage/index';
import { ProviderTypeEnum } from '../storage/types';
import {
  IWeb3LLM,
  LLMResponse,
  Web3Context,
  LLMAction,
  FunctionSchema,
  StreamingLLMResponse,
  FunctionCall,
} from './types';
import type { BaseChatModel as IBaseChatModel } from './messages';
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from './messages';
import { Web3Intent } from '../intent/IntentRecognizer';
import { toolRegistry } from '../tools/ToolRegistry';
import {
  StreamingHandler,
  createStreamingChunk,
} from '../streaming/StreamingHandler';
import { MultiAgentIntegration } from '../agents/MultiAgentIntegration';
import { TaskAnalysis } from '../task-analysis/IntelligentTaskAnalyzer';

const logger = createLogger('LLMFactory');

// Real LLM implementation with proper error handling and fallbacks
class RealChatModel implements IBaseChatModel {
  private _modelName: string;
  private provider: string;
  private parameters: Record<string, unknown>;
  private _temperature: number;
  private apiKey: string;
  private baseUrl?: string;

  constructor(
    modelName: string,
    provider: string,
    config: ProviderConfig,
    parameters: Record<string, unknown>
  ) {
    this._modelName = modelName;
    this.provider = provider;
    this.parameters = parameters;
    this._temperature = (parameters.temperature as number) || 0.7;
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl;

    logger.info(`Initialized real ${provider} model: ${modelName}`, {
      hasApiKey: !!this.apiKey,
      hasBaseUrl: !!this.baseUrl,
      parameters,
    });
  }

  get modelName(): string {
    return this._modelName;
  }

  get temperature(): number {
    return this._temperature;
  }

  async invoke(messages: any[]): Promise<any> {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new Error(`API key required for ${this.provider} provider`);
    }

    logger.info(
      `Real ${this.provider} model (${this.modelName}) invoked with ${messages.length} messages`
    );

    try {
      switch (this.provider.toLowerCase()) {
        case 'openai':
          return await this.invokeOpenAI(messages);
        case 'anthropic':
          return await this.invokeAnthropic(messages);
        case 'gemini':
          return await this.invokeGemini(messages);
        case 'groq':
          return await this.invokeGroq(messages);
        case 'openrouter':
          return await this.invokeOpenRouter(messages);
        default:
          return await this.invokeGeneric(messages);
      }
    } catch (error) {
      logger.error(`Failed to invoke ${this.provider} model:`, error);
      throw error;
    }
  }

  private async invokeOpenAI(messages: any[]): Promise<any> {
    // Convert internal BaseMessage[] into OpenAI Chat Completions schema with tools
    const { payloadMessages, tools } = this.transformToOpenAI(messages);

    const response = await fetch(
      `${this.baseUrl || 'https://api.openai.com/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this._modelName,
          messages: payloadMessages,
          temperature: this._temperature,
          tools: tools.length ? tools : undefined,
          tool_choice: tools.length ? 'auto' : undefined,
          ...this.parameters,
        }),
      }
    );

    if (!response.ok) {
      let bodyText: string | undefined;
      let bodyJson: any | undefined;
      try {
        bodyText = await response.text();
        bodyJson = JSON.parse(bodyText);
      } catch (_) {
        // ignore
      }
      const errorPayload = bodyJson ?? { status: response.status, statusText: response.statusText, body: bodyText };
      throw new Error(JSON.stringify(errorPayload));
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message || {};
    return {
      content: msg.content || '',
      usage: data.usage,
      tool_calls: msg.tool_calls || [],
      role: msg.role,
    };
  }

  private async invokeAnthropic(messages: any[]): Promise<any> {
    const response = await fetch(
      `${this.baseUrl || 'https://api.anthropic.com/v1'}/messages`,
      {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this._modelName,
          max_tokens: this.parameters.max_tokens || 1000,
          temperature: this._temperature,
          messages: messages.map((msg) => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content,
          })),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Anthropic API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return {
      content: data.content[0]?.text || '',
      usage: data.usage,
    };
  }

  private async invokeGemini(messages: any[]): Promise<any> {
    const response = await fetch(
      `${
        this.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
      }/models/${this._modelName}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: messages.map((msg) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
          })),
          generationConfig: {
            temperature: this._temperature,
            ...this.parameters,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Gemini API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return {
      content: data.candidates[0]?.content?.parts[0]?.text || '',
      usage: data.usageMetadata,
    };
  }

  private async invokeGroq(messages: any[]): Promise<any> {
    const response = await fetch(
      `${this.baseUrl || 'https://api.groq.com/openai/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this._modelName,
          messages: messages.map((msg) => ({
            role: msg.role || 'user',
            content: msg.content,
          })),
          temperature: this._temperature,
          ...this.parameters,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Groq API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage,
    };
  }

  private async invokeOpenRouter(messages: any[]): Promise<any> {
    const response = await fetch(
      `${this.baseUrl || 'https://openrouter.ai/api/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this._modelName,
          messages: messages.map((msg) => ({
            role: msg.role || 'user',
            content: msg.content,
          })),
          temperature: this._temperature,
          ...this.parameters,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `OpenRouter API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage,
    };
  }

  private async invokeGeneric(messages: any[]): Promise<any> {
    // Handle specific providers with custom API endpoints
    switch (this.provider.toLowerCase()) {
      case 'deepseek':
        return await this.invokeDeepSeek(messages);
      case 'grok':
        return await this.invokeGrok(messages);
      case 'ollama':
        return await this.invokeOllama(messages);
      case 'cerebras':
        return await this.invokeCerebras(messages);
      case 'llama':
        return await this.invokeLlama(messages);
      default: {
        // Generic fallback for unsupported providers
        logger.warn(
          `Provider ${this.provider} not directly supported, using generic implementation`
        );

        const lastMessage = messages[messages.length - 1]?.content || '';

        return {
          content: JSON.stringify({
            thinking: `Processing request with ${this.provider} model: ${this._modelName}`,
            actions: [],
            confidence: 0.7,
            reply: `I'm processing your request using the ${this.provider} provider. The system is configured correctly.`,
            provider: this.provider,
            model: this._modelName,
          }),
        };
      }
    }
  }

  private async invokeDeepSeek(messages: any[]): Promise<any> {
    const response = await fetch(
      `${this.baseUrl || 'https://api.deepseek.com/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this._modelName,
          messages: messages.map((msg) => ({
            role: msg.role || 'user',
            content: msg.content,
          })),
          temperature: this._temperature,
          ...this.parameters,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `DeepSeek API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage,
    };
  }

  private async invokeGrok(messages: any[]): Promise<any> {
    // Grok API via xAI
    const response = await fetch(
      `${this.baseUrl || 'https://api.x.ai/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this._modelName,
          messages: messages.map((msg) => ({
            role: msg.role || 'user',
            content: msg.content,
          })),
          temperature: this._temperature,
          ...this.parameters,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Grok API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage,
    };
  }

  private async invokeOllama(messages: any[]): Promise<any> {
    const response = await fetch(
      `${this.baseUrl || 'http://localhost:11434'}/api/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this._modelName,
          prompt: messages
            .map((msg) => `${msg.role}: ${msg.content}`)
            .join('\n'),
          stream: false,
          options: {
            temperature: this._temperature,
            ...this.parameters,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Ollama API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return {
      content: data.response,
      usage: data.usage,
    };
  }

  private async invokeCerebras(messages: any[]): Promise<any> {
    const response = await fetch(
      `${this.baseUrl || 'https://api.cerebras.ai/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this._modelName,
          messages: messages.map((msg) => ({
            role: msg.role || 'user',
            content: msg.content,
          })),
          temperature: this._temperature,
          ...this.parameters,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Cerebras API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage,
    };
  }

  private async invokeLlama(messages: any[]): Promise<any> {
    // Llama API (typically through Together.ai or similar)
    const response = await fetch(
      `${this.baseUrl || 'https://api.together.xyz/v1'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this._modelName,
          messages: messages.map((msg) => ({
            role: msg.role || 'user',
            content: msg.content,
          })),
          temperature: this._temperature,
          ...this.parameters,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Llama API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage,
    };
  }

  async _generate(messages: any[], options?: any): Promise<any> {
    const result = await this.invoke(messages);
    return {
      generations: [
        {
          text: result.content,
          message: result,
        },
      ],
    };
  }

  _llmType(): string {
    return `real-${this.provider}`;
  }

  // Transform internal messages to OpenAI schema with tools support
  private transformToOpenAI(
    messages: any[]
  ): { payloadMessages: any[]; tools: any[] } {
    const payloadMessagesRaw: any[] = [];
    const seenToolCallIds = new Set<string>();

    for (const msg of messages) {
      // Prefer LangChain _getType when available
      const lcType = (msg as any)?._getType?.();
      const type = lcType || (msg as any)?.type;

      if (type === 'system') {
        payloadMessagesRaw.push({ role: 'system', content: msg.content });
        continue;
      }
      if (type === 'human' || type === 'user') {
        payloadMessagesRaw.push({ role: 'user', content: msg.content });
        continue;
      }
      if (type === 'ai' || type === 'assistant') {
        const entry: any = { role: 'assistant', content: msg.content };
        const toolCalls = (msg as any)?.additional_kwargs?.tool_calls;
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          // Filter out duplicate tool_call ids that were already introduced by earlier assistant messages
          const seenAssistantIds: Set<string> = (this as any)._seenAssistantToolCallIds || new Set();
          const ids = toolCalls.map((tc: any) => tc?.id).filter((id: any) => typeof id === 'string');
          const newIds = ids.filter((id: any) => !seenAssistantIds.has(id));
          const filteredCalls = toolCalls.filter((tc: any) => newIds.includes(tc?.id));
          if (filteredCalls.length > 0) {
            entry.tool_calls = filteredCalls;
            // Track tool_call ids so that subsequent tool messages are valid
            for (const tc of filteredCalls) {
              if (tc?.id) { seenToolCallIds.add(tc.id); seenAssistantIds.add(tc.id); }
            }
            (this as any)._seenAssistantToolCallIds = seenAssistantIds;
          }
        }
        payloadMessagesRaw.push(entry);
        continue;
      }
      if (type === 'tool') {
        const tool_call_id = (msg as any)?.tool_call_id || (msg as any)?.additional_kwargs?.tool_call_id;
        // Only include tool messages that correspond to a previously declared assistant.tool_calls
        if (!tool_call_id || !seenToolCallIds.has(tool_call_id)) {
          // skip orphan tool message to avoid OpenAI error
          continue;
        }
        payloadMessagesRaw.push({
          role: 'tool',
          content:
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
          tool_call_id,
        });
        continue;
      }

      // Fallback: infer from explicit role field or default to user
      const explicitRole = (msg as any)?.role;
      payloadMessagesRaw.push({ role: explicitRole || 'user', content: msg.content });
    }

    // Merge consecutive assistant messages that contain tool_calls into a single assistant entry
    // This enforces the requirement that assistant tool_calls are followed by tool messages before another assistant message
    const mergedRaw: any[] = [];
    for (let i = 0; i < payloadMessagesRaw.length; i++) {
      const cur = payloadMessagesRaw[i];
      if (cur.role === 'assistant' && Array.isArray((cur as any).tool_calls) && (cur as any).tool_calls.length > 0) {
        let combined = [...(cur as any).tool_calls];
        let j = i + 1;
        while (
          j < payloadMessagesRaw.length &&
          payloadMessagesRaw[j].role === 'assistant' &&
          Array.isArray((payloadMessagesRaw[j] as any).tool_calls) &&
          (payloadMessagesRaw[j] as any).tool_calls.length > 0
        ) {
          combined = combined.concat((payloadMessagesRaw[j] as any).tool_calls);
          j++;
        }
        // Dedupe by id while preserving order
        const seen = new Set<string>();
        const deduped = combined.filter((tc: any) => {
          const id = tc?.id;
          if (typeof id !== 'string' || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        mergedRaw.push({ ...cur, tool_calls: deduped });
        i = j - 1; // skip merged assistants
      } else {
        mergedRaw.push(cur);
      }
    }

    // Ensure assistant.tool_calls have matching tool messages later in the list
    const toolPositionsById = new Map<string, number[]>();
    mergedRaw.forEach((m, i) => {
      if (m.role === 'tool' && typeof (m as any).tool_call_id === 'string') {
        const id = (m as any).tool_call_id as string;
        const arr = toolPositionsById.get(id) || [];
        arr.push(i);
        toolPositionsById.set(id, arr);
      }
    });

    const filteredRaw: any[] = [];
    mergedRaw.forEach((m, i) => {
      if (m.role === 'assistant' && Array.isArray((m as any).tool_calls) && (m as any).tool_calls.length > 0) {
        const calls = (m as any).tool_calls;
        const matchedIds = calls
          .map((tc: any) => tc?.id)
          .filter((id: any) => typeof id === 'string')
          .filter((id: string) => {
            const positions = toolPositionsById.get(id) || [];
            return positions.some((pos) => pos > i);
          });
        if (matchedIds.length === 0) {
          return; // drop this assistant entry entirely
        }
        (m as any).tool_calls = calls.filter((tc: any) => matchedIds.includes(tc?.id));
      }
      filteredRaw.push(m);
    });

    // Deduplicate consecutive identical user messages to avoid duplicates
    const payloadMessages: any[] = [];
    for (const m of filteredRaw) {
      const prev = payloadMessages[payloadMessages.length - 1];
      if (prev && prev.role === 'user' && m.role === 'user' && String(prev.content) === String(m.content)) {
        continue;
      }
      payloadMessages.push(m);
    }

    const tools: any[] = (this as any)._pending_tools || [];
    return { payloadMessages, tools };
  }
}

// Enhanced Web3LLM class with function calling and streaming support
class Web3LLM implements IWeb3LLM {
  private model: IBaseChatModel;
  private providerType: string;
  private modelName: string;
  private _supportsFunctionCalling: boolean;
  private supportsStreaming: boolean;
  private multiAgentIntegration: MultiAgentIntegration | null;
  private enableMultiAgent: boolean;
  private providerConfig?: ProviderConfig; // Store original provider config

  constructor(
    model: IBaseChatModel,
    providerType: string = 'enhanced',
    modelName: string = 'web3-llm',
    options: { enableMultiAgent?: boolean; context?: Web3Context; providerConfig?: ProviderConfig } = {}
  ) {
    this.model = model;
    this.providerType = providerType;
    this.modelName = modelName;
    this.providerConfig = options.providerConfig; // Store provider config for API key access
    this._supportsFunctionCalling = this.detectFunctionCallingSupport();
    this.supportsStreaming = this.detectStreamingSupport();
    this.enableMultiAgent = options.enableMultiAgent ?? false;
    this.multiAgentIntegration = null;

    // Initialize multi-agent integration if enabled
    if (this.enableMultiAgent && options.context) {
      try {
        this.multiAgentIntegration = new MultiAgentIntegration(this, options.context);
        logger.info('Multi-agent integration enabled for Web3LLM');
      } catch (error) {
        logger.warn('Failed to initialize multi-agent integration:', error);
        this.enableMultiAgent = false;
      }
    }

    logger.info(`Initialized Web3LLM with ${providerType}/${modelName}`, {
      functionCalling: this._supportsFunctionCalling,
      streaming: this.supportsStreaming,
      multiAgentEnabled: this.enableMultiAgent,
      multiAgentAvailable: !!this.multiAgentIntegration,
    });
  }

  public cancelStreaming() {
    try {
      if (this['currentStreamingAbortController']) {
        (this['currentStreamingAbortController'] as AbortController).abort();
        logger.info('🛑 Web3LLM streaming aborted via cancelStreaming()');
      }
    } catch (e) {
      logger.warn('Failed to abort streaming', e);
    }
  }

  async generateResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent,
    tools?: FunctionSchema[]
  ): Promise<LLMResponse> {
    logger.info('Generating Web3LLM response', {
      messageCount: messages.length,
      providerType: this.providerType,
      modelName: this.modelName,
      hasIntent: !!intent,
      hasTools: !!tools && tools.length > 0,
      functionCallingSupported: this.supportsFunctionCalling,
      multiAgentEnabled: this.enableMultiAgent,
      multiAgentAvailable: !!this.multiAgentIntegration,
    });

    try {
      // Check if we should use multi-agent system for complex tasks
      if (this.shouldUseMultiAgent(messages, context, intent)) {
        logger.info('Using multi-agent system for complex task');
        return await this.generateMultiAgentResponse(messages, context, intent);
      }

      // Prefer function calling whenever model supports it. If caller didn't provide tools,
      // fall back to all available tool schemas from the registry.
      const effectiveTools = (tools && tools.length > 0) ? tools : this.getAvailableTools();
      if (this._supportsFunctionCalling && effectiveTools.length > 0) {
        return await this.generateFunctionCallingResponse(
          messages,
          context,
          effectiveTools,
          intent
        );
      } else {
        return await this.generateLegacyResponse(messages, context, intent);
      }
    } catch (error) {
      logger.error('Failed to generate LLM response:', error);
      // Bubble up raw provider error to be rendered by UI instead of preset fallback
      throw error;
    }
  }

  async generateStreamingResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent,
    tools?: FunctionSchema[],
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<LLMResponse> {
    logger.info('🚀 generateStreamingResponse called', {
      supportsStreaming: this.supportsStreaming,
      providerType: this.providerType,
      hasOnChunk: !!onChunk,
      messageCount: messages.length,
      modelName: this.modelName,
    });

    if (!this.supportsStreaming) {
      logger.warn('⚠️ Streaming not supported, falling back to non-streaming', {
        providerType: this.providerType,
        modelName: this.modelName,
        supportedProviders: ['openai', 'anthropic', 'gemini', 'azure-openai', 'openrouter', 'groq'],
      });
      // Fall back to non-streaming response
      const response = await this.generateResponse(
        messages,
        context,
        intent,
        tools
      );
      if (onChunk) {
        logger.info('📤 Sending fallback chunks');
        // Send as single chunk for compatibility
        onChunk(
          createStreamingChunk('content', { content: response.response })
        );
        if (response.functionCalls) {
          for (const functionCall of response.functionCalls) {
            onChunk(createStreamingChunk('function_call', { functionCall }));
          }
        }
        onChunk(createStreamingChunk('done'));
      }
      return response;
    }

    logger.info('Generating streaming Web3LLM response', {
      messageCount: messages.length,
      providerType: this.providerType,
      hasTools: !!tools && tools.length > 0,
    });

    try {
      return await this.generateStreamingResponseInternal(
        messages,
        context,
        intent,
        tools,
        onChunk
      );
    } catch (error) {
      logger.error('Failed to generate streaming response:', error);

      // Fall back to non-streaming
      return await this.generateResponse(messages, context, intent, tools);
    }
  }

  supportsFunctionCalling(): boolean {
    return this._supportsFunctionCalling;
  }

  getAvailableTools(): FunctionSchema[] {
    return toolRegistry.getFunctionSchemas();
  }

  // Get underlying chat model for agent compatibility
  getChatModel(): any {
    return this.model;
  }

  // Multi-agent support methods
  private shouldUseMultiAgent(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent
  ): boolean {
    if (!this.enableMultiAgent || !this.multiAgentIntegration) {
      return false;
    }

    // Use multi-agent for complex Web3 tasks
    const complexTasks = [
      'swap', 'bridge', 'stake', 'unstake', 'defi', 'liquidity',
      'compound', 'yield', 'farm', 'protocol', 'strategy',
      'automation', 'navigate', 'browse', 'follow'
    ];

    const isComplexTask = intent?.action &&
      complexTasks.some(task => intent.action.toLowerCase().includes(task));

    // Check if the user message indicates complex automation
    const lastMessage = messages[messages.length - 1]?.content as string || '';
    const hasAutomationKeywords = [
      'open', 'navigate', 'browse', 'click', 'follow', 'automate',
      'multi-step', 'complex', 'website', 'twitter', 'discord'
    ].some(keyword => lastMessage.toLowerCase().includes(keyword));

    return isComplexTask || hasAutomationKeywords;
  }

  private async generateMultiAgentResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent
  ): Promise<LLMResponse> {
    if (!this.multiAgentIntegration) {
      throw new Error('Multi-agent integration not available');
    }

    try {
      const lastMessage = messages[messages.length - 1]?.content as string || '';

      // Create basic task analysis for multi-agent system
      const taskAnalysis: TaskAnalysis = {
        taskType: 'automation',
        complexity: 'high',
        confidence: 0.8,
        requiresBrowserAutomation: true,
        estimatedSteps: 5,
        reasoning: 'Multi-agent execution requested based on task complexity',
        entities: [],
        requiresWeb3: false,
        timestamp: Date.now(),
        analysis: intent ? `Intent: ${intent.action}` : 'Multi-agent execution requested',
        browserActions: intent ? [intent.action] : ['navigate'],
        web3Actions: []
      };

      // Execute with multi-agent system
      const result = await this.multiAgentIntegration.executeTask(
        lastMessage,
        taskAnalysis,
        false, // No streaming for now
        undefined
      );

      logger.info('Multi-agent response generated successfully', {
        success: result.success,
        steps: result.steps,
        duration: result.duration,
        confidence: result.confidence,
      });

      // Convert multi-agent result to LLMResponse
      return {
        response: result.message,
        actions: result.actions.map(action => ({
          type: action.type || 'unknown',
          params: action.params || {},
          confidence: result.confidence,
          reasoning: action.description,
        })),
        confidence: result.confidence,
        thinking: `Multi-agent execution completed with ${result.steps} steps`,
        functionCalls: [], // Multi-agent has its own action execution model
      };

    } catch (error) {
      logger.error('Multi-agent response generation failed:', error);

      // Fall back to regular function calling
      logger.info('Falling back to function calling response');
      const effectiveTools = this.getAvailableTools();
      if (this._supportsFunctionCalling && effectiveTools.length > 0) {
        return await this.generateFunctionCallingResponse(
          messages,
          context,
          effectiveTools,
          intent
        );
      } else {
        return await this.generateLegacyResponse(messages, context, intent);
      }
    }
  }

  // Public method to enable/disable multi-agent
  setMultiAgentEnabled(enabled: boolean): void {
    this.enableMultiAgent = enabled;
    logger.info(`Multi-agent ${enabled ? 'enabled' : 'disabled'} for Web3LLM`);
  }

  // Public method to get multi-agent status
  getMultiAgentStatus(): {
    enabled: boolean;
    available: boolean;
    systemStatus?: any;
  } {
    return {
      enabled: this.enableMultiAgent,
      available: !!this.multiAgentIntegration,
      systemStatus: this.multiAgentIntegration?.getSystemStatus(),
    };
  }

  // Internal: attach OpenAI tools for RealChatModel when provider supports it
  private attachToolsForProvider(tools?: FunctionSchema[]) {
    if (!tools || tools.length === 0) return;
    const openaiTools = toolRegistry.getOpenAITools();

    // Always set on Web3LLM wrapper for reference
    (this as any)._pending_tools = openaiTools;

    // Case 1: RealChatModel (has transformToOpenAI/invokeOpenAI)
    if (
      (this.model as any).transformToOpenAI ||
      (this.model as any).invokeOpenAI
    ) {
      (this.model as any)._pending_tools = openaiTools;
      return;
    }

    // Case 2: LangChainAdapter wrapping a provider model (e.g., ChatOpenAI)
    // Set pending tools on the adapter and the underlying provider model
    (this.model as any)._pending_tools = openaiTools; // read by LangChainAdapter.invoke
    if ((this.model as any).model) {
      (this.model as any).model._pending_tools = openaiTools; // for safety
      if (typeof (this.model as any).model.bind === 'function') {
        try {
          (this.model as any).model = (this.model as any).model.bind({ tools: openaiTools, tool_choice: 'auto' });
        } catch {}
      }
    }
  }

  private async generateFunctionCallingResponse(
    messages: BaseMessage[],
    context: Web3Context,
    tools: FunctionSchema[],
    intent?: Web3Intent
  ): Promise<LLMResponse> {
    // Check if ReAct pattern is enabled
    const enableReAct = this.shouldUseReActPattern(tools, intent);

    if (enableReAct) {
      return await this.generateReActResponse(messages, context, tools, intent);
    }

    // Use existing single-turn function calling
    return await this.generateSingleTurnFunctionCallingResponse(messages, context, tools, intent);
  }

  private shouldUseReActPattern(tools: FunctionSchema[], intent?: Web3Intent): boolean {
    // Enable ReAct for complex tasks that likely require multiple steps
    const complexTasks = [
      'swap', 'bridge', 'stake', 'unstake', 'defi', 'liquidity',
      'compound', 'yield', 'farm', 'protocol', 'strategy'
    ];

    const isComplexTask = intent?.action &&
      complexTasks.some(task => intent.action.toLowerCase().includes(task));

    const hasMultipleTools = tools.length > 1;

    // Enable ReAct for complex tasks or when multiple tools are available
    return isComplexTask || hasMultipleTools;
  }

  private async generateReActResponse(
    messages: BaseMessage[],
    context: Web3Context,
    tools: FunctionSchema[],
    intent?: Web3Intent
  ): Promise<LLMResponse> {
    // Use Web3Agent runtime config if available via context; fallback to high cap
    const maxSteps = Math.min(50, (context as any)?.reactConfig?.maxSteps ?? 50);
    let currentMessages = [...messages];
    let finalResponse = '';
    let allActions: LLMAction[] = [];
    let allFunctionCalls: FunctionCall[] = [];

    logger.info('Starting ReAct reasoning loop', {
      maxSteps,
      toolsCount: tools.length,
      intent: intent?.action
    });

    for (let step = 0; step < maxSteps; step++) {
      logger.debug(`ReAct Step ${step + 1}/${maxSteps}`);

      // Step 1: Reasoning - What should I do next?
      const reasoningResult = await this.performReActReasoning(
        currentMessages,
        context,
        tools,
        intent,
        step,
        maxSteps
      );

      // Add reasoning to conversation
      currentMessages.push(new AIMessage(reasoningResult.content));

      // Step 2: Action - Execute function calls if any
      // Use tool calls from structured response first, fallback to parsing from text
      const functionCalls = reasoningResult.toolCalls || this.parseFunctionCalls(reasoningResult.content, tools);

      if (functionCalls.length > 0) {
        const externalToolExecution = (context as any)?.externalToolExecution === true;
        if (externalToolExecution) {
          // Defer tool execution to Web3Agent/AgentService for consistent UI callbacks
          logger.debug(`Deferring ${functionCalls.length} function calls to external executor (step ${step + 1})`);

          // Do NOT inject assistant tool_calls here; Web3Agent will inject tool_calls and append ToolMessages
          // This avoids OpenAI schema error when tool_call ids are not paired with tool messages

          const actions = this.convertFunctionCallsToActions(functionCalls);
          allActions.push(...actions);
          allFunctionCalls.push(...functionCalls);

          // Return early with functionCalls so Web3Agent can execute them and continue
          const confidence = this.calculateConfidence(actions, reasoningResult.content);
          return {
            response: reasoningResult.content,
            actions: allActions,
            confidence,
            thinking: `ReAct reasoning (deferred execution)`,
            functionCalls: allFunctionCalls,
          };
        } else {
          logger.debug(`Executing ${functionCalls.length} function calls in step ${step + 1}`);

          // Execute tools and get results
          const toolResults = await this.executeToolCalls(functionCalls);

          // Add action and results to conversation
          currentMessages.push(new AIMessage(
            `Executing ${functionCalls.length} actions: ${functionCalls.map(fc => fc.name).join(', ')}`,
            { tool_calls: functionCalls.map(fc => ({
              id: fc.id || `call_${step}_${Date.now()}`,
              type: 'function',
              function: {
                name: fc.name,
                arguments: JSON.stringify(fc.arguments)
              }
            })) }
          ));

          // Add tool results as ToolMessage objects
          currentMessages.push(...toolResults);

          // Convert to actions and function calls
          const actions = this.convertFunctionCallsToActions(functionCalls);
          allActions.push(...actions);
          allFunctionCalls.push(...functionCalls);

          // Check if we should continue (tool results might indicate we need more steps)
          const shouldContinue = this.shouldContinueReActLoop(toolResults, step, maxSteps);
          if (!shouldContinue) {
            finalResponse = reasoningResult.content;
            break;
          }
        }
      } else {
        // No more actions needed, generate final response
        logger.debug(`No function calls in step ${step + 1}, completing ReAct loop`);
        finalResponse = await this.generateFinalResponse(currentMessages, context, intent);
        break;
      }
    }

    // If we exhausted all steps, generate a summary response
    if (!finalResponse) {
      finalResponse = `I've completed ${allActions.length} actions across ${maxSteps} steps. ${allActions.map(a => a.type).join(', ')}`;
    }

    const confidence = this.calculateConfidence(allActions, finalResponse);

    logger.info('ReAct response generated successfully', {
      steps: Math.min(maxSteps, allFunctionCalls.length > 0 ? Math.min(maxSteps, allFunctionCalls.length) : 1),
      totalActions: allActions.length,
      totalFunctionCalls: allFunctionCalls.length,
      confidence
    });

    return {
      response: finalResponse,
      actions: allActions,
      confidence,
      thinking: `ReAct reasoning completed with ${allActions.length} actions`,
      functionCalls: allFunctionCalls,
    };
  }

  private async performReActReasoning(
    messages: BaseMessage[],
    context: Web3Context,
    tools: FunctionSchema[],
    intent: Web3Intent | undefined,
    currentStep: number,
    maxSteps: number
  ): Promise<{ content: string; toolCalls?: FunctionCall[] }> {
    // Prune messages for provider schema safety: remove dangling tool_calls and orphan tool msgs
    const pruneForProvider = (list: BaseMessage[]): BaseMessage[] => {
      let pruned = [...list];
      const toRemove = new Set<number>();
      const toReplace = new Map<number, BaseMessage>();

      const assistantEntries: Array<{ index: number; ids: string[]; message: any }> = [];
      const toolMessagesById = new Map<string, number[]>();

      pruned.forEach((m: any, idx: number) => {
        const toolCalls = m?.additional_kwargs?.tool_calls;
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          const ids = toolCalls.map((tc: any) => tc?.id).filter((id: any) => typeof id === 'string');
          if (ids.length) assistantEntries.push({ index: idx, ids, message: m });
        }
        const toolId = m?.additional_kwargs?.tool_call_id;
        if (typeof toolId === 'string') {
          const arr = toolMessagesById.get(toolId) || [];
          arr.push(idx);
          toolMessagesById.set(toolId, arr);
        }
      });

      for (const entry of assistantEntries) {
        const { index, ids, message } = entry;
        const matchedIds = ids.filter((id) => {
          const positions = toolMessagesById.get(id) || [];
          return positions.some((pos) => pos > index);
        });
        if (matchedIds.length === 0) {
          toRemove.add(index);
          continue;
        }
        if (matchedIds.length < ids.length) {
          const origCalls = message?.additional_kwargs?.tool_calls || [];
          const filteredCalls = origCalls.filter((tc: any) => matchedIds.includes(tc?.id));
          const cloned = new AIMessage(message.content || '', {
            ...(message.additional_kwargs || {}),
            tool_calls: filteredCalls,
          });
          toReplace.set(index, cloned);
        }
      }

      const remainingAssistantIds = new Map<string, number>();
      pruned.forEach((m: any, idx: number) => {
        if (toRemove.has(idx)) return;
        const msg = toReplace.get(idx) || m;
        const toolCalls = msg?.additional_kwargs?.tool_calls;
        if (Array.isArray(toolCalls)) {
          for (const tc of toolCalls) {
            const id = tc?.id;
            if (typeof id === 'string') remainingAssistantIds.set(id, idx);
          }
        }
      });

      pruned.forEach((m: any, idx: number) => {
        const toolId = m?.additional_kwargs?.tool_call_id;
        if (typeof toolId === 'string') {
          const aIdx = remainingAssistantIds.get(toolId);
          if (aIdx === undefined || aIdx >= idx) {
            toRemove.add(idx);
          }
        }
      });

      const finalMsgs: BaseMessage[] = [];
      pruned.forEach((m: any, idx: number) => {
        if (toRemove.has(idx)) return;
        finalMsgs.push(toReplace.get(idx) || m);
      });

      return finalMsgs;
    };

    const safeMessages = pruneForProvider(messages);

    const systemPrompt = this.createReActSystemPrompt(context, tools, intent, currentStep, maxSteps);
    const userPrompt = this.createReActUserPrompt(safeMessages, context, currentStep, maxSteps);

    // Create proper message array with system prompt
    const reasoningMessages: BaseMessage[] = [
      new (await import('../llm/messages')).SystemMessage(systemPrompt),
      ...safeMessages.slice(-10), // Include recent conversation history
      new (await import('../llm/messages')).HumanMessage(userPrompt)
    ];

    // Attach tools for OpenAI function calling
    if (this._supportsFunctionCalling && tools.length > 0) {
      const openaiTools = tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }));

      // Set tools on the model if it supports it
      if ((this.model as any).bind) {
        this.model = (this.model as any).bind({ tools: openaiTools, tool_choice: 'auto' });
      }
      (this.model as any)._pending_tools = openaiTools;
    }

    const result = await this.model.invoke(reasoningMessages);

    // Extract tool calls from OpenAI response
    let toolCalls: FunctionCall[] = [];
    if (result.tool_calls && Array.isArray(result.tool_calls) && result.tool_calls.length > 0) {
      logger.info('Found tool calls in ReAct reasoning response', {
        toolCallsCount: result.tool_calls.length,
        toolCallNames: result.tool_calls.map((tc: any) => tc.function?.name || 'unknown'),
      });

      // Convert OpenAI tool_calls to FunctionCall format
      toolCalls = result.tool_calls.map((toolCall: any) => {
        try {
          let parsedArguments: Record<string, any> = {};

          if (toolCall.function && toolCall.function.arguments) {
            const rawArgs = toolCall.function.arguments;
            console.log('🚨🚨🚨 CRITICAL DEBUGGING: ReAct tool call arguments parsing:', {
              rawArgs,
              rawArgsType: typeof rawArgs,
              functionName: toolCall.function.name,
              toolCallId: toolCall.id,
            });

            if (typeof rawArgs === 'string') {
              try {
                parsedArguments = JSON.parse(rawArgs);
                console.log('✅ ReAct JSON parsing success:', {
                  parsedArguments,
                  keys: Object.keys(parsedArguments),
                  hasUrl: 'url' in parsedArguments,
                  urlValue: parsedArguments.url,
                });
              } catch (parseError) {
                console.error('🚨🚨🚨 CRITICAL: ReAct JSON parsing failed!', {
                  error: parseError instanceof Error ? parseError.message : String(parseError),
                  rawArgs,
                  rawArgsLength: rawArgs.length,
                  isOfCorruption: rawArgs === 'of',
                  functionName: toolCall.function.name,
                  fullToolCall: JSON.stringify(toolCall, null, 2),
                });
                logger.warn('Failed to parse tool call arguments, using empty object', {
                  error: parseError instanceof Error ? parseError.message : String(parseError),
                  rawArgs,
                });
                parsedArguments = {};
              }
            } else {
              parsedArguments = rawArgs || {};
              console.log('✅ ReAct arguments already parsed:', {
                parsedArguments,
                keys: Object.keys(parsedArguments),
              });
            }
          }

          const finalFunctionCall = {
            name: toolCall.function?.name || 'unknown',
            arguments: parsedArguments,
            id: toolCall.id || `call_${currentStep}_${Date.now()}`,
          };

          console.log('🚨🚨🚨 FINAL ReAct FUNCTION CALL CREATED:', {
            functionName: finalFunctionCall.name,
            arguments: finalFunctionCall.arguments,
            argumentsKeys: Object.keys(finalFunctionCall.arguments),
            hasUrl: 'url' in finalFunctionCall.arguments,
            urlValue: finalFunctionCall.arguments.url,
            isUrlValid: finalFunctionCall.arguments.url &&
                       typeof finalFunctionCall.arguments.url === 'string' &&
                       finalFunctionCall.arguments.url.startsWith('http'),
            fullFunctionCall: JSON.stringify(finalFunctionCall, null, 2),
          });

          return finalFunctionCall;
        } catch (error) {
          logger.error('Failed to parse OpenAI tool call in ReAct', {
            error: error instanceof Error ? error.message : String(error),
            toolCall,
          });

          return {
            name: toolCall.function?.name || 'unknown',
            arguments: {},
            id: toolCall.id || `call_${currentStep}_${Date.now()}`,
          };
        }
      });
    }

    return {
      content: result.content as string,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }

  private createReActSystemPrompt(
    context: Web3Context,
    tools: FunctionSchema[],
    intent: Web3Intent | undefined,
    currentStep: number,
    maxSteps: number
  ): string {
    return `You are Vibe3 AI, an intelligent Web3 assistant using ReAct (Reasoning + Action) pattern.

Current Step: ${currentStep + 1} of ${maxSteps}
Task: ${intent?.action || 'General Web3 assistance'}

ReAct Pattern Instructions:
1. **Reason**: Analyze the current situation and decide what action to take next
2. **Action**: Use function calls to execute your decisions
3. **Observation**: Review the results and determine if more steps are needed

Available Tools:
${this.formatToolsForPrompt(tools)}

Current Context:
- Network: ${context.currentChain}
- Address: ${context.currentAddress}
- Risk Level: ${context.riskLevel}
- Balance: ${Object.entries(context.balances).map(([token, amount]) => `${token}: ${amount}`).join(', ')}

Guidelines:
- Think step by step about what information you need
- Use tools to gather information and execute actions
- Stop when you have enough information to provide a complete answer
- Be concise in your reasoning
- Always explain what you're doing and why

If no more actions are needed, respond with "COMPLETE" and provide your final answer.`;
  }

  private createReActUserPrompt(
    messages: BaseMessage[],
    context: Web3Context,
    currentStep: number,
    maxSteps: number
  ): string {
    const recentHistory = messages.slice(-5).map(msg => {
      const role = msg.type === 'human' ? 'User' : 'Assistant';
      return `${role}: ${msg.content}`;
    }).join('\n');

    return `Step ${currentStep + 1}/${maxSteps}

Recent Conversation:
${recentHistory}

What action should I take next? If I need to use tools, specify which ones and with what parameters. If I have enough information, respond with "COMPLETE" and provide the final answer.`;
  }

  private async executeToolCalls(functionCalls: FunctionCall[]): Promise<BaseMessage[]> {
    const results: BaseMessage[] = [];

    for (const call of functionCalls) {
      try {
        const tool = toolRegistry.getTool(call.name);
        if (!tool) {
          throw new Error(`Tool ${call.name} not found`);
        }

        logger.debug(`Executing tool: ${call.name}`, call.arguments);

        const result = await tool.handler(call.arguments);

        results.push(new ToolMessage({
          content: JSON.stringify(result),
          name: call.name,
          tool_call_id: call.id || `call_${Date.now()}`
        }));

        logger.debug(`Tool ${call.name} executed successfully`);

      } catch (error) {
        logger.error(`Tool ${call.name} execution failed:`, error);

        results.push(new (await import('../llm/messages')).ToolMessage({
          content: JSON.stringify({ error: error.message }),
          name: call.name,
          tool_call_id: call.id || `call_${Date.now()}`
        }));
      }
    }

    return results;
  }

  private shouldContinueReActLoop(
    toolResults: BaseMessage[],
    currentStep: number,
    maxSteps: number
  ): boolean {
    // Stop if we've reached max steps
    if (currentStep >= maxSteps - 1) {
      return false;
    }

    // Check if any tool results indicate we should continue
    for (const result of toolResults) {
      try {
        const content = JSON.parse(result.content);

        // Continue if we got incomplete data or need more information
        if (content.requiresMoreInfo || content.incomplete || content.needsFollowUp) {
          return true;
        }

        // Stop if we got a definitive result
        if (content.complete || content.success || content.final) {
          return false;
        }

      } catch (error) {
        // If we can't parse the result, continue to be safe
        return true;
      }
    }

    // Default: continue if we have more steps available
    return currentStep < maxSteps - 1;
  }

  private async generateFinalResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent
  ): Promise<string> {
    const finalPrompt = `Based on the conversation and tool results, provide a comprehensive final answer to the user's request.

Context:
- Network: ${context.currentChain}
- Address: ${context.currentAddress}
- Task: ${intent?.action || 'General assistance'}

Summarize what you've accomplished and provide any additional insights or recommendations.`;

    const finalMessages: BaseMessage[] = [
      ...messages.slice(-10),
      new (await import('../llm/messages')).HumanMessage(finalPrompt)
    ];

    const result = await this.model.invoke(finalMessages);
    return result.content as string;
  }

  private async generateSingleTurnFunctionCallingResponse(
    messages: BaseMessage[],
    context: Web3Context,
    tools: FunctionSchema[],
    intent?: Web3Intent
  ): Promise<LLMResponse> {
    // Build role-separated messages using PromptManager outputs (assumed provided upstream)
    // Here we send the messages directly and rely on provider-native tool calling
    // Attach provider-native tool schema if supported
    this.attachToolsForProvider(tools);
    const llmRaw = await this.model.invoke(messages as any);

    // If provider exposed tool_calls, convert to our FunctionCall[]
    let toolCalls = (llmRaw.tool_calls || []).map((tc: any) => ({
      name: tc.function?.name,
      arguments: this.tryParseJson(tc.function?.arguments) ?? {},
      id: tc.id,
    }));

    const reply = llmRaw.content ?? '';
    // Fallback: try to parse function calls from textual reply if provider returned none
    if ((!toolCalls || toolCalls.length === 0) && reply) {
      const legacyParsed = this.parseFunctionCalls(reply, tools);
      if (legacyParsed.length > 0) {
        toolCalls = legacyParsed;
      }
    }

    const actions = this.convertFunctionCallsToActions(toolCalls);
    const confidence = this.calculateConfidence(actions, reply);

    logger.info('Single-turn function calling response generated successfully', {
      toolCalls: toolCalls.length,
      actions: actions.length,
    });

    return {
      response: reply,
      actions,
      confidence,
      thinking: '',
      functionCalls: toolCalls,
    };
  }
  private tryParseJson(text: any): any {
    if (typeof text !== 'string') return text;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  private async generateLegacyResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent
  ): Promise<LLMResponse> {
    // Use the original prompt generation for non-function calling models
    const prompt = this.createPrompt(messages, context, intent);

    // Generate response from LLM
    const llmResponse = await this.model.invoke([new HumanMessage(prompt)]);
    const responseText = llmResponse.content as string;

    // Extract actions from response
    const actions = this.extractActions(responseText);

    // Calculate confidence
    const confidence = this.calculateConfidence(actions, responseText);

    // Extract thinking process
    const thinking = this.extractThinking(responseText);

    logger.info('Legacy response generated successfully', {
      responseLength: responseText.length,
      actionsCount: actions.length,
      confidence,
    });

    return {
      response: responseText,
      actions,
      confidence,
      thinking,
    };
  }

  private async generateStreamingResponseInternal(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent,
    tools?: FunctionSchema[],
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<LLMResponse> {
    logger.info('🔥 Starting real streaming response generation', {
      providerType: this.providerType,
      hasTools: !!tools && tools.length > 0,
      messageCount: messages.length,
      hasOnChunk: !!onChunk,
    });

    try {
      // Use real streaming based on provider type
      const providerLower = this.providerType.toLowerCase();
      logger.info(`🎯 Routing to provider-specific streaming: ${providerLower}`);

      switch (providerLower) {
        case 'openai':
        case 'azure-openai':
        case 'openrouter':
          logger.info('🚀 Using OpenAI streaming implementation - BYPASSING LANGCHAIN');
          // IMPORTANT: Directly use our streaming implementation, bypass all LangChain calls
          return await this.generateOpenAIStreamingResponse(messages, context, intent, tools, onChunk);
        case 'anthropic':
          logger.info('🤖 Using Anthropic streaming implementation (fallback)');
          return await this.generateAnthropicStreamingResponse(messages, context, intent, tools, onChunk);
        case 'gemini':
          logger.info('🧠 Using Gemini streaming implementation (fallback)');
          return await this.generateGeminiStreamingResponse(messages, context, intent, tools, onChunk);
        case 'groq':
          logger.info('⚡ Using Groq streaming implementation (fallback)');
          return await this.generateGroqStreamingResponse(messages, context, intent, tools, onChunk);
        default:
          // Fall back to simulated streaming for unsupported providers
          logger.warn(`❌ Real streaming not implemented for provider: ${this.providerType}, falling back to simulated streaming`);
          return await this.generateSimulatedStreamingResponse(messages, context, intent, tools, onChunk);
      }
    } catch (error) {
      logger.error('💥 Real streaming failed, falling back to simulated streaming', error);
      return await this.generateSimulatedStreamingResponse(messages, context, intent, tools, onChunk);
    }
  }

  private async generateSimulatedStreamingResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent,
    tools?: FunctionSchema[],
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<LLMResponse> {
    const streamingHandler = new StreamingHandler({
      enableStreaming: true,
      onChunk,
      onFunctionCall: (functionCall) => {
        logger.info(
          'Function call detected in streaming response',
          functionCall
        );
      },
    });

    const generateResponse = async () => {
      if (this._supportsFunctionCalling && tools && tools.length > 0) {
        const response = await this.generateFunctionCallingResponse(
          messages,
          context,
          tools,
          intent
        );
        return {
          content: response.response,
          functionCalls: response.functionCalls || [],
        };
      } else {
        const response = await this.generateLegacyResponse(
          messages,
          context,
          intent
        );
        return {
          content: response.response,
          functionCalls: [],
        };
      }
    };

    const streamingResult = await streamingHandler.startStreaming(
      generateResponse
    );

    // Convert streaming result to LLMResponse
    return {
      response: streamingResult.content,
      actions: [],
      confidence: 0.8,
      thinking: 'Generated via simulated streaming response',
      functionCalls: streamingResult.functionCalls,
    };
  }

  private createFunctionCallingPrompt(
    messages: BaseMessage[],
    context: Web3Context,
    tools: FunctionSchema[],
    intent?: Web3Intent
  ): string {
    // Deprecated: We no longer generate a monolithic user prompt for function calling.
    // Prompts must be built upstream by PromptManager into proper System/Human/AI/Tool messages,
    // and tools must be provided via the tools array (OpenAI function schema) — not embedded in user content.
    // Keeping this function to avoid breaking imports; it should not be used.
    return (messages[messages.length - 1]?.content as string) || '';
  }

  // Transform internal messages to OpenAI schema with tools support
  private transformToOpenAI(
    messages: any[]
  ): { payloadMessages: any[]; tools: any[] } {
    const payloadMessagesRaw: any[] = [];
    const assistantEntries: Array<{ index: number; ids: string[] } > = [];

    for (const [idx, msg] of messages.entries()) {
      const lcType = (msg as any)?._getType?.();
      const type = lcType || (msg as any)?.type;

      if (type === 'system') {
        payloadMessagesRaw.push({ role: 'system', content: msg.content });
        continue;
      }
      if (type === 'human' || type === 'user') {
        payloadMessagesRaw.push({ role: 'user', content: msg.content });
        continue;
      }
      if (type === 'ai' || type === 'assistant') {
        const entry: any = { role: 'assistant', content: msg.content };
        const toolCalls = (msg as any)?.additional_kwargs?.tool_calls;
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          entry.tool_calls = toolCalls;
          const ids = toolCalls.map((tc: any) => tc?.id).filter((id: any) => typeof id === 'string');
          if (ids.length) assistantEntries.push({ index: payloadMessagesRaw.length, ids });
        }
        payloadMessagesRaw.push(entry);
        continue;
      }
      if (type === 'tool') {
        const tool_call_id = (msg as any)?.tool_call_id || (msg as any)?.additional_kwargs?.tool_call_id;
        payloadMessagesRaw.push({
          role: 'tool',
          content:
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
          tool_call_id,
        });
        continue;
      }

      const explicitRole = (msg as any)?.role;
      payloadMessagesRaw.push({ role: explicitRole || 'user', content: msg.content });
    }

    // Post-process to enforce OpenAI tool_call schema within the payload slice
    // 1) Build map from tool_call_id -> positions of tool messages
    const toolPositionsById = new Map<string, number[]>();
    payloadMessagesRaw.forEach((m, i) => {
      if (m.role === 'tool' && typeof (m as any).tool_call_id === 'string') {
        const id = (m as any).tool_call_id as string;
        const arr = toolPositionsById.get(id) || [];
        arr.push(i);
        toolPositionsById.set(id, arr);
      }
    });

    // 2) For each assistant with tool_calls, filter to ids that have a tool message later in the list
    const toRemoveAssistant = new Set<number>();
    assistantEntries.forEach(({ index, ids }) => {
      const entry = payloadMessagesRaw[index] as any;
      const calls = entry.tool_calls || [];
      const matchedIds = ids.filter((id) => {
        const positions = toolPositionsById.get(id) || [];
        return positions.some((pos) => pos > index);
      });
      if (matchedIds.length === 0) {
        // No matched ids -> drop the assistant message to avoid schema error
        toRemoveAssistant.add(index);
      } else if (matchedIds.length < ids.length) {
        // Partially matched -> only keep matched tool_calls
        entry.tool_calls = calls.filter((tc: any) => matchedIds.includes(tc?.id));
      }
    });

    // 3) Remove assistant entries flagged above
    const filteredRaw: any[] = payloadMessagesRaw.filter((_, i) => !toRemoveAssistant.has(i));

    // 4) Deduplicate consecutive identical user messages
    const payloadMessages: any[] = [];
    for (const m of filteredRaw) {
      const prev = payloadMessages[payloadMessages.length - 1];
      if (prev && prev.role === 'user' && m.role === 'user' && String(prev.content) === String(m.content)) {
        continue;
      }
      payloadMessages.push(m);
    }

    const tools: any[] = (this as any)._pending_tools || [];
    return { payloadMessages, tools };
  }

  private createPrompt(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent
  ): string {
    const systemPrompt = `You are Vibe3 AI, an intelligent Web3 assistant that helps users perform blockchain operations through natural language commands.

Your capabilities include:
- Understanding complex Web3 instructions and breaking them down into executable actions
- Providing clear explanations of blockchain operations, risks, and costs
- Suggesting optimal strategies for swaps, bridges, staking, and other DeFi operations
- Maintaining security awareness and guiding users through safe practices

Key principles:
1. **Security First**: Always verify contract addresses, warn about high-risk operations
2. **Transparency**: Clearly explain fees, slippage, and estimated times
3. **Efficiency**: Suggest the most cost-effective and fastest routes
4. **User Control**: Never proceed without user confirmation for significant operations

Available Actions:
- addLiquidity: Provide liquidity to AMM pools
- removeLiquidity: Withdraw liquidity from pools
- getNFTs: Query NFT holdings
- getGasPrice: Get current gas prices
- estimateGas: Estimate gas costs
- signMessage: Sign messages with wallet

When responding, always structure your answer as JSON with:
{
  "thinking": "Your step-by-step reasoning process",
  "actions": [Array of actions to execute],
  "confidence": 0.8,
  "reply": "Natural language response to user"
}`;

    // Format conversation history
    const conversationHistory = this.formatConversation(messages);

    // Format current context
    const formattedContext = this.formatContext(context);

    // Format user message
    const userMessage = messages[messages.length - 1].content as string;

    return `${systemPrompt}

${conversationHistory}

=== CURRENT WEB3 CONTEXT ===
${formattedContext}

=== USER INSTRUCTION ===
${userMessage}`;
  }

  private formatConversation(messages: BaseMessage[]): string {
    return messages
      .map((msg) => {
        let role = 'System';

        // Check message type by content structure or instance
        if (msg.content && typeof msg.content === 'string') {
          // This is a simplified check - in production you'd use proper type guards
          role = 'User'; // Default to user for most messages in this context
        }

        // Fallback to checking if it's a HumanMessage instance
        try {
          if (msg.constructor && msg.constructor.name === 'HumanMessage') {
            role = 'User';
          } else if (msg.constructor && msg.constructor.name === 'AIMessage') {
            role = 'Assistant';
          }
        } catch (e) {
          // If constructor access fails, use default
        }

        return `${role}: ${msg.content}`;
      })
      .join('\n');
  }

  private formatContext(context: Web3Context): string {
    return `
Current Chain: ${context.currentChain}
Current Address: ${context.currentAddress}
Risk Level: ${context.riskLevel}
Available Balances: ${Object.entries(context.balances)
      .map(([token, amount]) => `${token}: ${amount}`)
      .join(', ')}
Gas Prices: ${Object.entries(context.gasPrices)
      .map(([chain, price]) => `Chain ${chain}: ${price}`)
      .join(', ')}
Protocols: ${Object.keys(context.protocols).join(', ')}
`.trim();
  }

  private parseFunctionCalls(
    responseText: string,
    availableTools: FunctionSchema[]
  ): FunctionCall[] {
    const functionCalls: FunctionCall[] = [];

    try {
      const response = JSON.parse(responseText);

      // Check if response contains function calls
      if (response.function_calls && Array.isArray(response.function_calls)) {
        functionCalls.push(...response.function_calls);
      }

      // Also check for legacy action format
      if (response.actions && Array.isArray(response.actions)) {
        for (const action of response.actions) {
          const tool = availableTools.find((t) => t.name === action.type);
          if (tool) {
            functionCalls.push({
              name: action.type,
              arguments: action.params || {},
            });
          }
        }
      }
    } catch (error) {
      // Response is not JSON, try to extract function calls from text
      return this.extractFunctionCallsFromText(responseText, availableTools);
    }

    return functionCalls;
  }

  private extractFunctionCallsFromText(
    text: string,
    availableTools: FunctionSchema[]
  ): FunctionCall[] {
    const functionCalls: FunctionCall[] = [];


    const toolNames = availableTools.map((tool) => tool.name);

    for (const toolName of toolNames) {
      const pattern = new RegExp(`\\b${toolName}\\b`, 'gi');
      if (pattern.test(text)) {
        // Extract parameters based on tool schema
        const tool = availableTools.find((t) => t.name === toolName);
        if (tool) {
          const params = this.extractParametersFromText(text, tool);
          functionCalls.push({
            name: toolName,
            arguments: params,
          });
        }
      }
    }

    return functionCalls;
  }

  private extractParametersFromText(
    text: string,
    tool: FunctionSchema
  ): Record<string, any> {
    const params: Record<string, any> = {};

    // Simple parameter extraction based on parameter names
    for (const [paramName, paramSchema] of Object.entries(
      tool.parameters.properties
    )) {
      // Look for parameter values in text
      const valuePatterns = [
        `${paramName}[:\\s]+([^\\s,]+)`,
        `${paramName}\\s*=\\s*([^\\s,]+)`,
        `${paramName}\\s+is\\s+([^\\s,]+)`,
      ];

      for (const pattern of valuePatterns) {
        const match = text.match(new RegExp(pattern, 'i'));
        if (match && match[1]) {
          let value: any = match[1];

          // Convert to appropriate type
          const schemaType = (paramSchema as any).type;
          if (schemaType === 'number') {
            value = parseFloat(value);
          } else if (schemaType === 'boolean') {
            value = value.toLowerCase() === 'true';
          }

          params[paramName] = value;
          break;
        }
      }
    }

    return params;
  }

  private convertFunctionCallsToActions(
    functionCalls: FunctionCall[]
  ): LLMAction[] {
    return functionCalls.map((fc) => ({
      type: fc.name,
      params: fc.arguments,
      confidence: 0.8,
      reasoning: `Function call: ${fc.name}`,
      functionCall: fc,
    }));
  }

  private extractActions(llmResponse: string): LLMAction[] {
    try {
      const response = JSON.parse(llmResponse);
      return response.actions || [];
    } catch (error) {
      // Fallback to pattern matching
      return this.extractActionsFromText(llmResponse);
    }
  }

  private extractActionsFromText(text: string): LLMAction[] {
    const actions: LLMAction[] = [];

    const actionPatterns: Map<string, RegExp> = new Map([
      ['addLiquidity', /add.*liquidity|provide.*liquidity|添加.*流动性/i],
      [
        'removeLiquidity',
        /remove.*liquidity|withdraw.*liquidity|移除.*流动性/i,
      ],
    ]);

    for (const [actionType, pattern] of actionPatterns) {
      if (pattern.test(text)) {
        actions.push({
          type: actionType,
          params: this.extractParams(actionType, text),
          confidence: 0.7,
          reasoning: 'Extracted from text using pattern matching',
        });
      }
    }

    return actions;
  }

  private extractParams(actionType: string, text: string): Record<string, any> {
    // Simple parameter extraction - can be enhanced with more sophisticated NLP
    const params: Record<string, any> = {};

    switch (actionType) {

    }

    return params;
  }

  private calculateConfidence(
    actions: LLMAction[],
    responseText: string
  ): number {
    if (actions.length === 0) return 0.3;

    // Check if response is properly formatted JSON
    try {
      const parsed = JSON.parse(responseText);
      if (parsed.confidence !== undefined) {
        return parsed.confidence;
      }
    } catch (error) {
      // Response is not JSON formatted
    }

    // Calculate based on action quality
    const avgActionConfidence =
      actions.reduce((sum, action) => sum + action.confidence, 0) /
      actions.length;
    return Math.min(avgActionConfidence, 1.0);
  }

  private extractThinking(responseText: string): string {
    try {
      const parsed = JSON.parse(responseText);
      return parsed.thinking || '';
    } catch (error) {
      return 'Thinking process not available';
    }
  }

  private extractReply(responseText: string): string {
    try {
      const parsed = JSON.parse(responseText);
      return parsed.reply || parsed.response || responseText;
    } catch (error) {
      return responseText;
    }
  }

  private formatToolsForPrompt(tools: FunctionSchema[]): string {
    return tools
      .map((tool) => {
        const requiredParams = tool.parameters.required || [];
        const paramDescriptions = Object.entries(tool.parameters.properties)
          .map(([name, schema]) => {
            const required = requiredParams.includes(name) ? 'true' : 'false';
            return `  - ${name}: ${schema.description} ${required}`;
          })
          .join('\\n');

        return `${tool.name}: ${tool.description}\\nParameters:\\n${paramDescriptions}`;
      })
      .join('\\n\\n');
  }

  private detectFunctionCallingSupport(): boolean {
    // Be permissive: default to true so we always attempt function calling.
    // Providers that don't support it will simply ignore tools and return no tool_calls,
    // and our pipeline will gracefully fall back.
    return true;
  }

  private detectStreamingSupport(): boolean {
    // Detect if the underlying model supports streaming
    const streamingProviders = [
      'openai',
      'anthropic',
      'gemini',
      'azure-openai',
      'openrouter',
      'groq',
    ];

    const supportsStreaming = streamingProviders.includes(this.providerType.toLowerCase());
    logger.info('🔍 Streaming support detection', {
      providerType: this.providerType,
      providerTypeLower: this.providerType.toLowerCase(),
      streamingProviders,
      supportsStreaming,
    });

    return supportsStreaming;
  }

  /**
   * Real OpenAI streaming implementation
   */
  private async generateOpenAIStreamingResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent,
    tools?: FunctionSchema[],
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<LLMResponse> {
    logger.info('🔥 OpenAI streaming method called', {
      messageCount: messages.length,
      hasOnChunk: !!onChunk,
      hasTools: !!tools && tools.length > 0,
    });

    // Normalize messages to proper OpenAI schema (preserve system/tool roles)
    const { payloadMessages } = this.transformToOpenAI(messages as any);

    // Deduplicate consecutive identical user messages to avoid double user inputs
    const openaiMessages: any[] = [];
    for (const m of payloadMessages) {
      const prev = openaiMessages[openaiMessages.length - 1];
      if (prev && prev.role === 'user' && m.role === 'user' && String(prev.content) === String(m.content)) {
        continue; // skip duplicate consecutive user message
      }
      openaiMessages.push(m);
    }

    // Get model configuration from the underlying model
    const modelConfig = this.model as any;
    const modelName = modelConfig.modelName || modelConfig._modelName || 'gpt-3.5-turbo';
    const temperature = modelConfig.temperature || modelConfig._temperature || 0.7;

    // Try multiple ways to get the API key from LangChain model
    let apiKey: string | undefined = undefined;

    // Method 1: Direct properties
    apiKey = modelConfig.apiKey ||
             modelConfig.openAIApiKey ||
             modelConfig.openaiApiKey ||
             modelConfig.configuration?.apiKey ||
             modelConfig.configuration?.openAIApiKey;

    // Method 2: From LangChain model fields
    if (!apiKey && modelConfig.model) {
      const langchainModel = modelConfig.model;
      apiKey = langchainModel.apiKey ||
               langchainModel.openAIApiKey ||
               langchainModel.openaiApiKey ||
               langchainModel.configuration?.apiKey;
    }

    // Method 3: From Web3LLM provider config (most reliable)
    if (!apiKey && this.providerConfig) {
      apiKey = this.providerConfig.apiKey;
      logger.info('🔑 Found API key in provider config', {
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey ? apiKey.length : 0,
      });
    }

    // Method 4: Environment variable
    if (!apiKey) {
      apiKey = process.env.OPENAI_API_KEY;
    }

    const baseUrl = modelConfig.baseUrl ||
                    modelConfig.configuration?.baseUrl ||
                    'https://api.openai.com/v1';

    logger.info('🔧 OpenAI streaming config', {
      modelName,
      temperature,
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      baseUrl,
      messageCount: openaiMessages.length,
      modelConfigKeys: Object.keys(modelConfig),
      modelConfigType: typeof modelConfig,
      modelType: this.model?.constructor?.name,
    });

    if (!apiKey) {
      logger.error('❌ No OpenAI API key found', {
        modelConfig: JSON.stringify(modelConfig, null, 2),
        envHasKey: !!process.env.OPENAI_API_KEY,
      });
      throw new Error('OpenAI API key is required for streaming');
    }

    const requestBody: any = {
      model: modelName,
      messages: openaiMessages,
      temperature: temperature,
      stream: true,
    };

    // Add tools if available
    if (this._supportsFunctionCalling && tools && tools.length > 0) {
      requestBody.tools = tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      requestBody.tool_choice = 'auto';
    }

    logger.info('🚀 Making OpenAI streaming request', {
      url: `${baseUrl}/chat/completions`,
      requestBody: JSON.stringify(requestBody, null, 2),
    });

    // Create/replace AbortController for this streaming request
    try { (this as any).currentStreamingAbortController?.abort(); } catch {}
    (this as any).currentStreamingAbortController = new AbortController();

    const response = await fetch(
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: (this as any).currentStreamingAbortController?.signal,
      }
    );

    logger.info('📡 OpenAI response received', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ OpenAI API error', {
        status: response.status,
        statusText: response.statusText,
        errorText,
      });
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      logger.error('❌ Failed to get response stream reader');
      throw new Error('Failed to get response stream reader');
    }

    logger.info('📖 Starting to read streaming response');
    let fullContent = '';
    let functionCalls: FunctionCall[] = [];
    const decoder = new TextDecoder();
    let chunkCount = 0;

    // Track streaming tool calls
    const streamingToolCalls = new Map<string, {
      id: string;
      name: string;
      arguments: string;
    }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          logger.info('✅ Streaming read completed', { chunkCount, fullContentLength: fullContent.length });
          break;
        }

        chunkCount++;
        const chunk = decoder.decode(value, { stream: true });
        logger.debug(`📦 Received chunk ${chunkCount}`, { chunkLength: chunk.length, chunk: chunk.substring(0, 100) });

        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              logger.info('🏁 Received [DONE] marker');
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;

              if (delta?.content) {
                fullContent += delta.content;
                logger.debug('📝 Content delta received', {
                  deltaLength: delta.content.length,
                  totalLength: fullContent.length,
                  delta: delta.content.substring(0, 50),
                });

                if (onChunk) {
                  logger.debug('📤 Sending content chunk to callback');
                  onChunk({
                    id: `chunk_${Date.now()}`,
                    type: 'content',
                    content: delta.content,
                    timestamp: Date.now(),
                  });
                }
              }

              if (delta?.tool_calls) {
                // Handle streaming tool calls - accumulate arguments
                for (const toolCall of delta.tool_calls) {
                  // Use index as the primary identifier for streaming tool calls
                  const toolCallIndex = toolCall.index !== undefined ? toolCall.index : 0;
                  const toolCallKey = `tool_${toolCallIndex}`;

                  // Get or create streaming tool call using index as key
                  let streamingCall = streamingToolCalls.get(toolCallKey);
                  if (!streamingCall) {
                    streamingCall = {
                      id: toolCall.id || `call_${toolCallIndex}`,
                      name: '',
                      arguments: '',
                    };
                    streamingToolCalls.set(toolCallKey, streamingCall);
                    console.log('🆕 Created new streaming tool call', {
                      toolCallIndex,
                      toolCallKey,
                      toolCallId: toolCall.id,
                      initialName: toolCall.function?.name,
                      hasInitialName: !!toolCall.function?.name,
                    });
                    logger.info('🆕 Created new streaming tool call', {
                      toolCallIndex,
                      toolCallKey,
                      toolCallId: toolCall.id,
                      initialName: toolCall.function?.name,
                    });
                  }

                  // Accumulate function name and arguments
                  if (toolCall.function?.name && !streamingCall.name) {
                    streamingCall.name = toolCall.function.name;
                    console.log('📝 Set tool call name', {
                      toolCallKey,
                      name: streamingCall.name,
                      hadPreviousName: !!streamingCall.name,
                    });
                    logger.info('📝 Set tool call name', {
                      toolCallKey,
                      name: streamingCall.name,
                    });
                  } else if (toolCall.function?.name) {
                    console.log('⚠️ Tool call name already set', {
                      toolCallKey,
                      existingName: streamingCall.name,
                      newName: toolCall.function.name,
                    });
                  }
                  if (toolCall.function?.arguments) {
                    streamingCall.arguments += toolCall.function.arguments;
                    logger.debug('📝 Tool call delta received', {
                      toolCallKey,
                      name: streamingCall.name,
                      argumentsLength: streamingCall.arguments.length,
                      delta: toolCall.function.arguments.substring(0, 50),
                      totalArguments: streamingCall.arguments.substring(0, 100),
                    });
                  }

                  // Update ID if we get a real one
                  if (toolCall.id && toolCall.id !== streamingCall.id) {
                    const oldId = streamingCall.id;
                    streamingCall.id = toolCall.id;
                    logger.info('🔄 Updated tool call ID', {
                      toolCallKey,
                      oldId,
                      newId: toolCall.id,
                    });
                  }
                }
              }
            } catch (parseError) {
              logger.warn('Failed to parse streaming chunk', parseError);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      logger.info('📖 Streaming reader released', {
        streamingToolCallsSize: streamingToolCalls.size,
        streamingToolCallsKeys: Array.from(streamingToolCalls.keys()),
      });
    }

    // Process accumulated tool calls
    console.log('🔧 Processing accumulated tool calls', {
      streamingToolCallsCount: streamingToolCalls.size,
      streamingToolCallsKeys: Array.from(streamingToolCalls.keys()),
    });
    logger.info('🔧 Processing accumulated tool calls', {
      streamingToolCallsCount: streamingToolCalls.size,
      streamingToolCallsKeys: Array.from(streamingToolCalls.keys()),
    });

    for (const [toolCallKey, streamingCall] of streamingToolCalls) {
      logger.info('🔍 Processing streaming tool call', {
        toolCallKey,
        name: streamingCall.name,
        hasName: !!streamingCall.name,
        argumentsLength: streamingCall.arguments.length,
        arguments: streamingCall.arguments,
      });

      if (streamingCall.name && streamingCall.arguments) {
        try {
          const parsedArguments = JSON.parse(streamingCall.arguments);
          const functionCall: FunctionCall = {
            name: streamingCall.name,
            arguments: parsedArguments,
            id: streamingCall.id,
          };
          functionCalls.push(functionCall);

          console.log('✅ Completed tool call from streaming', {
            name: functionCall.name,
            id: functionCall.id,
            arguments: parsedArguments,
            functionCallsLength: functionCalls.length,
          });
          logger.info('✅ Completed tool call from streaming', {
            name: functionCall.name,
            id: functionCall.id,
            arguments: parsedArguments,
            functionCallsLength: functionCalls.length,
          });

          if (onChunk) {
            onChunk({
              id: `tool_complete_${Date.now()}`,
              type: 'function_call',
              functionCall,
              timestamp: Date.now(),
            });
          }
        } catch (parseError) {
          logger.warn('❌ Failed to parse accumulated tool call arguments', {
            toolCallKey,
            name: streamingCall.name,
            arguments: streamingCall.arguments,
            error: parseError,
          });
        }
      } else {
        logger.warn('⚠️ Incomplete tool call data', {
          toolCallKey,
          name: streamingCall.name,
          hasName: !!streamingCall.name,
          argumentsLength: streamingCall.arguments.length,
          arguments: streamingCall.arguments.substring(0, 100),
        });
      }
    }

    // Send completion chunk
    if (onChunk) {
      onChunk({
        id: `done_${Date.now()}`,
        type: 'done',
        done: true,
        timestamp: Date.now(),
      });
    }

    const streamingResult = {
      response: fullContent,
      actions: [],
      confidence: 0.8,
      thinking: 'Generated via real OpenAI streaming',
      functionCalls,
    };

    console.log('🎯 OpenAI streaming response completed', {
      hasContent: !!fullContent,
      contentLength: fullContent.length,
      hasFunctionCalls: !!functionCalls && functionCalls.length > 0,
      functionCallsCount: functionCalls.length,
      functionCallNames: functionCalls.map(fc => fc.name),
      responseKeys: Object.keys(streamingResult),
      fullResponse: JSON.stringify(streamingResult, null, 2),
    });
    logger.info('🎯 OpenAI streaming response completed', {
      hasContent: !!fullContent,
      contentLength: fullContent.length,
      hasFunctionCalls: !!functionCalls && functionCalls.length > 0,
      functionCallsCount: functionCalls.length,
      functionCallNames: functionCalls.map(fc => fc.name),
      responseKeys: Object.keys(streamingResult),
      fullResponse: JSON.stringify(streamingResult, null, 2),
    });

    return streamingResult;
  }

  /**
   * Placeholder for Anthropic streaming (to be implemented)
   */
  private async generateAnthropicStreamingResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent,
    tools?: FunctionSchema[],
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<LLMResponse> {
    logger.warn('Anthropic streaming not yet implemented, falling back to simulated streaming');
    return await this.generateSimulatedStreamingResponse(messages, context, intent, tools, onChunk);
  }

  /**
   * Placeholder for Gemini streaming (to be implemented)
   */
  private async generateGeminiStreamingResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent,
    tools?: FunctionSchema[],
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<LLMResponse> {
    logger.warn('Gemini streaming not yet implemented, falling back to simulated streaming');
    return await this.generateSimulatedStreamingResponse(messages, context, intent, tools, onChunk);
  }

  /**
   * Placeholder for Groq streaming (to be implemented)
   */
  private async generateGroqStreamingResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent,
    tools?: FunctionSchema[],
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<LLMResponse> {
    logger.warn('Groq streaming not yet implemented, falling back to simulated streaming');
    return await this.generateSimulatedStreamingResponse(messages, context, intent, tools, onChunk);
  }
}

// Adapter class to convert LangChain models to our BaseChatModel interface
class LangChainAdapter implements IBaseChatModel {
  private model: any;
  private _modelName: string;
  private provider: string;
  private _temperature: number;

  constructor(model: any, modelName: string, provider: string) {
    this.model = model;
    this._modelName = modelName;
    this.provider = provider;
    this._temperature = (model.temperature as number) || 0.7;
  }

  get modelName(): string {
    return this._modelName;
  }

  get temperature(): number {
    return this._temperature;
  }

  async invoke(messages: any[]): Promise<any> {
    try {
      // Import LangChain message classes at runtime to avoid bundling issues
      const {
        HumanMessage: LCHumanMessage,
        AIMessage: LCAIMessage,
        SystemMessage: LCSystemMessage,
        ToolMessage: LCToolMessage,
      } = await import('@langchain/core/messages');

      // Convert our message format (including tool messages) to LangChain messages
      const lcMessages = messages.map((msg) => {
        if (msg.type === 'human' || msg.type === 'user') {
          return new LCHumanMessage({ content: msg.content });
        }
        if (msg.type === 'ai' || msg.type === 'assistant') {
          const additional_kwargs = msg.additional_kwargs || {};
          return new LCAIMessage({ content: msg.content, additional_kwargs });
        }
        if (msg.type === 'system') {
          return new LCSystemMessage({ content: msg.content });
        }
        if (msg.type === 'tool') {
          const tool_call_id = msg.additional_kwargs?.tool_call_id;
          const name = msg.name || 'tool';
          return new LCToolMessage({
            content: msg.content,
            tool_call_id,
            name,
          });
        }
        return new LCSystemMessage({ content: msg.content });
      });

      // Pass tools via model.bind if available, otherwise via invoke options
      const pendingTools = (this.model as any)._pending_tools;
      let output: any;
      if (pendingTools && typeof (this.model as any).bind === 'function') {
        const bound = (this.model as any).bind({
          tools: pendingTools,
          tool_choice: 'auto',
        });
        output = await bound.invoke(lcMessages);
      } else {
        const options = pendingTools
          ? { tools: pendingTools, tool_choice: 'auto' }
          : undefined;
        output = await this.model.invoke(lcMessages, options);
      }

      // Normalize output to a common shape with content and tool_calls
      // Normalize content and tool_calls
      let tool_calls = output?.additional_kwargs?.tool_calls || [];
      const content =
        typeof output?.content === 'string'
          ? output.content
          : Array.isArray(output?.content)
          ? output.content
              .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
              .join('\n')
          : output?.content ?? '';

      // Some providers place tool calls at top-level fields
      if (
        (!tool_calls || tool_calls.length === 0) &&
        Array.isArray(output?.tool_calls)
      ) {
        tool_calls = output.tool_calls;
      }
      return { content, tool_calls, role: 'assistant' };
    } catch (error) {
      logger.error('LangChainAdapter invoke failed:', error);
      throw error;
    }
  }

  async _generate(messages: any[], options?: any): Promise<any> {
    const result = await this.invoke(messages);
    return {
      generations: [
        {
          text: result.content,
          message: result,
        },
      ],
    };
  }

  _llmType(): string {
    return `langchain-${this.provider}`;
  }
}

// Export the Web3LLM, RealChatModel, and LangChainAdapter classes for external use
export { Web3LLM, RealChatModel, LangChainAdapter };

export async function createLLMInstance(
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  options?: {
    enableMultiAgent?: boolean;
    context?: Web3Context;
  }
): Promise<IWeb3LLM> {
  const { type: providerType, apiKey, baseUrl } = providerConfig;
  const { modelName, parameters = {} } = modelConfig;

  logger.info(
    `Creating LLM instance for provider ${providerType}, model ${modelName}`
  );

  try {
    // Create base model instance
    let baseModel;

    switch (providerType) {
      case ProviderTypeEnum.OpenAI:
        baseModel = await createOpenAIModel(apiKey, modelName, parameters);
        break;

      case ProviderTypeEnum.Anthropic:
        baseModel = await createAnthropicModel(apiKey, modelName, parameters);
        break;

      case ProviderTypeEnum.DeepSeek:
        baseModel = createDeepSeekModel(apiKey, modelName, parameters, baseUrl);
        break;

      case ProviderTypeEnum.Gemini:
        baseModel = await createGeminiModel(apiKey, modelName, parameters);
        break;

      case ProviderTypeEnum.Grok:
        baseModel = createGrokModel(apiKey, modelName, parameters);
        break;

      case ProviderTypeEnum.Ollama:
        baseModel = await createOllamaModel(modelName, parameters, baseUrl);
        break;

      case ProviderTypeEnum.AzureOpenAI:
        baseModel = await createAzureOpenAIModel(
          apiKey,
          modelName,
          parameters,
          baseUrl
        );
        break;

      case ProviderTypeEnum.OpenRouter:
        baseModel = await createOpenRouterModel(
          apiKey,
          modelName,
          parameters,
          baseUrl
        );
        break;

      case ProviderTypeEnum.Groq:
        baseModel = createGroqModel(apiKey, modelName, parameters);
        break;

      case ProviderTypeEnum.Cerebras:
        baseModel = createCerebrasModel(apiKey, modelName, parameters);
        break;

      case ProviderTypeEnum.Llama:
        baseModel = createLlamaModel(apiKey, modelName, parameters, baseUrl);
        break;

      case ProviderTypeEnum.CustomOpenAI:
        baseModel = await createCustomOpenAIModel(
          apiKey,
          modelName,
          parameters,
          baseUrl
        );
        break;

      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }

    // Wrap with Web3LLM for Web3-specific functionality
    const web3LLM = new Web3LLM(baseModel, providerType, modelName, {
      enableMultiAgent: options?.enableMultiAgent,
      context: options?.context,
      providerConfig: providerConfig // Pass provider config for API key access
    });
    logger.info(`Created Web3LLM instance for ${providerType}/${modelName}`, {
      multiAgentEnabled: options?.enableMultiAgent
    });

    return web3LLM;
  } catch (error) {
    logger.error(`Failed to create LLM instance for ${providerType}:`, error);
    throw error;
  }
}

async function createOpenAIModel(
  apiKey: string,
  modelName: string,
  parameters: Record<string, unknown>
): Promise<IBaseChatModel> {
  try {
    const { ChatOpenAI } = await import('@langchain/openai');

    // Ensure we have a valid API key
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('OpenAI API key is required');
    }

    const openAIModel = new ChatOpenAI({
      apiKey: apiKey, // Use 'apiKey' instead of 'openAIApiKey' for newer LangChain versions
      modelName,
      ...parameters,
      configuration: {
        ...parameters,
      },
    });

    // Adapt LangChain model to our interface
    return new LangChainAdapter(openAIModel, modelName, 'openai');
  } catch (error) {
    logger.warn('Failed to load LangChain OpenAI, using direct API:', error);
    return new RealChatModel(
      modelName,
      'openai',
      { apiKey } as ProviderConfig,
      parameters
    );
  }
}

async function createAnthropicModel(
  apiKey: string,
  modelName: string,
  parameters: Record<string, unknown>
): Promise<IBaseChatModel> {
  try {
    const { ChatAnthropic } = await import('@langchain/anthropic');

    // Ensure we have a valid API key
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Anthropic API key is required');
    }

    const anthropicModel = new ChatAnthropic({
      apiKey: apiKey, // Use 'apiKey' instead of 'anthropicApiKey' for newer LangChain versions
      modelName,
      ...parameters,
    });

    // Adapt LangChain model to our interface
    return new LangChainAdapter(anthropicModel, modelName, 'anthropic');
  } catch (error) {
    logger.warn('Failed to load LangChain Anthropic, using direct API:', error);
    return new RealChatModel(
      modelName,
      'anthropic',
      { apiKey } as ProviderConfig,
      parameters
    );
  }
}

function createDeepSeekModel(
  apiKey: string,
  modelName: string,
  parameters: Record<string, unknown>,
  baseUrl?: string
): IBaseChatModel {
  // Use RealChatModel with DeepSeek API
  return new RealChatModel(
    modelName,
    'deepseek',
    { apiKey, baseUrl } as ProviderConfig,
    parameters
  );
}

async function createGeminiModel(
  apiKey: string,
  modelName: string,
  parameters: Record<string, unknown>
): Promise<IBaseChatModel> {
  try {
    const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');

    // Ensure we have a valid API key
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Gemini API key is required');
    }

    const geminiModel = new ChatGoogleGenerativeAI({
      apiKey: apiKey,
      model: modelName, // Gemini uses 'model' instead of 'modelName'
      ...parameters,
    });

    // Adapt LangChain model to our interface
    return new LangChainAdapter(geminiModel, modelName, 'gemini');
  } catch (error) {
    logger.warn('Failed to load LangChain Gemini, using direct API:', error);
    return new RealChatModel(
      modelName,
      'gemini',
      { apiKey } as ProviderConfig,
      parameters
    );
  }
}

function createGrokModel(
  apiKey: string,
  modelName: string,
  parameters: Record<string, unknown>
): IBaseChatModel {
  // Use RealChatModel with Grok API
  return new RealChatModel(
    modelName,
    'grok',
    { apiKey } as ProviderConfig,
    parameters
  );
}

async function createOllamaModel(
  modelName: string,
  parameters: Record<string, unknown>,
  baseUrl?: string
): Promise<IBaseChatModel> {
  // Use RealChatModel with Ollama API
  logger.info('Using direct Ollama API integration');
  return new RealChatModel(
    modelName,
    'ollama',
    { baseUrl } as ProviderConfig,
    parameters
  );
}

async function createAzureOpenAIModel(
  apiKey: string,
  modelName: string,
  parameters: Record<string, unknown>,
  baseUrl?: string
): Promise<IBaseChatModel> {
  try {
    // Extract Azure-specific config from parameters
    const azureDeploymentNames = (parameters as any).azureDeploymentNames;
    const azureApiVersion = (parameters as any).azureApiVersion;

    // Ensure we have valid Azure configuration
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Azure OpenAI API key is required');
    }
    if (!baseUrl || baseUrl.trim() === '') {
      throw new Error('Azure OpenAI endpoint is required');
    }
    if (!azureDeploymentNames || azureDeploymentNames.length === 0) {
      throw new Error('Azure OpenAI deployment name is required');
    }

    const { AzureChatOpenAI } = await import('@langchain/openai');
    const azureModel = new AzureChatOpenAI({
      azureOpenAIApiKey: apiKey,
      azureOpenAIApiDeploymentName: azureDeploymentNames?.[0],
      azureOpenAIApiVersion: azureApiVersion,
      azureOpenAIBasePath: baseUrl,
      ...parameters,
    });

    // Adapt LangChain model to our interface
    return new LangChainAdapter(azureModel, modelName, 'azure-openai');
  } catch (error) {
    logger.warn(
      'Failed to load LangChain Azure OpenAI, using direct API:',
      error
    );
    const azureDeploymentNames = (parameters as any).azureDeploymentNames;
    const azureApiVersion = (parameters as any).azureApiVersion;

    return new RealChatModel(
      modelName,
      'azure-openai',
      {
        apiKey,
        baseUrl,
        azureDeploymentNames,
        azureApiVersion,
      } as ProviderConfig,
      parameters
    );
  }
}

async function createOpenRouterModel(
  apiKey: string,
  modelName: string,
  parameters: Record<string, unknown>,
  baseUrl?: string
): Promise<IBaseChatModel> {
  try {
    const { ChatOpenAI } = await import('@langchain/openai');

    // Ensure we have a valid API key
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('OpenRouter API key is required');
    }

    const openRouterModel = new ChatOpenAI({
      apiKey: apiKey, // Use 'apiKey' instead of 'openAIApiKey' for newer LangChain versions
      modelName,
      configuration: {
        baseURL: baseUrl || 'https://openrouter.ai/api/v1',
        ...parameters,
      },
    });

    // Adapt LangChain model to our interface
    return new LangChainAdapter(openRouterModel, modelName, 'openrouter');
  } catch (error) {
    logger.warn(
      'Failed to load LangChain OpenRouter, using direct API:',
      error
    );
    return new RealChatModel(
      modelName,
      'openrouter',
      { apiKey, baseUrl } as ProviderConfig,
      parameters
    );
  }
}

function createGroqModel(
  apiKey: string,
  modelName: string,
  parameters: Record<string, unknown>
): IBaseChatModel {
  // Use RealChatModel with Groq API
  return new RealChatModel(
    modelName,
    'groq',
    { apiKey } as ProviderConfig,
    parameters
  );
}

function createCerebrasModel(
  apiKey: string,
  modelName: string,
  parameters: Record<string, unknown>
): IBaseChatModel {
  // Use RealChatModel with Cerebras API
  return new RealChatModel(
    modelName,
    'cerebras',
    { apiKey } as ProviderConfig,
    parameters
  );
}

function createLlamaModel(
  apiKey: string,
  modelName: string,
  parameters: Record<string, unknown>,
  baseUrl?: string
): IBaseChatModel {
  // Use RealChatModel with Llama API
  return new RealChatModel(
    modelName,
    'llama',
    { apiKey, baseUrl } as ProviderConfig,
    parameters
  );
}

async function createCustomOpenAIModel(
  apiKey: string,
  modelName: string,
  parameters: Record<string, unknown>,
  baseUrl?: string
): Promise<IBaseChatModel> {
  try {
    const { ChatOpenAI } = await import('@langchain/openai');

    // Ensure we have a valid API key
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Custom OpenAI API key is required');
    }

    const customModel = new ChatOpenAI({
      apiKey: apiKey, // Use 'apiKey' instead of 'openAIApiKey' for newer LangChain versions
      modelName,
      configuration: {
        baseURL: baseUrl,
        ...parameters,
      },
    });

    // Adapt LangChain model to our interface
    return new LangChainAdapter(customModel, modelName, 'custom_openai');
  } catch (error) {
    logger.warn(
      'Failed to load LangChain Custom OpenAI, using direct API:',
      error
    );
    return new RealChatModel(
      modelName,
      'custom_openai',
      { apiKey, baseUrl } as ProviderConfig,
      parameters
    );
  }
}
