/**
 * Deploy Auxiliary Contracts (TradeSimulator, Signatures, HooksTrampoline, CoWShed)
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { DeploymentConfig, CowProtocolAddresses, AuxiliaryAddresses } from './types';
import {
  runForgeScript,
  readBroadcastResult,
  extractAddress,
  printSection,
  printDeployment,
} from './utils';

const execAsync = promisify(exec);

export async function deployAuxiliary(
  config: DeploymentConfig,
  cowProtocol: CowProtocolAddresses
): Promise<AuxiliaryAddresses> {
  // Step 3.5: Deploy Balances Helper at mainnet address
  printSection('STEP 5.1: Deploying Balances Helper Contract');

  const mainnetBalances = '0x3e8C6De9510e7ECad902D005DE3Ab52f35cF4f1b';
  const mainnetRpcUrl = process.env.MAINNET_RPC_URL || 'https://eth.llamarpc.com';

  console.log('Fetching Balances Helper bytecode from mainnet...');
  const balancesBytecode = execSync(
    `cast code ${mainnetBalances} --rpc-url ${mainnetRpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  console.log(`  Balances Helper bytecode length: ${balancesBytecode.length} bytes`);

  console.log('Setting Balances Helper bytecode at local address...');
  execSync(
    `cast rpc anvil_setCode ${mainnetBalances} ${balancesBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  const tradeSimulator = mainnetBalances;
  console.log('');
  console.log('✅ Balances Helper contract deployed!');
  console.log('');
  console.log('📝 Deployed Balances Helper address:');
  printDeployment('Balances Helper', tradeSimulator);
  console.log('');

  // Step 3.6: Deploy Signatures Contract at mainnet address
  printSection('STEP 5.2: Deploying Signatures Contract');

  const mainnetSignatures = '0x8262d639c38470F38d2eff15926F7071c28057Af';

  console.log('Fetching Signatures bytecode from mainnet...');
  const signaturesBytecode = execSync(
    `cast code ${mainnetSignatures} --rpc-url ${mainnetRpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  console.log(`  Signatures bytecode length: ${signaturesBytecode.length} bytes`);

  console.log('Setting Signatures bytecode at local address...');
  execSync(
    `cast rpc anvil_setCode ${mainnetSignatures} ${signaturesBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  const signatures = mainnetSignatures;
  console.log('');
  console.log('✅ Signatures contract deployed!');
  console.log('');
  console.log('📝 Deployed Signatures address:');
  printDeployment('Signatures', signatures);
  console.log('');

  // Step 3.7: Deploy HooksTrampoline Contract at mainnet address
  printSection('STEP 5.3: Deploying HooksTrampoline Contract');

  const mainnetHooksTrampoline = '0x60Bf78233f48eC42eE3F101b9a05eC7878728006';
  const hooksDeployer = '0x016f34D4f2578c3e9DFfc3f2b811Ba30c0c9e7f3';

  console.log('Setting up HooksTrampoline deployer account...');
  execSync(
    `cast send ${hooksDeployer} --value 100ether --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  execSync(
    `cast rpc anvil_setNonce ${hooksDeployer} 0xe --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  console.log('Deploying HooksTrampoline at mainnet address...');
  await runForgeScript(
    'contracts/script/DeployHooksTrampoline.s.sol',
    'DeployHooksTrampoline',
    config.rpcUrl,
    config.deployerPrivateKey,
    {
      env: {
        SETTLEMENT: cowProtocol.settlement,
      },
    }
  );

  const hooksTrampolineBroadcast = readBroadcastResult('DeployHooksTrampoline');
  const tempHooksTrampoline = extractAddress(hooksTrampolineBroadcast, 'HooksTrampoline');

  const hooksTrampolineBytecode = execSync(
    `cast code ${tempHooksTrampoline} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  execSync(
    `cast rpc anvil_setCode ${mainnetHooksTrampoline} ${hooksTrampolineBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  const hooksTrampoline = mainnetHooksTrampoline;
  console.log('');
  console.log('✅ HooksTrampoline contract deployed!');
  console.log('');
  console.log('📝 Deployed HooksTrampoline address:');
  printDeployment('HooksTrampoline', hooksTrampoline);
  console.log('');

  // Step 3.8: Deploy CoWShed Factory and Implementation
  printSection('STEP 5.4: Deploying CoWShed (Factory + Implementation)');

  console.log('Building CoWShed contracts...');
  await execAsync('FOUNDRY_PROFILE=cow-shed forge build', {
    cwd: process.cwd(),
  });

  await runForgeScript(
    'contracts/script/DeployCoWShed.s.sol',
    'DeployCoWShed',
    config.rpcUrl,
    config.deployerPrivateKey
  );

  const cowShedBroadcast = readBroadcastResult('DeployCoWShed');

  // Implementation is first, Factory is second
  const cowShedImplementation = extractAddress(cowShedBroadcast, undefined, 'CREATE2', 0);
  const cowShedFactory = extractAddress(cowShedBroadcast, undefined, 'CREATE2', 1);

  console.log('');
  console.log('✅ CoWShed contracts deployed!');
  console.log('');
  console.log('📝 Deployed CoWShed addresses:');
  printDeployment('Implementation', cowShedImplementation);
  printDeployment('Factory', cowShedFactory);
  console.log('');

  const addresses: AuxiliaryAddresses = {
    tradeSimulator,
    signatures,
    hooksTrampoline,
    cowShed: {
      factory: cowShedFactory,
      implementation: cowShedImplementation,
    },
  };

  return addresses;
}

// If run directly
if (require.main === module) {
  console.error('❌ This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
