import React, { useState, useEffect } from 'react';
import { agent } from '@/background/service/agent';
import type {
  ModelConfig,
  ProviderConfig,
  ProviderValidationResult,
} from '@/background/service/agent/storage/index';
import { llmProviderStore } from '@/background/service/agent/storage/llmProviders';
import { agentModelStore } from '@/background/service/agent/storage/agentModels';
import {
  AgentNameEnum,
  llmProviderModelNames,
  ProviderTypeEnum,
} from '@/background/service/agent/storage/types';
import { logger } from '../utils/logger';
import IconButton from './IconButton';
import ProviderValidator from './ProviderValidator';


// ReAct configuration interface
interface ReActConfig {
  enabled: boolean;
  maxSteps: number;
  timeoutMs: number;
  showThinking: boolean;
  autoContinue: boolean;
}

interface SettingsProps {
  onClose: () => void;
}

// Additional provider configuration for custom added providers
interface CustomProvider {
  id: string;
  name: string;
  type: ProviderTypeEnum;
  apiKey: string;
  baseUrl?: string;
  models: string[];
  isValid: boolean;
  lastValidated?: number;
}

export default function Settings({ onClose }: SettingsProps) {
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>({});
  const [agentModels, setAgentModels] = useState<
    Record<AgentNameEnum, ModelConfig>
  >({} as Record<AgentNameEnum, ModelConfig>);
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [modelsReloaded, setModelsReloaded] = useState(false);
  const [reactConfig, setReActConfig] = useState<ReActConfig>({
    enabled: true,
    maxSteps: 10,
    timeoutMs: 30000,
    showThinking: true,
    autoContinue: true,
  });
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [selectedProviderType, setSelectedProviderType] = useState<ProviderTypeEnum>(ProviderTypeEnum.Anthropic);
  const [newProviderConfig, setNewProviderConfig] = useState({
    apiKey: '',
    baseUrl: '',
  });

  const [activeTab, setActiveTab] = useState('providers');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const fetchedProviders = await agent.getProviders();

        // Only use user-added providers, no built-in providers
        setProviders(fetchedProviders);

        const fetchedAgentModels = await agent.getAgentModels();
        setAgentModels(fetchedAgentModels);

        // Load all user-added providers
        const customProvidersData = Object.entries(fetchedProviders)
          .filter(([id, config]) =>
            config.apiKey
          )
          .map(([id, config]) => ({
            id,
            name: config.name || 'Custom Provider',
            type: config.type!,
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            models: config.modelNames || [],
            isValid: config.validated || false,
            lastValidated: config.lastValidated,
          }));

        setCustomProviders(customProvidersData);
        setHasError(null);
      } catch (error) {
        logger.error('Settings', 'Failed to fetch settings', error);
        setHasError(
          error instanceof Error ? error.message : 'Failed to load settings'
        );
        setProviders({});
        setAgentModels({} as Record<AgentNameEnum, ModelConfig>);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleProviderChange = (
    providerId: string,
    config: Partial<ProviderConfig>
  ) => {
    setProviders((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], ...config },
    }));
  };

  const handleAgentModelChange = (
    agent: AgentNameEnum,
    config: Partial<ModelConfig>
  ) => {
    setAgentModels((prev) => ({
      ...prev,
      [agent]: { ...prev[agent], ...config },
    }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // Validate all custom providers before saving
      const validationErrors: string[] = [];
      for (const provider of customProviders) {
        if (!provider.apiKey.trim()) {
          validationErrors.push(`${provider.name} requires an API key`);
        }
      }

      if (validationErrors.length > 0) {
        throw new Error(`Validation errors: ${validationErrors.join(', ')}`);
      }

      // Save all user-added providers
      for (const [providerId, config] of Object.entries(providers)) {
        try {
          await llmProviderStore.setProvider(providerId, config);
        } catch (providerError) {
          logger.error('Settings', `Failed to save provider ${providerId}`, providerError);
          throw new Error(`Failed to save provider ${providerId}: ${providerError instanceof Error ? providerError.message : 'Unknown error'}`);
        }
      }

      // Save agent models
      for (const [agent, config] of Object.entries(agentModels)) {
        try {
          await agentModelStore.setAgentModel(agent as AgentNameEnum, config);
        } catch (modelError) {
          logger.error('Settings', `Failed to save agent model ${agent}`, modelError);
          throw new Error(`Failed to save agent model ${agent}: ${modelError instanceof Error ? modelError.message : 'Unknown error'}`);
        }
      }

      // Save ReAct config using chrome.storage
      try {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          await chrome.storage.local.set({ reactConfig });
        } else {
          logger.warn('Settings', 'Chrome storage not available, skipping ReAct config save');
        }
      } catch (storageError) {
        logger.error('Settings', 'Failed to save ReAct config', storageError);
        throw new Error(`Failed to save ReAct config: ${storageError instanceof Error ? storageError.message : 'Unknown error'}`);
      }

      logger.info('Settings', 'Settings saved successfully');
      setSaveSuccess(true);

      // Reload all agent models to apply changes immediately
      try {
        await agent.reloadAllAgentModels();
        logger.info('Settings', 'Agent models reloaded successfully');
        setModelsReloaded(true);
      } catch (reloadError) {
        logger.error('Settings', 'Failed to reload agent models', reloadError);
        // Don't throw here - settings were saved successfully, just the reload failed
      }

      // Reset states and close after delay
      setTimeout(() => {
        setSaveSuccess(false);
        setModelsReloaded(false);
        onClose();
      }, 2000);
    } catch (error) {
      logger.error('Settings', 'Failed to save settings', error);
      setHasError(
        error instanceof Error ? error.message : 'Failed to save settings'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddProvider = async () => {
    if (!newProviderConfig.apiKey.trim()) return;

    try {
      const providerId = `custom_${selectedProviderType}_${Date.now()}`;
      const providerName = selectedProviderType.charAt(0).toUpperCase() + selectedProviderType.slice(1);

      // Try to fetch models from provider
      let models = llmProviderModelNames[selectedProviderType] || [];

      const newProvider: CustomProvider = {
        id: providerId,
        name: providerName,
        type: selectedProviderType,
        apiKey: newProviderConfig.apiKey,
        baseUrl: newProviderConfig.baseUrl,
        models,
        isValid: false,
      };

      setCustomProviders(prev => [...prev, newProvider]);

      // Add to providers state
      setProviders(prev => ({
        ...prev,
        [providerId]: {
          name: providerName,
          type: selectedProviderType,
          apiKey: newProviderConfig.apiKey,
          baseUrl: newProviderConfig.baseUrl,
          modelNames: models,
          validated: false,
        }
      }));

      // Reset form
      setNewProviderConfig({ apiKey: '', baseUrl: '' });
      setShowAddProvider(false);
    } catch (error) {
      logger.error('Settings', 'Failed to add provider', error);
    }
  };

  const handleRemoveProvider = (providerId: string) => {
    setCustomProviders(prev => prev.filter(p => p.id !== providerId));
    setProviders(prev => {
      const newProviders = { ...prev };
      delete newProviders[providerId];
      return newProviders;
    });
  };

  const handleValidationComplete = (providerId: string, result: ProviderValidationResult) => {
    setProviders(prev => ({
      ...prev,
      [providerId]: {
        ...prev[providerId],
        validated: result.isValid,
        lastValidated: result.timestamp,
        validationError: result.error,
        modelNames: result.modelList || prev[providerId].modelNames,
      },
    }));

    setCustomProviders(prev => prev.map(p =>
      p.id === providerId
        ? {
            ...p,
            isValid: result.isValid,
            lastValidated: result.timestamp,
            models: result.modelList || p.models,
          }
        : p
    ));
  };



  if (isLoading) {
    return (
      <div className="settings-modal-container">
        <div className="settings-modal">
          <div className="settings-loading">Loading settings...</div>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="settings-modal-container">
        <div className="settings-modal">
          <div className="settings-error">
            <h3>Error</h3>
            <p>{hasError}</p>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-modal-container">
      <div className="settings-modal optimized-mode">
        <div className="settings-header">
          <h2 className="mb-2 text-xl font-bold text-gray-900">AI Model Settings</h2>
          <p className="text-sm text-gray-600">Configure AI models for different agents</p>
        </div>

      <div className="settings-content">
        {/* Custom Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px space-x-8">
            <button
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'providers'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('providers')}
            >
              Providers
            </button>
            <button
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'agents'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('agents')}
            >
              Agent Models
            </button>
            <button
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'react'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('react')}
            >
              ReAct Config
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'providers' && (
            <div className="providers-tab-content">
        {/* Custom Providers Section */}
        <div className="p-6 mb-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Custom Providers</h3>
            <button
              className="px-3 py-1.5 text-sm font-medium text-green-600 bg-green-50 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
              onClick={() => setShowAddProvider(true)}
            >
              + Add Provider
            </button>
          </div>

          {/* Model Search removed in optimized UI */}

          {customProviders.map((provider) => (
            <div key={provider.id} className="p-4 mb-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex justify-between items-center mb-3">
                <span className="font-medium text-gray-900">{provider.name}</span>
                <button
                  className="p-2 text-gray-400 rounded-lg transition-colors hover:text-red-500 hover:bg-red-50"
                  onClick={() => handleRemoveProvider(provider.id)}
                  title="Remove provider"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block mb-1 text-sm font-medium text-gray-700">API Key</label>
                  <input
                    type="password"
                    value={provider.apiKey}
                    onChange={(e) => {
                      setCustomProviders(prev => prev.map(p =>
                        p.id === provider.id
                          ? { ...p, apiKey: e.target.value }
                          : p
                      ));
                      handleProviderChange(provider.id, { apiKey: e.target.value });
                    }}
                    placeholder="••••••••"
                    className="px-4 py-3 w-full rounded-lg border border-gray-300 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400"
                  />
                </div>

                {(provider.type === ProviderTypeEnum.AzureOpenAI ||
                  provider.type === ProviderTypeEnum.CustomOpenAI) && (
                  <div>
                    <label className="block mb-2 text-base font-semibold text-gray-900 dark:text-white">Base URL</label>
                    <input
                      type="text"
                      value={provider.baseUrl || ''}
                      onChange={(e) => {
                        setCustomProviders(prev => prev.map(p =>
                          p.id === provider.id
                            ? { ...p, baseUrl: e.target.value }
                            : p
                        ));
                        handleProviderChange(provider.id, { baseUrl: e.target.value });
                      }}
                      placeholder="Enter base URL"
                      className="px-4 py-3 w-full text-gray-900 bg-white rounded-lg border border-gray-300 shadow-sm transition-colors dark:border-gray-600 dark:bg-gray-title dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 dark:hover:border-gray-500"
                    />
                  </div>
                )}

                <ProviderValidator
                  config={providers[provider.id]}
                  providerId={provider.id}
                  onValidationComplete={(result) =>
                    handleValidationComplete(provider.id, result)
                  }
                />
              </div>

              {/* Provider models list hidden in optimized UI */}
            </div>
          ))}

          {/* Add Provider Modal */}
          {showAddProvider && (
            <div className="flex fixed inset-0 z-50 justify-center items-center bg-black bg-opacity-50">
              <div className="p-6 w-full max-w-md bg-white rounded-lg shadow-xl">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">Add New Provider</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block mb-1 text-sm font-medium text-gray-700">Provider Type</label>
                    <select
                      value={selectedProviderType}
                      onChange={(e) => setSelectedProviderType(e.target.value as ProviderTypeEnum)}
                      className="px-4 py-3 w-full rounded-lg border border-gray-300 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400"
                      aria-label="Provider Type"
                      title="Provider Type"
                    >
                      <option value={ProviderTypeEnum.Anthropic}>Anthropic</option>
                      <option value={ProviderTypeEnum.Gemini}>Google Gemini</option>
                      <option value={ProviderTypeEnum.Groq}>Groq</option>
                      <option value={ProviderTypeEnum.Cerebras}>Cerebras</option>
                      <option value={ProviderTypeEnum.DeepSeek}>DeepSeek</option>
                      <option value={ProviderTypeEnum.Grok}>Grok</option>
                      <option value={ProviderTypeEnum.Ollama}>Ollama</option>
                      <option value={ProviderTypeEnum.OpenRouter}>OpenRouter</option>
                      <option value={ProviderTypeEnum.AzureOpenAI}>Azure OpenAI</option>
                    </select>
                  </div>

                  <div>
                    <label className="block mb-1 text-sm font-medium text-gray-700">API Key</label>
                    <input
                      type="password"
                      value={newProviderConfig.apiKey}
                      onChange={(e) => setNewProviderConfig(prev => ({
                        ...prev,
                        apiKey: e.target.value
                      }))}
                      placeholder="Enter API key"
                      className="px-4 py-3 w-full rounded-lg border border-gray-300 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400"
                      aria-label="API Key"
                      title="API Key"
                    />
                  </div>

                  {(selectedProviderType === ProviderTypeEnum.AzureOpenAI ||
                    selectedProviderType === ProviderTypeEnum.CustomOpenAI) && (
                    <div>
                      <label className="block mb-1 text-sm font-medium text-gray-700">Base URL</label>
                      <input
                        type="text"
                        value={newProviderConfig.baseUrl}
                        onChange={(e) => setNewProviderConfig(prev => ({
                          ...prev,
                          baseUrl: e.target.value
                        }))}
                        placeholder="Enter base URL"
                        className="px-4 py-3 w-full rounded-lg border border-gray-300 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400"
                        aria-label="Base URL"
                        title="Base URL"
                      />
                    </div>
                  )}

                  <div className="flex justify-end pt-4 space-x-3">
                    <button
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-md border border-gray-300 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onClick={() => setShowAddProvider(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md border border-transparent transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleAddProvider}
                      disabled={!newProviderConfig.apiKey.trim()}
                    >
                      Add Provider
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ReAct Configuration */}
        <div className="react-config-section">
          <h3>ReAct Configuration</h3>
          <div className="space-y-4 config-form">
            <div className="input-group">
              <label className="block mb-2 text-base font-semibold text-gray-900 dark:text-white">Max Steps</label>
              <input
                type="number"
                value={reactConfig.maxSteps}
                onChange={(e) => setReActConfig(prev => ({
                  ...prev,
                  maxSteps: parseInt(e.target.value)
                }))}
                min="1"
                max="50"
                className="px-4 py-3 w-full text-gray-900 bg-white rounded-lg border border-gray-300 shadow-sm transition-colors dark:border-gray-600 dark:bg-gray-title dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 dark:hover:border-gray-500"
                title="Max Steps"
                aria-label="Max Steps"
              />
            </div>

            <div className="input-group">
              <label className="block mb-2 text-base font-semibold text-gray-900 dark:text-white">Timeout (ms)</label>
              <input
                type="number"
                value={reactConfig.timeoutMs}
                onChange={(e) => setReActConfig(prev => ({
                  ...prev,
                  timeoutMs: parseInt(e.target.value)
                }))}
                min="1000"
                max="300000"
                className="px-4 py-3 w-full text-gray-900 bg-white rounded-lg border border-gray-300 shadow-sm transition-colors dark:border-gray-600 dark:bg-gray-title dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 dark:hover:border-gray-500"
                title="Timeout in milliseconds"
                aria-label="Timeout in milliseconds"
              />
            </div>

            <div className="space-y-3 checkbox-group">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reactConfig.showThinking}
                  onChange={(e) => setReActConfig(prev => ({
                    ...prev,
                    showThinking: e.target.checked
                  }))}
                  className="w-5 h-5 text-blue-600 bg-gray-100 rounded border-gray-300 dark:bg-gray-700 dark:border-gray-600 focus:ring-blue-500 focus:ring-2"
                />
                <span className="text-base font-medium text-gray-900 dark:text-white">Show Thinking Process</span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reactConfig.autoContinue}
                  onChange={(e) => setReActConfig(prev => ({
                    ...prev,
                    autoContinue: e.target.checked
                  }))}
                  className="w-5 h-5 text-blue-600 bg-gray-100 rounded border-gray-300 dark:bg-gray-700 dark:border-gray-600 focus:ring-blue-500 focus:ring-2"
                />
                <span className="text-base font-medium text-gray-900 dark:text-white">Auto Continue on Success</span>
              </label>
            </div>
          </div>
        </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="agent-models-tab-content">
              <div className="p-6 mb-4 bg-white rounded-xl border border-gray-200 shadow-sm dark:bg-gray-title dark:border-gray-700">
                <h3 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">Agent Model Configuration</h3>
                <div className="grid grid-cols-1 gap-4">
                  {Object.values(AgentNameEnum).map((agent) => (
                    <div key={agent} className="p-5 bg-gray-50 rounded-xl border border-gray-200 shadow-sm dark:bg-gray-800 dark:border-gray-700">
                      <div className="flex items-center mb-4">
                        <svg className="mr-3 w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{agent.charAt(0).toUpperCase() + agent.slice(1)} Agent</h4>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className="block mb-2 text-base font-semibold text-gray-900 dark:text-white">Provider:</label>
                          <select
                            className="px-4 py-3 w-full rounded-lg border border-gray-300 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400"
                            value={agentModels[agent]?.provider || ''}
                            onChange={(e) => handleAgentModelChange(agent, { provider: e.target.value })}
                            aria-label="Provider"
                            title="Provider"
                          >
                            <option value="">Select a provider</option>
                            {Object.entries(providers).map(([providerId, config]) => (
                              <option key={providerId} value={providerId}>
                                {config.name || providerId}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block mb-2 text-base font-semibold text-gray-900 dark:text-white">Model:</label>
                          <select
                            className="px-4 py-3 w-full rounded-lg border border-gray-300 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400"
                            value={agentModels[agent]?.modelName || ''}
                            onChange={(e) => handleAgentModelChange(agent, { modelName: e.target.value })}
                            aria-label="Model"
                            title="Model"
                          >
                            <option value="">Select a model</option>
                            {agentModels[agent]?.provider && providers[agentModels[agent].provider]?.modelNames?.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'react' && (
            <div className="react-config-tab-content">
              <div className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm dark:bg-gray-title dark:border-gray-700">
                <h3 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">ReAct Configuration</h3>
                <div className="space-y-4">
                  <div className="flex items-center">
                    <label className="block text-base font-semibold text-gray-900 w-100 dark:text-white">Enabled:</label>
                    <label className="inline-flex relative items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={reactConfig.enabled}
                        onChange={(e) => setReActConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                        aria-label="Enabled"
                        title="Enabled"
                      />
                      <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center space-x-4">
                    <label className="block w-80 text-base font-semibold text-gray-900 dark:text-white">Max Steps:</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      className="px-4 py-3 text-gray-900 bg-white rounded-lg border border-gray-300 shadow-sm transition-colors w-100 dark:border-gray-600 dark:bg-gray-title dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 dark:hover:border-gray-500"
                      value={reactConfig.maxSteps}
                      onChange={(e) => setReActConfig(prev => ({ ...prev, maxSteps: parseInt(e.target.value) || 10 }))}
                      aria-label="Max Steps"
                      title="Max Steps"
                    />
                  </div>

                  <div className="flex items-center space-x-4">
                    <label className="block w-80 text-base font-semibold text-gray-900 dark:text-white">Timeout (ms):</label>
                    <input
                      type="number"
                      min="1000"
                      max="300000"
                      step="1000"
                      className="px-4 py-3 text-gray-900 bg-white rounded-lg border border-gray-300 shadow-sm transition-colors w-100 dark:border-gray-600 dark:bg-gray-title dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 dark:hover:border-gray-500"
                      value={reactConfig.timeoutMs}
                      onChange={(e) => setReActConfig(prev => ({ ...prev, timeoutMs: parseInt(e.target.value) || 30000 }))}
                      aria-label="Timeout (ms)"
                      title="Timeout (ms)"
                    />
                  </div>

                  <div className="flex items-center space-x-4">
                    <label className="block w-80 text-base font-semibold text-gray-900 dark:text-white">Show Thinking:</label>
                    <label className="inline-flex relative items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={reactConfig.showThinking}
                        onChange={(e) => setReActConfig(prev => ({ ...prev, showThinking: e.target.checked }))}
                        aria-label="Show Thinking"
                        title="Show Thinking"
                      />
                      <div className="w-24 h-16 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-7 after:w-7 after:transition-all peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center space-x-4">
                    <label className="block w-80 text-base font-semibold text-gray-900 dark:text-white">Auto Continue:</label>
                    <label className="inline-flex relative items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={reactConfig.autoContinue}
                        onChange={(e) => setReActConfig(prev => ({ ...prev, autoContinue: e.target.checked }))}
                        aria-label="Auto Continue"
                        title="Auto Continue"
                      />
                      <div className="w-24 h-16 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-7 after:w-7 after:transition-all peer-checked:bg-blue-600 dark:peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end p-4 space-x-3 bg-gray-50 border-t settings-footer">
        <button
          onClick={onClose}
          disabled={isSaving}
          className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="mr-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md border border-transparent hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <svg className="mr-2 -ml-1 w-4 h-4 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </>
          ) : (
            <>
              <svg className="mr-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              {saveSuccess ? (modelsReloaded ? 'Saved & Reloaded!' : 'Saved!') : 'Save Settings'}
            </>
          )}
        </button>
      </div>
    </div>
    </div>
  );
}