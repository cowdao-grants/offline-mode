#!/usr/bin/env ts-node
/**
 * Main deployment orchestrator script
 * Deploys all contracts and generates configuration files
 */

import * as fs from 'fs';
import * as path from 'path';
import { DeploymentConfig } from './deploy/types';
import {
  printSection,
  printDeploymentSummary,
  printOutputFiles,
  printNextSteps,
} from './deploy/utils';
import { logger } from './deploy/logger';
import { deploySingletonFactory } from './deploy/00-deploy-singleton-factory';
import { deployMulticall3 } from './deploy/01-deploy-multicall3';
import { deployTokens } from './deploy/02-deploy-tokens';
import { deployUniswap } from './deploy/03-deploy-uniswap';
import { deployCowProtocol } from './deploy/04-deploy-cow-protocol';
import { deployAuxiliary } from './deploy/05-deploy-auxiliary';
import { addLiquidity, initializeRouter } from './deploy/06-add-liquidity';
import { fundUsers } from './deploy/07-fund-users';
import { deployComposableCow } from './deploy/08-deploy-composable-cow';
import { deploySafe } from './deploy/09-deploy-safe';
import { deployMockOracles } from './deploy/10-deploy-mock-oracles';

// ============================================================================
// CONFIGURATION - Edit these constants as needed
// ============================================================================

const RPC_URL = 'http://localhost:8545';
const DEPLOYER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Anvil account #0
const CHAIN_ID = 1; // Mainnet chain ID for address compatibility

// ============================================================================

async function main() {
  logger.info('Deploying all contracts to local Anvil');

  // Configuration
  const config: DeploymentConfig = {
    rpcUrl: RPC_URL,
    deployerPrivateKey: DEPLOYER_PRIVATE_KEY,
    chainId: CHAIN_ID,
  };

  logger.debug(`Using RPC URL: ${config.rpcUrl}`);

  // Create directories
  const configDir = path.join(__dirname, '../config');
  const stateDir = path.join(__dirname, '../state');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  try {
    // Step 0: Deploy Singleton Factory (Deterministic Deployer)
    await deploySingletonFactory(config);

    // Step 1: Deploy Multicall3
    await deployMulticall3(config);

    // Step 2: Deploy Tokens
    const tokens = await deployTokens(config);

    // Step 3: Deploy Uniswap V2
    const uniswap = await deployUniswap(config, tokens);

    // Step 4: Deploy CoW Protocol Core
    const cowProtocol = await deployCowProtocol(config);

    // Step 5: Deploy Auxiliary Contracts
    const auxiliary = await deployAuxiliary(config, cowProtocol);

    // Step 6: Add Liquidity
    await addLiquidity(config, tokens, uniswap);

    // Step 7: Initialize Router
    await initializeRouter(config, tokens, uniswap, cowProtocol);

    // Step 8: Fund Users
    await fundUsers(config, tokens);

    // Step 9: Deploy ComposableCow
    const composableCow = await deployComposableCow(config);

    // Step 10: Deploy Safe Wallet Infrastructure
    const safe = await deploySafe(config);

    // Step 11: Deploy Mock Chainlink Oracles
    // Note: Oracles are deployed with CREATE2 at deterministic addresses
    // These addresses are hardcoded in .env and should match the deployed addresses
    const mockOracles = await deployMockOracles(config);

    logger.info('');
    logger.info('Deployed oracle addresses (deterministic via CREATE2):');
    logger.info(`  WETH_USD_ORACLE_ADDRESS=${mockOracles.wethUsdOracle}`);
    logger.info(`  DAI_USD_ORACLE_ADDRESS=${mockOracles.daiUsdOracle}`);
    logger.info(`  USDC_USD_ORACLE_ADDRESS=${mockOracles.usdcUsdOracle}`);
    logger.info(`  USDT_USD_ORACLE_ADDRESS=${mockOracles.usdtUsdOracle}`);
    logger.info(`  GNO_USD_ORACLE_ADDRESS=${mockOracles.gnoUsdOracle}`);
    logger.info(`  TEST_USER_SAFE_ADDRESS=${safe.testUserSafe}`);
    logger.info('');
    logger.info('ℹ️  These addresses are deterministic and should be added to .env.example');

    // Print summary
    printSection('DEPLOYMENT COMPLETE');
    printDeploymentSummary();
    printOutputFiles();
    printNextSteps();

  } catch (error) {
    printSection('DEPLOYMENT FAILED');
    logger.error({ error }, 'Deployment error');
    process.exit(1);
  }
}

// Run main function
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      logger.fatal({ error }, 'Fatal deployment error');
      process.exit(1);
    });
}

export { main as deployAll };
