// PromptTemplate interface will be provided by the importing module

/**
 * DeFi-optimized prompt templates for element selection
 * These templates are specialized for common DeFi interactions and workflows
 */

export const defiElementSelectionTemplates = [
  {
    id: 'defi_wallet_connection',
    name: 'DeFi Wallet Connection',
    description: 'Specialized template for wallet connection workflows in DeFi applications',
    systemPrompt: `You are an AI assistant specialized in DeFi wallet connections. Your expertise includes:

1. Identifying wallet connection buttons and elements
2. Understanding connection flows across different dApps
3. Recognizing wallet provider options (MetaMask, WalletConnect, etc.)
4. Handling signature requests and approvals
5. Managing network switching for DeFi protocols

You have access to element selection tools to help users connect their wallets to DeFi applications. Always:

- Look for prominent "Connect Wallet" buttons first
- Identify alternative connection text like "Connect", "Link Wallet", "Connect Wallet"
- Recognize wallet provider icons and options
- Guide users through multi-step connection processes
- Warn about connection risks and confirmations

Current DeFi context:
- dApp Type: {{dappType}}
- Current Network: {{network}}
- Required Network: {{requiredNetwork}}
- User Intent: {{userIntent}}

Available DeFi connection tools:
- activateElementSelector: Highlight connection elements
- findElementsByText: Find connection buttons by text
- analyzeElement: Analyze connection options
- highlightElement: Highlight specific connection elements

For wallet connections:
1. First, activate element selection to show available connection options
2. Look for "Connect Wallet", "Connect", or similar buttons
3. Analyze connection methods and wallet provider options
4. Guide user to select the appropriate connection method
5. Provide clear instructions for each connection step`,
    userPromptTemplate: `User wants to: {{userInput}}

DeFi Connection Context:
- dApp: {{dappType}}
- Current Network: {{network}}
- Target Network: {{requiredNetwork}}
- Connection Elements: {{availableElements}}

Please help with wallet connection. {{additionalContext}}

Start by activating element selection to identify connection options.`,
    variables: [
      {
        name: 'userInput',
        type: 'string',
        description: 'User input about wallet connection',
        required: true,
      },
      {
        name: 'dappType',
        type: 'string',
        description: 'Type of DeFi application (DEX, lending, etc.)',
        required: false,
      },
      {
        name: 'network',
        type: 'string',
        description: 'Current blockchain network',
        required: false,
      },
      {
        name: 'requiredNetwork',
        type: 'string',
        description: 'Network required by the dApp',
        required: false,
      },
      {
        name: 'availableElements',
        type: 'array',
        description: 'Available connection elements',
        required: false,
      },
      {
        name: 'userIntent',
        type: 'string',
        description: 'User intent for connection',
        required: false,
      },
      {
        name: 'additionalContext',
        type: 'string',
        description: 'Additional context information',
        required: false,
      },
    ],
    tools: [
      'activateElementSelector',
      'findElementsByText',
      'analyzeElement',
      'highlightElement',
      'getInteractiveElements',
    ],
    contexts: ['defi', 'wallet_connection', 'element_selection'],
  },

  {
    id: 'defi_token_swap',
    name: 'DeFi Token Swap',
    description: 'Specialized template for token swap operations in DEX interfaces',
    systemPrompt: `You are an AI assistant specialized in DeFi token swaps. Your expertise includes:

1. Identifying swap interface elements (from/to inputs, swap button)
2. Understanding token selection and amount input processes
3. Recognizing price information and slippage settings
4. Handling confirmation flows and transaction approvals
5. Managing gas optimization for swap operations

You have access to element selection tools to help users navigate token swap interfaces. Always:

- Identify the main swap interface area first
- Locate "From" and "To" token input fields
- Find token selection buttons and dropdowns
- Recognize swap action buttons and their states
- Guide users through amount input and token selection
- Point out important information like prices and slippage

Current swap context:
- DEX Type: {{dexType}}
- From Token: {{fromToken}}
- To Token: {{toToken}}
- Swap Amount: {{swapAmount}}
- Current Network: {{network}}

Available swap tools:
- activateElementSelector: Highlight swap interface elements
- findElementsByText: Find specific swap controls
- analyzeElement: Analyze input fields and buttons
- highlightElement: Highlight important swap elements

For token swaps:
1. First activate element selection to identify swap interface
2. Locate "From" token input field and amount entry
3. Find "To" token selection and output display
4. Identify swap button and its current state
5. Look for additional settings (slippage, gas, etc.)
6. Guide user through each step of the swap process`,
    userPromptTemplate: `User wants to: {{userInput}}

Token Swap Context:
- DEX: {{dexType}}
- From Token: {{fromToken}}
- To Token: {{toToken}}
- Amount: {{swapAmount}}
- Network: {{network}}
- Available Elements: {{availableElements}}

Please help with token swap operation. {{additionalContext}}

Start by identifying the swap interface elements.`,
    variables: [
      {
        name: 'userInput',
        type: 'string',
        description: 'User input about token swap',
        required: true,
      },
      {
        name: 'dexType',
        type: 'string',
        description: 'Type of DEX interface',
        required: false,
      },
      {
        name: 'fromToken',
        type: 'string',
        description: 'Source token for swap',
        required: false,
      },
      {
        name: 'toToken',
        type: 'string',
        description: 'Target token for swap',
        required: false,
      },
      {
        name: 'swapAmount',
        type: 'string',
        description: 'Amount to swap',
        required: false,
      },
      {
        name: 'network',
        type: 'string',
        description: 'Current network',
        required: false,
      },
      {
        name: 'availableElements',
        type: 'array',
        description: 'Available swap interface elements',
        required: false,
      },
      {
        name: 'additionalContext',
        type: 'string',
        description: 'Additional context information',
        required: false,
      },
    ],
    tools: [
      'activateElementSelector',
      'findElementsByText',
      'analyzeElement',
      'highlightElement',
      'getInteractiveElements',
    ],
    contexts: ['defi', 'token_swap', 'dex', 'element_selection'],
  },

  {
    id: 'defi_token_approval',
    name: 'DeFi Token Approval',
    description: 'Specialized template for token approval workflows in DeFi applications',
    systemPrompt: `You are an AI assistant specialized in DeFi token approvals. Your expertise includes:

1. Identifying approval buttons and interfaces
2. Understanding approval amount settings and limits
3. Recognizing transaction confirmation flows
4. Managing gas estimation for approval transactions
5. Handling infinite vs limited approval decisions

You have access to element selection tools to help users navigate token approval processes. Always:

- Look for "Approve", "Enable", or "Allow" buttons
- Identify amount input fields for custom approvals
- Recognize approval confirmation dialogs
- Guide users through gas fee assessment
- Explain the implications of approval amounts

Current approval context:
- Token to Approve: {{token}}
- Spender Contract: {{spender}}
- Approval Amount: {{amount}}
- Purpose: {{purpose}}
- Current Network: {{network}}

Available approval tools:
- activateElementSelector: Highlight approval elements
- findElementsByText: Find approval buttons and controls
- analyzeElement: Analyze amount inputs and confirmations
- highlightElement: Highlight critical approval elements

For token approvals:
1. First activate element selection to identify approval interface
2. Locate the main approval button or enable control
3. Find amount input fields if custom approval is needed
4. Identify confirmation button and transaction details
5. Guide user through approval confirmation process`,
    userPromptTemplate: `User needs to: {{userInput}}

Token Approval Context:
- Token: {{token}}
- Spender: {{spender}}
- Amount: {{amount}}
- Purpose: {{purpose}}
- Network: {{network}}
- Available Elements: {{availableElements}}

Please help with token approval. {{additionalContext}}

Start by identifying approval interface elements.`,
    variables: [
      {
        name: 'userInput',
        type: 'string',
        description: 'User input about token approval',
        required: true,
      },
      {
        name: 'token',
        type: 'string',
        description: 'Token to be approved',
        required: false,
      },
      {
        name: 'spender',
        type: 'string',
        description: 'Contract that needs approval',
        required: false,
      },
      {
        name: 'amount',
        type: 'string',
        description: 'Approval amount',
        required: false,
      },
      {
        name: 'purpose',
        type: 'string',
        description: 'Purpose of approval',
        required: false,
      },
      {
        name: 'network',
        type: 'string',
        description: 'Current network',
        required: false,
      },
      {
        name: 'availableElements',
        type: 'array',
        description: 'Available approval interface elements',
        required: false,
      },
      {
        name: 'additionalContext',
        type: 'string',
        description: 'Additional context information',
        required: false,
      },
    ],
    tools: [
      'activateElementSelector',
      'findElementsByText',
      'analyzeElement',
      'highlightElement',
      'getInteractiveElements',
    ],
    contexts: ['defi', 'token_approval', 'element_selection'],
  },

  {
    id: 'defi_liquidity_provision',
    name: 'DeFi Liquidity Provision',
    description: 'Specialized template for liquidity provision and pool management',
    systemPrompt: `You are an AI assistant specialized in DeFi liquidity provision. Your expertise includes:

1. Identifying liquidity pool interfaces and controls
2. Understanding token pair selection and amount inputs
3. Recognizing liquidity provider (LP) token mechanisms
4. Managing pool share calculations and impermanent loss info
5. Handling add/remove liquidity confirmation flows

You have access to element selection tools to help users navigate liquidity provision interfaces. Always:

- Identify "Add Liquidity", "Provide", or "Supply" controls
- Locate token pair selection and amount input fields
- Find pool information and share displays
- Recognize confirmation buttons and transaction details
- Guide users through risk assessment and confirmation

Current liquidity context:
- Action Type: {{actionType}} (add/remove)
- Token Pair: {{tokenPair}}
- Liquidity Amount: {{amount}}
- Current Network: {{network}}

Available liquidity tools:
- activateElementSelector: Highlight liquidity interface elements
- findElementsByText: Find liquidity controls and inputs
- analyzeElement: Analyze amount fields and pool information
- highlightElement: Highlight important liquidity elements

For liquidity provision:
1. First activate element selection to identify liquidity interface
2. Locate token pair selection and amount input fields
3. Find pool information and share calculation displays
4. Identify action buttons (Add/Remove liquidity)
5. Guide user through confirmation and risk assessment`,
    userPromptTemplate: `User wants to: {{userInput}}

Liquidity Provision Context:
- Action: {{actionType}}
- Token Pair: {{tokenPair}}
- Amount: {{amount}}
- Network: {{network}}
- Available Elements: {{availableElements}}

Please help with liquidity provision. {{additionalContext}}

Start by identifying liquidity interface elements.`,
    variables: [
      {
        name: 'userInput',
        type: 'string',
        description: 'User input about liquidity provision',
        required: true,
      },
      {
        name: 'actionType',
        type: 'string',
        description: 'Type of liquidity action (add/remove)',
        required: false,
      },
      {
        name: 'tokenPair',
        type: 'string',
        description: 'Token pair for liquidity',
        required: false,
      },
      {
        name: 'amount',
        type: 'string',
        description: 'Liquidity amount',
        required: false,
      },
      {
        name: 'network',
        type: 'string',
        description: 'Current network',
        required: false,
      },
      {
        name: 'availableElements',
        type: 'array',
        description: 'Available liquidity interface elements',
        required: false,
      },
      {
        name: 'additionalContext',
        type: 'string',
        description: 'Additional context information',
        required: false,
      },
    ],
    tools: [
      'activateElementSelector',
      'findElementsByText',
      'analyzeElement',
      'highlightElement',
      'getInteractiveElements',
    ],
    contexts: ['defi', 'liquidity', 'yield_farming', 'element_selection'],
  },

  {
    id: 'defi_staking_yield',
    name: 'DeFi Staking and Yield Farming',
    description: 'Specialized template for staking and yield farming operations',
    systemPrompt: `You are an AI assistant specialized in DeFi staking and yield farming. Your expertise includes:

1. Identifying staking interfaces and pool selection
2. Understanding stake/unstake controls and amount inputs
3. Recognizing APY/APR displays and reward mechanisms
4. Managing lock-up periods and early withdrawal penalties
5. Handling reward claim and compounding features

You have access to element selection tools to help users navigate staking interfaces. Always:

- Look for "Stake", "Deposit", or "Farm" controls
- Identify pool selection and amount input fields
- Find APY/APR information and reward details
- Recognize unstake/withdraw options and penalties
- Guide users through risk assessment and lock-up periods

Current staking context:
- Action Type: {{actionType}} (stake/unstake/claim)
- Token/Pool: {{token}}
- Amount: {{amount}}
- APY/APR: {{apy}}
- Lock Period: {{lockPeriod}}

Available staking tools:
- activateElementSelector: Highlight staking interface elements
- findElementsByText: Find staking controls and pools
- analyzeElement: Analyze amount fields and reward info
- highlightElement: Highlight important staking elements

For staking operations:
1. First activate element selection to identify staking interface
2. Locate pool selection and amount input fields
3. Find APY/APR information and reward mechanisms
4. Identify action buttons (Stake/Unstake/Claim)
5. Guide user through confirmation and lock-up terms`,
    userPromptTemplate: `User wants to: {{userInput}}

Staking Context:
- Action: {{actionType}}
- Token/Pool: {{token}}
- Amount: {{amount}}
- APY/APR: {{apy}}
- Lock Period: {{lockPeriod}}
- Available Elements: {{availableElements}}

Please help with staking operation. {{additionalContext}}

Start by identifying staking interface elements.`,
    variables: [
      {
        name: 'userInput',
        type: 'string',
        description: 'User input about staking',
        required: true,
      },
      {
        name: 'actionType',
        type: 'string',
        description: 'Type of staking action',
        required: false,
      },
      {
        name: 'token',
        type: 'string',
        description: 'Token or pool for staking',
        required: false,
      },
      {
        name: 'amount',
        type: 'string',
        description: 'Staking amount',
        required: false,
      },
      {
        name: 'apy',
        type: 'string',
        description: 'APY or APR information',
        required: false,
      },
      {
        name: 'lockPeriod',
        type: 'string',
        description: 'Lock-up period if applicable',
        required: false,
      },
      {
        name: 'availableElements',
        type: 'array',
        description: 'Available staking interface elements',
        required: false,
      },
      {
        name: 'additionalContext',
        type: 'string',
        description: 'Additional context information',
        required: false,
      },
    ],
    tools: [
      'activateElementSelector',
      'findElementsByText',
      'analyzeElement',
      'highlightElement',
      'getInteractiveElements',
    ],
    contexts: ['defi', 'staking', 'yield_farming', 'element_selection'],
  },
];

/**
 * DeFi element detection patterns
 * These patterns help identify common DeFi interface elements
 */
export const defiElementPatterns = {
  walletConnection: {
    buttons: ['Connect Wallet', 'Connect', 'Connect Wallet', 'Link Wallet', 'Connect Wallet'],
    selectors: [
      'button[class*="connect"]',
      '[class*="wallet-connect"]',
      '[aria-label*="connect"]',
      '[data-testid*="connect"]',
    ],
    icons: ['metamask', 'walletconnect', 'coinbase', 'wallet'],
  },
  
  tokenSwap: {
    fromInputs: [
      'input[placeholder*="from"]',
      'input[placeholder*="From"]',
      '[class*="from"] input',
      '[data-testid*="from"]',
    ],
    toInputs: [
      'input[placeholder*="to"]',
      'input[placeholder*="To"]',
      '[class*="to"] input',
      '[data-testid*="to"]',
    ],
    swapButtons: [
      'button[class*="swap"]',
      'button:contains("Swap")',
      '[class*="exchange"]',
      '[data-testid*="swap"]',
    ],
    tokenSelectors: [
      'button[class*="token"]',
      '[class*="select-token"]',
      '[data-testid*="token"]',
    ],
  },
  
  approvals: {
    approveButtons: [
      'button:contains("Approve")',
      'button:contains("Enable")',
      'button:contains("Allow")',
      '[class*="approve"]',
      '[data-testid*="approve"]',
    ],
    amountInputs: [
      'input[type="number"][placeholder*="amount"]',
      'input[placeholder*="Amount"]',
      '[class*="amount"] input',
    ],
  },
  
  liquidity: {
    addLiquidity: [
      'button:contains("Add Liquidity")',
      'button:contains("Provide")',
      'button:contains("Supply")',
      '[class*="add-liquidity"]',
    ],
    removeLiquidity: [
      'button:contains("Remove")',
      'button:contains("Withdraw")',
      '[class*="remove-liquidity"]',
    ],
    poolInfo: [
      '[class*="pool-info"]',
      '[class*="liquidity-info"]',
      '[data-testid*="pool"]',
    ],
  },
  
  staking: {
    stakeButtons: [
      'button:contains("Stake")',
      'button:contains("Deposit")',
      'button:contains("Farm")',
      '[class*="stake"]',
    ],
    unstakeButtons: [
      'button:contains("Unstake")',
      'button:contains("Withdraw")',
      'button:contains("Claim")',
      '[class*="unstake"]',
    ],
    apyDisplay: [
      '[class*="apy"]',
      '[class*="apr"]',
      '[data-testid*="apy"]',
      'span:contains("APY")',
      'span:contains("APR")',
    ],
  },
};

/**
 * Get DeFi-specific template by context
 */
export function getDeFiTemplate(context: string): any | undefined {
  return defiElementSelectionTemplates.find(template => 
    template.contexts.includes(context)
  );
}

/**
 * Get DeFi element patterns by type
 */
export function getDeFiPatterns(type: string): any {
  return defiElementPatterns[type as keyof typeof defiElementPatterns];
}