/**
 * Deploy Tokens (WETH, USDC, DAI, USDT, GNO)
 */

import { DeploymentConfig, TokenAddresses } from './types';
import {
  runForgeScript,
  readBroadcastResult,
  extractAddress,
  printSection,
  printDeployment,
} from './utils';
import { loadBalancesConfig } from './balances-config';
import { execSync } from 'child_process';

export async function deployTokens(config: DeploymentConfig): Promise<TokenAddresses> {
  printSection('STEP 2: Deploying Tokens (WETH, USDC, DAI, USDT, GNO) at mainnet addresses');

  // Mainnet token addresses
  const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
  const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
  const GNO = '0x6810e776880C02933D47DB1b9fc05908e5386b96';

  // Deploy WETH using TestERC20 bytecode (so we can mint unlimited amounts)
  console.log('Deploying WETH using TestERC20 bytecode...');
  // We'll set the bytecode after deploying TestERC20 tokens below

  // Run the forge script to deploy TestERC20 tokens
  console.log('');
  console.log('Deploying TestERC20 tokens temporarily to get bytecode...');
  await runForgeScript(
    'contracts/script/DeployTokens.s.sol',
    'DeployTokens',
    config.rpcUrl,
    config.deployerPrivateKey
  );

  // Read broadcast result to get TestERC20 bytecode
  const broadcast = readBroadcastResult('DeployTokens');
  const testERC20Transactions = broadcast.transactions.filter(
    tx => tx.contractName === 'TestERC20' && tx.transactionType === 'CREATE2'
  );

  // Get the bytecode from the first deployed TestERC20
  console.log('');
  console.log('Fetching TestERC20 bytecode from temporary deployment...');
  const tempUsdcAddress = testERC20Transactions[0].contractAddress;
  const testERC20Bytecode = execSync(
    `cast code ${tempUsdcAddress} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  // Now deploy the TestERC20 bytecode at mainnet addresses using anvil_setCode
  console.log('');
  console.log('Deploying tokens at mainnet addresses...');

  console.log('  Setting WETH bytecode at', WETH);
  execSync(`cast rpc anvil_setCode ${WETH} ${testERC20Bytecode} --rpc-url ${config.rpcUrl}`, { stdio: 'inherit' });

  console.log('  Setting USDC bytecode at', USDC);
  execSync(`cast rpc anvil_setCode ${USDC} ${testERC20Bytecode} --rpc-url ${config.rpcUrl}`, { stdio: 'inherit' });

  console.log('  Setting DAI bytecode at', DAI);
  execSync(`cast rpc anvil_setCode ${DAI} ${testERC20Bytecode} --rpc-url ${config.rpcUrl}`, { stdio: 'inherit' });

  console.log('  Setting USDT bytecode at', USDT);
  execSync(`cast rpc anvil_setCode ${USDT} ${testERC20Bytecode} --rpc-url ${config.rpcUrl}`, { stdio: 'inherit' });

  console.log('  Setting GNO bytecode at', GNO);
  execSync(`cast rpc anvil_setCode ${GNO} ${testERC20Bytecode} --rpc-url ${config.rpcUrl}`, { stdio: 'inherit' });

  // Get deployer address
  const deployerAddress = execSync(
    `cast wallet address --private-key ${config.deployerPrivateKey}`,
    { encoding: 'utf8' }
  ).trim();

  // Mint tokens to deployer
  console.log('');
  console.log('Minting tokens to deployer...');

  // Load token supply constants from config
  const balancesConfig = loadBalancesConfig();
  const WETH_SUPPLY = balancesConfig.tokens.WETH.initialSupply;
  const USDC_SUPPLY = balancesConfig.tokens.USDC.initialSupply;
  const DAI_SUPPLY = balancesConfig.tokens.DAI.initialSupply;
  const USDT_SUPPLY = balancesConfig.tokens.USDT.initialSupply;
  const GNO_SUPPLY = balancesConfig.tokens.GNO.initialSupply;

  // Mint WETH (treat as ERC20 instead of wrapping ETH)
  console.log('  Minting WETH...');
  execSync(
    `cast send ${WETH} "mint(address,uint256)" ${deployerAddress} ${WETH_SUPPLY} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Mint USDC
  console.log('  Minting USDC...');
  execSync(
    `cast send ${USDC} "mint(address,uint256)" ${deployerAddress} ${USDC_SUPPLY} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Mint DAI
  console.log('  Minting DAI...');
  execSync(
    `cast send ${DAI} "mint(address,uint256)" ${deployerAddress} ${DAI_SUPPLY} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Mint USDT
  console.log('  Minting USDT...');
  execSync(
    `cast send ${USDT} "mint(address,uint256)" ${deployerAddress} ${USDT_SUPPLY} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Mint GNO
  console.log('  Minting GNO...');
  execSync(
    `cast send ${GNO} "mint(address,uint256)" ${deployerAddress} ${GNO_SUPPLY} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  const addresses: TokenAddresses = {
    WETH,
    USDC,
    DAI,
    USDT,
    GNO,
  };

  console.log('');
  console.log('✅ All tokens deployed at mainnet addresses with initial supply!');
  console.log('');
  console.log('📝 Deployed token addresses:');
  printDeployment('WETH', addresses.WETH);
  printDeployment('USDC', addresses.USDC);
  printDeployment('DAI', addresses.DAI);
  printDeployment('USDT', addresses.USDT);
  printDeployment('GNO', addresses.GNO);
  console.log('');

  return addresses;
}

// If run directly
if (require.main === module) {
  const config: DeploymentConfig = {
    rpcUrl: process.env.RPC_URL || 'http://localhost:8545',
    deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    chainId: 1, // Mainnet chain ID for address compatibility
  };

  deployTokens(config)
    .then(() => {
      console.log('✅ Token deployment complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Token deployment failed:', error);
      process.exit(1);
    });
}
