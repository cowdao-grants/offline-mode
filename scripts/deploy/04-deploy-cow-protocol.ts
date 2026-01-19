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
import { logger, indent } from './logger';

export async function deployCowProtocol(config: DeploymentConfig): Promise<CowProtocolAddresses> {
  printSection('STEP 4: Deploying CoW Protocol (Settlement + Auth)');

  // Mainnet Balancer Vault address and deployer
  const MAINNET_BALANCER_VAULT = '0xba12222222228d8Ba445958a75a0704d566BF2C8';
  const BALANCER_DEPLOYER = '0x697A71353A4BC1eb1356763018a229c27a3fbA0C';

  logger.debug('Setting up Balancer deployer account');

  // Fund the Balancer deployer with ETH
  logger.trace(indent('Funding Balancer deployer with ETH'));
  execSync(
    `cast send ${BALANCER_DEPLOYER} --value 100ether --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Set nonce to 4 for vault deployment
  logger.trace(indent('Setting deployer nonce to 4'));
  execSync(
    `cast rpc anvil_setNonce ${BALANCER_DEPLOYER} 0x4 --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.debug('Deploying MockBalancerVault at mainnet address');

  // Deploy temporary vault to get bytecode
  logger.trace(indent('Getting MockBalancerVault bytecode'));
  await runForgeScript(
    'contracts/script/DeployBalancerVault.s.sol',
    'DeployBalancerVault',
    config.rpcUrl,
    config.deployerPrivateKey
  );

  const balancerBroadcast = readBroadcastResult('DeployBalancerVault');
  const tempVault = extractAddress(balancerBroadcast, 'MockBalancerVault', 'CREATE2');

  // Get Vault bytecode from temporary deployment
  logger.trace(indent('Copying Vault bytecode to mainnet address'));
  const vaultBytecode = execSync(
    `cast code ${tempVault} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  // Set Vault bytecode at mainnet address
  execSync(
    `cast rpc anvil_setCode ${MAINNET_BALANCER_VAULT} ${vaultBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  const balancerVault = MAINNET_BALANCER_VAULT;
  logger.info(indent(`MockBalancerVault deployed at mainnet address: ${balancerVault}`));

  // Mainnet CoW Protocol addresses
  const mainnetAuthenticator = '0x2c4c28DDBdAc9C5E7055b4C863b72eA0149D8aFE';
  const mainnetSettlement = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
  const mainnetVaultRelayer = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';

  // Get mainnet RPC URL from environment
  // Note: Use https://eth.drpc.org because llamarpc doesn't return full tx input data
  const mainnetRpcUrl = process.env.MAINNET_RPC_URL || 'https://eth.llamarpc.com';
  logger.debug(`Using mainnet RPC: ${mainnetRpcUrl}`);

  // CoW Protocol contracts were deployed on mainnet using CREATE2 via Singleton Factory
  const SINGLETON_FACTORY = '0x4e59b44847b379578588920cA78FbF26c0B4956C';
  const SALT = '0x4d61747472657373657320696e204265726c696e2100000000000000000000'; // "Mattresses in Berlin!"

  logger.debug('Deploying CoW Protocol via CREATE2 using Singleton Factory');

  // Step 1: Deploy Authenticator implementation (required by proxy constructor)
  logger.debug('Step 1: Deploying Authenticator implementation');

  // Get implementation address from EIP-1967 storage slot
  const implSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
  const implAddressRaw = execSync(
    `cast storage ${mainnetAuthenticator} ${implSlot} --rpc-url ${mainnetRpcUrl}`,
    { encoding: 'utf8' }
  ).trim();
  const mainnetAuthImpl = '0x' + implAddressRaw.slice(-40);
  logger.trace(indent(`Implementation address: ${mainnetAuthImpl}`));

  // Fetch and deploy implementation bytecode (not via CREATE2, just copy)
  logger.trace(indent('Fetching implementation bytecode from mainnet'));
  const authImplBytecode = execSync(`cast code ${mainnetAuthImpl} --rpc-url ${mainnetRpcUrl}`, {
    encoding: 'utf8',
  }).trim();

  execSync(
    `cast rpc anvil_setCode ${mainnetAuthImpl} ${authImplBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );
  logger.info(indent(`Implementation deployed at: ${mainnetAuthImpl}`));

  // Step 2: Deploy Authenticator proxy via CREATE2
  logger.debug('Step 2: Deploying Authenticator proxy via CREATE2');

  const authTxHash = '0xb84bf720364f94c749f1ec1cdf0d4c44c70411b716459aaccfd24fc677013375';
  logger.trace(indent('Fetching Authenticator deployment transaction from mainnet'));
  const authTxInput = execSync(
    `cast tx ${authTxHash} --rpc-url ${mainnetRpcUrl} input`,
    { encoding: 'utf8' }
  ).trim();

  // Deploy via Singleton Factory: send tx input directly (salt + initCode)
  logger.trace(indent('Deploying Authenticator via CREATE2'));
  execSync(
    `cast send ${SINGLETON_FACTORY} ${authTxInput.slice(2)} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl} --gas-limit 10000000`,
    { stdio: 'inherit' }
  );

  // Verify Authenticator deployment
  const authCode = execSync(
    `cast code ${mainnetAuthenticator} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  if (!authCode || authCode === '0x') {
    throw new Error('Failed to deploy Authenticator via CREATE2');
  }
  logger.info(indent(`Authenticator deployed at: ${mainnetAuthenticator}`));

  // Set implementation address in proxy's EIP-1967 storage slot
  logger.trace(indent('Setting implementation address in proxy storage'));
  const implAddressPadded = '0x' + '0'.repeat(24) + mainnetAuthImpl.slice(2);
  execSync(
    `cast rpc anvil_setStorageAt ${mainnetAuthenticator} ${implSlot} ${implAddressPadded} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );
  logger.trace(indent(`Implementation address set to: ${mainnetAuthImpl}`));

  // Step 3: Deploy Settlement via CREATE2 (which will deploy VaultRelayer in its constructor)
  logger.debug('Step 3: Deploying Settlement via CREATE2');

  const settlementTxHash = '0xf49f90aa5a268c40001d1227b76bb4dd8247f18361fcad9fffd4a7a44f1320d3';
  logger.trace(indent('Fetching Settlement deployment transaction from mainnet'));
  const settlementTxInput = execSync(
    `cast tx ${settlementTxHash} --rpc-url ${mainnetRpcUrl} input`,
    { encoding: 'utf8' }
  ).trim();

  // Deploy via Singleton Factory
  logger.trace(indent('Deploying Settlement via CREATE2'));
  logger.trace(indent('(VaultRelayer will be created in Settlement constructor)', 2));
  execSync(
    `cast send ${SINGLETON_FACTORY} ${settlementTxInput.slice(2)} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl} --gas-limit 30000000`,
    { stdio: 'inherit' }
  );

  // Verify Settlement deployment
  const settlementCode = execSync(
    `cast code ${mainnetSettlement} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  if (!settlementCode || settlementCode === '0x') {
    throw new Error('Failed to deploy Settlement via CREATE2');
  }
  logger.info(indent(`Settlement deployed at: ${mainnetSettlement}`));

  // Verify VaultRelayer deployment (created by Settlement constructor)
  const vaultRelayerCode = execSync(
    `cast code ${mainnetVaultRelayer} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  if (!vaultRelayerCode || vaultRelayerCode === '0x') {
    throw new Error('VaultRelayer was not deployed by Settlement constructor');
  }
  logger.info(indent(`VaultRelayer deployed at: ${mainnetVaultRelayer}`));

  const authenticator = mainnetAuthenticator;
  const settlement = mainnetSettlement;
  const vaultRelayer = mainnetVaultRelayer;

  logger.info(indent(`Authenticator set at: ${authenticator}`));
  logger.info(indent(`Settlement set at: ${settlement}`));
  logger.info(indent(`VaultRelayer set at: ${vaultRelayer}`));

  logger.info('CoW Protocol deployed at mainnet addresses successfully');

  // Step 4.1: Approve VaultRelayer in Balancer Vault
  printSection('STEP 4.1: Approving VaultRelayer in Balancer Vault');
  logger.debug('The Settlement contract needs to approve the VaultRelayer in the Balancer Vault');
  logger.debug(indent(`Settlement: ${settlement}`));
  logger.debug(indent(`VaultRelayer: ${vaultRelayer}`));
  logger.debug(indent(`Balancer Vault: ${balancerVault}`));

  // Impersonate Settlement contract to call setRelayerApproval
  logger.debug('Impersonating Settlement contract to approve VaultRelayer');
  execSync(
    `cast rpc anvil_impersonateAccount ${settlement} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Fund Settlement with ETH for gas
  logger.trace(indent('Funding Settlement with ETH'));
  execSync(
    `cast send ${settlement} --value 1ether --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Call setRelayerApproval(sender, relayer, approved) on Balancer Vault
  logger.debug(indent('Calling setRelayerApproval on Balancer Vault'));
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
    logger.info(indent('VaultRelayer approved in Balancer Vault'));
  } else {
    throw new Error('Failed to approve VaultRelayer in Balancer Vault');
  }

  logger.info('VaultRelayer approval configured successfully');

  // Step 3.4: Initialize Solver Authentication
  printSection('STEP 4.2: Initializing Solver Authentication');

  const ALICE_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  logger.debug('Setting up solver authentication');
  logger.debug(indent(`Solver address (Alice): ${ALICE_ADDRESS}`));

  // Read manager address directly from storage slot 0
  const managerRaw = execSync(
    `cast storage ${authenticator} 0 --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  // Convert from bytes32 to address (last 20 bytes)
  const managerAddress = '0x' + managerRaw.slice(-40);
  logger.trace(indent(`Current manager (from slot 0): ${managerAddress}`));

  // Instead of trying to call addSolver, directly set the storage slot for Alice
  // The solvers mapping is at slot 1: keccak256(abi.encode(address, 1))
  logger.debug('Adding Alice as a solver by setting storage directly');

  // Calculate storage slot for Alice in the solvers mapping (slot 1)
  const aliceSlot = execSync(
    `cast index address ${ALICE_ADDRESS} 1`,
    { encoding: 'utf8' }
  ).trim();

  logger.trace(indent(`Alice's solver slot: ${aliceSlot}`));

  // Set Alice as solver (true = 0x01)
  logger.trace(indent('Setting Alice as solver in storage'));
  execSync(
    `cast rpc anvil_setStorageAt ${authenticator} ${aliceSlot} 0x0000000000000000000000000000000000000000000000000000000000000001 --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.info('Solver authentication configured successfully');

  const addresses: CowProtocolAddresses = {
    authenticator,
    settlement,
    vaultRelayer,
    balancerVault,
  };

  logger.info('Deployed CoW Protocol addresses:');
  printDeployment('Authenticator', addresses.authenticator);
  printDeployment('Settlement', addresses.settlement);
  printDeployment('Vault Relayer', addresses.vaultRelayer);
  printDeployment('Balancer Vault', addresses.balancerVault);

  return addresses;
}

// If run directly
if (require.main === module) {
  logger.error('This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
