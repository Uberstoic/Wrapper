// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract MockPythOracle is IPyth {
    int64 private _price;
    
    constructor() {
        _price = 30000 * 10**8; // Initial price $30,000 with 8 decimals
    }

    function setPrice(int64 newPrice) external {
        _price = newPrice;
    }

    function getPriceUnsafe(bytes32) external view returns (PythStructs.Price memory) {
        return PythStructs.Price({
            price: _price,
            conf: 0,
            expo: -8,
            publishTime: uint64(block.timestamp)
        });
    }

    function getEmaPriceUnsafe(bytes32) external view returns (PythStructs.Price memory) {
        return PythStructs.Price({
            price: _price,
            conf: 0,
            expo: -8,
            publishTime: uint64(block.timestamp)
        });
    }

    function getPrice(bytes32) external pure returns (PythStructs.Price memory) {
        revert("Not implemented");
    }

    function getEmaPrice(bytes32) external pure returns (PythStructs.Price memory) {
        revert("Not implemented");
    }

    function getPriceNoOlderThan(bytes32, uint) external pure returns (PythStructs.Price memory) {
        revert("Not implemented");
    }

    function getEmaPriceNoOlderThan(bytes32, uint) external pure returns (PythStructs.Price memory) {
        revert("Not implemented");
    }

    function getPriceUpdateData(bytes32) external pure returns (bytes memory) {
        revert("Not implemented");
    }

    function getUpdateFee(bytes[] memory) external pure returns (uint) {
        return 0;
    }

    function updatePriceFeeds(bytes[] memory) external payable {
        // Mock implementation - do nothing
    }

    function updatePriceFeedsIfNecessary(bytes[] memory, bytes32[] memory, uint64[] memory) external payable {
        // Mock implementation - do nothing
    }

    function parsePriceFeedUpdates(bytes[] memory, bytes32[] memory, uint64, uint64) external payable returns (PythStructs.PriceFeed[] memory) {
        PythStructs.PriceFeed[] memory feeds = new PythStructs.PriceFeed[](0);
        return feeds;
    }

    function parsePriceFeedUpdatesUnique(bytes[] memory, bytes32[] memory, uint64, uint64) external payable returns (PythStructs.PriceFeed[] memory) {
        PythStructs.PriceFeed[] memory feeds = new PythStructs.PriceFeed[](0);
        return feeds;
    }

    function getValidTimePeriod() external pure returns (uint) {
        return 3600;
    }
}
