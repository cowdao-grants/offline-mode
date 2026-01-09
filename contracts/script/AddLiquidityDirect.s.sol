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

        // Load liquidity amounts from environment variables
        uint256 wethUsdcWeth = vm.envUint("LIQUIDITY_WETH_USDC_TOKEN0");
        uint256 wethUsdcUsdc = vm.envUint("LIQUIDITY_WETH_USDC_TOKEN1");
        uint256 wethDaiWeth = vm.envUint("LIQUIDITY_WETH_DAI_TOKEN0");
        uint256 wethDaiDai = vm.envUint("LIQUIDITY_WETH_DAI_TOKEN1");
        uint256 wethUsdtWeth = vm.envUint("LIQUIDITY_WETH_USDT_TOKEN0");
        uint256 wethUsdtUsdt = vm.envUint("LIQUIDITY_WETH_USDT_TOKEN1");
        uint256 wethGnoWeth = vm.envUint("LIQUIDITY_WETH_GNO_TOKEN0");
        uint256 wethGnoGno = vm.envUint("LIQUIDITY_WETH_GNO_TOKEN1");
        uint256 usdcDaiUsdc = vm.envUint("LIQUIDITY_USDC_DAI_TOKEN0");
        uint256 usdcDaiDai = vm.envUint("LIQUIDITY_USDC_DAI_TOKEN1");
        uint256 usdcUsdtUsdc = vm.envUint("LIQUIDITY_USDC_USDT_TOKEN0");
        uint256 usdcUsdtUsdt = vm.envUint("LIQUIDITY_USDC_USDT_TOKEN1");
        uint256 usdcGnoUsdc = vm.envUint("LIQUIDITY_USDC_GNO_TOKEN0");
        uint256 usdcGnoGno = vm.envUint("LIQUIDITY_USDC_GNO_TOKEN1");
        uint256 daiUsdtDai = vm.envUint("LIQUIDITY_DAI_USDT_TOKEN0");
        uint256 daiUsdtUsdt = vm.envUint("LIQUIDITY_DAI_USDT_TOKEN1");
        uint256 daiGnoDai = vm.envUint("LIQUIDITY_DAI_GNO_TOKEN0");
        uint256 daiGnoGno = vm.envUint("LIQUIDITY_DAI_GNO_TOKEN1");
        uint256 usdtGnoUsdt = vm.envUint("LIQUIDITY_USDT_GNO_TOKEN0");
        uint256 usdtGnoGno = vm.envUint("LIQUIDITY_USDT_GNO_TOKEN1");

        vm.startBroadcast(deployerPrivateKey);

        // Add liquidity to all pairs with DEEP liquidity to prevent slippage

        console.log("Adding liquidity to WETH pairs...");
        addLiquidityToPair(factory, weth, usdc, wethUsdcWeth, wethUsdcUsdc, deployer);
        addLiquidityToPair(factory, weth, dai, wethDaiWeth, wethDaiDai, deployer);
        addLiquidityToPair(factory, weth, usdt, wethUsdtWeth, wethUsdtUsdt, deployer);
        addLiquidityToPair(factory, weth, gno, wethGnoWeth, wethGnoGno, deployer);

        console.log("Adding liquidity to USDC pairs...");
        addLiquidityToPair(factory, usdc, dai, usdcDaiUsdc, usdcDaiDai, deployer);
        addLiquidityToPair(factory, usdc, usdt, usdcUsdtUsdc, usdcUsdtUsdt, deployer);
        addLiquidityToPair(factory, usdc, gno, usdcGnoUsdc, usdcGnoGno, deployer);

        console.log("Adding liquidity to DAI pairs...");
        addLiquidityToPair(factory, dai, usdt, daiUsdtDai, daiUsdtUsdt, deployer);
        addLiquidityToPair(factory, dai, gno, daiGnoDai, daiGnoGno, deployer);

        console.log("Adding liquidity to USDT-GNO pair...");
        addLiquidityToPair(factory, usdt, gno, usdtGnoUsdt, usdtGnoGno, deployer);

        vm.stopBroadcast();

        console.log("");
        console.log("===========================================");
        console.log("LIQUIDITY ADDED SUCCESSFULLY");
        console.log("===========================================");
    }
}
