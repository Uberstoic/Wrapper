// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IUniswapV2Pair {
    function price0CumulativeLast() external view returns (uint);
    function price1CumulativeLast() external view returns (uint);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() 
        external 
        view 
        returns (
            uint112 reserve0, 
            uint112 reserve1, 
            uint32 blockTimestampLast
        );
}