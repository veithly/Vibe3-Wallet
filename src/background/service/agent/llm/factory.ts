import { createLogger } from '../../../../utils/logger';
import type { ProviderConfig, ModelConfig } from '../storage/index';
import { ProviderTypeEnum } from '../storage/types';
import { IWeb3LLM, LLMResponse, Web3Context, LLMAction } from './types';
import type { BaseChatModel as IBaseChatModel } from './messages';
import { BaseMessage, HumanMessage } from './messages';
import { Web3Intent } from '../intent/IntentRecognizer';

const logger = createLogger('LLMFactory');

// Mock LLM class for development
class MockChatModel implements IBaseChatModel {
  private _modelName: string;
  private provider: string;
  private parameters: Record<string, unknown>;
  private _temperature: number;

  constructor(
    modelName: string,
    provider: string,
    config: ProviderConfig,
    parameters: Record<string, unknown>
  ) {
    this._modelName = modelName;
    this.provider = provider;
    this.parameters = parameters;
    this._temperature = 0.7;

    logger.info(`Initialized mock ${provider} model: ${modelName}`, parameters);
  }

  get modelName(): string {
    return this._modelName;
  }

  get temperature(): number {
    return this._temperature;
  }

  async invoke(messages: any[]): Promise<any> {
    // Mock response based on the type of request
    const lastMessage = messages[messages.length - 1]?.content || '';

    logger.info(
      `Mock ${this.provider} model (${this.modelName}) invoked with ${messages.length} messages`
    );

    // Generate mock response based on model type
    if (this.provider === 'planner') {
      return {
        content: JSON.stringify({
          observation: 'Analyzing the current page state...',
          challenges: 'Need to identify the correct elements to interact with',
          done: false,
          next_steps: 'Locate and interact with the target element',
          reasoning:
            'Based on the task requirements, I need to find the specific element',
          web_task: true,
        }),
      };
    } else if (this.provider === 'navigator') {
      return {
        content: JSON.stringify({
          done: false,
          action: 'click',
          target: 'button.primary',
          value: '',
          reasoning: 'Clicking the primary button to proceed with the task',
        }),
      };
    } else if (this.provider === 'validator') {
      return {
        content: JSON.stringify({
          is_valid: true,
          reason: 'The task appears to have been completed successfully',
          answer: 'Task completed as requested',
        }),
      };
    }

    return {
      content: 'Mock response from ' + this.modelName,
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
    return 'mock-chat-model';
  }
}

// Web3LLM class that implements the IWeb3LLM interface
class Web3LLM implements IWeb3LLM {
  private model: IBaseChatModel;
  private providerType: string;
  private modelName: string;

  constructor(
    model: IBaseChatModel,
    providerType: string = 'enhanced',
    modelName: string = 'web3-llm'
  ) {
    this.model = model;
    this.providerType = providerType;
    this.modelName = modelName;

    logger.info(`Initialized Web3LLM with ${providerType}/${modelName}`);
  }

  async generateResponse(
    messages: BaseMessage[],
    context: Web3Context,
    intent?: Web3Intent
  ): Promise<LLMResponse> {
    logger.info('Generating Web3LLM response', {
      messageCount: messages.length,
      providerType: this.providerType,
      modelName: this.modelName,
      hasIntent: !!intent,
    });

    try {
      // Create enhanced prompt with Web3 context
      const prompt = this.createPrompt(messages, context, intent);

      // Generate response from LLM
      const llmResponse = await this.model.invoke([new HumanMessage(prompt)]);
      const responseText = llmResponse.content as string;

      // Extract actions from response
      const actions = this.extractActions(responseText);

      // Calculate confidence based on action extraction quality
      const confidence = this.calculateConfidence(actions, responseText);

      // Extract thinking process
      const thinking = this.extractThinking(responseText);

      logger.info('LLM response generated successfully', {
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

// Export the Web3LLM, MockChatModel, and LangChainAdapter classes for external use
export { Web3LLM, MockChatModel, LangChainAdapter };

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
    logger.warn(
      'Failed to load LangChain OpenAI, falling back to mock:',
      error
    );
    return new MockChatModel(
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
    logger.warn(
      'Failed to load LangChain Anthropic, falling back to mock:',
      error
    );
    return new MockChatModel(
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
  // In production: Custom implementation or ChatOpenAI with DeepSeek baseUrl
  return new MockChatModel(
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
    logger.warn(
      'Failed to load LangChain Gemini, falling back to mock:',
      error
    );
    return new MockChatModel(
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
  // In production: Custom implementation or ChatOpenAI with Grok baseUrl
  return new MockChatModel(
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
  // For now, use mock since @langchain/community is not available
  logger.warn('LangChain Ollama integration not available, using mock:');
  return new MockChatModel(
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
      'Failed to load LangChain Azure OpenAI, falling back to mock:',
      error
    );
    const azureDeploymentNames = (parameters as any).azureDeploymentNames;
    const azureApiVersion = (parameters as any).azureApiVersion;

    return new MockChatModel(
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
      'Failed to load LangChain OpenRouter, falling back to mock:',
      error
    );
    return new MockChatModel(
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
  // In production: return new ChatGroq({ apiKey, modelName, ...parameters });
  return new MockChatModel(
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
  // In production: Custom implementation or ChatOpenAI with Cerebras baseUrl
  return new MockChatModel(
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
  // In production: Custom implementation or ChatOpenAI with Llama baseUrl
  return new MockChatModel(
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
      'Failed to load LangChain Custom OpenAI, falling back to mock:',
      error
    );
    return new MockChatModel(
      modelName,
      'custom_openai',
      { apiKey, baseUrl } as ProviderConfig,
      parameters
    );
  }
}
