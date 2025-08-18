import React, { useState } from 'react';
import { Tooltip } from 'antd';
import IconButton from './IconButton';
import type {
  ProviderConfig,
  ProviderValidationResult,
} from '@/background/service/agent/storage/llmProviders';
import { llmProviderStore } from '@/background/service/agent/storage/llmProviders';
import { logger } from '../utils/logger';

interface ProviderValidatorProps {
  providerId: string;
  config: ProviderConfig;
  onValidationComplete?: (result: ProviderValidationResult) => void;
  className?: string;
}

const ProviderValidator: React.FC<ProviderValidatorProps> = ({
  providerId,
  config,
  onValidationComplete,
  className = '',
}) => {
  const [isValidating, setIsValidating] = useState(false);
  const [lastResult, setLastResult] = useState<ProviderValidationResult | null>(
    null
  );

  const handleValidate = async () => {
    if (isValidating) return;

    setIsValidating(true);
    try {
      logger.info('ProviderValidator', 'Starting validation', { providerId });
      const result = await llmProviderStore.validateProvider(providerId);

      setLastResult(result);
      onValidationComplete?.(result);

      logger.info('ProviderValidator', 'Validation completed', {
        providerId,
        isValid: result.isValid,
        responseTime: result.responseTime,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('ProviderValidator', 'Validation failed', {
        providerId,
        error: errorMessage,
      });

      const errorResult: ProviderValidationResult = {
        isValid: false,
        error: errorMessage,
        timestamp: Date.now(),
      };

      setLastResult(errorResult);
      onValidationComplete?.(errorResult);
    } finally {
      setIsValidating(false);
    }
  };

  const getValidationStatus = () => {
    if (isValidating) return 'pending';
    if (config.validated === true) return 'valid';
    if (config.validated === false) return 'invalid';
    return undefined;
  };

  const getTooltipContent = () => {
    if (isValidating) {
      return 'Testing connection...';
    }

    if (config.validated === true && config.lastValidated) {
      const validatedAt = new Date(config.lastValidated).toLocaleString();
      const responseTime = lastResult?.responseTime
        ? ` (${lastResult.responseTime}ms)`
        : '';
      return `✅ Connected successfully${responseTime}\nLast validated: ${validatedAt}`;
    }

    if (config.validated === false) {
      const error =
        config.validationError || lastResult?.error || 'Connection failed';
      const validatedAt = config.lastValidated
        ? new Date(config.lastValidated).toLocaleString()
        : 'Never';
      return `❌ ${error}\nLast attempted: ${validatedAt}`;
    }

    return 'Click to test connection';
  };

  const getStatusIndicator = () => {
    const status = getValidationStatus();

    if (!status && !config.apiKey?.trim() && config.type !== 'ollama') {
      return (
        <div className="px-1.5 py-0.5 rounded text-[10px] font-medium inline-block whitespace-nowrap bg-yellow-50 border border-yellow-200 text-yellow-600 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-400">
          <Tooltip title="API key required">
            <span className="text-xs">
              Key Required
            </span>
          </Tooltip>
        </div>
      );
    }

    return null;
  };

  return (
    <div className={`flex items-center ${className}`}>
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center">
          <IconButton
            icon="wifi"
            onClick={handleValidate}
            loading={isValidating}
            validationStatus={getValidationStatus()}
            disabled={!config.apiKey?.trim() && config.type !== 'ollama'}
            size="small"
            tooltip={getTooltipContent()}
          />
        </div>

        {getStatusIndicator()}

        {config.validated === true && lastResult?.modelList && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <span className="">{lastResult.modelList.length} models detected</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProviderValidator;
