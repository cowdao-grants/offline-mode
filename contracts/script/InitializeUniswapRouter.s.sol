// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IUniswapV2Router02} from "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

/// @title InitializeUniswapRouter
/// @notice Approve the router to spend tokens by directly setting ERC20 allowance storage
contract InitializeUniswapRouter is Script {
    /// @notice Set allowance by directly writing to storage slot
    /// @dev This persists to Anvil state files, unlike vm.prank() transactions
    function setAllowance(address token, address owner, address spender, uint256 amount) internal {
        // Standard ERC20 allowance storage layout:
        // mapping(address => mapping(address => uint256)) public allowance; // slot 1

        // Calculate storage slot: keccak256(abi.encode(spender, keccak256(abi.encode(owner, 1))))
        bytes32 ownerSlot = keccak256(abi.encode(owner, uint256(1)));
        bytes32 allowanceSlot = keccak256(abi.encode(spender, ownerSlot));

        // Set the allowance value
        vm.store(token, allowanceSlot, bytes32(amount));
    }

    function run() external {
        // Load deployer private key
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Load addresses
        address weth = vm.envAddress("WETH_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address dai = vm.envAddress("DAI_ADDRESS");
        address usdt = vm.envAddress("USDT_ADDRESS");
        address gno = vm.envAddress("GNO_ADDRESS");
        address router = vm.envAddress("UNISWAP_ROUTER");
        address settlement = vm.envAddress("COW_SETTLEMENT");

        console.log("===========================================");
        console.log("INITIALIZING UNISWAP ROUTER");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Settlement:", settlement);
        console.log("Router:", router);
        console.log("");
        console.log("Tokens to approve:");
        console.log("  WETH:", weth);
        console.log("  USDC:", usdc);
        console.log("  DAI:", dai);
        console.log("  USDT:", usdt);
        console.log("  GNO:", gno);
        console.log("");

        // Verify router can access WETH and factory
        try IUniswapV2Router02(router).WETH() returns (address wethFromRouter) {
            console.log("Router WETH check passed:", wethFromRouter);
            require(wethFromRouter == weth, "Router WETH mismatch!");
        } catch {
            console.log("ERROR: Router WETH() call failed!");
            revert("Router initialization failed");
        }

        try IUniswapV2Router02(router).factory() returns (address factoryFromRouter) {
            console.log("Router factory check passed:", factoryFromRouter);
        } catch {
            console.log("ERROR: Router factory() call failed!");
            revert("Router factory check failed");
        }

        console.log("");
        console.log("Approving ROUTER to spend tokens from SETTLEMENT contract...");
        console.log("Router address:", router);
        console.log("");
        console.log("IMPORTANT: Using vm.store() to set approvals directly in storage");
        console.log("This ensures approvals persist when state is saved/loaded in Anvil");
        console.log("");

        uint256 maxAmount = type(uint256).max;

        // Use vm.store to directly set the allowance storage slots
        // This is necessary because vm.prank() transactions don't persist to Anvil state files
        // ERC20 allowance storage: mapping(address => mapping(address => uint256)) at slot 1 (for most tokens)
        // Storage slot = keccak256(abi.encode(spender, keccak256(abi.encode(owner, allowanceSlot))))

        setAllowance(weth, settlement, router, maxAmount);
        console.log("  WETH approved to router from settlement");

        setAllowance(usdc, settlement, router, maxAmount);
        console.log("  USDC approved to router from settlement");

        setAllowance(dai, settlement, router, maxAmount);
        console.log("  DAI approved to router from settlement");

        setAllowance(usdt, settlement, router, maxAmount);
        console.log("  USDT approved to router from settlement");

        setAllowance(gno, settlement, router, maxAmount);
        console.log("  GNO approved to router from settlement");

        console.log("");
        console.log("===========================================");
        console.log("UNISWAP ROUTER INITIALIZED");
        console.log("===========================================");
    }
}
