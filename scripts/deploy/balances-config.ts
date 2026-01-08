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
