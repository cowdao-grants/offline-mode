import { ethers } from 'ethers';
import { getTokenConfig } from './tokens.config';

/**
 * Uniswap V2 Pair ABI - only the functions we need
 */
const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
];

/**
 * Uniswap V2 Factory ABI - only the functions we need
 */
const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
];

/**
 * Configuration for Uniswap V2 price fetching
 */
interface UniswapConfig {
  rpcUrl: string;
  factoryAddress: string;
  wethAddress: string;
}

/**
 * Service to fetch token prices from Uniswap V2 pairs
 */
export class UniswapPriceFetcher {
  private provider: ethers.JsonRpcProvider;
  private factory: ethers.Contract;
  private wethAddress: string;
  private priceCache: Map<string, { price: number; timestamp: number }>;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  constructor(config: UniswapConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.factory = new ethers.Contract(config.factoryAddress, FACTORY_ABI, this.provider);
    this.wethAddress = config.wethAddress.toLowerCase();
    this.priceCache = new Map();
  }

  /**
   * Get token price in ETH by fetching from Uniswap V2 pair
   * @param tokenAddress The token address to get price for
   * @returns Price in ETH, or null if pair doesn't exist
   */
  async getTokenPriceInEth(tokenAddress: string): Promise<number | null> {
    const normalizedAddress = tokenAddress.toLowerCase();

    // WETH is always 1 ETH
    if (normalizedAddress === this.wethAddress) {
      return 1.0;
    }

    // Check cache
    const cached = this.priceCache.get(normalizedAddress);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.price;
    }

    try {
      // Get pair address from factory
      const pairAddress = await this.factory.getPair(tokenAddress, this.wethAddress);

      // Check if pair exists
      if (pairAddress === ethers.ZeroAddress) {
        console.log(`  ⚠️  No Uniswap pair found for ${tokenAddress}`);
        return null;
      }

      // Create pair contract instance
      const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);

      // Get token0 and token1 addresses
      const [token0Address, token1Address, reserves] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
        pairContract.getReserves(),
      ]);

      const reserve0 = reserves[0];
      const reserve1 = reserves[1];

      // Determine which reserve is WETH and which is the token
      let tokenReserve: bigint;
      let wethReserve: bigint;

      if (token0Address.toLowerCase() === this.wethAddress) {
        wethReserve = reserve0;
        tokenReserve = reserve1;
      } else {
        wethReserve = reserve1;
        tokenReserve = reserve0;
      }

      // Get token config to determine decimals
      const tokenConfig = getTokenConfig(normalizedAddress);
      if (!tokenConfig) {
        console.log(`  ⚠️  Token ${tokenAddress} not in config`);
        return null;
      }

      // Calculate price: priceInEth = wethReserve / tokenReserve
      // We need to handle different decimals - WETH has 18, but tokens might have 6 or 18
      const wethAmount = Number(ethers.formatEther(wethReserve));
      const tokenAmount = Number(ethers.formatUnits(tokenReserve, tokenConfig.decimals));

      const priceInEth = wethAmount / tokenAmount;

      console.log(`  📊 Fetched price for ${tokenAddress}:`);
      console.log(`     Pair: ${pairAddress}`);
      console.log(`     WETH Reserve: ${wethAmount.toFixed(4)} WETH`);
      console.log(`     Token Reserve: ${tokenAmount.toFixed(4)} tokens`);
      console.log(`     Price: ${priceInEth.toFixed(8)} ETH`);

      // Cache the price
      this.priceCache.set(normalizedAddress, {
        price: priceInEth,
        timestamp: Date.now(),
      });

      return priceInEth;
    } catch (error) {
      console.error(`  ❌ Error fetching price for ${tokenAddress}:`, error);
      return null;
    }
  }

  /**
   * Get prices for multiple tokens in parallel
   */
  async getTokenPrices(tokenAddresses: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();

    const results = await Promise.allSettled(
      tokenAddresses.map(async (address) => {
        const price = await this.getTokenPriceInEth(address);
        return { address: address.toLowerCase(), price };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.price !== null) {
        prices.set(result.value.address, result.value.price);
      }
    }

    return prices;
  }

  /**
   * Clear the price cache
   */
  clearCache(): void {
    this.priceCache.clear();
  }
}
