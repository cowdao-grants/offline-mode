// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";

/// @notice Deploy the Singleton Factory (Deterministic Deployer) at 0x4e59b44847b379578588920cA78FbF26c0B4956C
/// @dev This contract enables deterministic CREATE2 deployments across all EVM chains
contract DeploySingletonFactory is Script {
    // The well-known address where the Singleton Factory should be deployed
    address constant SINGLETON_FACTORY = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // The bytecode of the Singleton Factory contract
    // This is the actual runtime code of the factory
    bytes constant SINGLETON_FACTORY_CODE = hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";

    function run() external {
        console.log("Deploying Singleton Factory at:", SINGLETON_FACTORY);

        // Check if already deployed
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(SINGLETON_FACTORY)
        }

        if (codeSize > 0) {
            console.log("Singleton Factory already deployed, skipping");
            return;
        }

        // The Singleton Factory is deployed using a presigned transaction
        // In our case, we'll use Anvil's etching capability to set the code directly
        vm.etch(SINGLETON_FACTORY, SINGLETON_FACTORY_CODE);

        console.log("Singleton Factory deployed successfully");

        // Verify deployment
        assembly {
            codeSize := extcodesize(SINGLETON_FACTORY)
        }
        require(codeSize > 0, "Failed to deploy Singleton Factory");
        console.log("Verified: Singleton Factory code size:", codeSize);
    }
}
