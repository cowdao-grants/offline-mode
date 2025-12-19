// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";

/**
 * @title SetBlockNumber
 * @notice Sets the blockchain to a specific block number using vm.roll()
 * @dev This is step 0 of the deployment process for offline mode.
 *      It ensures the blockchain is at block 12593265 (mainnet Settlement deployment block)
 *      so that autopilot's settlement indexer queries work correctly.
 */
contract SetBlockNumber is Script {
    uint256 constant TARGET_BLOCK = 12593265;

    function run() public {
        console.log("========================================");
        console.log("STEP 0: Setting Block Number");
        console.log("========================================");

        uint256 currentBlock = block.number;
        console.log("Current block number:", currentBlock);
        console.log("Target block number:", TARGET_BLOCK);

        // Use vm.roll to set the block number
        vm.roll(TARGET_BLOCK);

        // Verify the block number was set correctly
        require(block.number == TARGET_BLOCK, "Failed to set block number");

        console.log("Block number successfully set to:", block.number);
        console.log("========================================");
    }
}
