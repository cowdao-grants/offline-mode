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
import { execSync } from 'child_process';

export async function deployTokens(config: DeploymentConfig): Promise<TokenAddresses> {
  printSection('STEP 1: Deploying Tokens (WETH, USDC, DAI, USDT, GNO) at mainnet addresses');

  // Mainnet token addresses
  const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
  const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
  const GNO = '0x6810e776880C02933D47DB1b9fc05908e5386b96';

  // Deploy WETH at mainnet address using cast rpc anvil_setCode
  console.log('Deploying WETH at mainnet address...');
  const wethBytecode = '0x6060604052600436106100af576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff16806306fdde03146100b9578063095ea7b31461014757806318160ddd146101a157806323b872dd146101ca5780632e1a7d4d14610243578063313ce5671461026657806370a082311461029557806395d89b41146102e2578063a9059cbb14610370578063d0e30db0146103ca578063dd62ed3e146103d4575b6100b7610440565b005b34156100c457600080fd5b6100cc6104dd565b6040518080602001828103825283818151815260200191508051906020019080838360005b8381101561010c5780820151818401526020810190506100f1565b50505050905090810190601f1680156101395780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b341561015257600080fd5b610187600480803573ffffffffffffffffffffffffffffffffffffffff1690602001909190803590602001909190505061057b565b604051808215151515815260200191505060405180910390f35b34156101ac57600080fd5b6101b461066d565b6040518082815260200191505060405180910390f35b34156101d557600080fd5b610229600480803573ffffffffffffffffffffffffffffffffffffffff1690602001909190803573ffffffffffffffffffffffffffffffffffffffff1690602001909190803590602001909190505061068c565b604051808215151515815260200191505060405180910390f35b341561024e57600080fd5b61026460048080359060200190919050506109d9565b005b341561027157600080fd5b610279610b05565b604051808260ff1660ff16815260200191505060405180910390f35b34156102a057600080fd5b6102cc600480803573ffffffffffffffffffffffffffffffffffffffff16906020019091905050610b18565b6040518082815260200191505060405180910390f35b34156102ed57600080fd5b6102f5610b30565b6040518080602001828103825283818151815260200191508051906020019080838360005b8381101561033557808201518184015260208101905061031a565b50505050905090810190601f1680156103625780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b341561037b57600080fd5b6103b0600480803573ffffffffffffffffffffffffffffffffffffffff16906020019091908035906020019091905050610bce565b604051808215151515815260200191505060405180910390f35b6103d2610440565b005b34156103df57600080fd5b61042a600480803573ffffffffffffffffffffffffffffffffffffffff1690602001909190803573ffffffffffffffffffffffffffffffffffffffff16906020019091905050610be3565b6040518082815260200191505060405180910390f35b34600360003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825401925050819055503373ffffffffffffffffffffffffffffffffffffffff167fe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c346040518082815260200191505060405180910390a2565b60008054600181600116156101000203166002900480601f0160208091040260200160405190810160405280929190818152602001828054600181600116156101000203166002900480156105735780601f1061054857610100808354040283529160200191610573565b820191906000526020600020905b81548152906001019060200180831161055657829003601f168201915b505050505081565b600081600460003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925846040518082815260200191505060405180910390a36001905092915050565b60003073ffffffffffffffffffffffffffffffffffffffff1631905090565b600081600360008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054101515156106dc57600080fd5b3373ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff16141580156107b457507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff600460008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000205414155b156108cf5781600460008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020541015151561084457600080fd5b81600460008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055505b81600360008673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000206000828254039250508190555081600360008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825401925050819055508273ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040518082815260200191505060405180910390a3600190509392505050565b80600360003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000205410151515610a2757600080fd5b80600360003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825403925050819055503373ffffffffffffffffffffffffffffffffffffffff166108fc829081150290604051600060405180830381858888f193505050501515610ab457600080fd5b3373ffffffffffffffffffffffffffffffffffffffff167f7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65826040518082815260200191505060405180910390a250565b600260009054906101000a900460ff1681565b60036020528060005260406000206000915090505481565b60018054600181600116156101000203166002900480601f016020809104026020016040519081016040528092919081815260200182805460018160011615610100020316600290048015610bc65780601f10610b9b57610100808354040283529160200191610bc6565b820191906000526020600020905b815481529060010190602001808311610ba957829003601f168201915b505050505081565b6000610bdb33848461068c565b905092915050565b60046020528160005260406000206020528060005260406000206000915091505054815600a165627a7a72305820deb4c2ccab3c2fdca32ab3f46728389c2fe2c165d5fafa07661e4e004f6c344a0029';
  execSync(`cast rpc anvil_setCode ${WETH} ${wethBytecode} --rpc-url ${config.rpcUrl}`, { stdio: 'inherit' });
  console.log('✅ WETH bytecode set');

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

  // Token supply constants (matching DeployTokens.s.sol)
  const WETH_SUPPLY = '1000000000000000000000'; // 1,000 WETH (18 decimals)
  const USDC_SUPPLY = '1000000000000'; // 1 million USDC (6 decimals)
  const DAI_SUPPLY = '1000000000000000000000000'; // 1 million DAI (18 decimals)
  const USDT_SUPPLY = '1000000000000'; // 1 million USDT (6 decimals)
  const GNO_SUPPLY = '1000000000000000000000000'; // 1 million GNO (18 decimals)

  // Wrap ETH to WETH
  console.log('  Wrapping ETH to WETH...');
  execSync(
    `cast send ${WETH} "deposit()" --value ${WETH_SUPPLY} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
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
