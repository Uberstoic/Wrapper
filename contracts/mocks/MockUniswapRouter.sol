// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IUniswapV2Router02.sol";

contract MockUniswapRouter {
    uint256 constant PRICE_DECIMALS = 1e8;
    uint256 constant TOKEN_PRICE = 30000 * PRICE_DECIMALS; // $30,000 per token

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint[] memory amounts) {
        require(deadline >= block.timestamp, "Expired");
        require(path.length == 2, "Invalid path");

        // Calculate output amount based on fixed price (1 token = 30,000 USDT)
        uint256 amountOut;
        if (path[0] == path[1]) {
            amountOut = amountIn;
        } else {
            // If swapping USDT for token
            if (path[1] == address(token)) {
                amountOut = (amountIn * PRICE_DECIMALS) / TOKEN_PRICE;
            } else {
                // If swapping token for USDT
                amountOut = (amountIn * TOKEN_PRICE) / PRICE_DECIMALS;
            }
        }

        require(amountOut >= amountOutMin, "Insufficient output amount");

        // Transfer tokens
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        IERC20(path[1]).transfer(to, amountOut);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;
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

        // Mock liquidity token minting
        liquidity = amountADesired; // Simplified liquidity calculation
        amountA = amountADesired;
        amountB = amountBDesired;

        return (amountA, amountB, liquidity);
    }

    // Storage variable for token address
    IERC20 public token;

    // Function to set token address
    function setToken(address _token) external {
        token = IERC20(_token);
    }
}
