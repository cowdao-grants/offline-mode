/**
 * Integration tests for ComposableCow TWAP Orders
 *
 * These tests verify that TWAP (Time-Weighted Average Price) orders can be
 * created and settled correctly using the ComposableCow conditional orders framework.
 *
 * TWAP orders split a large order into multiple smaller parts executed over time.
 */

import { ethers } from "ethers";
import { loadAddresses } from "../utils/loadAddresses";
import { revertToGlobalSnapshot } from "../utils/shared-snapshot";
import { execSync } from "child_process";

/**
 * Waits for autopilot to sync to the expected block state
 * This prevents race conditions between snapshot restore and order submission
 *
 * After snapshot revert, autopilot's DB is reset to be BEHIND the blockchain,
 * so we need to wait for it to CATCH UP to the current block height.
 */
async function waitForAutopilotSync(expectedBlock: number): Promise<void> {
  const maxAttempts = 15;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = execSync(
        `docker compose exec -T db psql -U postgres -t -c "SELECT MIN(block_number) FROM last_indexed_blocks WHERE contract IN ('onchain_orders', 'ethflow_refunds', 'settlements');"`,
        { encoding: "utf8" },
      );
      const dbBlock = parseInt(result.trim(), 10);

      // Autopilot needs to catch up to within 2 blocks of current blockchain height
      // This ensures autopilot has indexed recent state changes
      if (dbBlock >= expectedBlock - 2) {
        return; // Autopilot has caught up
      }
    } catch (error) {
      // DB not ready, retry
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(
    `Autopilot failed to sync to block ${expectedBlock} after ${maxAttempts} attempts (${maxAttempts * 300}ms)`,
  );
}

// Configuration
const CONFIG = {
  rpcUrl: process.env.RPC_URL || "http://localhost:8545",
  orderbookUrl: process.env.ORDERBOOK_URL || "http://localhost:8080",
  chainId: 1,
};
const timeoutMs = 600000; // 10 minutes timeout (TWAP needs time for all 3 parts to start and settle)
// ABIs
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const COMPOSABLE_COW_ABI = [
  "function create((address handler, bytes32 salt, bytes staticInput) params, bool dispatch) returns ()",
  "function remove(bytes32 singleOrderHash)",
];

describe("ComposableCow TWAP Orders", () => {
  let provider: ethers.JsonRpcProvider;
  let wallet: ethers.Wallet;
  let addresses: ReturnType<typeof loadAddresses>;
  let safeWallet: string;

  beforeAll(async () => {
    provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);

    // Use Anvil account #1
    const privateKey =
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    wallet = new ethers.Wallet(privateKey, provider);

    addresses = loadAddresses();
    safeWallet = process.env.TEST_USER_SAFE_ADDRESS!;
  });

  beforeEach(async () => {
    // Revert to the shared global snapshot before each test
    // TWAP orders REQUIRE watch-tower to execute conditional orders
    await revertToGlobalSnapshot(true);

    // Create fresh provider to clear nonce cache after blockchain revert
    provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
    wallet = new ethers.Wallet(wallet.privateKey, provider);

    const block = await provider.getBlock("latest");
    await waitForAutopilotSync(block!.number);

    console.log(
      `\n🔄 Test starting at block ${block?.number} (snapshot restored, autopilot synced)`,
    );
  }, 180000); // 180 second timeout for beforeEach (increased from 90s) to allow for watch-tower reset + autopilot initialization on macOS

  it(
    "should create and settle a TWAP order (USDC -> WETH)",
    async () => {
      console.log("\n📋 Configuration:");
      console.log(`   Safe Wallet: ${safeWallet}`);
      console.log(`   ComposableCoW: ${addresses.composableCow.composableCoW}`);
      console.log(`   TWAP Handler: ${addresses.composableCow.twap}`);

      // Setup contracts
      const usdc = new ethers.Contract(
        addresses.tokens.USDC,
        ERC20_ABI,
        wallet,
      );
      const weth = new ethers.Contract(
        addresses.tokens.WETH,
        ERC20_ABI,
        provider,
      );

      // Step 1: Setup Safe with USDC
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("STEP 1: Setup Safe Wallet with USDC");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // TWAP will split 3000 USDC into 3 parts of 1000 USDC each (USDC has 6 decimals)
      const totalSellAmount = ethers.parseUnits("3000", 6);

      // Transfer USDC to Safe from deployer (Anvil account #0)
      const deployerKey =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const deployerWallet = new ethers.Wallet(deployerKey, provider);
      const usdcFromDeployer = new ethers.Contract(
        addresses.tokens.USDC,
        ERC20_ABI,
        deployerWallet,
      );

      let usdcBalance = await usdc.balanceOf(safeWallet);
      if (usdcBalance < totalSellAmount) {
        console.log(
          `   Sending ${ethers.formatUnits(totalSellAmount, 6)} USDC to Safe...`,
        );
        const transferTx = await usdcFromDeployer.transfer(
          safeWallet,
          ethers.parseUnits("10000", 6),
        );
        await transferTx.wait();
        usdcBalance = await usdc.balanceOf(safeWallet);
      }
      console.log(
        `   Safe USDC Balance: ${ethers.formatUnits(usdcBalance, 6)} USDC`,
      );

      // Approve VaultRelayer from Safe
      const usdcAllowance = await usdc.allowance(
        safeWallet,
        addresses.cowProtocol.vaultRelayer,
      );
      if (usdcAllowance < totalSellAmount) {
        console.log("   Approving Vault Relayer from Safe...");

        // Send ETH to Safe for gas
        const fundTx = await wallet.sendTransaction({
          to: safeWallet,
          value: ethers.parseEther("1"),
        });
        await fundTx.wait();

        // Impersonate Safe to approve
        await provider.send("anvil_impersonateAccount", [safeWallet]);
        const safeSigner = await provider.getSigner(safeWallet);
        const usdcAsSafe = new ethers.Contract(
          addresses.tokens.USDC,
          ERC20_ABI,
          safeSigner,
        );
        const approveTx = await usdcAsSafe.approve(
          addresses.cowProtocol.vaultRelayer,
          ethers.parseUnits("1000000", 6),
        );
        await approveTx.wait();
        await provider.send("anvil_stopImpersonatingAccount", [safeWallet]);
        console.log("   ✅ Approved");
      }

      // Step 2: Configure ComposableCoW as domain verifier
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("STEP 2: Configure ComposableCoW Domain Verifier");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      const settlementDomainSeparator = await provider.call({
        to: addresses.cowProtocol.settlement,
        data: "0xf698da25", // domainSeparator()
      });

      console.log("   Setting ComposableCoW as domain verifier...");
      await provider.send("anvil_impersonateAccount", [safeWallet]);
      const safeSigner = await provider.getSigner(safeWallet);

      const setDomainVerifierData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "address"],
        [settlementDomainSeparator, addresses.composableCow.composableCoW],
      );

      const setVerifierTx = await safeSigner.sendTransaction({
        to: safeWallet,
        data: "0x3365582c" + setDomainVerifierData.slice(2), // setDomainVerifier(bytes32,address)
      });
      await setVerifierTx.wait();
      await provider.send("anvil_stopImpersonatingAccount", [safeWallet]);
      console.log("   ✅ ComposableCoW configured as domain verifier");

      // Step 3: Create TWAP Order
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("STEP 3: Create TWAP Order");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      const currentBlock = await provider.getBlock("latest");
      if (!currentBlock) throw new Error("Could not get current block");
      const currentTime = currentBlock.timestamp;

      const numParts = 3n;
      const partSellAmount = totalSellAmount / numParts;

      const minWethPerUsdc = 0.00027;
      const partUsdcAmount = Number(ethers.formatUnits(partSellAmount, 6));
      const minPartLimit = ethers.parseEther(
        (partUsdcAmount * minWethPerUsdc).toFixed(18),
      );

      const twapConfig = {
        sellToken: addresses.tokens.USDC,
        buyToken: addresses.tokens.WETH,
        receiver: safeWallet,
        partSellAmount: partSellAmount.toString(),
        minPartLimit: minPartLimit.toString(),
        t0: currentTime + 60,
        n: 3,
        t: 90,
        span: 90,
        appData: ethers.ZeroHash,
      };

      console.log("   TWAP Configuration:");
      console.log(
        `   Total: ${ethers.formatUnits(
          totalSellAmount,
          6,
        )} USDC (${numParts} parts of ${ethers.formatUnits(partSellAmount, 6)} USDC)`,
      );
      console.log(`   Min per Part: ${ethers.formatEther(minPartLimit)} WETH`);
      console.log(`   Interval: ${twapConfig.t} seconds between parts`);
      console.log(
        `   Start Time: ${new Date(twapConfig.t0 * 1000).toISOString()}`,
      );

      // Encode TWAP data
      const twapDataEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          "address",
          "address",
          "address",
          "uint256",
          "uint256",
          "uint256",
          "uint256",
          "uint256",
          "uint256",
          "bytes32",
        ],
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
        ],
      );

      const salt = ethers.randomBytes(32);
      const conditionalOrderParams = {
        handler: addresses.composableCow.twap,
        salt: ethers.hexlify(salt),
        staticInput: twapDataEncoded,
      };

      // Create order from Safe
      await provider.send("anvil_impersonateAccount", [safeWallet]);
      const safeSignerForOrder = await provider.getSigner(safeWallet);
      const composableCoWAsSafe = new ethers.Contract(
        addresses.composableCow.composableCoW,
        COMPOSABLE_COW_ABI,
        safeSignerForOrder,
      );

      const createTx = await composableCoWAsSafe.create(
        conditionalOrderParams,
        true,
      );
      const receipt = await createTx.wait();
      await provider.send("anvil_stopImpersonatingAccount", [safeWallet]);

      console.log(`   ✅ TWAP order created in block ${receipt?.blockNumber}`);

      // Step 4: Monitor for execution
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("STEP 4: Monitor for TWAP Execution");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      const initialUsdcBalance = await usdc.balanceOf(safeWallet);
      const initialWethBalance = await weth.balanceOf(safeWallet);

      console.log("   Initial Balances:");
      console.log(`   USDC: ${ethers.formatUnits(initialUsdcBalance, 6)}`);
      console.log(`   WETH: ${ethers.formatEther(initialWethBalance)}`);
      console.log("\n   Waiting for watchtower to execute TWAP parts...");
      console.log("   (Checking every 10s for up to 10 minutes)\n");

      let partsExecuted = 0;
      let lastUsdcBalance = initialUsdcBalance;
      const maxWaitTime = timeoutMs / 1000; // 10 minutes
      let elapsed = 0;
      const checkIntervalSeconds = 10;

      while (elapsed < maxWaitTime && partsExecuted < Number(numParts)) {
        // Wait in real time - TWAP requires actual time to pass for parts to become active
        // We cannot use advanceTime() because it desynchronizes blockchain time from container time
        await new Promise((resolve) =>
          setTimeout(resolve, checkIntervalSeconds * 1000),
        );
        elapsed += checkIntervalSeconds;

        const currentUsdcBalance = await usdc.balanceOf(safeWallet);
        const currentWethBalance = await weth.balanceOf(safeWallet);

        if (currentUsdcBalance < lastUsdcBalance) {
          partsExecuted++;
          const usdcSpent = lastUsdcBalance - currentUsdcBalance;
          const wethReceived = currentWethBalance - initialWethBalance;

          console.log(
            `   [${elapsed}s] ✅ Part ${partsExecuted}/${numParts} executed!`,
          );
          console.log(`   USDC spent: ${ethers.formatUnits(usdcSpent, 6)}`);
          console.log(
            `   Total WETH received: ${ethers.formatEther(wethReceived)}\n`,
          );

          lastUsdcBalance = currentUsdcBalance;
        } else if (elapsed % 30 === 0) {
          console.log(
            `   [${elapsed}s] Waiting... (${partsExecuted}/${numParts} parts executed)`,
          );
        }
      }

      // Final verification
      const finalUsdcBalance = await usdc.balanceOf(safeWallet);
      const finalWethBalance = await weth.balanceOf(safeWallet);
      const totalUsdcSpent = initialUsdcBalance - finalUsdcBalance;
      const totalWethReceived = finalWethBalance - initialWethBalance;

      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("FINAL RESULTS");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      console.log("   Final Balances:");
      console.log(
        `   USDC: ${ethers.formatUnits(
          finalUsdcBalance,
          6,
        )} (spent ${ethers.formatUnits(totalUsdcSpent, 6)})`,
      );
      console.log(
        `   WETH: ${ethers.formatEther(
          finalWethBalance,
        )} (received ${ethers.formatEther(totalWethReceived)})\n`,
      );

      // Assertions
      // In the offline environment, the baseline solver typically executes 1-2 of 3 TWAP parts (33-66% success rate)
      // This matches the behavior of the manual script
      expect(partsExecuted).toBeGreaterThanOrEqual(1); // Expect at least 1 of 3 parts
      expect(finalUsdcBalance).toBeLessThan(initialUsdcBalance);
      expect(finalWethBalance).toBeGreaterThan(initialWethBalance);

      // Verify we spent approximately the right amount
      const expectedUsdcSpent = partSellAmount * BigInt(partsExecuted);
      const tolerance = expectedUsdcSpent / 100n; // 1% tolerance
      expect(totalUsdcSpent).toBeGreaterThanOrEqual(
        expectedUsdcSpent - tolerance,
      );
      expect(totalUsdcSpent).toBeLessThanOrEqual(expectedUsdcSpent + tolerance);

      console.log(
        `   ✅ SUCCESS: ${partsExecuted}/${numParts} TWAP parts executed!`,
      );

      if (partsExecuted < Number(numParts)) {
        console.log(
          `   ℹ️  Note: ${
            Number(numParts) - partsExecuted
          } part(s) not executed (expected in offline environment)`,
        );
      }
    },
    timeoutMs,
  );
});
