/**
 * Deploy Multicall3 Contract
 * Required by watch-tower for batch calling handlers
 */

import { execSync } from 'child_process';
import { DeploymentConfig } from './types';
import { printSection, printDeployment } from './utils';

export async function deployMulticall3(config: DeploymentConfig): Promise<string> {
  printSection('STEP 0: Deploying Multicall3 Contract');

  const multicall3Address = '0xcA11bde05977b3631167028862bE2a173976CA11';
  const mainnetRpcUrl = process.env.MAINNET_RPC_URL || 'https://eth.llamarpc.com';

  console.log('Fetching Multicall3 bytecode from mainnet...');
  const multicall3Bytecode = execSync(
    `cast code ${multicall3Address} --rpc-url ${mainnetRpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  console.log(`  Multicall3 bytecode length: ${multicall3Bytecode.length} bytes`);

  console.log('Setting Multicall3 bytecode at local address...');
  execSync(
    `cast rpc anvil_setCode ${multicall3Address} ${multicall3Bytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  console.log('');
  console.log('✅ Multicall3 contract deployed!');
  console.log('');
  console.log('📝 Deployed Multicall3 address:');
  printDeployment('Multicall3', multicall3Address);
  console.log('');

  return multicall3Address;
}

// If run directly
if (require.main === module) {
  console.error('❌ This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
