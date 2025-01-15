// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    
    function exactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        address recipient,
        uint256 deadline,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 sqrtPriceLimitX96
    ) external payable returns (uint256 amountOut);

    function exactOutputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        address recipient,
        uint256 deadline,
        uint256 amountOut,
        uint256 amountInMaximum,
        uint160 sqrtPriceLimitX96
    ) external payable returns (uint256 amountIn);

    function exactInput(
        bytes calldata path,
        address recipient,
        uint256 deadline,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external payable returns (uint256 amountOut);

    function exactOutput(
        bytes calldata path,
        address recipient,
        uint256 deadline,
        uint256 amountOut,
        uint256 amountInMaximum
    ) external payable returns (uint256 amountIn);
}
