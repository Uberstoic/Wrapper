// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract MockChainlinkOracle is AggregatorV3Interface {
    int256 private price = 23000 * 10**8; // $23,000 with 8 decimals
    uint80 private roundId = 1;
    uint256 private timestamp = block.timestamp;

    function decimals() external pure override returns (uint8) {
        return 8;
    }

    function description() external pure override returns (string memory) {
        return "BTC/USD";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 _roundId) external view override returns (
        uint80 roundId_,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (roundId, price, timestamp, timestamp, roundId);
    }

    function latestRoundData() external view override returns (
        uint80 roundId_,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (roundId, price, timestamp, timestamp, roundId);
    }

    // Function to update the price (for testing)
    function setPrice(int256 _price) external {
        price = _price;
        roundId++;
        timestamp = block.timestamp;
    }
}
