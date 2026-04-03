/**
 * Deploy Mock Chainlink Oracles for StopLoss testing
 */

import { execSync } from 'child_process';
import { DeploymentConfig } from './types';
import {
  runForgeScript,
  readBroadcastResult,
  extractAddress,
  printSection,
  printDeployment,
} from './utils';
import { logger, indent } from './logger';

export interface MockOracleAddresses {
  wethUsdOracle: string;
  daiUsdOracle: string;
  usdcUsdOracle: string;
  usdtUsdOracle: string;
  gnoUsdOracle: string;
}

export async function deployMockOracles(
  config: DeploymentConfig
): Promise<MockOracleAddresses> {
  printSection('STEP 10: Deploying Mock Chainlink Oracles');

  logger.debug('Deploying mock Chainlink oracles for all base tokens');
  logger.trace(indent('Forge script will compile contracts automatically'));

  await runForgeScript(
    'contracts/script/DeployMockChainlinkOracles.s.sol',
    'DeployMockChainlinkOracles',
    config.rpcUrl,
    config.deployerPrivateKey
  );

  const broadcast = readBroadcastResult('DeployMockChainlinkOracles');

  // Extract oracle addresses (5 CREATE2 transactions in order)
  // These addresses are deterministic thanks to CREATE2 with fixed salts
  const wethUsdOracle = extractAddress(broadcast, undefined, 'CREATE2', 0);
  const daiUsdOracle = extractAddress(broadcast, undefined, 'CREATE2', 1);
  const usdcUsdOracle = extractAddress(broadcast, undefined, 'CREATE2', 2);
  const usdtUsdOracle = extractAddress(broadcast, undefined, 'CREATE2', 3);
  const gnoUsdOracle = extractAddress(broadcast, undefined, 'CREATE2', 4);

  logger.info('Mock Chainlink oracles deployed successfully');
  logger.info('Deployed oracle addresses:');
  printDeployment('WETH/USD Oracle', wethUsdOracle);
  printDeployment('DAI/USD Oracle', daiUsdOracle);
  printDeployment('USDC/USD Oracle', usdcUsdOracle);
  printDeployment('USDT/USD Oracle', usdtUsdOracle);
  printDeployment('GNO/USD Oracle', gnoUsdOracle);
  logger.info(indent('Initial prices (8 decimals):'));
  logger.info(indent('- WETH/USD: $3000', 2));
  logger.info(indent('- DAI/USD:  $1', 2));
  logger.info(indent('- USDC/USD: $1', 2));
  logger.info(indent('- USDT/USD: $1', 2));
  logger.info(indent('- GNO/USD:  $100', 2));

  return {
    wethUsdOracle,
    daiUsdOracle,
    usdcUsdOracle,
    usdtUsdOracle,
    gnoUsdOracle,
  };
}

// If run directly
if (require.main === module) {
  logger.error('This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
