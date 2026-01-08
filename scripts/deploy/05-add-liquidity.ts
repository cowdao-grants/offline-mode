/**
 * Add Liquidity to Uniswap V2 Pools and Initialize Router
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { DeploymentConfig, TokenAddresses, UniswapAddresses, CowProtocolAddresses } from './types';
import { runForgeScript, printSection } from './utils';
import { logger, indent } from './logger';

const execAsync = promisify(exec);

export async function addLiquidity(
  config: DeploymentConfig,
  tokens: TokenAddresses,
  uniswap: UniswapAddresses
): Promise<void> {
  printSection('STEP 4: Adding Initial Liquidity');

  await runForgeScript(
    'contracts/script/AddLiquidityDirect.s.sol',
    'AddLiquidityDirect',
    config.rpcUrl,
    config.deployerPrivateKey,
    {
      env: {
        WETH_ADDRESS: tokens.WETH,
        USDC_ADDRESS: tokens.USDC,
        DAI_ADDRESS: tokens.DAI,
        USDT_ADDRESS: tokens.USDT,
        GNO_ADDRESS: tokens.GNO,
        UNISWAP_FACTORY: uniswap.factory,
        UNISWAP_ROUTER: uniswap.router,
        PAIR_WETH_USDC: uniswap.pairs.WETH_USDC,
        PAIR_WETH_DAI: uniswap.pairs.WETH_DAI,
        PAIR_USDC_DAI: uniswap.pairs.USDC_DAI,
        PAIR_WETH_USDT: uniswap.pairs.WETH_USDT,
        PAIR_WETH_GNO: uniswap.pairs.WETH_GNO,
        PAIR_USDC_USDT: uniswap.pairs.USDC_USDT,
        PAIR_USDC_GNO: uniswap.pairs.USDC_GNO,
        PAIR_DAI_USDT: uniswap.pairs.DAI_USDT,
        PAIR_DAI_GNO: uniswap.pairs.DAI_GNO,
        PAIR_USDT_GNO: uniswap.pairs.USDT_GNO,
      },
    }
  );

  logger.info('Liquidity added to all pairs successfully');
}

export async function initializeRouter(
  config: DeploymentConfig,
  tokens: TokenAddresses,
  uniswap: UniswapAddresses,
  cowProtocol: CowProtocolAddresses
): Promise<void> {
  printSection('STEP 4.5: Initializing Uniswap Router (Token Approvals)');

  // Use cast with anvil_impersonateAccount to set approvals
  // This creates real transactions that persist in Anvil state
  logger.debug('Setting approvals from Settlement to Router');
  logger.debug(indent(`Settlement: ${cowProtocol.settlement}`));
  logger.debug(indent(`Router: ${uniswap.router}`));

  const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

  const tokenList = [
    { name: 'WETH', address: tokens.WETH },
    { name: 'USDC', address: tokens.USDC },
    { name: 'DAI', address: tokens.DAI },
    { name: 'USDT', address: tokens.USDT },
    { name: 'GNO', address: tokens.GNO },
  ];

  // First, fund the Settlement contract with ETH for gas
  logger.debug('Funding Settlement contract with ETH for gas');
  await execAsync(
    `cast send ${cowProtocol.settlement} --value 10ether --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
    { cwd: path.join(__dirname, '../..') }
  );
  logger.trace(indent('Settlement funded with 10 ETH'));

  // Enable impersonation
  await execAsync(
    `cast rpc anvil_impersonateAccount ${cowProtocol.settlement} --rpc-url ${config.rpcUrl}`,
    { cwd: path.join(__dirname, '../..') }
  );

  // Approve each token
  for (const token of tokenList) {
    logger.debug(indent(`Approving ${token.name}`));
    try {
      await execAsync(
        `cast send ${token.address} "approve(address,uint256)" ${uniswap.router} ${MAX_UINT256} --from ${cowProtocol.settlement} --rpc-url ${config.rpcUrl} --unlocked --gas-limit 100000`,
        { cwd: path.join(__dirname, '../..') }
      );
      logger.debug(indent(`${token.name} approved`, 2));
    } catch (error) {
      logger.error({ error }, `Failed to approve ${token.name}`);
      throw error;
    }
  }

  // Disable impersonation
  await execAsync(
    `cast rpc anvil_stopImpersonatingAccount ${cowProtocol.settlement} --rpc-url ${config.rpcUrl}`,
    { cwd: path.join(__dirname, '../..') }
  );

  logger.info('Router initialized with all token approvals successfully');
}

// If run directly
if (require.main === module) {
  logger.error('This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
