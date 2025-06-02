// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockPriceOracle {
    struct MarketData {
        uint256 price;
        uint256 timestamp;
        bool settled;
        uint8 outcome;
    }
    
    mapping(bytes32 => MarketData) public markets;
    address public owner;
    
    constructor() {
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    function getPrice(bytes32 marketId) external view returns (uint256, uint256) {
        MarketData memory market = markets[marketId];
        return (market.price, market.timestamp);
    }
    
    function isSettled(bytes32 marketId) external view returns (bool, uint8) {
        MarketData memory market = markets[marketId];
        return (market.settled, market.outcome);
    }
    
    function setPrice(bytes32 marketId, uint256 price) external {
        markets[marketId].price = price;
        markets[marketId].timestamp = block.timestamp;
    }
    
    function settleMarket(bytes32 marketId, uint8 outcome) external {
        require(outcome == 1 || outcome == 2, "Invalid outcome");
        markets[marketId].settled = true;
        markets[marketId].outcome = outcome;
        markets[marketId].timestamp = block.timestamp;
    }
    
    // For test compatibility
    function setOutcome(bytes32 marketId, bool settled, uint8 outcome) external {
        markets[marketId].settled = settled;
        markets[marketId].outcome = outcome;
        markets[marketId].timestamp = block.timestamp;
    }
    
    function resetMarket(bytes32 marketId) external {
        delete markets[marketId];
    }
} 