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
import { deployMulticall3 } from './deploy/00-deploy-multicall3';
import { deployTokens } from './deploy/01-deploy-tokens';
import { deployUniswap } from './deploy/02-deploy-uniswap';
import { deployCowProtocol } from './deploy/03-deploy-cow-protocol';
import { deployAuxiliary } from './deploy/04-deploy-auxiliary';
import { addLiquidity, initializeRouter } from './deploy/05-add-liquidity';
import { deployComposableCow } from './deploy/06-deploy-composable-cow';
import { deploySafe } from './deploy/07-deploy-safe';
import { deployMockOracles } from './deploy/08-deploy-mock-oracles';

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
    // Step 0: Deploy Multicall3
    await deployMulticall3(config);

    // Step 1: Deploy Tokens
    const tokens = await deployTokens(config);

    // Step 2: Deploy Uniswap V2
    const uniswap = await deployUniswap(config, tokens);

    // Step 3: Deploy CoW Protocol Core
    const cowProtocol = await deployCowProtocol(config);

    // Step 4: Deploy Auxiliary Contracts
    const auxiliary = await deployAuxiliary(config, cowProtocol);

    // Step 5: Add Liquidity
    await addLiquidity(config, tokens, uniswap);

    // Step 6: Initialize Router
    await initializeRouter(config, tokens, uniswap, cowProtocol);

    // Step 7: Deploy ComposableCow
    const composableCow = await deployComposableCow(config);

    // Step 8: Deploy Safe Wallet Infrastructure
    const safe = await deploySafe(config);

    // Step 9: Deploy Mock Chainlink Oracles
    const mockOracles = await deployMockOracles(config);

    // Step 10: Save oracle addresses to .env file
    printSection('STEP 10: Saving Oracle Addresses to .env');
    const envPath = path.join(__dirname, '../.env');

    // Read current .env file
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Remove old oracle address lines if they exist
    const oracleKeys = [
      'WETH_USD_ORACLE_ADDRESS',
      'DAI_USD_ORACLE_ADDRESS',
      'USDC_USD_ORACLE_ADDRESS',
      'USDT_USD_ORACLE_ADDRESS',
      'GNO_USD_ORACLE_ADDRESS',
    ];

    const envLines = envContent.split('\n').filter(line => {
      const key = line.split('=')[0].trim();
      return !oracleKeys.includes(key);
    });

    // Append new oracle addresses
    envLines.push('');
    envLines.push('# =============================================================================');
    envLines.push('# Mock Chainlink Oracles (Deployed)');
    envLines.push('# =============================================================================');
    envLines.push(`WETH_USD_ORACLE_ADDRESS=${mockOracles.wethUsdOracle}`);
    envLines.push(`DAI_USD_ORACLE_ADDRESS=${mockOracles.daiUsdOracle}`);
    envLines.push(`USDC_USD_ORACLE_ADDRESS=${mockOracles.usdcUsdOracle}`);
    envLines.push(`USDT_USD_ORACLE_ADDRESS=${mockOracles.usdtUsdOracle}`);
    envLines.push(`GNO_USD_ORACLE_ADDRESS=${mockOracles.gnoUsdOracle}`);

    // Write back to .env
    fs.writeFileSync(envPath, envLines.join('\n'));

    logger.info('Oracle addresses saved to .env');

    // Also save Safe address to .env
    if (!envContent.includes('TEST_USER_SAFE_ADDRESS')) {
      const safeEnvLines = [
        '',
        '# =============================================================================',
        '# Test Safe Wallet',
        '# =============================================================================',
        `TEST_USER_SAFE_ADDRESS=${safe.testUserSafe}`,
      ];
      fs.appendFileSync(envPath, safeEnvLines.join('\n'));
      logger.info('Test Safe address saved to .env');
    }

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
