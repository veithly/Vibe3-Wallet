# Vibe3 Wallet - AI-Powered Smart Wallet

Vibe3 Wallet is an AI-powered smart wallet, featuring an integrated Agent tool system that enables users to interact with their wallet through natural language commands.

## 🌟 Key Features

### 🤖 AI Agent System
- **Natural Language Interaction**: Operate wallet through natural language commands
- **Intelligent Tool Integration**: Complete wallet functionality toolset built-in
- **Multi-step Operations**: Support complex DeFi operation workflows
- **User Confirmation Mechanism**: All transaction operations require user confirmation

### 💰 Wallet Functionality
- **Multi-chain Support**: Support for Ethereum, Polygon, BSC, and other major blockchains
- **Token Management**: Complete token balance query and management
- **Transaction Sending**: Secure transaction sending and confirmation
- **DeFi Integration**: Built-in Swap and Bridge functionality

### 🔧 Agent Toolset

#### Query Tools (No Confirmation Required)
- `getBalance` - Balance queries
- `getTokenBalance` - Token balance queries
- `getTransactionHistory` - Transaction history queries
- `getTokenPrice` - Token price queries
- `getAllAssets` - All assets queries

#### Transaction Tools (Confirmation Required)
- `sendTransaction` - Send transactions
- `approveToken` - Token approvals

#### Advanced DeFi Tools (Confirmation Required)
- `swapTokens` - Token swaps
- `bridgeTokens` - Cross-chain bridging

#### Browser Automation Tools (No Confirmation Required)
- `navigateToUrl` - Navigate to web pages
- `clickElement` - Click web elements
- `fillForm` - Fill out forms
- `waitFor` - Wait for page conditions
- `scrollPage` - Scroll page content
- `takeScreenshot` - Capture screenshots
- `switchTab` - Switch browser tabs
- `closeTab` - Close browser tabs
- `elementSelection` - Visual element selection
- `elementAnalysis` - Element accessibility analysis
- `findElements` - Find page elements
- `highlightElement` - Highlight elements

## 🚀 Quick Start

### Install Dependencies
```bash
npm install
```

### Start Development Environment
```bash
npm run dev
```

### Build Production Version
```bash
npm run build
```

## 📖 Usage Guide

### Natural Language Interaction Examples

#### Query Operations
```
User: "Check my wallet balance"
Agent: Calls getBalance tool

User: "What's the price of ETH?"
Agent: Calls getTokenPrice tool

User: "Show recent transaction history"
Agent: Calls getTransactionHistory tool
```

#### Transaction Operations
```
User: "Send 0.1 ETH to 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6"
Agent: Calls sendTransaction tool, displays confirmation interface

User: "Approve USDC for Uniswap"
Agent: Calls approveToken tool, displays confirmation interface
```

#### DeFi Operations
```
User: "Swap 1 ETH for USDC"
Agent: Calls swapTokens tool, displays swap details and confirmation interface

User: "Bridge 0.5 ETH from Ethereum to Polygon"
Agent: Calls bridgeTokens tool, displays bridge details and confirmation interface
```

#### Browser Automation Operations
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

## 📚 Documentation

- [Agent Tools User Guide](./docs/agent-tools.md) - Detailed tool usage instructions
- [API Reference Documentation](./docs/api-reference.md) - Complete technical interface documentation

## 🏗️ Architecture Design

### Core Components

#### ToolRegistry
- Tool registration and management
- Caching mechanism and performance optimization
- Usage statistics and monitoring

#### Web3Action
- Wallet functionality execution engine
- User confirmation mechanism integration
- Error handling and retry logic

#### ConfirmationManager
- Transaction confirmation workflow management
- Risk assessment and user notifications
- Security mechanism safeguards

#### BrowserAutomationController
- Browser automation and web interaction
- Element selection and analysis
- Screenshot and tab management
- Form filling and navigation

### Technology Stack

- **Frontend**: React + TypeScript
- **Wallet**: Based on Rabby wallet
- **AI**: LangChain + OpenAI
- **Blockchain**: Web3.js + Ethers.js
- **Browser Automation**: Puppeteer + Chrome Extension API
- **Caching**: In-memory cache + persistent storage

## 🔒 Security Features

### User Confirmation Mechanism
- All transaction operations require user confirmation
- Detailed transaction information display
- Risk assessment and warning notifications

### Permission Control
- Sensitive operations require additional verification
- Permission level management
- Operation audit logging

### Risk Control
- Transaction amount limits
- Slippage protection
- Price impact checks
- Malicious contract detection

## 🧪 Testing

### Run Tests
```bash
npm test
```

### Test Coverage
- Unit Tests: Tool functionality testing
- Integration Tests: Agent system testing
- End-to-End Tests: User interaction testing
- Browser Automation Tests: Web interaction testing

## 📊 Performance Monitoring

### Performance Metrics
- Tool execution time statistics
- Cache hit rate monitoring
- Error rate and success rate tracking
- User behavior analysis

### Monitoring Dashboard
- Real-time performance metrics
- Tool usage statistics
- System health status
- Anomaly alert mechanism

## 🤝 Contributing

### Development Environment Setup
1. Fork the project
2. Create a feature branch
3. Commit code changes
4. Create a Pull Request

### Code Standards
- Use TypeScript
- Follow ESLint rules
- Add unit tests
- Update relevant documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Common Issues
- Check [FAQ](./docs/faq.md)
- Search [Issues](../../issues)
- View [Wiki](../../wiki)

### Get Help
- Create an [Issue](../../issues/new)
- Contact technical support
- Join community discussions

## 🔄 Changelog

### v1.0.0 (2024-01-XX)
- 🎉 Initial version release
- ✨ Support for basic query and transaction functions
- 🔧 Integration of advanced DeFi tools
- 🔒 Implementation of user confirmation mechanism
- ⚡ Addition of performance optimization and monitoring
- 🌐 Complete browser automation toolset
- 📚 Complete documentation and guides

---

**Vibe3 Wallet** - Making blockchain interaction smarter, safer, and simpler!