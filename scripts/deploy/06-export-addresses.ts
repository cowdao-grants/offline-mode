/**
 * Generate Configuration Files
 */

import * as fs from 'fs';
import * as path from 'path';
import { AllAddresses } from './types';
import { printSection } from './utils';

export async function generateConfigs(allAddresses: AllAddresses): Promise<void> {
  printSection('STEP 5: Generating Configuration Files');

  console.log('Generating configuration files...');

  const configsDir = path.join(__dirname, '../../configs/offline');

  // Ensure directories exist
  fs.mkdirSync(configsDir, { recursive: true });

  // Generate driver.toml
  const driverToml = `app-data-fetching-enabled = true
orderbook-url = "http://orderbook"
tx-gas-limit = "45000000"

[[solver]]
name = "baseline" # Arbitrary name given to this solver, must be unique
endpoint = "http://baseline"
absolute-slippage = "40000000000000000" # Denominated in wei, optional
relative-slippage = "0.1" # Percentage in the [0, 1] range
# Anvil account #0 private key (from test mnemonic)
account = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

[submission]
gas-price-cap = "1000000000000"

[[submission.mempool]]
mempool = "public"

[contracts]
gp-v2-settlement = "${allAddresses.cowProtocol.settlement}"
weth = "${allAddresses.tokens.WETH}"
balances = "${allAddresses.auxiliary.tradeSimulator}"  # GPv2TradeSimulator
signatures = "${allAddresses.auxiliary.signatures}"

[liquidity]
base-tokens = [
    "${allAddresses.tokens.WETH}", # WETH
    "${allAddresses.tokens.DAI}", # DAI
    "${allAddresses.tokens.USDC}", # USDC
    "${allAddresses.tokens.USDT}", # USDT
    "${allAddresses.tokens.GNO}", # GNO
]

[[liquidity.uniswap-v2]]
router = "${allAddresses.uniswap.router}"
pool-code = "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f" # Uniswap V2 init code hash
missing-pool-cache-time = "1h"
`;

  fs.writeFileSync(path.join(configsDir, 'driver.toml'), driverToml);
  console.log('  ✅ Generated offline-mode/configs/offline/driver.toml');

  // Generate baseline.toml
  const baselineToml = `chain-id = "1" # Mainnet chain ID
base-tokens = [
    "${allAddresses.tokens.WETH}", # WETH
    "${allAddresses.tokens.DAI}", # DAI
    "${allAddresses.tokens.USDC}", # USDC
    "${allAddresses.tokens.USDT}", # USDT
    "${allAddresses.tokens.GNO}", # GNO
]
max-hops = 2
max-partial-attempts = 5
native-token-price-estimation-amount = "100000000000000000" # 0.1 ETH
`;

  fs.writeFileSync(path.join(configsDir, 'baseline.toml'), baselineToml);
  console.log('  ✅ Generated offline-mode/configs/offline/baseline.toml');

  console.log('');
  console.log('✅ Configuration files generated!');
  console.log('  📝 Note: All contract addresses are deterministic and stored in .env');
  console.log('');
}

// If run directly
if (require.main === module) {
  console.error('❌ This script should be run via the main deploy-all.ts script');
  process.exit(1);
}
