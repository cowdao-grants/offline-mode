// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV2Factory} from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import {IUniswapV2Pair} from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

/// @title AddLiquidityDirect
/// @notice Add initial liquidity to Uniswap V2 pairs using direct transfer + mint
contract AddLiquidityDirect is Script {

    /// @dev Helper function to add liquidity to a pair
    function addLiquidityToPair(
        address factory,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        address deployer
    ) internal {
        address pair = IUniswapV2Factory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "Pair not found");

        IERC20(tokenA).transfer(pair, amountA);
        IERC20(tokenB).transfer(pair, amountB);
        IUniswapV2Pair(pair).mint(deployer);
    }

    function run() external {
        // Load deployer private key
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Load token addresses
        address weth = vm.envAddress("WETH_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address dai = vm.envAddress("DAI_ADDRESS");
        address usdt = vm.envAddress("USDT_ADDRESS");
        address gno = vm.envAddress("GNO_ADDRESS");

        // Load Uniswap factory - REQUIRED for pair lookup
        address factory = vm.envAddress("UNISWAP_FACTORY");

        console.log("===========================================");
        console.log("ADDING LIQUIDITY TO UNISWAP V2 PAIRS");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Factory:", factory);
        console.log("");
        console.log("Tokens:");
        console.log("  WETH:", weth);
        console.log("  USDC:", usdc);
        console.log("  DAI:", dai);
        console.log("  USDT:", usdt);
        console.log("  GNO:", gno);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Add liquidity to all pairs
        // WETH = $2000, USDC = $1, DAI = $1, USDT = $1, GNO = $100

        console.log("Adding liquidity to WETH pairs...");
        addLiquidityToPair(factory, weth, usdc, 100 ether, 200_000 * 1e6, deployer);
        addLiquidityToPair(factory, weth, dai, 100 ether, 200_000 * 1e18, deployer);
        addLiquidityToPair(factory, weth, usdt, 100 ether, 200_000 * 1e6, deployer);
        addLiquidityToPair(factory, weth, gno, 100 ether, 2_000 * 1e18, deployer);

        console.log("Adding liquidity to USDC pairs...");
        addLiquidityToPair(factory, usdc, dai, 100_000 * 1e6, 100_000 * 1e18, deployer);
        addLiquidityToPair(factory, usdc, usdt, 100_000 * 1e6, 100_000 * 1e6, deployer);
        addLiquidityToPair(factory, usdc, gno, 100_000 * 1e6, 1_000 * 1e18, deployer);

        console.log("Adding liquidity to DAI pairs...");
        addLiquidityToPair(factory, dai, usdt, 100_000 * 1e18, 100_000 * 1e6, deployer);
        addLiquidityToPair(factory, dai, gno, 100_000 * 1e18, 1_000 * 1e18, deployer);

        console.log("Adding liquidity to USDT-GNO pair...");
        addLiquidityToPair(factory, usdt, gno, 100_000 * 1e6, 1_000 * 1e18, deployer);

        vm.stopBroadcast();

        console.log("");
        console.log("===========================================");
        console.log("LIQUIDITY ADDED SUCCESSFULLY");
        console.log("===========================================");
    }
}
