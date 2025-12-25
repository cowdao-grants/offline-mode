// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

/**
 * @title MockChainlinkOracle
 * @notice Mock Chainlink price oracle for testing conditional orders in offline mode
 * @dev Implements IAggregatorV3Interface with configurable price
 */
contract MockChainlinkOracle {
    uint8 private _decimals;
    int256 private _price;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 initialPrice) {
        _decimals = decimals_;
        _price = initialPrice;
        _updatedAt = block.timestamp;
    }

    /**
     * @notice Get the number of decimals for the price
     * @return The number of decimals (e.g., 8 for USD prices, 18 for ETH prices)
     */
    function decimals() external view returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Get the latest round data
     * @dev Returns mock data with configurable price
     * @return roundId The round ID (always 1 for mock)
     * @return answer The price (in decimals specified)
     * @return startedAt The timestamp when round started
     * @return updatedAt The timestamp when round was updated
     * @return answeredInRound The round ID (always 1 for mock)
     */
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, _price, _updatedAt, _updatedAt, 1);
    }

    /**
     * @notice Update the mock price
     * @param newPrice The new price to set
     */
    function setPrice(int256 newPrice) external {
        _price = newPrice;
        _updatedAt = block.timestamp;
    }

    /**
     * @notice Get the current mock price
     * @return The current price
     */
    function getPrice() external view returns (int256) {
        return _price;
    }
}
