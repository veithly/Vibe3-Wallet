import React, { useState } from 'react';
import { Tooltip } from 'antd';
import IconButton from './IconButton';
import type {
  ProviderConfig,
  ProviderValidationResult,
} from '@/background/service/agent/storage/llmProviders';
import { llmProviderStore } from '@/background/service/agent/storage/llmProviders';
import { logger } from '../utils/logger';
import '../styles/ProviderValidator.less';

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
        <div className="provider-validator__status provider-validator__status--warning">
          <Tooltip title="API key required">
            <span className="provider-validator__status-text">
              Key Required
            </span>
          </Tooltip>
        </div>
      );
    }

    return null;
  };

  const containerClassName = ['provider-validator', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClassName}>
      <div className="provider-validator__content">
        <Tooltip title={getTooltipContent()} placement="top">
          <div className="provider-validator__button-wrapper">
            <IconButton
              icon="wifi"
              onClick={handleValidate}
              loading={isValidating}
              validationStatus={getValidationStatus()}
              disabled={!config.apiKey?.trim() && config.type !== 'ollama'}
              size="small"
              tooltip=""
            />
          </div>
        </Tooltip>

        {getStatusIndicator()}

        {config.validated === true &&
          lastResult?.modelList &&
          lastResult.modelList.length > 0 && (
            <div className="provider-validator__models">
              <Tooltip
                title={
                  <div>
                    <div style={{ marginBottom: '4px' }}>Available models:</div>
                    {lastResult.modelList.slice(0, 10).map((model, index) => (
                      <div key={index} style={{ fontSize: '12px' }}>
                        • {model}
                      </div>
                    ))}
                    {lastResult.modelList.length > 10 && (
                      <div style={{ fontSize: '12px', fontStyle: 'italic' }}>
                        ... and {lastResult.modelList.length - 10} more
                      </div>
                    )}
                  </div>
                }
              >
                <span className="provider-validator__model-count">
                  {lastResult.modelList.length} models
                </span>
              </Tooltip>
            </div>
          )}
      </div>
    </div>
  );
};

export default ProviderValidator;
