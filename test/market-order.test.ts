/**
 * Integration tests for CoW Protocol Market Orders
 *
 * These tests verify that market orders (buy orders with buyAmount specified)
 * can be placed and settled correctly in the offline development environment.
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
} from "./utils/order-helpers";

describe("Market Orders", () => {
  let provider: ethers.Provider;
  let userWallet: ethers.Wallet;
  let addresses: ReturnType<typeof getAddresses>;

  beforeAll(() => {
    // Set up provider and wallet
    provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

    // Use Anvil account #2 (bob)
    const privateKey =
      "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
    userWallet = new ethers.Wallet(privateKey, provider);

    addresses = getAddresses();
  });

  describe("Buy Order (Market Order with buyAmount)", () => {
    it("should place and settle a market order to buy 1 WETH with DAI", async () => {
      const sellToken = "DAI";
      const buyToken = "WETH";
      const buyAmount = parseAmount("1e18"); // Buy 1 WETH

      const sellTokenAddress = getTokenAddress(sellToken);
      const buyTokenAddress = getTokenAddress(buyToken);

      // For market orders, we need to ensure enough sell tokens (conservative estimate)
      const estimatedSellAmount = buyAmount * 4000n; // Assume ~4000 DAI per WETH
      await ensureTokenBalance(
        provider,
        userWallet.address,
        sellTokenAddress,
        estimatedSellAmount
      );

      // Get initial balances
      const initialSellBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        userWallet.address
      );
      const initialBuyBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        userWallet.address
      );

      console.log(
        `Initial ${sellToken} balance: ${formatBalance(
          initialSellBalance,
          getTokenDecimals(sellToken)
        )}`
      );
      console.log(
        `Initial ${buyToken} balance: ${formatBalance(
          initialBuyBalance,
          getTokenDecimals(buyToken)
        )}`
      );

      // Approve VaultRelayer with estimated amount
      await approveToken(
        userWallet,
        sellTokenAddress,
        addresses.vaultRelayer,
        estimatedSellAmount
      );

      // Get quote for buy order
      const quoteUrl = `${CONFIG.orderbookUrl}/api/v1/quote`;
      const quoteRequest = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        receiver: userWallet.address,
        buyAmountAfterFee: buyAmount.toString(),
        kind: "buy",
        from: userWallet.address,
      };

      const quoteResponse = await fetch(quoteUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteRequest),
      });
      expect(quoteResponse.ok).toBe(true);

      const quote = await quoteResponse.json() as any;
      expect(quote).toBeDefined();
      expect(quote.quote).toBeDefined();

      // Apply 3% surplus by reducing the buy amount (willing to accept less)
      // This creates surplus opportunity for the solver
      const quoteBuyAmount = BigInt(quote.quote.buyAmount);
      const surplusPercent = 3;
      const surplusMultiplier = 1 - surplusPercent / 100;
      const adjustedBuyAmount = (
        (quoteBuyAmount * BigInt(Math.floor(surplusMultiplier * 10000))) /
        10000n
      ).toString();

      console.log(
        `Quote received: sell ~${formatBalance(
          BigInt(quote.quote.sellAmount),
          getTokenDecimals(sellToken)
        )} ${sellToken} to buy ${formatBalance(
          quoteBuyAmount,
          getTokenDecimals(buyToken)
        )} ${buyToken} (adjusted to ${formatBalance(
          BigInt(adjustedBuyAmount),
          getTokenDecimals(buyToken)
        )} ${buyToken} with ${surplusPercent}% surplus)`
      );

      // Create order data
      const orderData: OrderData = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        receiver: userWallet.address,
        sellAmount: quote.quote.sellAmount,
        buyAmount: adjustedBuyAmount, // Use adjusted amount to create surplus
        validTo: quote.quote.validTo,
        appData: quote.quote.appData,
        feeAmount: "0", // Fee must be zero - fee is now included in sell amount
        kind: "buy",
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
      const orderUid = await submitOrder(
        orderData,
        signature,
        userWallet.address
      );
      expect(orderUid).toBeDefined();
      console.log(`Order submitted: ${orderUid}`);

      // Wait for settlement
      const settled = await waitForOrderExecution(orderUid, 120);
      expect(settled).toBe(true);

      // Verify balances changed
      const finalSellBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        userWallet.address
      );
      const finalBuyBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        userWallet.address
      );

      console.log(
        `Final ${sellToken} balance: ${formatBalance(
          finalSellBalance,
          getTokenDecimals(sellToken)
        )}`
      );
      console.log(
        `Final ${buyToken} balance: ${formatBalance(
          finalBuyBalance,
          getTokenDecimals(buyToken)
        )}`
      );

      // Assertions
      expect(finalSellBalance).toBeLessThan(initialSellBalance);
      expect(finalBuyBalance).toBeGreaterThan(initialBuyBalance);

      // Verify we got at least the adjusted amount (potentially more due to surplus)
      const buyAmountReceived = finalBuyBalance - initialBuyBalance;
      const buyAmountExpected = BigInt(adjustedBuyAmount);

      // Should receive at least the adjusted amount
      expect(buyAmountReceived).toBeGreaterThanOrEqual(buyAmountExpected);

      // Should not receive more than the original quote amount (no negative surplus)
      expect(buyAmountReceived).toBeLessThanOrEqual(quoteBuyAmount);
    }, 180000); // 3 minutes timeout

    it("should place and settle a market order to buy 100 USDC with DAI", async () => {
      const sellToken = "DAI";
      const buyToken = "USDC";
      const buyAmount = parseAmount("100e6"); // Buy 100 USDC

      const sellTokenAddress = getTokenAddress(sellToken);
      const buyTokenAddress = getTokenAddress(buyToken);

      // Conservative estimate: 1:1 ratio + some buffer
      const estimatedSellAmount = parseAmount("150e18"); // 150 DAI
      await ensureTokenBalance(
        provider,
        userWallet.address,
        sellTokenAddress,
        estimatedSellAmount
      );

      const initialSellBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        userWallet.address
      );
      const initialBuyBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        userWallet.address
      );

      await approveToken(
        userWallet,
        sellTokenAddress,
        addresses.vaultRelayer,
        estimatedSellAmount
      );

      // Get quote for buy order
      const quoteUrl = `${CONFIG.orderbookUrl}/api/v1/quote`;
      const quoteRequest = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        receiver: userWallet.address,
        buyAmountAfterFee: buyAmount.toString(),
        kind: "buy",
        from: userWallet.address,
      };

      const quoteResponse = await fetch(quoteUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteRequest),
      });
      expect(quoteResponse.ok).toBe(true);

      const quote = await quoteResponse.json() as any;

      // Apply 3% surplus by reducing the buy amount
      const quoteBuyAmount = BigInt(quote.quote.buyAmount);
      const surplusPercent = 3;
      const adjustedBuyAmount = (
        (quoteBuyAmount * BigInt(Math.floor((1 - surplusPercent / 100) * 10000))) /
        10000n
      ).toString();

      const orderData: OrderData = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        receiver: userWallet.address,
        sellAmount: quote.quote.sellAmount,
        buyAmount: adjustedBuyAmount, // Use adjusted amount to create surplus
        validTo: quote.quote.validTo,
        appData: quote.quote.appData,
        feeAmount: "0", // Fee must be zero - fee is now included in sell amount
        kind: "buy",
        partiallyFillable: false,
        sellTokenBalance: "erc20",
        buyTokenBalance: "erc20",
      };

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
      const orderUid = await submitOrder(
        orderData,
        signature,
        userWallet.address
      );

      expect(orderUid).toBeDefined();
      console.log(`Order submitted: ${orderUid}`);

      const settled = await waitForOrderExecution(orderUid, 120);
      expect(settled).toBe(true);

      const finalSellBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        userWallet.address
      );
      const finalBuyBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        userWallet.address
      );

      expect(finalSellBalance).toBeLessThan(initialSellBalance);
      expect(finalBuyBalance).toBeGreaterThan(initialBuyBalance);

      // Verify we got at least the adjusted amount (potentially more due to surplus)
      const buyAmountReceived = finalBuyBalance - initialBuyBalance;
      const buyAmountExpected = BigInt(adjustedBuyAmount);

      // Should receive at least the adjusted amount
      expect(buyAmountReceived).toBeGreaterThanOrEqual(buyAmountExpected);

      // Should not receive more than the original quote amount
      expect(buyAmountReceived).toBeLessThanOrEqual(quoteBuyAmount);
    }, 180000);
  });
});
