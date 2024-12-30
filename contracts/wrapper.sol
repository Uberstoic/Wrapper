// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import './interfaces/IUniswapV2Router02.sol';
import '@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol';
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LiquidityWrapper is Ownable {
    IUniswapV2Router02 public uniswapRouter;
    AggregatorV3Interface public chainlinkOracle;
    IPyth public pythOracle;

    IERC20 public usdt;
    IERC20 public token;

    bytes32 public constant PYTH_PRICE_ID = bytes32("BTC/USD"); // This should be the correct Pyth price feed ID

    event ChainlinkOracleUpdated(address indexed oldOracle, address indexed newOracle);
    event PythOracleUpdated(address indexed oldOracle, address indexed newOracle);

    constructor(
        address _uniswapRouter,
        address _chainlinkOracle,
        address _pythOracle,
        address _tokenAddress,
        address _usdtAddress
    ) Ownable(msg.sender) {
        require(_uniswapRouter != address(0), "Invalid router address");
        require(_chainlinkOracle != address(0), "Invalid Chainlink oracle address");
        require(_pythOracle != address(0), "Invalid Pyth oracle address");
        require(_tokenAddress != address(0), "Invalid token address");
        require(_usdtAddress != address(0), "Invalid USDT address");

        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        chainlinkOracle = AggregatorV3Interface(_chainlinkOracle);
        pythOracle = IPyth(_pythOracle);

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

    function getChainlinkPrice() public view returns (uint256) {
        (, int256 price,,,) = chainlinkOracle.latestRoundData();
        require(price > 0, "Invalid Chainlink price");
        return uint256(price);
    }

    function getPythPrice() public view returns (uint256) {
        PythStructs.Price memory pythPrice = pythOracle.getPriceUnsafe(PYTH_PRICE_ID);
        require(pythPrice.price > 0, "Invalid Pyth price");
        
        // Convert price to same decimals as Chainlink (8 decimals)
        if (pythPrice.expo < -8) {
            uint256 scale = uint256(uint32(-8 - pythPrice.expo));
            return uint256(uint64(pythPrice.price)) * (10**scale);
        } else if (pythPrice.expo > -8) {
            uint256 scale = uint256(uint32(pythPrice.expo + 8));
            return uint256(uint64(pythPrice.price)) / (10**scale);
        }
        return uint256(uint64(pythPrice.price));
    }

    function getAggregatedPrice() public view returns (uint256) {
        uint256 chainlinkPrice = getChainlinkPrice();
        uint256 pythPrice = getPythPrice();
        
        // Both oracles must return valid prices
        require(chainlinkPrice > 0 && pythPrice > 0, "Invalid oracle prices");
        
        // Return average of both prices
        return (chainlinkPrice + pythPrice) / 2;
    }

    function addLiquidityWithUSDT(uint256 usdtAmount) external {
        require(usdtAmount > 0, "Amount must be greater than 0");
        require(usdt.balanceOf(msg.sender) >= usdtAmount, "Insufficient USDT balance");
        require(usdt.allowance(msg.sender, address(this)) >= usdtAmount, "Insufficient USDT allowance");

        // Transfer USDT to this contract
        usdt.transferFrom(msg.sender, address(this), usdtAmount);

        // Calculate token amount based on price
        uint256 tokenPrice = getAggregatedPrice(); 
        uint256 tokenAmount = (usdtAmount * 1e8) / tokenPrice;

        uint256 halfUSDT = usdtAmount / 2;
        uint256 minTokenAmount = tokenAmount * 95 / 100; // 5% slippage protection

        // Swap half USDT for tokens
        swapUSDTForToken(halfUSDT, minTokenAmount / 2); // Since we're only swapping half USDT

        // Approve router to spend tokens
        usdt.approve(address(uniswapRouter), halfUSDT);
        token.approve(address(uniswapRouter), minTokenAmount / 2);

        // Add liquidity
        uniswapRouter.addLiquidity(
            address(usdt),
            address(token),
            halfUSDT,
            minTokenAmount / 2,
            halfUSDT * 95 / 100,  // 5% slippage protection
            (minTokenAmount / 2) * 95 / 100,  // 5% slippage protection
            msg.sender,
            block.timestamp
        );
    }

    function swapUSDTForToken(uint256 usdtAmount, uint256 minTokenAmount) internal {
        address[] memory path = new address[](2);
        path[0] = address(usdt);
        path[1] = address(token);

        usdt.approve(address(uniswapRouter), usdtAmount);

        uniswapRouter.swapExactTokensForTokens(
            usdtAmount,
            minTokenAmount,
            path,
            address(this),
            block.timestamp
        );
    }

    function addLiquidityWithBothTokens(uint256 usdtAmount, uint256 tokenAmount) external {
        require(usdtAmount > 0 && tokenAmount > 0, "Amounts must be greater than 0");
        require(usdt.balanceOf(msg.sender) >= usdtAmount, "Insufficient USDT balance");
        require(token.balanceOf(msg.sender) >= tokenAmount, "Insufficient token balance");
        require(usdt.allowance(msg.sender, address(this)) >= usdtAmount, "Insufficient USDT allowance");
        require(token.allowance(msg.sender, address(this)) >= tokenAmount, "Insufficient token allowance");

        // Get current price to verify amounts ratio
        uint256 btcPrice = getAggregatedPrice();
        uint256 expectedTokenAmount = (usdtAmount * 1e8) / btcPrice;
        
        // Allow 2% deviation from the expected ratio
        uint256 minExpectedAmount = expectedTokenAmount * 98 / 100;
        uint256 maxExpectedAmount = expectedTokenAmount * 102 / 100;
        require(
            tokenAmount >= minExpectedAmount && tokenAmount <= maxExpectedAmount,
            "Invalid token ratio"
        );

        // Transfer tokens to this contract
        usdt.transferFrom(msg.sender, address(this), usdtAmount);
        token.transferFrom(msg.sender, address(this), tokenAmount);

        // Approve router
        usdt.approve(address(uniswapRouter), usdtAmount);
        token.approve(address(uniswapRouter), tokenAmount);

        // Add liquidity
        uniswapRouter.addLiquidity(
            address(usdt),
            address(token),
            usdtAmount,
            tokenAmount,
            usdtAmount * 95 / 100,  // Allow 5% slippage
            tokenAmount * 95 / 100,  // Allow 5% slippage
            msg.sender,
            block.timestamp
        );
    }
}
