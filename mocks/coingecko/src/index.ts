import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { getSupportedTokens, isTokenSupported } from './tokens.config';
import { UniswapPriceFetcher } from './uniswap-price-fetcher';

// Initialize Uniswap price fetcher
const priceFetcher = new UniswapPriceFetcher({
  rpcUrl: process.env.ETH_RPC_URL || process.env.NODE_URL || 'http://chain:8545',
  factoryAddress: process.env.UNISWAP_V2_FACTORY_ADDRESS || '0x75bb62d11fc5aa893827203d977e0931d269580d',
  wethAddress: process.env.WETH_ADDRESS || '0x923f26d85d25c0abb51d643f105dca62b13374c2',
});

const app = new Hono();

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'coingecko-mock',
    timestamp: new Date().toISOString(),
  });
});

// List all supported tokens
app.get('/api/v3/tokens', (c) => {
  return c.json({
    supported_tokens: getSupportedTokens(),
  });
});

/**
 * Mock Coingecko API endpoint: /api/v3/simple/token_price/:platform
 *
 * Query parameters:
 * - contract_addresses: Comma-separated list of token contract addresses
 * - vs_currencies: Currency to price against (e.g., "eth")
 * - precision: Number precision (e.g., "full")
 *
 * Example:
 * GET /api/v3/simple/token_price/ethereum?contract_addresses=0xabc,0xdef&vs_currencies=eth&precision=full
 */
app.get('/api/v3/simple/token_price/:platform', async (c) => {
  const platform = c.req.param('platform');
  const contractAddresses = c.req.query('contract_addresses');
  const vsCurrencies = c.req.query('vs_currencies');
  const precision = c.req.query('precision');

  // Log the request for debugging
  console.log(`[${new Date().toISOString()}] GET /api/v3/simple/token_price/${platform}`);
  console.log(`  contract_addresses: ${contractAddresses}`);
  console.log(`  vs_currencies: ${vsCurrencies}`);
  console.log(`  precision: ${precision}`);

  // Validate required parameters
  if (!contractAddresses) {
    return c.json(
      {
        error: 'contract_addresses parameter is required',
      },
      400
    );
  }

  if (!vsCurrencies) {
    return c.json(
      {
        error: 'vs_currencies parameter is required',
      },
      400
    );
  }

  // Only support Ethereum platform in offline mode
  if (platform !== 'ethereum') {
    return c.json(
      {
        error: `Platform "${platform}" is not supported in offline mode. Only "ethereum" is supported.`,
      },
      400
    );
  }

  // Only support ETH as the denomination currency
  if (vsCurrencies !== 'eth') {
    return c.json(
      {
        error: `Currency "${vsCurrencies}" is not supported. Only "eth" is supported in offline mode.`,
      },
      400
    );
  }

  // Parse contract addresses
  const addresses = contractAddresses.split(',').map((addr) => addr.trim().toLowerCase());

  // Filter only supported tokens
  const supportedAddresses = addresses.filter(isTokenSupported);
  const unsupportedAddresses = addresses.filter((addr) => !isTokenSupported(addr));

  // Fetch prices from Uniswap
  const prices = await priceFetcher.getTokenPrices(supportedAddresses);

  // Build response object matching Coingecko's format
  const response: Record<string, { eth: number } | {}> = {};

  for (const address of addresses) {
    const price = prices.get(address);

    if (price !== undefined) {
      // Token is supported and price was fetched
      response[address] = {
        eth: price,
      };
      console.log(`  ✓ ${address}: ${price} ETH`);
    } else {
      // Token not supported or price couldn't be fetched, return empty object (Coingecko behavior)
      response[address] = {};
      console.log(`  ✗ ${address}: not available`);
    }
  }

  console.log('');
  return c.json(response);
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: `Endpoint ${c.req.path} not found`,
      hint: 'This is a mock Coingecko API. Only /api/v3/simple/token_price/:platform is supported.',
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error(`[ERROR] ${err.message}`);
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message,
    },
    500
  );
});

// Start server
const port = parseInt(process.env.PORT || '3000', 10);

console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   🦎 Coingecko Mock API - Offline Mode           ║
║                                                   ║
║   Port: ${port.toString().padEnd(43, ' ')}║
║   Platform: ethereum                              ║
║   Currency: eth                                   ║
║                                                   ║
║   Endpoints:                                      ║
║   - GET /health                                   ║
║   - GET /api/v3/tokens                            ║
║   - GET /api/v3/simple/token_price/ethereum       ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
`);

serve({
  fetch: app.fetch,
  port,
});
