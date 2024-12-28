// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract MockChainlinkOracle is AggregatorV3Interface {
    int256 private price;
    uint8 private decimals_;
    string private description_;

    constructor() {
        price = 30000 * 10**8; // $30,000 with 8 decimals
        decimals_ = 8;
        description_ = "BTC / USD";
    }

    function setPrice(int256 _price) external {
        price = _price;
    }

    function decimals() external view override returns (uint8) {
        return decimals_;
    }

    function description() external view override returns (string memory) {
        return description_;
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 _roundId)
        external
        pure
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, 0, 0, 0, 0);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (
            uint80(0),
            price,
            block.timestamp,
            block.timestamp,
            uint80(0)
        );
    }
}
