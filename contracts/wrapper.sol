// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import './interfaces/IUniswapV2Router02.sol';
import '@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol';
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import './interfaces/IUniswapTWAPOracle.sol';
import './interfaces/IUniswapV2Pair.sol';

contract LiquidityWrapper is Ownable {
    IUniswapV2Router02 public uniswapRouter;
    AggregatorV3Interface public chainlinkOracle;
    IPyth public pythOracle;
    IUniswapTWAPOracle public twapOracle;

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
    event TwapOracleUpdated(address indexed oldOracle, address indexed newOracle);
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

    constructor(
        address _uniswapRouter,
        address _chainlinkOracle,
        address _pythOracle,
        address _tokenAddress,
        address _usdtAddress,
        address _twapOracle
    ) Ownable() {
        require(_uniswapRouter != address(0), "Invalid router address");
        require(_chainlinkOracle != address(0), "Invalid Chainlink oracle address");
        require(_pythOracle != address(0), "Invalid Pyth oracle address");
        require(_twapOracle != address(0), "Invalid TWAP oracle address");
        require(_tokenAddress != address(0), "Invalid token address");
        require(_usdtAddress != address(0), "Invalid USDT address");

        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        chainlinkOracle = AggregatorV3Interface(_chainlinkOracle);
        pythOracle = IPyth(_pythOracle);
        twapOracle = IUniswapTWAPOracle(_twapOracle);

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

    function setTwapOracle(address _newOracle) external onlyOwner {
        require(_newOracle != address(0), "Invalid oracle address");
        address oldOracle = address(twapOracle);
        twapOracle = IUniswapTWAPOracle(_newOracle);
        emit TwapOracleUpdated(oldOracle, _newOracle);
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

    function getTwapPrice() public view returns (uint256) {
        uint256 price = twapOracle.getPrice();
        require(price > 0, "Invalid TWAP price");
        return price;
    }

    function getAggregatedPrice() public view returns (uint256) {
        uint256 chainlinkPrice = getChainlinkPrice();
        uint256 pythPrice = getPythPrice();
        // uint256 twapPrice = getTwapPrice();
        
        // All oracles must return valid prices
        require(chainlinkPrice > 0 && pythPrice > 0, "Invalid oracle prices");
        
        // Check price deviation between oracles
        uint256 maxPrice = max2(chainlinkPrice, pythPrice);
        uint256 minPrice = min2(chainlinkPrice, pythPrice);
        uint256 deviation = ((maxPrice - minPrice) * 100) / minPrice;
        
        require(deviation <= MAX_PRICE_DEVIATION, "Price deviation too high");
        
        // Return weighted average (50% Chainlink, 50% Pyth)
        return (chainlinkPrice * 50 + pythPrice * 50) / 100;
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
        uint256 receivedTokens = swapExactUSDTForToken(swapAmount, minSwapTokenAmount);

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

    function swapExactUSDTForToken(uint256 usdtAmount, uint256 minTokenAmount) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = address(usdt);
        path[1] = address(token);

        usdt.approve(address(uniswapRouter), usdtAmount);

        uint256[] memory amounts = uniswapRouter.swapExactTokensForTokens(
            usdtAmount,
            minTokenAmount,
            path,
            address(this),
            block.timestamp
        );

        return amounts[1]; // Return the amount of tokens received
    }

    function addLiquidityInternal(
        uint256 usdtAmount,
        uint256 tokenAmount,
        uint256 minUSDT,
        uint256 minTokens
    ) internal returns (uint256 usedUSDT, uint256 usedTokens, uint256 liquidity) {
        // Approve router to spend tokens
        usdt.approve(address(uniswapRouter), usdtAmount);
        token.approve(address(uniswapRouter), tokenAmount);

        // Add liquidity
        (usedUSDT, usedTokens, liquidity) = uniswapRouter.addLiquidity(
            address(usdt),
            address(token),
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
}
