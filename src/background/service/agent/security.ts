// Web3Agent Security Configuration
// This file contains all security-related settings and validations

export interface SecurityConfig {
  // API Security
  apiKeys: {
    openai?: string;
    anthropic?: string;
    gemini?: string;
    groq?: string;
    openrouter?: string;
    etherscan?: string;
    coingecko?: string;
    inch?: string;
  };

  // Rate Limiting
  rateLimits: {
    requestsPerMinute: number;
    burst: number;
    windowMs: number;
  };

  // Transaction Security
  transactions: {
    maxValueEth: number;
    maxSlippagePercentage: number;
    requireConfirmationForHighValue: boolean;
    blockedContractAddresses: string[];
    highRiskNetworks: number[];
  };

  // Data Privacy
  privacy: {
    logSensitiveData: boolean;
    encryptLocalStorage: boolean;
    maskWalletAddresses: boolean;
    dataRetentionDays: number;
  };

  // Network Security
  networks: {
    defaultChainId: number;
    supportedChainIds: number[];
    timeouts: {
      network: number;
      blockConfirmation: number;
      transaction: number;
    };
  };

  // Contract Security
  contracts: {
    enableVerification: boolean;
    maxGasLimit: string;
    riskCheckTimeout: number;
    trustedContracts: string[];
    highRiskPatterns: RegExp[];
  };

  // Authentication & Authorization
  auth: {
    requireWalletConnection: boolean;
    sessionTimeout: number;
    maxConcurrentSessions: number;
  };

  // Input Validation
  validation: {
    maxInputLength: number;
    allowedContentTypes: string[];
    blockedPatterns: RegExp[];
    sanitizeHtml: boolean;
  };

  // Error Handling
  errors: {
    maxRetries: number;
    retryDelay: number;
    circuitBreakerThreshold: number;
    exposeErrorDetails: boolean;
  };
}

// Production Security Configuration
export const PRODUCTION_SECURITY_CONFIG: SecurityConfig = {
  apiKeys: {
    // API keys should be loaded from environment variables
  },

  rateLimits: {
    requestsPerMinute: 60,
    burst: 10,
    windowMs: 60 * 1000, // 1 minute
  },

  transactions: {
    maxValueEth: 10, // Maximum 10 ETH per transaction
    maxSlippagePercentage: 5.0, // Maximum 5% slippage
    requireConfirmationForHighValue: true,
    blockedContractAddresses: [
      // Known malicious contracts (example addresses)
      '0x0000000000000000000000000000000000000000',
    ],
    highRiskNetworks: [
      // Networks with higher risk
      97, // BSC Testnet
      4002, // Fantom Testnet
    ],
  },

  privacy: {
    logSensitiveData: false,
    encryptLocalStorage: true,
    maskWalletAddresses: true,
    dataRetentionDays: 30,
  },

  networks: {
    defaultChainId: 1, // Ethereum Mainnet
    supportedChainIds: [
      1, // Ethereum Mainnet
      56, // BSC Mainnet
      137, // Polygon Mainnet
      43114, // Fuse Mainnet
      8453, // Base Mainnet
      42161, // Arbitrum One
    ],
    timeouts: {
      network: 30000,
      blockConfirmation: 300000,
      transaction: 60000,
    },
  },

  contracts: {
    enableVerification: true,
    maxGasLimit: '5000000',
    riskCheckTimeout: 5000,
    trustedContracts: [
      // Known trusted contracts (example addresses)
      '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap V2 Router
    ],
    highRiskPatterns: [
      // Patterns that indicate high-risk contracts
      /0x[0-9a-f]{40}\s*malicious/i,
      /honeypot/i,
      /drain/i,
    ],
  },

  auth: {
    requireWalletConnection: true,
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
    maxConcurrentSessions: 3,
  },

  validation: {
    maxInputLength: 10000,
    allowedContentTypes: [
      'application/json',
      'text/plain',
      'application/x-www-form-urlencoded',
    ],
    blockedPatterns: [
      // Block potentially malicious patterns
      /<script/i,
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
    ],
    sanitizeHtml: true,
  },

  errors: {
    maxRetries: 3,
    retryDelay: 1000,
    circuitBreakerThreshold: 5,
    exposeErrorDetails: false,
  },
};

// Development Security Configuration (more permissive)
export const DEVELOPMENT_SECURITY_CONFIG: SecurityConfig = {
  ...PRODUCTION_SECURITY_CONFIG,
  rateLimits: {
    requestsPerMinute: 120,
    burst: 20,
    windowMs: 60 * 1000,
  },
  transactions: {
    maxValueEth: 1, // Lower limit for development
    maxSlippagePercentage: 10.0, // Higher slippage for testing
    requireConfirmationForHighValue: false,
    blockedContractAddresses: [],
    highRiskNetworks: [],
  },
  privacy: {
    logSensitiveData: true, // Log more data for development
    encryptLocalStorage: false,
    maskWalletAddresses: false,
    dataRetentionDays: 7,
  },
  errors: {
    maxRetries: 5,
    retryDelay: 500,
    circuitBreakerThreshold: 10,
    exposeErrorDetails: true, // Show error details for debugging
  },
};

// Security Validator Class
export class SecurityValidator {
  private config: SecurityConfig;

  constructor(config: SecurityConfig = PRODUCTION_SECURITY_CONFIG) {
    this.config = config;
  }

  // Validate API Key
  validateApiKey(provider: string, apiKey: string): boolean {
    if (!apiKey || apiKey.trim() === '') {
      return false;
    }

    // Basic API key format validation
    const patterns = {
      openai: /^sk-[a-zA-Z0-9]{48,}$/,
      anthropic: /^sk-ant-[a-zA-Z0-9]{90,}$/,
      gemini: /^[a-zA-Z0-9_-]{39}$/,
      groq: /^gsk_[a-zA-Z0-9]{52}$/,
      openrouter: /^sk-or-[a-zA-Z0-9]{87}$/,
    };

    const pattern = patterns[provider as keyof typeof patterns];
    if (pattern && !pattern.test(apiKey)) {
      return false;
    }

    return true;
  }

  // Validate Wallet Address
  validateWalletAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  // Validate Transaction Parameters
  validateTransactionParams(params: {
    to?: string;
    value?: string;
    data?: string;
    chainId?: string | number;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate recipient address
    if (params.to && !this.validateWalletAddress(params.to)) {
      errors.push('Invalid recipient address');
    }

    // Validate value
    if (params.value) {
      try {
        const valueWei = BigInt(params.value);
        const valueEth = Number(valueWei) / 1e18;

        if (valueEth > this.config.transactions.maxValueEth) {
          errors.push(
            `Transaction value exceeds maximum of ${this.config.transactions.maxValueEth} ETH`
          );
        }

        if (valueEth <= 0) {
          errors.push('Transaction value must be positive');
        }
      } catch (error) {
        errors.push('Invalid transaction value format');
      }
    }

    // Validate chain ID
    if (params.chainId) {
      const chainId =
        typeof params.chainId === 'string'
          ? parseInt(params.chainId)
          : params.chainId;

      if (!this.config.networks.supportedChainIds.includes(chainId)) {
        errors.push(`Unsupported chain ID: ${chainId}`);
      }
    }

    // Validate transaction data
    if (params.data && !/^0x[0-9a-fA-F]*$/.test(params.data)) {
      errors.push('Invalid transaction data format');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Validate Input for Security
  validateInput(
    input: string,
    type: 'text' | 'json' | 'html' = 'text'
  ): { valid: boolean; sanitized: string; errors: string[] } {
    const errors: string[] = [];
    let sanitized = input;

    // Check length
    if (input.length > this.config.validation.maxInputLength) {
      errors.push(
        `Input exceeds maximum length of ${this.config.validation.maxInputLength} characters`
      );
      sanitized = sanitized.substring(0, this.config.validation.maxInputLength);
    }

    // Check for blocked patterns
    for (const pattern of this.config.validation.blockedPatterns) {
      if (pattern.test(input)) {
        errors.push(`Input contains blocked pattern: ${pattern}`);
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      }
    }

    // Sanitize HTML if required
    if (type === 'html' && this.config.validation.sanitizeHtml) {
      sanitized = this.sanitizeHtml(sanitized);
    }

    return {
      valid: errors.length === 0,
      sanitized,
      errors,
    };
  }

  // Validate Contract Address
  validateContractAddress(
    address: string
  ): { valid: boolean; risk: 'low' | 'medium' | 'high'; warnings: string[] } {
    const warnings: string[] = [];
    let risk: 'low' | 'medium' | 'high' = 'low';

    if (!this.validateWalletAddress(address)) {
      return {
        valid: false,
        risk: 'high',
        warnings: ['Invalid contract address format'],
      };
    }

    // Check against blocked contracts
    if (
      this.config.transactions.blockedContractAddresses.includes(
        address.toLowerCase()
      )
    ) {
      warnings.push('Contract address is blocked for security reasons');
      risk = 'high';
    }

    // Check against high-risk patterns
    for (const pattern of this.config.contracts.highRiskPatterns) {
      if (pattern.test(address)) {
        warnings.push('Contract address matches high-risk pattern');
        risk = 'high';
      }
    }

    // Check if contract is trusted
    if (
      this.config.contracts.trustedContracts.includes(address.toLowerCase())
    ) {
      risk = 'low';
    }

    return {
      valid: true,
      risk,
      warnings,
    };
  }

  // Rate Limiting Check
  checkRateLimit(
    identifier: string,
    timestamp: number
  ): { allowed: boolean; resetTime: number } {
    // This would be implemented with a proper rate limiting store
    // For now, return basic structure
    return {
      allowed: true,
      resetTime: timestamp + this.config.rateLimits.windowMs,
    };
  }

  // HTML Sanitization
  private sanitizeHtml(html: string): string {
    // Basic HTML sanitization - in production, use a proper library like DOMPurify
    return html
      .replace(
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        '[REDACTED]'
      )
      .replace(/javascript:/gi, '[REDACTED]')
      .replace(/on\w+\s*=/gi, '[REDACTED]')
      .replace(
        /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
        '[REDACTED]'
      );
  }

  // Mask sensitive data for logging
  maskSensitiveData(data: any): any {
    if (!this.config.privacy.maskWalletAddresses) {
      return data;
    }

    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const masked = { ...data };

    // Mask wallet addresses
    Object.keys(masked).forEach((key) => {
      if (
        typeof masked[key] === 'string' &&
        /^0x[a-fA-F0-9]{40}$/.test(masked[key])
      ) {
        masked[key] = `${masked[key].substring(0, 6)}...${masked[key].substring(
          38
        )}`;
      }
    });

    return masked;
  }

  // Get security configuration
  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  // Update security configuration
  updateConfig(updates: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Global security validator instance
export const securityValidator = new SecurityValidator();

// Environment-based configuration selector
export function getSecurityConfig(): SecurityConfig {
  if (process.env.NODE_ENV === 'development') {
    return DEVELOPMENT_SECURITY_CONFIG;
  }
  return PRODUCTION_SECURITY_CONFIG;
}

// Security middleware factory
export function createSecurityMiddleware(
  config: SecurityConfig = getSecurityConfig()
) {
  return {
    validateApiKey: (provider: string, apiKey: string) =>
      securityValidator.validateApiKey(provider, apiKey),

    validateTransaction: (params: any) =>
      securityValidator.validateTransactionParams(params),

    validateInput: (input: string, type?: 'text' | 'json' | 'html') =>
      securityValidator.validateInput(input, type),

    validateContract: (address: string) =>
      securityValidator.validateContractAddress(address),

    checkRateLimit: (identifier: string, timestamp: number) =>
      securityValidator.checkRateLimit(identifier, timestamp),

    maskData: (data: any) => securityValidator.maskSensitiveData(data),
  };
}
