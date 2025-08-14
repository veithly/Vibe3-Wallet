import { createStorage } from './storage';
import type { AgentNameEnum, ProviderTypeEnum } from './types';
import { llmProviderModelNames, llmProviderParameters } from './types';

// Built-in provider configurations as per specification
export const BUILTIN_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    type: 'openai' as ProviderTypeEnum,
    baseUrl: 'https://api.openai.com/v1',
    modelNames: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
    apiKey: '',
    validated: false,
    createdAt: Date.now(),
  },
  anthropic: {
    name: 'Anthropic',
    type: 'anthropic' as ProviderTypeEnum,
    modelNames: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
    apiKey: '',
    validated: false,
    createdAt: Date.now(),
  },
  gemini: {
    name: 'Gemini',
    type: 'gemini' as ProviderTypeEnum,
    modelNames: ['gemini-1.5-pro', 'gemini-1.5-flash'],
    apiKey: '',
    validated: false,
    createdAt: Date.now(),
  },
  openrouter: {
    name: 'OpenRouter',
    type: 'openrouter' as ProviderTypeEnum,
    baseUrl: 'https://openrouter.ai/api/v1',
    modelNames: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
    apiKey: '',
    validated: false,
    createdAt: Date.now(),
  },
};

// Interface for a single provider configuration
export interface ProviderConfig {
  name?: string; // Display name in the options
  type?: ProviderTypeEnum; // Help to decide which LangChain ChatModel package to use
  apiKey: string; // Must be provided, but may be empty for local models
  baseUrl?: string; // Optional base URL if provided // For Azure: Endpoint
  modelNames?: string[]; // Chosen model names (NOT used for Azure OpenAI)
  createdAt?: number; // Timestamp in milliseconds when the provider was created
  // Azure Specific Fields:
  azureDeploymentNames?: string[]; // Azure deployment names array
  azureApiVersion?: string;
  // Validation fields
  validated?: boolean;
  lastValidated?: number;
  validationError?: string;
}

// Interface for storing multiple LLM provider configurations
// The key is the provider id, which is the same as the provider type for built-in providers, but is custom for custom providers
export interface LLMKeyRecord {
  providers: Record<string, ProviderConfig>;
}

export interface ProviderValidationResult {
  isValid: boolean;
  responseTime?: number;
  error?: string;
  modelList?: string[];
  timestamp: number;
}

export type LLMProviderStorage = {
  setProvider: (providerId: string, config: ProviderConfig) => Promise<void>;
  getProvider: (providerId: string) => Promise<ProviderConfig | undefined>;
  removeProvider: (providerId: string) => Promise<void>;
  hasProvider: (providerId: string) => Promise<boolean>;
  getAllProviders: () => Promise<Record<string, ProviderConfig>>;
  validateProvider: (providerId: string) => Promise<ProviderValidationResult>;
  getBuiltInProviders: () => Record<string, ProviderConfig>;
  resetProvider: (providerId: string) => Promise<void>;
  testProviderConnectivity: (
    config: ProviderConfig
  ) => Promise<ProviderValidationResult>;
  testOpenAIProvider: (
    config: ProviderConfig
  ) => Promise<ProviderValidationResult>;
  testAnthropicProvider: (
    config: ProviderConfig
  ) => Promise<ProviderValidationResult>;
  testGeminiProvider: (
    config: ProviderConfig
  ) => Promise<ProviderValidationResult>;
  testOpenRouterProvider: (
    config: ProviderConfig
  ) => Promise<ProviderValidationResult>;
  testOllamaProvider: (
    config: ProviderConfig
  ) => Promise<ProviderValidationResult>;
};

// Storage for LLM provider configurations
// use "llm-api-keys" as the key for the storage, for backward compatibility
const storage = createStorage<LLMKeyRecord>(
  'llm-api-keys',
  { providers: {} },
  {
    isPersistant: true,
  }
);

// Helper function to determine provider type from provider name
// Make sure to update this function if you add a new provider type
export function getProviderTypeByProviderId(
  providerId: string
): ProviderTypeEnum {
  // Check if this is an Azure provider (either the main one or one with a custom ID)
  if (providerId === 'azure_openai') {
    return 'azure_openai' as ProviderTypeEnum;
  }

  // Handle custom Azure providers with IDs like azure_openai_2
  if (
    typeof providerId === 'string' &&
    providerId.startsWith(`${'azure_openai'}_`)
  ) {
    return 'azure_openai' as ProviderTypeEnum;
  }

  // Handle standard provider types
  switch (providerId) {
    case 'openai':
    case 'anthropic':
    case 'deepseek':
    case 'gemini':
    case 'grok':
    case 'ollama':
    case 'openrouter':
    case 'groq':
    case 'cerebras':
      return providerId as ProviderTypeEnum;
    default:
      return 'custom_openai' as ProviderTypeEnum;
  }
}

// Helper function to get display name from provider id
// Make sure to update this function if you add a new provider type
export function getDefaultDisplayNameFromProviderId(
  providerId: string
): string {
  switch (providerId) {
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic';
    case 'deepseek':
      return 'DeepSeek';
    case 'gemini':
      return 'Gemini';
    case 'grok':
      return 'Grok';
    case 'ollama':
      return 'Ollama';
    case 'azure_openai':
      return 'Azure OpenAI';
    case 'openrouter':
      return 'OpenRouter';
    case 'groq':
      return 'Groq';
    case 'cerebras':
      return 'Cerebras';
    case 'llama':
      return 'Llama';
    default:
      return providerId; // Use the provider id as display name for custom providers by default
  }
}

// Get default configuration for built-in providers
export function getDefaultProviderConfig(providerId: string): ProviderConfig {
  switch (providerId) {
    case 'openai':
    case 'anthropic':
    case 'deepseek':
    case 'gemini':
    case 'grok':
    case 'openrouter': // OpenRouter uses modelNames
    case 'groq': // Groq uses modelNames
    case 'cerebras': // Cerebras uses modelNames
    case 'llama': // Llama uses modelNames
      return {
        apiKey: '',
        name: getDefaultDisplayNameFromProviderId(providerId),
        type: providerId as ProviderTypeEnum,
        baseUrl:
          providerId === 'openrouter'
            ? 'https://openrouter.ai/api/v1'
            : providerId === 'llama'
            ? 'https://api.llama.com/v1'
            : undefined,
        modelNames: [...(llmProviderModelNames[providerId] || [])],
        createdAt: Date.now(),
      };

    case 'ollama':
      return {
        apiKey: 'ollama', // Set default API key for Ollama
        name: getDefaultDisplayNameFromProviderId('ollama'),
        type: 'ollama' as ProviderTypeEnum,
        modelNames: llmProviderModelNames[providerId],
        baseUrl: 'http://localhost:11434',
        createdAt: Date.now(),
      };
    case 'azure_openai':
      return {
        apiKey: '', // User needs to provide API Key
        name: getDefaultDisplayNameFromProviderId('azure_openai'),
        type: 'azure_openai' as ProviderTypeEnum,
        baseUrl: '', // User needs to provide Azure endpoint
        // modelNames: [], // Not used for Azure configuration
        azureDeploymentNames: [], // Azure deployment names
        azureApiVersion: '2024-02-15-preview', // Provide a common default API version
        createdAt: Date.now(),
      };
    default:
      // Handles CustomOpenAI
      return {
        apiKey: '',
        name: getDefaultDisplayNameFromProviderId(providerId),
        type: 'custom_openai' as ProviderTypeEnum,
        baseUrl: '',
        modelNames: [], // Custom providers use modelNames
        createdAt: Date.now(),
      };
  }
}

export function getDefaultAgentModelParams(
  providerId: string,
  agentName: AgentNameEnum
): Record<string, number> {
  const newParameters = llmProviderParameters[
    providerId as keyof typeof llmProviderParameters
  ]?.[agentName] || {
    temperature: 0.1,
    topP: 0.1,
  };
  return newParameters;
}

// Helper function to ensure backward compatibility for provider configs
function ensureBackwardCompatibility(
  providerId: string,
  config: ProviderConfig
): ProviderConfig {
  // Log input config
  // console.log(`[ensureBackwardCompatibility] Input for ${providerId}:`, JSON.stringify(config));

  const updatedConfig = { ...config };

  // Ensure name exists
  if (!updatedConfig.name) {
    updatedConfig.name = getDefaultDisplayNameFromProviderId(providerId);
  }
  // Ensure type exists
  if (!updatedConfig.type) {
    updatedConfig.type = getProviderTypeByProviderId(providerId);
  }

  // Handle Azure specifics
  if (updatedConfig.type === 'azure_openai') {
    // Ensure Azure fields exist, provide defaults if missing
    if (updatedConfig.azureApiVersion === undefined) {
      // console.log(`[ensureBackwardCompatibility] Adding default azureApiVersion for ${providerId}`);
      updatedConfig.azureApiVersion = '2024-02-15-preview';
    }

    // Initialize azureDeploymentNames array if it doesn't exist yet
    if (!updatedConfig.azureDeploymentNames) {
      updatedConfig.azureDeploymentNames = [];
    }

    // CRITICAL: Delete modelNames if it exists for Azure type to clean up old configs
    if (Object.prototype.hasOwnProperty.call(updatedConfig, 'modelNames')) {
      // console.log(`[ensureBackwardCompatibility] Deleting modelNames for Azure config ${providerId}`);
      delete updatedConfig.modelNames;
    }
  } else {
    // Ensure modelNames exists ONLY for non-Azure types
    if (!updatedConfig.modelNames) {
      // console.log(`[ensureBackwardCompatibility] Adding default modelNames for non-Azure ${providerId}`);
      updatedConfig.modelNames =
        llmProviderModelNames[
          providerId as keyof typeof llmProviderModelNames
        ] || [];
    }
  }

  // Ensure createdAt exists
  if (!updatedConfig.createdAt) {
    updatedConfig.createdAt = new Date('03/04/2025').getTime();
  }

  // Log output config
  // console.log(`[ensureBackwardCompatibility] Output for ${providerId}:`, JSON.stringify(updatedConfig));
  return updatedConfig;
}

export const llmProviderStore: LLMProviderStorage = {
  async setProvider(providerId: string, config: ProviderConfig) {
    if (!providerId) {
      throw new Error('Provider id cannot be empty');
    }

    if (config.apiKey === undefined) {
      throw new Error(
        'API key must be provided (can be empty for local models)'
      );
    }

    const providerType = config.type || getProviderTypeByProviderId(providerId);

    if (providerType === 'azure_openai') {
      if (!config.baseUrl?.trim()) {
        throw new Error('Azure Endpoint (baseUrl) is required');
      }
      if (
        !config.azureDeploymentNames ||
        config.azureDeploymentNames.length === 0
      ) {
        throw new Error('At least one Azure Deployment Name is required');
      }
      if (!config.azureApiVersion?.trim()) {
        throw new Error('Azure API Version is required');
      }
      if (!config.apiKey?.trim()) {
        throw new Error('API Key is required for Azure OpenAI');
      }
    } else if (providerType !== 'custom_openai' && providerType !== 'ollama') {
      if (!config.apiKey?.trim()) {
        throw new Error(
          `API Key is required for ${getDefaultDisplayNameFromProviderId(
            providerId
          )}`
        );
      }
    }

    if (providerType !== 'azure_openai') {
      if (!config.modelNames || config.modelNames.length === 0) {
        console.warn(
          `Provider ${providerId} of type ${providerType} is being saved without model names.`
        );
      }
    }

    const completeConfig: ProviderConfig = {
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl,
      name: config.name || getDefaultDisplayNameFromProviderId(providerId),
      type: providerType,
      createdAt: config.createdAt || Date.now(),
      ...(providerType === 'azure_openai'
        ? {
            azureDeploymentNames: config.azureDeploymentNames || [],
            azureApiVersion: config.azureApiVersion,
          }
        : {
            modelNames: config.modelNames || [],
          }),
    };

    console.log(
      `[llmProviderStore.setProvider] Saving config for ${providerId}:`,
      JSON.stringify(completeConfig)
    );

    const current = (await storage.get()) || { providers: {} };
    await storage.set({
      providers: {
        ...current.providers,
        [providerId]: completeConfig,
      },
    });
  },
  async getProvider(providerId: string) {
    const data = (await storage.get()) || { providers: {} };
    const config = data.providers[providerId];
    return config ? ensureBackwardCompatibility(providerId, config) : undefined;
  },
  async removeProvider(providerId: string) {
    const current = (await storage.get()) || { providers: {} };
    const newProviders = { ...current.providers };
    delete newProviders[providerId];
    await storage.set({ providers: newProviders });
  },
  async hasProvider(providerId: string) {
    const data = (await storage.get()) || { providers: {} };
    return providerId in data.providers;
  },

  async getAllProviders() {
    const data = await storage.get();
    const providers = { ...data.providers };

    // Add backward compatibility for all providers
    for (const [providerId, config] of Object.entries(providers)) {
      providers[providerId] = ensureBackwardCompatibility(providerId, config);
    }

    return providers;
  },

  async validateProvider(
    providerId: string
  ): Promise<ProviderValidationResult> {
    const startTime = Date.now();

    try {
      const config = await this.getProvider(providerId);
      if (!config) {
        return {
          isValid: false,
          error: 'Provider not found',
          timestamp: Date.now(),
        };
      }

      if (!config.apiKey?.trim() && config.type !== 'ollama') {
        return {
          isValid: false,
          error: 'API key is required',
          timestamp: Date.now(),
        };
      }

      // Simple connectivity test based on provider type
      const result = await this.testProviderConnectivity(config);
      const responseTime = Date.now() - startTime;

      if (result.isValid) {
        // Update validation status in storage
        await this.setProvider(providerId, {
          ...config,
          validated: true,
          lastValidated: Date.now(),
          validationError: undefined,
        });
      } else {
        await this.setProvider(providerId, {
          ...config,
          validated: false,
          lastValidated: Date.now(),
          validationError: result.error,
        });
      }

      return {
        ...result,
        responseTime,
        timestamp: Date.now(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        isValid: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  },

  async testProviderConnectivity(
    config: ProviderConfig
  ): Promise<ProviderValidationResult> {
    try {
      switch (config.type) {
        case 'openai':
        case 'custom_openai':
          return await this.testOpenAIProvider(config);
        case 'anthropic':
          return await this.testAnthropicProvider(config);
        case 'gemini':
          return await this.testGeminiProvider(config);
        case 'openrouter':
          return await this.testOpenRouterProvider(config);
        case 'ollama':
          return await this.testOllamaProvider(config);
        default:
          return {
            isValid: false,
            error: `Validation not implemented for provider type: ${config.type}`,
            timestamp: Date.now(),
          };
      }
    } catch (error) {
      return {
        isValid: false,
        error:
          error instanceof Error ? error.message : 'Connection test failed',
        timestamp: Date.now(),
      };
    }
  },

  async testOpenAIProvider(
    config: ProviderConfig
  ): Promise<ProviderValidationResult> {
    const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      return {
        isValid: true,
        modelList: data.data?.map((model: any) => model.id) || [],
        timestamp: Date.now(),
      };
    } else {
      const errorText = await response.text();
      return {
        isValid: false,
        error: `HTTP ${response.status}: ${errorText}`,
        timestamp: Date.now(),
      };
    }
  },

  async testAnthropicProvider(
    config: ProviderConfig
  ): Promise<ProviderValidationResult> {
    // Simple test - try to make a minimal completion request
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      }),
    });

    if (response.ok || response.status === 400) {
      // 400 might be expected for minimal request, but indicates auth works
      return {
        isValid: true,
        modelList: config.modelNames || [],
        timestamp: Date.now(),
      };
    } else {
      const errorText = await response.text();
      return {
        isValid: false,
        error: `HTTP ${response.status}: ${errorText}`,
        timestamp: Date.now(),
      };
    }
  },

  async testGeminiProvider(
    config: ProviderConfig
  ): Promise<ProviderValidationResult> {
    // Test Gemini API with a simple models list request
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${config.apiKey}`
    );

    if (response.ok) {
      const data = await response.json();
      return {
        isValid: true,
        modelList:
          data.models?.map((model: any) => model.name.replace('models/', '')) ||
          config.modelNames ||
          [],
        timestamp: Date.now(),
      };
    } else {
      const errorText = await response.text();
      return {
        isValid: false,
        error: `HTTP ${response.status}: ${errorText}`,
        timestamp: Date.now(),
      };
    }
  },

  async testOpenRouterProvider(
    config: ProviderConfig
  ): Promise<ProviderValidationResult> {
    const baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      return {
        isValid: true,
        modelList:
          data.data?.map((model: any) => model.id) || config.modelNames || [],
        timestamp: Date.now(),
      };
    } else {
      const errorText = await response.text();
      return {
        isValid: false,
        error: `HTTP ${response.status}: ${errorText}`,
        timestamp: Date.now(),
      };
    }
  },

  async testOllamaProvider(
    config: ProviderConfig
  ): Promise<ProviderValidationResult> {
    const baseUrl = config.baseUrl || 'http://localhost:11434';
    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
      });

      if (response.ok) {
        const data = await response.json();
        return {
          isValid: true,
          modelList: data.models?.map((model: any) => model.name) || [],
          timestamp: Date.now(),
        };
      } else {
        return {
          isValid: false,
          error: `Ollama server not responding: HTTP ${response.status}`,
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      return {
        isValid: false,
        error: 'Ollama server not accessible. Please ensure Ollama is running.',
        timestamp: Date.now(),
      };
    }
  },

  getBuiltInProviders(): Record<string, ProviderConfig> {
    return { ...BUILTIN_PROVIDERS };
  },

  async resetProvider(providerId: string): Promise<void> {
    const builtInConfig =
      BUILTIN_PROVIDERS[providerId as keyof typeof BUILTIN_PROVIDERS];
    if (builtInConfig) {
      await this.setProvider(providerId, {
        ...builtInConfig,
        createdAt: Date.now(),
      });
    } else {
      throw new Error(
        `Cannot reset provider ${providerId}: not a built-in provider`
      );
    }
  },
};
