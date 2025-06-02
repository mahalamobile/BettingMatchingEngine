const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🧪 Starting testnet interaction tests...");
    
    const [deployer, user1, user2] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    
    console.log("📋 Test Details:");
    console.log("- Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");
    console.log("- Deployer:", deployer.address);
    console.log("- User1:", user1.address);
    console.log("- User2:", user2.address);
    
    // Load deployment info
    const deploymentFile = path.join(__dirname, "..", "deployments", `${network.name}-${network.chainId}.json`);
    
    if (!fs.existsSync(deploymentFile)) {
        console.error("❌ Deployment file not found. Please deploy first with:");
        console.error(`   npm run deploy:${network.name}`);
        process.exit(1);
    }
    
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    console.log("📄 Loaded deployment info from:", deploymentFile);
    
    try {
        // Get contract instances
        const mockUSDC = await ethers.getContractAt("MockERC20", deploymentInfo.contracts.mockUSDC);
        const mockOracle = await ethers.getContractAt("MockPriceOracle", deploymentInfo.contracts.mockOracle);
        const bettingEngine = await ethers.getContractAt("BettingMatchingEngine", deploymentInfo.contracts.bettingEngine);
        
        console.log("\n💰 Setting up test accounts...");
        
        // Mint USDC to test users
        await mockUSDC.mint(user1.address, ethers.parseUnits("10000", 6)); // 10k USDC
        await mockUSDC.mint(user2.address, ethers.parseUnits("10000", 6)); // 10k USDC
        console.log("✅ Minted 10,000 mUSDC to each test user");
        
        // Users approve betting engine
        await mockUSDC.connect(user1).approve(bettingEngine.getAddress(), ethers.parseUnits("5000", 6));
        await mockUSDC.connect(user2).approve(bettingEngine.getAddress(), ethers.parseUnits("5000", 6));
        console.log("✅ Users approved betting engine to spend mUSDC");
        
        // Check balances
        const user1Balance = await mockUSDC.balanceOf(user1.address);
        const user2Balance = await mockUSDC.balanceOf(user2.address);
        console.log("- User1 balance:", ethers.formatUnits(user1Balance, 6), "mUSDC");
        console.log("- User2 balance:", ethers.formatUnits(user2Balance, 6), "mUSDC");
        
        // Test 1: Create a new market
        console.log("\n🎯 Test 1: Creating a new market...");
        const endTime = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours
        const settlementTime = endTime + (2 * 60 * 60); // 2 hours after end
        
        const createMarketTx = await bettingEngine.createMarket(
            "Integration Test: Will BTC price be above $50,000?",
            endTime,
            settlementTime
        );
        const receipt = await createMarketTx.wait();
        
        const marketCreatedEvent = receipt.logs.find(log => {
            try {
                return bettingEngine.interface.parseLog(log).name === 'MarketCreated';
            } catch (e) {
                return false;
            }
        });
        
        const newMarketId = bettingEngine.interface.parseLog(marketCreatedEvent).args.marketId;
        console.log("✅ Created new market with ID:", newMarketId);
        
        // Test 2: Place orders
        console.log("\n📝 Test 2: Placing orders...");
        
        // User1 places order for side A (YES) with 2.0 odds
        const order1Tx = await bettingEngine.connect(user1).placeOrder(
            newMarketId,
            1, // side A
            ethers.parseUnits("100", 6), // 100 USDC
            ethers.parseUnits("2.0", 18) // 2.0 odds
        );
        const order1Receipt = await order1Tx.wait();
        const order1Event = bettingEngine.interface.parseLog(
            order1Receipt.logs.find(log => {
                try {
                    return bettingEngine.interface.parseLog(log).name === 'OrderPlaced';
                } catch (e) {
                    return false;
                }
            })
        );
        const order1Id = order1Event.args.orderId;
        console.log("✅ User1 placed order (Side A, 100 USDC, 2.0 odds):", order1Id);
        
        // User2 places order for side B (NO) with 2.5 odds
        const order2Tx = await bettingEngine.connect(user2).placeOrder(
            newMarketId,
            2, // side B
            ethers.parseUnits("80", 6), // 80 USDC
            ethers.parseUnits("2.5", 18) // 2.5 odds
        );
        const order2Receipt = await order2Tx.wait();
        const order2Event = bettingEngine.interface.parseLog(
            order2Receipt.logs.find(log => {
                try {
                    return bettingEngine.interface.parseLog(log).name === 'OrderPlaced';
                } catch (e) {
                    return false;
                }
            })
        );
        const order2Id = order2Event.args.orderId;
        console.log("✅ User2 placed order (Side B, 80 USDC, 2.5 odds):", order2Id);
        
        // Test 3: Check order book
        console.log("\n📊 Test 3: Checking order book...");
        const orderBook = await bettingEngine.getOrderBook(newMarketId);
        console.log("Order book for market:", newMarketId);
        for (let i = 0; i < orderBook.orderIds.length; i++) {
            console.log(`- Order ${i + 1}:`);
            console.log(`  ID: ${orderBook.orderIds[i]}`);
            console.log(`  Amount: ${ethers.formatUnits(orderBook.amounts[i], 6)} USDC`);
            console.log(`  Odds: ${ethers.formatUnits(orderBook.odds[i], 18)}`);
            console.log(`  Side: ${orderBook.sides[i] === 1 ? 'A (YES)' : 'B (NO)'}`);
        }
        
        // Test 4: Add liquidity to AMM
        console.log("\n💧 Test 4: Adding liquidity to AMM...");
        const liquidityTx = await bettingEngine.connect(user1).addLiquidity(
            newMarketId,
            ethers.parseUnits("500", 6) // 500 USDC
        );
        await liquidityTx.wait();
        console.log("✅ User1 added 500 USDC liquidity to AMM");
        
        // Test 5: Swap with AMM
        console.log("\n🔄 Test 5: Testing AMM swap...");
        const swapTx = await bettingEngine.connect(user2).swapWithAMM(
            newMarketId,
            1, // side A
            ethers.parseUnits("50", 6) // 50 USDC
        );
        await swapTx.wait();
        console.log("✅ User2 swapped 50 USDC for side A tokens");
        
        // Test 6: Check market data
        console.log("\n📈 Test 6: Checking market data...");
        const marketData = await bettingEngine.markets(newMarketId);
        console.log("Market details:");
        console.log("- Description:", marketData.description);
        console.log("- Is Active:", marketData.isActive);
        console.log("- Is Settled:", marketData.isSettled);
        console.log("- Total Volume A:", ethers.formatUnits(marketData.totalVolumeA, 6), "USDC");
        console.log("- Total Volume B:", ethers.formatUnits(marketData.totalVolumeB, 6), "USDC");
        console.log("- End Time:", new Date(Number(marketData.endTime) * 1000).toLocaleString());
        
        // Test 7: Simulate oracle price update
        console.log("\n🔮 Test 7: Simulating oracle update...");
        await mockOracle.setPrice(newMarketId, ethers.parseUnits("52000", 18)); // $52,000
        console.log("✅ Oracle price set to $52,000");
        
        // Test 8: Settle market (simulate future settlement)
        console.log("\n🏁 Test 8: Preparing for market settlement...");
        console.log("⏰ In a real scenario, you would wait for the settlement time and then:");
        console.log("1. Call mockOracle.settleMarket(marketId, outcome) where outcome is 1 or 2");
        console.log("2. Call bettingEngine.settleMarket(marketId)");
        console.log("3. Users can then call bettingEngine.claimWinnings(matchId)");
        
        // For demonstration, let's settle the market if it's past settlement time
        // (This won't work in practice since we just created it, but shows the process)
        console.log("\n📋 Settlement process example:");
        console.log("// Step 1: Oracle settles market with outcome");
        console.log(`await mockOracle.settleMarket("${newMarketId}", 1); // 1 = side A wins`);
        console.log("// Step 2: Betting engine processes settlement");
        console.log(`await bettingEngine.settleMarket("${newMarketId}");`);
        console.log("// Step 3: Winners claim payouts");
        console.log(`await bettingEngine.claimWinnings(matchId);`);
        
        // Check final balances
        console.log("\n💰 Final balances:");
        const finalUser1Balance = await mockUSDC.balanceOf(user1.address);
        const finalUser2Balance = await mockUSDC.balanceOf(user2.address);
        console.log("- User1:", ethers.formatUnits(finalUser1Balance, 6), "mUSDC");
        console.log("- User2:", ethers.formatUnits(finalUser2Balance, 6), "mUSDC");
        
        // Check user balances in betting engine (AMM positions)
        const user1BettingBalance = await bettingEngine.userBalances(user1.address);
        const user2BettingBalance = await bettingEngine.userBalances(user2.address);
        console.log("- User1 betting positions:", ethers.formatUnits(user1BettingBalance, 6));
        console.log("- User2 betting positions:", ethers.formatUnits(user2BettingBalance, 6));
        
        console.log("\n🎉 All tests completed successfully!");
        console.log("\n📝 Summary of what was tested:");
        console.log("✅ Market creation");
        console.log("✅ Order placement");
        console.log("✅ Order book viewing");
        console.log("✅ AMM liquidity provision");
        console.log("✅ AMM token swapping");
        console.log("✅ Oracle price updates");
        console.log("✅ Settlement process (demonstrated)");
        
        console.log("\n🔗 Next steps for full testing:");
        console.log("1. Wait for settlement time to pass");
        console.log("2. Test actual market settlement");
        console.log("3. Test winnings claims");
        console.log("4. Test edge cases and error conditions");
        
    } catch (error) {
        console.error("❌ Test failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 