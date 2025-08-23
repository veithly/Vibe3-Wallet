# Vibe3 Wallet Agent Tools User Guide

## Overview

Vibe3 Wallet integrates a powerful AI Agent tool system that allows users to interact with the wallet through natural language. This document provides detailed information about all available wallet tools and their usage methods.

## Tool Categories

### 1. Query Tools (No User Confirmation Required)

#### getBalance - Balance Query
Get wallet total balance and asset information.

**Parameters:**
- `address` (string, required): Wallet address (0x format)
- `chainId` (number, optional): Chain ID (default: current chain)

**Example:**
```javascript
// Query balance for specified address
{
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "chainId": 1
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalBalance": "1.234 ETH",
    "tokens": [
      {
        "symbol": "USDC",
        "balance": "1000.00",
        "value": "$1000.00"
      }
    ]
  }
}
```

#### getTokenBalance - Token Balance Query
Get specific token balance.

**Parameters:**
- `address` (string, required): Wallet address
- `tokenAddress` (string, required): Token contract address
- `chainId` (number, optional): Chain ID

**Example:**
```javascript
{
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "tokenAddress": "0xA0b86a33E6441b8C4C9db96C4b4d8b6",
  "chainId": 1
}
```

#### getTransactionHistory - Transaction History Query
Get wallet transaction history.

**Parameters:**
- `address` (string, required): Wallet address
- `chainId` (number, optional): Chain ID
- `limit` (number, optional): Number of transactions to return (default: 50, max: 200)

**Example:**
```javascript
{
  "address": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "limit": 20
}
```

#### getTokenPrice - Token Price Query
Get current token price.

**Parameters:**
- `token` (string, required): Token contract address or symbol
- `chainId` (number, optional): Chain ID
- `quoteCurrency` (string, optional): Quote currency (default: USD)

**Example:**
```javascript
{
  "token": "ETH",
  "quoteCurrency": "USD"
}
```

#### getAllAssets - All Assets Query
Get all wallet assets (tokens and NFTs).

**Parameters:**
- `address` (string, required): Wallet address
- `chainId` (number, optional): Chain ID

### 2. Transaction Tools (User Confirmation Required)

#### sendTransaction - Send Transaction
Send transaction to specified address.

**Parameters:**
- `to` (string, required): Recipient address
- `value` (string, required): Transaction amount (ETH)
- `data` (string, optional): Transaction data (hexadecimal)
- `chainId` (number, optional): Chain ID
- `gasPrice` (string, optional): Gas price (Gwei)

**Example:**
```javascript
{
  "to": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "value": "0.1",
  "chainId": 1
}
```

**Security Tips:**
- All transaction operations require user confirmation
- Carefully verify recipient address and amount
- Consider testing with small amounts first

#### approveToken - Token Approval
Approve token for contract usage.

**Parameters:**
- `tokenAddress` (string, required): Token contract address
- `spender` (string, required): Spender contract address
- `amount` (string, required): Approval amount (use "0" for unlimited approval)
- `chainId` (number, optional): Chain ID

**Example:**
```javascript
{
  "tokenAddress": "0xA0b86a33E6441b8C4C9db96C4b4d8b6",
  "spender": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "amount": "1000"
}
```

**Security Tips:**
- Unlimited approval poses security risks, use with caution
- Only approve necessary amounts
- Regularly review and revoke unnecessary approvals

### 3. Advanced DeFi Tools (User Confirmation Required)

#### swapTokens - Token Swap
Swap tokens using DEX aggregator.

**Parameters:**
- `fromToken` (string, required): Source token (contract address or symbol)
- `toToken` (string, required): Target token (contract address or symbol)
- `amount` (string, required): Swap amount
- `chainId` (number, optional): Chain ID
- `slippage` (number, optional): Slippage tolerance (default: 0.5%)
- `preferredDex` (string, optional): Preferred DEX (e.g., "Uniswap", "1inch")

**Example:**
```javascript
{
  "fromToken": "ETH",
  "toToken": "USDC",
  "amount": "1.0",
  "slippage": 1.0,
  "preferredDex": "Uniswap"
}
```

**Security Tips:**
- Carefully verify token addresses and swap ratios
- Pay attention to slippage settings, high values may cause losses
- Consider testing with small amounts first

#### bridgeTokens - Cross-chain Bridge
Bridge tokens between different blockchain networks.

**Parameters:**
- `token` (string, required): Token (contract address or symbol)
- `amount` (string, required): Bridge amount
- `fromChainId` (number, required): Source chain ID
- `toChainId` (number, required): Target chain ID
- `recipient` (string, optional): Recipient address (default: current address)
- `preferredBridge` (string, optional): Preferred bridge protocol

**Example:**
```javascript
{
  "token": "ETH",
  "amount": "0.5",
  "fromChainId": 1,
  "toChainId": 137,
  "preferredBridge": "Polygon Bridge"
}
```

**Security Tips:**
- Cross-chain operations take longer, please be patient
- Ensure target chain network stability
- Use officially recommended bridge protocols

### 4. Browser Automation Tools (No User Confirmation Required)

#### navigateToUrl - Navigate to URL
Navigate to a specific URL in the browser.

**Parameters:**
- `url` (string, required): The URL to navigate to
- `waitFor` (string, optional): Wait condition (load, networkidle, selector)
- `timeout` (number, optional): Timeout in milliseconds (1000-60000)

**Example:**
```javascript
{
  "url": "https://app.uniswap.org",
  "waitFor": "networkidle",
  "timeout": 30000
}
```

#### clickElement - Click Element
Click on a web element using CSS selector or text content.

**Parameters:**
- `selector` (string, optional): CSS selector for the element to click
- `text` (string, optional): Text content to find and click (alternative to selector)
- `waitForNavigation` (boolean, optional): Wait for navigation after click
- `timeout` (number, optional): Timeout in milliseconds (1000-30000)

**Example:**
```javascript
{
  "selector": "#connect-wallet",
  "waitForNavigation": true,
  "timeout": 10000
}
```

#### fillForm - Fill Form
Fill out forms with provided data.

**Parameters:**
- `fields` (array, required): Array of form fields to fill
- `submit` (boolean, optional): Whether to submit the form after filling

**Example:**
```javascript
{
  "fields": [
    {
      "selector": "#email",
      "value": "user@example.com",
      "type": "email"
    },
    {
      "selector": "#password",
      "value": "securepassword",
      "type": "password"
    }
  ],
  "submit": true
}
```

#### waitFor - Wait for Condition
Wait for elements or conditions on the page.

**Parameters:**
- `condition` (string, required): Wait condition (selector, text, networkidle)
- `timeout` (number, optional): Timeout in milliseconds
- `selector` (string, optional): CSS selector to wait for
- `text` (string, optional): Text content to wait for

**Example:**
```javascript
{
  "condition": "selector",
  "selector": ".wallet-connect-button",
  "timeout": 10000
}
```

#### scrollPage - Scroll Page
Scroll the page to reveal content.

**Parameters:**
- `direction` (string, optional): Scroll direction (up, down, left, right)
- `amount` (number, optional): Scroll amount in pixels
- `selector` (string, optional): Scroll to specific element
- `smooth` (boolean, optional): Smooth scrolling

**Example:**
```javascript
{
  "direction": "down",
  "amount": 500,
  "smooth": true
}
```

#### takeScreenshot - Take Screenshot
Capture page screenshots.

**Parameters:**
- `selector` (string, optional): Screenshot specific element
- `fullPage` (boolean, optional): Full page screenshot
- `quality` (number, optional): Image quality (1-100)
- `format` (string, optional): Image format (png, jpeg)

**Example:**
```javascript
{
  "fullPage": true,
  "quality": 90,
  "format": "png"
}
```

#### switchTab - Switch Tab
Switch between browser tabs.

**Parameters:**
- `tabId` (number, optional): Specific tab ID to switch to
- `url` (string, optional): Switch to tab with specific URL
- `title` (string, optional): Switch to tab with specific title

**Example:**
```javascript
{
  "url": "https://app.uniswap.org"
}
```

#### closeTab - Close Tab
Close browser tabs.

**Parameters:**
- `tabId` (number, optional): Specific tab ID to close
- `url` (string, optional): Close tab with specific URL
- `all` (boolean, optional): Close all tabs except current

**Example:**
```javascript
{
  "url": "https://app.uniswap.org"
}
```

#### elementSelection - Element Selection
Activate element selection mode for visual interaction.

**Parameters:**
- `mode` (string, required): Selection mode (highlight, select, analyze)
- `filter` (string, optional): Filter elements by criteria
- `visibleOnly` (boolean, optional): Only select visible elements

**Example:**
```javascript
{
  "mode": "highlight",
  "visibleOnly": true
}
```

#### elementAnalysis - Element Analysis
Analyze web page elements for accessibility and interaction.

**Parameters:**
- `selector` (string, required): CSS selector for the element
- `includeAccessibility` (boolean, optional): Include accessibility analysis
- `includeEvents` (boolean, optional): Include event analysis

**Example:**
```javascript
{
  "selector": "#connect-wallet",
  "includeAccessibility": true,
  "includeEvents": true
}
```

#### findElements - Find Elements
Find elements on the page based on various criteria.

**Parameters:**
- `selector` (string, optional): CSS selector
- `text` (string, optional): Text content
- `tagName` (string, optional): HTML tag name
- `visibleOnly` (boolean, optional): Only visible elements
- `limit` (number, optional): Maximum number of results

**Example:**
```javascript
{
  "text": "Connect Wallet",
  "visibleOnly": true,
  "limit": 10
}
```

#### highlightElement - Highlight Element
Highlight elements on the page for visual feedback.

**Parameters:**
- `selector` (string, required): CSS selector for the element
- `color` (string, optional): Highlight color (hex or name)
- `duration` (number, optional): Highlight duration in milliseconds
- `style` (string, optional): Highlight style (border, background, outline)

**Example:**
```javascript
{
  "selector": "#connect-wallet",
  "color": "red",
  "duration": 3000,
  "style": "border"
}
```

## Best Practices

### 1. Security Recommendations
- Always verify transaction parameters
- Use small test transactions
- Regularly check approval status
- Keep private keys secure

### 2. Performance Optimization
- Query tools support caching, repeated queries are faster
- Set reasonable slippage and gas prices
- Avoid large transactions during network congestion

### 3. Error Handling
- All tools have comprehensive error handling
- Failed operations are automatically retried
- Detailed error information is logged

### 4. Monitoring and Statistics
- Tool usage is tracked
- Performance metrics are monitored
- Cache is regularly cleaned for optimal performance

### 5. Browser Automation Best Practices
- Use specific selectors for reliable element targeting
- Implement appropriate wait conditions for dynamic content
- Handle network delays and page load times
- Test automation scripts on different page states

## Natural Language Interaction Examples

### Query Operations
```
User: "Check my wallet balance"
Agent: Calls getBalance tool

User: "What's the price of ETH?"
Agent: Calls getTokenPrice tool

User: "Show recent transaction history"
Agent: Calls getTransactionHistory tool
```

### Transaction Operations
```
User: "Send 0.1 ETH to 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6"
Agent: Calls sendTransaction tool, displays confirmation interface

User: "Approve USDC for Uniswap"
Agent: Calls approveToken tool, displays confirmation interface
```

### DeFi Operations
```
User: "Swap 1 ETH for USDC"
Agent: Calls swapTokens tool, displays swap details and confirmation interface

User: "Bridge 0.5 ETH from Ethereum to Polygon"
Agent: Calls bridgeTokens tool, displays bridge details and confirmation interface
```

### Browser Automation Operations
```
User: "Go to Uniswap and connect my wallet"
Agent: Calls navigateToUrl, then clickElement for wallet connection

User: "Fill out the swap form with 1 ETH to USDC"
Agent: Calls fillForm with swap parameters

User: "Take a screenshot of the current page"
Agent: Calls takeScreenshot tool

User: "Find all buttons on the page"
Agent: Calls findElements with button criteria
```

## Troubleshooting

### Common Issues

1. **Tool Execution Failed**
   - Check network connection
   - Verify parameter format
   - Review error logs

2. **Transaction Confirmation Failed**
   - Check wallet balance
   - Verify gas fees
   - Confirm network status

3. **Token Swap Failed**
   - Check token addresses
   - Adjust slippage settings
   - Confirm sufficient liquidity

4. **Browser Automation Failed**
   - Check if page is fully loaded
   - Verify element selectors are correct
   - Ensure browser tab is active
   - Check for dynamic content loading

### Getting Help
- Review detailed error logs
- Contact technical support
- Refer to API documentation

## Changelog

### v1.0.0 (2024-01-XX)
- Initial version release
- Support for basic query and transaction functions
- Integration of advanced DeFi tools
- Implementation of user confirmation mechanism
- Addition of performance optimization and monitoring
- Complete browser automation toolset
- Enhanced element interaction capabilities
