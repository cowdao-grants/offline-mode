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
import { logger, indent } from './logger';

export async function deployUniswap(
  config: DeploymentConfig,
  tokens: TokenAddresses
): Promise<UniswapAddresses> {
  printSection('STEP 3: Deploying Uniswap V2 (Factory + Router) at mainnet addresses');

  // Mainnet deployer address for Uniswap contracts
  const UNISWAP_DEPLOYER = '0x9C33eaCc2F50E39940D3AfaF2c7B8246B681A374';
  const MAINNET_UNISWAP_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
  const MAINNET_UNISWAP_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

  logger.debug('Setting up Uniswap deployer account');

  // Fund the Uniswap deployer with ETH
  logger.trace(indent('Funding Uniswap deployer with ETH'));
  execSync(
    `cast send ${UNISWAP_DEPLOYER} --value 100ether --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Set nonce to 0 for factory deployment
  logger.trace(indent('Setting deployer nonce to 0'));
  execSync(
    `cast rpc anvil_setNonce ${UNISWAP_DEPLOYER} 0x0 --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.debug('Deploying UniswapV2Factory at mainnet address');

  // Get the factory creation bytecode from npm package
  logger.trace(indent('Reading UniswapV2Factory bytecode from npm package'));
  const factoryJsonPath = 'node_modules/@uniswap/v2-core/build/UniswapV2Factory.json';
  const factoryJson = JSON.parse(fs.readFileSync(factoryJsonPath, 'utf8'));
  const factoryCreationCode = factoryJson.bytecode;

  // Encode factory constructor parameters (feeToSetter = uniswapDeployer)
  const factoryConstructorArgs = execSync(
    `cast abi-encode "constructor(address)" ${UNISWAP_DEPLOYER}`,
    { encoding: 'utf8' }
  ).trim();

  // Combine creation code with constructor args
  const factoryBytecode = factoryCreationCode + factoryConstructorArgs.slice(2); // Remove 0x prefix from args

  logger.trace(indent('Deploying Factory to temporary address'));
  const factoryDeployOutput = execSync(
    `cast send --rpc-url ${config.rpcUrl} --private-key ${config.deployerPrivateKey} --create ${factoryBytecode} --json`,
    { encoding: 'utf8' }
  );
  const tempFactoryAddress = JSON.parse(factoryDeployOutput).contractAddress;
  logger.trace(indent(`Deployed Factory temporarily at: ${tempFactoryAddress}`));

  // Get the runtime bytecode from the deployed contract
  logger.trace(indent('Fetching runtime bytecode'));
  const factoryRuntimeBytecode = execSync(
    `cast code ${tempFactoryAddress} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  // Set the runtime bytecode at the mainnet address
  logger.debug(indent('Setting Factory bytecode at mainnet address'));
  execSync(
    `cast rpc anvil_setCode ${MAINNET_UNISWAP_FACTORY} ${factoryRuntimeBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.info(indent(`Factory deployed at mainnet address: ${MAINNET_UNISWAP_FACTORY}`));

  // Get Router bytecode from npm package and construct with MAINNET factory address
  logger.debug('Deploying UniswapV2Router02 at mainnet address');
  logger.trace(indent('Reading UniswapV2Router02 bytecode from npm package'));
  const routerJsonPath = 'node_modules/@uniswap/v2-periphery/build/UniswapV2Router02.json';
  const routerJson = JSON.parse(fs.readFileSync(routerJsonPath, 'utf8'));
  const routerCreationCode = routerJson.bytecode;

  // Encode router constructor parameters with MAINNET factory address
  const routerConstructorArgs = execSync(
    `cast abi-encode "constructor(address,address)" ${MAINNET_UNISWAP_FACTORY} ${tokens.WETH}`,
    { encoding: 'utf8' }
  ).trim();

  // Combine creation code with constructor args
  const routerBytecode = routerCreationCode + routerConstructorArgs.slice(2); // Remove 0x prefix from args

  logger.trace(indent(`Deploying Router to temporary address with mainnet factory: ${MAINNET_UNISWAP_FACTORY}`));
  const routerDeployOutput = execSync(
    `cast send --rpc-url ${config.rpcUrl} --private-key ${config.deployerPrivateKey} --create ${routerBytecode} --json`,
    { encoding: 'utf8' }
  );
  const tempRouterAddress = JSON.parse(routerDeployOutput).contractAddress;
  logger.trace(indent(`Deployed Router temporarily at: ${tempRouterAddress}`));

  // Get the runtime bytecode from the deployed contract
  logger.trace(indent('Fetching runtime bytecode'));
  const routerRuntimeBytecode = execSync(
    `cast code ${tempRouterAddress} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  // Set the runtime bytecode at the mainnet address
  logger.debug(indent('Setting Router bytecode at mainnet address'));
  execSync(
    `cast rpc anvil_setCode ${MAINNET_UNISWAP_ROUTER} ${routerRuntimeBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.info(indent(`Router deployed at mainnet address: ${MAINNET_UNISWAP_ROUTER}`));

  // Now create pairs using the mainnet factory
  logger.debug('Creating pairs on mainnet factory');

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
    logger.trace(indent(`Creating ${pair.name} pair`));

    // Create the pair
    execSync(
      `cast send ${MAINNET_UNISWAP_FACTORY} "createPair(address,address)" ${pair.token0} ${pair.token1} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
      { stdio: 'inherit' }
    );

    // Get the pair address by calling getPair
    const pairAddress = execSync(
      `cast call ${MAINNET_UNISWAP_FACTORY} "getPair(address,address)(address)" ${pair.token0} ${pair.token1} --rpc-url ${config.rpcUrl}`,
      { encoding: 'utf8' }
    ).trim();

    pairAddresses[pair.name] = pairAddress;
    logger.debug(indent(`${pair.name} pair created at: ${pairAddress}`, 2));
  }

  const factory = MAINNET_UNISWAP_FACTORY;
  const router = MAINNET_UNISWAP_ROUTER;

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

  logger.info('Uniswap V2 deployed successfully');
  logger.info('Deployed Uniswap addresses:');
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

  return addresses;
}

// If run directly
if (require.main === module) {
  // This script requires token addresses, so it should be run via the main deploy script
  logger.error('This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
