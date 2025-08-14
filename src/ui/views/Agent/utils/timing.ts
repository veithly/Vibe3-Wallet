/**
 * Timing utilities for Agent sidebar
 *
 * Centralizes all timing-related constants and utilities to reduce magic numbers
 * and provide consistent timing behavior across the Agent sidebar components.
 */

import { logger } from './logger';

// Timing constants with clear naming and purpose
export const TIMING_CONSTANTS = {
  // DOM and component mounting delays
  DOM_READY_DELAY: 50, // Wait for DOM to be fully ready
  COMPONENT_MOUNT_DELAY: 20, // Allow React mounting to complete
  POST_RENDER_VERIFICATION: 100, // Verify rendering completion

  // Connection and network timeouts
  CONNECTION_TIMEOUT: 8000, // Maximum time to wait for connection
  CONNECTION_CHECK_INTERVAL: 200, // How often to check connection status
  RECONNECTION_BASE_DELAY: 1500, // Base delay for exponential backoff
  HEARTBEAT_INTERVAL: 30000, // Heartbeat every 30 seconds
  RECONNECT_TIMEOUT: 3000, // Time to wait for reconnection

  // UI interaction delays
  BUTTON_VERIFICATION_DELAY: 50, // Verify button handlers are attached
  SCROLL_DELAY: 0, // Minimal delay for smooth scrolling

  // Retry and error handling
  MAX_RETRIES: 3, // Maximum connection retry attempts
  INITIALIZATION_DELAY: 100, // Allow extension context to initialize
} as const;

/**
 * Utility for consistent delay implementation with logging
 */
export class DelayUtil {
  private static readonly COMPONENT_NAME = 'DelayUtil';

  /**
   * Create a promise that resolves after the specified delay
   */
  static async wait(delay: number, reason?: string): Promise<void> {
    if (reason) {
      logger.debug(
        DelayUtil.COMPONENT_NAME,
        `Waiting ${delay}ms for: ${reason}`,
        { delay, reason }
      );
    }
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Retry an operation with exponential backoff
   */
  static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = TIMING_CONSTANTS.MAX_RETRIES,
    baseDelay: number = TIMING_CONSTANTS.RECONNECTION_BASE_DELAY,
    operationName?: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          logger.error(
            DelayUtil.COMPONENT_NAME,
            `${
              operationName || 'Operation'
            } failed after ${maxRetries} attempts`,
            {
              error: lastError.message,
              attempts: maxRetries,
            }
          );
          throw lastError;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn(
          DelayUtil.COMPONENT_NAME,
          `${operationName || 'Operation'} failed, retrying`,
          {
            attempt,
            maxRetries,
            delay,
            error: lastError.message,
          }
        );

        await DelayUtil.wait(delay, `retry attempt ${attempt}/${maxRetries}`);
      }
    }

    throw lastError!;
  }

  /**
   * Wait until a condition is met, with timeout
   */
  static async waitUntil(
    condition: () => boolean,
    timeout: number = TIMING_CONSTANTS.CONNECTION_TIMEOUT,
    checkInterval: number = TIMING_CONSTANTS.CONNECTION_CHECK_INTERVAL,
    conditionName?: string
  ): Promise<void> {
    const startTime = Date.now();
    const timeoutName = conditionName || 'condition';

    logger.debug(DelayUtil.COMPONENT_NAME, `Waiting for ${timeoutName}`, {
      timeout,
      checkInterval,
    });

    while (!condition() && Date.now() - startTime < timeout) {
      await DelayUtil.wait(checkInterval, `checking ${timeoutName}`);
    }

    if (!condition()) {
      const errorMsg = `Timeout waiting for ${timeoutName} after ${timeout}ms`;
      logger.error(DelayUtil.COMPONENT_NAME, errorMsg);
      throw new Error(errorMsg);
    }

    logger.debug(
      DelayUtil.COMPONENT_NAME,
      `${timeoutName} satisfied after ${Date.now() - startTime}ms`
    );
  }
}

/**
 * Initialization helper that manages component mounting timing
 */
export class InitializationManager {
  private static readonly COMPONENT_NAME = 'InitializationManager';
  private static isInitializing = false;

  /**
   * Handle DOM ready state checking with consistent delays
   */
  static async ensureDOMReady(): Promise<void> {
    logger.debug(
      InitializationManager.COMPONENT_NAME,
      'Checking DOM ready state',
      {
        readyState: document.readyState,
        timestamp: Date.now(),
      }
    );

    switch (document.readyState) {
      case 'loading':
        logger.info(
          InitializationManager.COMPONENT_NAME,
          'DOM still loading, waiting for DOMContentLoaded'
        );
        await new Promise<void>((resolve) => {
          const onReady = () => {
            logger.info(
              InitializationManager.COMPONENT_NAME,
              'DOMContentLoaded event fired'
            );
            document.removeEventListener('DOMContentLoaded', onReady);
            resolve();
          };
          document.addEventListener('DOMContentLoaded', onReady);
        });
      // Fall through to wait for completion

      case 'interactive':
        logger.info(
          InitializationManager.COMPONENT_NAME,
          'DOM interactive, waiting for complete state'
        );
        await DelayUtil.wait(
          TIMING_CONSTANTS.DOM_READY_DELAY,
          'DOM to become fully ready'
        );
        break;

      case 'complete':
        logger.debug(
          InitializationManager.COMPONENT_NAME,
          'DOM already complete'
        );
        break;
    }
  }

  /**
   * Initialize component with proper timing and error handling
   */
  static async initializeComponent<T>(
    componentName: string,
    initFunction: () => Promise<T> | T,
    options: {
      allowConcurrent?: boolean;
      preInitDelay?: number;
      postInitDelay?: number;
    } = {}
  ): Promise<T> {
    const {
      allowConcurrent = false,
      preInitDelay = TIMING_CONSTANTS.INITIALIZATION_DELAY,
      postInitDelay = TIMING_CONSTANTS.COMPONENT_MOUNT_DELAY,
    } = options;

    // Prevent concurrent initialization unless explicitly allowed
    if (!allowConcurrent && InitializationManager.isInitializing) {
      throw new Error(`${componentName} initialization already in progress`);
    }

    InitializationManager.isInitializing = true;

    try {
      logger.info(
        InitializationManager.COMPONENT_NAME,
        `Starting ${componentName} initialization`,
        {
          componentName,
          preInitDelay,
          postInitDelay,
        }
      );

      // Ensure proper environment
      await InitializationManager.ensureDOMReady();

      // Pre-initialization delay
      if (preInitDelay > 0) {
        await DelayUtil.wait(
          preInitDelay,
          `${componentName} pre-initialization`
        );
      }

      // Run the actual initialization
      const result = await initFunction();

      // Post-initialization delay
      if (postInitDelay > 0) {
        await DelayUtil.wait(
          postInitDelay,
          `${componentName} post-initialization`
        );
      }

      logger.info(
        InitializationManager.COMPONENT_NAME,
        `${componentName} initialization completed successfully`
      );
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        InitializationManager.COMPONENT_NAME,
        `${componentName} initialization failed`,
        {
          error: errorMessage,
        }
      );
      throw error;
    } finally {
      InitializationManager.isInitializing = false;
    }
  }
}
