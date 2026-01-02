#!/usr/bin/env npx ts-node
/**
 * ComposableCow TWAP Integration Test Script
 *
 * This script demonstrates creating and settling a TWAP (Time-Weighted Average Price) order
 * using CoW Protocol's ComposableCow conditional orders framework.
 *
 * TWAP Order Flow:
 * - User creates 1 TWAP order to sell 30 DAI for WETH
 * - Order is split into 3 parts (10 DAI each) with 5 minutes between parts
 * - Each part is valid for 5 minutes (300 seconds)
 * - Order starts 10 seconds after creation
 * - The order is registered in ComposableCoW contract
 * - Watchtower monitors and posts each part to the orderbook when ready
 * - Each part gets settled individually through CoW Protocol
 *
 * Run with: npm run test:composable-cow:twap
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const CONFIG = {
  rpcUrl: 'http://localhost:8545',
  orderbookUrl: 'http://localhost:8080',
  chainId: 1, // Mainnet chain ID
  // Anvil's second test account
  privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
};

// Contract addresses from environment
const ADDRESSES = {
  settlement: process.env.SETTLEMENT_CONTRACT_ADDRESS!,
  vaultRelayer: process.env.VAULT_RELAYER_ADDRESS!,
  composableCoW: process.env.COMPOSABLE_COW_ADDRESS!,
  twap: process.env.TWAP_ADDRESS!,
  cowShedFactory: process.env.COWSHED_COMPOSABLE_COW_FACTORY_ADDRESS!,
  safeWallet: process.env.TEST_USER_SAFE_ADDRESS!, // Safe wallet for ComposableCoW orders
  extensibleFallbackHandler: process.env.EXTENSIBLE_FALLBACK_HANDLER_ADDRESS!,
  dai: process.env.DAI_ADDRESS!,
  weth: process.env.WETH_ADDRESS!,
  usdc: process.env.USDC_ADDRESS!,
};

// ERC20 ABI (minimal)
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

// ComposableCoW ABI (minimal)
const COMPOSABLE_COW_ABI = [
  'function create(tuple(address handler, bytes32 salt, bytes staticInput) params, bool dispatch)',
  'event ConditionalOrderCreated(address indexed owner, tuple(address handler, bytes32 salt, bytes staticInput) params)',
];

// CoWShed Factory ABI (minimal)
const COWSHED_FACTORY_ABI = [
  'function proxyOf(address owner) view returns (address)',
  'function initializeProxy(address user)',
  'function executeHooks(tuple(address target, uint256 value, bytes callData, bool allowFailure, bool isDelegateCall)[] calls, bytes32 nonce, uint256 deadline, address user, bytes signature)',
];

// COWShed Proxy ABI (minimal)
const COWSHED_PROXY_ABI = [
  'function executeHooks(tuple(address target, uint256 value, bytes callData)[] calls, bytes32 nonce, uint256 deadline, bytes signature)',
  'function nonces(bytes32 nonce) view returns (bool)',
  'function domainSeparator() view returns (bytes32)',
];

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

/**
 * TWAP Data Structure (from ComposableCow)
 * struct Data {
 *     IERC20 sellToken;
 *     IERC20 buyToken;
 *     address receiver;
 *     uint256 partSellAmount;  // Amount to sell in each part
 *     uint256 minPartLimit;     // Minimum to receive in each part
 *     uint256 t0;               // Start time
 *     uint256 n;                // Number of parts (MUST be >= 2 for TWAP)
 *     uint256 t;                // Time interval between parts in seconds
 *     uint256 span;             // Duration each part is valid (0 = AUTO mode)
 *     bytes32 appData;
 * }
 *
 * Note: We create 3 separate TWAP orders with different total amounts (8, 10, 12 DAI).
 * Each order has n=2 (2 parts) with 20 seconds between parts.
 * TWAP orders require n >= 2 (at least 2 parts).
 */

async function main() {
  console.log('🐮 ComposableCow TWAP Integration Test');
  console.log('=========================================\n');

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);
  const userAddress = await wallet.getAddress();

  console.log(`📋 Configuration:`);
  console.log(`   Chain ID: ${CONFIG.chainId}`);
  console.log(`   User EOA (Order Owner): ${userAddress}`);
  console.log(`   Safe Wallet (Order Owner & Receiver): ${ADDRESSES.safeWallet}`);
  console.log(`   Settlement: ${ADDRESSES.settlement}`);
  console.log(`   Vault Relayer: ${ADDRESSES.vaultRelayer}`);
  console.log(`   ComposableCoW: ${ADDRESSES.composableCoW}`);
  console.log(`   TWAP Handler: ${ADDRESSES.twap}`);
  console.log('');

  // Get contracts
  const dai = new ethers.Contract(ADDRESSES.dai, ERC20_ABI, wallet);
  const weth = new ethers.Contract(ADDRESSES.weth, ERC20_ABI, provider);

  // Step 1: Setup Safe wallet with DAI
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 1: Setup Safe Wallet with DAI');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // We'll create 1 TWAP order with 3 parts
  const orderAmounts = [
    ethers.parseEther('30'),  // Order 1: 30 DAI (split into 3 parts of 10 DAI each)
  ];
  const totalSellAmount = orderAmounts.reduce((sum, amount) => sum + amount, 0n); // 30 DAI total

  let daiBalance = await dai.balanceOf(ADDRESSES.safeWallet);
  console.log(`   Safe Wallet DAI Balance: ${ethers.formatEther(daiBalance)} DAI`);

  // If Safe doesn't have enough DAI, send it from account #0
  if (daiBalance < totalSellAmount) {
    console.log(`   Need ${ethers.formatEther(totalSellAmount)} DAI but only have ${ethers.formatEther(daiBalance)}`);
    console.log('   Sending DAI to Safe from Anvil account #0...');

    const account0PrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const account0Wallet = new ethers.Wallet(account0PrivateKey, provider);
    const daiFromAccount0 = new ethers.Contract(ADDRESSES.dai, ERC20_ABI, account0Wallet);

    const transferAmount = ethers.parseEther('100');
    const transferTx = await daiFromAccount0.transfer(ADDRESSES.safeWallet, transferAmount);
    await transferTx.wait();

    daiBalance = await dai.balanceOf(ADDRESSES.safeWallet);
    console.log(`   ✅ Sent DAI to Safe. New balance: ${ethers.formatEther(daiBalance)} DAI`);
  }

  // Approve VaultRelayer to spend DAI from Safe wallet (total amount for all parts)
  const daiAllowance = await dai.allowance(ADDRESSES.safeWallet, ADDRESSES.vaultRelayer);
  console.log(`   Safe DAI Allowance for Vault Relayer: ${ethers.formatEther(daiAllowance)} DAI`);

  if (daiAllowance < totalSellAmount) {
    console.log('   Approving Vault Relayer to spend DAI from Safe...');

    // Send ETH to Safe for gas first
    const fundSafeTx = await wallet.sendTransaction({
      to: ADDRESSES.safeWallet,
      value: ethers.parseEther('1'),
    });
    await fundSafeTx.wait();

    // Impersonate Safe to approve
    await provider.send('anvil_impersonateAccount', [ADDRESSES.safeWallet]);
    const safeSigner = await provider.getSigner(ADDRESSES.safeWallet);
    const daiAsSafe = new ethers.Contract(ADDRESSES.dai, ERC20_ABI, safeSigner);

    const approveTx = await daiAsSafe.approve(ADDRESSES.vaultRelayer, ethers.parseEther('1000000'));
    await approveTx.wait();
    await provider.send('anvil_stopImpersonatingAccount', [ADDRESSES.safeWallet]);

    console.log('   ✅ Approved');
  }
  console.log('');

  // Step 1.5: Configure ComposableCoW as domain verifier on Safe
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 1.5: Configure ComposableCoW Domain Verifier');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Get Settlement contract domain separator (orders are settled through this contract)
  const settlementDomainSeparator = await provider.call({
    to: ADDRESSES.settlement,
    data: '0xf698da25', // domainSeparator()
  });

  console.log(`   Settlement Domain Separator: ${settlementDomainSeparator}`);
  console.log(`   Extensible Fallback Handler: ${ADDRESSES.extensibleFallbackHandler}`);
  console.log('');

  // Call setDomainVerifier on the Safe to register ComposableCoW
  // This allows the Safe to validate signatures for orders created by ComposableCoW
  console.log('   Setting ComposableCoW as domain verifier on Safe...');

  await provider.send('anvil_impersonateAccount', [ADDRESSES.safeWallet]);
  const safeSigner = await provider.getSigner(ADDRESSES.safeWallet);

  // Encode setDomainVerifier call
  const setDomainVerifierData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'address'],
    [settlementDomainSeparator, ADDRESSES.composableCoW]
  );

  // Call setDomainVerifier on the Safe (it will delegate to the fallback handler)
  const setVerifierTx = await safeSigner.sendTransaction({
    to: ADDRESSES.safeWallet, // Call on the Safe itself
    data: '0x3365582c' + setDomainVerifierData.slice(2), // setDomainVerifier(bytes32,address)
  });
  await setVerifierTx.wait();
  await provider.send('anvil_stopImpersonatingAccount', [ADDRESSES.safeWallet]);

  console.log('   ✅ ComposableCoW configured as domain verifier');
  console.log('');

  // Step 2: Create TWAP Order Parameters
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 2: Create TWAP Order Parameters');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const currentBlock = await provider.getBlock('latest');
  if (!currentBlock) throw new Error('Could not get current block');
  const currentTime = currentBlock.timestamp;

  // Create 1 TWAP order with 3 parts
  // Each part has 5 minutes (300s) between them
  // span=300 means each part is valid for 5 minutes (span must be ≤ t)
  // TWAP requires at least 2 parts (n >= 2)
  // minPartLimit is proportional to the PART sell amount (not total)
  const twapConfigs = orderAmounts.map((amount, index) => {
    const minWethPerDai = 0.00027; // Below market rate (0.000333 for 3000 DAI/WETH) to ensure solver profit
    const numParts = 3n; // Split order into 3 parts
    const partSellAmount = amount / numParts;
    const partDaiAmount = Number(ethers.formatEther(partSellAmount));
    const minPartLimit = ethers.parseEther((partDaiAmount * minWethPerDai).toFixed(18));

    return {
      sellToken: ADDRESSES.dai,
      buyToken: ADDRESSES.weth,
      receiver: ADDRESSES.safeWallet, // WETH goes to Safe wallet
      partSellAmount: partSellAmount.toString(), // Each part is 1/3 of total
      minPartLimit: minPartLimit.toString(), // Proportional minimum WETH per part
      t0: currentTime + 10, // Start 10 seconds from now
      n: 3, // 3 parts total
      t: 300, // 5 minutes (300 seconds) between parts
      span: 300, // Each part is valid for 5 minutes (must be ≤ t)
      appData: ethers.ZeroHash,
    };
  });

  console.log('   TWAP Order Configuration:');
  console.log(`   Sell Token: DAI (${ADDRESSES.dai})`);
  console.log(`   Buy Token: WETH (${ADDRESSES.weth})`);
  console.log(`   Total Amount: ${ethers.formatEther(totalSellAmount)} DAI`);
  console.log('');
  twapConfigs.forEach((config) => {
    const totalPerOrder = BigInt(config.partSellAmount) * BigInt(config.n);
    console.log(`   Total: ${ethers.formatEther(totalPerOrder)} DAI (${config.n} parts of ${ethers.formatEther(config.partSellAmount)} DAI each)`);
    console.log(`   Min per Part: ${ethers.formatEther(config.minPartLimit)} WETH`);
    console.log(`   Start Time: ${new Date(config.t0 * 1000).toISOString()} (${config.t0})`);
    console.log(`   Interval: ${config.t} seconds between parts`);
    console.log(`   Span: ${config.span === 0 ? 'AUTO (handler calculates validity)' : `${config.span} seconds (${Math.floor(config.span / 60)} minutes)`}`);
  });
  console.log('');

  // Step 3: Encode TWAP Data and Create Conditional Orders
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 3: Create Conditional Orders in ComposableCoW');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Send some ETH to the Safe for gas (before impersonating)
  const fundTx = await wallet.sendTransaction({
    to: ADDRESSES.safeWallet,
    value: ethers.parseEther('1'),
  });
  await fundTx.wait();

  // Store order hashes for debugging
  const createdOrderHashes: string[] = [];

  // Create TWAP order
  for (let i = 0; i < twapConfigs.length; i++) {
    const twapConfig = twapConfigs[i];

    const totalPerOrder = BigInt(twapConfig.partSellAmount) * BigInt(twapConfig.n);
    console.log(`   Creating conditional order...`);
    console.log(`   Total: ${ethers.formatEther(totalPerOrder)} DAI (${twapConfig.n} parts × ${ethers.formatEther(twapConfig.partSellAmount)} DAI)`);
    console.log(`   Min per Part: ${ethers.formatEther(twapConfig.minPartLimit)} WETH`);
    console.log(`   Interval: ${twapConfig.t}s between parts`);
    console.log(`   Start Time (t0): ${twapConfig.t0}`);
    console.log(`   Current Time: ${currentTime}`);
    console.log(`   Time until start: ${twapConfig.t0 - currentTime}s`);

    // ABI encode the TWAP data struct
    const twapDataEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes32'],
      [
        twapConfig.sellToken,
        twapConfig.buyToken,
        twapConfig.receiver,
        twapConfig.partSellAmount,
        twapConfig.minPartLimit,
        twapConfig.t0,
        twapConfig.n,
        twapConfig.t,
        twapConfig.span,
        twapConfig.appData,
      ]
    );

    // Create conditional order params with unique salt for each order
    const salt = ethers.randomBytes(32);
    const conditionalOrderParams = {
      handler: ADDRESSES.twap,
      salt: ethers.hexlify(salt),
      staticInput: twapDataEncoded,
    };

    // Calculate order hash
    const orderHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'bytes32', 'bytes'],
        [ADDRESSES.safeWallet, conditionalOrderParams.handler, conditionalOrderParams.salt, conditionalOrderParams.staticInput]
      )
    );
    createdOrderHashes.push(orderHash);

    try {
      // Impersonate the Safe wallet so it becomes msg.sender
      await provider.send('anvil_impersonateAccount', [ADDRESSES.safeWallet]);

      // Get a signer for the Safe wallet
      const safeSigner = await provider.getSigner(ADDRESSES.safeWallet);
      const composableCoWAsSafe = new ethers.Contract(
        ADDRESSES.composableCoW,
        COMPOSABLE_COW_ABI,
        safeSigner
      );

      // Create the order from the Safe wallet (makes Safe the owner)
      const createTx = await composableCoWAsSafe.create(conditionalOrderParams, true);
      const receipt = await createTx.wait();
      console.log(`   ✅ Order created in block ${receipt?.blockNumber}`);
      console.log(`   Order Hash: ${orderHash}`);
      console.log('');

      // Stop impersonating
      await provider.send('anvil_stopImpersonatingAccount', [ADDRESSES.safeWallet]);
    } catch (error: any) {
      console.error(`   ❌ Failed to create conditional order:`);
      console.error(`   Error: ${error.message}`);
      if (error.data) {
        console.error(`   Data: ${error.data}`);
      }
      // Make sure to stop impersonating even on error
      try {
        await provider.send('anvil_stopImpersonatingAccount', [ADDRESSES.safeWallet]);
      } catch {}
      return;
    }
  }

  console.log('');
  console.log(`   ✅ Conditional order created successfully`);
  console.log(`   ℹ️  Order owner: ${ADDRESSES.safeWallet} (Safe Wallet)`);
  console.log('');
  console.log('   📋 Order Hash (for debugging):');
  createdOrderHashes.forEach((hash) => {
    console.log(`   ${hash}`);
  });
  console.log('');

  // Step 3.5: Check orderbook for orders
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 3.5: Check Orderbook for Posted Orders');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    const orderbookResponse = await fetch(`${CONFIG.orderbookUrl}/api/v1/account/${ADDRESSES.safeWallet}/orders`);
    if (orderbookResponse.ok) {
      const orders = await orderbookResponse.json() as any[];
      console.log(`   Found ${orders.length} order(s) in orderbook for Safe wallet`);
      if (orders.length > 0) {
        orders.forEach((order: any, index: number) => {
          console.log(`   Order ${index + 1}:`);
          console.log(`     UID: ${order.uid}`);
          console.log(`     Status: ${order.status}`);
          console.log(`     Sell: ${ethers.formatUnits(order.sellAmount, 18)} ${order.sellToken === ADDRESSES.dai ? 'DAI' : 'Token'}`);
          console.log(`     Buy: ${ethers.formatUnits(order.buyAmount, 18)} ${order.buyToken === ADDRESSES.weth ? 'WETH' : 'Token'}`);
        });
      }
    } else {
      console.log(`   ⚠️  Could not fetch orders from orderbook (status ${orderbookResponse.status})`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Error fetching orders: ${error.message}`);
  }
  console.log('');

  // Step 4: Monitor for Order Settlement
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 4: Monitor for TWAP Order Execution');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('   Waiting for watchtower to pick up TWAP orders...');
  console.log('   (This may take some time as the watchtower polls periodically)');
  console.log('   (Checking balances every 10 seconds for up to 15 minutes)\n');

  const initialDaiBalance = await dai.balanceOf(ADDRESSES.safeWallet);
  const initialWethBalance = await weth.balanceOf(ADDRESSES.safeWallet);

  console.log('   Initial Safe Wallet Balances:');
  console.log(`   DAI: ${ethers.formatEther(initialDaiBalance)}`);
  console.log(`   WETH: ${ethers.formatEther(initialWethBalance)}`);
  console.log('');

  // We have 1 TWAP order with 3 parts = 3 total discrete orders
  const totalParts = twapConfigs.reduce((sum, config) => sum + config.n, 0);
  let partsExecuted = 0;
  let lastDaiBalance = initialDaiBalance;
  const maxWaitTime = 900; // 15 minutes
  let elapsed = 0;

  console.log(`   Expected: ${totalParts} parts total (${twapConfigs.length} order × ${twapConfigs[0].n} parts each)`);
  console.log('');

  while (elapsed < maxWaitTime && partsExecuted < totalParts) {
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    elapsed += 10;

    const currentDaiBalance = await dai.balanceOf(ADDRESSES.safeWallet);
    const currentWethBalance = await weth.balanceOf(ADDRESSES.safeWallet);

    // Check if DAI balance decreased (order part executed)
    if (currentDaiBalance < lastDaiBalance) {
      partsExecuted++;
      const daiSpent = lastDaiBalance - currentDaiBalance;
      const wethReceived = currentWethBalance - initialWethBalance;

      console.log(`   [${elapsed}s] ✅ Part ${partsExecuted}/${totalParts} executed!`);
      console.log(`   DAI spent in this part: ${ethers.formatEther(daiSpent)}`);
      console.log(`   Total WETH received so far: ${ethers.formatEther(wethReceived)}`);
      console.log('');

      lastDaiBalance = currentDaiBalance;
    } else {
      // Show progress indicator
      if (elapsed % 30 === 0) {
        console.log(`   [${elapsed}s] Waiting... (${partsExecuted}/${totalParts} parts executed)`);
      }
    }
  }

  // Final balance check
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('FINAL RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const finalDaiBalance = await dai.balanceOf(ADDRESSES.safeWallet);
  const finalWethBalance = await weth.balanceOf(ADDRESSES.safeWallet);

  const totalDaiSpent = initialDaiBalance - finalDaiBalance;
  const totalWethReceived = finalWethBalance - initialWethBalance;

  console.log('');
  console.log('   Final Safe Wallet Balances:');
  console.log(`   DAI: ${ethers.formatEther(finalDaiBalance)} (spent ${ethers.formatEther(totalDaiSpent)})`);
  console.log(`   WETH: ${ethers.formatEther(finalWethBalance)} (received ${ethers.formatEther(totalWethReceived)})`);
  console.log('');

  if (partsExecuted > 0) {
    console.log(`   ✅ SUCCESS: ${partsExecuted}/${totalParts} TWAP parts executed!`);
    console.log('');
    console.log('   Summary:');
    console.log(`   - ComposableCow TWAP order created successfully`);
    console.log(`   - Order split into ${twapConfigs[0].n} parts`);
    console.log('   - Watchtower detected and processed TWAP order parts');
    console.log('   - Order settled through CoW Protocol');
    console.log('');

    if (partsExecuted < totalParts) {
      const remainingParts = totalParts - partsExecuted;

      console.log(`   ⚠️  Note: Only ${partsExecuted}/${totalParts} parts executed within timeout.`);
      console.log(`   Remaining ${remainingParts} part(s) will execute according to their schedule.`);
    }
  } else {
    console.log('   ⚠️  No TWAP order parts executed within monitoring period.');
    console.log('');
    console.log('   Possible reasons:');
    console.log('   - Start time (t0) has not been reached yet');
    console.log('   - Watchtower not running or not configured correctly');
    console.log('   - Insufficient liquidity for the trade');
    console.log('   - Order parameters may need adjustment');
    console.log('');
    console.log('   The conditional orders are still active in ComposableCoW');
    console.log('   and should execute when conditions are met.');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(console.error);
