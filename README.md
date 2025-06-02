# Betting Matching Engine

A sophisticated decentralized betting platform built on Ethereum with order book matching and AMM liquidity provision.

## 🚀 Features

- **Order Book Matching**: Place and match betting orders with custom odds
- **AMM Integration**: Automated Market Maker for instant liquidity
- **Multi-Network Support**: Deploy on Sepolia, Mumbai, Arbitrum Sepolia, and Base Sepolia
- **Oracle Integration**: Price feeds and market settlement
- **Comprehensive Testing**: Full test suite with edge case coverage
- **Gas Optimization**: Optimized smart contracts for minimal gas usage

## 📖 Complete System Walkthrough

Let's walk through a complete example of how the betting system works from deployment to settlement.

### Step 1: Quick Setup & Deployment

First, let's deploy the entire system with one command:

```bash
# Install dependencies
npm install

# Start local blockchain (in one terminal)
npm run node

# Deploy and setup everything (in another terminal)
npm run quick-setup
```

**Expected Output:**
```
🚀 Quick Setup: Deploy & Test Complete System
==================================================
📋 Accounts:
- Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
- User1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8  
- User2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

🏗️ Deploying contracts...
✅ MockUSDC: 0x610178dA211FEF7D417bC0e6FeD39F05609AD788
✅ MockOracle: 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
✅ BettingEngine: 0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0

💰 Setting up accounts...
✅ Funded and approved users

🎯 Creating test market...
✅ Market created: 0xfb287bef30c7e65fbe5f1b1f034a1d6fe1947350494d168f0a831eabe397a67d
```

### Step 2: Understanding the Market

The system creates a binary prediction market: **"Will ETH hit $4000?"**

- **Side A (YES)**: ETH will hit $4000
- **Side B (NO)**: ETH will NOT hit $4000
- **Market Duration**: 1 hour for betting, then 10 minutes for settlement
- **Base Token**: Mock USDC (6 decimals)

### Step 3: How Order Placement Works

Let's break down what happens when users place orders:

**User1 places a YES bet:**
```javascript
// User1 bets 100 USDC that ETH WILL hit $4000 at 2.0x odds
await bettingEngine.connect(user1).placeOrder(
    marketId,
    1,                              // Side A (YES) 
    ethers.parseUnits("100", 6),    // 100 USDC
    ethers.parseUnits("2.0", 18)    // 2.0x odds (if wins, gets 200 USDC back)
);
```

**What happens internally:**
1. **Collateral Calculation**: For Side A, collateral = bet amount = 100 USDC
2. **Token Transfer**: 100 USDC transferred from User1 to contract
3. **Order Storage**: Order stored with unique ID
4. **Matching Attempt**: System tries to match with existing orders

**User2 places a NO bet:**
```javascript
// User2 bets against ETH hitting $4000 at 2.5x odds
await bettingEngine.connect(user2).placeOrder(
    marketId,
    2,                              // Side B (NO)
    ethers.parseUnits("100", 6),    // 100 USDC potential payout
    ethers.parseUnits("2.5", 18)    // 2.5x odds
);
```

**What happens internally:**
1. **Collateral Calculation**: For Side B, collateral = (amount × odds) / 1e18 = (100 × 2.5) = 250 USDC
2. **Token Transfer**: 250 USDC transferred from User2 to contract
3. **Order Storage**: Order stored in order book
4. **Matching Check**: Orders don't match due to incompatible odds

### Step 4: Order Book State

After both orders, the order book looks like:

```
📊 Order Book for Market: 0xfb287...
┌─────────┬─────────┬─────────┬─────────┬─────────────┐
│ Order # │  Side   │ Amount  │  Odds   │    User     │
├─────────┼─────────┼─────────┼─────────┼─────────────┤
│    1    │ A (YES) │ 100 USD│  2.0x   │    User1    │
│    2    │ B (NO)  │ 100 USD│  2.5x   │    User2    │
└─────────┴─────────┴─────────┴─────────┴─────────────┘

Status: Orders not matched (incompatible odds)
```

### Step 5: Order Matching Logic

For orders to match, they must have:
- **Opposite sides**: One Side A, one Side B
- **Compatible odds**: Implied probability alignment

**Example of matching orders:**
```javascript
// User1: Side A, 100 USDC at 2.0x odds
// User3: Side B, 100 USDC at 2.0x odds
// These WOULD match because:
// - Opposite sides ✓
// - Compatible odds (both 2.0x) ✓
```

**When orders match:**
1. **Match Creation**: Unique match ID generated
2. **Volume Update**: Market volume increases
3. **Order Status**: Both orders marked as matched
4. **Event Emission**: `OrderMatched` event fired

### Step 6: AMM (Automated Market Maker) Functionality

When order book lacks liquidity, users can interact with the AMM:

**Adding Liquidity:**
```javascript
// User1 adds 200 USDC liquidity
await bettingEngine.connect(user1).addLiquidity(marketId, ethers.parseUnits("200", 6));
```

**What happens:**
1. **Pool Initialization**: 100 USDC → Reserve A, 100 USDC → Reserve B
2. **Share Calculation**: User1 gets 200 liquidity shares
3. **Token Transfer**: 200 USDC moved to contract

**Trading with AMM:**
```javascript
// User2 swaps 50 USDC for Side A tokens
await bettingEngine.connect(user2).swapWithAMM(marketId, 1, ethers.parseUnits("50", 6));
```

**Constant Product Formula (x × y = k):**
```
Before: Reserve A = 100, Reserve B = 100, k = 10,000
Swap: 50 USDC for Side A tokens
After: Reserve A = 150, Reserve B = 66.67, k = 10,000
User2 gets: 33.33 Side A tokens
```

### Step 7: Market Settlement Process

After the market end time passes, settlement begins:

**Oracle Updates:**
```javascript
// Oracle determines the outcome
await mockOracle.settleMarket(marketId, 1); // 1 = Side A wins (ETH hit $4000)
```

**Market Settlement:**
```javascript
// Anyone can trigger settlement after oracle confirms
await bettingEngine.settleMarket(marketId);
```

**What happens:**
1. **Time Check**: Verifies settlement time has passed
2. **Oracle Query**: Checks oracle for final outcome
3. **Market Update**: Market marked as settled with outcome
4. **State Change**: Market becomes inactive

### Step 8: Claiming Winnings

Winners can now claim their payouts:

```javascript
// If Side A won, User1 can claim winnings from any matches
await bettingEngine.connect(user1).claimWinnings(matchId);
```

**Payout Calculation:**
- **If User1's Side A wins**: Gets (100 USDC × 2.0 odds) = 200 USDC
- **If User2's Side B wins**: Gets (100 USDC × 2.5 odds) = 250 USDC
- **Losers**: Get nothing (lose their collateral)

### Step 9: Complete Example Output

Running the complete example shows:

```bash
💰 Final Balances:
- User1 USDC: 4,700.0    # Started with 5,000, spent 300 on bets/liquidity
- User2 USDC: 4,750.0    # Started with 5,000, spent 250 on bets
- User1 betting positions: 0.0
- User2 betting positions: 33.333333  # From AMM swap

📈 Market Statistics:
- Total Volume A: 0.0 USDC      # No matched orders
- Total Volume B: 0.0 USDC      # Orders in book but unmatched
- Active Orders: 2              # Both orders still active
- AMM Reserves: A=150, B=66.67  # After liquidity and swap
```

### Step 10: Advanced Scenarios

**Scenario A: Perfect Order Matching**
```javascript
// User1: 100 USDC on Side A at 2.0x
// User2: 100 USDC on Side B at 2.0x
// Result: Orders match, both users locked in
```

**Scenario B: Partial Matching**
```javascript
// User1: 200 USDC on Side A at 2.0x  
// User2: 100 USDC on Side B at 2.0x
// Result: 100 USDC matched, 100 USDC remains in order book
```

**Scenario C: AMM Arbitrage**
```javascript
// If AMM prices drift from fair value, arbitrageurs can:
// 1. Buy underpriced side from AMM
// 2. Place opposite order in order book
// 3. Profit from price difference
```

## 🎯 Key Concepts Explained

### Odds and Probability
- **2.0x odds** = 50% implied probability = "even money"
- **1.5x odds** = 66.7% implied probability = "likely to happen"  
- **3.0x odds** = 33.3% implied probability = "unlikely to happen"

### Collateral Requirements
- **Side A (YES)**: Pay the bet amount (if you win, get bet × odds)
- **Side B (NO)**: Pay the potential payout (if you win, get the payout amount)

### Risk Management
- **Maximum Loss**: Your collateral amount
- **Maximum Gain**: Unlimited (based on odds)
- **Liquidity**: AMM provides instant trading when order book is thin

## 🧪 Testing

### Local Testing
```bash
# Compile contracts
npm run compile

# Run all tests
npm test

# Run tests with gas reporting
npm run test:gas

# Run coverage analysis
npm run test:coverage
```

### Testnet Testing

1. **Get testnet ETH**
```bash
npm run faucet  # Shows faucet links
```

2. **Deploy to testnet**
```bash
# Deploy to Sepolia
npm run deploy:sepolia

# Deploy to Mumbai (Polygon)
npm run deploy:mumbai

# Deploy to Arbitrum Sepolia
npm run deploy:arbitrum

# Deploy to Base Sepolia
npm run deploy:base
```

3. **Run integration tests**
```bash
# Test on Sepolia
npm run test:sepolia

# Test on Mumbai
npm run test:mumbai

# Test on Arbitrum
npm run test:arbitrum

# Test on Base
npm run test:base
```

## 📊 Contract Architecture

### Core Contracts

- **BettingMatchingEngine.sol**: Main contract handling orders, matching, and AMM
- **MockUSDC.sol**: USDC token simulation for testing
- **MockPriceOracle.sol**: Oracle simulation for price feeds and settlement

### Key Features

#### Order Book System
- Place orders with custom amounts and odds
- Automatic order matching based on compatible odds
- Support for both sides of binary markets

#### AMM Integration
- Add liquidity to earn fees
- Instant swaps when order book lacks liquidity
- Constant product formula (x * y = k)

#### Market Settlement
- Oracle-based outcome determination
- Automatic payout calculation
- Winner claim functionality

## 🔧 Development Workflow

### 1. Local Development
```bash
# Start local Hardhat node
npm run node

# In another terminal, deploy locally
npx hardhat run scripts/testnet-deploy.js --network localhost

# Run interaction tests
npx hardhat run scripts/testnet-interact.js --network localhost
```

### 2. Testnet Deployment
```bash
# Deploy to your preferred testnet
npm run deploy:sepolia

# Verify contracts (optional)
npm run verify:sepolia <contract_address> <constructor_args>

# Run comprehensive tests
npm run test:sepolia
```

### 3. Contract Verification
```bash
# Verify on Etherscan
npx hardhat verify --network sepolia <contract_address> <constructor_args>

# Example for MockUSDC
npx hardhat verify --network sepolia 0x123... "1000000000000"

# Example for BettingEngine
npx hardhat verify --network sepolia 0x456... "0x123..." "0x789..."
```

## 📁 Project Structure

```
├── contracts/
│   ├── BettingMatchingEngine.sol    # Main betting contract
│   └── mocks/
│       ├── MockUSDC.sol            # USDC simulation
│       ├── MockERC20.sol           # Generic ERC20 for tests
│       └── MockPriceOracle.sol     # Oracle simulation
├── scripts/
│   ├── testnet-deploy.js           # Deployment script
│   ├── testnet-interact.js         # Integration testing
│   └── quick-setup.js              # One-command setup
├── test/
│   ├── BettingMatchingEngine.test.js # Comprehensive tests
│   └── test-deploy.js              # Deployment tests
├── deployments/                    # Deployment artifacts
├── hardhat.config.js              # Hardhat configuration
└── package.json                   # Dependencies and scripts
```

## 🌐 Supported Networks

| Network | Chain ID | RPC URL | Explorer |
|---------|----------|---------|----------|
| Sepolia | 11155111 | https://rpc.sepolia.org | https://sepolia.etherscan.io |
| Mumbai | 80001 | https://rpc-mumbai.maticvigil.com | https://mumbai.polygonscan.com |
| Arbitrum Sepolia | 421614 | https://sepolia-rollup.arbitrum.io/rpc | https://sepolia.arbiscan.io |
| Base Sepolia | 84532 | https://sepolia.base.org | https://sepolia.basescan.org |

## 🔍 Testing Scenarios

The test suite covers:

- ✅ Market creation and management
- ✅ Order placement and validation
- ✅ Order matching algorithms
- ✅ AMM liquidity provision
- ✅ Token swapping mechanics
- ✅ Oracle integration
- ✅ Market settlement
- ✅ Winnings distribution
- ✅ Security and edge cases
- ✅ Gas optimization

## 🚨 Security Considerations

- **Reentrancy Protection**: All external calls protected
- **Access Control**: Owner-only functions properly secured
- **Input Validation**: Comprehensive parameter checking
- **Integer Overflow**: SafeMath patterns used
- **Front-running**: Order matching designed to minimize MEV

## 📈 Gas Optimization

- Optimized storage layouts
- Batch operations where possible
- Efficient matching algorithms
- Minimal external calls

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add comprehensive tests
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Troubleshooting

### Common Issues

**"Transfer failed" errors**
- Ensure sufficient token balance
- Check token approvals
- Verify contract addresses

**"Market not active" errors**
- Check market end times
- Verify market hasn't been settled
- Ensure market exists

**Gas estimation failures**
- Increase gas limit in hardhat.config.js
- Check for reverted transactions
- Verify network connectivity

### Getting Help

1. Check the test files for usage examples
2. Review deployment logs in `deployments/` folder
3. Use Hardhat's built-in debugging tools
4. Check network-specific explorers for transaction details

## 🔗 Useful Links

- [Hardhat Documentation](https://hardhat.org/docs)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- [Ethers.js Documentation](https://docs.ethers.org)
- [Testnet Faucets](https://faucetlink.to/) 