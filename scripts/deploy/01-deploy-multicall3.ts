/**
 * Deploy Multicall3 Contract
 * Required by watch-tower for batch calling handlers
 */

import { execSync } from 'child_process';
import { DeploymentConfig } from './types';
import { printSection, printDeployment } from './utils';
import { logger, indent } from './logger';

export async function deployMulticall3(config: DeploymentConfig): Promise<string> {
  printSection('STEP 1: Deploying Multicall3 Contract');

  const multicall3Address = '0xcA11bde05977b3631167028862bE2a173976CA11';
  const mainnetRpcUrl = process.env.MAINNET_RPC_URL || 'https://eth.llamarpc.com';

  logger.debug('Fetching Multicall3 bytecode from mainnet');
  const multicall3Bytecode = execSync(
    `cast code ${multicall3Address} --rpc-url ${mainnetRpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  logger.trace(indent(`Multicall3 bytecode length: ${multicall3Bytecode.length} bytes`));

  logger.debug('Setting Multicall3 bytecode at local address');
  execSync(
    `cast rpc anvil_setCode ${multicall3Address} ${multicall3Bytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.info('Multicall3 contract deployed successfully');
  logger.info('Deployed Multicall3 address:');
  printDeployment('Multicall3', multicall3Address);

  return multicall3Address;
}

// If run directly
if (require.main === module) {
  logger.error('This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
