// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract MockPythOracle is IPyth {
    int64 private price = 30000 * 10**8; // $30,000 with 8 decimals
    uint64 private conf = 0;
    int32 private expo = -8;
    uint64 private publishTime = uint64(block.timestamp);

    function getPrice(bytes32 priceId) external view override returns (PythStructs.Price memory) {
        return PythStructs.Price(price, conf, expo, publishTime);
    }

    function getPriceUnsafe(bytes32 priceId) external view override returns (PythStructs.Price memory) {
        return this.getPrice(priceId);
    }

    function getPriceNoOlderThan(bytes32 priceId, uint64 age) external view override returns (PythStructs.Price memory) {
        require(block.timestamp - publishTime <= age, "Price too old");
        return this.getPrice(priceId);
    }

    function getEmaPriceUnsafe(bytes32 priceId) external view override returns (PythStructs.Price memory) {
        return this.getPrice(priceId);
    }

    function getEmaPriceNoOlderThan(bytes32 priceId, uint64 age) external view override returns (PythStructs.Price memory) {
        require(block.timestamp - publishTime <= age, "Price too old");
        return this.getPrice(priceId);
    }

    function setPrice(int64 newPrice) external {
        price = newPrice;
        publishTime = uint64(block.timestamp);
    }

    function getValidTimePeriod() external pure override returns (uint) {
        return 3600; // 1 hour validity period
    }

    function getUpdateFee(bytes[] calldata) external pure override returns (uint) {
        return 0;
    }

    function updatePriceFeeds(bytes[] calldata) external payable override {
        // Mock implementation - do nothing
    }

    function updatePriceFeedsIfNecessary(
        bytes[] calldata priceFeeds,
        bytes32[] calldata publishTimes,
        uint64[] calldata minPublishTimes
    ) external payable override {
        // Mock implementation - do nothing
    }

    function parsePriceFeedUpdates(
        bytes[] calldata priceFeeds,
        bytes32[] calldata ids,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable override returns (PythStructs.PriceFeed[] memory) {
        // Return empty array for mock implementation
        return new PythStructs.PriceFeed[](0);
    }

    function parsePriceFeedUpdatesUnique(
        bytes[] calldata priceFeeds,
        bytes32[] calldata ids,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable override returns (PythStructs.PriceFeed[] memory) {
        // Return empty array for mock implementation
        return new PythStructs.PriceFeed[](0);
    }
}     