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
import { loadBalancesConfig, calculateTotalRequiredSupply } from './balances-config';
import { execSync } from 'child_process';
import { logger, indent } from './logger';

export async function deployTokens(config: DeploymentConfig): Promise<TokenAddresses> {
  printSection('STEP 2: Deploying Tokens (WETH, USDC, DAI, USDT, GNO) at mainnet addresses');

  // Mainnet token addresses
  const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
  const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
  const GNO = '0x6810e776880C02933D47DB1b9fc05908e5386b96';

  // Deploy WETH9 (real WETH with wrap/unwrap functionality)
  // Use the actual mainnet WETH9 runtime bytecode directly (no compilation needed)
  logger.debug('Deploying WETH9 contract using mainnet runtime bytecode');

  // This is the actual runtime bytecode fetched from mainnet WETH contract at 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
  const weth9Bytecode = '0x6060604052600436106100af576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff16806306fdde03146100b9578063095ea7b31461014757806318160ddd146101a157806323b872dd146101ca5780632e1a7d4d14610243578063313ce5671461026657806370a082311461029557806395d89b41146102e2578063a9059cbb14610370578063d0e30db0146103ca578063dd62ed3e146103d4575b6100b7610440565b005b34156100c457600080fd5b6100cc6104dd565b6040518080602001828103825283818151815260200191508051906020019080838360005b8381101561010c5780820151818401526020810190506100f1565b50505050905090810190601f1680156101395780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b341561015257600080fd5b610187600480803573ffffffffffffffffffffffffffffffffffffffff1690602001909190803590602001909190505061057b565b604051808215151515815260200191505060405180910390f35b34156101ac57600080fd5b6101b461066d565b6040518082815260200191505060405180910390f35b34156101d557600080fd5b610229600480803573ffffffffffffffffffffffffffffffffffffffff1690602001909190803573ffffffffffffffffffffffffffffffffffffffff1690602001909190803590602001909190505061068c565b604051808215151515815260200191505060405180910390f35b341561024e57600080fd5b61026460048080359060200190919050506109d9565b005b341561027157600080fd5b610279610b05565b604051808260ff1660ff16815260200191505060405180910390f35b34156102a057600080fd5b6102cc600480803573ffffffffffffffffffffffffffffffffffffffff16906020019091905050610b18565b6040518082815260200191505060405180910390f35b34156102ed57600080fd5b6102f5610b30565b6040518080602001828103825283818151815260200191508051906020019080838360005b8381101561033557808201518184015260208101905061031a565b50505050905090810190601f1680156103625780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b341561037b57600080fd5b6103b0600480803573ffffffffffffffffffffffffffffffffffffffff16906020019091908035906020019091905050610bce565b604051808215151515815260200191505060405180910390f35b6103d2610440565b005b34156103df57600080fd5b61042a600480803573ffffffffffffffffffffffffffffffffffffffff1690602001909190803573ffffffffffffffffffffffffffffffffffffffff16906020019091905050610be3565b6040518082815260200191505060405180910390f35b34600360003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825401925050819055503373ffffffffffffffffffffffffffffffffffffffff167fe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c346040518082815260200191505060405180910390a2565b60008054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156105735780601f1061054857610100808354040283529160200191610573565b820191906000526020600020905b81548152906001019060200180831161055657829003601f168201915b505050505081565b600081600460003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925846040518082815260200191505060405180910390a36001905092915050565b60003073ffffffffffffffffffffffffffffffffffffffff1631905090565b600081600360008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054101515156106dc57600080fd5b3373ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff16141580156107b457507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff600460008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000205414155b156108cf5781600460008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020541015151561084457600080fd5b81600460008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055505b81600360008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828254039250508190555081600360008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825401925050819055508273ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040518082815260200191505060405180910390a3600190509392505050565b80600360003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000205410151515610a2757600080fd5b80600360003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055503373ffffffffffffffffffffffffffffffffffffffff166108fc829081150290604051600060405180830381858888f193505050501515610ab457600080fd5b3373ffffffffffffffffffffffffffffffffffffffff167f7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65826040518082815260200191505060405180910390a250565b600260009054906101000a900460ff1681565b60036020528060005260406000206000915090505481565b60018054600181600116156101000203166002900480601f016020809104026020016040519081016040528092919081815260200182805460018160011615610100020316600290048015610bc65780601f10610b9b57610100808354040283529160200191610bc6565b820191906000526020600020905b815481529060010190602001808311610ba957829003601f168201915b505050505081565b6000610bdb33848461068c565b905092915050565b60046020528160005260406000206020528060005260406000206000915091505054815600a165627a7a72305820deb4c2ccab3c2fdca32ab3f46728389c2fe2c165d5fafa07661e4e004f6c344a0029';

  // Set WETH9 bytecode at mainnet WETH address
  logger.debug(indent(`Setting WETH9 bytecode at ${WETH}`));

  // Check bytecode BEFORE setting
  logger.trace(indent(`Checking bytecode BEFORE anvil_setCode...`, 2));
  const bytecodeBefore = execSync(`cast code ${WETH} --rpc-url ${config.rpcUrl}`, { encoding: 'utf8' }).trim();
  logger.trace(indent(`Bytecode before: ${bytecodeBefore.substring(0, 66)}... (length: ${bytecodeBefore.length})`, 2));

  // Set the WETH9 bytecode
  execSync(`cast rpc anvil_setCode ${WETH} ${weth9Bytecode} --rpc-url ${config.rpcUrl}`, { stdio: 'inherit' });

  // Initialize WETH9 storage (name, symbol, decimals)
  // These values are stored in the contract's storage slots and need to be set manually
  // since we're setting bytecode without running the constructor
  logger.trace(indent(`Initializing WETH9 storage (name, symbol, decimals)...`, 2));

  // Slot 0: name = "Wrapped Ether" (length 13 = 0x0d at end, doubled = 0x1a for storage)
  // String storage format: data padded, with length*2 at the end for strings < 32 bytes
  execSync(
    `cast rpc anvil_setStorageAt ${WETH} 0x0 0x577261707065642045746865720000000000000000000000000000000000001a --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Slot 1: symbol = "WETH" (length 4 = 0x04 at end, doubled = 0x08 for storage)
  execSync(
    `cast rpc anvil_setStorageAt ${WETH} 0x1 0x5745544800000000000000000000000000000000000000000000000000000008 --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Slot 2: decimals = 18 (0x12)
  execSync(
    `cast rpc anvil_setStorageAt ${WETH} 0x2 0x0000000000000000000000000000000000000000000000000000000000000012 --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  logger.trace(indent(`WETH9 storage initialized`, 2));

  // Check bytecode AFTER setting
  logger.trace(indent(`Checking bytecode AFTER anvil_setCode...`, 2));
  const bytecodeAfter = execSync(`cast code ${WETH} --rpc-url ${config.rpcUrl}`, { encoding: 'utf8' }).trim();
  logger.trace(indent(`Bytecode after: ${bytecodeAfter.substring(0, 66)}... (length: ${bytecodeAfter.length})`, 2));

  // Verify the bytecode matches what we set
  if (bytecodeAfter === weth9Bytecode) {
    logger.info(indent(`✅ WETH9 bytecode successfully set and verified`, 2));
  } else {
    logger.error(indent(`❌ WETH9 bytecode verification FAILED!`, 2));
    logger.error(indent(`Expected length: ${weth9Bytecode.length}, Got: ${bytecodeAfter.length}`, 2));
  }

  logger.trace(indent(`WETH9 deployed at ${WETH}`));

  // Run the forge script to deploy TestERC20 tokens for other tokens
  logger.debug('Deploying TestERC20 tokens for USDC, DAI, USDT, GNO');
  await runForgeScript(
    'contracts/script/DeployTokens.s.sol',
    'DeployTokens',
    config.rpcUrl,
    config.deployerPrivateKey
  );

  // Read broadcast result to get TestERC20 and TestERC20WithPermit bytecode
  const broadcast = readBroadcastResult('DeployTokens');
  const testERC20Transactions = broadcast.transactions.filter(
    tx => (tx.contractName === 'TestERC20' || tx.contractName === 'TestERC20WithPermit') && tx.transactionType === 'CREATE2'
  );

  // Get the bytecode from the first deployed TestERC20
  logger.trace('Fetching TestERC20 bytecode from temporary deployment');
  const tempUsdcAddress = testERC20Transactions[0].contractAddress;
  const testERC20Bytecode = execSync(
    `cast code ${tempUsdcAddress} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  // Get TestERC20WithPermit bytecode from deployed contracts
  // The Forge script deploys DAI and USDC with permit support
  logger.debug('Using TestERC20WithPermit bytecode from deployment');

  // testERC20Transactions now contains both TestERC20WithPermit contracts
  // USDC is at index 0, DAI is at index 1
  logger.trace(`Fetching USDC bytecode from temporary deployment at ${testERC20Transactions[0]?.contractAddress}`);
  const usdcBytecode = execSync(
    `cast code ${testERC20Transactions[0]?.contractAddress} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  logger.trace(`Fetching DAI bytecode from temporary deployment at ${testERC20Transactions[1]?.contractAddress}`);
  const daiBytecode = execSync(
    `cast code ${testERC20Transactions[1]?.contractAddress} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  // Now deploy tokens at mainnet addresses
  logger.debug('Deploying tokens with permit support at mainnet addresses');

  logger.debug(indent(`Setting USDC bytecode at ${USDC}`));
  execSync(`cast rpc anvil_setCode ${USDC} ${usdcBytecode} --rpc-url ${config.rpcUrl}`, { stdio: 'inherit' });

  // Copy storage slots for USDC (name, symbol, decimals from temporary deployment)
  logger.debug(indent(`Copying USDC storage from temporary deployment`));
  for (let slot = 0; slot < 6; slot++) {
    const slotHex = `0x${slot.toString(16).padStart(64, '0')}`;
    const storageValue = execSync(
      `cast storage ${tempUsdcAddress} ${slotHex} --rpc-url ${config.rpcUrl}`,
      { encoding: 'utf8' }
    ).trim();
    execSync(
      `cast rpc anvil_setStorageAt ${USDC} ${slotHex} ${storageValue} --rpc-url ${config.rpcUrl}`,
      { stdio: 'inherit' }
    );
  }

  logger.debug(indent(`Setting DAI bytecode at ${DAI}`));
  execSync(`cast rpc anvil_setCode ${DAI} ${daiBytecode} --rpc-url ${config.rpcUrl}`, { stdio: 'inherit' });

  // Copy storage slots for DAI (name, symbol, decimals from temporary deployment)
  logger.debug(indent(`Copying DAI storage from temporary deployment`));
  const tempDaiAddress = testERC20Transactions[1].contractAddress;
  for (let slot = 0; slot < 6; slot++) {
    const slotHex = `0x${slot.toString(16).padStart(64, '0')}`;
    const storageValue = execSync(
      `cast storage ${tempDaiAddress} ${slotHex} --rpc-url ${config.rpcUrl}`,
      { encoding: 'utf8' }
    ).trim();
    execSync(
      `cast rpc anvil_setStorageAt ${DAI} ${slotHex} ${storageValue} --rpc-url ${config.rpcUrl}`,
      { stdio: 'inherit' }
    );
  }

  logger.debug(indent(`Setting USDT bytecode at ${USDT}`));
  execSync(`cast rpc anvil_setCode ${USDT} ${testERC20Bytecode} --rpc-url ${config.rpcUrl}`, { stdio: 'inherit' });

  logger.debug(indent(`Setting GNO bytecode at ${GNO}`));
  execSync(`cast rpc anvil_setCode ${GNO} ${testERC20Bytecode} --rpc-url ${config.rpcUrl}`, { stdio: 'inherit' });

  // Verify WETH9 bytecode is still intact after deploying other tokens
  logger.debug('Verifying WETH9 bytecode is still intact after other token deployments...');
  const wethBytecodeCheck = execSync(`cast code ${WETH} --rpc-url ${config.rpcUrl}`, { encoding: 'utf8' }).trim();
  if (wethBytecodeCheck === weth9Bytecode) {
    logger.info(indent(`✅ WETH9 bytecode still intact after other token deployments`));
  } else {
    logger.error(indent(`❌ WETH9 bytecode was OVERWRITTEN! Expected WETH9, got something else`));
    logger.error(indent(`Expected length: ${weth9Bytecode.length}, Got: ${wethBytecodeCheck.length}`));
  }

  // Mint tokens to deployer
  logger.debug('Minting tokens to deployer');

  // Calculate total required supply (liquidity pools + user balances)
  // This ensures we have enough tokens even if user balances exceed initialSupply
  const WETH_SUPPLY = calculateTotalRequiredSupply('WETH');
  const USDC_SUPPLY = calculateTotalRequiredSupply('USDC');
  const DAI_SUPPLY = calculateTotalRequiredSupply('DAI');
  const USDT_SUPPLY = calculateTotalRequiredSupply('USDT');
  const GNO_SUPPLY = calculateTotalRequiredSupply('GNO');

  logger.trace(indent(`WETH total supply needed: ${WETH_SUPPLY}`));
  logger.trace(indent(`USDC total supply needed: ${USDC_SUPPLY}`));
  logger.trace(indent(`DAI total supply needed: ${DAI_SUPPLY}`));
  logger.trace(indent(`USDT total supply needed: ${USDT_SUPPLY}`));
  logger.trace(indent(`GNO total supply needed: ${GNO_SUPPLY}`));

  // Get deployer address
  const deployerAddress = execSync(
    `cast wallet address --private-key ${config.deployerPrivateKey}`,
    { encoding: 'utf8' }
  ).trim();

  // Ensure deployer has enough ETH to wrap (give 100M ETH to be safe)
  logger.debug('Ensuring deployer has sufficient ETH for wrapping...');
  const requiredEth = BigInt(WETH_SUPPLY) + BigInt('1000000000000000000'); // WETH_SUPPLY + 1 ETH for gas
  const deployerBalance = BigInt(execSync(
    `cast balance ${deployerAddress} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim());

  if (deployerBalance < requiredEth) {
    logger.trace(indent(`Current deployer balance: ${deployerBalance.toString()}`, 2));
    logger.trace(indent(`Required balance: ${requiredEth.toString()}`, 2));
    logger.debug(indent('Setting deployer balance to 100M ETH'));
    execSync(
      `cast rpc anvil_setBalance ${deployerAddress} 0x52B7D2DCC80CD2E4000000 --rpc-url ${config.rpcUrl}`,
      { stdio: 'inherit' }
    );
    logger.trace(indent('Deployer balance updated', 2));
  } else {
    logger.trace(indent('Deployer already has sufficient balance', 2));
  }

  // Wrap ETH to get WETH (using deposit() function)
  logger.trace(indent('Wrapping ETH to WETH'));
  execSync(
    `cast send ${WETH} "deposit()" --value ${WETH_SUPPLY} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Mint USDC
  logger.trace(indent('Minting USDC'));
  execSync(
    `cast send ${USDC} "mint(address,uint256)" ${deployerAddress} ${USDC_SUPPLY} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Mint DAI
  logger.trace(indent('Minting DAI'));
  execSync(
    `cast send ${DAI} "mint(address,uint256)" ${deployerAddress} ${DAI_SUPPLY} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Mint USDT
  logger.trace(indent('Minting USDT'));
  execSync(
    `cast send ${USDT} "mint(address,uint256)" ${deployerAddress} ${USDT_SUPPLY} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Mint GNO
  logger.trace(indent('Minting GNO'));
  execSync(
    `cast send ${GNO} "mint(address,uint256)" ${deployerAddress} ${GNO_SUPPLY} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Final verification that WETH9 bytecode is still intact
  logger.debug('Final verification of WETH9 bytecode after all operations...');
  const wethBytecodeFinal = execSync(`cast code ${WETH} --rpc-url ${config.rpcUrl}`, { encoding: 'utf8' }).trim();
  if (wethBytecodeFinal === weth9Bytecode) {
    logger.info(indent(`✅ WETH9 bytecode verified intact after all operations`));
  } else {
    logger.error(indent(`❌ WETH9 bytecode verification FAILED at end of deployment!`));
    logger.error(indent(`Expected length: ${weth9Bytecode.length}, Got: ${wethBytecodeFinal.length}`));
  }

  const addresses: TokenAddresses = {
    WETH,
    USDC,
    DAI,
    USDT,
    GNO,
  };

  logger.info('All tokens deployed at mainnet addresses with initial supply successfully');
  logger.info('Deployed token addresses:');
  printDeployment('WETH', addresses.WETH);
  printDeployment('USDC', addresses.USDC);
  printDeployment('DAI', addresses.DAI);
  printDeployment('USDT', addresses.USDT);
  printDeployment('GNO', addresses.GNO);

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
      logger.info('Token deployment complete');
      process.exit(0);
    })
    .catch(error => {
      logger.error({ error }, 'Token deployment failed');
      process.exit(1);
    });
}
