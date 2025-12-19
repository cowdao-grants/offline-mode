// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";

contract DeployCoWShed is Script {
    // Deterministic salts for CREATE2
    bytes32 constant IMPLEMENTATION_SALT = keccak256("cowshed-implementation");
    bytes32 constant FACTORY_SALT = keccak256("cowshed-factory");

    function deployWithCreate2(bytes memory bytecode, bytes32 salt) internal returns (address addr) {
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying CoWShed contracts with CREATE2...");
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy COWShed Implementation using CREATE2
        console.log("\n1. Deploying COWShed Implementation with CREATE2...");
        string memory implementationJson = vm.readFile("contracts/out-cow-shed/COWShed.sol/COWShed.json");
        bytes memory implementationCreationCode = vm.parseJsonBytes(implementationJson, ".bytecode.object");
        address implementation = deployWithCreate2(implementationCreationCode, IMPLEMENTATION_SALT);
        console.log("COWShed Implementation deployed at:", implementation);

        // Deploy COWShedFactory using CREATE2
        console.log("\n2. Deploying COWShedFactory with CREATE2...");
        string memory factoryJson = vm.readFile("contracts/out-cow-shed/COWShedFactory.sol/COWShedFactory.json");
        bytes memory factoryCreationCode = vm.parseJsonBytes(factoryJson, ".bytecode.object");
        bytes memory factoryBytecode = abi.encodePacked(
            factoryCreationCode,
            abi.encode(implementation)
        );
        address factory = deployWithCreate2(factoryBytecode, FACTORY_SALT);
        console.log("COWShedFactory deployed at:", factory);

        vm.stopBroadcast();

        console.log("\nCoWShed deployment complete!");
        console.log("\nDeployed Addresses:");
        console.log("  Implementation:", implementation);
        console.log("  Factory:", factory);
    }
}
