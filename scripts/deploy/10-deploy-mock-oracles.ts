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

  console.log('Deploying mock Chainlink oracles for all base tokens...');
  console.log('(forge script will compile contracts automatically)');
  console.log('');

  await runForgeScript(
    'contracts/script/DeployMockChainlinkOracles.s.sol',
    'DeployMockChainlinkOracles',
    config.rpcUrl,
    config.deployerPrivateKey
  );

  const broadcast = readBroadcastResult('DeployMockChainlinkOracles');

  // Extract oracle addresses (5 CREATE transactions in order)
  const wethUsdOracle = extractAddress(broadcast, undefined, 'CREATE', 0);
  const daiUsdOracle = extractAddress(broadcast, undefined, 'CREATE', 1);
  const usdcUsdOracle = extractAddress(broadcast, undefined, 'CREATE', 2);
  const usdtUsdOracle = extractAddress(broadcast, undefined, 'CREATE', 3);
  const gnoUsdOracle = extractAddress(broadcast, undefined, 'CREATE', 4);

  console.log('');
  console.log('✅ Mock Chainlink oracles deployed!');
  console.log('');
  console.log('📝 Deployed oracle addresses:');
  printDeployment('WETH/USD Oracle', wethUsdOracle);
  printDeployment('DAI/USD Oracle', daiUsdOracle);
  printDeployment('USDC/USD Oracle', usdcUsdOracle);
  printDeployment('USDT/USD Oracle', usdtUsdOracle);
  printDeployment('GNO/USD Oracle', gnoUsdOracle);
  console.log('');
  console.log('   Initial prices (8 decimals):');
  console.log('   - WETH/USD: $3000');
  console.log('   - DAI/USD:  $1');
  console.log('   - USDC/USD: $1');
  console.log('   - USDT/USD: $1');
  console.log('   - GNO/USD:  $100');
  console.log('');

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
  console.error('❌ This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
