// scripts/testnet-deploy.js
const { ethers } = require("hardhat");
const fs = require('fs');

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = hre.network.name;
  
  console.log(`\n🚀 Deploying to ${network.toUpperCase()} testnet`);
  console.log("Deploying with account:", deployer.address);
  
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");
  
  if (balance < ethers.parseEther("0.1")) {
    console.log("⚠️  Low balance! Get testnet ETH from:");
    console.log("Sepolia: https://sepoliafaucet.com/");
    console.log("Mumbai: https://faucet.polygon.technology/");
    console.log("Base Sepolia: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");
    return;
  }

  try {
    // Deploy Mock Token (for testing - use real USDC in production)
    console.log("\n📄 Deploying Mock USDC...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy(
      "Test USDC",
      "tUSDC", 
      ethers.parseEther("1000000")
    );
    await mockToken.waitForDeployment();
    const tokenAddress = await mockToken.getAddress();
    console.log("✅ Mock USDC deployed:", tokenAddress);

    // Deploy Mock Oracle
    console.log("\n🔮 Deploying Mock Oracle...");
    const MockOracle = await ethers.getContractFactory("MockPriceOracle");
    const mockOracle = await MockOracle.deploy();
    await mockOracle.waitForDeployment();
    const oracleAddress = await mockOracle.getAddress();
    console.log("✅ Mock Oracle deployed:", oracleAddress);

    // Deploy Betting Engine
    console.log("\n🎲 Deploying Betting Matching Engine...");
    const BettingEngine = await ethers.getContractFactory("BettingMatchingEngine");
    const bettingEngine = await BettingEngine.deploy(tokenAddress, oracleAddress);
    await bettingEngine.waitForDeployment();
    const engineAddress = await bettingEngine.getAddress();
    console.log("✅ Betting Engine deployed:", engineAddress);

    // Create test market
    console.log("\n📊 Creating test market...");
    const description = `Test Market - ${new Date().toLocaleDateString()}`;
    const endTime = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours
    const settlementTime = endTime + (60 * 60); // 1 hour after end
    
    const createTx = await bettingEngine.createMarket(description, endTime, settlementTime);
    const receipt = await createTx.wait();
    
    const event = receipt.logs.find(log => 
      log.topics[0] === ethers.id("MarketCreated(bytes32,string,uint256)")
    );
    const marketId = event?.topics[1];
    console.log("✅ Test market created:", marketId);

    // Save deployment info
    const deploymentInfo = {
      network,
      chainId: await deployer.provider.getNetwork().then(n => n.chainId),
      deployer: deployer.address,
      contracts: {
        mockToken: tokenAddress,
        mockOracle: oracleAddress,
        bettingEngine: engineAddress,
      },
      testMarket: {
        id: marketId,
        description,
        endTime,
        settlementTime,
      },
      deployedAt: new Date().toISOString(),
      blockNumber: await deployer.provider.getBlockNumber(),
    };

    const filename = `deployments/testnet-${network}.json`;
    fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\n💾 Deployment info saved to ${filename}`);

    // Print verification commands
    console.log("\n🔍 Verify contracts with:");
    console.log(`npx hardhat verify --network ${network} ${tokenAddress} "Test USDC" "tUSDC" "1000000000000000000000000"`);
    console.log(`npx hardhat verify --network ${network} ${oracleAddress}`);
    console.log(`npx hardhat verify --network ${network} ${engineAddress} ${tokenAddress} ${oracleAddress}`);

    // Print explorer links
    const explorers = {
      sepolia: "https://sepolia.etherscan.io",
      mumbai: "https://mumbai.polygonscan.com",
      arbitrumSepolia: "https://sepolia.arbiscan.io",
      baseSepolia: "https://sepolia.basescan.org",
    };
    
    if (explorers[network]) {
      console.log(`\n🌐 View on explorer: ${explorers[network]}/address/${engineAddress}`);
    }

    return {
      mockToken: tokenAddress,
      mockOracle: oracleAddress,
      bettingEngine: engineAddress,
      marketId,
    };

  } catch (error) {
    console.error("❌ Deployment failed:", error.message);
    process.exit(1);
  }
}

// scripts/testnet-interact.js - Interactive testing script
async function testInteractions() {
  const network = hre.network.name;
  const deploymentFile = `deployments/testnet-${network}.json`;
  
  if (!fs.existsSync(deploymentFile)) {
    console.log("❌ No deployment found. Run deploy script first.");
    return;
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile));
  const [user1, user2] = await ethers.getSigners();
  
  console.log(`\n🧪 Testing on ${network.toUpperCase()}`);
  console.log("User 1:", user1.address);
  console.log("User 2:", user2.address);

  // Get contract instances
  const mockToken = await ethers.getContractAt("MockERC20", deployment.contracts.mockToken);
  const bettingEngine = await ethers.getContractAt("BettingMatchingEngine", deployment.contracts.bettingEngine);
  const mockOracle = await ethers.getContractAt("MockPriceOracle", deployment.contracts.mockOracle);

  try {
    // Give users some test tokens
    console.log("\n💰 Distributing test tokens...");
    const tokenAmount = ethers.parseEther("1000");
    
    await mockToken.mint(user1.address, tokenAmount);
    await mockToken.mint(user2.address, tokenAmount);
    console.log("✅ Tokens distributed");

    // Approve spending
    console.log("\n✅ Setting approvals...");
    await mockToken.connect(user1).approve(deployment.contracts.bettingEngine, tokenAmount);
    await mockToken.connect(user2).approve(deployment.contracts.bettingEngine, tokenAmount);
    console.log("✅ Approvals set");

    // Test order placement
    console.log("\n📋 Testing order placement...");
    const marketId = deployment.testMarket.id;
    const betAmount = ethers.parseEther("100");
    const odds = ethers.parseEther("2.0"); // 2.0x odds

    // User 1 bets on side A
    const order1Tx = await bettingEngine.connect(user1).placeOrder(
      marketId, 1, betAmount, odds
    );
    await order1Tx.wait();
    console.log("✅ User 1 placed bet on side A");

    // User 2 bets on side B (should match)
    const order2Tx = await bettingEngine.connect(user2).placeOrder(
      marketId, 2, betAmount, odds
    );
    const receipt = await order2Tx.wait();
    console.log("✅ User 2 placed bet on side B");

    // Check if orders matched
    const matchEvent = receipt.logs.find(log => 
      log.topics[0] === ethers.id("OrderMatched(bytes32,bytes32,bytes32)")
    );
    
    if (matchEvent) {
      console.log("🎯 Orders matched! Match ID:", matchEvent.topics[1]);
      
      // Test settlement after some time
      console.log("\n⏰ Waiting for settlement time...");
      console.log("In production, wait for market end time then call settleMarket()");
      
      // For testing, we can set oracle outcome immediately
      await mockOracle.setOutcome(marketId, true, 1); // Side A wins
      console.log("✅ Oracle outcome set (Side A wins)");
      
    } else {
      console.log("📝 Orders placed but not matched (different odds/amounts)");
    }

    // Test AMM functionality
    console.log("\n🌊 Testing AMM liquidity...");
    const liquidityAmount = ethers.parseEther("500");
    
    await bettingEngine.connect(user1).addLiquidity(marketId, liquidityAmount);
    console.log("✅ Liquidity added to AMM");

    // Test AMM swap
    const swapAmount = ethers.parseEther("50");
    await bettingEngine.connect(user2).swapWithAMM(marketId, 1, swapAmount);
    console.log("✅ AMM swap completed");

    // Get order book
    console.log("\n📖 Current order book:");
    const [orderIds, amounts, oddsArray, sides] = await bettingEngine.getOrderBook(marketId);
    console.log(`Active orders: ${orderIds.length}`);
    
    for (let i = 0; i < orderIds.length; i++) {
      console.log(`Order ${i}: ${ethers.formatEther(amounts[i])} tokens at ${ethers.formatEther(oddsArray[i])}x odds (Side ${sides[i]})`);
    }

    console.log("\n✅ All tests completed successfully!");

  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main, testInteractions };