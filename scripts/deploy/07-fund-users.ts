/**
 * Fund Users with Initial Token Balances
 */

import { execSync } from 'child_process';
import { DeploymentConfig, TokenAddresses } from './types';
import { printSection } from './utils';
import { getUsers } from './balances-config';

export async function fundUsers(
  config: DeploymentConfig,
  tokens: TokenAddresses
): Promise<void> {
  printSection('STEP 7: Funding Users with Initial Token Balances');

  const users = getUsers();
  const userEntries = Object.entries(users);

  if (userEntries.length === 0) {
    console.log('No users configured for funding. Skipping...');
    console.log('');
    return;
  }

  console.log(`Found ${userEntries.length} user(s) to fund:`);
  userEntries.forEach(([username, userConfig]) => {
    console.log(`  - ${username}: ${userConfig.address}`);
  });
  console.log('');

  // Process each user
  for (const [username, userConfig] of userEntries) {
    console.log(`Funding ${username} (${userConfig.address})...`);

    // Transfer each token to the user
    for (const [tokenSymbol, amount] of Object.entries(userConfig.tokens)) {
      const tokenAddress = tokens[tokenSymbol as keyof TokenAddresses];

      if (!tokenAddress) {
        console.log(`  ⚠️  Token ${tokenSymbol} not found in deployed tokens, skipping...`);
        continue;
      }

      try {
        // For WETH, we need to use transfer (not mint)
        // For other tokens, we use transfer from deployer
        console.log(`  Transferring ${tokenSymbol}...`);

        execSync(
          `cast send ${tokenAddress} "transfer(address,uint256)" ${userConfig.address} ${amount} --private-key ${config.deployerPrivateKey} --rpc-url ${config.rpcUrl}`,
          { stdio: 'inherit' }
        );

        console.log(`    ✅ ${tokenSymbol} transferred`);
      } catch (error) {
        console.error(`    ❌ Failed to transfer ${tokenSymbol}:`, error);
      }
    }

    console.log(`  ✅ ${username} funded successfully`);
    console.log('');
  }

  console.log('✅ All users funded with initial token balances!');
  console.log('');
}

// If run directly
if (require.main === module) {
  console.error('❌ This script should be run via the main deploy-all.ts script');
  console.error('   Or run it manually after deployment with proper token addresses');
  process.exit(1);
}
