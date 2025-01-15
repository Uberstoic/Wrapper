// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import './interfaces/IUniswapV3Router.sol';
import '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import './interfaces/IUniswapV3Pool.sol';
import './interfaces/IPositionManager.sol';

contract LiquidityWrapper is Ownable {
    IUniswapV3Router public uniswapRouter;
    AggregatorV3Interface public chainlinkOracle;
    INonfungiblePositionManager public positionManager;
    IPyth public pythOracle;
    IUniswapV3Pool public twapPool;

    IERC20 public usdt;
    IERC20 public token;

    // Pyth Network price feed ID for BTC/USD
    bytes32 public constant PYTH_PRICE_ID = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;

    // Maximum price deviation allowed between oracles (2%)
    uint256 public constant MAX_PRICE_DEVIATION = 2;
    
    // Maximum slippage allowed for swaps and liquidity addition (5%)
    uint256 public constant MAX_SLIPPAGE = 5;

    event ChainlinkOracleUpdated(address indexed oldOracle, address indexed newOracle);
    event PythOracleUpdated(address indexed oldOracle, address indexed newOracle);
    event TwapPoolUpdated(address indexed oldPool, address indexed newPool);
    event LiquidityAdded(
        address indexed user,
        uint256 usdtAmount,
        uint256 tokenAmount,
        uint256 liquidityReceived
    );
    event SwapExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event LiquidityRemoved(
        address indexed user,
        uint256 tokenId,
        uint256 usdtAmount,
        uint256 tokenAmount
    );

    constructor(
        address _uniswapRouter,
        address _chainlinkOracle,
        address _pythOracle,
        address _twapPool,
        address _tokenAddress,
        address _usdtAddress
    ) Ownable() {
        require(_uniswapRouter != address(0), "Invalid router address");
        require(_chainlinkOracle != address(0), "Invalid Chainlink oracle address");
        require(_pythOracle != address(0), "Invalid Pyth oracle address");
        require(_twapPool != address(0), "Invalid TWAP pool address");
        require(_tokenAddress != address(0), "Invalid token address");
        require(_usdtAddress != address(0), "Invalid USDT address");

        uniswapRouter = IUniswapV3Router(_uniswapRouter);
        chainlinkOracle = AggregatorV3Interface(_chainlinkOracle);
        pythOracle = IPyth(_pythOracle);
        twapPool = IUniswapV3Pool(_twapPool);

        token = IERC20(_tokenAddress);
        usdt = IERC20(_usdtAddress);
    }

    function setChainlinkOracle(address _newOracle) external onlyOwner {
        require(_newOracle != address(0), "Invalid oracle address");
        address oldOracle = address(chainlinkOracle);
        chainlinkOracle = AggregatorV3Interface(_newOracle);
        emit ChainlinkOracleUpdated(oldOracle, _newOracle);
    }

    function setPythOracle(address _newOracle) external onlyOwner {
        require(_newOracle != address(0), "Invalid oracle address");
        address oldOracle = address(pythOracle);
        pythOracle = IPyth(_newOracle);
        emit PythOracleUpdated(oldOracle, _newOracle);
    }

    function setTwapPool(address _newPool) external onlyOwner {
        require(_newPool != address(0), "Invalid TWAP pool address");
        address oldPool = address(twapPool);
        twapPool = IUniswapV3Pool(_newPool);
        emit TwapPoolUpdated(oldPool, _newPool);
    }
    
    function getTwapPrice(uint32 interval) public view returns (uint256) {
        require(interval > 0, "Interval must be greater than 0");

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = interval;
        secondsAgos[1] = 0;

        (int56[] memory tickCumulatives, ) = twapPool.observe(secondsAgos);

        int56 tickDifference = tickCumulatives[1] - tickCumulatives[0];
        int24 averageTick = int24(tickDifference / int56(uint56(interval)));

        return tickToPrice(averageTick);
    }
    function tickToPrice(int24 tick) public pure returns (uint256) {
        int256 tick256 = int256(tick);
        uint256 sqrtPriceX96 = uint256(2 ** 96) * 10**18 / uint256(2**uint256(tick256));
        return (sqrtPriceX96 * sqrtPriceX96) / (2 ** 192);
    }

 function addLiquidity(
        uint256 tokenAmount,
        uint256 usdtAmount,
        int24 tickLower,
        int24 tickUpper
    ) external onlyOwner {
        require(tokenAmount > 0 && usdtAmount > 0, "Amounts must be greater than 0");

        // Approve tokens
        token.approve(address(positionManager), tokenAmount);
        usdt.approve(address(positionManager), usdtAmount);

        // Add liquidity through the position manager
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: address(usdt),
            token1: address(token),
            fee: 3000, // Fee tier: 0.3%
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: usdtAmount,
            amount1Desired: tokenAmount,
            amount0Min: (usdtAmount * (100 - MAX_SLIPPAGE)) / 100,
            amount1Min: (tokenAmount * (100 - MAX_SLIPPAGE)) / 100,
            recipient: address(this),
            deadline: block.timestamp
        });

        (uint256 tokenId, uint128 liquidity, , ) = positionManager.mint(params);

        emit LiquidityAdded(msg.sender, usdtAmount, tokenAmount, liquidity);
    }

    function swapExactUSDTForToken(uint256 usdtAmount) public returns (uint256 tokenAmount) {
        require(usdtAmount > 0, "Amount must be greater than 0");

        usdt.approve(address(uniswapRouter), usdtAmount);

        // Create a path for the swap
        bytes memory path = abi.encodePacked(address(usdt), uint24(3000), address(token));

        // Exact input swap
        tokenAmount = uniswapRouter.exactInput(
            path,
            address(this),
            block.timestamp,
            usdtAmount,
            1 // Minimum token out
        );

        emit SwapExecuted(msg.sender, address(usdt), address(token), usdtAmount, tokenAmount);
    }

    function getChainlinkPrice() public view returns (uint256) {
        (
            uint80 roundId,
            int256 price,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = chainlinkOracle.latestRoundData();
        
        require(price > 0, "Invalid Chainlink price");
        require(answeredInRound >= roundId, "Chainlink stale price");
        require(block.timestamp - updatedAt <= 60 minutes, "Chainlink price too old");
        
        return uint256(price);
    }

    function getPythPrice() public view returns (uint256) {
        PythStructs.Price memory pythPrice = pythOracle.getPriceNoOlderThan(PYTH_PRICE_ID, 3600);
        require(pythPrice.price > 0, "Invalid Pyth price");
        
        // Convert confidence and price to uint256 for comparison
        uint256 priceAbs = pythPrice.price >= 0 ? uint256(uint64(pythPrice.price)) : uint256(uint64(-pythPrice.price));
        uint256 confAbs = uint256(uint64(pythPrice.conf));
        require(confAbs <= priceAbs / 100, "Pyth price confidence too high");
        
        // Convert price to same decimals as Chainlink (8 decimals)
        if (pythPrice.expo < -8) {
            uint256 scale = uint256(uint32(-8 - pythPrice.expo));
            return priceAbs * (10**scale);
        } else if (pythPrice.expo > -8) {
            uint256 scale = uint256(uint32(pythPrice.expo + 8));
            return priceAbs / (10**scale);
        }
        return priceAbs;
    }

    function getAggregatedPrice() public view returns (uint256) {
        uint256 chainlinkPrice = getChainlinkPrice();
        uint256 pythPrice = getPythPrice();
        uint256 twapPrice = getTwapPrice(3600);

        require(chainlinkPrice > 0 && pythPrice > 0 && twapPrice > 0, "Invalid oracle prices");

        uint256 maxPrice = max3(chainlinkPrice, pythPrice, twapPrice);
        uint256 minPrice = min3(chainlinkPrice, pythPrice, twapPrice);
        uint256 deviation = ((maxPrice - minPrice) * 100) / minPrice;

        require(deviation <= MAX_PRICE_DEVIATION, "Price deviation too high");

        return (chainlinkPrice + pythPrice + twapPrice) / 3;
    }

    function max3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256) {
        return max2(max2(a, b), c);
    }

    function min3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256) {
        return min2(min2(a, b), c);
    }

    function max2(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }

    function min2(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function addLiquidityWithUSDT(uint256 usdtAmount) external {
        require(usdtAmount > 0, "Amount must be greater than 0");
        require(usdt.balanceOf(msg.sender) >= usdtAmount, "Insufficient USDT balance");
        require(usdt.allowance(msg.sender, address(this)) >= usdtAmount, "Insufficient USDT allowance");

        // Get current price and calculate expected token amount
        uint256 tokenPrice = getAggregatedPrice();
        require(tokenPrice > 0, "Invalid token price");
        
        // Calculate token amount based on price (considering 8 decimals of price feed)
        uint256 expectedTokenAmount = (usdtAmount * 1e8) / tokenPrice;
        uint256 minTokenAmount = expectedTokenAmount * (100 - MAX_SLIPPAGE) / 100;

        // Transfer USDT to this contract
        usdt.transferFrom(msg.sender, address(this), usdtAmount);

        // Split USDT amount for swap and liquidity
        uint256 swapAmount = usdtAmount / 2;
        uint256 liquidityAmount = usdtAmount - swapAmount;

        // Swap half USDT for tokens
        uint256 minSwapTokenAmount = minTokenAmount / 2;
        uint256 receivedTokens = swapExactUSDTForToken(swapAmount);

        // Add liquidity with the remaining USDT and received tokens
        (uint256 usedUSDT, uint256 usedTokens, uint256 liquidity) = addLiquidityInternal(
            liquidityAmount,
            receivedTokens,
            liquidityAmount * (100 - MAX_SLIPPAGE) / 100,
            receivedTokens * (100 - MAX_SLIPPAGE) / 100
        );

        // Refund any unused tokens
        if (liquidityAmount > usedUSDT) {
            usdt.transfer(msg.sender, liquidityAmount - usedUSDT);
        }
        if (receivedTokens > usedTokens) {
            token.transfer(msg.sender, receivedTokens - usedTokens);
        }

        emit LiquidityAdded(msg.sender, usedUSDT, usedTokens, liquidity);
        emit SwapExecuted(msg.sender, address(usdt), address(token), swapAmount, receivedTokens);
    }

    function addLiquidityWithBothTokens(uint256 usdtAmount, uint256 tokenAmount) external {
        require(usdtAmount > 0 && tokenAmount > 0, "Amounts must be greater than 0");
        require(usdt.balanceOf(msg.sender) >= usdtAmount, "Insufficient USDT balance");
        require(token.balanceOf(msg.sender) >= tokenAmount, "Insufficient token balance");
        require(usdt.allowance(msg.sender, address(this)) >= usdtAmount, "Insufficient USDT allowance");
        require(token.allowance(msg.sender, address(this)) >= tokenAmount, "Insufficient token allowance");

        // Verify price and token ratio
        uint256 tokenPrice = getAggregatedPrice();
        require(tokenPrice > 0, "Invalid token price");
        
        // Calculate expected token amount based on USDT amount and current price
        uint256 expectedTokenAmount = (usdtAmount * 1e8) / tokenPrice;
        
        // Calculate acceptable token amount range based on MAX_PRICE_DEVIATION
        uint256 minExpectedTokens = expectedTokenAmount * (100 - MAX_PRICE_DEVIATION) / 100;
        uint256 maxExpectedTokens = expectedTokenAmount * (100 + MAX_PRICE_DEVIATION) / 100;
        
        require(
            tokenAmount >= minExpectedTokens && tokenAmount <= maxExpectedTokens,
            "Token ratio outside acceptable range"
        );

        // Transfer tokens to this contract
        usdt.transferFrom(msg.sender, address(this), usdtAmount);
        token.transferFrom(msg.sender, address(this), tokenAmount);

        // Add liquidity
        (uint256 usedUSDT, uint256 usedTokens, uint256 liquidity) = addLiquidityInternal(
            usdtAmount,
            tokenAmount,
            usdtAmount * (100 - MAX_SLIPPAGE) / 100,
            tokenAmount * (100 - MAX_SLIPPAGE) / 100
        );

        // Refund any unused tokens
        if (usdtAmount > usedUSDT) {
            usdt.transfer(msg.sender, usdtAmount - usedUSDT);
        }
        if (tokenAmount > usedTokens) {
            token.transfer(msg.sender, tokenAmount - usedTokens);
        }

        emit LiquidityAdded(msg.sender, usedUSDT, usedTokens, liquidity);
    }

    function addLiquidityInternal(
        uint256 usdtAmount,
        uint256 tokenAmount,
        uint256 minUSDT,
        uint256 minTokens
    ) internal returns (uint256 usedUSDT, uint256 usedTokens, uint256 liquidity) {
        // Approve router to spend tokens
        usdt.approve(address(positionManager), usdtAmount);
        token.approve(address(positionManager), tokenAmount);

        // Add liquidity
        (usedUSDT, usedTokens, liquidity) = positionManager.addLiquidity(
            usdtAmount,
            tokenAmount,
            minUSDT,
            minTokens,
            msg.sender,
            block.timestamp
        );

        require(liquidity > 0, "No liquidity received");
        return (usedUSDT, usedTokens, liquidity);
    }

    function updatePythPrice(bytes[] calldata priceUpdateData) external payable {
        uint fee = pythOracle.getUpdateFee(priceUpdateData);
        require(msg.value >= fee, "Insufficient fee for price update");
        
        pythOracle.updatePriceFeeds{value: fee}(priceUpdateData);
        
        if (msg.value > fee) {
            payable(msg.sender).transfer(msg.value - fee);
        }
    }

    function increaseLiquidity(uint256 tokenId, uint256 usdtAmount, uint256 tokenAmount) external onlyOwner {
        require(tokenId > 0, "Invalid tokenId");
        require(usdtAmount > 0 || tokenAmount > 0, "Amounts must be greater than 0");

        // Approve tokens
        if (usdtAmount > 0) {
            usdt.approve(address(positionManager), usdtAmount);
        }
        if (tokenAmount > 0) {
            token.approve(address(positionManager), tokenAmount);
        }

        // Increase liquidity through the position manager
        INonfungiblePositionManager.IncreaseLiquidityParams memory params = INonfungiblePositionManager.IncreaseLiquidityParams({
            tokenId: tokenId,
            amount0Desired: usdtAmount,
            amount1Desired: tokenAmount,
            amount0Min: (usdtAmount * (100 - MAX_SLIPPAGE)) / 100,
            amount1Min: (tokenAmount * (100 - MAX_SLIPPAGE)) / 100,
            deadline: block.timestamp
        });

        (uint256 usedUSDT, uint256 usedTokens, uint128 liquidity) = positionManager.increaseLiquidity(params);

        emit LiquidityAdded(msg.sender, usedUSDT, usedTokens, liquidity);
    }

    function decreaseLiquidity(uint256 tokenId, uint256 liquidity) external onlyOwner {
        require(tokenId > 0, "Invalid tokenId");
        require(liquidity > 0, "Liquidity must be greater than 0");

        // Decrease liquidity through the position manager
        INonfungiblePositionManager.DecreaseLiquidityParams memory params = INonfungiblePositionManager.DecreaseLiquidityParams({
            tokenId: tokenId,
            liquidity: liquidity,
            amount0Min: 0,
            amount1Min: 0,
            deadline: block.timestamp
        });

        (uint256 amount0, uint256 amount1) = positionManager.decreaseLiquidity(params);

        // Transfer tokens back to the owner
        usdt.transfer(msg.sender, amount0);
        token.transfer(msg.sender, amount1);
    }

    function removeLiquidity(uint256 tokenId) external onlyOwner {
        require(tokenId > 0, "Invalid tokenId");

        // Remove liquidity through the position manager
        INonfungiblePositionManager.CollectParams memory params = INonfungiblePositionManager.CollectParams({
            tokenId: tokenId,
            recipient: msg.sender,
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (uint256 collected0, uint256 collected1) = positionManager.collect(params);

        emit LiquidityRemoved(msg.sender, tokenId, collected0, collected1);
    }
}
