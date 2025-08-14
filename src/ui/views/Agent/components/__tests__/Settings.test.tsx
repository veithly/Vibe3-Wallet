import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Settings from '../Settings';

// Mock the agent service
const mockAgent = {
  getProviders: jest.fn(),
  getAgentModels: jest.fn(),
  setProvider: jest.fn(),
  setAgentModel: jest.fn(),
  removeProvider: jest.fn(),
};

jest.mock('@/background/service/agent', () => ({
  agent: mockAgent,
}));

// Mock LLM provider store
const mockLlmProviderStore = {
  getBuiltInProviders: jest.fn(),
};

jest.mock('@/background/service/agent/storage/llmProviders', () => ({
  llmProviderStore: mockLlmProviderStore,
}));

// Mock storage types
jest.mock('@/background/service/agent/storage/types', () => ({
  AgentNameEnum: {
    PLANNER: 'planner',
    NAVIGATOR: 'navigator',
    VALIDATOR: 'validator',
  },
  llmProviderModelNames: {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
    anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
    gemini: ['gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  ProviderTypeEnum: {
    OpenAI: 'openai',
    Anthropic: 'anthropic',
    Gemini: 'gemini',
    CustomOpenAI: 'custom_openai',
    AzureOpenAI: 'azure_openai',
  },
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock IconButton and ProviderValidator components
jest.mock('../IconButton', () => {
  return function MockIconButton({ onClick, icon, tooltip }: any) {
    return (
      <button
        onClick={onClick}
        data-testid={`icon-button-${icon}`}
        title={tooltip}
      >
        {icon}
      </button>
    );
  };
});

jest.mock('../ProviderValidator', () => {
  return function MockProviderValidator({
    onValidationComplete,
    providerId,
  }: any) {
    return (
      <button
        data-testid={`validator-${providerId}`}
        onClick={() =>
          onValidationComplete({ isValid: true, timestamp: Date.now() })
        }
      >
        Validate
      </button>
    );
  };
});

describe('Settings Component', () => {
  const mockProps = {
    onClose: jest.fn(),
  };

  const mockBuiltInProviders = {
    openai: {
      name: 'OpenAI',
      type: 'openai',
      apiKey: '',
      modelNames: ['gpt-4o', 'gpt-4o-mini'],
    },
    anthropic: {
      name: 'Anthropic',
      type: 'anthropic',
      apiKey: '',
      modelNames: ['claude-3-5-sonnet-20241022'],
    },
  };

  const mockCustomProviders = {
    custom_openai_123: {
      name: 'Custom Provider',
      type: 'custom_openai',
      apiKey: 'test-key',
      baseUrl: 'https://api.custom.com',
      modelNames: ['custom-model'],
    },
  };

  const mockAgentModels = {
    planner: {
      provider: 'openai',
      modelName: 'gpt-4o',
    },
    navigator: {
      provider: 'anthropic',
      modelName: 'claude-3-5-sonnet-20241022',
    },
    validator: {
      provider: 'openai',
      modelName: 'gpt-4o-mini',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLlmProviderStore.getBuiltInProviders.mockReturnValue(
      mockBuiltInProviders
    );
    mockAgent.getProviders.mockResolvedValue(mockCustomProviders);
    mockAgent.getAgentModels.mockResolvedValue(mockAgentModels);
    mockAgent.setProvider.mockResolvedValue(undefined);
    mockAgent.setAgentModel.mockResolvedValue(undefined);
    mockAgent.removeProvider.mockResolvedValue(undefined);
  });

  describe('Component Loading States', () => {
    it('shows loading state initially', async () => {
      // Delay the promise resolution to test loading state
      const delayedPromise = new Promise((resolve) => setTimeout(resolve, 100));
      mockAgent.getProviders.mockReturnValue(delayedPromise);

      render(<Settings {...mockProps} />);

      expect(screen.getByText('Loading settings...')).toBeInTheDocument();
      expect(screen.getByText('Agent Settings')).toBeInTheDocument();
    });

    it('shows error state when loading fails', async () => {
      mockAgent.getProviders.mockRejectedValue(new Error('Failed to load'));

      render(<Settings {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Settings Not Available')).toBeInTheDocument();
        expect(screen.getByText('Failed to load')).toBeInTheDocument();
      });
    });

    it('loads and displays providers and agent models', async () => {
      render(<Settings {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('LLM Providers')).toBeInTheDocument();
        expect(
          screen.getByText('Agent Model Configuration')
        ).toBeInTheDocument();
      });

      // Check built-in providers are displayed
      expect(screen.getByDisplayValue('OpenAI')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Anthropic')).toBeInTheDocument();

      // Check custom provider is displayed
      expect(screen.getByDisplayValue('Custom Provider')).toBeInTheDocument();
    });
  });

  describe('Provider Management', () => {
    beforeEach(async () => {
      render(<Settings {...mockProps} />);
      await waitFor(() => {
        expect(screen.getByText('LLM Providers')).toBeInTheDocument();
      });
    });

    it('allows editing provider name', async () => {
      const nameInput = screen.getByDisplayValue('Custom Provider');

      fireEvent.change(nameInput, {
        target: { value: 'Updated Provider Name' },
      });

      expect(nameInput).toHaveValue('Updated Provider Name');
    });

    it('allows editing API key', async () => {
      const apiKeyInputs = screen.getAllByPlaceholderText('API Key');
      const customProviderApiKey = apiKeyInputs.find(
        (input) => (input as HTMLInputElement).value === 'test-key'
      );

      if (customProviderApiKey) {
        fireEvent.change(customProviderApiKey, {
          target: { value: 'new-api-key' },
        });
        expect(customProviderApiKey).toHaveValue('new-api-key');
      }
    });

    it('allows editing base URL', async () => {
      const baseUrlInputs = screen.getAllByDisplayValue(
        'https://api.custom.com'
      );
      const baseUrlInput = baseUrlInputs[0];

      fireEvent.change(baseUrlInput, {
        target: { value: 'https://api.updated.com' },
      });
      expect(baseUrlInput).toHaveValue('https://api.updated.com');
    });

    it('adds new custom provider', async () => {
      const addButton = screen.getByText('Add Custom Provider');

      fireEvent.click(addButton);

      // Should add a new provider row
      await waitFor(() => {
        expect(screen.getByText('New Custom Provider')).toBeInTheDocument();
      });
    });

    it('removes custom provider', async () => {
      const removeButton = screen.getByTestId('icon-button-x');

      fireEvent.click(removeButton);

      expect(mockAgent.removeProvider).toHaveBeenCalledWith(
        'custom_openai_123'
      );
    });

    it('validates provider configuration', async () => {
      const validateButton = screen.getByTestId('validator-custom_openai_123');

      fireEvent.click(validateButton);

      // Should update validation status
      await waitFor(() => {
        // Provider should be marked as validated
      });
    });

    it('prevents editing built-in provider configuration', async () => {
      const openAINameInput = screen.getByDisplayValue('OpenAI');

      expect(openAINameInput).toBeDisabled();
    });
  });

  describe('Agent Model Configuration', () => {
    beforeEach(async () => {
      render(<Settings {...mockProps} />);
      await waitFor(() => {
        expect(
          screen.getByText('Agent Model Configuration')
        ).toBeInTheDocument();
      });
    });

    it('displays all agent types', async () => {
      expect(screen.getByText('Planner Agent')).toBeInTheDocument();
      expect(screen.getByText('Navigator Agent')).toBeInTheDocument();
      expect(screen.getByText('Validator Agent')).toBeInTheDocument();
    });

    it('shows current provider selection', async () => {
      const plannerProviderSelect = screen.getAllByDisplayValue('openai')[0];
      expect(plannerProviderSelect).toBeInTheDocument();
    });

    it('allows changing agent provider', async () => {
      const plannerProviderSelect = screen.getAllByDisplayValue('openai')[0];

      fireEvent.change(plannerProviderSelect, {
        target: { value: 'anthropic' },
      });

      expect(plannerProviderSelect).toHaveValue('anthropic');
    });

    it('shows model selection when provider is selected', async () => {
      // Model selects should be visible for configured agents
      const modelSelects = screen.getAllByText('Select Model');
      expect(modelSelects.length).toBeGreaterThan(0);
    });

    it('allows changing agent model', async () => {
      const plannerModelSelect = screen.getAllByDisplayValue('gpt-4o')[0];

      fireEvent.change(plannerModelSelect, {
        target: { value: 'gpt-4o-mini' },
      });

      expect(plannerModelSelect).toHaveValue('gpt-4o-mini');
    });
  });

  describe('Azure OpenAI Configuration', () => {
    const mockAzureProvider = {
      azure_openai_test: {
        name: 'Azure OpenAI',
        type: 'azure_openai',
        apiKey: 'azure-key',
        baseUrl: 'https://test.openai.azure.com',
        azureDeploymentNames: ['gpt-4', 'gpt-35-turbo'],
        azureApiVersion: '2024-02-15-preview',
      },
    };

    beforeEach(async () => {
      mockAgent.getProviders.mockResolvedValue(mockAzureProvider);
      render(<Settings {...mockProps} />);
      await waitFor(() => {
        expect(screen.getByText('LLM Providers')).toBeInTheDocument();
      });
    });

    it('shows Azure-specific fields', async () => {
      expect(screen.getByPlaceholderText('Azure Endpoint')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('Deployment Names (comma-separated)')
      ).toBeInTheDocument();
    });

    it('allows editing Azure deployment names', async () => {
      const deploymentInput = screen.getByDisplayValue('gpt-4,gpt-35-turbo');

      fireEvent.change(deploymentInput, {
        target: { value: 'gpt-4,gpt-35-turbo,gpt-4-32k' },
      });

      expect(deploymentInput).toHaveValue('gpt-4,gpt-35-turbo,gpt-4-32k');
    });
  });

  describe('Save and Cancel Operations', () => {
    beforeEach(async () => {
      render(<Settings {...mockProps} />);
      await waitFor(() => {
        expect(screen.getByText('Agent Settings')).toBeInTheDocument();
      });
    });

    it('saves settings and closes modal', async () => {
      const saveButton = screen.getByText('Save & Close');

      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockAgent.setProvider).toHaveBeenCalled();
        expect(mockAgent.setAgentModel).toHaveBeenCalled();
        expect(mockProps.onClose).toHaveBeenCalled();
      });
    });

    it('cancels without saving', async () => {
      const cancelButton = screen.getByText('Cancel');

      fireEvent.click(cancelButton);

      expect(mockProps.onClose).toHaveBeenCalled();
      expect(mockAgent.setProvider).not.toHaveBeenCalled();
    });

    it('closes from error state', async () => {
      mockAgent.getProviders.mockRejectedValue(new Error('Test error'));

      render(<Settings {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Close')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Close'));
      expect(mockProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('handles save errors gracefully', async () => {
      mockAgent.setProvider.mockRejectedValue(new Error('Save failed'));

      render(<Settings {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByText('Save & Close')).toBeInTheDocument();
      });

      const saveButton = screen.getByText('Save & Close');
      fireEvent.click(saveButton);

      // Should not close modal on save error
      await waitFor(() => {
        expect(mockProps.onClose).not.toHaveBeenCalled();
      });
    });

    it('handles provider removal errors', async () => {
      mockAgent.removeProvider.mockRejectedValue(new Error('Remove failed'));

      render(<Settings {...mockProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('icon-button-x')).toBeInTheDocument();
      });

      const removeButton = screen.getByTestId('icon-button-x');
      fireEvent.click(removeButton);

      // Should still update UI optimistically
      await waitFor(() => {
        expect(mockAgent.removeProvider).toHaveBeenCalled();
      });
    });
  });
});
