import {
  llmProviderStore,
  BUILTIN_PROVIDERS,
  getProviderTypeByProviderId,
  getDefaultDisplayNameFromProviderId,
  getDefaultProviderConfig,
} from '../llmProviders';
import type { ProviderConfig } from '../llmProviders';
import { ProviderTypeEnum } from '../types';

// Mock the storage module
const mockStorage = {
  get: jest.fn(),
  set: jest.fn(),
};

jest.mock('../storage', () => ({
  createStorage: jest.fn(() => mockStorage),
}));

// Mock fetch for API validation tests
global.fetch = jest.fn();

describe('LLM Provider Storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.get.mockResolvedValue({ providers: {} });
    mockStorage.set.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Built-in Providers', () => {
    it('contains all required built-in providers', () => {
      expect(BUILTIN_PROVIDERS.openai).toBeDefined();
      expect(BUILTIN_PROVIDERS.anthropic).toBeDefined();
      expect(BUILTIN_PROVIDERS.gemini).toBeDefined();
      expect(BUILTIN_PROVIDERS.openrouter).toBeDefined();
    });

    it('has correct structure for built-in providers', () => {
      const openaiProvider = BUILTIN_PROVIDERS.openai;

      expect(openaiProvider).toHaveProperty('name', 'OpenAI');
      expect(openaiProvider).toHaveProperty('type', 'openai');
      expect(openaiProvider).toHaveProperty(
        'baseUrl',
        'https://api.openai.com/v1'
      );
      expect(openaiProvider).toHaveProperty('modelNames');
      expect(openaiProvider).toHaveProperty('apiKey', '');
      expect(openaiProvider.modelNames).toContain('gpt-4o');
    });

    it('returns built-in providers via getBuiltInProviders', () => {
      const builtInProviders = llmProviderStore.getBuiltInProviders();

      expect(builtInProviders).toEqual(BUILTIN_PROVIDERS);
      expect(builtInProviders.openai.name).toBe('OpenAI');
      expect(builtInProviders.anthropic.name).toBe('Anthropic');
    });
  });

  describe('Provider Type Detection', () => {
    it('identifies standard provider types correctly', () => {
      expect(getProviderTypeByProviderId('openai')).toBe('openai');
      expect(getProviderTypeByProviderId('anthropic')).toBe('anthropic');
      expect(getProviderTypeByProviderId('gemini')).toBe('gemini');
      expect(getProviderTypeByProviderId('ollama')).toBe('ollama');
    });

    it('identifies Azure OpenAI providers', () => {
      expect(getProviderTypeByProviderId('azure_openai')).toBe('azure_openai');
      expect(getProviderTypeByProviderId('azure_openai_2')).toBe(
        'azure_openai'
      );
      expect(getProviderTypeByProviderId('azure_openai_custom')).toBe(
        'azure_openai'
      );
    });

    it('defaults to custom_openai for unknown providers', () => {
      expect(getProviderTypeByProviderId('custom_provider')).toBe(
        'custom_openai'
      );
      expect(getProviderTypeByProviderId('unknown')).toBe('custom_openai');
    });
  });

  describe('Display Name Generation', () => {
    it('returns correct display names for built-in providers', () => {
      expect(getDefaultDisplayNameFromProviderId('openai')).toBe('OpenAI');
      expect(getDefaultDisplayNameFromProviderId('anthropic')).toBe(
        'Anthropic'
      );
      expect(getDefaultDisplayNameFromProviderId('gemini')).toBe('Gemini');
      expect(getDefaultDisplayNameFromProviderId('azure_openai')).toBe(
        'Azure OpenAI'
      );
    });

    it('returns provider ID as display name for custom providers', () => {
      expect(getDefaultDisplayNameFromProviderId('custom_123')).toBe(
        'custom_123'
      );
    });
  });

  describe('Default Configuration Generation', () => {
    it('generates correct config for OpenAI', () => {
      const config = getDefaultProviderConfig('openai');

      expect(config.name).toBe('OpenAI');
      expect(config.type).toBe('openai');
      expect(config.apiKey).toBe('');
      expect(config.modelNames).toEqual(expect.arrayContaining(['gpt-4o']));
    });

    it('generates correct config for Ollama', () => {
      const config = getDefaultProviderConfig('ollama');

      expect(config.name).toBe('Ollama');
      expect(config.type).toBe('ollama');
      expect(config.apiKey).toBe('ollama');
      expect(config.baseUrl).toBe('http://localhost:11434');
    });

    it('generates correct config for Azure OpenAI', () => {
      const config = getDefaultProviderConfig('azure_openai');

      expect(config.name).toBe('Azure OpenAI');
      expect(config.type).toBe('azure_openai');
      expect(config.baseUrl).toBe('');
      expect(config.azureDeploymentNames).toEqual([]);
      expect(config.azureApiVersion).toBe('2024-02-15-preview');
      expect(config.modelNames).toBeUndefined();
    });

    it('generates correct config for custom providers', () => {
      const config = getDefaultProviderConfig('custom_provider');

      expect(config.name).toBe('custom_provider');
      expect(config.type).toBe('custom_openai');
      expect(config.baseUrl).toBe('');
      expect(config.modelNames).toEqual([]);
    });
  });

  describe('Provider Storage Operations', () => {
    const validOpenAIConfig: ProviderConfig = {
      name: 'Test OpenAI',
      type: ProviderTypeEnum.OpenAI,
      apiKey: 'test-key',
      modelNames: ['gpt-4o'],
    };

    const validAzureConfig: ProviderConfig = {
      name: 'Test Azure',
      type: ProviderTypeEnum.AzureOpenAI,
      apiKey: 'azure-key',
      baseUrl: 'https://test.openai.azure.com',
      azureDeploymentNames: ['gpt-4'],
      azureApiVersion: '2024-02-15-preview',
    };

    it('saves valid provider configuration', async () => {
      await llmProviderStore.setProvider('test-openai', validOpenAIConfig);

      expect(mockStorage.set).toHaveBeenCalledWith({
        providers: {
          'test-openai': expect.objectContaining({
            name: 'Test OpenAI',
            type: ProviderTypeEnum.OpenAI,
            apiKey: 'test-key',
            modelNames: ['gpt-4o'],
          }),
        },
      });
    });

    it('validates Azure provider requirements', async () => {
      await expect(
        llmProviderStore.setProvider('azure-test', {
          ...validAzureConfig,
          baseUrl: '', // Missing required Azure endpoint
        })
      ).rejects.toThrow('Azure Endpoint (baseUrl) is required');

      await expect(
        llmProviderStore.setProvider('azure-test', {
          ...validAzureConfig,
          azureDeploymentNames: [], // Missing required deployments
        })
      ).rejects.toThrow('At least one Azure Deployment Name is required');

      await expect(
        llmProviderStore.setProvider('azure-test', {
          ...validAzureConfig,
          apiKey: '', // Missing required API key
        })
      ).rejects.toThrow('API Key is required for Azure OpenAI');
    });

    it('validates required API key for non-local providers', async () => {
      await expect(
        llmProviderStore.setProvider('openai-test', {
          ...validOpenAIConfig,
          apiKey: '', // Missing required API key
        })
      ).rejects.toThrow('API Key is required for OpenAI');
    });

    it('allows empty API key for Ollama', async () => {
      const ollamaConfig: ProviderConfig = {
        name: 'Local Ollama',
        type: ProviderTypeEnum.Ollama,
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        modelNames: ['llama2'],
      };

      await expect(
        llmProviderStore.setProvider('ollama-test', ollamaConfig)
      ).resolves.not.toThrow();
    });

    it('retrieves stored provider configuration', async () => {
      mockStorage.get.mockResolvedValue({
        providers: {
          'test-provider': validOpenAIConfig,
        },
      });

      const config = await llmProviderStore.getProvider('test-provider');

      expect(config).toEqual(expect.objectContaining(validOpenAIConfig));
    });

    it('returns undefined for non-existent provider', async () => {
      const config = await llmProviderStore.getProvider('non-existent');

      expect(config).toBeUndefined();
    });

    it('removes provider from storage', async () => {
      mockStorage.get.mockResolvedValue({
        providers: {
          provider1: validOpenAIConfig,
          provider2: validAzureConfig,
        },
      });

      await llmProviderStore.removeProvider('provider1');

      expect(mockStorage.set).toHaveBeenCalledWith({
        providers: {
          provider2: validAzureConfig,
        },
      });
    });

    it('checks provider existence', async () => {
      mockStorage.get.mockResolvedValue({
        providers: {
          'existing-provider': validOpenAIConfig,
        },
      });

      const exists = await llmProviderStore.hasProvider('existing-provider');
      const notExists = await llmProviderStore.hasProvider('non-existent');

      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });

    it('retrieves all providers with backward compatibility', async () => {
      const storedProviders = {
        'old-provider': {
          apiKey: 'key',
          // Missing name and type - should be added by backward compatibility
        },
        'new-provider': validOpenAIConfig,
      };

      mockStorage.get.mockResolvedValue({
        providers: storedProviders,
      });

      const allProviders = await llmProviderStore.getAllProviders();

      expect(allProviders['old-provider']).toHaveProperty('name');
      expect(allProviders['old-provider']).toHaveProperty('type');
      expect(allProviders['new-provider']).toEqual(
        expect.objectContaining(validOpenAIConfig)
      );
    });
  });

  describe('Provider Validation', () => {
    beforeEach(() => {
      mockStorage.get.mockResolvedValue({
        providers: {
          'test-openai': {
            name: 'Test OpenAI',
            type: ProviderTypeEnum.OpenAI,
            apiKey: 'test-key',
            modelNames: ['gpt-4o'],
          },
        },
      });
    });

    it('validates OpenAI provider successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }],
          }),
      });

      const result = await llmProviderStore.validateProvider('test-openai');

      expect(result.isValid).toBe(true);
      expect(result.modelList).toContain('gpt-4o');
      expect(result.responseTime).toBeGreaterThan(0);
    });

    it('handles OpenAI validation failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await llmProviderStore.validateProvider('test-openai');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('HTTP 401');
    });

    it('handles network errors during validation', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await llmProviderStore.validateProvider('test-openai');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('rejects validation for providers without API key', async () => {
      mockStorage.get.mockResolvedValue({
        providers: {
          'no-key-provider': {
            name: 'No Key',
            type: ProviderTypeEnum.OpenAI,
            apiKey: '',
            modelNames: ['gpt-4o'],
          },
        },
      });

      const result = await llmProviderStore.validateProvider('no-key-provider');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('API key is required');
    });

    it('allows validation for Ollama without API key', async () => {
      mockStorage.get.mockResolvedValue({
        providers: {
          'ollama-provider': {
            name: 'Ollama',
            type: ProviderTypeEnum.Ollama,
            apiKey: '',
            baseUrl: 'http://localhost:11434',
            modelNames: ['llama2'],
          },
        },
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [{ name: 'llama2' }, { name: 'codellama' }],
          }),
      });

      const result = await llmProviderStore.validateProvider('ollama-provider');

      expect(result.isValid).toBe(true);
      expect(result.modelList).toContain('llama2');
    });

    it('updates provider validation status after validation', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      await llmProviderStore.validateProvider('test-openai');

      // Should call setProvider to update validation status
      expect(mockStorage.set).toHaveBeenCalledWith({
        providers: {
          'test-openai': expect.objectContaining({
            validated: true,
            lastValidated: expect.any(Number),
            validationError: undefined,
          }),
        },
      });
    });
  });

  describe('Provider Reset', () => {
    it('resets built-in provider to default configuration', async () => {
      await llmProviderStore.resetProvider('openai');

      expect(mockStorage.set).toHaveBeenCalledWith({
        providers: {
          openai: expect.objectContaining({
            name: 'OpenAI',
            type: ProviderTypeEnum.OpenAI,
            apiKey: '',
            modelNames: expect.arrayContaining(['gpt-4o']),
          }),
        },
      });
    });

    it('throws error when resetting non-built-in provider', async () => {
      await expect(
        llmProviderStore.resetProvider('custom-provider')
      ).rejects.toThrow(
        'Cannot reset provider custom-provider: not a built-in provider'
      );
    });
  });

  describe('Backward Compatibility', () => {
    it('adds missing fields to legacy provider configurations', async () => {
      const legacyProvider = {
        apiKey: 'legacy-key',
        // Missing name, type, createdAt
      };

      mockStorage.get.mockResolvedValue({
        providers: {
          'legacy-provider': legacyProvider,
        },
      });

      const config = await llmProviderStore.getProvider('legacy-provider');

      expect(config).toHaveProperty('name', 'legacy-provider');
      expect(config).toHaveProperty('type', 'custom_openai');
      expect(config).toHaveProperty('createdAt');
      expect(config?.apiKey).toBe('legacy-key');
    });

    it('cleans up Azure provider configuration', async () => {
      const azureProviderWithModelNames = {
        name: 'Azure',
        type: ProviderTypeEnum.AzureOpenAI,
        apiKey: 'azure-key',
        baseUrl: 'https://test.openai.azure.com',
        modelNames: ['gpt-4'], // Should be removed for Azure
        azureDeploymentNames: ['gpt-4-deployment'],
        azureApiVersion: '2024-02-15-preview',
      };

      mockStorage.get.mockResolvedValue({
        providers: {
          'azure-provider': azureProviderWithModelNames,
        },
      });

      const config = await llmProviderStore.getProvider('azure-provider');

      expect(config).not.toHaveProperty('modelNames');
      expect(config).toHaveProperty('azureDeploymentNames');
    });

    it('ensures non-Azure providers have modelNames', async () => {
      const providerWithoutModelNames = {
        name: 'Custom',
        type: 'custom_openai',
        apiKey: 'key',
        // Missing modelNames
      };

      mockStorage.get.mockResolvedValue({
        providers: {
          'custom-provider': providerWithoutModelNames,
        },
      });

      const config = await llmProviderStore.getProvider('custom-provider');

      expect(config).toHaveProperty('modelNames');
      expect(Array.isArray(config?.modelNames)).toBe(true);
    });
  });
});
