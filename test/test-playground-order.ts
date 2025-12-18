#!/usr/bin/env npx ts-node
/**
 * CoW Protocol Offline Mode - Parameterized Order Test
 *
 * This script tests placing and settling orders in the offline mode environment.
 * It supports specifying sell/buy tokens, amounts, and trader credentials.
 *
 * Usage:
 *   npx ts-node test/test-playground-order.ts --sellToken GNO --buyToken WETH --sellAmount 10e18 --from <PRIVATE_KEY>
 *   npx ts-node test/test-playground-order.ts --sellToken USDC --buyToken DAI --buyAmount 100e18 --from <PRIVATE_KEY>
 *
 * Run with npm:
 *   npm run test:order -- --sellToken GNO --buyToken WETH --sellAmount 10e18 --from <PRIVATE_KEY>
 */

import { ethers } from 'ethers';
import * as path from 'path';
import { loadAddresses } from './utils/loadAddresses';

// Configuration
const CONFIG = {
  host: 'localhost:8080',
  rpcUrl: 'http://localhost:8545',
  orderbookUrl: 'http://localhost:8080',
  chainId: 1,
};

// Token decimals mapping
const TOKEN_DECIMALS: Record<string, number> = {
  WETH: 18,
  DAI: 18,
  GNO: 18,
  USDC: 6,
  USDT: 6,
};

// Load deployed addresses from .env.offline
const addresses = loadAddresses();

// EIP-712 Type definitions for CoW Protocol orders
const ORDER_TYPE_FIELDS = [
  { name: 'sellToken', type: 'address' },
  { name: 'buyToken', type: 'address' },
  { name: 'receiver', type: 'address' },
  { name: 'sellAmount', type: 'uint256' },
  { name: 'buyAmount', type: 'uint256' },
  { name: 'validTo', type: 'uint32' },
  { name: 'appData', type: 'bytes32' },
  { name: 'feeAmount', type: 'uint256' },
  { name: 'kind', type: 'string' },
  { name: 'partiallyFillable', type: 'bool' },
  { name: 'sellTokenBalance', type: 'string' },
  { name: 'buyTokenBalance', type: 'string' },
];

// ERC20 ABI (minimal)
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function mint(address to, uint256 amount) returns (bool)',
  'function deposit() payable',
];

// Settlement contract ABI (minimal)
const SETTLEMENT_ABI = [
  'function domainSeparator() view returns (bytes32)',
];

interface ParsedArgs {
  sellToken: string;
  buyToken: string;
  sellAmount?: string;
  buyAmount?: string;
  from: string;
  surplusPercent?: number;
}

function printUsage(): void {
  console.log(`
Usage: npx ts-node test/test-playground-order.ts [options]

Options:
  --sellToken <TOKEN>       Token to sell (WETH, USDC, DAI, USDT, or GNO)
  --buyToken <TOKEN>        Token to buy (WETH, USDC, DAI, USDT, or GNO)
  --sellAmount <AMOUNT>     Amount to sell (e.g., 10e18, 1000e6) - mutually exclusive with --buyAmount
  --buyAmount <AMOUNT>      Amount to buy (e.g., 10e18, 1000e6) - mutually exclusive with --sellAmount
  --from <PRIVATE_KEY>      Trader private key (will be used as sender and receiver)
  --surplus <PERCENT>       Surplus percentage to add (e.g., 2 for 2% surplus, default: 2)
  -h, --help                Show this help message

Examples:
  npx ts-node test/test-playground-order.ts --sellToken GNO --buyToken WETH --sellAmount 10e18 --from 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
  npx ts-node test/test-playground-order.ts --sellToken USDC --buyToken DAI --buyAmount 100e18 --surplus 5 --from 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
`);
  process.exit(1);
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const parsed: Partial<ParsedArgs> = {
    surplusPercent: 2, // Default 2% surplus
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--sellToken':
        parsed.sellToken = args[++i];
        break;
      case '--buyToken':
        parsed.buyToken = args[++i];
        break;
      case '--sellAmount':
        parsed.sellAmount = args[++i];
        break;
      case '--buyAmount':
        parsed.buyAmount = args[++i];
        break;
      case '--from':
        parsed.from = args[++i];
        break;
      case '--surplus':
        parsed.surplusPercent = parseFloat(args[++i]);
        break;
      case '-h':
      case '--help':
        printUsage();
        break;
      default:
        console.error(`Unknown parameter: ${args[i]}`);
        printUsage();
    }
  }

  // Validate required parameters
  if (!parsed.sellToken || !parsed.buyToken || !parsed.from) {
    console.error('Error: Missing required parameters');
    printUsage();
  }

  // Validate mutually exclusive sell/buy amount
  if (parsed.sellAmount && parsed.buyAmount) {
    console.error('Error: Cannot specify both --sellAmount and --buyAmount');
    printUsage();
  }

  if (!parsed.sellAmount && !parsed.buyAmount) {
    console.error('Error: Must specify either --sellAmount or --buyAmount');
    printUsage();
  }

  // Validate private key format
  if (!parsed.from?.startsWith('0x') || parsed.from.length !== 66) {
    console.error('Error: Please provide a valid private key (0x... 66 characters)');
    process.exit(1);
  }

  return parsed as ParsedArgs;
}

function getTokenAddress(symbol: string): string {
  const address = addresses.tokens[symbol as keyof typeof addresses.tokens];
  if (!address) {
    console.error(`Error: Token ${symbol} not found in .env.offline`);
    console.error(`Available tokens: ${Object.keys(addresses.tokens).join(', ')}`);
    process.exit(1);
  }
  return address;
}

function getTokenDecimals(symbol: string): number {
  const decimals = TOKEN_DECIMALS[symbol];
  if (decimals === undefined) {
    console.error(`Error: Unknown token ${symbol}`);
    process.exit(1);
  }
  return decimals;
}

function parseAmount(amount: string): bigint {
  // Handle scientific notation like 10e18, 1000e6
  if (amount.includes('e')) {
    const [base, exp] = amount.split('e');
    const baseNum = parseFloat(base);
    const expNum = parseInt(exp);
    return BigInt(Math.floor(baseNum * Math.pow(10, expNum)));
  }
  return BigInt(amount);
}

function formatBalance(balance: bigint, decimals: number): string {
  if (decimals === 18) {
    return ethers.formatEther(balance);
  }
  return (Number(balance) / Math.pow(10, decimals)).toFixed(2);
}

async function waitForServices(): Promise<void> {
  console.log('Waiting for services to be ready...');
  const maxRetries = 24;
  const retryDelay = 5000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`http://${CONFIG.host}/api/v1/version`);
      if (response.ok) {
        console.log('Services ready!');
        return;
      }
    } catch {
      // Service not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }

  console.error('Error: Services did not become ready in time');
  process.exit(1);
}

async function setupTokenBalance(
  wallet: ethers.Wallet,
  tokenSymbol: string,
  tokenAddress: string,
  amount: bigint
): Promise<void> {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

  if (tokenSymbol === 'WETH') {
    // Deposit ETH to get WETH
    const tx = await token.deposit({ value: amount });
    await tx.wait();
  } else {
    // Mint ERC20 tokens
    const tx = await token.mint(wallet.address, amount);
    await tx.wait();
  }
}

async function checkOrderStatus(orderUid: string): Promise<string> {
  try {
    const response = await fetch(`http://${CONFIG.host}/api/v1/orders/${orderUid}`);
    if (!response.ok) return 'unknown';
    const data = await response.json() as any;
    return data.status || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function main() {
  const args = parseArgs();

  console.log('Testing CoW Protocol Offline Mode - Parameterized Order');
  console.log('===========================================================\n');

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(args.from, provider);
  const traderAddress = await wallet.getAddress();

  // Get token addresses and decimals
  const sellTokenAddress = getTokenAddress(args.sellToken);
  const buyTokenAddress = getTokenAddress(args.buyToken);
  const sellTokenDecimals = getTokenDecimals(args.sellToken);
  const buyTokenDecimals = getTokenDecimals(args.buyToken);

  // Get contract addresses
  const settlementAddress = addresses.cowProtocol.settlement;
  const vaultRelayerAddress = addresses.cowProtocol.vaultRelayer;

  console.log('Configuration:');
  console.log(`  Trader: ${traderAddress}`);
  console.log(`  Sell: ${args.sellToken} (${sellTokenAddress}) - ${sellTokenDecimals} decimals`);
  console.log(`  Buy: ${args.buyToken} (${buyTokenAddress}) - ${buyTokenDecimals} decimals`);
  console.log(`  Settlement: ${settlementAddress}`);
  console.log('');

  // Wait for services
  await waitForServices();
  console.log('');

  // Setup trader with tokens
  console.log('Setting up trader with tokens...');

  const sellToken = new ethers.Contract(sellTokenAddress, ERC20_ABI, wallet);
  const buyToken = new ethers.Contract(buyTokenAddress, ERC20_ABI, provider);

  let setupAmount: bigint;
  if (args.sellAmount) {
    const parsedSellAmount = parseAmount(args.sellAmount);
    setupAmount = parsedSellAmount * 2n; // Add buffer
  } else {
    const parsedBuyAmount = parseAmount(args.buyAmount!);
    setupAmount = parsedBuyAmount * 10n; // Estimate: assume 1:1 ratio with buffer
  }

  await setupTokenBalance(wallet, args.sellToken, sellTokenAddress, setupAmount);

  // Approve vault relayer
  const approveTx = await sellToken.approve(vaultRelayerAddress, ethers.parseEther('1000000'));
  await approveTx.wait();

  // Check balance
  const balance = await sellToken.balanceOf(traderAddress);
  console.log(`  Trader has ${formatBalance(balance, sellTokenDecimals)} ${args.sellToken}`);
  console.log('');

  // Determine order kind and amount
  const orderKind = args.sellAmount ? 'sell' : 'buy';
  const amountField = args.sellAmount ? 'sellAmountBeforeFee' : 'buyAmountAfterFee';
  const amountValue = args.sellAmount ? parseAmount(args.sellAmount) : parseAmount(args.buyAmount!);

  if (args.sellAmount) {
    console.log(`Creating order: Sell ${args.sellAmount} ${args.sellToken} for ${args.buyToken}`);
  } else {
    console.log(`Creating order: Buy ${args.buyAmount} ${args.buyToken} with ${args.sellToken}`);
  }
  console.log('');

  // Get quote from API
  console.log('Getting quote from orderbook...');

  const quoteRequest = {
    sellToken: sellTokenAddress,
    buyToken: buyTokenAddress,
    receiver: traderAddress,
    [amountField]: amountValue.toString(),
    kind: orderKind,
    from: traderAddress,
  };

  const quoteResponse = await fetch(`http://${CONFIG.host}/api/v1/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quoteRequest),
  });

  if (!quoteResponse.ok) {
    const errorText = await quoteResponse.text();
    console.error('Quote request failed:');
    console.error(errorText);
    process.exit(1);
  }

  const quote = await quoteResponse.json() as any;

  if (quote.errorType) {
    console.error('Quote request failed:');
    console.error(JSON.stringify(quote, null, 2));
    process.exit(1);
  }

  const quoteSellAmount = quote.quote.sellAmount;
  const quoteBuyAmount = quote.quote.buyAmount;
  const validTo = quote.quote.validTo;
  const appDataHash = quote.quote.appData;

  // Apply surplus by reducing the buy amount (willing to accept less)
  // This creates surplus opportunity for the solver
  const surplusMultiplier = 1 - (args.surplusPercent! / 100);
  const adjustedBuyAmount = (BigInt(quoteBuyAmount) * BigInt(Math.floor(surplusMultiplier * 10000)) / 10000n).toString();

  console.log('  Quote received:');
  console.log(`    Sell amount: ${formatBalance(BigInt(quoteSellAmount), sellTokenDecimals)} ${args.sellToken}`);
  console.log(`    Buy amount (from quote): ${formatBalance(BigInt(quoteBuyAmount), buyTokenDecimals)} ${args.buyToken}`);
  console.log(`    Buy amount (with ${args.surplusPercent}% surplus): ${formatBalance(BigInt(adjustedBuyAmount), buyTokenDecimals)} ${args.buyToken}`);
  console.log(`    Potential surplus: ${formatBalance(BigInt(quoteBuyAmount) - BigInt(adjustedBuyAmount), buyTokenDecimals)} ${args.buyToken}`);
  console.log(`    Valid until: ${validTo}`);
  console.log('');

  // Sign order with EIP-712
  console.log('Signing order...');

  const order = {
    sellToken: sellTokenAddress,
    buyToken: buyTokenAddress,
    receiver: traderAddress,
    sellAmount: quoteSellAmount,
    buyAmount: adjustedBuyAmount, // Use adjusted amount to create surplus
    validTo: validTo,
    appData: appDataHash,
    feeAmount: '0', // Fee must be zero - fee is now included in sell amount
    kind: orderKind,
    partiallyFillable: false,
    sellTokenBalance: 'erc20',
    buyTokenBalance: 'erc20',
  };

  // EIP-712 domain
  const domain = {
    name: 'Gnosis Protocol',
    version: 'v2',
    chainId: CONFIG.chainId,
    verifyingContract: settlementAddress,
  };

  const types = {
    Order: ORDER_TYPE_FIELDS,
  };

  const signature = await wallet.signTypedData(domain, types, order);
  console.log(`  Signature: ${signature.substring(0, 20)}...`);
  console.log('');

  // Post order
  console.log('Posting order...');

  const orderCreation = {
    sellToken: order.sellToken,
    buyToken: order.buyToken,
    receiver: order.receiver,
    sellAmount: order.sellAmount,
    buyAmount: order.buyAmount,
    validTo: order.validTo,
    appData: order.appData,
    feeAmount: '0', // Fee must be zero - fee is now included in sell amount
    kind: order.kind,
    partiallyFillable: order.partiallyFillable,
    sellTokenBalance: order.sellTokenBalance,
    buyTokenBalance: order.buyTokenBalance,
    signingScheme: 'eip712',
    signature: signature,
    from: traderAddress,
  };

  const orderResponse = await fetch(`http://${CONFIG.host}/api/v1/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderCreation),
  });

  if (!orderResponse.ok) {
    const errorText = await orderResponse.text();
    console.error('Failed to post order:');
    console.error(errorText);
    process.exit(1);
  }

  const orderUid = (await orderResponse.text()).replace(/"/g, '');
  console.log(`  Order UID: ${orderUid.substring(0, 20)}...`);
  console.log('');

  // Wait for order to be settled
  console.log('Waiting for order to be settled...');
  console.log('   (Checking every 5 seconds for up to 2 minutes)');
  console.log('');

  const maxWait = 120;
  let elapsed = 0;
  let settlementFound = false;

  while (elapsed < maxWait) {
    const status = await checkOrderStatus(orderUid);
    console.log(`  [${elapsed} s] Order status: ${status}`);

    if (status === 'fulfilled' || status === 'traded') {
      settlementFound = true;
      console.log('\nOrder settled successfully!');
      break;
    }

    if (status === 'cancelled' || status === 'expired') {
      console.error(`\nOrder ${status}`);
      process.exit(1);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
    elapsed += 5;
  }

  if (!settlementFound) {
    console.error(`\nERROR: Order was not settled within ${maxWait} seconds`);
    const finalStatus = await checkOrderStatus(orderUid);
    console.error(`Final status: ${finalStatus}`);
    process.exit(1);
  }

  console.log('');
  console.log('Checking final balances...');
  console.log('');

  // Check final balances
  const finalSellBalance = await sellToken.balanceOf(traderAddress);
  const finalBuyBalance = await buyToken.balanceOf(traderAddress);

  console.log('Trader final balances:');
  console.log(`  ${args.sellToken}: ${formatBalance(finalSellBalance, sellTokenDecimals)}`);
  console.log(`  ${args.buyToken}: ${formatBalance(finalBuyBalance, buyTokenDecimals)}`);
  console.log('');

  // Verify trader received buy tokens
  if (finalBuyBalance > 0n) {
    console.log('Trade executed successfully!');
  } else {
    console.error('Trade did not execute as expected');
    console.error(`   Buy token balance: ${finalBuyBalance}`);
    process.exit(1);
  }

  console.log('');
  console.log('TEST PASSED - Order settled successfully!');
  console.log('===========================================');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
