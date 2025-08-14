import { createLogger } from '../../../../utils/logger';

const logger = createLogger('AgentStorage');

interface StorageOptions {
  isPersistant?: boolean;
  enableMetrics?: boolean;
  retryAttempts?: number;
}

export interface Storage<T> {
  get(): Promise<T>;
  set(value: T): Promise<void>;
  remove(): Promise<void>;
  getMetrics?(): StorageMetrics;
}

export interface StorageMetrics {
  readCount: number;
  writeCount: number;
  errorCount: number;
  lastReadTime?: number;
  lastWriteTime?: number;
  lastError?: {
    message: string;
    timestamp: number;
    operation: string;
  };
}

export interface StorageWithMetrics<T> extends Storage<T> {
  getMetrics(): StorageMetrics;
}

export function createStorage<T>(
  key: string,
  defaultValue: T,
  options: StorageOptions = {}
): StorageWithMetrics<T> {
  const prefixedKey = `rabby-agent-${key}`;
  const {
    isPersistant = true,
    enableMetrics = true,
    retryAttempts = 3,
  } = options;

  // Metrics tracking
  const metrics: StorageMetrics = {
    readCount: 0,
    writeCount: 0,
    errorCount: 0,
  };

  const updateMetrics = (
    operation: string,
    success: boolean,
    error?: Error
  ): void => {
    if (!enableMetrics) return;

    try {
      if (operation === 'read') {
        metrics.readCount++;
        metrics.lastReadTime = Date.now();
      } else if (operation === 'write') {
        metrics.writeCount++;
        metrics.lastWriteTime = Date.now();
      }

      if (!success) {
        metrics.errorCount++;
        metrics.lastError = {
          message: error?.message || 'Unknown error',
          timestamp: Date.now(),
          operation,
        };
      }

      // Log metrics periodically
      if ((metrics.readCount + metrics.writeCount) % 50 === 0) {
        logger.info('AgentStorage', `Storage metrics for ${key}`, metrics);
      }
    } catch (metricError) {
      logger.warn(
        'AgentStorage',
        'Failed to update storage metrics',
        metricError
      );
    }
  };

  const validateStorageAccess = (): void => {
    if (!chrome.storage) {
      throw new Error('Chrome storage API not available');
    }
    if (!chrome.storage.local || !chrome.storage.session) {
      throw new Error('Chrome storage areas not available');
    }
  };

  const executeWithRetry = async <R>(
    operation: () => Promise<R>,
    operationName: string
  ): Promise<R> => {
    validateStorageAccess();

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const result = await operation();
        updateMetrics(operationName, true);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.warn(
          'AgentStorage',
          `${operationName} attempt ${attempt} failed for ${key}`,
          {
            error: lastError.message,
            attempt,
            maxAttempts: retryAttempts,
          }
        );

        if (attempt < retryAttempts) {
          // Exponential backoff with jitter
          const baseDelay = Math.min(100 * Math.pow(2, attempt - 1), 5000);
          const jitter = Math.random() * 100;
          const delay = baseDelay + jitter;

          logger.debug(
            'AgentStorage',
            `Retrying ${operationName} in ${delay}ms`,
            {
              attempt,
              delay,
            }
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All attempts failed
    updateMetrics(operationName, false, lastError || undefined);
    throw (
      lastError ||
      new Error(`${operationName} failed after ${retryAttempts} attempts`)
    );
  };

  const validateData = (data: T): void => {
    if (data === undefined || data === null) {
      throw new Error(
        `Invalid data for key ${key}: data cannot be null or undefined`
      );
    }

    // Validate data size (Chrome storage has limits)
    try {
      const dataSize = JSON.stringify(data).length;
      if (dataSize > 10 * 1024 * 1024) {
        // 10MB limit
        logger.warn('AgentStorage', `Large data size for key ${key}`, {
          size: dataSize,
          limit: '10MB',
        });
      }
    } catch (error) {
      logger.warn('AgentStorage', 'Failed to validate data size', error);
    }
  };

  return {
    async get(): Promise<T> {
      return executeWithRetry(async () => {
        const storageArea = isPersistant
          ? chrome.storage.local
          : chrome.storage.session;

        const result = await storageArea.get([prefixedKey]);
        const storedValue = result[prefixedKey];

        if (storedValue === undefined) {
          logger.debug(
            'AgentStorage',
            `No value found for key ${key}, using default`
          );
          return defaultValue;
        }

        // Validate stored data structure
        try {
          if (typeof storedValue !== typeof defaultValue) {
            logger.warn('AgentStorage', `Type mismatch for key ${key}`, {
              storedType: typeof storedValue,
              defaultType: typeof defaultValue,
            });
          }
        } catch (validationError) {
          logger.warn(
            'AgentStorage',
            'Failed to validate stored data type',
            validationError
          );
        }

        logger.debug(
          'AgentStorage',
          `Successfully retrieved value for key ${key}`,
          {
            dataType: typeof storedValue,
            hasValue: storedValue !== undefined,
          }
        );

        return storedValue;
      }, 'read');
    },

    async set(value: T): Promise<void> {
      return executeWithRetry(async () => {
        validateData(value);

        const storageArea = isPersistant
          ? chrome.storage.local
          : chrome.storage.session;

        await storageArea.set({ [prefixedKey]: value });

        logger.info('AgentStorage', `Successfully set value for key ${key}`, {
          dataType: typeof value,
          persistent: isPersistant,
        });
      }, 'write');
    },

    async remove(): Promise<void> {
      return executeWithRetry(async () => {
        const storageArea = isPersistant
          ? chrome.storage.local
          : chrome.storage.session;

        await storageArea.remove([prefixedKey]);

        logger.info(
          'AgentStorage',
          `Successfully removed value for key ${key}`,
          {
            persistent: isPersistant,
          }
        );
      }, 'remove');
    },

    getMetrics(): StorageMetrics {
      return { ...metrics };
    },
  };
}

/**
 * Utility function to clear all agent-related storage data
 */
export async function clearAgentStorage(): Promise<void> {
  try {
    logger.info('AgentStorage', 'Clearing all agent storage data');

    // Get all keys with rabby-agent prefix
    const result = await new Promise<Record<string, any>>((resolve) => {
      chrome.storage.local.get(null, resolve);
    });
    const agentKeys = Object.keys(result).filter((key) =>
      key.startsWith('rabby-agent-')
    );

    if (agentKeys.length > 0) {
      await chrome.storage.local.remove(agentKeys);
      logger.info(
        'AgentStorage',
        `Cleared ${agentKeys.length} agent storage keys`,
        {
          keys: agentKeys,
        }
      );
    } else {
      logger.info('AgentStorage', 'No agent storage keys found to clear');
    }
  } catch (error) {
    logger.error('AgentStorage', 'Failed to clear agent storage', error);
    throw error;
  }
}

/**
 * Utility function to get storage usage statistics
 */
export async function getStorageUsage(): Promise<{
  localBytes: number;
  sessionBytes: number;
  localQuotaBytes?: number;
  sessionQuotaBytes?: number;
  agentKeys: string[];
  agentBytes: number;
}> {
  try {
    const [localInfo, sessionInfo, localData] = await Promise.all([
      chrome.storage.local.getBytesInUse(),
      chrome.storage.session.getBytesInUse(),
      new Promise<Record<string, any>>((resolve) => {
        chrome.storage.local.get(null, resolve);
      }),
    ]);

    // Calculate agent-specific usage
    const agentKeys = Object.keys(localData).filter((key) =>
      key.startsWith('rabby-agent-')
    );
    const agentData = agentKeys.reduce((acc, key) => {
      acc[key] = localData[key];
      return acc;
    }, {} as Record<string, any>);

    const agentBytes = JSON.stringify(agentData).length;

    // Get quota information if available
    let localQuotaBytes: number | undefined;
    let sessionQuotaBytes: number | undefined;

    try {
      if ('getLocalQuota' in chrome.storage.local) {
        localQuotaBytes = await (chrome.storage.local as any).getLocalQuota();
      }
      if ('getSessionQuota' in chrome.storage.session) {
        sessionQuotaBytes = await (chrome.storage
          .session as any).getSessionQuota();
      }
    } catch (quotaError) {
      logger.debug(
        'AgentStorage',
        'Quota information not available',
        quotaError
      );
    }

    return {
      localBytes: localInfo,
      sessionBytes: sessionInfo,
      localQuotaBytes,
      sessionQuotaBytes,
      agentKeys,
      agentBytes,
    };
  } catch (error) {
    logger.error('AgentStorage', 'Failed to get storage usage', error);
    throw error;
  }
}
