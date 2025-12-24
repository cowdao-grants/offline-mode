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
import { deployTokens } from './deploy/01-deploy-tokens';
import { deployUniswap } from './deploy/02-deploy-uniswap';
import { deployCowProtocol } from './deploy/03-deploy-cow-protocol';
import { deployAuxiliary } from './deploy/04-deploy-auxiliary';
import { addLiquidity, initializeRouter } from './deploy/05-add-liquidity';
import { deployComposableCow } from './deploy/06-deploy-composable-cow';
import { deploySafe } from './deploy/07-deploy-safe';

// ============================================================================
// CONFIGURATION - Edit these constants as needed
// ============================================================================

const RPC_URL = 'http://localhost:8545';
const DEPLOYER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Anvil account #0
const CHAIN_ID = 1; // Mainnet chain ID for address compatibility

// ============================================================================

async function main() {
  console.log('🚀 Deploying all contracts to local Anvil...');
  console.log('');

  // Configuration
  const config: DeploymentConfig = {
    rpcUrl: RPC_URL,
    deployerPrivateKey: DEPLOYER_PRIVATE_KEY,
    chainId: CHAIN_ID,
  };

  console.log(`Using RPC URL: ${config.rpcUrl}`);
  console.log('');

  // Create directories
  const configDir = path.join(__dirname, '../config');
  const stateDir = path.join(__dirname, '../state');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  try {
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

    // Print summary
    printSection('✅ DEPLOYMENT COMPLETE');
    console.log('');
    printDeploymentSummary();
    console.log('');
    printOutputFiles();
    console.log('');
    printNextSteps();
    console.log('');
    console.log('━'.repeat(60));

  } catch (error) {
    console.error('');
    printSection('❌ DEPLOYMENT FAILED');
    console.error('');
    console.error('Error:', error);
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
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { main as deployAll };
