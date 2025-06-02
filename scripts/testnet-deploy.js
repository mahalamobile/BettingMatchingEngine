const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🚀 Starting testnet deployment...");
    
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    
    console.log("📋 Deployment Details:");
    console.log("- Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");
    console.log("- Deployer:", deployer.address);
    console.log("- Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
    
    const deployments = {};
    
    try {
        // 1. Deploy Mock USDC Token
        console.log("\n💰 Deploying Mock USDC Token...");
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        const mockUSDC = await MockUSDC.deploy(
            ethers.parseUnits("1000000", 6) // 1M USDC initial supply
        );
        await mockUSDC.waitForDeployment();
        const mockUSDCAddress = await mockUSDC.getAddress();
        console.log("✅ Mock USDC deployed to:", mockUSDCAddress);
        deployments.mockUSDC = mockUSDCAddress;
        
        // 2. Deploy Mock Price Oracle
        console.log("\n🔮 Deploying Mock Price Oracle...");
        const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
        const mockOracle = await MockPriceOracle.deploy();
        await mockOracle.waitForDeployment();
        const mockOracleAddress = await mockOracle.getAddress();
        console.log("✅ Mock Oracle deployed to:", mockOracleAddress);
        deployments.mockOracle = mockOracleAddress;
        
        // 3. Deploy Betting Matching Engine
        console.log("\n🎯 Deploying Betting Matching Engine...");
        const BettingMatchingEngine = await ethers.getContractFactory("BettingMatchingEngine");
        const bettingEngine = await BettingMatchingEngine.deploy(
            mockUSDCAddress,
            mockOracleAddress
        );
        await bettingEngine.waitForDeployment();
        const bettingEngineAddress = await bettingEngine.getAddress();
        console.log("✅ Betting Engine deployed to:", bettingEngineAddress);
        deployments.bettingEngine = bettingEngineAddress;
        
        // 4. Setup initial configuration
        console.log("\n⚙️  Setting up initial configuration...");
        
        // Mint some USDC to deployer for testing
        await mockUSDC.mint(deployer.address, ethers.parseUnits("100000", 6)); // 100k USDC
        console.log("✅ Minted 100,000 mUSDC to deployer");
        
        // Approve betting engine to spend USDC
        await mockUSDC.approve(bettingEngineAddress, ethers.parseUnits("50000", 6));
        console.log("✅ Approved betting engine to spend 50,000 mUSDC");
        
        // Create a test market
        const endTime = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours from now
        const settlementTime = endTime + (2 * 60 * 60); // 2 hours after end
        const tx = await bettingEngine.createMarket(
            "Test Market: Will ETH price be above $3000 tomorrow?",
            endTime,
            settlementTime
        );
        const receipt = await tx.wait();
        const marketCreatedEvent = receipt.logs.find(log => {
            try {
                return bettingEngine.interface.parseLog(log).name === 'MarketCreated';
            } catch (e) {
                return false;
            }
        });
        
        if (marketCreatedEvent) {
            const parsedEvent = bettingEngine.interface.parseLog(marketCreatedEvent);
            deployments.testMarketId = parsedEvent.args.marketId;
            console.log("✅ Created test market with ID:", parsedEvent.args.marketId);
        }
        
        // 5. Save deployment information
        const deploymentInfo = {
            network: network.name,
            chainId: network.chainId.toString(),
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            contracts: deployments,
            gasUsed: {
                mockUSDC: (await ethers.provider.getTransactionReceipt(mockUSDC.deploymentTransaction().hash)).gasUsed.toString(),
                mockOracle: (await ethers.provider.getTransactionReceipt(mockOracle.deploymentTransaction().hash)).gasUsed.toString(),
                bettingEngine: (await ethers.provider.getTransactionReceipt(bettingEngine.deploymentTransaction().hash)).gasUsed.toString()
            }
        };
        
        // Create deployments directory if it doesn't exist
        const deploymentsDir = path.join(__dirname, "..", "deployments");
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }
        
        // Save deployment info
        const filename = `${network.name}-${network.chainId}.json`;
        fs.writeFileSync(
            path.join(deploymentsDir, filename),
            JSON.stringify(deploymentInfo, null, 2)
        );
        
        console.log("\n🎉 Deployment completed successfully!");
        console.log("📄 Deployment info saved to:", filename);
        console.log("\n📊 Contract Addresses:");
        console.log("- Mock USDC:", mockUSDCAddress);
        console.log("- Mock Oracle:", mockOracleAddress);
        console.log("- Betting Engine:", bettingEngineAddress);
        
        console.log("\n🔗 Next steps:");
        console.log("1. Verify contracts on explorer (if desired):");
        console.log(`   npx hardhat verify --network ${network.name} ${mockUSDCAddress} "Mock USDC" "mUSDC" 6 "1000000000000"`);
        console.log(`   npx hardhat verify --network ${network.name} ${mockOracleAddress}`);
        console.log(`   npx hardhat verify --network ${network.name} ${bettingEngineAddress} "${mockUSDCAddress}" "${mockOracleAddress}"`);
        console.log("2. Run interaction script:");
        console.log(`   npm run test:${network.name}`);
        
    } catch (error) {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 