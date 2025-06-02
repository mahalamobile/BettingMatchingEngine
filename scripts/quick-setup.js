const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Quick Setup: Deploy & Test Complete System");
    console.log("=" .repeat(50));
    
    const [deployer, user1, user2] = await ethers.getSigners();
    
    console.log("📋 Accounts:");
    console.log("- Deployer:", deployer.address);
    console.log("- User1:", user1.address);  
    console.log("- User2:", user2.address);
    
    // 1. Deploy all contracts
    console.log("\n🏗️  Deploying contracts...");
    
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.deploy(ethers.parseUnits("1000000", 6));
    await mockUSDC.waitForDeployment();
    console.log("✅ MockUSDC:", await mockUSDC.getAddress());
    
    const MockOracle = await ethers.getContractFactory("MockPriceOracle");
    const mockOracle = await MockOracle.deploy();
    await mockOracle.waitForDeployment();
    console.log("✅ MockOracle:", await mockOracle.getAddress());
    
    const BettingEngine = await ethers.getContractFactory("BettingMatchingEngine");
    const bettingEngine = await BettingEngine.deploy(
        await mockUSDC.getAddress(),
        await mockOracle.getAddress()
    );
    await bettingEngine.waitForDeployment();
    console.log("✅ BettingEngine:", await bettingEngine.getAddress());
    
    // 2. Setup accounts
    console.log("\n💰 Setting up accounts...");
    await mockUSDC.mint(user1.address, ethers.parseUnits("5000", 6));
    await mockUSDC.mint(user2.address, ethers.parseUnits("5000", 6));
    await mockUSDC.connect(user1).approve(bettingEngine.getAddress(), ethers.parseUnits("5000", 6));
    await mockUSDC.connect(user2).approve(bettingEngine.getAddress(), ethers.parseUnits("5000", 6));
    console.log("✅ Funded and approved users");
    
    // 3. Create market
    console.log("\n🎯 Creating test market...");
    const endTime = Math.floor(Date.now() / 1000) + 3600;
    const settlementTime = endTime + 600;
    
    const tx = await bettingEngine.createMarket(
        "Quick Test: Will ETH hit $4000?",
        endTime,
        settlementTime
    );
    const receipt = await tx.wait();
    const marketEvent = receipt.logs.find(log => {
        try {
            return bettingEngine.interface.parseLog(log).name === 'MarketCreated';
        } catch (e) {
            return false;
        }
    });
    const marketId = bettingEngine.interface.parseLog(marketEvent).args.marketId;
    console.log("✅ Market created:", marketId);
    
    // 4. Place orders and test matching
    console.log("\n📝 Testing order placement...");
    const order1Tx = await bettingEngine.connect(user1).placeOrder(
        marketId,
        1, // side A
        ethers.parseUnits("100", 6),
        ethers.parseUnits("2.0", 18)
    );
    await order1Tx.wait();
    console.log("✅ User1 placed order (Side A, 100 USDC, 2.0x)");
    
    const order2Tx = await bettingEngine.connect(user2).placeOrder(
        marketId, 
        2, // side B
        ethers.parseUnits("100", 6),
        ethers.parseUnits("2.0", 18)
    );
    const order2Receipt = await order2Tx.wait();
    
    // Check if orders matched
    const matchEvent = order2Receipt.logs.find(log => {
        try {
            return bettingEngine.interface.parseLog(log).name === 'OrderMatched';
        } catch (e) {
            return false;
        }
    });
    
    if (matchEvent) {
        console.log("🔄 Orders matched successfully!");
    } else {
        console.log("📋 Orders placed but not matched (different odds)");
    }
    
    // 5. Test AMM
    console.log("\n💧 Testing AMM functionality...");
    await bettingEngine.connect(user1).addLiquidity(marketId, ethers.parseUnits("200", 6));
    console.log("✅ Added liquidity");
    
    await bettingEngine.connect(user2).swapWithAMM(marketId, 1, ethers.parseUnits("50", 6));
    console.log("✅ Executed AMM swap");
    
    // 6. Show final state
    console.log("\n📊 Final state:");
    const user1Balance = await mockUSDC.balanceOf(user1.address);
    const user2Balance = await mockUSDC.balanceOf(user2.address);
    const user1BettingBalance = await bettingEngine.userBalances(user1.address);
    const user2BettingBalance = await bettingEngine.userBalances(user2.address);
    
    console.log("💰 Balances:");
    console.log("- User1 USDC:", ethers.formatUnits(user1Balance, 6));
    console.log("- User2 USDC:", ethers.formatUnits(user2Balance, 6));
    console.log("- User1 betting positions:", ethers.formatUnits(user1BettingBalance, 6));
    console.log("- User2 betting positions:", ethers.formatUnits(user2BettingBalance, 6));
    
    const orderBook = await bettingEngine.getOrderBook(marketId);
    console.log("📋 Active orders:", orderBook.orderIds.length);
    
    const market = await bettingEngine.markets(marketId);
    console.log("📈 Market volume A:", ethers.formatUnits(market.totalVolumeA, 6), "USDC");
    console.log("📈 Market volume B:", ethers.formatUnits(market.totalVolumeB, 6), "USDC");
    
    console.log("\n🎉 Quick setup completed successfully!");
    console.log("🔧 Contract addresses saved. Ready for development!");
    
    return {
        mockUSDC: await mockUSDC.getAddress(),
        mockOracle: await mockOracle.getAddress(), 
        bettingEngine: await bettingEngine.getAddress(),
        marketId: marketId
    };
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main; 