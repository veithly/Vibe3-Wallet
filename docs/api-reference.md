# Vibe3 Wallet Agent Tools API Reference

## Overview

This document provides the complete API reference for Vibe3 Wallet Agent Tools, including interface definitions, parameter specifications, response formats, and error handling for all available tools.

## Basic Information

### Authentication
All API calls require wallet authentication. Users must have their wallet unlocked and authorized for relevant operations.

### Request Format
All tool calls use JSON format and are routed through the Agent system.

### Response Format
All responses follow a unified format:

```typescript
interface ToolResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
  action: string;
  params: any;
}
```

## Tool Interface Definitions

### Query Tools

#### getBalance

**Description**: Get wallet total balance and asset information

**Interface**: `getBalance(params: GetBalanceParams): Promise<GetBalanceResponse>`

**Parameters**:
```typescript
interface GetBalanceParams {
  address: string;        // Wallet address (0x format)
  chainId?: number;       // Chain ID (optional, default: current chain)
}
```

**Response**:
```typescript
interface GetBalanceResponse {
  success: boolean;
  data: {
    totalBalance: string;           // Total balance (e.g., "1.234 ETH")
    nativeBalance: string;          // Native token balance
    tokenBalances: TokenBalance[];  // Token balance list
    nftCount: number;               // NFT count
    totalValueUSD: string;          // Total value (USD)
  };
  error?: string;
}
```

**Error Codes**:
- `INVALID_ADDRESS`: Invalid wallet address
- `CHAIN_NOT_SUPPORTED`: Unsupported chain
- `API_ERROR`: API call failed

#### getTokenBalance

**Description**: Get specific token balance

**Interface**: `getTokenBalance(params: GetTokenBalanceParams): Promise<GetTokenBalanceResponse>`

**Parameters**:
```typescript
interface GetTokenBalanceParams {
  address: string;        // Wallet address
  tokenAddress: string;   // Token contract address
  chainId?: number;       // Chain ID (optional)
}
```

**Response**:
```typescript
interface GetTokenBalanceResponse {
  success: boolean;
  data: {
    tokenAddress: string;     // Token contract address
    symbol: string;           // Token symbol
    balance: string;          // Balance
    decimals: number;         // Decimal places
    valueUSD: string;         // USD value
    priceUSD: string;         // USD price
  };
  error?: string;
}
```

#### getTransactionHistory

**Description**: Get wallet transaction history

**Interface**: `getTransactionHistory(params: GetTransactionHistoryParams): Promise<GetTransactionHistoryResponse>`

**Parameters**:
```typescript
interface GetTransactionHistoryParams {
  address: string;        // Wallet address
  chainId?: number;       // Chain ID (optional)
  limit?: number;         // Return count (optional, default: 50)
  offset?: number;        // Offset (optional, default: 0)
}
```

**Response**:
```typescript
interface GetTransactionHistoryResponse {
  success: boolean;
  data: {
    transactions: Transaction[];
    totalCount: number;
    hasMore: boolean;
  };
  error?: string;
}

interface Transaction {
  hash: string;           // Transaction hash
  from: string;           // Sender address
  to: string;             // Recipient address
  value: string;          // Transaction amount
  gasUsed: string;        // Gas used
  gasPrice: string;       // Gas price
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;      // Timestamp
  blockNumber: number;    // Block number
}
```

#### getTokenPrice

**Description**: Get current token price

**Interface**: `getTokenPrice(params: GetTokenPriceParams): Promise<GetTokenPriceResponse>`

**Parameters**:
```typescript
interface GetTokenPriceParams {
  token: string;          // Token contract address or symbol
  chainId?: number;       // Chain ID (optional)
  quoteCurrency?: string; // Quote currency (optional, default: USD)
}
```

**Response**:
```typescript
interface GetTokenPriceResponse {
  success: boolean;
  data: {
    token: string;        // Token identifier
    price: string;        // Price
    quoteCurrency: string; // Quote currency
    change24h: string;    // 24-hour change
    volume24h: string;    // 24-hour volume
    marketCap: string;    // Market cap
  };
  error?: string;
}
```

#### getAllAssets

**Description**: Get all wallet assets (tokens and NFTs)

**Interface**: `getAllAssets(params: GetAllAssetsParams): Promise<GetAllAssetsResponse>`

**Parameters**:
```typescript
interface GetAllAssetsParams {
  address: string;        // Wallet address
  chainId?: number;       // Chain ID (optional)
  includeNFTs?: boolean;  // Include NFTs (optional, default: true)
}
```

**Response**:
```typescript
interface GetAllAssetsResponse {
  success: boolean;
  data: {
    tokens: TokenAsset[];
    nfts: NFTAsset[];
    totalValueUSD: string;
  };
  error?: string;
}

interface TokenAsset {
  address: string;        // Contract address
  symbol: string;         // Token symbol
  name: string;           // Token name
  balance: string;        // Balance
  decimals: number;       // Decimal places
  valueUSD: string;       // USD value
  priceUSD: string;       // USD price
}

interface NFTAsset {
  contractAddress: string; // Contract address
  tokenId: string;        // Token ID
  name: string;           // NFT name
  image: string;          // Image URL
  valueUSD?: string;      // USD value (if available)
}
```

### Transaction Tools

#### sendTransaction

**Description**: Send transaction to specified address

**Interface**: `sendTransaction(params: SendTransactionParams): Promise<SendTransactionResponse>`

**Parameters**:
```typescript
interface SendTransactionParams {
  to: string;             // Recipient address
  value: string;          // Transaction amount (ETH)
  data?: string;          // Transaction data (optional)
  chainId?: number;       // Chain ID (optional)
  gasPrice?: string;      // Gas price (optional)
  gasLimit?: string;      // Gas limit (optional)
}
```

**Response**:
```typescript
interface SendTransactionResponse {
  success: boolean;
  data: {
    txHash: string;       // Transaction hash
    txParams: any;        // Transaction parameters
    confirmed: boolean;   // Confirmation status
  };
  error?: string;
}
```

**Error Codes**:
- `INSUFFICIENT_BALANCE`: Insufficient balance
- `INVALID_ADDRESS`: Invalid address
- `USER_REJECTED`: User rejected transaction
- `NETWORK_ERROR`: Network error

#### approveToken

**Description**: Approve token for contract usage

**Interface**: `approveToken(params: ApproveTokenParams): Promise<ApproveTokenResponse>`

**Parameters**:
```typescript
interface ApproveTokenParams {
  tokenAddress: string;   // Token contract address
  spender: string;        // Spender contract address
  amount: string;         // Approval amount
  chainId?: number;       // Chain ID (optional)
}
```

**Response**:
```typescript
interface ApproveTokenResponse {
  success: boolean;
  data: {
    txHash: string;       // Transaction hash
    txParams: any;        // Transaction parameters
    confirmed: boolean;   // Confirmation status
  };
  error?: string;
}
```

### Advanced DeFi Tools

#### swapTokens

**Description**: Swap tokens using DEX aggregator

**Interface**: `swapTokens(params: SwapTokensParams): Promise<SwapTokensResponse>`

**Parameters**:
```typescript
interface SwapTokensParams {
  fromToken: string;      // Source token
  toToken: string;        // Target token
  amount: string;         // Swap amount
  chainId?: number;       // Chain ID (optional)
  slippage?: number;      // Slippage tolerance (optional, default: 0.5)
  preferredDex?: string;  // Preferred DEX (optional)
}
```

**Response**:
```typescript
interface SwapTokensResponse {
  success: boolean;
  data: {
    txHash: string;       // Transaction hash
    fromToken: string;    // Source token
    toToken: string;      // Target token
    amount: string;       // Swap amount
    receivedAmount: string; // Received amount
    priceImpact: string;  // Price impact
    gasUsed: string;      // Gas used
    confirmed: boolean;   // Confirmation status
  };
  error?: string;
}
```

#### bridgeTokens

**Description**: Bridge tokens between different blockchain networks

**Interface**: `bridgeTokens(params: BridgeTokensParams): Promise<BridgeTokensResponse>`

**Parameters**:
```typescript
interface BridgeTokensParams {
  token: string;          // Token
  amount: string;         // Bridge amount
  fromChainId: number;    // Source chain ID
  toChainId: number;      // Target chain ID
  recipient?: string;     // Recipient address (optional)
  preferredBridge?: string; // Preferred bridge protocol (optional)
}
```

**Response**:
```typescript
interface BridgeTokensResponse {
  success: boolean;
  data: {
    txHash: string;       // Transaction hash
    token: string;        // Token
    amount: string;       // Bridge amount
    fromChainId: number;  // Source chain ID
    toChainId: number;    // Target chain ID
    recipient: string;    // Recipient address
    estimatedTime: number; // Estimated completion time (minutes)
    confirmed: boolean;   // Confirmation status
  };
  error?: string;
}
```

### Browser Automation Tools

#### navigateToUrl

**Description**: Navigate to a specific URL in the browser

**Interface**: `navigateToUrl(params: NavigateToUrlParams): Promise<NavigateToUrlResponse>`

**Parameters**:
```typescript
interface NavigateToUrlParams {
  url: string;            // The URL to navigate to
  waitFor?: string;       // Wait condition (load, networkidle, selector)
  timeout?: number;       // Timeout in milliseconds (1000-60000)
}
```

**Response**:
```typescript
interface NavigateToUrlResponse {
  success: boolean;
  data: {
    url: string;          // Navigated URL
    title: string;        // Page title
    status: string;       // Navigation status
  };
  error?: string;
}
```

#### clickElement

**Description**: Click on a web element using CSS selector or text content

**Interface**: `clickElement(params: ClickElementParams): Promise<ClickElementResponse>`

**Parameters**:
```typescript
interface ClickElementParams {
  selector?: string;      // CSS selector for the element to click
  text?: string;          // Text content to find and click (alternative to selector)
  waitForNavigation?: boolean; // Wait for navigation after click
  timeout?: number;       // Timeout in milliseconds (1000-30000)
}
```

**Response**:
```typescript
interface ClickElementResponse {
  success: boolean;
  data: {
    clicked: boolean;     // Click success status
    element: string;      // Element identifier
    navigated?: boolean;  // Navigation occurred
  };
  error?: string;
}
```

#### fillForm

**Description**: Fill out forms with provided data

**Interface**: `fillForm(params: FillFormParams): Promise<FillFormResponse>`

**Parameters**:
```typescript
interface FillFormParams {
  fields: FormField[];    // Array of form fields to fill
  submit?: boolean;       // Whether to submit the form after filling
}

interface FormField {
  selector: string;       // CSS selector for the field
  name?: string;          // Field name for identification
  value: string;          // Value to fill
  type?: 'text' | 'password' | 'email' | 'number' | 'checkbox' | 'radio' | 'select';
}
```

**Response**:
```typescript
interface FillFormResponse {
  success: boolean;
  data: {
    filledFields: number; // Number of fields filled
    submitted: boolean;   // Form submission status
  };
  error?: string;
}
```

#### waitFor

**Description**: Wait for elements or conditions on the page

**Interface**: `waitFor(params: WaitForParams): Promise<WaitForResponse>`

**Parameters**:
```typescript
interface WaitForParams {
  condition: string;      // Wait condition (selector, text, networkidle)
  timeout?: number;       // Timeout in milliseconds
  selector?: string;      // CSS selector to wait for
  text?: string;          // Text content to wait for
}
```

**Response**:
```typescript
interface WaitForResponse {
  success: boolean;
  data: {
    waited: boolean;      // Wait success status
    duration: number;     // Actual wait time
  };
  error?: string;
}
```

#### scrollPage

**Description**: Scroll the page to reveal content

**Interface**: `scrollPage(params: ScrollPageParams): Promise<ScrollPageResponse>`

**Parameters**:
```typescript
interface ScrollPageParams {
  direction?: 'up' | 'down' | 'left' | 'right'; // Scroll direction
  amount?: number;        // Scroll amount in pixels
  selector?: string;      // Scroll to specific element
  smooth?: boolean;       // Smooth scrolling
}
```

**Response**:
```typescript
interface ScrollPageResponse {
  success: boolean;
  data: {
    scrolled: boolean;    // Scroll success status
    position: {           // New scroll position
      x: number;
      y: number;
    };
  };
  error?: string;
}
```

#### takeScreenshot

**Description**: Capture page screenshots

**Interface**: `takeScreenshot(params: TakeScreenshotParams): Promise<TakeScreenshotResponse>`

**Parameters**:
```typescript
interface TakeScreenshotParams {
  selector?: string;      // Screenshot specific element
  fullPage?: boolean;     // Full page screenshot
  quality?: number;       // Image quality (1-100)
  format?: 'png' | 'jpeg'; // Image format
}
```

**Response**:
```typescript
interface TakeScreenshotResponse {
  success: boolean;
  data: {
    screenshot: string;   // Base64 encoded image
    size: number;         // Image size in bytes
    dimensions: {         // Image dimensions
      width: number;
      height: number;
    };
  };
  error?: string;
}
```

#### switchTab

**Description**: Switch between browser tabs

**Interface**: `switchTab(params: SwitchTabParams): Promise<SwitchTabParams>`

**Parameters**:
```typescript
interface SwitchTabParams {
  tabId?: number;         // Specific tab ID to switch to
  url?: string;           // Switch to tab with specific URL
  title?: string;         // Switch to tab with specific title
}
```

**Response**:
```typescript
interface SwitchTabResponse {
  success: boolean;
  data: {
    tabId: number;        // Active tab ID
    url: string;          // Tab URL
    title: string;        // Tab title
  };
  error?: string;
}
```

#### closeTab

**Description**: Close browser tabs

**Interface**: `closeTab(params: CloseTabParams): Promise<CloseTabResponse>`

**Parameters**:
```typescript
interface CloseTabParams {
  tabId?: number;         // Specific tab ID to close
  url?: string;           // Close tab with specific URL
  all?: boolean;          // Close all tabs except current
}
```

**Response**:
```typescript
interface CloseTabResponse {
  success: boolean;
  data: {
    closedTabs: number;   // Number of tabs closed
    remainingTabs: number; // Number of remaining tabs
  };
  error?: string;
}
```

#### elementSelection

**Description**: Activate element selection mode for visual interaction

**Interface**: `elementSelection(params: ElementSelectionParams): Promise<ElementSelectionResponse>`

**Parameters**:
```typescript
interface ElementSelectionParams {
  mode: 'highlight' | 'select' | 'analyze'; // Selection mode
  filter?: string;        // Filter elements by criteria
  visibleOnly?: boolean;  // Only select visible elements
}
```

**Response**:
```typescript
interface ElementSelectionResponse {
  success: boolean;
  data: {
    mode: string;         // Active selection mode
    elements: number;     // Number of selectable elements
  };
  error?: string;
}
```

#### elementAnalysis

**Description**: Analyze web page elements for accessibility and interaction

**Interface**: `elementAnalysis(params: ElementAnalysisParams): Promise<ElementAnalysisResponse>`

**Parameters**:
```typescript
interface ElementAnalysisParams {
  selector: string;       // CSS selector for the element
  includeAccessibility?: boolean; // Include accessibility analysis
  includeEvents?: boolean; // Include event analysis
}
```

**Response**:
```typescript
interface ElementAnalysisResponse {
  success: boolean;
  data: {
    element: ElementInfo; // Element information
    accessibility?: AccessibilityInfo; // Accessibility details
    events?: EventInfo[]; // Event information
  };
  error?: string;
}

interface ElementInfo {
  tagName: string;        // HTML tag name
  text: string;           // Element text content
  attributes: Record<string, string>; // Element attributes
  position: {             // Element position
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

#### findElements

**Description**: Find elements on the page based on various criteria

**Interface**: `findElements(params: FindElementsParams): Promise<FindElementsResponse>`

**Parameters**:
```typescript
interface FindElementsParams {
  selector?: string;      // CSS selector
  text?: string;          // Text content
  tagName?: string;       // HTML tag name
  visibleOnly?: boolean;  // Only visible elements
  limit?: number;         // Maximum number of results
}
```

**Response**:
```typescript
interface FindElementsResponse {
  success: boolean;
  data: {
    elements: ElementInfo[]; // Found elements
    count: number;        // Total count
  };
  error?: string;
}
```

#### highlightElement

**Description**: Highlight elements on the page for visual feedback

**Interface**: `highlightElement(params: HighlightElementParams): Promise<HighlightElementResponse>`

**Parameters**:
```typescript
interface HighlightElementParams {
  selector: string;       // CSS selector for the element
  color?: string;         // Highlight color (hex or name)
  duration?: number;      // Highlight duration in milliseconds
  style?: 'border' | 'background' | 'outline'; // Highlight style
}
```

**Response**:
```typescript
interface HighlightElementResponse {
  success: boolean;
  data: {
    highlighted: boolean; // Highlight success status
    element: string;      // Element identifier
  };
  error?: string;
}
```

## Error Handling

### Error Code Definitions

```typescript
enum ErrorCode {
  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INVALID_PARAMS = 'INVALID_PARAMS',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',

  // Wallet-related errors
  WALLET_NOT_UNLOCKED = 'WALLET_NOT_UNLOCKED',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  USER_REJECTED = 'USER_REJECTED',

  // Chain-related errors
  CHAIN_NOT_SUPPORTED = 'CHAIN_NOT_SUPPORTED',
  CHAIN_SWITCH_FAILED = 'CHAIN_SWITCH_FAILED',

  // Transaction-related errors
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  GAS_ESTIMATION_FAILED = 'GAS_ESTIMATION_FAILED',
  NONCE_ERROR = 'NONCE_ERROR',

  // DeFi-related errors
  INSUFFICIENT_LIQUIDITY = 'INSUFFICIENT_LIQUIDITY',
  SLIPPAGE_TOO_HIGH = 'SLIPPAGE_TOO_HIGH',
  PRICE_IMPACT_TOO_HIGH = 'PRICE_IMPACT_TOO_HIGH',
  BRIDGE_UNAVAILABLE = 'BRIDGE_UNAVAILABLE',

  // Browser automation errors
  BROWSER_NOT_AVAILABLE = 'BROWSER_NOT_AVAILABLE',
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  NAVIGATION_FAILED = 'NAVIGATION_FAILED',
  TIMEOUT_EXCEEDED = 'TIMEOUT_EXCEEDED',
  INVALID_SELECTOR = 'INVALID_SELECTOR',
  TAB_NOT_FOUND = 'TAB_NOT_FOUND',
}
```

### Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: string;
  errorCode: ErrorCode;
  details?: any;
  timestamp: number;
}
```

## Performance Monitoring

### Performance Metrics

```typescript
interface PerformanceMetrics {
  totalTools: number;           // Total number of tools
  totalCalls: number;           // Total call count
  totalErrors: number;          // Total error count
  successRate: number;          // Success rate (%)
  averageExecutionTime: number; // Average execution time (ms)
  cacheSize: number;            // Cache size
  cacheHitRate: number;         // Cache hit rate (%)
}
```

### Usage Statistics

```typescript
interface ToolUsageStats {
  name: string;                 // Tool name
  callCount: number;            // Call count
  successCount: number;         // Success count
  errorCount: number;           // Error count
  averageExecutionTime: number; // Average execution time
  lastCalled: number;           // Last call time
}
```

## Caching Mechanism

### Caching Strategy

- **Query tools**: 30-second TTL cache
- **Price queries**: 10-second TTL cache
- **Transaction tools**: No caching
- **DeFi tools**: No caching
- **Browser automation tools**: No caching (real-time interaction required)

### Cache Key Format

```
{toolName}_{JSON.stringify(params)}
```

### Cache Cleanup

- Automatic cleanup of expired cache
- Periodic cleanup (every 5 minutes)
- Manual cleanup interface

## Security Considerations

### Permission Control

- All transaction operations require user confirmation
- Sensitive operations require additional verification
- Permission level management

### Risk Control

- Transaction amount limits
- Slippage protection
- Price impact checks
- Malicious contract detection

### Audit Logging

- All operation records
- User behavior analysis
- Anomaly detection
- Compliance reporting

## Version Control

### API Version

Current version: `v1.0.0`

### Backward Compatibility

- Maintain stable main interfaces
- New parameters are optional
- Provide migration guide for deprecated interfaces

### Update Strategy

- Regular feature updates
- Timely security patches
- Advance notice for major changes
