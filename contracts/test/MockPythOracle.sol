// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@pythnetwork/pyth-sdk-solidity/AbstractPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "@pythnetwork/pyth-sdk-solidity/PythErrors.sol";

contract MockPythOracle is AbstractPyth {
    mapping(bytes32 => PythStructs.Price) private prices;
    mapping(bytes32 => PythStructs.PriceFeed) private feeds;
    int32 private constant PRICE_EXPO = -8; // Same as Chainlink for consistency
    uint private constant VALID_TIME_PERIOD = 3600; // 1 hour

    constructor() {
        // Initialize with BTC price of $30,000
        bytes32 priceId = bytes32("BTC/USD");
        prices[priceId] = PythStructs.Price(
            30000 * 10**8, // price
            uint64(0),     // conf
            PRICE_EXPO,    // expo
            uint64(block.timestamp)  // timestamp
        );

        // Initialize price feed
        feeds[priceId] = PythStructs.PriceFeed({
            id: priceId,
            price: prices[priceId],
            emaPrice: prices[priceId]
        });
    }

    function setPrice(bytes32 priceId, int64 price) external {
        prices[priceId] = PythStructs.Price(
            price,
            uint64(0),
            PRICE_EXPO,
            uint64(block.timestamp)
        );

        // Update price feed as well
        feeds[priceId] = PythStructs.PriceFeed({
            id: priceId,
            price: prices[priceId],
            emaPrice: prices[priceId]
        });
    }

    function queryPriceFeed(bytes32 id) public view override returns (PythStructs.PriceFeed memory priceFeed) {
        if (!priceFeedExists(id)) revert PythErrors.PriceFeedNotFound();
        return feeds[id];
    }

    function priceFeedExists(bytes32 id) public view override returns (bool exists) {
        return prices[id].publishTime > 0;
    }

    function getValidTimePeriod() public pure override returns (uint) {
        return VALID_TIME_PERIOD;
    }

    function updatePriceFeeds(bytes[] calldata updateData) public payable override {
        // Mock implementation - do nothing
    }

    function updatePriceFeedsIfNecessary(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64[] calldata publishTimes
    ) public payable override {
        // Mock implementation - do nothing
    }

    function getUpdateFee(bytes[] calldata updateData) public pure override returns (uint) {
        return 0;
    }

    function parsePriceFeedUpdates(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable override returns (PythStructs.PriceFeed[] memory priceFeeds) {
        // Mock implementation - return empty array
        priceFeeds = new PythStructs.PriceFeed[](0);
        return priceFeeds;
    }

    function parsePriceFeedUpdatesUnique(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable override returns (PythStructs.PriceFeed[] memory priceFeeds) {
        // Mock implementation - return empty array
        priceFeeds = new PythStructs.PriceFeed[](0);
        return priceFeeds;
    }
}
