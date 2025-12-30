/**
 * Deploy CoW Protocol Core (Settlement, VaultRelayer, Authenticator, BalancerVault)
 */

import { DeploymentConfig, CowProtocolAddresses } from './types';
import {
  runForgeScript,
  readBroadcastResult,
  extractAddress,
  printSection,
  printDeployment,
} from './utils';
import { execSync } from 'child_process';

export async function deployCowProtocol(config: DeploymentConfig): Promise<CowProtocolAddresses> {
  printSection('STEP 4: Deploying CoW Protocol (Settlement + Auth)');

  // Mainnet Balancer Vault address and deployer
  const mainnetBalancerVault = '0xba12222222228d8Ba445958a75a0704d566BF2C8';
  const balancerDeployer = '0x697A71353A4BC1eb1356763018a229c27a3fbA0C';

  console.log('Setting up Balancer deployer account...');

  // Fund the Balancer deployer with ETH
  console.log('  Funding Balancer deployer with ETH...');
  execSync(
    `cast send ${balancerDeployer} --value 100ether --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Set nonce to 4 for vault deployment
  console.log('  Setting deployer nonce to 4...');
  execSync(
    `cast rpc anvil_setNonce ${balancerDeployer} 0x4 --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  console.log('');
  console.log('Deploying MockBalancerVault at mainnet address...');

  // Deploy temporary vault to get bytecode
  console.log('  Getting MockBalancerVault bytecode...');
  await runForgeScript(
    'contracts/script/DeployBalancerVault.s.sol',
    'DeployBalancerVault',
    config.rpcUrl,
    config.deployerPrivateKey
  );

  const balancerBroadcast = readBroadcastResult('DeployBalancerVault');
  const tempVault = extractAddress(balancerBroadcast, 'MockBalancerVault', 'CREATE2');

  // Get Vault bytecode from temporary deployment
  console.log('  Copying Vault bytecode to mainnet address...');
  const vaultBytecode = execSync(
    `cast code ${tempVault} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  // Set Vault bytecode at mainnet address
  execSync(
    `cast rpc anvil_setCode ${mainnetBalancerVault} ${vaultBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  const balancerVault = mainnetBalancerVault;
  console.log(`  ✅ MockBalancerVault deployed at mainnet address: ${balancerVault}`);
  console.log('');

  // Mainnet CoW Protocol addresses
  const mainnetAuthenticator = '0x2c4c28DDBdAc9C5E7055b4C863b72eA0149D8aFE';
  const mainnetSettlement = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
  const mainnetVaultRelayer = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';

  // Get mainnet RPC URL from environment
  const mainnetRpcUrl = process.env.MAINNET_RPC_URL || 'https://eth.llamarpc.com';
  console.log(`Using mainnet RPC: ${mainnetRpcUrl}`);
  console.log('');

  console.log('Fetching CoW Protocol contract bytecode from mainnet...');

  // Authenticator is a proxy - we need both proxy and implementation
  console.log('  Fetching Authenticator proxy bytecode...');
  const authBytecode = execSync(`cast code ${mainnetAuthenticator} --rpc-url ${mainnetRpcUrl}`, {
    encoding: 'utf8',
  }).trim();
  console.log(`    Authenticator proxy bytecode length: ${authBytecode.length} chars`);

  // Get implementation address from EIP-1967 storage slot
  const implSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
  const implAddressRaw = execSync(
    `cast storage ${mainnetAuthenticator} ${implSlot} --rpc-url ${mainnetRpcUrl}`,
    { encoding: 'utf8' }
  ).trim();
  const mainnetAuthImpl = '0x' + implAddressRaw.slice(-40);
  console.log(`  Authenticator implementation address: ${mainnetAuthImpl}`);

  console.log('  Fetching Authenticator implementation bytecode...');
  const authImplBytecode = execSync(`cast code ${mainnetAuthImpl} --rpc-url ${mainnetRpcUrl}`, {
    encoding: 'utf8',
  }).trim();
  console.log(`    Authenticator implementation bytecode length: ${authImplBytecode.length} chars`);

  console.log('  Fetching Settlement bytecode...');
  const settlementBytecode = execSync(`cast code ${mainnetSettlement} --rpc-url ${mainnetRpcUrl}`, {
    encoding: 'utf8',
  }).trim();
  console.log(`    Settlement bytecode length: ${settlementBytecode.length} chars`);

  console.log('  Fetching VaultRelayer bytecode...');
  const vaultRelayerBytecode = execSync(`cast code ${mainnetVaultRelayer} --rpc-url ${mainnetRpcUrl}`, {
    encoding: 'utf8',
  }).trim();
  console.log(`    VaultRelayer bytecode length: ${vaultRelayerBytecode.length} chars`);

  console.log('');
  console.log('Fetching storage state from mainnet...');

  // Fetch Authenticator storage (slot 0 contains manager address)
  console.log('  Fetching Authenticator storage...');
  const authStorage0 = execSync(
    `cast storage ${mainnetAuthenticator} 0 --rpc-url ${mainnetRpcUrl}`,
    { encoding: 'utf8' }
  ).trim();
  console.log(`    Slot 0: ${authStorage0}`);

  // Fetch Settlement storage (slot 1 contains initialization flag)
  console.log('  Fetching Settlement storage...');
  const settlementStorage1 = execSync(
    `cast storage ${mainnetSettlement} 1 --rpc-url ${mainnetRpcUrl}`,
    { encoding: 'utf8' }
  ).trim();
  console.log(`    Slot 1: ${settlementStorage1}`);

  console.log('');
  console.log('Setting CoW Protocol contracts at mainnet addresses...');

  // First, deploy the Authenticator implementation contract
  console.log('  Setting Authenticator implementation at', mainnetAuthImpl);
  execSync(
    `cast rpc anvil_setCode ${mainnetAuthImpl} ${authImplBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Set Authenticator proxy bytecode and storage
  console.log('  Setting Authenticator proxy at', mainnetAuthenticator);
  execSync(
    `cast rpc anvil_setCode ${mainnetAuthenticator} ${authBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );
  console.log('  Setting Authenticator proxy storage...');
  // Set slot 0 (manager address)
  execSync(
    `cast rpc anvil_setStorageAt ${mainnetAuthenticator} 0x0 ${authStorage0} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );
  // Set EIP-1967 implementation slot
  const implSlotPadded = '0x' + '0'.repeat(24) + mainnetAuthImpl.slice(2).toLowerCase();
  execSync(
    `cast rpc anvil_setStorageAt ${mainnetAuthenticator} ${implSlot} ${implSlotPadded} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Set Settlement bytecode and storage
  console.log('  Setting Settlement at', mainnetSettlement);
  execSync(
    `cast rpc anvil_setCode ${mainnetSettlement} ${settlementBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );
  console.log('  Setting Settlement storage...');
  execSync(
    `cast rpc anvil_setStorageAt ${mainnetSettlement} 0x1 ${settlementStorage1} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Set VaultRelayer bytecode (no storage needed - stateless)
  console.log('  Setting VaultRelayer at', mainnetVaultRelayer);
  execSync(
    `cast rpc anvil_setCode ${mainnetVaultRelayer} ${vaultRelayerBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  const authenticator = mainnetAuthenticator;
  const settlement = mainnetSettlement;
  const vaultRelayer = mainnetVaultRelayer;

  console.log(`  ✅ Authenticator set at: ${authenticator}`);
  console.log(`  ✅ Settlement set at: ${settlement}`);
  console.log(`  ✅ VaultRelayer set at: ${vaultRelayer}`);

  console.log('');
  console.log('✅ CoW Protocol deployed at mainnet addresses!');
  console.log('');

  // Step 3.3: Approve VaultRelayer in Balancer Vault
  printSection('STEP 4.1: Approving VaultRelayer in Balancer Vault');
  console.log('The Settlement contract needs to approve the VaultRelayer in the Balancer Vault...');
  console.log(`  Settlement: ${settlement}`);
  console.log(`  VaultRelayer: ${vaultRelayer}`);
  console.log(`  Balancer Vault: ${balancerVault}`);
  console.log('');

  // Impersonate Settlement contract to call setRelayerApproval
  console.log('Impersonating Settlement contract to approve VaultRelayer...');
  execSync(
    `cast rpc anvil_impersonateAccount ${settlement} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Fund Settlement with ETH for gas
  console.log('  Funding Settlement with ETH...');
  execSync(
    `cast send ${settlement} --value 1ether --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Call setRelayerApproval(sender, relayer, approved) on Balancer Vault
  console.log('  Calling setRelayerApproval on Balancer Vault...');
  execSync(
    `cast send ${balancerVault} "setRelayerApproval(address,address,bool)" ${settlement} ${vaultRelayer} true --from ${settlement} --unlocked --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Verify approval was set
  const approvalCheck = execSync(
    `cast call ${balancerVault} "hasApprovedRelayer(address,address)(bool)" ${settlement} ${vaultRelayer} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  if (approvalCheck === 'true') {
    console.log('  ✅ VaultRelayer approved in Balancer Vault!');
  } else {
    throw new Error('Failed to approve VaultRelayer in Balancer Vault');
  }

  console.log('');
  console.log('✅ VaultRelayer approval configured!');
  console.log('');

  // Step 3.4: Initialize Solver Authentication
  printSection('STEP 4.2: Initializing Solver Authentication');

  const ALICE_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  console.log(`Setting up solver authentication...`);
  console.log(`  Solver address (Alice): ${ALICE_ADDRESS}`);
  console.log('');

  // Read manager address directly from storage slot 0
  const managerRaw = execSync(
    `cast storage ${authenticator} 0 --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  // Convert from bytes32 to address (last 20 bytes)
  const managerAddress = '0x' + managerRaw.slice(-40);
  console.log(`  Current manager (from slot 0): ${managerAddress}`);

  // Instead of trying to call addSolver, directly set the storage slot for Alice
  // The solvers mapping is at slot 1: keccak256(abi.encode(address, 1))
  console.log('');
  console.log('Adding Alice as a solver by setting storage directly...');

  // Calculate storage slot for Alice in the solvers mapping (slot 1)
  const aliceSlot = execSync(
    `cast index address ${ALICE_ADDRESS} 1`,
    { encoding: 'utf8' }
  ).trim();

  console.log(`  Alice's solver slot: ${aliceSlot}`);

  // Set Alice as solver (true = 0x01)
  console.log('  Setting Alice as solver in storage...');
  execSync(
    `cast rpc anvil_setStorageAt ${authenticator} ${aliceSlot} 0x0000000000000000000000000000000000000000000000000000000000000001 --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  console.log('');
  console.log('✅ Solver authentication configured!');
  console.log('');

  const addresses: CowProtocolAddresses = {
    authenticator,
    settlement,
    vaultRelayer,
    balancerVault,
  };

  console.log('📝 Deployed CoW Protocol addresses:');
  printDeployment('Authenticator', addresses.authenticator);
  printDeployment('Settlement', addresses.settlement);
  printDeployment('Vault Relayer', addresses.vaultRelayer);
  printDeployment('Balancer Vault', addresses.balancerVault);
  console.log('');

  return addresses;
}

// If run directly
if (require.main === module) {
  console.error('❌ This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
