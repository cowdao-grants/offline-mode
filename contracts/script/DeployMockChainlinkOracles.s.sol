// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "forge-std/Script.sol";
import "../src/MockChainlinkOracle.sol";

/**
 * @title DeployMockChainlinkOracles
 * @notice Deploys mock Chainlink oracles for all base tokens
 * @dev Used for testing StopLoss conditional orders in offline mode
 */
contract DeployMockChainlinkOracles is Script {
    // Chainlink standard: 8 decimals for USD price feeds
    uint8 constant DECIMALS = 8;

    // Initial prices (in 8 decimals)
    // WETH/USD: $3000.00000000
    int256 constant WETH_PRICE = 3000_00000000;

    // DAI/USD: $1.00000000
    int256 constant DAI_PRICE = 1_00000000;

    // USDC/USD: $1.00000000
    int256 constant USDC_PRICE = 1_00000000;

    // USDT/USD: $1.00000000
    int256 constant USDT_PRICE = 1_00000000;

    // GNO/USD: $100.00000000
    int256 constant GNO_PRICE = 100_00000000;

    function run() external {
        vm.startBroadcast();

        // Deploy WETH/USD oracle
        MockChainlinkOracle wethOracle = new MockChainlinkOracle(DECIMALS, WETH_PRICE);
        console.log("WETH/USD Oracle deployed at:", address(wethOracle));
        console.log("  Initial price: $3000");

        // Deploy DAI/USD oracle
        MockChainlinkOracle daiOracle = new MockChainlinkOracle(DECIMALS, DAI_PRICE);
        console.log("DAI/USD Oracle deployed at:", address(daiOracle));
        console.log("  Initial price: $1");

        // Deploy USDC/USD oracle
        MockChainlinkOracle usdcOracle = new MockChainlinkOracle(DECIMALS, USDC_PRICE);
        console.log("USDC/USD Oracle deployed at:", address(usdcOracle));
        console.log("  Initial price: $1");

        // Deploy USDT/USD oracle
        MockChainlinkOracle usdtOracle = new MockChainlinkOracle(DECIMALS, USDT_PRICE);
        console.log("USDT/USD Oracle deployed at:", address(usdtOracle));
        console.log("  Initial price: $1");

        // Deploy GNO/USD oracle
        MockChainlinkOracle gnoOracle = new MockChainlinkOracle(DECIMALS, GNO_PRICE);
        console.log("GNO/USD Oracle deployed at:", address(gnoOracle));
        console.log("  Initial price: $100");

        vm.stopBroadcast();
    }
}
