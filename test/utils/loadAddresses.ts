/**
 * Utility to load addresses from .env.offline file
 * This replaces the need for a separate addresses.json file
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Addresses {
  chainId: number;
  tokens: {
    WETH: string;
    USDC: string;
    DAI: string;
    USDT: string;
    GNO: string;
  };
  uniswap: {
    factory: string;
    router: string;
    pairs: {
      WETH_USDC: string;
      WETH_DAI: string;
      WETH_USDT: string;
      WETH_GNO: string;
      USDC_DAI: string;
      USDC_USDT: string;
      USDC_GNO: string;
      DAI_USDT: string;
      DAI_GNO: string;
      USDT_GNO: string;
    };
  };
  cowProtocol: {
    authenticator: string;
    settlement: string;
    vaultRelayer: string;
    balancerVault: string;
    hooksTrampoline: string;
  };
  auxiliary: {
    tradeSimulator: string;
    signatures: string;
  };
  cowShed: {
    factory: string;
    implementation: string;
  };
  cowShedForComposableCoW: {
    factory: string;
    implementation: string;
  };
  composableCow: {
    composableCoW: string;
    extensibleFallbackHandler: string;
    currentBlockTimestampFactory: string;
    twap: string;
    stopLoss: string;
    goodAfterTime: string;
    perpetualStableSwap: string;
    tradeAboveThreshold: string;
  };
  oracles: {
    wethUsd: string;
    daiUsd: string;
    usdcUsd: string;
    usdtUsd: string;
    gnoUsd: string;
  };
}

/**
 * Parse .env file and return key-value pairs
 */
function parseEnvFile(filePath: string): Record<string, string> {
  const content = fs.readFileSync(filePath, 'utf8');
  const env: Record<string, string> = {};

  content.split('\n').forEach(line => {
    line = line.trim();
    // Skip empty lines and comments
    if (!line || line.startsWith('#')) return;

    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim();
    }
  });

  return env;
}

/**
 * Get pair address from factory using deterministic CREATE2
 * This matches the Uniswap V2 pair creation logic
 */
function getPairAddress(
  factory: string,
  tokenA: string,
  tokenB: string
): string {
  const { keccak256, solidityPacked, getCreate2Address } = require('ethers');

  // Sort tokens
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];

  // Uniswap V2 pair init code hash
  const INIT_CODE_HASH = '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f';

  // Calculate CREATE2 address
  const salt = keccak256(solidityPacked(['address', 'address'], [token0, token1]));

  return getCreate2Address(factory, salt, INIT_CODE_HASH);
}

/**
 * Load addresses from .env file
 * Falls back to .env in playground directory if not found locally
 */
export function loadAddresses(): Addresses {
  // Try to find .env file
  const possiblePaths = [
    path.join(__dirname, '../../.env'),       // test/utils -> root
    path.join(__dirname, '../../../.env'),     // if nested deeper
    path.join(__dirname, '../../../../.env'),  // if even deeper
    path.join(process.cwd(), '.env'),         // from current working directory
  ];

  let envFilePath: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      envFilePath = p;
      break;
    }
  }

  if (!envFilePath) {
    throw new Error('.env file not found. Please run deployment first.');
  }

  const env = parseEnvFile(envFilePath);

  // Extract addresses from env vars
  const chainId = parseInt(env.CHAIN_ID || '31337');
  const tokens = {
    WETH: env.WETH_ADDRESS,
    USDC: env.USDC_ADDRESS,
    DAI: env.DAI_ADDRESS,
    USDT: env.USDT_ADDRESS,
    GNO: env.GNO_ADDRESS,
  };

  const factory = env.UNISWAP_V2_FACTORY_ADDRESS;
  const router = env.UNISWAP_V2_ROUTER_ADDRESS;

  // Calculate pair addresses deterministically
  const pairs = {
    WETH_USDC: getPairAddress(factory, tokens.WETH, tokens.USDC),
    WETH_DAI: getPairAddress(factory, tokens.WETH, tokens.DAI),
    WETH_USDT: getPairAddress(factory, tokens.WETH, tokens.USDT),
    WETH_GNO: getPairAddress(factory, tokens.WETH, tokens.GNO),
    USDC_DAI: getPairAddress(factory, tokens.USDC, tokens.DAI),
    USDC_USDT: getPairAddress(factory, tokens.USDC, tokens.USDT),
    USDC_GNO: getPairAddress(factory, tokens.USDC, tokens.GNO),
    DAI_USDT: getPairAddress(factory, tokens.DAI, tokens.USDT),
    DAI_GNO: getPairAddress(factory, tokens.DAI, tokens.GNO),
    USDT_GNO: getPairAddress(factory, tokens.USDT, tokens.GNO),
  };

  const addresses: Addresses = {
    chainId,
    tokens,
    uniswap: {
      factory,
      router,
      pairs,
    },
    cowProtocol: {
      authenticator: env.AUTHENTICATOR_ADDRESS,
      settlement: env.SETTLEMENT_CONTRACT_ADDRESS,
      vaultRelayer: env.VAULT_RELAYER_ADDRESS,
      balancerVault: env.BALANCER_VAULT_ADDRESS,
      hooksTrampoline: env.HOOKS_CONTRACT_ADDRESS,
    },
    auxiliary: {
      tradeSimulator: env.BALANCES_CONTRACT_ADDRESS,
      signatures: env.SIGNATURES_CONTRACT_ADDRESS,
    },
    cowShed: {
      factory: env.COWSHED_FACTORY_ADDRESS,
      implementation: env.COWSHED_IMPLEMENTATION_ADDRESS,
    },
    cowShedForComposableCoW: {
      factory: env.COWSHED_COMPOSABLE_COW_FACTORY_ADDRESS,
      implementation: env.COWSHED_COMPOSABLE_COW_IMPLEMENTATION_ADDRESS,
    },
    composableCow: {
      composableCoW: env.COMPOSABLE_COW_ADDRESS,
      extensibleFallbackHandler: env.EXTENSIBLE_FALLBACK_HANDLER_ADDRESS,
      currentBlockTimestampFactory: env.CURRENT_BLOCK_TIMESTAMP_FACTORY_ADDRESS,
      twap: env.TWAP_ADDRESS,
      stopLoss: env.STOP_LOSS_ADDRESS,
      goodAfterTime: env.GOOD_AFTER_TIME_ADDRESS,
      perpetualStableSwap: env.PERPETUAL_STABLE_SWAP_ADDRESS,
      tradeAboveThreshold: env.TRADE_ABOVE_THRESHOLD_ADDRESS,
    },
    oracles: {
      wethUsd: env.WETH_USD_ORACLE_ADDRESS,
      daiUsd: env.DAI_USD_ORACLE_ADDRESS,
      usdcUsd: env.USDC_USD_ORACLE_ADDRESS,
      usdtUsd: env.USDT_USD_ORACLE_ADDRESS,
      gnoUsd: env.GNO_USD_ORACLE_ADDRESS,
    },
  };

  return addresses;
}
