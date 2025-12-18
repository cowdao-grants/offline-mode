/**
 * Token configuration for Coingecko mock API
 *
 * Prices are fetched dynamically from Uniswap V2 pairs.
 * Token addresses are loaded from environment variables (from .env.offline).
 */

export interface TokenConfig {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

// Load token addresses from environment variables
const WETH_ADDRESS = (process.env.WETH_ADDRESS || "").toLowerCase();
const DAI_ADDRESS = (process.env.DAI_ADDRESS || "").toLowerCase();
const USDC_ADDRESS = (process.env.USDC_ADDRESS || "").toLowerCase();
const USDT_ADDRESS = (process.env.USDT_ADDRESS || "").toLowerCase();
const GNO_ADDRESS = (process.env.GNO_ADDRESS || "").toLowerCase();

// Build token config dynamically from environment variables
function buildTokenConfig(): Record<string, TokenConfig> {
  if (
    !WETH_ADDRESS ||
    !DAI_ADDRESS ||
    !USDC_ADDRESS ||
    !USDT_ADDRESS ||
    !GNO_ADDRESS
  ) {
    throw new Error(
      "One or more token addresses are not set in environment variables."
    );
  }
  const tokens: Record<string, TokenConfig> = {
    [WETH_ADDRESS]: {
      address: WETH_ADDRESS,
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
    },
    [DAI_ADDRESS]: {
      address: DAI_ADDRESS,
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
    },
    [USDC_ADDRESS]: {
      address: USDC_ADDRESS,
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
    },
    [USDT_ADDRESS]: {
      address: USDT_ADDRESS,
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
    },
    [GNO_ADDRESS]: {
      address: GNO_ADDRESS,
      symbol: "GNO",
      name: "Gnosis Token",
      decimals: 18,
    },
  };
  return tokens;
}

export const TOKENS: Record<string, TokenConfig> = buildTokenConfig();

/**
 * Get token config by address (case-insensitive)
 */
export function getTokenConfig(address: string): TokenConfig | null {
  const normalizedAddress = address.toLowerCase();
  return TOKENS[normalizedAddress] || null;
}

/**
 * Check if token is supported
 */
export function isTokenSupported(address: string): boolean {
  return address.toLowerCase() in TOKENS;
}

/**
 * Get all supported token addresses
 */
export function getSupportedTokens(): string[] {
  return Object.keys(TOKENS);
}
