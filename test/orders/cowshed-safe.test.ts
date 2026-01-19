/**
 * Integration tests for Safe-based trading via CoWShed
 *
 * These tests verify that Safe wallets can trade on CoW Protocol using
 * CoWShed proxies, which enable:
 * - Safe wallets to execute hooks (pre/post settlement actions)
 * - Pre-signing hook executions for automated trading
 * - Complex trading strategies with permissioned actions
 *
 * Architecture:
 * - Assets stay in the Safe wallet
 * - Order is signed by Safe (EIP-1271 signature verification)
 * - CoWShed proxy executes hooks on behalf of Safe
 * - Settlement happens from Safe's balance
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
import path from "path";
import fs from "fs";

// ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function transfer(address, uint256) returns (bool)",
  "function transferFrom(address, address, uint256) returns (bool)",
];

// Safe wallet ABI (minimal)
const SAFE_ABI = [
  "function setup(address[],uint256,address,bytes,address,address,uint256,address) external",
  "function getOwners() view returns (address[])",
  "function isOwner(address) view returns (bool)",
  "function setDomainVerifier(bytes32,address) external",
];

// CoWShed Factory ABI
const COWSHED_FACTORY_ABI = [
  "function proxyOf(address) view returns (address)",
  "function initializeProxy(address) external returns (address)",
];

// CoWShed Proxy ABI
const COWSHED_ABI = [
  "function preSignHooks((address,uint256,bytes,bool,bool)[],bytes32,uint256,bool) external",
  "function isPreSignedHooks((address,uint256,bytes,bool,bool)[],bytes32,uint256) view returns (bool)",
  "function executePreSignedHooks((address,uint256,bytes,bool,bool)[],bytes32,uint256) external",
  "function preSignStorage() view returns (address)",
];

// Settlement contract ABI
const SETTLEMENT_ABI = ["function domainSeparator() view returns (bytes32)"];

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
    // 409 means already exists
    const errorText = await uploadResponse.text();
    throw new Error(
      `AppData upload failed: ${uploadResponse.status} - ${errorText}`
    );
  }
}

/**
 * Get quote from orderbook
 */
async function getQuote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  from: string,
  appData?: string
): Promise<any> {
  const quoteUrl = `${CONFIG.orderbookUrl}/api/v1/quote`;

  const quoteRequest: any = {
    sellToken,
    buyToken,
    receiver: from,
    sellAmountBeforeFee: sellAmount,
    kind: "sell",
    from,
  };

  if (appData) {
    quoteRequest.appData = appData;
  }

  const response = await fetch(quoteUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(quoteRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Quote request failed: ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

describe("CoWShed Safe Trading", () => {
  let provider: ethers.JsonRpcProvider;
  let wallet: ethers.Wallet;
  let addresses: ReturnType<typeof getAddresses>;
  let allAddresses: ReturnType<typeof loadAddresses>;
  let safeWallet: string;

  beforeAll(async () => {
    // Set up provider and wallet
    provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

    // Use Anvil account #1 (alice) as the Safe owner
    const privateKey =
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    wallet = new ethers.Wallet(privateKey, provider);

    addresses = getAddresses();
    allAddresses = loadAddresses();

    const envPath = path.resolve(__dirname, "../../.env");
    const envContent = fs.readFileSync(envPath, "utf8");
    const testUserSafeMatch = envContent.match(
      /TEST_USER_SAFE_ADDRESS=(.+)/
    );
    if (!testUserSafeMatch) {
      throw new Error("TEST_USER_SAFE_ADDRESS not found in .env");
    }
    safeWallet = testUserSafeMatch[1].trim();

    console.log(`\n📋 Test Configuration:`);
    console.log(`   Safe Wallet: ${safeWallet}`);
    console.log(`   Safe Owner: ${wallet.address}`);
    console.log(`   CoWShed Factory: ${allAddresses.cowShed.factory}`);
  });

  describe("Basic Safe Trading via CoWShed", () => {
    it("should place and settle a DAI -> WETH order from Safe wallet", async () => {
      const sellToken = "DAI";
      const buyToken = "WETH";
      const sellAmount = parseAmount("100e18"); // 100 DAI

      const sellTokenAddress = getTokenAddress(sellToken);
      const buyTokenAddress = getTokenAddress(buyToken);

      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Test: Safe Trading via CoWShed (${sellToken} -> ${buyToken})`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // Step 1: Get CoWShed proxy address for Safe
      console.log("\n📍 STEP 1: Get CoWShed Proxy");
      const cowShedFactory = new ethers.Contract(
        allAddresses.cowShed.factory,
        COWSHED_FACTORY_ABI,
        provider
      );

      const cowShedProxy = await cowShedFactory.proxyOf(safeWallet);
      console.log(`   CoWShed proxy: ${cowShedProxy}`);

      const proxyCode = await provider.getCode(cowShedProxy);
      if (proxyCode === "0x") {
        console.log("   ℹ️  Proxy not deployed (will be created on first use)");
      } else {
        console.log("   ✅ Proxy already deployed");
      }

      // Step 2: Ensure Safe has tokens and approvals
      console.log("\n📍 STEP 2: Setup Safe Balances and Approvals");

      // Ensure Safe has enough sell tokens
      await ensureTokenBalance(
        provider,
        safeWallet,
        sellTokenAddress,
        sellAmount
      );

      // Get initial balances
      const initialSellBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        safeWallet
      );
      const initialBuyBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        safeWallet
      );

      console.log(
        `   Initial ${sellToken}: ${formatBalance(
          initialSellBalance,
          getTokenDecimals(sellToken)
        )}`
      );
      console.log(
        `   Initial ${buyToken}: ${formatBalance(
          initialBuyBalance,
          getTokenDecimals(buyToken)
        )}`
      );

      // Check and approve VaultRelayer from Safe
      const sellTokenContract = new ethers.Contract(
        sellTokenAddress,
        ERC20_ABI,
        provider
      );

      const allowance = await sellTokenContract.allowance(
        safeWallet,
        addresses.vaultRelayer
      );

      if (allowance < sellAmount) {
        console.log("   Approving VaultRelayer from Safe...");

        // Fund Safe with ETH for gas
        const fundTx = await wallet.sendTransaction({
          to: safeWallet,
          value: ethers.parseEther("1"),
        });
        await fundTx.wait();

        // Impersonate Safe to approve
        await provider.send("anvil_impersonateAccount", [safeWallet]);
        const safeSigner = await provider.getSigner(safeWallet);
        const tokenAsSafe = new ethers.Contract(
          sellTokenAddress,
          ERC20_ABI,
          safeSigner
        );

        const approveTx = await tokenAsSafe.approve(
          addresses.vaultRelayer,
          ethers.parseUnits("1000000", 18)
        );
        await approveTx.wait();
        await provider.send("anvil_stopImpersonatingAccount", [safeWallet]);
        console.log("   ✅ Approved");
      } else {
        console.log("   ✅ Already approved");
      }

      // Step 3: Get quote
      console.log("\n📍 STEP 3: Get Quote from Orderbook");

      const quote = await getQuote(
        sellTokenAddress,
        buyTokenAddress,
        sellAmount.toString(),
        safeWallet
      );

      expect(quote).toBeDefined();
      expect(quote.quote).toBeDefined();

      const quoteBuyAmount = BigInt(quote.quote.buyAmount);
      const surplusPercent = 10;
      const surplusMultiplier = 1 - surplusPercent / 100;
      const adjustedBuyAmount = (
        (quoteBuyAmount * BigInt(Math.floor(surplusMultiplier * 10000))) /
        10000n
      ).toString();

      console.log(
        `   Quote: ${formatBalance(
          BigInt(quote.quote.sellAmount),
          getTokenDecimals(sellToken)
        )} ${sellToken} for ${formatBalance(
          quoteBuyAmount,
          getTokenDecimals(buyToken)
        )} ${buyToken}`
      );
      console.log(
        `   Adjusted (${surplusPercent}% surplus): ${formatBalance(
          BigInt(adjustedBuyAmount),
          getTokenDecimals(buyToken)
        )} ${buyToken}`
      );

      // Step 4: Configure Safe domain verifier
      console.log("\n📍 STEP 4: Configure Domain Verifier");

      const settlementContract = new ethers.Contract(
        addresses.settlement,
        SETTLEMENT_ABI,
        provider
      );
      const domainSeparator = await settlementContract.domainSeparator();

      console.log("   Setting Settlement as domain verifier...");
      await provider.send("anvil_impersonateAccount", [safeWallet]);
      let safeSigner = await provider.getSigner(safeWallet);

      const setDomainVerifierData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "address"],
        [domainSeparator, addresses.settlement]
      );

      const setVerifierTx = await safeSigner.sendTransaction({
        to: safeWallet,
        data: "0x3365582c" + setDomainVerifierData.slice(2),
      });
      await setVerifierTx.wait();
      await provider.send("anvil_stopImpersonatingAccount", [safeWallet]);
      console.log("   ✅ Domain verifier configured");

      // Step 5: Create and pre-sign order
      console.log("\n📍 STEP 5: Create and Pre-Sign Order");

      const orderData: OrderData = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        receiver: safeWallet,
        sellAmount: quote.quote.sellAmount,
        buyAmount: adjustedBuyAmount,
        validTo: quote.quote.validTo,
        appData: quote.quote.appData,
        feeAmount: "0",
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

      const orderHash = ethers.TypedDataEncoder.hash(
        domain,
        { Order: ORDER_TYPE_FIELDS },
        orderData
      );

      const orderUidForPreSign = ethers.concat([
        orderHash,
        safeWallet,
        ethers.toBeHex(orderData.validTo, 4),
      ]);

      console.log("   Pre-signing order from Safe...");
      await provider.send("anvil_impersonateAccount", [safeWallet]);
      safeSigner = await provider.getSigner(safeWallet);

      const SETTLEMENT_PRESIGN_ABI = [
        "function setPreSignature(bytes,bool) external",
      ];
      const settlementAsSafe = new ethers.Contract(
        addresses.settlement,
        SETTLEMENT_PRESIGN_ABI,
        safeSigner
      );

      const preSignTx = await settlementAsSafe.setPreSignature(
        orderUidForPreSign,
        true
      );
      await preSignTx.wait();
      await provider.send("anvil_stopImpersonatingAccount", [safeWallet]);
      console.log("   ✅ Order pre-signed");

      // Step 6: Submit order with presignature
      console.log("\n📍 STEP 6: Submit Order to Orderbook");

      const orderPayload = {
        ...orderData,
        from: safeWallet,
        signature: safeWallet,
        signingScheme: "presign",
      };

      const orderUrl = `${CONFIG.orderbookUrl}/api/v1/orders`;
      const response = await fetch(orderUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Order submission failed: ${response.statusText} - ${errorText}`
        );
      }

      const orderUid = (await response.text()).replace(/"/g, "");
      expect(orderUid).toBeDefined();
      console.log(`   ✅ Order submitted: ${orderUid}`);

      // Step 7: Wait for settlement
      console.log("\n📍 STEP 7: Wait for Settlement");
      console.log("   Waiting for order execution...");

      const settled = await waitForOrderExecution(orderUid, 600); // Increased to 10 minutes
      expect(settled).toBe(true);
      console.log("   ✅ Order settled");

      // Step 8: Verify balances changed
      console.log("\n📍 STEP 8: Verify Results");

      const finalSellBalance = await getTokenBalance(
        provider,
        sellTokenAddress,
        safeWallet
      );
      const finalBuyBalance = await getTokenBalance(
        provider,
        buyTokenAddress,
        safeWallet
      );

      console.log(
        `   Final ${sellToken}: ${formatBalance(
          finalSellBalance,
          getTokenDecimals(sellToken)
        )}`
      );
      console.log(
        `   Final ${buyToken}: ${formatBalance(
          finalBuyBalance,
          getTokenDecimals(buyToken)
        )}`
      );

      // Assertions
      expect(finalSellBalance).toBeLessThan(initialSellBalance);
      expect(finalBuyBalance).toBeGreaterThan(initialBuyBalance);

      console.log("\n✅ Test passed: Safe traded successfully via CoWShed!");
    }, 600000); // 10 minutes timeout
  });

  describe("Safe Trading with Pre-Hook", () => {
    /**
     * This test demonstrates hooks execution with Safe wallets by using
     * EIP-712 signature from the Safe owner instead of presignature.
     *
     * Key insight: HooksTrampoline works with EIP-712 signatures, not presignature.
     * By having the Safe owner sign the order directly, hooks execute normally.
     *
     */
    it("should execute a pre-hook before settling the order", async () => {
      const sellToken = "USDC";
      const buyToken = "WETH";
      const sellAmount = parseAmount("50e6"); // 50 USDC

      const sellTokenAddress = getTokenAddress(sellToken);
      const buyTokenAddress = getTokenAddress(buyToken);

      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(
        `Test: Safe Trading with Pre-Hook (${sellToken} -> ${buyToken})`
      );
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // Step 1: Create recipient wallet for hook transfer
      console.log("\n📍 STEP 1: Setup Hook Recipient");
      const hookRecipientKey =
        "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"; // Anvil account #4
      const hookRecipient = new ethers.Wallet(hookRecipientKey, provider);

      console.log(`   Hook recipient: ${hookRecipient.address}`);

      // Step 3: Setup balances
      console.log("\n📍 STEP 2: Setup Balances");

      // Owner needs USDC to place the order
      await ensureTokenBalance(
        provider,
        wallet.address,
        sellTokenAddress,
        sellAmount
      );

      // Owner also needs DAI for the pre-hook transfer (hooks execute from `from` address)
      const hookTransferAmount = parseAmount("10e18"); // Transfer 10 DAI in pre-hook
      const daiAddress = getTokenAddress("DAI");
      await ensureTokenBalance(
        provider,
        wallet.address,
        daiAddress,
        hookTransferAmount
      );

      const initialRecipientDai = await getTokenBalance(
        provider,
        daiAddress,
        hookRecipient.address
      );
      console.log(
        `   Initial recipient DAI: ${formatBalance(
          initialRecipientDai,
          getTokenDecimals("DAI")
        )}`
      );

      // Approve VaultRelayer from owner (who has the USDC)
      const sellTokenContract = new ethers.Contract(
        sellTokenAddress,
        ERC20_ABI,
        provider
      );
      const allowance = await sellTokenContract.allowance(
        wallet.address,
        addresses.vaultRelayer
      );

      if (allowance < sellAmount) {
        console.log("   Approving VaultRelayer from owner...");
        await approveToken(
          wallet,
          sellTokenAddress,
          addresses.vaultRelayer,
          ethers.parseUnits("1000000", 6)
        );
        console.log("   ✅ Approved");
      }

      // Approve HooksTrampoline to transfer DAI for the pre-hook (from owner)
      const daiContract = new ethers.Contract(daiAddress, ERC20_ABI, provider);
      const hookAllowance = await daiContract.allowance(
        wallet.address,
        allAddresses.cowProtocol.hooksTrampoline
      );

      if (hookAllowance < hookTransferAmount) {
        console.log("   Approving HooksTrampoline from owner...");
        await approveToken(
          wallet,
          daiAddress,
          allAddresses.cowProtocol.hooksTrampoline,
          ethers.parseUnits("1000000", 18)
        );
        console.log("   ✅ HooksTrampoline approved");
      }

      // Step 3: Create hooks in appData (same as EOA approach)
      console.log("\n📍 STEP 3: Create Hook in AppData");

      const erc20Iface = new ethers.Interface(ERC20_ABI);
      // Use transferFrom because HooksTrampoline executes as the settlement contract
      // The trader must approve HooksTrampoline to spend their tokens
      const transferCallData = erc20Iface.encodeFunctionData("transferFrom", [
        wallet.address, // from: trader (owner)
        hookRecipient.address, // to: recipient
        hookTransferAmount, // amount
      ]);

      // Hook format for appData (executed by HooksTrampoline)
      const preHook = {
        target: daiAddress,
        callData: transferCallData,
        gasLimit: "100000",
      };

      const appDataContent = {
        version: "1.1.0",
        metadata: {
          hooks: {
            pre: [preHook],
            post: [],
          },
        },
      };

      const appDataHash = computeAppDataHash(appDataContent);
      await uploadAppData(appDataHash, appDataContent);

      console.log(`   Pre-hook: Transfer ${formatBalance(
        hookTransferAmount,
        18
      )} DAI to ${hookRecipient.address.substring(0, 10)}...`);
      console.log(`   AppData hash: ${appDataHash.substring(0, 20)}...`);
      console.log("   ✅ Hooks configured in appData");

      // Step 4: Get quote with custom appData
      console.log("\n📍 STEP 4: Get Quote");

      const quote = await getQuote(
        sellTokenAddress,
        buyTokenAddress,
        sellAmount.toString(),
        wallet.address, // Quote for owner who's placing the order
        appDataHash
      );

      const quoteBuyAmount = BigInt(quote.quote.buyAmount);
      const surplusPercent = 10;
      const adjustedBuyAmount = (
        (quoteBuyAmount *
          BigInt(Math.floor((1 - surplusPercent / 100) * 10000))) /
        10000n
      ).toString();

      console.log(
        `   Quote: ${formatBalance(
          BigInt(quote.quote.sellAmount),
          6
        )} USDC -> ${formatBalance(BigInt(adjustedBuyAmount), 18)} WETH`
      );

      // Step 5: Sign and submit order (using Safe OWNER's EIP-712 signature)
      console.log("\n📍 STEP 5: Sign and Submit Order");

      // Order from the Safe owner's address (not Safe itself)
      // But receiver is Safe, so funds end up in Safe
      const orderData: OrderData = {
        sellToken: sellTokenAddress,
        buyToken: buyTokenAddress,
        receiver: safeWallet, // Receive to Safe
        sellAmount: quote.quote.sellAmount,
        buyAmount: adjustedBuyAmount,
        validTo: quote.quote.validTo,
        appData: appDataHash, // Use custom appData with hooks
        feeAmount: "0",
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

      // Sign with Safe OWNER (not presignature) - this allows hooks to work!
      console.log("   Signing order with Safe owner (enables hooks)...");
      const signature = await wallet.signTypedData(
        domain,
        { Order: ORDER_TYPE_FIELDS },
        orderData
      );
      console.log(`   ✅ Signature: ${signature.substring(0, 20)}...`);

      // Submit order - FROM owner, RECEIVE to Safe
      // Hook executes with Safe's approved tokens
      const orderPayload = {
        ...orderData,
        from: wallet.address, // Order from owner (who signs it)
        signature: signature, // Signed by owner
        signingScheme: "eip712", // EIP-712 scheme
      };

      const response = await fetch(`${CONFIG.orderbookUrl}/api/v1/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Order submission failed: ${errorText}`);
      }

      const orderUid = (await response.text()).replace(/"/g, "");
      console.log(`   ✅ Order submitted: ${orderUid.substring(0, 30)}...`);

      // Step 6: Wait for settlement
      console.log("\n📍 STEP 6: Wait for Settlement");

      const settled = await waitForOrderExecution(orderUid, 600); // 10 minutes timeout
      expect(settled).toBe(true);
      console.log("   ✅ Order settled");

      // Step 7: Verify pre-hook executed
      console.log("\n📍 STEP 7: Verify Pre-Hook Execution");

      const finalRecipientDai = await getTokenBalance(
        provider,
        daiAddress,
        hookRecipient.address
      );

      console.log(
        `   Final recipient DAI: ${formatBalance(
          finalRecipientDai,
          18
        )}`
      );

      // Pre-hook should have transferred DAI to recipient
      const daiReceived = finalRecipientDai - initialRecipientDai;
      console.log(`   DAI received: ${formatBalance(daiReceived, 18)}`);

      expect(finalRecipientDai).toBeGreaterThan(initialRecipientDai);
      expect(daiReceived).toBeGreaterThanOrEqual(hookTransferAmount);

      console.log("\n✅ Test passed: Pre-hook executed successfully!");
    }, 600000); // 10 minutes timeout
  });
});
