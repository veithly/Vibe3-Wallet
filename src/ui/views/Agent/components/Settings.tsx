import React, { useState, useEffect } from 'react';
import { agent } from '@/background/service/agent';
import type {
  ModelConfig,
  ProviderConfig,
  ProviderValidationResult,
} from '@/background/service/agent/storage/index';
import { llmProviderStore } from '@/background/service/agent/storage/llmProviders';
import {
  AgentNameEnum,
  llmProviderModelNames,
  ProviderTypeEnum,
} from '@/background/service/agent/storage/types';
import { logger } from '../utils/logger';
import IconButton from './IconButton';
import ProviderValidator from './ProviderValidator';
import '../styles/ProviderValidator.less';
import '../styles/Settings.less';

interface SettingsProps {
  onClose: () => void;
}

export default function Settings({ onClose }: SettingsProps) {
  const [providers, setProviders] = useState<Record<string, ProviderConfig>>(
    {}
  );
  const [agentModels, setAgentModels] = useState<
    Record<AgentNameEnum, ModelConfig>
  >({} as Record<AgentNameEnum, ModelConfig>);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('openai');
  const [expandedProvider, setExpandedProvider] = useState<string>('openai');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const fetchedProviders = await agent.getProviders();
        const builtInProviders = llmProviderStore.getBuiltInProviders();

        const allProviders = { ...builtInProviders, ...fetchedProviders };

        setProviders(allProviders);

        const fetchedAgentModels = await agent.getAgentModels();
        setAgentModels(fetchedAgentModels);
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

  const handleAddProvider = () => {
    const newProviderId = `custom_openai_${Date.now()}`;
    setProviders((prev) => ({
      ...prev,
      [newProviderId]: {
        type: ProviderTypeEnum.CustomOpenAI,
        name: 'New Custom Provider',
        apiKey: '',
        modelNames: [],
        baseUrl: '',
      },
    }));
  };

  const handleRemoveProvider = (providerId: string) => {
    const newProviders = { ...providers };
    delete newProviders[providerId];
    setProviders(newProviders);
    agent.removeProvider(providerId).catch((err) => {
      logger.error('Settings', 'Failed to remove provider from storage', err);
    });
  };

  const handleProviderSelect = (providerId: string) => {
    setSelectedProvider(providerId);
    setExpandedProvider(providerId);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      // Save providers
      for (const [providerId, config] of Object.entries(providers)) {
        await agent.setProvider(providerId, config);
      }
      // Save agent models
      for (const [agentName, config] of Object.entries(agentModels)) {
        await agent.setAgentModel(agentName as AgentNameEnum, config);
      }
      onClose();
    } catch (error) {
      logger.error('Settings', 'Failed to save settings', error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleProviderExpansion = (providerId: string) => {
    setExpandedProvider(expandedProvider === providerId ? '' : providerId);
  };

  const getProviderStatus = (
    providerId: string
  ): 'valid' | 'invalid' | 'warning' | 'unknown' => {
    const provider = providers[providerId];
    if (!provider.validated) return 'unknown';
    return provider.validated ? 'valid' : 'invalid';
  };

  const getAvailableProviders = () => {
    const allProviders = {
      ...llmProviderStore.getBuiltInProviders(),
      ...providers,
    };
    return Object.entries(allProviders)
      .filter(([_, config]) => config.type !== 'custom_openai')
      .sort(([a], [b]) => a.localeCompare(b));
  };

  const renderProviderConfig = (providerId: string, config: ProviderConfig) => {
    const isBuiltIn = providerId in llmProviderStore.getBuiltInProviders();

    const handleValidationComplete = (result: ProviderValidationResult) => {
      setProviders((prev) => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          validated: result.isValid,
          lastValidated: result.timestamp,
          validationError: result.error,
        },
      }));
    };

    return (
      <div className="provider-config-form">
        <div className="input-group">
          <label>API Key</label>
          <input
            type="password"
            value={config.apiKey || ''}
            onChange={(e) =>
              handleProviderChange(providerId, { apiKey: e.target.value })
            }
            placeholder={config.apiKey ? '••••••••' : 'Enter API key'}
            className={config.apiKey ? 'has-value' : ''}
          />
        </div>

        {config.type === ProviderTypeEnum.AzureOpenAI ? (
          <div className="input-group">
            <label>Azure Endpoint</label>
            <input
              type="text"
              value={config.baseUrl || ''}
              onChange={(e) =>
                handleProviderChange(providerId, {
                  baseUrl: e.target.value,
                })
              }
              placeholder="https://your-resource.openai.azure.com"
              disabled={isBuiltIn}
            />
          </div>
        ) : (
          <div className="input-group">
            <label>Base URL (Optional)</label>
            <input
              type="text"
              value={config.baseUrl || ''}
              onChange={(e) =>
                handleProviderChange(providerId, { baseUrl: e.target.value })
              }
              placeholder="Custom endpoint URL"
              disabled={isBuiltIn && providerId !== 'ollama'}
            />
          </div>
        )}

        <div className="provider-actions">
          <ProviderValidator
            providerId={providerId}
            config={config}
            onValidationComplete={handleValidationComplete}
          />
        </div>
      </div>
    );
  };

  // Removed complex provider settings - replaced by simplified renderProviderConfig

  // Removed complex provider card - replaced by simplified radio selection

  if (isLoading) {
    return (
      <div className="settings-modal unified-mode">
        <div className="settings-header">
          <h2>AI Provider Settings</h2>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid #f0f0f0',
              borderTop: '3px solid #1890ff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <div>Loading settings...</div>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="settings-modal unified-mode">
        <div className="settings-header">
          <h2>AI Provider Settings</h2>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: '#ff4d4f' }}>
          <h3>Settings Not Available</h3>
          <p>{hasError}</p>
          <div
            style={{
              backgroundColor: '#fff7e6',
              border: '1px solid #ffd591',
              borderRadius: '6px',
              padding: '16px',
              margin: '16px 0',
              textAlign: 'left',
            }}
          >
            <h4 style={{ color: '#fa8c16', margin: '0 0 8px 0' }}>
              Development Mode Notice
            </h4>
            <p
              style={{
                color: '#873800',
                fontSize: '14px',
                margin: '0 0 8px 0',
              }}
            >
              The Agent system is currently running in development mode with
              enhanced mock implementations.
            </p>
            <ul
              style={{
                color: '#873800',
                fontSize: '13px',
                margin: '0',
                paddingLeft: '20px',
              }}
            >
              <li>LLM Provider configurations are simulated</li>
              <li>Agent task execution uses realistic mock responses</li>
              <li>Settings persistence may be limited in this environment</li>
              <li>
                Production deployment requires actual nanobrowser integration
              </li>
            </ul>
          </div>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '16px' }}>
            Settings functionality requires the Agent service to be running.
            This feature may not be available in this environment.
          </p>
          <button
            onClick={onClose}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              backgroundColor: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Simplified unified interface
  return (
    <div className="settings-modal unified-mode">
      <div className="settings-header">
        <h2>AI Provider Settings</h2>
        <div className="header-info">
          <p>Configure your AI provider to enable agent functionality</p>
        </div>
      </div>

      <div className="settings-content">
        {/* Provider Selection */}
        <div className="provider-selection">
          <h3>Select Provider</h3>
          <div className="provider-radio-group">
            {getAvailableProviders().map(([providerId, config]) => {
              const status = getProviderStatus(providerId);
              return (
                <div
                  key={providerId}
                  className={`provider-radio-item ${
                    selectedProvider === providerId ? 'selected' : ''
                  } ${status}`}
                  onClick={() => handleProviderSelect(providerId)}
                >
                  <input
                    type="radio"
                    name="provider"
                    value={providerId}
                    checked={selectedProvider === providerId}
                    onChange={() => handleProviderSelect(providerId)}
                  />
                  <div className="provider-info">
                    <span className="provider-name">{config.name}</span>
                    <span className={`status-indicator ${status}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Provider Configuration */}
        {selectedProvider && (
          <div className="provider-configuration">
            <div className="config-header">
              <h3>
                {providers[selectedProvider]?.name || selectedProvider}{' '}
                Configuration
              </h3>
              <button
                className="expand-toggle"
                onClick={() => toggleProviderExpansion(selectedProvider)}
              >
                {expandedProvider === selectedProvider ? '▲' : '▼'}
              </button>
            </div>

            {expandedProvider === selectedProvider && (
              <div className="config-content">
                {renderProviderConfig(
                  selectedProvider,
                  providers[selectedProvider]
                )}

                <div className="model-assignment">
                  <h4>Model Assignment</h4>
                  <div className="agent-model-grid">
                    {Object.values(AgentNameEnum).map((agentName) => (
                      <div key={agentName} className="agent-model-item">
                        <span className="agent-name">{agentName}</span>
                        <select
                          value={
                            agentModels[agentName]?.provider ===
                            selectedProvider
                              ? agentModels[agentName]?.modelName
                              : ''
                          }
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAgentModelChange(agentName, {
                                provider: selectedProvider,
                                modelName: e.target.value,
                              });
                            }
                          }}
                        >
                          <option value="">Select Model</option>
                          {(providers[selectedProvider]?.modelNames || []).map(
                            (model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Custom Provider Section */}
        <div className="custom-provider-section">
          <h3>Custom Provider</h3>
          <button
            className="action-button secondary"
            onClick={handleAddProvider}
          >
            Add Custom OpenAI Provider
          </button>
        </div>
      </div>

      <div className="settings-footer">
        <div className="save-status">
          {isSaving ? 'Saving...' : 'Changes are auto-saved'}
        </div>
        <div className="action-buttons">
          <button className="action-button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="action-button primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save & Close'}
          </button>
        </div>
      </div>
    </div>
  );

  // End of component - all rendering is handled by the unified interface above
}
