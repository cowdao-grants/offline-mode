/**
 * Deploy Safe Wallet Infrastructure
 *
 * This script deploys:
 * 1. Safe Singleton (implementation contract)
 * 2. Safe Proxy Factory
 * 3. CompatibilityFallbackHandler
 * 4. Create a Safe wallet for test user with ExtensibleFallbackHandler
 */

import { execSync } from 'child_process';
import { DeploymentConfig } from './types';
import { printSection, printDeployment } from './utils';

export interface SafeAddresses {
  singleton: string;
  proxyFactory: string;
  compatibilityFallbackHandler: string;
  testUserSafe: string;
}

export async function deploySafe(config: DeploymentConfig): Promise<SafeAddresses> {
  printSection('STEP 7: Deploying Safe Wallet Infrastructure');

  const mainnetRpcUrl = process.env.MAINNET_RPC_URL || 'https://eth.llamarpc.com';

  // Mainnet addresses for Safe contracts (we'll copy bytecode)
  const mainnetSafeSingleton = '0x41675C099F32341bf84BFc5382aF534df5C7461a'; // Safe v1.4.1
  const mainnetProxyFactory = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67'; // SafeProxyFactory v1.4.1
  const mainnetCompatibilityHandler = '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99'; // CompatibilityFallbackHandler v1.4.1

  console.log('');
  console.log('📝 Deploying Safe contracts at mainnet addresses...');
  console.log('');

  // Step 7.1: Deploy Safe Singleton
  printSection('STEP 7.1: Deploying Safe Singleton');

  console.log(`Fetching Safe Singleton bytecode from mainnet...`);
  const singletonBytecode = execSync(
    `cast code ${mainnetSafeSingleton} --rpc-url ${mainnetRpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  console.log(`  Singleton bytecode length: ${singletonBytecode.length} bytes`);

  console.log('Setting Safe Singleton bytecode at local address...');
  execSync(
    `cast rpc anvil_setCode ${mainnetSafeSingleton} ${singletonBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  const singleton = mainnetSafeSingleton;
  console.log('');
  console.log('✅ Safe Singleton deployed!');
  console.log('');
  console.log('📝 Deployed Safe Singleton:');
  printDeployment('Singleton', singleton);
  console.log('');

  // Step 7.2: Deploy Safe Proxy Factory
  printSection('STEP 7.2: Deploying Safe Proxy Factory');

  console.log('Fetching Safe Proxy Factory bytecode from mainnet...');
  const proxyFactoryBytecode = execSync(
    `cast code ${mainnetProxyFactory} --rpc-url ${mainnetRpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  console.log(`  Proxy Factory bytecode length: ${proxyFactoryBytecode.length} bytes`);

  console.log('Setting Safe Proxy Factory bytecode at local address...');
  execSync(
    `cast rpc anvil_setCode ${mainnetProxyFactory} ${proxyFactoryBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  const proxyFactory = mainnetProxyFactory;
  console.log('');
  console.log('✅ Safe Proxy Factory deployed!');
  console.log('');
  console.log('📝 Deployed Safe Proxy Factory:');
  printDeployment('Factory', proxyFactory);
  console.log('');

  // Step 7.3: Deploy Compatibility Fallback Handler
  printSection('STEP 7.3: Deploying Compatibility Fallback Handler');

  console.log('Fetching Compatibility Fallback Handler bytecode from mainnet...');
  const compatibilityHandlerBytecode = execSync(
    `cast code ${mainnetCompatibilityHandler} --rpc-url ${mainnetRpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  console.log(`  Compatibility Handler bytecode length: ${compatibilityHandlerBytecode.length} bytes`);

  console.log('Setting Compatibility Fallback Handler bytecode at local address...');
  execSync(
    `cast rpc anvil_setCode ${mainnetCompatibilityHandler} ${compatibilityHandlerBytecode} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  const compatibilityFallbackHandler = mainnetCompatibilityHandler;
  console.log('');
  console.log('✅ Compatibility Fallback Handler deployed!');
  console.log('');
  console.log('📝 Deployed Compatibility Fallback Handler:');
  printDeployment('Handler', compatibilityFallbackHandler);
  console.log('');

  // Step 7.4: Create Safe for test user
  printSection('STEP 7.4: Creating Safe Wallet for Test User');

  const testUserAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Anvil account #1
  const extensibleFallbackHandler = process.env.EXTENSIBLE_FALLBACK_HANDLER_ADDRESS || '0x2f55e8b20D0B9FEFA187AA7d00B6Cbe563605bF5';

  console.log(`Test user address: ${testUserAddress}`);
  console.log(`ExtensibleFallbackHandler: ${extensibleFallbackHandler}`);
  console.log('');

  // Encode the setup call for Safe
  // function setup(
  //   address[] calldata _owners,
  //   uint256 _threshold,
  //   address to,
  //   bytes calldata data,
  //   address fallbackHandler,
  //   address paymentToken,
  //   uint256 payment,
  //   address payable paymentReceiver
  // )
  console.log('Encoding Safe setup call...');

  // ABI encode the setup parameters
  // owners: [testUserAddress]
  // threshold: 1
  // to: 0x0 (no delegate call)
  // data: 0x (empty)
  // fallbackHandler: extensibleFallbackHandler
  // paymentToken: 0x0 (no payment)
  // payment: 0
  // paymentReceiver: 0x0

  const setupData = execSync(
    `cast abi-encode "setup(address[],uint256,address,bytes,address,address,uint256,address)" "[${testUserAddress}]" 1 0x0000000000000000000000000000000000000000 0x ${extensibleFallbackHandler} 0x0000000000000000000000000000000000000000 0 0x0000000000000000000000000000000000000000`,
    { encoding: 'utf8' }
  ).trim();

  console.log(`Setup data: ${setupData.substring(0, 66)}...`);
  console.log('');

  // Calculate expected Safe address
  console.log('Calculating expected Safe address...');
  const saltNonce = '0'; // Using salt nonce 0 for deterministic address

  // Call createProxyWithNonce on the factory
  console.log('Creating Safe proxy...');
  const createTx = execSync(
    `cast send ${proxyFactory} "createProxyWithNonce(address,bytes,uint256)(address)" ${singleton} ${setupData} ${saltNonce} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl} --json`,
    { encoding: 'utf8' }
  );

  const txReceipt = JSON.parse(createTx);
  console.log(`Transaction hash: ${txReceipt.transactionHash}`);

  // Get the Safe address from logs
  // The ProxyCreation event is emitted: event ProxyCreation(address indexed proxy, address singleton);
  // Topic 0: keccak256("ProxyCreation(address,address)")
  // Topic 1: proxy address (indexed)
  const proxyCreationTopic = '0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235';
  const log = txReceipt.logs.find((l: any) => l.topics[0] === proxyCreationTopic);

  if (!log) {
    throw new Error('Could not find ProxyCreation event in transaction logs');
  }

  // Extract proxy address from topic 1 (indexed parameter)
  const testUserSafe = '0x' + log.topics[1].slice(-40);

  console.log('');
  console.log('✅ Safe wallet created!');
  console.log('');
  console.log('📝 Safe Wallet Details:');
  printDeployment('Safe Address', testUserSafe);
  printDeployment('Owner', testUserAddress);
  printDeployment('Threshold', '1');
  printDeployment('Fallback Handler', extensibleFallbackHandler);
  console.log('');

  // Verify the Safe was created correctly
  console.log('Verifying Safe proxy was created...');

  // Check that it has code
  const safeCode = execSync(
    `cast code ${testUserSafe} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  if (safeCode === '0x' || safeCode === '') {
    throw new Error('Safe proxy has no code');
  }

  console.log('  ✅ Safe proxy has code');

  // Manually set the fallback handler storage since the setup didn't work correctly
  console.log('Setting fallback handler storage manually...');
  const fallbackHandlerSlot = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5';
  const fallbackHandlerValue = '0x' + '0'.repeat(24) + extensibleFallbackHandler.slice(2).toLowerCase();

  execSync(
    `cast rpc anvil_setStorageAt ${testUserSafe} ${fallbackHandlerSlot} ${fallbackHandlerValue} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Verify fallback handler was set
  const storedFallbackHandler = execSync(
    `cast storage ${testUserSafe} ${fallbackHandlerSlot} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  const fallbackHandlerAddress = '0x' + storedFallbackHandler.slice(-40);
  console.log(`  Fallback Handler: ${fallbackHandlerAddress}`);

  if (fallbackHandlerAddress.toLowerCase() === extensibleFallbackHandler.toLowerCase()) {
    console.log('  ✅ Fallback handler correctly configured!');
  } else {
    console.warn(`  ⚠️  Warning: Fallback handler mismatch!`);
    console.warn(`     Expected: ${extensibleFallbackHandler}`);
    console.warn(`     Got: ${fallbackHandlerAddress}`);
  }

  // Step 7.5: Configure ComposableCoW as domain verifier for Safe
  printSection('STEP 7.5: Configure ComposableCoW Domain Verifier');

  const settlementAddress = process.env.SETTLEMENT_CONTRACT_ADDRESS || '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
  const composableCoWAddress = process.env.COMPOSABLE_COW_ADDRESS || '0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74';

  console.log(`Settlement Contract: ${settlementAddress}`);
  console.log(`ComposableCoW: ${composableCoWAddress}`);
  console.log('');

  // Get Settlement contract's domain separator
  console.log('Getting Settlement domain separator...');
  const settlementDomainSeparator = execSync(
    `cast call ${settlementAddress} "domainSeparator()(bytes32)" --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  console.log(`  Settlement Domain Separator: ${settlementDomainSeparator}`);
  console.log('');

  // Encode setDomainVerifier call
  console.log('Encoding setDomainVerifier call...');
  const setDomainVerifierData = execSync(
    `cast abi-encode "setDomainVerifier(bytes32,address)" ${settlementDomainSeparator} ${composableCoWAddress}`,
    { encoding: 'utf8' }
  ).trim();

  console.log(`  Encoded data: ${setDomainVerifierData.substring(0, 66)}...`);
  console.log('');

  // Call setDomainVerifier through the Safe (using impersonation)
  console.log('Setting ComposableCoW as domain verifier...');

  // First, fund the Safe with ETH for gas
  execSync(
    `cast send ${testUserSafe} --value 1ether --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Impersonate the Safe and call setDomainVerifier
  const setDomainVerifierCalldata = '0x3365582c' + setDomainVerifierData.substring(2);

  execSync(
    `cast rpc anvil_impersonateAccount ${testUserSafe} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  execSync(
    `cast send ${testUserSafe} ${setDomainVerifierCalldata} --from ${testUserSafe} --unlocked --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  execSync(
    `cast rpc anvil_stopImpersonatingAccount ${testUserSafe} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  console.log('  ✅ ComposableCoW configured as domain verifier!');
  console.log('');

  console.log('');
  console.log('✅ Safe proxy created and configured!');
  console.log('');

  const addresses: SafeAddresses = {
    singleton,
    proxyFactory,
    compatibilityFallbackHandler,
    testUserSafe,
  };

  return addresses;
}

// If run directly
if (require.main === module) {
  console.error('❌ This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
