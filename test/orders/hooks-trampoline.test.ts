/**
 * Integration tests for CoW Protocol Hooks via HooksTrampoline
 *
 * These tests verify that pre and post hooks can be executed correctly
 * during order settlement via the CowHooksTrampoline contract.
 *
 * Hooks allow users to execute arbitrary contract calls before and/or after
 * their order is settled, enabling complex trading strategies.
 */

import { ethers } from "ethers";
import {
  CONFIG,
  ORDER_TYPE_FIELDS,
  OrderData,
  getAddresses,
  getTokenAddress,
  getTokenDecimals,
  parseAmount,
  formatBalance,
  ensureTokenBalance,
  submitOrder,
  waitForOrderExecution,
  getTokenBalance,
  approveToken,
} from "../utils/order-helpers";
import { loadAddresses } from "../utils/loadAddresses";

// ERC20 ABI for encoding hook calls
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

/**
 * Compute appData hash from content
 */
function computeAppDataHash(appDataContent: object): string {
  const appDataString = JSON.stringify(appDataContent);
  return ethers.keccak256(ethers.toUtf8Bytes(appDataString));
}

/**
 * Upload appData to the orderbook
 */
async function uploadAppData(
  appDataHash: string,
  appDataContent: object
): Promise<void> {
  const uploadResponse = await fetch(
    `${CONFIG.orderbookUrl}/api/v1/app_data/${appDataHash}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullAppData: JSON.stringify(appDataContent),
      }),
    }
  );

  if (!uploadResponse.ok && uploadResponse.status !== 409) {
    // 409 means already exists, which is OK
    const errorText = await uploadResponse.text();
    throw new Error(
      `AppData upload failed: ${uploadResponse.status} - ${errorText}`
    );
  }
}

describe("Hooks Trampoline Orders", () => {
  let provider: ethers.Provider;
  let userWallet: ethers.Wallet;
  let addresses: ReturnType<typeof getAddresses>;
  let allAddresses: ReturnType<typeof loadAddresses>;
  let hookRecipient: ethers.Wallet; // A recipient address to receive hook transfers

  beforeAll(() => {
    // Set up provider and wallet
    provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

    // Use Anvil account #3 for hook tests
    const privateKey =
      "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a";
    userWallet = new ethers.Wallet(privateKey, provider);

    // Use Anvil account #4 as hook recipient
    const recipientKey =
      "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba";
    hookRecipient = new ethers.Wallet(recipientKey, provider);

    addresses = getAddresses();
    allAddresses = loadAddresses();
  });

  describe("Pre-Hook Execution", () => {
    it("should execute a pre-hook that transfers tokens before settlement", async () => {
      const sellToken = "DAI";
      const buyToken = "WETH";
      const sellAmount = parseAmount("100e18"); // Sell 100 DAI
      const preHookTransferAmount = parseAmount("10e18"); // Transfer 10 DAI in pre-hook

      const sellTokenAddress = getTokenAddress(sellToken);
      const buyTokenAddress = getTokenAddress(buyToken);

      // Ensure user has enough sell tokens (including hook transfer)
      const totalRequired = sellAmount + preHookTransferAmount;
      await ensureTokenBalance(
        provider,
        userWallet.address,
        sellTokenAddress,
        totalRequired
      );

      console.log(`\n📋 Test: Pre-hook token transfer`);
      console.log(`   User: ${userWallet.address}`);
      console.log(`   Hook Recipient: ${hookRecipient.address}`);
      console.log(`   Hooks Trampoline: ${allAddresses.cowProtocol.hooksTrampoline}`);

      // Get initial balances
      const initialUserBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        userWallet.address
      );
      const initialRecipientBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        hookRecipient.address
      );
      const initialUserWethBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        userWallet.address
      );

      console.log(`\n   Initial ${sellToken} balance (user): ${formatBalance(initialUserBalance, getTokenDecimals(sellToken))}`);
      console.log(`   Initial ${sellToken} balance (recipient): ${formatBalance(initialRecipientBalance, getTokenDecimals(sellToken))}`);
      console.log(`   Initial ${buyToken} balance (user): ${formatBalance(initialUserWethBalance, getTokenDecimals(buyToken))}`);

      // Approve VaultRelayer to spend sell tokens
      await approveToken(
        userWallet,
        sellTokenAddress,
        addresses.vaultRelayer,
        sellAmount
      );

      // Approve HooksTrampoline to spend tokens for pre-hook
      console.log(`   Approving HooksTrampoline to spend ${sellToken} for pre-hook...`);
      await approveToken(
        userWallet,
        sellTokenAddress,
        allAddresses.cowProtocol.hooksTrampoline,
        preHookTransferAmount
      );

      // Create pre-hook: Transfer DAI from user to hook recipient
      // Note: Using transferFrom since hooks execute from HooksTrampoline contract
      const daiInterface = new ethers.Interface(ERC20_ABI);
      const preHookCallData = daiInterface.encodeFunctionData("transferFrom", [
        userWallet.address, // from (user)
        hookRecipient.address, // to (recipient)
        preHookTransferAmount, // amount
      ]);

      const preHook = {
        target: sellTokenAddress,
        callData: preHookCallData,
        gasLimit: "100000",
      };

      // Create appData with pre-hook
      const appDataContent = {
        version: "1.0.0",
        metadata: {
          hooks: {
            pre: [preHook],
            post: [],
          },
        },
      };

      const appDataHash = computeAppDataHash(appDataContent);
      console.log(`\n   Uploading appData with pre-hook...`);
      await uploadAppData(appDataHash, appDataContent);

      // Get quote with custom appData
      const quoteUrl = `${CONFIG.orderbookUrl}/api/v1/quote`;
      const quoteRequest = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        from: userWallet.address,
        kind: "sell",
        sellAmountBeforeFee: sellAmount.toString(),
        appData: appDataHash,
      };

      const quoteResponse = await fetch(quoteUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteRequest),
      });
      expect(quoteResponse.ok).toBe(true);

      const quote = (await quoteResponse.json()) as any;

      // Apply 5% surplus
      const quoteBuyAmount = BigInt(quote.quote.buyAmount);
      const surplusPercent = 5;
      const adjustedBuyAmount = (
        (quoteBuyAmount *
          BigInt(Math.floor((1 - surplusPercent / 100) * 10000))) /
        10000n
      ).toString();

      console.log(`   Quote received: buy ${formatBalance(BigInt(adjustedBuyAmount), getTokenDecimals(buyToken))} ${buyToken}`);

      // Create order data
      const orderData: OrderData = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        receiver: userWallet.address,
        sellAmount: quote.quote.sellAmount,
        buyAmount: adjustedBuyAmount,
        validTo: quote.quote.validTo,
        appData: appDataHash,
        feeAmount: "0",
        kind: "sell",
        partiallyFillable: false,
        sellTokenBalance: "erc20",
        buyTokenBalance: "erc20",
      };

      // Sign order
      const domain = {
        name: "Gnosis Protocol",
        version: "v2",
        chainId: CONFIG.chainId,
        verifyingContract: addresses.settlement,
      };

      const signature = await userWallet.signTypedData(
        domain,
        { Order: ORDER_TYPE_FIELDS },
        orderData
      );

      // Submit order
      console.log(`   Submitting order with pre-hook...`);
      const orderUid = await submitOrder(
        orderData,
        signature,
        userWallet.address
      );
      expect(orderUid).toBeDefined();
      console.log(`   Order submitted: ${orderUid}`);

      // Wait for settlement
      console.log(`   Waiting for settlement...`);
      const settled = await waitForOrderExecution(orderUid, 180);
      expect(settled).toBe(true);

      // Verify balances after settlement
      const finalUserBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        userWallet.address
      );
      const finalRecipientBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        hookRecipient.address
      );
      const finalUserWethBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        userWallet.address
      );

      console.log(`\n   Final ${sellToken} balance (user): ${formatBalance(finalUserBalance, getTokenDecimals(sellToken))}`);
      console.log(`   Final ${sellToken} balance (recipient): ${formatBalance(finalRecipientBalance, getTokenDecimals(sellToken))}`);
      console.log(`   Final ${buyToken} balance (user): ${formatBalance(finalUserWethBalance, getTokenDecimals(buyToken))}`);

      // Assertions
      // User should have sold tokens + transferred pre-hook amount
      expect(finalUserBalance).toBeLessThan(initialUserBalance);

      // Recipient should have received the pre-hook transfer
      const recipientReceived = finalRecipientBalance - initialRecipientBalance;
      expect(recipientReceived).toEqual(preHookTransferAmount);

      // User should have received WETH
      expect(finalUserWethBalance).toBeGreaterThan(initialUserWethBalance);

      console.log(`\n   ✅ Pre-hook executed successfully!`);
      console.log(`   ✅ Transferred ${formatBalance(preHookTransferAmount, getTokenDecimals(sellToken))} ${sellToken} to recipient via pre-hook`);
    }, 300000); // 5 minutes timeout
  });

  describe("Post-Hook Execution", () => {
    it("should execute a post-hook that transfers tokens after settlement", async () => {
      const sellToken = "USDC";
      const buyToken = "WETH";
      const sellAmount = parseAmount("1000e6"); // Sell 1000 USDC
      const postHookTransferAmount = parseAmount("0.05e18"); // Transfer 0.05 WETH in post-hook

      const sellTokenAddress = getTokenAddress(sellToken);
      const buyTokenAddress = getTokenAddress(buyToken);

      // Ensure user has enough sell tokens
      await ensureTokenBalance(
        provider,
        userWallet.address,
        sellTokenAddress,
        sellAmount
      );

      console.log(`\n📋 Test: Post-hook token transfer`);
      console.log(`   User: ${userWallet.address}`);
      console.log(`   Hook Recipient: ${hookRecipient.address}`);

      // Get initial balances
      const initialUserUsdcBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        userWallet.address
      );
      const initialUserWethBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        userWallet.address
      );
      const initialRecipientWethBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        hookRecipient.address
      );

      console.log(`\n   Initial ${sellToken} balance (user): ${formatBalance(initialUserUsdcBalance, getTokenDecimals(sellToken))}`);
      console.log(`   Initial ${buyToken} balance (user): ${formatBalance(initialUserWethBalance, getTokenDecimals(buyToken))}`);
      console.log(`   Initial ${buyToken} balance (recipient): ${formatBalance(initialRecipientWethBalance, getTokenDecimals(buyToken))}`);

      // Approve VaultRelayer to spend sell tokens
      await approveToken(
        userWallet,
        sellTokenAddress,
        addresses.vaultRelayer,
        sellAmount
      );

      // Approve HooksTrampoline to spend WETH for post-hook
      // Note: We need to approve more than the expected buy amount since we don't know exact amount yet
      console.log(`   Approving HooksTrampoline to spend ${buyToken} for post-hook...`);
      await approveToken(
        userWallet,
        buyTokenAddress,
        allAddresses.cowProtocol.hooksTrampoline,
        parseAmount("1e18") // Approve 1 WETH (more than enough for 0.05 WETH post-hook)
      );

      // Create post-hook: Transfer WETH from user to hook recipient
      // Note: Using transferFrom since hooks execute from HooksTrampoline contract
      const wethInterface = new ethers.Interface(ERC20_ABI);
      const postHookCallData = wethInterface.encodeFunctionData("transferFrom", [
        userWallet.address, // from (user)
        hookRecipient.address, // to (recipient)
        postHookTransferAmount, // amount
      ]);

      const postHook = {
        target: buyTokenAddress,
        callData: postHookCallData,
        gasLimit: "100000",
      };

      // Create appData with post-hook
      const appDataContent = {
        version: "1.0.0",
        metadata: {
          hooks: {
            pre: [],
            post: [postHook],
          },
        },
      };

      const appDataHash = computeAppDataHash(appDataContent);
      console.log(`\n   Uploading appData with post-hook...`);
      await uploadAppData(appDataHash, appDataContent);

      // Get quote with custom appData
      const quoteUrl = `${CONFIG.orderbookUrl}/api/v1/quote`;
      const quoteRequest = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        from: userWallet.address,
        kind: "sell",
        sellAmountBeforeFee: sellAmount.toString(),
        appData: appDataHash,
      };

      const quoteResponse = await fetch(quoteUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteRequest),
      });
      expect(quoteResponse.ok).toBe(true);

      const quote = (await quoteResponse.json()) as any;

      // Apply 5% surplus
      const quoteBuyAmount = BigInt(quote.quote.buyAmount);
      const surplusPercent = 5;
      const adjustedBuyAmount = (
        (quoteBuyAmount *
          BigInt(Math.floor((1 - surplusPercent / 100) * 10000))) /
        10000n
      ).toString();

      console.log(`   Quote received: buy ${formatBalance(BigInt(adjustedBuyAmount), getTokenDecimals(buyToken))} ${buyToken}`);

      // Create order data
      const orderData: OrderData = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        receiver: userWallet.address,
        sellAmount: quote.quote.sellAmount,
        buyAmount: adjustedBuyAmount,
        validTo: quote.quote.validTo,
        appData: appDataHash,
        feeAmount: "0",
        kind: "sell",
        partiallyFillable: false,
        sellTokenBalance: "erc20",
        buyTokenBalance: "erc20",
      };

      // Sign order
      const domain = {
        name: "Gnosis Protocol",
        version: "v2",
        chainId: CONFIG.chainId,
        verifyingContract: addresses.settlement,
      };

      const signature = await userWallet.signTypedData(
        domain,
        { Order: ORDER_TYPE_FIELDS },
        orderData
      );

      // Submit order
      console.log(`   Submitting order with post-hook...`);
      const orderUid = await submitOrder(
        orderData,
        signature,
        userWallet.address
      );
      expect(orderUid).toBeDefined();
      console.log(`   Order submitted: ${orderUid}`);

      // Wait for settlement
      console.log(`   Waiting for settlement...`);
      const settled = await waitForOrderExecution(orderUid, 180);
      expect(settled).toBe(true);

      // Verify balances after settlement
      const finalUserUsdcBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        userWallet.address
      );
      const finalUserWethBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        userWallet.address
      );
      const finalRecipientWethBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        hookRecipient.address
      );

      console.log(`\n   Final ${sellToken} balance (user): ${formatBalance(finalUserUsdcBalance, getTokenDecimals(sellToken))}`);
      console.log(`   Final ${buyToken} balance (user): ${formatBalance(finalUserWethBalance, getTokenDecimals(buyToken))}`);
      console.log(`   Final ${buyToken} balance (recipient): ${formatBalance(finalRecipientWethBalance, getTokenDecimals(buyToken))}`);

      // Assertions
      // User should have sold USDC
      expect(finalUserUsdcBalance).toBeLessThan(initialUserUsdcBalance);

      // User should have received WETH (minus post-hook transfer)
      expect(finalUserWethBalance).toBeGreaterThan(initialUserWethBalance);

      // Recipient should have received the post-hook transfer
      const recipientReceived =
        finalRecipientWethBalance - initialRecipientWethBalance;
      expect(recipientReceived).toEqual(postHookTransferAmount);

      console.log(`\n   ✅ Post-hook executed successfully!`);
      console.log(`   ✅ Transferred ${formatBalance(postHookTransferAmount, getTokenDecimals(buyToken))} ${buyToken} to recipient via post-hook`);
    }, 300000); // 5 minutes timeout
  });

  describe("Pre and Post Hooks Together", () => {
    it("should execute both pre and post hooks in a single order", async () => {
      const sellToken = "DAI";
      const buyToken = "USDC";
      const sellAmount = parseAmount("500e18"); // Sell 500 DAI
      const preHookTransferAmount = parseAmount("5e18"); // Transfer 5 DAI in pre-hook
      const postHookTransferAmount = parseAmount("50e6"); // Transfer 50 USDC in post-hook

      const sellTokenAddress = getTokenAddress(sellToken);
      const buyTokenAddress = getTokenAddress(buyToken);

      // Ensure user has enough sell tokens (including pre-hook transfer)
      const totalRequired = sellAmount + preHookTransferAmount;
      await ensureTokenBalance(
        provider,
        userWallet.address,
        sellTokenAddress,
        totalRequired
      );

      console.log(`\n📋 Test: Both pre and post hooks`);
      console.log(`   User: ${userWallet.address}`);
      console.log(`   Hook Recipient: ${hookRecipient.address}`);

      // Get initial balances
      const initialUserDaiBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        userWallet.address
      );
      const initialRecipientDaiBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        hookRecipient.address
      );
      const initialUserUsdcBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        userWallet.address
      );
      const initialRecipientUsdcBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        hookRecipient.address
      );

      console.log(`\n   Initial ${sellToken} balance (user): ${formatBalance(initialUserDaiBalance, getTokenDecimals(sellToken))}`);
      console.log(`   Initial ${sellToken} balance (recipient): ${formatBalance(initialRecipientDaiBalance, getTokenDecimals(sellToken))}`);
      console.log(`   Initial ${buyToken} balance (user): ${formatBalance(initialUserUsdcBalance, getTokenDecimals(buyToken))}`);
      console.log(`   Initial ${buyToken} balance (recipient): ${formatBalance(initialRecipientUsdcBalance, getTokenDecimals(buyToken))}`);

      // Approve VaultRelayer
      await approveToken(
        userWallet,
        sellTokenAddress,
        addresses.vaultRelayer,
        sellAmount
      );

      // Approve HooksTrampoline to spend tokens for pre-hook
      console.log(`   Approving HooksTrampoline to spend ${sellToken} for pre-hook...`);
      await approveToken(
        userWallet,
        sellTokenAddress,
        allAddresses.cowProtocol.hooksTrampoline,
        preHookTransferAmount
      );

      // Approve HooksTrampoline to spend USDC for post-hook
      console.log(`   Approving HooksTrampoline to spend ${buyToken} for post-hook...`);
      await approveToken(
        userWallet,
        buyTokenAddress,
        allAddresses.cowProtocol.hooksTrampoline,
        parseAmount("1000e6") // Approve 1000 USDC (more than enough for 50 USDC post-hook)
      );

      // Create pre-hook: Transfer DAI from user to recipient
      // Note: Using transferFrom since hooks execute from HooksTrampoline contract
      const daiInterface = new ethers.Interface(ERC20_ABI);
      const preHookCallData = daiInterface.encodeFunctionData("transferFrom", [
        userWallet.address, // from (user)
        hookRecipient.address, // to (recipient)
        preHookTransferAmount, // amount
      ]);

      const preHook = {
        target: sellTokenAddress,
        callData: preHookCallData,
        gasLimit: "100000",
      };

      // Create post-hook: Transfer USDC from user to recipient
      // Note: Using transferFrom since hooks execute from HooksTrampoline contract
      const usdcInterface = new ethers.Interface(ERC20_ABI);
      const postHookCallData = usdcInterface.encodeFunctionData("transferFrom", [
        userWallet.address, // from (user)
        hookRecipient.address, // to (recipient)
        postHookTransferAmount, // amount
      ]);

      const postHook = {
        target: buyTokenAddress,
        callData: postHookCallData,
        gasLimit: "100000",
      };

      // Create appData with both hooks
      const appDataContent = {
        version: "1.0.0",
        metadata: {
          hooks: {
            pre: [preHook],
            post: [postHook],
          },
        },
      };

      const appDataHash = computeAppDataHash(appDataContent);
      console.log(`\n   Uploading appData with pre and post hooks...`);
      await uploadAppData(appDataHash, appDataContent);

      // Get quote
      const quoteUrl = `${CONFIG.orderbookUrl}/api/v1/quote`;
      const quoteRequest = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        from: userWallet.address,
        kind: "sell",
        sellAmountBeforeFee: sellAmount.toString(),
        appData: appDataHash,
      };

      const quoteResponse = await fetch(quoteUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quoteRequest),
      });
      expect(quoteResponse.ok).toBe(true);

      const quote = (await quoteResponse.json()) as any;

      // Apply 5% surplus
      const quoteBuyAmount = BigInt(quote.quote.buyAmount);
      const surplusPercent = 5;
      const adjustedBuyAmount = (
        (quoteBuyAmount *
          BigInt(Math.floor((1 - surplusPercent / 100) * 10000))) /
        10000n
      ).toString();

      console.log(`   Quote received: buy ${formatBalance(BigInt(adjustedBuyAmount), getTokenDecimals(buyToken))} ${buyToken}`);

      // Create order data
      const orderData: OrderData = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        receiver: userWallet.address,
        sellAmount: quote.quote.sellAmount,
        buyAmount: adjustedBuyAmount,
        validTo: quote.quote.validTo,
        appData: appDataHash,
        feeAmount: "0",
        kind: "sell",
        partiallyFillable: false,
        sellTokenBalance: "erc20",
        buyTokenBalance: "erc20",
      };

      // Sign order
      const domain = {
        name: "Gnosis Protocol",
        version: "v2",
        chainId: CONFIG.chainId,
        verifyingContract: addresses.settlement,
      };

      const signature = await userWallet.signTypedData(
        domain,
        { Order: ORDER_TYPE_FIELDS },
        orderData
      );

      // Submit order
      console.log(`   Submitting order with pre and post hooks...`);
      const orderUid = await submitOrder(
        orderData,
        signature,
        userWallet.address
      );
      expect(orderUid).toBeDefined();
      console.log(`   Order submitted: ${orderUid}`);

      // Wait for settlement
      console.log(`   Waiting for settlement...`);
      const settled = await waitForOrderExecution(orderUid, 180);
      expect(settled).toBe(true);

      // Verify balances after settlement
      const finalUserDaiBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        userWallet.address
      );
      const finalRecipientDaiBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        hookRecipient.address
      );
      const finalUserUsdcBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        userWallet.address
      );
      const finalRecipientUsdcBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        hookRecipient.address
      );

      console.log(`\n   Final ${sellToken} balance (user): ${formatBalance(finalUserDaiBalance, getTokenDecimals(sellToken))}`);
      console.log(`   Final ${sellToken} balance (recipient): ${formatBalance(finalRecipientDaiBalance, getTokenDecimals(sellToken))}`);
      console.log(`   Final ${buyToken} balance (user): ${formatBalance(finalUserUsdcBalance, getTokenDecimals(buyToken))}`);
      console.log(`   Final ${buyToken} balance (recipient): ${formatBalance(finalRecipientUsdcBalance, getTokenDecimals(buyToken))}`);

      // Assertions
      // User should have sold DAI + transferred pre-hook amount
      expect(finalUserDaiBalance).toBeLessThan(initialUserDaiBalance);

      // Recipient should have received pre-hook DAI transfer
      const recipientDaiReceived =
        finalRecipientDaiBalance - initialRecipientDaiBalance;
      expect(recipientDaiReceived).toEqual(preHookTransferAmount);

      // User should have received USDC
      expect(finalUserUsdcBalance).toBeGreaterThan(initialUserUsdcBalance);

      // Recipient should have received post-hook USDC transfer
      const recipientUsdcReceived =
        finalRecipientUsdcBalance - initialRecipientUsdcBalance;
      expect(recipientUsdcReceived).toEqual(postHookTransferAmount);

      console.log(`\n   ✅ Both pre and post hooks executed successfully!`);
      console.log(`   ✅ Pre-hook: Transferred ${formatBalance(preHookTransferAmount, getTokenDecimals(sellToken))} ${sellToken}`);
      console.log(`   ✅ Post-hook: Transferred ${formatBalance(postHookTransferAmount, getTokenDecimals(buyToken))} ${buyToken}`);
    }, 300000); // 5 minutes timeout
  });
});
