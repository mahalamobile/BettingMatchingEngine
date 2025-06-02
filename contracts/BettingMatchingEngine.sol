// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPriceOracle {
    function getPrice(bytes32 marketId) external view returns (uint256, uint256); // price, timestamp
    function isSettled(bytes32 marketId) external view returns (bool, uint8); // settled, outcome
}

contract BettingMatchingEngine is ReentrancyGuard, Ownable {
    IERC20 public immutable baseToken; // USDC/USDT
    IPriceOracle public oracle;
    
    struct Market {
        bytes32 id;
        string description;
        uint256 endTime;
        uint256 settlementTime;
        bool isActive;
        bool isSettled;
        uint8 outcome; // 0 = no outcome, 1 = option A, 2 = option B
        uint256 totalVolumeA;
        uint256 totalVolumeB;
    }
    
    struct Order {
        address user;
        bytes32 marketId;
        uint8 side; // 1 = A, 2 = B
        uint256 amount;
        uint256 odds; // scaled by 1e18 (e.g., 2.5 = 2.5e18)
        uint256 timestamp;
        bool isActive;
        bool isMatched;
    }
    
    struct Match {
        bytes32 orderAId;
        bytes32 orderBId;
        uint256 amount;
        uint256 oddsA;
        uint256 oddsB;
        bool isSettled;
    }
    
    mapping(bytes32 => Market) public markets;
    mapping(bytes32 => Order) public orders;
    mapping(bytes32 => Match) public matches;
    mapping(bytes32 => bytes32[]) public marketOrders; // market => order IDs
    mapping(address => uint256) public userBalances;
    
    // AMM Pool for liquidity
    struct LiquidityPool {
        uint256 reserveA;
        uint256 reserveB;
        uint256 totalShares;
        mapping(address => uint256) userShares;
    }
    mapping(bytes32 => LiquidityPool) public liquidityPools;
    
    event MarketCreated(bytes32 indexed marketId, string description, uint256 endTime);
    event OrderPlaced(bytes32 indexed orderId, address indexed user, bytes32 indexed marketId);
    event OrderMatched(bytes32 indexed matchId, bytes32 orderAId, bytes32 orderBId);
    event MarketSettled(bytes32 indexed marketId, uint8 outcome);
    event LiquidityAdded(bytes32 indexed marketId, address indexed provider, uint256 amount);
    
    constructor(address _baseToken, address _oracle) Ownable(msg.sender) {
        baseToken = IERC20(_baseToken);
        oracle = IPriceOracle(_oracle);
    }
    
    function createMarket(
        string memory _description,
        uint256 _endTime,
        uint256 _settlementTime
    ) external onlyOwner returns (bytes32) {
        bytes32 marketId = keccak256(abi.encodePacked(_description, block.timestamp));
        
        markets[marketId] = Market({
            id: marketId,
            description: _description,
            endTime: _endTime,
            settlementTime: _settlementTime,
            isActive: true,
            isSettled: false,
            outcome: 0,
            totalVolumeA: 0,
            totalVolumeB: 0
        });
        
        emit MarketCreated(marketId, _description, _endTime);
        return marketId;
    }
    
    function placeOrder(
        bytes32 _marketId,
        uint8 _side,
        uint256 _amount,
        uint256 _odds
    ) external nonReentrant returns (bytes32) {
        require(markets[_marketId].isActive, "Market not active");
        require(block.timestamp < markets[_marketId].endTime, "Market ended");
        require(_side == 1 || _side == 2, "Invalid side");
        require(_amount > 0, "Invalid amount");
        
        // Calculate required collateral
        uint256 collateral = _side == 1 ? _amount : (_amount * _odds) / 1e18;
        require(baseToken.transferFrom(msg.sender, address(this), collateral), "Transfer failed");
        
        bytes32 orderId = keccak256(abi.encodePacked(msg.sender, _marketId, block.timestamp));
        
        orders[orderId] = Order({
            user: msg.sender,
            marketId: _marketId,
            side: _side,
            amount: _amount,
            odds: _odds,
            timestamp: block.timestamp,
            isActive: true,
            isMatched: false
        });
        
        marketOrders[_marketId].push(orderId);
        
        // Try to match immediately
        _tryMatchOrder(orderId);
        
        emit OrderPlaced(orderId, msg.sender, _marketId);
        return orderId;
    }
    
    function _tryMatchOrder(bytes32 _orderId) internal {
        Order storage newOrder = orders[_orderId];
        bytes32[] storage orderIds = marketOrders[newOrder.marketId];
        
        for (uint i = 0; i < orderIds.length; i++) {
            bytes32 existingOrderId = orderIds[i];
            Order storage existingOrder = orders[existingOrderId];
            
            if (existingOrderId == _orderId || !existingOrder.isActive || existingOrder.isMatched) {
                continue;
            }
            
            // Check if orders can match (opposite sides, compatible odds)
            if (_canMatch(newOrder, existingOrder)) {
                _executeMatch(_orderId, existingOrderId);
                break;
            }
        }
    }
    
    function _canMatch(Order memory orderA, Order memory orderB) internal pure returns (bool) {
        if (orderA.side == orderB.side) return false;
        
        // For simplicity, exact odds matching - could implement spread matching
        uint256 impliedOddsA = (1e18 * 1e18) / orderA.odds;
        uint256 impliedOddsB = orderB.odds;
        
        return impliedOddsA >= impliedOddsB;
    }
    
    function _executeMatch(bytes32 _orderAId, bytes32 _orderBId) internal {
        Order storage orderA = orders[_orderAId];
        Order storage orderB = orders[_orderBId];
        
        uint256 matchAmount = orderA.amount < orderB.amount ? orderA.amount : orderB.amount;
        
        bytes32 matchId = keccak256(abi.encodePacked(_orderAId, _orderBId, block.timestamp));
        
        matches[matchId] = Match({
            orderAId: _orderAId,
            orderBId: _orderBId,
            amount: matchAmount,
            oddsA: orderA.odds,
            oddsB: orderB.odds,
            isSettled: false
        });
        
        orderA.isMatched = true;
        orderB.isMatched = true;
        
        // Update market volume
        if (orderA.side == 1) {
            markets[orderA.marketId].totalVolumeA += matchAmount;
            markets[orderA.marketId].totalVolumeB += matchAmount;
        } else {
            markets[orderA.marketId].totalVolumeB += matchAmount;
            markets[orderA.marketId].totalVolumeA += matchAmount;
        }
        
        emit OrderMatched(matchId, _orderAId, _orderBId);
    }
    
    // AMM functionality for instant liquidity
    function addLiquidity(bytes32 _marketId, uint256 _amount) external nonReentrant {
        require(markets[_marketId].id != bytes32(0), "Market not found");
        require(block.timestamp < markets[_marketId].endTime, "Market ended");
        require(baseToken.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        
        LiquidityPool storage pool = liquidityPools[_marketId];
        
        if (pool.totalShares == 0) {
            // First liquidity provider
            pool.reserveA = _amount / 2;
            pool.reserveB = _amount / 2;
            pool.totalShares = _amount;
            pool.userShares[msg.sender] = _amount;
        } else {
            // Calculate shares based on current reserves
            uint256 totalReserve = pool.reserveA + pool.reserveB;
            uint256 shares = (_amount * pool.totalShares) / totalReserve;
            
            pool.reserveA += _amount / 2;
            pool.reserveB += _amount / 2;
            pool.totalShares += shares;
            pool.userShares[msg.sender] += shares;
        }
        
        emit LiquidityAdded(_marketId, msg.sender, _amount);
    }
    
    function swapWithAMM(
        bytes32 _marketId,
        uint8 _side,
        uint256 _amountIn
    ) external nonReentrant returns (uint256 amountOut) {
        require(markets[_marketId].isActive, "Market not active");
        require(baseToken.transferFrom(msg.sender, address(this), _amountIn), "Transfer failed");
        
        LiquidityPool storage pool = liquidityPools[_marketId];
        
        // Simple constant product formula (x * y = k)
        if (_side == 1) {
            amountOut = (pool.reserveB * _amountIn) / (pool.reserveA + _amountIn);
            pool.reserveA += _amountIn;
            pool.reserveB -= amountOut;
        } else {
            amountOut = (pool.reserveA * _amountIn) / (pool.reserveB + _amountIn);
            pool.reserveB += _amountIn;
            pool.reserveA -= amountOut;
        }
        
        // Store position for user (simplified)
        userBalances[msg.sender] += amountOut;
    }
    
    function settleMarket(bytes32 _marketId) external {
        Market storage market = markets[_marketId];
        require(block.timestamp >= market.settlementTime, "Not ready for settlement");
        require(!market.isSettled, "Already settled");
        
        (bool settled, uint8 outcome) = oracle.isSettled(_marketId);
        require(settled, "Oracle not settled");
        
        market.isSettled = true;
        market.outcome = outcome;
        market.isActive = false;
        
        emit MarketSettled(_marketId, outcome);
    }
    
    function claimWinnings(bytes32 _matchId) external nonReentrant {
        Match storage matchData = matches[_matchId];
        require(!matchData.isSettled, "Already claimed");
        
        Order storage orderA = orders[matchData.orderAId];
        Order storage orderB = orders[matchData.orderBId];
        Market storage market = markets[orderA.marketId];
        
        require(market.isSettled, "Market not settled");
        
        address winner;
        uint256 payout;
        
        // Calculate total collateral for this match
        uint256 collateralA = orderA.side == 1 ? matchData.amount : (matchData.amount * matchData.oddsA) / 1e18;
        uint256 collateralB = orderB.side == 1 ? matchData.amount : (matchData.amount * matchData.oddsB) / 1e18;
        uint256 totalCollateral = collateralA + collateralB;
        
        if ((market.outcome == 1 && orderA.side == 1) || (market.outcome == 2 && orderA.side == 2)) {
            winner = orderA.user;
            payout = totalCollateral; // Winner gets all collateral
        } else if ((market.outcome == 1 && orderB.side == 1) || (market.outcome == 2 && orderB.side == 2)) {
            winner = orderB.user;
            payout = totalCollateral; // Winner gets all collateral
        }
        
        if (winner != address(0)) {
            matchData.isSettled = true;
            require(baseToken.transfer(winner, payout), "Transfer failed");
        }
    }
    
    function getMarketOrders(bytes32 _marketId) external view returns (bytes32[] memory) {
        return marketOrders[_marketId];
    }
    
    function getOrderBook(bytes32 _marketId) external view returns (
        bytes32[] memory orderIds,
        uint256[] memory amounts,
        uint256[] memory odds,
        uint8[] memory sides
    ) {
        bytes32[] storage orderList = marketOrders[_marketId];
        uint256 activeCount = 0;
        
        // Count active orders
        for (uint i = 0; i < orderList.length; i++) {
            if (orders[orderList[i]].isActive && !orders[orderList[i]].isMatched) {
                activeCount++;
            }
        }
        
        orderIds = new bytes32[](activeCount);
        amounts = new uint256[](activeCount);
        odds = new uint256[](activeCount);
        sides = new uint8[](activeCount);
        
        uint256 index = 0;
        for (uint i = 0; i < orderList.length; i++) {
            Order storage order = orders[orderList[i]];
            if (order.isActive && !order.isMatched) {
                orderIds[index] = orderList[i];
                amounts[index] = order.amount;
                odds[index] = order.odds;
                sides[index] = order.side;
                index++;
            }
        }
    }
}