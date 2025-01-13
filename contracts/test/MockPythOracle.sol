// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract MockPythOracle is IPyth {
    int64 private price = 96000 * 10**8; // $96,000 with 8 decimals
    uint64 private conf = 0;
    int32 private expo = -8;
    uint64 private publishTime = uint64(block.timestamp);

    function getPrice(bytes32 priceId) external view returns (PythStructs.Price memory) {
        return PythStructs.Price(price, conf, expo, publishTime);
    }

    function getPriceUnsafe(bytes32 priceId) external view returns (PythStructs.Price memory) {
        return this.getPrice(priceId);
    }

    function setPrice(int64 newPrice) external {
        price = newPrice;
        publishTime = uint64(block.timestamp);
    }

    function getValidTimePeriod() external pure returns (uint) {
        return 3600; // 60 seconds validity period
    }

    function getUpdateFee(bytes[] calldata) external pure returns (uint) {
        return 0;
    }

    function updatePriceFeeds(bytes[] calldata) external payable {
        // Mock implementation - do nothing
    }

    function updatePriceFeedsIfNecessary(
        bytes[] calldata,
        bytes32[] calldata,
        uint64[] calldata
    ) external payable {
        // Mock implementation - do nothing
    }

    function parsePriceFeedUpdates(
        bytes[] calldata,
        bytes32[] calldata,
        uint64,
        uint64
    ) external payable returns (PythStructs.PriceFeed[] memory) {
        // Return empty array
        return new PythStructs.PriceFeed[](0);
    }

    function parsePriceFeedUpdatesUnique(
        bytes[] calldata,
        bytes32[] calldata,
        uint64,
        uint64
    ) external payable returns (PythStructs.PriceFeed[] memory) {
        // Return empty array
        return new PythStructs.PriceFeed[](0);
    }

    function getEmaPriceUnsafe(bytes32 priceId) external view returns (PythStructs.Price memory) {
        return this.getPrice(priceId);
    }

    function getEmaPriceNoOlderThan(bytes32 priceId, uint age) external view returns (PythStructs.Price memory) {
        return this.getPrice(priceId);
    }

    function getPriceNoOlderThan(bytes32 priceId, uint age) external view returns (PythStructs.Price memory) {
        return this.getPrice(priceId);
    }
}
