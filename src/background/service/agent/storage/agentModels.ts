import { createLogger } from '../../../../utils/logger';
import { createStorage } from './storage';
import { AgentNameEnum } from './types';
import { llmProviderParameters } from './types';

const logger = createLogger('AgentModelStore');

// Interface for a single model configuration
export interface ModelConfig {
  // providerId, the key of the provider in the llmProviderStore, not the provider name
  provider: string;
  modelName: string;
  parameters?: Record<string, unknown>;
  reasoningEffort?: 'low' | 'medium' | 'high'; // For o-series models (OpenAI and Azure)
}

// Interface for storing multiple agent model configurations
export interface AgentModelRecord {
  agents: Record<AgentNameEnum, ModelConfig>;
}

export type AgentModelStorage = {
  setAgentModel: (agent: AgentNameEnum, config: ModelConfig) => Promise<void>;
  getAgentModel: (agent: AgentNameEnum) => Promise<ModelConfig | undefined>;
  resetAgentModel: (agent: AgentNameEnum) => Promise<void>;
  hasAgentModel: (agent: AgentNameEnum) => Promise<boolean>;
  getConfiguredAgents: () => Promise<AgentNameEnum[]>;
  getAllAgentModels: () => Promise<Record<AgentNameEnum, ModelConfig>>;
  validateProviderCompatibility: (config: ModelConfig) => Promise<boolean>;
  getOptimalModelForAgent: (
    agent: AgentNameEnum,
    availableProviders: string[]
  ) => Promise<ModelConfig | null>;
  migrateLegacyConfigs: () => Promise<void>;
};

const storage = createStorage<AgentModelRecord>(
  'agent-models',
  { agents: {} as Record<AgentNameEnum, ModelConfig> },
  {
    isPersistant: true,
  }
);

function validateModelConfig(config: ModelConfig) {
  if (!config.provider || !config.modelName) {
    throw new Error('Provider and model name must be specified');
  }
}

function getModelParameters(
  agent: AgentNameEnum,
  provider: string
): Record<string, unknown> {
  const providerParams =
    llmProviderParameters[provider as keyof typeof llmProviderParameters]?.[
      agent
    ];
  return providerParams ?? { temperature: 0.1, topP: 0.1 };
}

/**
 * Enhanced agent model store with production-ready features
 */
export const agentModelStore: AgentModelStorage = {
  setAgentModel: async (agent: AgentNameEnum, config: ModelConfig) => {
    logger.info('AgentModelStore', `Setting model for ${agent}`, {
      provider: config.provider,
      modelName: config.modelName,
    });

    validateModelConfig(config);

    // Validate provider compatibility before saving
    const isCompatible = await agentModelStore.validateProviderCompatibility(
      config
    );
    if (!isCompatible) {
      throw new Error(
        `Provider ${config.provider} is not compatible with model ${config.modelName}`
      );
    }

    // Merge default parameters with provided parameters
    const defaultParams = getModelParameters(agent, config.provider);
    const mergedConfig = {
      ...config,
      parameters: {
        ...defaultParams,
        ...config.parameters,
      },
    };

    try {
      const all = await storage.get();
      await storage.set({
        ...all,
        agents: {
          ...all.agents,
          [agent]: mergedConfig,
        },
      });

      logger.info('AgentModelStore', `Successfully set model for ${agent}`, {
        provider: config.provider,
        modelName: config.modelName,
      });
    } catch (error) {
      logger.error(
        'AgentModelStore',
        `Failed to set model for ${agent}`,
        error
      );
      throw new Error(
        `Failed to save model configuration: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  },

  getAgentModel: async (agent: AgentNameEnum) => {
    try {
      const data = await storage.get();
      const config = data.agents[agent];
      if (!config) return undefined;

      // Merge default parameters with stored parameters
      const defaultParams = getModelParameters(agent, config.provider);
      return {
        ...config,
        parameters: {
          ...defaultParams,
          ...config.parameters,
        },
      };
    } catch (error) {
      logger.error(
        'AgentModelStore',
        `Failed to get model for ${agent}`,
        error
      );
      return undefined;
    }
  },

  resetAgentModel: async (agent: AgentNameEnum) => {
    logger.info('AgentModelStore', `Resetting model for ${agent}`);

    try {
      const all = await storage.get();
      const newAgents = { ...all.agents };
      delete newAgents[agent];
      await storage.set({ ...all, agents: newAgents });

      logger.info('AgentModelStore', `Successfully reset model for ${agent}`);
    } catch (error) {
      logger.error(
        'AgentModelStore',
        `Failed to reset model for ${agent}`,
        error
      );
      throw new Error(
        `Failed to reset model configuration: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  },

  hasAgentModel: async (agent: AgentNameEnum) => {
    try {
      const data = await storage.get();
      return agent in data.agents;
    } catch (error) {
      logger.error(
        'AgentModelStore',
        `Failed to check model for ${agent}`,
        error
      );
      return false;
    }
  },

  getConfiguredAgents: async () => {
    try {
      const data = await storage.get();
      return Object.keys(data.agents) as AgentNameEnum[];
    } catch (error) {
      logger.error('AgentModelStore', 'Failed to get configured agents', error);
      return [];
    }
  },

  getAllAgentModels: async () => {
    try {
      const data = await storage.get();
      const result: Record<AgentNameEnum, ModelConfig> = {} as Record<
        AgentNameEnum,
        ModelConfig
      >;

      // Apply parameter merging for all agents
      for (const [agent, config] of Object.entries(data.agents)) {
        const defaultParams = getModelParameters(
          agent as AgentNameEnum,
          config.provider
        );
        result[agent as AgentNameEnum] = {
          ...config,
          parameters: {
            ...defaultParams,
            ...config.parameters,
          },
        };
      }

      return result;
    } catch (error) {
      logger.error('AgentModelStore', 'Failed to get all agent models', error);
      return {} as Record<AgentNameEnum, ModelConfig>;
    }
  },

  /**
   * Validate that a provider is compatible with the specified model
   */
  validateProviderCompatibility: async (
    config: ModelConfig
  ): Promise<boolean> => {
    try {
      // For now, perform basic validation - can be enhanced with actual provider checks
      if (!config.provider || !config.modelName) {
        return false;
      }

      // Check if model name contains provider-specific patterns
      const providerPatterns: Record<string, RegExp[]> = {
        openai: [/^gpt-/, /^o\d+/],
        anthropic: [/^claude-/],
        gemini: [/^gemini-/],
        grok: [/^grok-/],
        ollama: [/:\d+b$/],
        azure_openai: [/^gpt-/, /^o\d+/],
        openrouter: [/^openai\//, /^google\//, /^anthropic\//],
      };

      const patterns = providerPatterns[config.provider];
      if (patterns) {
        return patterns.some((pattern) => pattern.test(config.modelName));
      }

      // For custom providers and unknown patterns, assume compatibility
      return true;
    } catch (error) {
      logger.warn(
        'AgentModelStore',
        'Failed to validate provider compatibility',
        error
      );
      return true; // Assume compatibility on validation errors
    }
  },

  /**
   * Get optimal model configuration for an agent based on available providers
   */
  getOptimalModelForAgent: async (
    agent: AgentNameEnum,
    availableProviders: string[]
  ): Promise<ModelConfig | null> => {
    try {
      // Provider priority for each agent type
      const providerPriority: Record<AgentNameEnum, string[]> = {
        [AgentNameEnum.Planner]: [
          'openai',
          'anthropic',
          'gemini',
          'openrouter',
        ],
        [AgentNameEnum.Navigator]: [
          'openai',
          'anthropic',
          'gemini',
          'openrouter',
        ],
        [AgentNameEnum.Validator]: [
          'openai',
          'anthropic',
          'gemini',
          'openrouter',
        ],
      };

      const priorities = providerPriority[agent];

      for (const provider of priorities) {
        if (availableProviders.includes(provider)) {
          const defaultParams = getModelParameters(agent, provider);

          // Select best model for this provider
          let modelName = 'gpt-4o-mini'; // fallback
          if (provider === 'anthropic') {
            modelName = 'claude-3-5-sonnet-latest';
          } else if (provider === 'gemini') {
            modelName = 'gemini-2.5-flash';
          }

          return {
            provider,
            modelName,
            parameters: defaultParams,
          };
        }
      }

      // If no preferred providers available, use the first available one
      if (availableProviders.length > 0) {
        const provider = availableProviders[0];
        const defaultParams = getModelParameters(agent, provider);
        return {
          provider,
          modelName: 'default',
          parameters: defaultParams,
        };
      }

      return null;
    } catch (error) {
      logger.error('AgentModelStore', 'Failed to get optimal model', error);
      return null;
    }
  },

  /**
   * Migrate legacy configurations to new format
   */
  migrateLegacyConfigs: async (): Promise<void> => {
    try {
      // Check for legacy storage keys and migrate them
      const legacyKeys = ['agent-models-legacy', 'llm-agent-models'];

      for (const key of legacyKeys) {
        try {
          const result = await chrome.storage.local.get(key);
          if (result[key]) {
            logger.info(
              'AgentModelStore',
              `Found legacy config for ${key}, migrating...`
            );

            // Merge with existing configuration
            const current = await storage.get();
            const legacy = result[key];

            await storage.set({
              agents: {
                ...current.agents,
                ...legacy,
              },
            });

            // Clean up legacy storage
            await chrome.storage.local.remove(key);
            logger.info(
              'AgentModelStore',
              `Successfully migrated legacy config from ${key}`
            );
          }
        } catch (error) {
          logger.warn(
            'AgentModelStore',
            `Failed to migrate legacy config from ${key}`,
            error
          );
        }
      }
    } catch (error) {
      logger.error(
        'AgentModelStore',
        'Failed to migrate legacy configurations',
        error
      );
    }
  },
};

// Initialize with migration check
agentModelStore.migrateLegacyConfigs().catch((error) => {
  logger.error(
    'AgentModelStore',
    'Failed to initialize legacy migration',
    error
  );
});
