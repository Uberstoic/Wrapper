// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IUniswapTWAPOracle {
    function update() external;
    function consult(address tokenIn, uint256 amountIn, address tokenOut) external view returns (uint256 amountOut);
    function getPrice() external view returns (uint256);
}
