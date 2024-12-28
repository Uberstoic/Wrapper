// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import '../node_modules/@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol';
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

    address public Token;
    address public usdtToken;

    constructor(
        address _uniswapRouter,
        address _chainlinkOracle,
        address _pythOracle,
        address _tokenAddress,
        address _usdtAddress
    ) {
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);
        chainlinkOracle = AggregatorV3Interface(_chainlinkOracle);
        pythOracle = IPyth(_pythOracle);

        token = IERC20(_tokenAddress);
        usdt = IERC20(_usdtAddress);
    }

    function getChainlinkPrice() public view returns (uint256) {
        (, int256 price, , , ) = chainlinkOracle.latestRoundData();
        require(price > 0, "Invalid Chainlink price");
        return uint256(price);
    }

    function getPythPrice() public view returns (uint256) {
        bytes32 priceId = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43; 
        PythStructs.Price memory pythPrice = pythOracle.getPriceUnsafe(priceId);
        require(pythPrice.price > 0, "Invalid Pyth price");
        return uint256(pythPrice.price);
    }

    function addLiquidityWithStable(uint256 usdtAmount) external {
        require(usdt.balanceOf(msg.sender) >= usdtAmount, "Insufficient USDT balance");

        // Transfer USDT from user to contract
        usdt.transferFrom(msg.sender, address(this), usdtAmount);

        // Get token price in USDT
        uint256 tokenPrice = getChainlinkPrice(); // Example: prioritize Chainlink

        // Calculate required token amount
        uint256 tokenAmount = (usdtAmount * 1e18) / tokenPrice;

        // Swap USDT for token
        uint256 halfUSDT = usdtAmount / 2;
        swapUSDTForToken(halfUSDT);

        // Approve Uniswap Router to spend tokens
        usdt.approve(address(uniswapRouter), halfUSDT);
        token.approve(address(uniswapRouter), tokenAmount);

        // Add liquidity to Uniswap pool
        uniswapRouter.addLiquidity(
            address(usdt),
            address(token),
            halfUSDT,
            tokenAmount,
            0,
            0,
            msg.sender,
            block.timestamp
        );
    }

    function swapUSDTForToken(uint256 usdtAmount) internal {
        address[] memory path = new address[](2);
        path[0] = address(usdt);
        path[1] = address(token);

        usdt.approve(address(uniswapRouter), usdtAmount);

        uniswapRouter.swapExactTokensForTokens(
            usdtAmount,
            0,
            path,
            address(this),
            block.timestamp
        );
    }
}
