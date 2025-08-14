# Vibe3 - AI Agent Smart Wallet

Vibe3 is a revolutionary AI-powered smart contract wallet that combines traditional EVM wallet functionality with advanced AI Agent capabilities. Vibe3 transforms complex Web3 operations (cross-chain, swaps, liquidity mining, etc.) into simple natural language commands, enabling seamless, secure, and intelligent DeFi interactions.

## 🌟 Key Features

### AI-Powered DeFi Automation
- **Natural Language Processing**: Execute complex DeFi operations with simple voice/text commands
- **Intent-Driven Interactions**: AI Agent automatically analyzes and executes optimal transaction paths
- **Multi-Agent Coordination**: Specialized agents for planning, navigation, and validation
- **Risk Assessment**: Real-time security analysis and transaction simulation

### Smart Contract Wallet
- **EIP-7702 Integration**: Revolutionary subscription payment system with gasless transactions
- **Advanced Security**: Multi-layer protection with MPC server backup
- **Automated Approvals**: Smart authorization system with customizable risk levels
- **Cross-Chain Intelligence**: Seamless multi-chain asset management and optimization

### Comprehensive DeFi Suite
- **Cross-Chain Aggregation**: Integration with LI.FI, Socket, Via Protocol for optimal routing
- **Swap Optimization**: 1inch and DEX aggregators for best pricing
- **Automated Tasks**: Complete Galxe, Zealy, and other DeFi tasks automatically
- **Yield Optimization**: Intelligent APY analysis and portfolio management

## 🚀 Quick Start

### Installation

Download the latest Vibe3 [here](https://github.com/vibe3/vibe3/releases/latest).

### Basic Usage

1. **Create/Import Wallet**: Generate new mnemonic or import existing EVM wallet
2. **AI Command**: Simply speak or type your DeFi intent:
   - *"Swap 1 ETH on Ethereum for WBTC on Polygon"*
   - *"Find the highest APY liquidity pool"*
   - *"Complete daily Galxe tasks"*
3. **Review & Confirm**: AI provides optimal solution with risk analysis
4. **Auto-Execute**: Agent handles complex multi-step operations automatically

## 🎯 Core User Scenarios

### For DeFi Beginners
- **Smart Participation**: "Participate in XYZ project's token launch"
- **Automated Asset Management**: AI ensures sufficient gas and required tokens
- **Risk Protection**: Built-in security checks and guidance

### For Power Users
- **Yield Optimization**: "Find higher APY staking options with risk analysis"
- **Cross-Chain Operations**: Seamless multi-chain swaps and bridges
- **Automated Tasks**: Batch operations and conditional execution

### For Developers
- **API Integration**: Programmatic access through MCP services
- **Custom Agents**: Build specialized AI agents for specific use cases
- **Extensible Architecture**: Easy integration with new protocols

## 🏗️ Architecture

![architecture](./docs/architecture.png)

### Multi-Agent System
- **Planner Agent**: Analyzes tasks and creates execution strategies
- **Navigator Agent**: Executes web interactions and automation
- **Validator Agent**: Verifies task completion and validates results

### Security Architecture
- **Private Key Protection**: Local browser storage with MPC backup
- **Transaction Simulation**: Pre-execution simulation using Tenderly and BlockSec
- **Risk Assessment**: Real-time security analysis for contracts and transactions
- **Permission Management**: Granular permission system for dApp connections

## 📦 Development

### Install Dependencies

1. Install Node.js version 22 or later
2. Install Yarn: `npm install -g yarn`
3. Run `yarn` to install dependencies

### Development

Run `yarn build:dev` to develop with file watching and development logging.

Run `yarn build:pro` to build a production package, which will be in the `dist` folder.

### Testing

Run `yarn test` to execute the test suite.

Run `yarn lint:fix` to fix ESLint issues automatically.

## 🔧 Integration Guide

### dApp Integration

Vibe3 maintains full EIP-1193 compatibility for seamless dApp integration:

```javascript
// Standard Web3 provider integration
if (typeof window.ethereum !== 'undefined') {
  const accounts = await window.ethereum.request({
    method: 'eth_requestAccounts'
  });
  
  // Vibe3-specific features
  if (window.ethereum.isVibe3) {
    // Access AI-powered features
    const aiCapabilities = await window.ethereum.request({
      method: 'vibe3_getCapabilities'
    });
  }
}
```

### AI Command Integration

Enable natural language DeFi operations in your dApp:

```javascript
// Execute AI-powered DeFi operations
const result = await window.ethereum.request({
  method: 'vibe3_executeIntent',
  params: [{
    intent: "Swap 1 ETH for USDC on Polygon",
    riskLevel: "medium"
  }]
});
```

## 🎁 Vibe3 AI Pro Membership

### Free Tier
- Basic wallet functionality
- Limited AI Agent queries (10 per month)
- Standard swap recommendations

### Pro Tier
- Unlimited AI Agent usage
- Advanced strategy analysis
- Transaction automation
- Priority MPC server access
- Exclusive community features

### Subscription Payment
- EIP-7702 gasless transactions
- Stablecoin payment options (USDC, USDT)
- One-click subscription management

## 🔒 Security

Vibe3 implements enterprise-grade security measures:

- **Top Security Audits**: All code audited by leading security firms
- **MPC Server Security**: Financial-grade physical and network security
- **User-Controlled Rules**: Strict, user-configurable automation limits
- **Privacy Protection**: Encrypted transaction data and AI query history

## 🌐 Supported Chains

- Ethereum
- Polygon
- BSC
- Arbitrum
- Optimism
- Avalanche
- Base
- And more...

## 🤝 Contribution

We welcome contributions from the community! Please see our [contribution guidelines](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Thanks

Special thanks to the Rabby team and MetaMask community for their foundational work in browser extension wallet development. Vibe3 builds upon these innovations to bring AI-powered DeFi automation to the next level.

## 📞 Support

- **Documentation**: [docs.vibe3.ai](https://docs.vibe3.ai)
- **Community**: [community.vibe3.ai](https://community.vibe3.ai)
- **Support**: support@vibe3.ai

---

**Vibe3 - Your AI-Powered DeFi Assistant**