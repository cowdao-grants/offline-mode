/**
 * Fund Users with Initial Token Balances
 */

import { execSync } from 'child_process';
import { DeploymentConfig, TokenAddresses } from './types';
import { printSection } from './utils';
import { getUsers } from './balances-config';
import { logger, indent } from './logger';

export async function fundUsers(
  config: DeploymentConfig,
  tokens: TokenAddresses
): Promise<void> {
  printSection('STEP 7: Funding Users with Initial Token Balances');

  const users = getUsers();
  const userEntries = Object.entries(users);

  if (userEntries.length === 0) {
    logger.info('No users configured for funding. Skipping');
    return;
  }

  logger.debug(`Found ${userEntries.length} user(s) to fund:`);
  userEntries.forEach(([username, userConfig]) => {
    logger.debug(indent(`- ${username}: ${userConfig.address}`));
  });

  // Process each user
  for (const [username, userConfig] of userEntries) {
    logger.debug(`Funding ${username} (${userConfig.address})`);

    // Transfer each token to the user
    for (const [tokenSymbol, amount] of Object.entries(userConfig.tokens)) {
      const tokenAddress = tokens[tokenSymbol as keyof TokenAddresses];

      if (!tokenAddress) {
        logger.warn(indent(`Token ${tokenSymbol} not found in deployed tokens, skipping`));
        continue;
      }

      try {
        // For WETH, we need to use transfer (not mint)
        // For other tokens, we use transfer from deployer
        logger.trace(indent(`Transferring ${tokenSymbol}`, 2));

        execSync(
          `cast send ${tokenAddress} "transfer(address,uint256)" ${userConfig.address} ${amount} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
          { stdio: 'inherit' }
        );

        logger.trace(indent(`${tokenSymbol} transferred`, 3));
      } catch (error) {
        logger.error({ error }, `Failed to transfer ${tokenSymbol}`);
      }
    }

    logger.debug(indent(`${username} funded successfully`));
  }

  logger.info('All users funded with initial token balances');
}

// If run directly
if (require.main === module) {
  logger.error('This script should be run via the main deploy-all.ts script');
  logger.error('Or run it manually after deployment with proper token addresses');
  process.exit(1);
}
