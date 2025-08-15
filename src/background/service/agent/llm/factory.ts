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
import { BaseMessage, HumanMessage } from './messages';
import { Web3Intent } from '../intent/IntentRecognizer';
import { toolRegistry } from '../tools/ToolRegistry';
import {
  StreamingHandler,
  createStreamingChunk,
} from '../streaming/StreamingHandler';

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
        `OpenAI API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || '',
      usage: data.usage,
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
}

// Enhanced Web3LLM class with function calling and streaming support
class Web3LLM implements IWeb3LLM {
  private model: IBaseChatModel;
  private providerType: string;
  private modelName: string;
  private _supportsFunctionCalling: boolean;
  private supportsStreaming: boolean;

  constructor(
    model: IBaseChatModel,
    providerType: string = 'enhanced',
    modelName: string = 'web3-llm'
  ) {
    this.model = model;
    this.providerType = providerType;
    this.modelName = modelName;
    this._supportsFunctionCalling = this.detectFunctionCallingSupport();
    this.supportsStreaming = this.detectStreamingSupport();

    logger.info(`Initialized Web3LLM with ${providerType}/${modelName}`, {
      functionCalling: this._supportsFunctionCalling,
      streaming: this.supportsStreaming,
    });
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
    });

    try {
      if (this._supportsFunctionCalling && tools && tools.length > 0) {
        return await this.generateFunctionCallingResponse(
          messages,
          context,
          tools,
          intent
        );
      } else {
        return await this.generateLegacyResponse(messages, context, intent);
      }
    } catch (error) {
      logger.error('Failed to generate LLM response:', error);

      // Return fallback response
      return {
        response: JSON.stringify({
          thinking: 'Error occurred while processing request',
          actions: [],
          confidence: 0.1,
          reply:
            'I apologize, but I encountered an error while processing your request. Please try again.',
        }),
        actions: [],
        confidence: 0.1,
        thinking: 'Error occurred',
      };
    }
  }

  async generateStreamingResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent,
    tools?: FunctionSchema[],
    onChunk?: (chunk: StreamingLLMResponse) => void
  ): Promise<LLMResponse> {
    if (!this.supportsStreaming) {
      // Fall back to non-streaming response
      const response = await this.generateResponse(
        messages,
        context,
        intent,
        tools
      );
      if (onChunk) {
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

  private async generateFunctionCallingResponse(
    messages: BaseMessage[],
    context: Web3Context,
    tools: FunctionSchema[],
    intent?: Web3Intent
  ): Promise<LLMResponse> {
    // Create enhanced prompt with function calling capabilities
    const prompt = this.createFunctionCallingPrompt(
      messages,
      context,
      tools,
      intent
    );

    // Generate response from LLM
    const llmResponse = await this.model.invoke([new HumanMessage(prompt)]);
    const responseText = llmResponse.content as string;

    // Parse function calls from response
    const functionCalls = this.parseFunctionCalls(responseText, tools);

    // Extract actions from function calls
    const actions = this.convertFunctionCallsToActions(functionCalls);

    // Extract thinking and response
    const thinking = this.extractThinking(responseText);
    const reply = this.extractReply(responseText);

    // Calculate confidence
    const confidence = this.calculateConfidence(actions, responseText);

    logger.info('Function calling response generated successfully', {
      responseLength: responseText.length,
      functionCallsCount: functionCalls.length,
      actionsCount: actions.length,
      confidence,
    });

    return {
      response: reply,
      actions,
      confidence,
      thinking,
      functionCalls,
    };
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
      thinking: 'Generated via streaming response',
      functionCalls: streamingResult.functionCalls,
    };
  }

  private createFunctionCallingPrompt(
    messages: BaseMessage[],
    context: Web3Context,
    tools: FunctionSchema[],
    intent?: Web3Intent
  ): string {
    const availableTools = tools || this.getAvailableTools();

    const systemPrompt = `You are Vibe3 AI, an intelligent Web3 assistant with advanced function calling capabilities.

Your capabilities include:
- Understanding complex Web3 instructions and breaking them down into function calls
- Using available tools to execute blockchain operations
- Providing clear explanations of operations, risks, and costs
- Maintaining security awareness and guiding users through safe practices

Key principles:
1. **Security First**: Always verify contract addresses, warn about high-risk operations
2. **Transparency**: Clearly explain fees, slippage, and estimated times
3. **Efficiency**: Use the most appropriate tools for each task
4. **User Control**: Never proceed without user confirmation for significant operations

Available Tools:
${this.formatToolsForPrompt(availableTools)}

When responding:
1. Use natural language to explain what you're doing
2. Call functions when you need to execute operations
3. Provide clear explanations of the results
4. Ask for confirmation when needed

Example response format:
{
  "thinking": "I need to check the user's ETH balance before proceeding with the swap",
  "actions": [
    {
      "type": "checkBalance",
      "params": {"address": "0x..."}
    }
  ],
  "confidence": 0.9,
  "reply": "Let me check your current ETH balance first..."
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
${userMessage}

Please respond with a JSON object containing your thinking process and any function calls you want to make.`;
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
- checkBalance: Query token balances
- sendTransaction: Send native tokens or call contracts
- approveToken: Grant spending allowance to contracts
- swapTokens: Exchange tokens via DEX aggregators
- bridgeTokens: Transfer tokens across blockchains
- stakeTokens: Deposit tokens in staking contracts
- unstakeTokens: Withdraw from staking contracts
- addLiquidity: Provide liquidity to AMM pools
- removeLiquidity: Withdraw liquidity from pools
- connectWallet: Connect wallet to dApps
- switchNetwork: Change blockchain networks
- getNFTs: Query NFT holdings
- getTransactionHistory: Get transaction history
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

=== AVAILABLE ACTIONS ===
- checkBalance: Query token balances
- sendTransaction: Send native tokens or call contracts
- approveToken: Grant spending allowance to contracts
- swapTokens: Exchange tokens via DEX aggregators
- bridgeTokens: Transfer tokens across blockchains
- stakeTokens: Deposit tokens in staking contracts
- connectWallet: Connect wallet to dApps
- switchNetwork: Change blockchain networks

=== USER INSTRUCTION ===
${userMessage}

Please respond with a JSON object containing:
{
  "thinking": "Your step-by-step reasoning process",
  "actions": [Array of actions to take],
  "confidence": 0.8,
  "reply": "Natural language response to user"
}`;
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

    // Look for patterns like "I'll call checkBalance with address 0x..."
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
      ['checkBalance', /check.*balance|balance.*check|查询.*余额|余额.*查询/i],
      ['sendTransaction', /send.*transaction|transfer.*funds|发送.*交易|转账/i],
      ['approveToken', /approve.*token|授权.*代币|grant.*allowance/i],
      ['swapTokens', /swap.*tokens|exchange.*tokens|兑换.*代币|交换.*代币/i],
      ['bridgeTokens', /bridge.*tokens|cross.*chain|跨链.*转账|桥接/i],
      ['stakeTokens', /stake.*tokens|deposit.*stake|质押.*代币|存入/i],
      ['unstakeTokens', /unstake.*tokens|withdraw.*stake|解除质押|提取/i],
      ['addLiquidity', /add.*liquidity|provide.*liquidity|添加.*流动性/i],
      [
        'removeLiquidity',
        /remove.*liquidity|withdraw.*liquidity|移除.*流动性/i,
      ],
      ['connectWallet', /connect.*wallet|连接.*钱包/i],
      ['switchNetwork', /switch.*network|change.*chain|切换.*网络/i],
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
      case 'checkBalance': {
        const addressMatch = text.match(/0x[a-fA-F0-9]{40}/);
        if (addressMatch) {
          params.address = addressMatch[0];
        }
        break;
      }

      case 'sendTransaction': {
        const recipientMatch = text.match(/to\s+(0x[a-fA-F0-9]{40})/i);
        const amountMatch = text.match(
          /(\d+(?:\.\d+)?)\s*(?:eth|matic|bnb|usdc|usdt)/i
        );
        if (recipientMatch) params.to = recipientMatch[1];
        if (amountMatch) params.value = amountMatch[1];
        break;
      }

      case 'swapTokens': {
        const fromTokenMatch = text.match(
          /(\d+(?:\.\d+)?)\s*([A-Za-z0-9]+)\s*(?:to|for)/i
        );
        const toTokenMatch = text.match(/(?:to|for)\s*([A-Za-z0-9]+)/i);
        if (fromTokenMatch) {
          params.amount = fromTokenMatch[1];
          params.fromToken = fromTokenMatch[2];
        }
        if (toTokenMatch) {
          params.toToken = toTokenMatch[1];
        }
        break;
      }
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
    // Detect if the underlying model supports function calling
    // This is a simplified detection - in production, you'd check model capabilities
    const functionCallingProviders = [
      'openai',
      'anthropic',
      'gemini',
      'azure-openai',
      'openrouter',
    ];

    return functionCallingProviders.includes(this.providerType.toLowerCase());
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

    return streamingProviders.includes(this.providerType.toLowerCase());
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
      // Convert our message format to LangChain format
      const langChainMessages = messages.map((msg) => ({
        content: msg.content,
        type:
          msg.type === 'human' ? 'human' : msg.type === 'ai' ? 'ai' : 'system',
      }));

      return await this.model.invoke(langChainMessages);
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
  modelConfig: ModelConfig
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
    const web3LLM = new Web3LLM(baseModel, providerType, modelName);
    logger.info(`Created Web3LLM instance for ${providerType}/${modelName}`);

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
