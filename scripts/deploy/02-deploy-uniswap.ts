/**
 * Deploy Uniswap V2 (Factory + Router + Pools)
 */

import { DeploymentConfig, TokenAddresses, UniswapAddresses } from './types';
import {
  printSection,
  printDeployment,
} from './utils';
import { execSync } from 'child_process';
import * as fs from 'fs';

export async function deployUniswap(
  config: DeploymentConfig,
  tokens: TokenAddresses
): Promise<UniswapAddresses> {
  printSection('STEP 2: Deploying Uniswap V2 (Factory + Router) at mainnet addresses');

  // Mainnet deployer address for Uniswap contracts
  const uniswapDeployer = '0x9C33eaCc2F50E39940D3AfaF2c7B8246B681A374';
  const mainnetFactory = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
  const mainnetRouter = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

  console.log('Setting up Uniswap deployer account...');

  // Fund the Uniswap deployer with ETH
  console.log('  Funding Uniswap deployer with ETH...');
  execSync(
    `cast send ${uniswapDeployer} --value 100ether --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Set nonce to 0 for factory deployment
  console.log('  Setting deployer nonce to 0...');
  execSync(
    `cast rpc anvil_setNonce ${uniswapDeployer} 0x0 --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  console.log('');
  console.log('Deploying UniswapV2Factory at mainnet address...');

  // Get the factory creation bytecode from npm package
  console.log('  Reading UniswapV2Factory bytecode from npm package...');
  const factoryJsonPath = 'node_modules/@uniswap/v2-core/build/UniswapV2Factory.json';
  const factoryJson = JSON.parse(fs.readFileSync(factoryJsonPath, 'utf8'));
  const factoryCreationCode = factoryJson.bytecode;

  // Encode factory constructor parameters (feeToSetter = uniswapDeployer)
  const factoryConstructorArgs = execSync(
    `cast abi-encode "constructor(address)" ${uniswapDeployer}`,
    { encoding: 'utf8' }
  ).trim();

  // Combine creation code with constructor args
  const factoryBytecode = factoryCreationCode + factoryConstructorArgs.slice(2); // Remove 0x prefix from args

  console.log('  Deploying Factory to temporary address...');
  const factoryDeployOutput = execSync(
    `cast send --rpc-url ${config.rpcUrl} --private-key ${config.deployerPrivateKey} --create ${factoryBytecode} --json`,
    { encoding: 'utf8' }
  );
  const tempFactoryAddress = JSON.parse(factoryDeployOutput).contractAddress;
  console.log('  Deployed Factory temporarily at:', tempFactoryAddress);

  // Get the runtime bytecode from the deployed contract
  console.log('  Fetching runtime bytecode...');
  const factoryRuntimeBytecode = execSync(
    `cast code ${tempFactoryAddress} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  // Set the runtime bytecode at the mainnet address
  console.log('  Setting Factory bytecode at mainnet address...');
  execSync(
    `cast rpc anvil_setCode ${mainnetFactory} ${factoryRuntimeBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  console.log('  ✅ Factory deployed at mainnet address:', mainnetFactory);

  // Get Router bytecode from npm package and construct with MAINNET factory address
  console.log('');
  console.log('Deploying UniswapV2Router02 at mainnet address...');
  console.log('  Reading UniswapV2Router02 bytecode from npm package...');
  const routerJsonPath = 'node_modules/@uniswap/v2-periphery/build/UniswapV2Router02.json';
  const routerJson = JSON.parse(fs.readFileSync(routerJsonPath, 'utf8'));
  const routerCreationCode = routerJson.bytecode;

  // Encode router constructor parameters with MAINNET factory address
  const routerConstructorArgs = execSync(
    `cast abi-encode "constructor(address,address)" ${mainnetFactory} ${tokens.WETH}`,
    { encoding: 'utf8' }
  ).trim();

  // Combine creation code with constructor args
  const routerBytecode = routerCreationCode + routerConstructorArgs.slice(2); // Remove 0x prefix from args

  console.log('  Deploying Router to temporary address with mainnet factory:', mainnetFactory);
  const routerDeployOutput = execSync(
    `FOUNDRY_DISABLE_NIGHTLY_WARNING=1 cast send --rpc-url ${config.rpcUrl} --private-key ${config.deployerPrivateKey} --create ${routerBytecode} --json`,
    { encoding: 'utf8' }
  );
  const tempRouterAddress = JSON.parse(routerDeployOutput).contractAddress;
  console.log('  Deployed Router temporarily at:', tempRouterAddress);

  // Get the runtime bytecode from the deployed contract
  console.log('  Fetching runtime bytecode...');
  const routerRuntimeBytecode = execSync(
    `cast code ${tempRouterAddress} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  // Set the runtime bytecode at the mainnet address
  console.log('  Setting Router bytecode at mainnet address...');
  execSync(
    `cast rpc anvil_setCode ${mainnetRouter} ${routerRuntimeBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  console.log('  ✅ Router deployed at mainnet address:', mainnetRouter);

  // Now create pairs using the mainnet factory
  console.log('');
  console.log('Creating pairs on mainnet factory...');

  const pairTokens = [
    { name: 'WETH-USDC', token0: tokens.WETH, token1: tokens.USDC },
    { name: 'WETH-DAI', token0: tokens.WETH, token1: tokens.DAI },
    { name: 'WETH-USDT', token0: tokens.WETH, token1: tokens.USDT },
    { name: 'WETH-GNO', token0: tokens.WETH, token1: tokens.GNO },
    { name: 'USDC-DAI', token0: tokens.USDC, token1: tokens.DAI },
    { name: 'USDC-USDT', token0: tokens.USDC, token1: tokens.USDT },
    { name: 'USDC-GNO', token0: tokens.USDC, token1: tokens.GNO },
    { name: 'DAI-USDT', token0: tokens.DAI, token1: tokens.USDT },
    { name: 'DAI-GNO', token0: tokens.DAI, token1: tokens.GNO },
    { name: 'USDT-GNO', token0: tokens.USDT, token1: tokens.GNO },
  ];

  const pairAddresses: { [key: string]: string } = {};

  for (const pair of pairTokens) {
    console.log(`  Creating ${pair.name} pair...`);

    // Create the pair
    execSync(
      `cast send ${mainnetFactory} "createPair(address,address)" ${pair.token0} ${pair.token1} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
      { stdio: 'inherit' }
    );

    // Get the pair address by calling getPair
    const pairAddress = execSync(
      `cast call ${mainnetFactory} "getPair(address,address)(address)" ${pair.token0} ${pair.token1} --rpc-url ${config.rpcUrl}`,
      { encoding: 'utf8' }
    ).trim();

    pairAddresses[pair.name] = pairAddress;
    console.log(`    ✅ ${pair.name} pair created at:`, pairAddress);
  }

  const factory = mainnetFactory;
  const router = mainnetRouter;

  // Use the created pair addresses
  const pairs = {
    WETH_USDC: pairAddresses['WETH-USDC'],
    WETH_DAI: pairAddresses['WETH-DAI'],
    WETH_USDT: pairAddresses['WETH-USDT'],
    WETH_GNO: pairAddresses['WETH-GNO'],
    USDC_DAI: pairAddresses['USDC-DAI'],
    USDC_USDT: pairAddresses['USDC-USDT'],
    USDC_GNO: pairAddresses['USDC-GNO'],
    DAI_USDT: pairAddresses['DAI-USDT'],
    DAI_GNO: pairAddresses['DAI-GNO'],
    USDT_GNO: pairAddresses['USDT-GNO'],
  };

  const addresses: UniswapAddresses = {
    factory,
    router,
    pairs,
  };

  console.log('');
  console.log('✅ Uniswap V2 deployed!');
  console.log('');
  console.log('📝 Deployed Uniswap addresses:');
  printDeployment('Factory', addresses.factory);
  printDeployment('Router', addresses.router);
  printDeployment('WETH-USDC Pair', addresses.pairs.WETH_USDC);
  printDeployment('WETH-DAI Pair', addresses.pairs.WETH_DAI);
  printDeployment('USDC-DAI Pair', addresses.pairs.USDC_DAI);
  printDeployment('WETH-USDT Pair', addresses.pairs.WETH_USDT);
  printDeployment('WETH-GNO Pair', addresses.pairs.WETH_GNO);
  printDeployment('USDC-USDT Pair', addresses.pairs.USDC_USDT);
  printDeployment('USDC-GNO Pair', addresses.pairs.USDC_GNO);
  printDeployment('DAI-USDT Pair', addresses.pairs.DAI_USDT);
  printDeployment('DAI-GNO Pair', addresses.pairs.DAI_GNO);
  printDeployment('USDT-GNO Pair', addresses.pairs.USDT_GNO);
  console.log('');

  return addresses;
}

// If run directly
if (require.main === module) {
  // This script requires token addresses, so it should be run via the main deploy script
  console.error('❌ This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
