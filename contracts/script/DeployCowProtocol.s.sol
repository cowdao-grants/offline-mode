
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {DeploymentUtils} from "./Utils.sol";
import "@cowprotocol/contracts/GPv2Settlement.sol";
import "@cowprotocol/contracts/GPv2AllowListAuthentication.sol";

contract DeployCowProtocol is Script {
    function run() external {
        address balancerVault = vm.envAddress("BALANCER_VAULT_ADDRESS");

        console.log("Deploying CoW Protocol contracts from source at mainnet addresses...");
        console.log("Balancer Vault:", balancerVault);

        // Use the CoW Protocol deployer address with correct nonce (set to 5 by TypeScript)
        // This will deploy contracts at their mainnet addresses via regular CREATE
        address cowDeployer = 0x7EAbac82dA8ea6Ac980d619Cb562a9924d1E3bAa;
        console.log("Using CoW deployer:", cowDeployer);
        vm.startBroadcast(cowDeployer);

        // Deploy GPv2AllowListAuthentication from source using regular CREATE (nonce 5)
        // Will deploy to: 0x2c4c28DDBdAc9C5E7055b4C863b72eA0149D8aFE
        console.log("Deploying GPv2AllowListAuthentication from source...");
        GPv2AllowListAuthentication authenticator = new GPv2AllowListAuthentication();
        console.log("GPv2AllowListAuthentication deployed at:", address(authenticator));

        // Deploy GPv2Settlement from source using regular CREATE (nonce 6)
        // Will deploy to: 0x9008D19f58AAbD9eD0D60971565AA8510560ab41
        // Settlement constructor takes (authenticator, vault) and creates VaultRelayer automatically
        console.log("Deploying GPv2Settlement from source...");
        GPv2Settlement settlement = new GPv2Settlement(authenticator, balancerVault);
        console.log("GPv2Settlement deployed at:", address(settlement));

        vm.stopBroadcast();

        // Get the VaultRelayer address from Settlement
        // The Settlement contract creates it automatically during construction
        bytes memory vaultRelayerCalldata = abi.encodeWithSignature("vaultRelayer()");
        (bool success, bytes memory vaultRelayerData) = settlement.staticcall(vaultRelayerCalldata);
        require(success, "Failed to get vaultRelayer address");
        address vaultRelayer = abi.decode(vaultRelayerData, (address));
        console.log("GPv2VaultRelayer (created by Settlement):", vaultRelayer);

        console.log("\nCoW Protocol deployment complete!");
    }
}
