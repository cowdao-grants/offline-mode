/**
 * Utility functions for Anvil time manipulation and snapshot management in tests
 */

import { ethers } from 'ethers';

/**
 * Advances time in Anvil by the specified number of seconds and mines a new block
 * to ensure the new timestamp is reflected.
 *
 * @param provider - The ethers JsonRpcProvider connected to Anvil
 * @param seconds - Number of seconds to advance
 * @returns The new block timestamp
 */
export async function advanceTime(
  provider: ethers.JsonRpcProvider | ethers.Provider,
  seconds: number
): Promise<number> {
  // Cast to JsonRpcProvider to access send method
  const jsonRpcProvider = provider as ethers.JsonRpcProvider;

  // Increase time by the specified seconds
  await jsonRpcProvider.send('evm_increaseTime', [seconds]);

  // Mine a new block to apply the time change
  await jsonRpcProvider.send('evm_mine', []);

  // Get the new block timestamp
  const block = await provider.getBlock('latest');
  if (!block) {
    throw new Error('Failed to get latest block');
  }

  return block.timestamp;
}

/**
 * Advances time and mines multiple blocks.
 * Useful when you need to advance time and ensure multiple blocks are mined.
 *
 * @param provider - The ethers JsonRpcProvider connected to Anvil
 * @param seconds - Number of seconds to advance
 * @param blocks - Number of blocks to mine (default: 1)
 * @returns The new block timestamp
 */
export async function advanceTimeAndMineBlocks(
  provider: ethers.JsonRpcProvider | ethers.Provider,
  seconds: number,
  blocks: number = 1
): Promise<number> {
  // Cast to JsonRpcProvider to access send method
  const jsonRpcProvider = provider as ethers.JsonRpcProvider;

  // Increase time by the specified seconds
  await jsonRpcProvider.send('evm_increaseTime', [seconds]);

  // Mine the specified number of blocks
  for (let i = 0; i < blocks; i++) {
    await jsonRpcProvider.send('evm_mine', []);
  }

  // Get the new block timestamp
  const block = await provider.getBlock('latest');
  if (!block) {
    throw new Error('Failed to get latest block');
  }

  return block.timestamp;
}

/**
 * Sets the next block timestamp to a specific value.
 *
 * @param provider - The ethers JsonRpcProvider connected to Anvil
 * @param timestamp - The Unix timestamp to set for the next block
 */
export async function setNextBlockTimestamp(
  provider: ethers.JsonRpcProvider | ethers.Provider,
  timestamp: number
): Promise<void> {
  // Cast to JsonRpcProvider to access send method
  const jsonRpcProvider = provider as ethers.JsonRpcProvider;

  await jsonRpcProvider.send('evm_setNextBlockTimestamp', [timestamp]);
  await jsonRpcProvider.send('evm_mine', []);
}

/**
 * Synchronize container system time with Anvil's blockchain time.
 * This ensures all services create orders with validTo based on blockchain time.
 *
 * Requires containers to have cap_add: [SYS_TIME] in docker-compose.yml
 *
 * @param provider - The ethers JsonRpcProvider connected to Anvil
 */
export async function syncContainerTime(
  provider: ethers.JsonRpcProvider | ethers.Provider
): Promise<void> {
  try {
    const { execSync } = require('child_process');

    // Get current blockchain time
    const block = await provider.getBlock('latest');
    if (!block) {
      console.log('⚠️  Could not get blockchain time');
      return;
    }

    const blockchainTime = block.timestamp;
    const systemTime = Math.floor(Date.now() / 1000);
    const offset = blockchainTime - systemTime;

    // Only sync if offset is significant (>5 seconds)
    if (Math.abs(offset) < 5) {
      return;
    }

    console.log(`⏰ Syncing container time (offset: ${offset}s)...`);

    // Sync all service containers to blockchain time
    const containers = ['orderbook', 'autopilot', 'driver', 'watch-tower'];
    for (const container of containers) {
      try {
        execSync(`docker compose exec -T ${container} date -s "@${blockchainTime}"`, {
          stdio: 'ignore'
        });
      } catch (error) {
        // Silently ignore - container may not be running or lack SYS_TIME capability
      }
    }

    console.log(`✅ Container time synced with blockchain`);
  } catch (error) {
    // Silently ignore - container may not have SYS_TIME capability
  }
}

/**
 * Synchronize Anvil's blockchain time with current system time.
 *
 * NOTE: This only works if blockchain time is behind or equal to system time.
 * If blockchain time has already advanced ahead (due to mining blocks during tests),
 * this function will silently fail since Anvil cannot set timestamps backwards.
 *
 * LIMITATION: After running tests for a while, blockchain time drifts ahead.
 * To reset, restart the chain service: docker compose restart chain
 *
 * @param provider - The ethers JsonRpcProvider connected to Anvil
 */
export async function syncBlockchainTime(
  provider: ethers.JsonRpcProvider | ethers.Provider
): Promise<void> {
  const jsonRpcProvider = provider as ethers.JsonRpcProvider;
  const currentTimestamp = Math.floor(Date.now() / 1000);

  try {
    // Get current blockchain time
    const block = await provider.getBlock('latest');
    if (block && block.timestamp > currentTimestamp) {
      // Blockchain is ahead - cannot sync backwards, silently skip
      return;
    }

    await jsonRpcProvider.send('evm_setNextBlockTimestamp', [currentTimestamp]);
    await jsonRpcProvider.send('evm_mine', []);
    console.log(`⏰ Blockchain time synchronized: ${new Date(currentTimestamp * 1000).toISOString()}`);
  } catch (error) {
    // Silently ignore - likely timestamp is already ahead
  }
}

/**
 * Takes a snapshot of the current Anvil blockchain state.
 * Returns a snapshot ID that can be used to revert to this state later.
 *
 * @param provider - The ethers JsonRpcProvider connected to Anvil
 * @returns The snapshot ID as a hex string
 *
 * @example
 * ```typescript
 * const snapshotId = await takeSnapshot(provider);
 * // ... run tests that modify state ...
 * await revertToSnapshot(provider, snapshotId);
 * ```
 */
export async function takeSnapshot(
  provider: ethers.JsonRpcProvider | ethers.Provider
): Promise<string> {
  const jsonRpcProvider = provider as ethers.JsonRpcProvider;
  const snapshotId = await jsonRpcProvider.send('evm_snapshot', []);
  return snapshotId;
}

/**
 * Reverts the Anvil blockchain state to a previously taken snapshot.
 *
 * @param provider - The ethers JsonRpcProvider connected to Anvil
 * @param snapshotId - The snapshot ID returned from takeSnapshot()
 * @returns true if the revert was successful
 *
 * @example
 * ```typescript
 * const snapshotId = await takeSnapshot(provider);
 * // ... run tests that modify state ...
 * await revertToSnapshot(provider, snapshotId);
 * ```
 */
export async function revertToSnapshot(
  provider: ethers.JsonRpcProvider | ethers.Provider,
  snapshotId: string
): Promise<boolean> {
  const jsonRpcProvider = provider as ethers.JsonRpcProvider;
  const result = await jsonRpcProvider.send('evm_revert', [snapshotId]);
  return result;
}

/**
 * Helper class for managing Anvil snapshots in test suites.
 * Automatically takes a snapshot before all tests and reverts before each test.
 *
 * @example
 * ```typescript
 * describe("My Test Suite", () => {
 *   let provider: ethers.JsonRpcProvider;
 *   const snapshot = new SnapshotManager();
 *
 *   beforeAll(async () => {
 *     provider = new ethers.JsonRpcProvider("http://localhost:8545");
 *     await snapshot.takeInitialSnapshot(provider);
 *   });
 *
 *   beforeEach(async () => {
 *     await snapshot.revertToInitial();
 *   });
 *
 *   it("test 1", async () => {
 *     // This test starts with clean state
 *   });
 *
 *   it("test 2", async () => {
 *     // This test also starts with the same clean state
 *   });
 * });
 * ```
 */
export class SnapshotManager {
  private provider?: ethers.JsonRpcProvider | ethers.Provider;
  private initialSnapshotId?: string;

  /**
   * Takes the initial snapshot. Call this in beforeAll().
   */
  async takeInitialSnapshot(provider: ethers.JsonRpcProvider | ethers.Provider): Promise<void> {
    this.provider = provider;
    this.initialSnapshotId = await takeSnapshot(provider);
    console.log(`📸 Initial snapshot taken: ${this.initialSnapshotId}`);
  }

  /**
   * Reverts to the initial snapshot and takes a new one.
   * Call this in beforeEach() to reset state before each test.
   */
  async revertToInitial(): Promise<void> {
    if (!this.provider || !this.initialSnapshotId) {
      throw new Error('Must call takeInitialSnapshot() first');
    }

    await revertToSnapshot(this.provider, this.initialSnapshotId);

    // Take a new snapshot for the next revert
    // (Anvil snapshots are consumed when reverted)
    this.initialSnapshotId = await takeSnapshot(this.provider);
  }

  /**
   * Gets the current snapshot ID.
   */
  getSnapshotId(): string | undefined {
    return this.initialSnapshotId;
  }
}
