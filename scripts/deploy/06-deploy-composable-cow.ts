/**
 * Deploy ComposableCow contracts at mainnet addresses
 */

import { DeploymentConfig, ComposableCowAddresses } from './types';
import { printSection, printDeployment } from './utils';
import { execSync } from 'child_process';
import { logger, indent } from './logger';

export async function deployComposableCow(config: DeploymentConfig): Promise<ComposableCowAddresses> {
  printSection('STEP 6: Deploying ComposableCow Contracts');

  // Mainnet ComposableCow contract addresses (from networks.json)
  const mainnetComposableCoW = '0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74';
  const mainnetExtensibleFallbackHandler = '0x2f55e8b20D0B9FEFA187AA7d00B6Cbe563605bF5';
  const mainnetCurrentBlockTimestampFactory = '0x52eD56Da04309Aca4c3FECC595298d80C2f16BAc';

  // Conditional order types
  const mainnetGoodAfterTime = '0xdaf33924925e03c9cc3a10d434016d6cfad0add5';
  const mainnetPerpetualStableSwap = '0x519BA24e959E33b3B6220CA98bd353d8c2D89920';
  const mainnetStopLoss = '0x412c36e5011cd2517016d243a2dfb37f73a242e7';
  const mainnetTWAP = '0x6cF1e9cA41f7611dEf408122793c358a3d11E5a5';
  const mainnetTradeAboveThreshold = '0x812308712a6d1367f437e1c1e4af85c854e1e9f6';

  // Get mainnet RPC URL from environment
  const mainnetRpcUrl = process.env.MAINNET_RPC_URL || 'https://eth.llamarpc.com';
  logger.debug(`Using mainnet RPC: ${mainnetRpcUrl}`);

  logger.debug('Fetching ComposableCow contract bytecode from mainnet');
  logger.trace(indent('Adding delays to avoid RPC rate limits'));

  // Helper function to fetch with delay
  const fetchBytecode = (name: string, address: string): string => {
    logger.trace(indent(`Fetching ${name} bytecode`));
    const bytecode = execSync(
      `cast code ${address} --rpc-url ${mainnetRpcUrl}`,
      { encoding: 'utf8' }
    ).trim();
    logger.trace(indent(`${name} bytecode length: ${bytecode.length} chars`, 2));
    // Small delay to avoid rate limits
    execSync('sleep 1', { encoding: 'utf8' });
    return bytecode;
  };

  // Fetch bytecode for all contracts with delays
  const composableCowBytecode = fetchBytecode('ComposableCoW', mainnetComposableCoW);
  const fallbackHandlerBytecode = fetchBytecode('ExtensibleFallbackHandler', mainnetExtensibleFallbackHandler);
  const timestampFactoryBytecode = fetchBytecode('CurrentBlockTimestampFactory', mainnetCurrentBlockTimestampFactory);

  // Conditional order types
  const goodAfterTimeBytecode = fetchBytecode('GoodAfterTime', mainnetGoodAfterTime);
  const perpetualStableSwapBytecode = fetchBytecode('PerpetualStableSwap', mainnetPerpetualStableSwap);
  const stopLossBytecode = fetchBytecode('StopLoss', mainnetStopLoss);
  const twapBytecode = fetchBytecode('TWAP', mainnetTWAP);
  const tradeAboveThresholdBytecode = fetchBytecode('TradeAboveThreshold', mainnetTradeAboveThreshold);

  logger.debug('Setting ComposableCow contracts at mainnet addresses');

  // Set bytecode for all contracts
  logger.trace(indent(`Setting ComposableCoW at ${mainnetComposableCoW}`));
  execSync(
    `cast rpc anvil_setCode ${mainnetComposableCoW} ${composableCowBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.trace(indent(`Setting ExtensibleFallbackHandler at ${mainnetExtensibleFallbackHandler}`));
  execSync(
    `cast rpc anvil_setCode ${mainnetExtensibleFallbackHandler} ${fallbackHandlerBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.trace(indent(`Setting CurrentBlockTimestampFactory at ${mainnetCurrentBlockTimestampFactory}`));
  execSync(
    `cast rpc anvil_setCode ${mainnetCurrentBlockTimestampFactory} ${timestampFactoryBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.trace(indent(`Setting GoodAfterTime at ${mainnetGoodAfterTime}`));
  execSync(
    `cast rpc anvil_setCode ${mainnetGoodAfterTime} ${goodAfterTimeBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.trace(indent(`Setting PerpetualStableSwap at ${mainnetPerpetualStableSwap}`));
  execSync(
    `cast rpc anvil_setCode ${mainnetPerpetualStableSwap} ${perpetualStableSwapBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.trace(indent(`Setting StopLoss at ${mainnetStopLoss}`));
  execSync(
    `cast rpc anvil_setCode ${mainnetStopLoss} ${stopLossBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.trace(indent(`Setting TWAP at ${mainnetTWAP}`));
  execSync(
    `cast rpc anvil_setCode ${mainnetTWAP} ${twapBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.trace(indent(`Setting TradeAboveThreshold at ${mainnetTradeAboveThreshold}`));
  execSync(
    `cast rpc anvil_setCode ${mainnetTradeAboveThreshold} ${tradeAboveThresholdBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.info('ComposableCow contracts deployed at mainnet addresses successfully');

  const addresses: ComposableCowAddresses = {
    composableCoW: mainnetComposableCoW,
    extensibleFallbackHandler: mainnetExtensibleFallbackHandler,
    currentBlockTimestampFactory: mainnetCurrentBlockTimestampFactory,
    conditionalOrders: {
      goodAfterTime: mainnetGoodAfterTime,
      perpetualStableSwap: mainnetPerpetualStableSwap,
      stopLoss: mainnetStopLoss,
      twap: mainnetTWAP,
      tradeAboveThreshold: mainnetTradeAboveThreshold,
    },
  };

  logger.info('Deployed ComposableCow addresses:');
  printDeployment('ComposableCoW', addresses.composableCoW);
  printDeployment('ExtensibleFallbackHandler', addresses.extensibleFallbackHandler);
  printDeployment('CurrentBlockTimestampFactory', addresses.currentBlockTimestampFactory);
  logger.info(indent('Conditional Order Types:'));
  printDeployment('  GoodAfterTime', addresses.conditionalOrders.goodAfterTime);
  printDeployment('  PerpetualStableSwap', addresses.conditionalOrders.perpetualStableSwap);
  printDeployment('  StopLoss', addresses.conditionalOrders.stopLoss);
  printDeployment('  TWAP', addresses.conditionalOrders.twap);
  printDeployment('  TradeAboveThreshold', addresses.conditionalOrders.tradeAboveThreshold);

  return addresses;
}

// If run directly
if (require.main === module) {
  logger.error('This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
