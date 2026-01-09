/**
 * Integration tests for CoW Protocol Limit Orders
 *
 * These tests verify that limit orders can be placed and settled correctly
 * in the offline development environment.
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
  getQuote,
  submitOrder,
  waitForOrderExecution,
  getTokenBalance,
  approveToken,
} from "../utils/order-helpers";

describe("Limit Orders", () => {
  let provider: ethers.Provider;
  let userWallet: ethers.Wallet;
  let addresses: ReturnType<typeof getAddresses>;

  beforeAll(() => {
    // Set up provider and wallet
    provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

    // Use Anvil account #1 (alice)
    const privateKey =
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    userWallet = new ethers.Wallet(privateKey, provider);

    addresses = getAddresses();
  });

  describe("Sell Order (Limit Order with sellAmount)", () => {
    it("should place and settle a DAI -> WETH limit order", async () => {
      const sellToken = "DAI";
      const buyToken = "WETH";
      const sellAmount = parseAmount("100e18"); // 100 DAI

      const sellTokenAddress = getTokenAddress(sellToken);
      const buyTokenAddress = getTokenAddress(buyToken);

      // Ensure user has enough sell tokens
      await ensureTokenBalance(
        provider,
        userWallet.address,
        sellTokenAddress,
        sellAmount
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

      // Approve VaultRelayer
      await approveToken(
        userWallet,
        sellTokenAddress,
        addresses.vaultRelayer,
        sellAmount
      );

      // Get quote
      const quote = await getQuote(
        sellTokenAddress,
        buyTokenAddress,
        sellAmount.toString(),
        userWallet.address
      );

      expect(quote).toBeDefined();
      expect(quote.quote).toBeDefined();
      // Apply 10% surplus by reducing the buy amount (willing to accept less)
      // This creates surplus opportunity for the solver
      const quoteBuyAmount = BigInt(quote.quote.buyAmount);
      const surplusPercent = 10;
      const surplusMultiplier = 1 - surplusPercent / 100;
      const adjustedBuyAmount = (
        (quoteBuyAmount * BigInt(Math.floor(surplusMultiplier * 10000))) /
        10000n
      ).toString();

      console.log(
        `Quote received: sell ${formatBalance(
          BigInt(quote.quote.sellAmount),
          getTokenDecimals(sellToken)
        )} ${sellToken} for ${formatBalance(
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
      const orderUid = await submitOrder(
        orderData,
        signature,
        userWallet.address
      );
      expect(orderUid).toBeDefined();
      console.log(`Order submitted: ${orderUid}`);

      // Wait for settlement
      const settled = await waitForOrderExecution(orderUid, 180);
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
    }, 180000); // 3 minutes timeout

    it("should place and settle a USDC -> DAI limit order", async () => {
      const sellToken = "USDC";
      const buyToken = "DAI";
      const sellAmount = parseAmount("50e6"); // 50 USDC

      const sellTokenAddress = getTokenAddress(sellToken);
      const buyTokenAddress = getTokenAddress(buyToken);

      await ensureTokenBalance(
        provider,
        userWallet.address,
        sellTokenAddress,
        sellAmount
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
        sellAmount
      );

      const quote = await getQuote(
        sellTokenAddress,
        buyTokenAddress,
        sellAmount.toString(),
        userWallet.address
      );

      // Apply 10% surplus by reducing the buy amount
      const quoteBuyAmount = BigInt(quote.quote.buyAmount);
      const surplusPercent = 10;
      const adjustedBuyAmount = (
        (quoteBuyAmount *
          BigInt(Math.floor((1 - surplusPercent / 100) * 10000))) /
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
        kind: "sell",
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

      const settled = await waitForOrderExecution(orderUid, 180);
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
    }, 180000);
  });
});
