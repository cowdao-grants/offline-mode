/**
 * Shared snapshot manager for all test suites
 * This ensures all tests start from the same clean blockchain state
 */

import { ethers } from "ethers";
import { syncContainerTime, SnapshotManager } from "./anvil-helpers";

// Global snapshot manager shared across all test suites
const globalSnapshot = new SnapshotManager();
let isInitialized = false;

export async function initializeGlobalSnapshot(provider: ethers.JsonRpcProvider): Promise<void> {
  if (isInitialized) {
    console.log("⏭️  Global snapshot already initialized, skipping...");
    return;
  }

  console.log("🔧 Initializing global snapshot for all tests...");
  
  // Sync container time once for all tests
  await syncContainerTime(provider);
  
  // Take the initial snapshot
  await globalSnapshot.takeInitialSnapshot(provider);
  
  isInitialized = true;
  console.log("✅ Global snapshot initialized");
}

export async function revertToGlobalSnapshot(): Promise<void> {
  if (!isInitialized) {
    throw new Error("Global snapshot not initialized. Call initializeGlobalSnapshot first.");
  }
  
  await globalSnapshot.revertToInitial();
}

export function getGlobalSnapshot(): SnapshotManager {
  return globalSnapshot;
}
