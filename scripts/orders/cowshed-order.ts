/**
 * CoWShed Integration Test Script
 *
 * This script demonstrates the CORRECT use of CoWShed with CoW Protocol:
 * - Assets stay in user EOA (not transferred to proxy)
 * - Order is signed by user EOA using EIP-712
 * - Hooks execute permissioned actions on the CoWShed proxy
 * - Settlement happens from user's balance
 *
 * Key Insight: CoWShed proxies are for executing hooks, NOT for holding trading assets!
 *
 * Run with: npm run test:cowshed
 */

import { ethers } from 'ethers';
import { loadAddresses } from '../../test/utils/loadAddresses';

// Configuration
const CONFIG = {
  rpcUrl: 'http://localhost:8545',
  orderbookUrl: 'http://localhost:8080',
  chainId: 1, // Mainnet chain ID (Anvil is forking mainnet)
  // Anvil's second test account
  privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
};

// Load deployed addresses from .env.offline
const addresses = loadAddresses();

// Contract addresses
const ADDRESSES = {
  settlement: addresses.cowProtocol.settlement,
  vaultRelayer: addresses.cowProtocol.vaultRelayer,
  hooksTrampoline: addresses.cowProtocol.hooksTrampoline,
  cowShedFactory: addresses.cowShed.factory,
  cowShedImplementation: addresses.cowShed.implementation,
  dai: addresses.tokens.DAI,
  weth: addresses.tokens.WETH,
  usdc: addresses.tokens.USDC,
};

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
];

// Settlement contract ABI (minimal)
const SETTLEMENT_ABI = [
  'function domainSeparator() view returns (bytes32)',
];

// CoWShed Factory ABI (minimal)
const COWSHED_FACTORY_ABI = [
  'function proxyOf(address owner) view returns (address)',
  'function implementation() view returns (address)',
];

// Helper to compute appData hash
function computeAppDataHash(appDataContent: object): string {
  const appDataString = JSON.stringify(appDataContent);
  return ethers.keccak256(ethers.toUtf8Bytes(appDataString));
}

async function main() {
  console.log('🐮 CoWShed Integration Test');
  console.log('=========================================\n');

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);
  const userAddress = await wallet.getAddress();

  console.log(`📋 Configuration:`);
  console.log(`   Chain ID: ${CONFIG.chainId}`);
  console.log(`   User EOA: ${userAddress}`);
  console.log(`   Settlement: ${ADDRESSES.settlement}`);
  console.log(`   Vault Relayer: ${ADDRESSES.vaultRelayer}`);
  console.log(`   Hooks Trampoline: ${ADDRESSES.hooksTrampoline}`);
  console.log(`   CoWShed Factory: ${ADDRESSES.cowShedFactory}`);
  console.log('');

  // Get contracts
  const settlement = new ethers.Contract(ADDRESSES.settlement, SETTLEMENT_ABI, provider);
  const cowShedFactory = new ethers.Contract(ADDRESSES.cowShedFactory, COWSHED_FACTORY_ABI, provider);
  const dai = new ethers.Contract(ADDRESSES.dai, ERC20_ABI, wallet);
  const weth = new ethers.Contract(ADDRESSES.weth, ERC20_ABI, provider);

  // Step 1: Get CoWShed proxy address
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 1: Get CoWShed Proxy Address');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const proxyAddress = await cowShedFactory.proxyOf(userAddress);
  console.log(`✅ CoWShed proxy for user: ${proxyAddress}`);

  const proxyCode = await provider.getCode(proxyAddress);
  if (proxyCode === '0x') {
    console.log('ℹ️  Proxy not deployed yet');
    console.log('ℹ️  CoWShed can be used even without deployment - hooks deploy it automatically');
  } else {
    console.log('ℹ️  Proxy already deployed');
  }
  console.log('');

  // Step 2: Ensure user has DAI and approval (assets stay in user EOA!)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 2: Setup User EOA with DAI (NOT proxy!)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const sellAmount = ethers.parseEther('10'); // Sell 10 DAI
  let daiBalance = await dai.balanceOf(userAddress);

  console.log(`   User DAI Balance: ${ethers.formatEther(daiBalance)} DAI`);

  // If we don't have enough DAI, get it from account #0
  if (daiBalance < sellAmount) {
    console.log(`   Need ${ethers.formatEther(sellAmount)} DAI but only have ${ethers.formatEther(daiBalance)}`);
    console.log('   Getting DAI from Anvil account #0...');

    const account0PrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const account0Wallet = new ethers.Wallet(account0PrivateKey, provider);
    const daiFromAccount0 = new ethers.Contract(ADDRESSES.dai, ERC20_ABI, account0Wallet);

    const transferAmount = ethers.parseEther('100');
    const transferTx = await daiFromAccount0.transfer(userAddress, transferAmount);
    await transferTx.wait();

    daiBalance = await dai.balanceOf(userAddress);
    console.log(`   ✅ Received DAI. New balance: ${ethers.formatEther(daiBalance)} DAI`);
  }

  // Approve VaultRelayer to spend DAI from user EOA
  const daiAllowance = await dai.allowance(userAddress, ADDRESSES.vaultRelayer);
  console.log(`   DAI Allowance for Vault Relayer: ${ethers.formatEther(daiAllowance)} DAI`);

  if (daiAllowance < sellAmount) {
    console.log('   Approving Vault Relayer to spend DAI from user EOA...');
    const approveTx = await dai.approve(ADDRESSES.vaultRelayer, ethers.parseEther('1000000'));
    await approveTx.wait();
    console.log('   ✅ Approved');
  }
  console.log('');

  // Step 3: Create hooks that demonstrate CoWShed's purpose
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 3: Create Pre/Post Hooks for Demonstration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Pre-hook: Transfer some WETH to the proxy (demonstration of proxy interaction)
  // This shows CoWShed can hold assets for other purposes (like collateral, LP positions, etc.)
  const preHookAmount = ethers.parseEther('0.5');
  const wethIface = new ethers.Interface(ERC20_ABI);
  const transferCallData = wethIface.encodeFunctionData('transfer', [proxyAddress, preHookAmount]);

  const preHook = {
    target: ADDRESSES.weth,
    callData: transferCallData,
    gasLimit: '100000',
  };

  console.log('   ✅ Pre-hook created: Will transfer 0.5 WETH to proxy during settlement');
  console.log('   ℹ️  This demonstrates permissioned actions, not trading from proxy');
  console.log('');

  // Step 4: Create appData with hooks
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 4: Create AppData with Hooks Metadata');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const appDataContent = {
    version: '1.0.0',
    metadata: {
      hooks: {
        pre: [preHook],
        post: [],
      },
    },
  };

  const appDataHash = computeAppDataHash(appDataContent);
  console.log(`   AppData Hash: ${appDataHash}`);
  console.log(`   Pre-hooks: ${appDataContent.metadata.hooks.pre.length}`);
  console.log('');

  // Step 5: Upload appData to orderbook
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 5: Upload AppData to Orderbook');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('   Uploading appData with hooks...');

  const uploadResponse = await fetch(`${CONFIG.orderbookUrl}/api/v1/app_data/${appDataHash}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullAppData: JSON.stringify(appDataContent),
    }),
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.log(`   ⚠️ AppData upload status: ${uploadResponse.status}`);
    console.log(`   Response: ${errorText}`);
    // Continue anyway - might already exist
  } else {
    console.log('   ✅ AppData uploaded successfully');
  }
  console.log('');

  // Step 6: Get quote from orderbook (FROM user EOA)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 6: Get Quote from Orderbook');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Get quote WITH our custom appData hash (includes hooks)
  const quoteRequest = {
    sellToken: ADDRESSES.dai,
    buyToken: ADDRESSES.weth,
    from: userAddress, // ← CRITICAL: User EOA, NOT proxy address!
    kind: 'sell',
    sellAmountBeforeFee: sellAmount.toString(),
    appData: appDataHash, // ← Include our custom appData with hooks!
  };

  console.log('   Requesting quote with custom appData (hooks included)...');

  const quoteResponse = await fetch(`${CONFIG.orderbookUrl}/api/v1/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quoteRequest),
  });

  if (!quoteResponse.ok) {
    const errorText = await quoteResponse.text();
    console.log(`   ❌ Quote failed: ${quoteResponse.status}`);
    console.log(`   Error: ${errorText}`);
    return;
  }

  const quote = await quoteResponse.json() as any;
  console.log('   ✅ Quote received');
  console.log(`   Buy Amount: ${ethers.formatEther(quote.quote.buyAmount)} WETH`);
  console.log(`   Fee Amount: ${ethers.formatEther(quote.quote.feeAmount)} DAI`);
  console.log('');

  // Step 7: Create and sign the order (user EOA signs)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 7: Sign Order with EIP-712 (User EOA)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Apply surplus (3% to ensure profitability with deep liquidity)
  const surplusPercent = 3;
  const surplusMultiplier = 1 - (surplusPercent / 100);
  const adjustedBuyAmount = (BigInt(quote.quote.buyAmount) * BigInt(Math.floor(surplusMultiplier * 10000)) / 10000n).toString();

  console.log(`   Quote sell amount: ${ethers.formatEther(quote.quote.sellAmount)} DAI`);
  console.log(`   Quote buy amount: ${ethers.formatEther(quote.quote.buyAmount)} WETH`);
  console.log(`   Order buy amount (with ${surplusPercent}% surplus): ${ethers.formatEther(adjustedBuyAmount)} WETH`);
  console.log('');

  // Order from user EOA (NOT proxy!)
  const order = {
    sellToken: ADDRESSES.dai,
    buyToken: ADDRESSES.weth,
    receiver: userAddress, // ← Receive to user EOA
    sellAmount: quote.quote.sellAmount,
    buyAmount: adjustedBuyAmount,
    validTo: quote.quote.validTo,
    appData: appDataHash,
    feeAmount: '0',
    kind: 'sell',
    partiallyFillable: false,
    sellTokenBalance: 'erc20',
    buyTokenBalance: 'erc20',
  };

  // EIP-712 domain
  const domain = {
    name: 'Gnosis Protocol',
    version: 'v2',
    chainId: CONFIG.chainId,
    verifyingContract: ADDRESSES.settlement,
  };

  const types = {
    Order: ORDER_TYPE_FIELDS,
  };

  console.log('   Signing order with user EOA...');
  const signature = await wallet.signTypedData(domain, types, order);
  console.log(`   ✅ Signature: ${signature.substring(0, 20)}...`);
  console.log('');

  // Step 8: Submit order to orderbook
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 8: Submit Order to Orderbook');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const orderCreation = {
    sellToken: order.sellToken,
    buyToken: order.buyToken,
    receiver: order.receiver,
    sellAmount: order.sellAmount,
    buyAmount: order.buyAmount,
    validTo: order.validTo,
    appData: order.appData,
    feeAmount: '0',
    kind: order.kind,
    partiallyFillable: order.partiallyFillable,
    sellTokenBalance: order.sellTokenBalance,
    buyTokenBalance: order.buyTokenBalance,
    signingScheme: 'eip712', // ← EIP-712 for EOA (correct!)
    signature: signature,
    from: userAddress, // ← User EOA (correct!)
  };

  console.log('   Submitting order with hooks...');

  const orderResponse = await fetch(`${CONFIG.orderbookUrl}/api/v1/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderCreation),
  });

  if (!orderResponse.ok) {
    const errorText = await orderResponse.text();
    console.log(`   ❌ Order submission failed: ${orderResponse.status}`);
    console.log(`   Error: ${errorText}`);
    return;
  }

  const orderUid = await orderResponse.text();
  console.log(`   ✅ Order submitted!`);
  console.log(`   Order UID: ${orderUid}`);
  console.log('');

  // Step 9: Monitor order status
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 9: Monitor Order Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const cleanOrderUid = orderUid.replace(/"/g, '');
  console.log(`   Monitoring order ${cleanOrderUid.substring(0, 20)}...`);
  console.log('   (Press Ctrl+C to stop monitoring)\n');

  let lastStatus = '';
  for (let i = 0; i < 12; i++) { // Monitor for 1 minute (12 * 5s = 60s)
    await new Promise(resolve => setTimeout(resolve, 5000));

    const statusResponse = await fetch(`${CONFIG.orderbookUrl}/api/v1/orders/${cleanOrderUid}`);
    if (!statusResponse.ok) {
      console.log(`   ⚠️ Could not fetch order status: ${statusResponse.status}`);
      continue;
    }

    const orderStatus = await statusResponse.json() as any;
    const status = orderStatus.status;

    if (status !== lastStatus) {
      lastStatus = status;
      console.log(`   [${new Date().toISOString()}] Status: ${status}`);

      if (status === 'fulfilled') {
        console.log('\n   🎉 Order fulfilled with hooks executed!');

        // Check final balances
        const finalUserDaiBalance = await dai.balanceOf(userAddress);
        const finalUserWethBalance = await weth.balanceOf(userAddress);
        const finalProxyWethBalance = await weth.balanceOf(proxyAddress);

        console.log(`\n   User Final Balances:`);
        console.log(`   DAI: ${ethers.formatEther(finalUserDaiBalance)}`);
        console.log(`   WETH: ${ethers.formatEther(finalUserWethBalance)}`);

        console.log(`\n   Proxy WETH Balance (from pre-hook):`);
        console.log(`   WETH: ${ethers.formatEther(finalProxyWethBalance)}`);

        if (finalProxyWethBalance >= preHookAmount) {
          console.log(`   ✅ Pre-hook successfully transferred WETH to proxy!`);
        }
        break;
      } else if (status === 'cancelled' || status === 'expired') {
        console.log(`\n   ❌ Order ${status}`);
        break;
      }
    }
  }

  if (lastStatus === 'open') {
    console.log('\n   ⚠️ Order still open after 1 minute - may indicate an issue');
    console.log('   Possible causes:');
    console.log('   - Hooks preventing settlement (check driver/solver logs)');
    console.log('   - Solver not picking up orders with hooks');
    console.log('   - Liquidity issues');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Complete!');
  console.log('');
  if (lastStatus === 'fulfilled') {
    console.log('Summary: CoWShed hooks executed permissioned actions while');
    console.log('         trading assets stayed in user EOA. This is the');
    console.log('         CORRECT way to use CoWShed with CoW Protocol!');
  } else {
    console.log('Summary: Order submitted successfully but not settled.');
    console.log('         Try running test-playground-order.ts without hooks');
    console.log('         to verify basic settlement works.');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(console.error);
