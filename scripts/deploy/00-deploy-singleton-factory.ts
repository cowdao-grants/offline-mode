/**
 * Deploy Singleton Factory (Deterministic Deployer) at 0x4e59b44847b379578588920cA78FbF26c0B4956C
 */

import { DeploymentConfig } from './types';
import { printSection } from './utils';
import { execSync } from 'child_process';
import { logger, indent } from './logger';

export async function deploySingletonFactory(config: DeploymentConfig): Promise<string> {
  printSection('STEP 0: Deploying Singleton Factory');

  const SINGLETON_FACTORY = '0x4e59b44847b379578588920cA78FbF26c0B4956C';

  // The runtime bytecode of the Singleton Factory
  // This is the well-known deterministic deployer used by many projects
  const SINGLETON_FACTORY_CODE =
    '0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3';

  logger.debug('Checking if Singleton Factory already exists');

  // Check if already deployed
  const existingCode = execSync(
    `cast code ${SINGLETON_FACTORY} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  if (existingCode && existingCode !== '0x') {
    logger.info(indent('Singleton Factory already deployed'));
    logger.debug(indent(`Code size: ${existingCode.length - 2} bytes`));
    return SINGLETON_FACTORY;
  }

  logger.debug('Deploying Singleton Factory');
  logger.trace(indent(`Target address: ${SINGLETON_FACTORY}`));

  // Deploy using anvil_setCode (since we can't use the presigned transaction in Anvil)
  logger.trace(indent('Setting bytecode at target address'));
  execSync(
    `cast rpc anvil_setCode ${SINGLETON_FACTORY} ${SINGLETON_FACTORY_CODE} --rpc-url ${config.rpcUrl}`,
    { stdio: 'inherit' }
  );

  // Verify deployment
  const deployedCode = execSync(
    `cast code ${SINGLETON_FACTORY} --rpc-url ${config.rpcUrl}`,
    { encoding: 'utf8' }
  ).trim();

  if (!deployedCode || deployedCode === '0x') {
    throw new Error('Failed to deploy Singleton Factory');
  }

  logger.info(indent(`Singleton Factory deployed successfully`));
  logger.debug(indent(`Code size: ${deployedCode.length - 2} bytes`));

  logger.info('Singleton Factory is ready for CREATE2 deployments');
  logger.debug('');
  logger.debug('What is the Singleton Factory?');
  logger.debug(indent('- Also known as "Nick\'s Factory" or "Deterministic Deployment Proxy"'));
  logger.debug(indent('- Enables CREATE2 deployments with predictable addresses'));
  logger.debug(indent('- Same address (0x4e59b44847b379578588920cA78FbF26c0B4956C) on all EVM chains'));
  logger.debug(indent('- Used by CoW Protocol for contracts like HooksTrampoline'));
  logger.debug('');

  // Save to .env
  logger.debug('Saving Singleton Factory address to .env');
  const envPath = require('path').join(__dirname, '../../.env');
  const fs = require('fs');

  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  // Check if SINGLETON_FACTORY_ADDRESS already exists
  if (!envContent.includes('SINGLETON_FACTORY_ADDRESS')) {
    const factoryEnvLine = `\n# Deterministic Deployer (Singleton Factory)\nSINGLETON_FACTORY_ADDRESS=${SINGLETON_FACTORY}\n`;
    fs.appendFileSync(envPath, factoryEnvLine);
    logger.trace(indent('Added SINGLETON_FACTORY_ADDRESS to .env'));
  } else {
    logger.trace(indent('SINGLETON_FACTORY_ADDRESS already in .env'));
  }

  return SINGLETON_FACTORY;
}

// If run directly
if (require.main === module) {
  logger.error('This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
