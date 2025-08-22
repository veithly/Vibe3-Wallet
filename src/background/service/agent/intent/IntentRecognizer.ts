// Intent recognition system for Web3 commands
import { BaseMessage } from '@langchain/core/messages';

export interface Web3Intent {
  action: Web3ActionType;
  entities: Web3Entities;
  chains: number[];
  protocols: string[];
  constraints: Web3Constraints;
  confidence: number;
  rawInstruction: string;
}

export type Web3ActionType =
  | 'SWAP'
  | 'BRIDGE'
  | 'STAKE'
  | 'UNSTAKE'
  | 'APPROVE'
  | 'SEND'
  | 'RECEIVE'
  | 'BUY'
  | 'SELL'
  | 'ADD_LIQUIDITY'
  | 'REMOVE_LIQUIDITY'
  | 'CLAIM_REWARDS'
  | 'VOTE'
  | 'DEPLOY'
  | 'INTERACT'
  | 'QUERY'
  | 'CONNECT_WALLET'
  | 'SWITCH_NETWORK'
  | 'SIGN_MESSAGE'
  | 'SIGN_TYPED_DATA'
  // Browser automation actions
  | 'NAVIGATE'
  | 'CLICK'
  | 'FILL_FORM'
  | 'SCROLL'
  | 'SCREENSHOT'
  | 'WAIT'
  | 'HOVER'
  | 'UPLOAD'
  | 'EXECUTE_JS'
  | 'SWITCH_TAB'
  | 'OPEN_TAB'
  | 'CLOSE_TAB'
  // Multi-agent coordination actions
  | 'CREATE_PLAN'
  | 'VALIDATE_TASK'
  | 'COORDINATE_AGENTS'
  | 'ANALYZE_TASK'
  | 'OPTIMIZE_EXECUTION';

export interface Web3Entities {
  fromToken?: string;
  toToken?: string;
  amount?: string;
  recipient?: string;
  contract?: string;
  nftId?: string;
  tokenAddress?: string;
  spender?: string;
  stakingContract?: string;
  poolId?: string;
  governanceContract?: string;
  proposalId?: string;
  address?: string;
  chainId?: number;
  fromChainId?: number;
  toChainId?: number;
  dappName?: string;
  dappUrl?: string;
  message?: string;
  domain?: Record<string, any>;
  types?: Record<string, any>;
  value?: Record<string, any>;
  tokenA?: string;
  tokenB?: string;
  amountA?: string;
  amountB?: string;
  // Browser automation entities
  url?: string;
  selector?: string;
  text?: string;
  element?: string;
  direction?: string;
  condition?: string;
  fields?: Array<{name?: string; selector?: string; value: string; type?: string}>;
  submit?: boolean;
  type?: string;
  timeout?: number;
  code?: string;
  fileContent?: string;
  fileName?: string;
  // Multi-agent coordination entities
  task?: string;
  complexity?: 'simple' | 'medium' | 'complex';
  strategy?: string;
  planName?: string;
  expectedOutcome?: string;
  validationMethod?: string;
  agents?: string[];
  optimization?: string;
}

export interface Web3Constraints {
  slippage?: number;
  deadline?: number;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  minAmountOut?: string;
  maxAmountIn?: string;
  preference?: 'FASTEST' | 'CHEAPEST' | 'BEST_RATE';
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface IntentPattern {
  action: Web3ActionType;
  patterns: RegExp[];
  requiredEntities: (keyof Web3Entities)[];
  optionalEntities: (keyof Web3Entities)[];
  weight: number;
}

export class IntentRecognizer {
  private patterns: IntentPattern[];
  private chainMap: Map<string, number>;
  private tokenMap: Map<string, string>;

  constructor() {
    this.patterns = this.initializePatterns();
    this.chainMap = this.initializeChainMap();
    this.tokenMap = this.initializeTokenMap();
  }

  private initializePatterns(): IntentPattern[] {
    return [
      // Swap actions
      {
        action: 'SWAP',
        patterns: [
          /swap\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)\s+to\s+([A-Za-z0-9]+)/i,
          /exchange\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)\s+for\s+([A-Za-z0-9]+)/i,
          /转换\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)\s+到\s+([A-Za-z0-9]+)/i,
          /将\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)\s+兑换为\s+([A-Za-z0-9]+)/i,
        ],
        requiredEntities: ['fromToken', 'toToken', 'amount'],
        optionalEntities: ['chainId'],
        weight: 1.0,
      },
      // Bridge actions
      {
        action: 'BRIDGE',
        patterns: [
          /bridge\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)\s+from\s+([A-Za-z]+)\s+to\s+([A-Za-z]+)/i,
          /跨链\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)\s+从\s+([A-Za-z]+)\s+到\s+([A-Za-z]+)/i,
          /transfer\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)\s+to\s+([A-Za-z]+)\s+chain/i,
        ],
        requiredEntities: ['amount', 'tokenAddress'],
        optionalEntities: ['chainId', 'recipient'],
        weight: 1.0,
      },
      // Stake actions
      {
        action: 'STAKE',
        patterns: [
          /stake\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)/i,
          /质押\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)/i,
          /farm\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)/i,
        ],
        requiredEntities: ['amount', 'tokenAddress'],
        optionalEntities: ['stakingContract', 'chainId'],
        weight: 0.9,
      },
      // Send actions
      {
        action: 'SEND',
        patterns: [
          /send\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)\s+to\s+(0x[a-fA-F0-9]{40})/i,
          /转账\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)\s+到\s+(0x[a-fA-F0-9]{40})/i,
          /transfer\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)\s+to\s+(0x[a-fA-F0-9]{40})/i,
        ],
        requiredEntities: ['amount', 'tokenAddress', 'recipient'],
        optionalEntities: ['chainId'],
        weight: 1.0,
      },
      // Approve actions
      {
        action: 'APPROVE',
        patterns: [
          /approve\s+([A-Za-z0-9]+)\s+for\s+(0x[a-fA-F0-9]{40})/i,
          /授权\s+([A-Za-z0-9]+)\s+给\s+(0x[a-fA-F0-9]{40})/i,
          /allow\s+(0x[a-fA-F0-9]{40})\s+to\s+spend\s+([A-Za-z0-9]+)/i,
        ],
        requiredEntities: ['tokenAddress', 'spender'],
        optionalEntities: ['amount', 'chainId'],
        weight: 0.9,
      },
      // Add liquidity
      {
        action: 'ADD_LIQUIDITY',
        patterns: [
          /add\s+liquidity\s+with\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)\s+and\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)/i,
          /添加\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)\s+和\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9]+)\s+流动性/i,
        ],
        requiredEntities: ['tokenAddress', 'amount'],
        optionalEntities: ['chainId'],
        weight: 0.8,
      },
      // Query actions
      {
        action: 'QUERY',
        patterns: [
          /what\s+is\s+my\s+([A-Za-z0-9]+)\s+balance/i,
          /check\s+([A-Za-z0-9]+)\s+balance/i,
          /查询\s+([A-Za-z0-9]+)\s+余额/i,
          /我的\s+([A-Za-z0-9]+)\s+余额是多少/i,
        ],
        requiredEntities: ['tokenAddress'],
        optionalEntities: ['address', 'chainId'],
        weight: 0.7,
      },
      // Connect wallet
      {
        action: 'CONNECT_WALLET',
        patterns: [
          /connect\s+wallet\s+to\s+([A-Za-z0-9]+)/i,
          /连接钱包到\s+([A-Za-z0-9]+)/i,
        ],
        requiredEntities: ['dappName'],
        optionalEntities: ['dappUrl', 'chainId'],
        weight: 0.8,
      },
      // Switch network
      {
        action: 'SWITCH_NETWORK',
        patterns: [
          /switch\s+to\s+([A-Za-z]+)/i,
          /切换到\s+([A-Za-z]+)/i,
          /change\s+network\s+to\s+([A-Za-z]+)/i,
        ],
        requiredEntities: ['chainId'],
        optionalEntities: [],
        weight: 0.9,
      },
      // Browser automation actions
      {
        action: 'NAVIGATE',
        patterns: [
          /go\s+to\s+(https?:\/\/[^\s]+)/i,
          /navigate\s+to\s+(https?:\/\/[^\s]+)/i,
          /open\s+(https?:\/\/[^\s]+)/i,
          /访问\s+(https?:\/\/[^\s]+)/i,
          /打开\s+(https?:\/\/[^\s]+)/i,
        ],
        requiredEntities: ['url'],
        optionalEntities: ['timeout'],
        weight: 0.95,
      },
      {
        action: 'CLICK',
        patterns: [
          /click\s+(?:on\s+)?(?:the\s+)?([A-Za-z0-9\s_\-]+)/i,
          /点击\s+([A-Za-z0-9\s_\-]+)/i,
          /press\s+(?:the\s+)?([A-Za-z0-9\s_\-]+)\s+button/i,
          /按一下\s+([A-Za-z0-9\s_\-]+)/i,
        ],
        requiredEntities: ['element'],
        optionalEntities: ['selector', 'text'],
        weight: 0.9,
      },
      {
        action: 'FILL_FORM',
        patterns: [
          /fill\s+(?:out\s+)?(?:the\s+)?form\s+with\s+(.+)/i,
          /填写\s+表单\s+(.+)/i,
          /enter\s+(.+)\s+into\s+(?:the\s+)?form/i,
          /将\s+(.+)\s+输入表单/i,
        ],
        requiredEntities: ['fields'],
        optionalEntities: ['submit'],
        weight: 0.85,
      },
      {
        action: 'SCREENSHOT',
        patterns: [
          /take\s+a\s+screenshot/i,
          /screenshot\s+(?:the\s+)?page/i,
          /capture\s+(?:the\s+)?screen/i,
          /截图/i,
          /屏幕截图/i,
        ],
        requiredEntities: [],
        optionalEntities: ['selector'],
        weight: 0.95,
      },
      {
        action: 'WAIT',
        patterns: [
          /wait\s+(?:for\s+)?(.+)/i,
          /等待\s+(.+)/i,
          /pause\s+(?:for\s+)?(.+)/i,
          /暂停\s+(.+)/i,
        ],
        requiredEntities: ['condition'],
        optionalEntities: ['timeout'],
        weight: 0.9,
      },
      {
        action: 'SCROLL',
        patterns: [
          /scroll\s+(up|down|top|bottom)/i,
          /滚动\s+(向上|向下|顶部|底部)/i,
          /scroll\s+to\s+(.+)/i,
          /滚动到\s+(.+)/i,
        ],
        requiredEntities: ['direction'],
        optionalEntities: ['selector'],
        weight: 0.9,
      },
      // Multi-agent coordination actions
      {
        action: 'CREATE_PLAN',
        patterns: [
          /create\s+(?:a\s+)?(?:execution\s+)?plan\s+for\s+(.+)/i,
          /plan\s+(?:how\s+to\s+)?(.+)/i,
          /create\s+a\s+strategy\s+for\s+(.+)/i,
          /制定\s+(.+)/i,
          /规划\s+(.+)/i,
        ],
        requiredEntities: ['task'],
        optionalEntities: ['complexity', 'strategy'],
        weight: 0.85,
      },
      {
        action: 'VALIDATE_TASK',
        patterns: [
          /validate\s+(?:the\s+)?(?:task\s+)?completion\s+of\s+(.+)/i,
          /check\s+if\s+(.+)\s+(?:was\s+)?completed/i,
          /verify\s+(.+)\s+result/i,
          /验证\s+(.+)/i,
          /检查\s+(.+)/i,
        ],
        requiredEntities: ['task'],
        optionalEntities: ['expectedOutcome', 'validationMethod'],
        weight: 0.8,
      },
      {
        action: 'COORDINATE_AGENTS',
        patterns: [
          /coordinate\s+(?:the\s+)?agents\s+to\s+(.+)/i,
          /use\s+multi-?agent\s+coordination\s+for\s+(.+)/i,
          /enable\s+multi-?agent\s+system/i,
          /协调\s+智能体\s+(.+)/i,
          /启用\s+多智能体/i,
        ],
        requiredEntities: ['task'],
        optionalEntities: ['agents', 'strategy'],
        weight: 0.9,
      },
      {
        action: 'ANALYZE_TASK',
        patterns: [
          /analyze\s+(?:the\s+)?(?:complexity\s+of\s+)?(.+)/i,
          /analyze\s+how\s+to\s+(.+)/i,
          /understand\s+(?:the\s+)?requirements\s+for\s+(.+)/i,
          /分析\s+(.+)/i,
          /理解\s+(.+)/i,
        ],
        requiredEntities: ['task'],
        optionalEntities: ['complexity'],
        weight: 0.85,
      },
    ];
  }

  private initializeChainMap(): Map<string, number> {
    return new Map([
      ['ethereum', 1],
      ['eth', 1],
      ['mainnet', 1],
      ['polygon', 137],
      ['matic', 137],
      ['bsc', 56],
      ['binance', 56],
      ['arbitrum', 42161],
      ['arb', 42161],
      ['optimism', 10],
      ['op', 10],
      ['avalanche', 43114],
      ['avax', 43114],
      ['base', 8453],
      ['zksync', 324],
      ['linea', 59144],
      ['scroll', 534352],
      ['blast', 81457],
      ['mantle', 5000],
      ['mode', 34443],
    ]);
  }

  private initializeTokenMap(): Map<string, string> {
    return new Map([
      // Native tokens
      ['eth', '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'],
      ['ethereum', '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'],
      ['matic', '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'],
      ['bnb', '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'],
      ['avax', '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'],

      // ERC20 tokens
      ['usdt', '0xdAC17F958D2ee523a2206206994597C13D831ec7'],
      ['usdc', '0xA0b86a33E6417aAb7b6DbCBbe9FD4E89c0778a4B'],
      ['dai', '0x6B175474E89094C44Da98b954EedeAC495271d0F'],
      ['wbtc', '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'],
      ['uni', '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'],
      ['link', '0x514910771AF9Ca656af840dff83E8264EcF986CA'],
      ['aave', '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9'],
      ['comp', '0xc00e94Cb662C3520282E6f5717214004A7f26888'],
      ['crv', '0xD533a949740bb3306d119CC777fa900bA034cd52'],
      ['sushi', '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2'],
      ['yfi', '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e'],
    ]);
  }

  async extractIntent(instruction: string, context?: any): Promise<Web3Intent> {
    const normalizedInstruction = instruction.toLowerCase().trim();

    // Try to match patterns
    const matchedIntents = this.patterns
      .map((pattern) => this.tryMatchPattern(pattern, normalizedInstruction))
      .filter((match): match is NonNullable<typeof match> => match !== null)
      .sort((a, b) => b.confidence - a.confidence);

    if (matchedIntents.length === 0) {
      // Fallback to generic query
      return {
        action: 'QUERY',
        entities: {},
        chains: [],
        protocols: [],
        constraints: {},
        confidence: 0.3,
        rawInstruction: instruction,
      };
    }

    const bestMatch = matchedIntents[0]!;

    // Extract additional context
    const chains = this.extractChains(normalizedInstruction);
    const protocols = this.extractProtocols(normalizedInstruction);
    const constraints = this.extractConstraints(normalizedInstruction);

    return {
      action: bestMatch.action,
      entities: bestMatch.entities,
      chains,
      protocols,
      constraints,
      confidence: bestMatch.confidence,
      rawInstruction: instruction,
    };
  }

  private tryMatchPattern(
    pattern: IntentPattern,
    instruction: string
  ): {
    action: Web3ActionType;
    entities: Web3Entities;
    confidence: number;
  } | null {
    for (const regex of pattern.patterns) {
      const match = instruction.match(regex);
      if (match) {
        const entities = this.extractEntitiesFromMatch(pattern, match);
        const confidence = this.calculateConfidence(pattern, entities);

        return {
          action: pattern.action,
          entities,
          confidence,
        };
      }
    }
    return null;
  }

  private extractEntitiesFromMatch(
    pattern: IntentPattern,
    match: RegExpMatchArray
  ): Web3Entities {
    const entities: Web3Entities = {};

    // Generic entity extraction based on pattern
    if (pattern.action === 'SWAP' && match.length >= 4) {
      entities.amount = match[1];
      entities.fromToken = match[2];
      entities.toToken = match[3];
    } else if (pattern.action === 'BRIDGE' && match.length >= 5) {
      entities.amount = match[1];
      entities.tokenAddress = match[2];
      // Extract chain information
      const fromChain = this.chainMap.get(match[3].toLowerCase());
      const toChain = this.chainMap.get(match[4].toLowerCase());
      if (fromChain) entities.chainId = fromChain;
      if (toChain) entities.toChainId = toChain;
    } else if (pattern.action === 'SEND' && match.length >= 4) {
      entities.amount = match[1];
      entities.tokenAddress = match[2];
      entities.recipient = match[3];
    } else if (pattern.action === 'STAKE' && match.length >= 3) {
      entities.amount = match[1];
      entities.tokenAddress = match[2];
    } else if (pattern.action === 'APPROVE' && match.length >= 3) {
      entities.tokenAddress = match[1];
      entities.spender = match[2];
    } else if (pattern.action === 'ADD_LIQUIDITY' && match.length >= 5) {
      entities.amountA = match[1];
      entities.tokenA = match[2];
      entities.amountB = match[3];
      entities.tokenB = match[4];
      entities.tokenAddress = match[2]; // Use first token as primary
      entities.amount = match[1]; // Use first amount as primary
    } else if (pattern.action === 'QUERY' && match.length >= 2) {
      entities.tokenAddress = match[1];
    } else if (pattern.action === 'CONNECT_WALLET' && match.length >= 2) {
      entities.dappName = match[1];
    } else if (pattern.action === 'NAVIGATE' && match.length >= 2) {
      entities.url = match[1];
    } else if (pattern.action === 'CLICK' && match.length >= 2) {
      entities.element = match[1];
      entities.text = match[1];
    } else if (pattern.action === 'FILL_FORM' && match.length >= 2) {
      // Parse form fields from the match
      try {
        entities.fields = this.parseFormFields(match[1]);
      } catch (error) {
        entities.fields = [{ value: match[1], type: 'text' }];
      }
    } else if (pattern.action === 'WAIT' && match.length >= 2) {
      entities.condition = match[1];
    } else if (pattern.action === 'SCROLL' && match.length >= 2) {
      entities.direction = match[1];
    } else if (pattern.action === 'CREATE_PLAN' && match.length >= 2) {
      entities.task = match[1];
      entities.complexity = 'medium'; // Default complexity
    } else if (pattern.action === 'VALIDATE_TASK' && match.length >= 2) {
      entities.task = match[1];
    } else if (pattern.action === 'COORDINATE_AGENTS' && match.length >= 2) {
      entities.task = match[1];
      entities.agents = ['planner', 'navigator', 'validator']; // Default agents
    } else if (pattern.action === 'ANALYZE_TASK' && match.length >= 2) {
      entities.task = match[1];
      entities.complexity = 'medium'; // Default complexity
    }

    // Convert token symbols to addresses
    this.normalizeTokenAddresses(entities);

    return entities;
  }

  private normalizeTokenAddresses(entities: Web3Entities): void {
    const tokenFields: (keyof Web3Entities)[] = [
      'fromToken',
      'toToken',
      'tokenAddress',
    ];

    for (const field of tokenFields) {
      const value = entities[field] as string | undefined;
      if (value && !value.startsWith('0x')) {
        const address = this.tokenMap.get(value.toLowerCase());
        if (address) {
          (entities as any)[field] = address;
        }
      }
    }
  }

  private parseFormFields(fieldsText: string): Array<{name?: string; selector?: string; value: string; type?: string}> {
    const fields: Array<{name?: string; selector?: string; value: string; type?: string}> = [];

    // Simple parsing for common patterns
    // This could be enhanced with more sophisticated NLP in the future
    const fieldPatterns = [
      /([A-Za-z0-9\s_]+)\s*[:=]\s*([A-Za-z0-9\s_.@+-]+)/g,
      /enter\s+([A-Za-z0-9\s_.@+-]+)\s+(?:as|in|for)\s+([A-Za-z0-9\s_]+)/g,
      /fill\s+([A-Za-z0-9\s_]+)\s+with\s+([A-Za-z0-9\s_.@+-]+)/g,
    ];

    for (const pattern of fieldPatterns) {
      let match;
      while ((match = pattern.exec(fieldsText)) !== null) {
        const field = match[1]?.trim();
        const value = match[2]?.trim();
        if (field && value) {
          // Try to determine field type
          let type = 'text';
          if (value.includes('@')) type = 'email';
          else if (/^\d+$/.test(value)) type = 'number';
          else if (value.toLowerCase().includes('password')) type = 'password';
          fields.push({
            name: field,
            value: value,
            type: type
          });
        }
      }
    }

    // If no structured fields found, treat as simple field-value pairs
    if (fields.length === 0) {
      const simpleFields = fieldsText.split(/[,，]/).map(f => f.trim()).filter(f => f);
      simpleFields.forEach(field => {
        const parts = field.split(/[:=]/).map(p => p.trim());
        if (parts.length >= 2) {
          fields.push({
            name: parts[0],
            value: parts[1],
            type: 'text'
          });
        }
      });
    }

    return fields.length > 0 ? fields : [{ value: fieldsText, type: 'text' }];
  }

  private extractChains(instruction: string): number[] {
    const chains: number[] = [];

    for (const [chainName, chainId] of Array.from(this.chainMap.entries())) {
      if (instruction.includes(chainName)) {
        chains.push(chainId);
      }
    }

    return Array.from(new Set(chains)); // Remove duplicates
  }

  private extractProtocols(instruction: string): string[] {
    const protocols: string[] = [];
    const protocolPatterns = [
      /uniswap/i,
      /sushiswap/i,
      /pancakeswap/i,
      /curve/i,
      /balancer/i,
      /aave/i,
      /compound/i,
      /1inch/i,
      /lifi/i,
      /socket/i,
      /hop/i,
      /stargate/i,
      /multichain/i,
    ];

    for (const pattern of protocolPatterns) {
      if (pattern.test(instruction)) {
        protocols.push(pattern.source.replace('/i', ''));
      }
    }

    return Array.from(new Set(protocols));
  }

  private extractConstraints(instruction: string): Web3Constraints {
    const constraints: Web3Constraints = {};

    // Extract slippage
    const slippageMatch = instruction.match(/(\d+(?:\.\d+)?)%\s*slippage/i);
    if (slippageMatch) {
      constraints.slippage = parseFloat(slippageMatch[1]);
    }

    // Extract preference
    if (instruction.includes('fastest') || instruction.includes('最快')) {
      constraints.preference = 'FASTEST';
    } else if (
      instruction.includes('cheapest') ||
      instruction.includes('最便宜')
    ) {
      constraints.preference = 'CHEAPEST';
    } else if (
      instruction.includes('best rate') ||
      instruction.includes('最优价格')
    ) {
      constraints.preference = 'BEST_RATE';
    }

    // Extract gas constraints
    const gasLimitMatch = instruction.match(/gas\s+limit\s+(\d+)/i);
    if (gasLimitMatch) {
      constraints.gasLimit = gasLimitMatch[1];
    }

    const gasPriceMatch = instruction.match(/gas\s+price\s+(\d+)/i);
    if (gasPriceMatch) {
      constraints.gasPrice = gasPriceMatch[1];
    }

    return constraints;
  }

  private calculateConfidence(
    pattern: IntentPattern,
    entities: Web3Entities
  ): number {
    let confidence = pattern.weight;

    // Check required entities
    const missingRequired = pattern.requiredEntities.filter(
      (entity) => !entities[entity]
    );

    if (missingRequired.length > 0) {
      confidence *= 0.5; // Reduce confidence for missing required entities
    }

    // Boost confidence for optional entities that are present
    const presentOptional = pattern.optionalEntities.filter(
      (entity) => entities[entity]
    );

    confidence += presentOptional.length * 0.1;

    return Math.min(confidence, 1.0);
  }

  // Helper method to validate intent completeness
  validateIntent(intent: Web3Intent): boolean {
    const pattern = this.patterns.find((p) => p.action === intent.action);
    if (!pattern) return false;

    const missingRequired = pattern.requiredEntities.filter(
      (entity) => !intent.entities[entity]
    );

    return missingRequired.length === 0;
  }

  // Helper method to suggest missing entities
  suggestMissingEntities(intent: Web3Intent): string[] {
    const pattern = this.patterns.find((p) => p.action === intent.action);
    if (!pattern) return [];

    return pattern.requiredEntities.filter(
      (entity) => !intent.entities[entity]
    );
  }
}
