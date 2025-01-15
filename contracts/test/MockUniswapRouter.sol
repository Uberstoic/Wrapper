// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUniswapV3Router {
    event ExactInput(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event ExactOutput(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    uint256 constant PRICE_DECIMALS = 1e8;

    // Mock function for `exactInput`
    function exactInput(
        bytes calldata path,
        address recipient,
        uint256 deadline,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external returns (uint256 amountOut) {
        require(deadline >= block.timestamp, "UniswapV3Router: EXPIRED");

        // Decode path to simulate token swaps
        (address tokenIn, address tokenOut, uint24 fee) = decodePath(path);

        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        amountOut = amountIn * PRICE_DECIMALS / 30000; // Simplified: Mock price calculation
        require(amountOut >= amountOutMinimum, "UniswapV3Router: INSUFFICIENT_OUTPUT_AMOUNT");

        IERC20(tokenOut).transfer(recipient, amountOut);
        emit ExactInput(tokenIn, tokenOut, amountIn, amountOut);
    }

    // Mock function for `exactOutput`
    function exactOutput(
        bytes calldata path,
        address recipient,
        uint256 deadline,
        uint256 amountOut,
        uint256 amountInMaximum
    ) external returns (uint256 amountIn) {
        require(deadline >= block.timestamp, "UniswapV3Router: EXPIRED");

        // Decode path to simulate token swaps
        (address tokenIn, address tokenOut, uint24 fee) = decodePath(path);

        amountIn = amountOut * 30000 / PRICE_DECIMALS; // Simplified: Mock price calculation
        require(amountIn <= amountInMaximum, "UniswapV3Router: EXCESSIVE_INPUT_AMOUNT");

        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).transfer(recipient, amountOut);
        emit ExactOutput(tokenIn, tokenOut, amountIn, amountOut);
    }

    // Helper function to decode path
    function decodePath(bytes calldata path)
        internal
        pure
        returns (address tokenIn, address tokenOut, uint24 fee)
    {
        require(path.length >= 43, "Invalid path");
        tokenIn = address(bytes20(path[0:20]));
        tokenOut = address(bytes20(path[23:43]));
        fee = uint24(bytes3(path[20:23]));
    }

    // Mock liquidity-related functions can be added here as needed
}
