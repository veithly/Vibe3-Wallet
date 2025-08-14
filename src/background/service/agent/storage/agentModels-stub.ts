import { createStorage } from './storage';
import type { AgentNameEnum } from './types';
import { llmProviderParameters } from './types';

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

export const agentModelStore: AgentModelStorage = {
  setAgentModel: async (agent: AgentNameEnum, config: ModelConfig) => {
    validateModelConfig(config);
    // Merge default parameters with provided parameters
    const defaultParams = getModelParameters(agent, config.provider);
    const mergedConfig = {
      ...config,
      parameters: {
        ...defaultParams,
        ...config.parameters,
      },
    };
    const all = await storage.get();
    await storage.set({
      ...all,
      agents: {
        ...all.agents,
        [agent]: mergedConfig,
      },
    });
  },
  getAgentModel: async (agent: AgentNameEnum) => {
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
  },
  resetAgentModel: async (agent: AgentNameEnum) => {
    const all = await storage.get();
    const newAgents = { ...all.agents };
    delete newAgents[agent];
    await storage.set({ ...all, agents: newAgents });
  },
  hasAgentModel: async (agent: AgentNameEnum) => {
    const data = await storage.get();
    return agent in data.agents;
  },
  getConfiguredAgents: async () => {
    const data = await storage.get();
    return Object.keys(data.agents) as AgentNameEnum[];
  },
  getAllAgentModels: async () => {
    const data = await storage.get();
    return data.agents;
  },
};
