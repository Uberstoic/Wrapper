// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IUniswapV2Router02.sol";

contract MockUniswapRouter {
    uint256 constant PRICE_DECIMALS = 1e8;
    uint256 constant TOKEN_PRICE = 30000 * PRICE_DECIMALS; // $30,000 per token

    event LiquidityAdded(
        address indexed tokenA,
        address indexed tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 amountAMin,
        uint256 amountBMin,
        address indexed to,
        uint256 deadline
    );

    event LiquidityRemoved(
        address indexed tokenA,
        address indexed tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address indexed to,
        uint256 deadline
    );

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(deadline >= block.timestamp, "UniswapV2Router: EXPIRED");
        require(path.length >= 2, "UniswapV2Router: INVALID_PATH");
        
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[amounts.length - 1] = amountOutMin;

        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        IERC20(path[path.length - 1]).transfer(to, amountOutMin);
        
        return amounts;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        require(deadline >= block.timestamp, "Expired");
        require(amountADesired >= amountAMin, "Insufficient A amount");
        require(amountBDesired >= amountBMin, "Insufficient B amount");

        // Transfer tokens
        IERC20(tokenA).transferFrom(msg.sender, address(this), amountADesired);
        IERC20(tokenB).transferFrom(msg.sender, address(this), amountBDesired);

        // Emit event
        emit LiquidityAdded(
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin,
            to,
            deadline
        );

        // Mock liquidity token minting
        liquidity = amountADesired; // Simplified liquidity calculation
        amountA = amountADesired;
        amountB = amountBDesired;

        return (amountA, amountB, liquidity);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB) {
        require(deadline >= block.timestamp, "UniswapV2Router: EXPIRED");
        amountA = amountAMin;
        amountB = amountBMin;
        
        // Transfer tokens back
        IERC20(tokenA).transfer(to, amountA);
        IERC20(tokenB).transfer(to, amountB);

        emit LiquidityRemoved(
            tokenA,
            tokenB,
            liquidity,
            amountAMin,
            amountBMin,
            to,
            deadline
        );
        
        return (amountA, amountB);
    }

    // Storage variable for token address
    IERC20 public token;

    // Function to set token address
    function setToken(address _token) external {
        token = IERC20(_token);
    }
    
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts) {
        // Mock implementation
        amounts = new uint256[](path.length);
        for (uint256 i = 0; i < path.length; i++) {
            amounts[i] = amountIn; // Simplified calculation
        }
        return amounts;
    }

    function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts) {
        // Mock implementation
        amounts = new uint256[](path.length);
        for (uint256 i = 0; i < path.length; i++) {
            amounts[i] = amountOut; // Simplified calculation
        }
        return amounts;
    }

    // Example function for calculating price deviation
    function calculatePriceDeviation(address tokenA, address tokenB) internal view returns (uint256) {
        // Implement price deviation calculation logic
        // For example, compare current price with reference price
        uint256 currentPrice = getCurrentPrice(tokenA, tokenB);
        uint256 referencePrice = getReferencePrice(tokenA, tokenB);
        return (currentPrice > referencePrice) ? (currentPrice - referencePrice) : (referencePrice - currentPrice);
    }

    function getCurrentPrice(address tokenA, address tokenB) internal view returns (uint256) {
        // Implement logic for getting current price
        return 0; // Example value
    }

    function getReferencePrice(address tokenA, address tokenB) internal view returns (uint256) {
        // Implement logic for getting reference price
        return 0; // Example value
    }
}
