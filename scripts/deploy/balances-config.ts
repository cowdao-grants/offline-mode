import * as fs from 'fs';
import * as path from 'path';

export interface TokenConfig {
  decimals: number;
  initialSupply: string;
}

export interface LiquidityPoolConfig {
  token0Amount: string;
  token1Amount: string;
}

export interface UserConfig {
  address: string;
  tokens: {
    [tokenSymbol: string]: string;
  };
}

export interface BalancesConfig {
  version: string;
  tokens: {
    [key: string]: TokenConfig;
  };
  defi: {
    uniswapV2: {
      [key: string]: LiquidityPoolConfig;
    };
  };
  users: {
    [username: string]: UserConfig;
  };
}

export function loadBalancesConfig(): BalancesConfig {
  const configPath = path.join(__dirname, '../../config/balances.json');
  const configData = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(configData);
}

export function getTokenSupply(tokenSymbol: string): string {
  const config = loadBalancesConfig();
  const token = config.tokens[tokenSymbol];
  if (!token) {
    throw new Error(`Token ${tokenSymbol} not found in balances config`);
  }
  return token.initialSupply;
}

export function getUniswapV2LiquidityPoolAmounts(pairName: string): LiquidityPoolConfig {
  const config = loadBalancesConfig();
  const pool = config.defi.uniswapV2[pairName];
  if (!pool) {
    throw new Error(`UniswapV2 liquidity pool ${pairName} not found in balances config`);
  }
  return pool;
}

export function getUsers(): { [username: string]: UserConfig } {
  const config = loadBalancesConfig();
  return config.users;
}

export function getUserConfig(username: string): UserConfig {
  const config = loadBalancesConfig();
  const user = config.users[username];
  if (!user) {
    throw new Error(`User ${username} not found in balances config`);
  }
  return user;
}

/**
 * Calculate total required supply for a token
 * Sums: liquidity pool amounts + user balances
 */
export function calculateTotalRequiredSupply(tokenSymbol: string): string {
  const config = loadBalancesConfig();

  let total = BigInt(0);

  // Add amounts from all liquidity pools
  for (const [pairName, poolConfig] of Object.entries(config.defi.uniswapV2)) {
    const tokens = pairName.split('_');

    // Check if this token is token0 in the pair
    if (tokens[0] === tokenSymbol) {
      total += BigInt(poolConfig.token0Amount);
    }
    // Check if this token is token1 in the pair
    if (tokens[1] === tokenSymbol) {
      total += BigInt(poolConfig.token1Amount);
    }
  }

  // Add amounts from all user balances
  for (const userConfig of Object.values(config.users)) {
    if (userConfig.tokens[tokenSymbol]) {
      // Skip ETH as it's not an ERC20 token
      if (tokenSymbol !== 'ETH') {
        total += BigInt(userConfig.tokens[tokenSymbol]);
      }
    }
  }

  return total.toString();
}
