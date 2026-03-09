/**
 * Jest global teardown
 * Restores blockchain to snapshot after all tests complete
 */

import { ethers } from 'ethers';
import path from 'path';

export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up after tests...\n');

  try {
    const PORT_CHAIN = process.env.PORT_CHAIN || '8545';
    const provider = new ethers.JsonRpcProvider(`http://localhost:${PORT_CHAIN}`);

    // Import revert function
    const { revertToGlobalSnapshot } = await import('../utils/shared-snapshot');

    console.log('🔄 Restoring blockchain and cleaning all services...\n');

    // Revert one final time to leave environment clean
    // ALWAYS reset watch-tower in teardown to ensure clean state
    await revertToGlobalSnapshot(true);

    console.log('✅ Blockchain restored to base state (block 12593380)\n');
    console.log('✅ All services cleaned and ready for next test run\n');

  } catch (error) {
    // Silently ignore teardown errors - they're not critical
    // Tests have already completed, cleanup is best-effort
  }
}
