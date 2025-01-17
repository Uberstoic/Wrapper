// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IUniswapTWAPOracle.sol";

contract MockUniswapTWAPOracle is IUniswapTWAPOracle {
    uint256 private mockPrice;
    uint256 private lastUpdate;
    bool private priceSet;

    constructor() {
        mockPrice = 30000 * 10**8; // Default price $30,000
        lastUpdate = block.timestamp;
        priceSet = true;
    }

    function setPrice(uint256 _price) external {
        mockPrice = _price;
        lastUpdate = block.timestamp;
        priceSet = _price > 0;
    }

    function update() external override {
        require(priceSet, "Price not initialized");
        lastUpdate = block.timestamp;
    }

    function getPrice() external view override returns (uint256) {
        require(priceSet, "Price not initialized");
        return mockPrice;
    }

    function consult(address tokenIn, uint256 amountIn, address tokenOut) external view returns (uint256) {
        require(priceSet, "Price not initialized");
        return mockPrice;
    }

    function getLastUpdate() external view returns (uint256) {
        return lastUpdate;
    }
}