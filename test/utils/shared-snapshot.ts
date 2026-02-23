/**
 * Shared snapshot manager for all test suites
 * This ensures all tests start from the same clean blockchain state
 *
 * Uses Anvil snapshots to save/restore blockchain state at block 12593380
 * (environment variables don't persist across Jest's test file isolation)
 */

import { ethers } from "ethers";
import { syncContainerTime, takeSnapshot, revertToSnapshot } from "./anvil-helpers";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const ORDERBOOK_URL = process.env.ORDERBOOK_URL || "http://localhost:8080";
const DRIVER_PORT = process.env.PORT_DRIVER || "9000";
const SNAPSHOT_FILE = path.join(__dirname, "../../.snapshot-id.tmp");
const SNAPSHOT_BLOCK_FILE = path.join(__dirname, "../../.snapshot-block.tmp");

/**
 * Waits for chain to be healthy (uses docker health check)
 */
async function waitForChainHealthy(maxAttempts: number = 30): Promise<void> {
  console.log('⏳ Waiting for chain to be healthy...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      execSync('docker compose ps chain --format json | grep -q "healthy"', {
        stdio: 'pipe'
      });
      console.log('✅ Chain is healthy');
      return;
    } catch {
      // Health check failed, retry with small delay
      execSync('sleep 0.5', { stdio: 'pipe' });
    }
  }
  throw new Error('Chain failed to become healthy after 30 attempts');
}

/**
 * Waits for baseline to be ready by testing if it can provide liquidity
 * Makes actual quote requests until baseline returns valid liquidity data
 */
async function waitForBaselineReady(maxAttempts: number = 60): Promise<void> {
  console.log('⏳ Waiting for baseline to index liquidity pools...');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Make a test quote request for a known pair (DAI/WETH)
      // If baseline has indexed liquidity, this will succeed
      const quoteUrl = `${ORDERBOOK_URL}/api/v1/quote`;
      const quoteRequest = {
        sellToken: '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
        buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',  // WETH
        sellAmountBeforeFee: '100000000000000000000', // 100 DAI
        kind: 'sell',
        from: '0x0000000000000000000000000000000000000000',
      };

      const response = await fetch(quoteUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteRequest),
      });

      if (response.ok) {
        const quote = await response.json() as any;
        if (quote && quote.quote && quote.quote.buyAmount) {
          console.log(`✅ Baseline ready (attempt ${attempt}/${maxAttempts})`);
          return;
        }
      }

      // Quote failed, baseline not ready yet
      if (attempt % 10 === 0) {
        console.log(`⏳ Still waiting for baseline... (attempt ${attempt}/${maxAttempts})`);
      }

      // Wait 1 second between attempts
      execSync('sleep 1', { stdio: 'pipe' });

    } catch (error) {
      // Request failed, baseline not ready
      if (attempt % 10 === 0) {
        console.log(`⏳ Still waiting for baseline... (attempt ${attempt}/${maxAttempts})`);
      }
      execSync('sleep 1', { stdio: 'pipe' });
    }
  }

  throw new Error(`Baseline failed to become ready after ${maxAttempts} attempts (${maxAttempts} seconds)`);
}

/**
 * Waits for orderbook to be ready by checking its API
 */
async function waitForOrderbookReady(maxAttempts: number = 30): Promise<void> {
  console.log('⏳ Waiting for orderbook to be ready...');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Try to fetch orderbook version endpoint (should be fast)
      const response = await fetch(`${ORDERBOOK_URL}/api/v1/version`);

      if (response.ok) {
        console.log(`✅ Orderbook ready`);
        return;
      }

      execSync('sleep 0.5', { stdio: 'pipe' });
    } catch (error) {
      execSync('sleep 0.5', { stdio: 'pipe' });
    }
  }

  throw new Error(`Orderbook failed to become ready after ${maxAttempts} attempts`);
}

/**
 * Waits for watch-tower to be ready by checking if it's running and warmed up
 */
async function waitForWatchTowerReady(maxAttempts: number = 30): Promise<void> {
  console.log('⏳ Waiting for watch-tower to be ready...');

  // Step 1: Wait for container to be running
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = execSync('docker compose ps watch-tower --status running --format json', {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      if (result.trim().length > 0) {
        break; // Container is running, proceed to step 2
      }

      execSync('sleep 0.5', { stdio: 'pipe' });
    } catch (error) {
      execSync('sleep 0.5', { stdio: 'pipe' });
    }

    if (attempt === maxAttempts) {
      throw new Error(`Watch-tower container failed to start after ${maxAttempts} attempts`);
    }
  }

  // Step 2: Wait for watch-tower to warm up by checking logs
  console.log('⏳ Waiting for watch-tower to warm up...');
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const logs = execSync('docker compose logs watch-tower --tail 50 2>&1', {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      // Check if watch-tower has warmed up (synced to current block)
      if (logs.includes('Chain watcher is warmed up') && logs.includes('Start block watcher')) {
        console.log(`✅ Watch-tower ready and warmed up`);

        // Add extra 2 seconds to ensure watch-tower is fully ready to process new blocks
        await new Promise(resolve => setTimeout(resolve, 2000));
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Watch-tower failed to warm up after 20 attempts (10 seconds)`);
}

/**
 * Waits for driver to be ready by checking its metrics endpoint
 */
async function waitForDriverReady(maxAttempts: number = 30): Promise<void> {
  console.log('⏳ Waiting for driver to be ready...');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Check if driver metrics endpoint is responding (using PORT_DRIVER from env)
      const result = execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${DRIVER_PORT}/metrics || echo "000"`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      if (result.trim() === '200') {
        console.log(`✅ Driver ready`);
        return;
      }

      execSync('sleep 0.5', { stdio: 'pipe' });
    } catch (error) {
      execSync('sleep 0.5', { stdio: 'pipe' });
    }
  }

  throw new Error(`Driver failed to become ready after ${maxAttempts} attempts`);
}

/**
 * Waits for autopilot to be ready by checking if it's processing blocks
 * After restart, autopilot needs time to warm up and start indexing
 */
async function waitForAutopilotReady(expectedBlock: number, maxAttempts: number = 30): Promise<void> {
  console.log('⏳ Waiting for autopilot to be ready and synced...');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = execSync(
        `docker compose exec -T db psql -U postgres -t -c "SELECT MIN(block_number) FROM last_indexed_blocks WHERE contract IN ('onchain_orders', 'ethflow_refunds', 'settlements');"`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      const dbBlock = parseInt(result.trim(), 10);

      // Autopilot needs to catch up to within 2 blocks of current blockchain height
      if (dbBlock >= expectedBlock - 2) {
        console.log(`✅ Autopilot ready and synced to block ${dbBlock}`);
        return;
      }

      if (attempt % 5 === 0) {
        console.log(`⏳ Autopilot syncing... (DB at block ${dbBlock}, waiting for ${expectedBlock})`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      // DB not ready, retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Autopilot failed to sync to block ${expectedBlock} after ${maxAttempts} attempts (${maxAttempts * 500}ms)`);
}

/**
 * Restarts specified Docker Compose services and waits for them to be ready
 * @param services - Array of service names to restart
 * @throws Error if restart fails or services don't become ready
 */
async function restartServicesAndWait(services: string[]): Promise<void> {
  const serviceList = services.join(' ');

  console.log(`🔄 Restarting services: ${serviceList}`);

  try {
    // Restart all services at once
    execSync(`docker compose restart ${serviceList}`, {
      stdio: 'pipe',
      timeout: 60000
    });

    console.log(`✅ Services restarted: ${serviceList}`);

    // Wait for each service to be ready using proper checks
    for (const service of services) {
      switch (service) {
        case 'chain':
          await waitForChainHealthy();
          break;
        case 'baseline':
          await waitForBaselineReady();
          break;
        case 'orderbook':
          await waitForOrderbookReady();
          break;
        case 'watch-tower':
          await waitForWatchTowerReady();
          break;
        case 'driver':
          await waitForDriverReady();
          break;
        default:
          console.log(`⚠️  No readiness check for service: ${service}`);
      }
    }

    console.log('✅ All services ready');

  } catch (error) {
    // Re-throw error without logging - Jest will display it properly
    throw new Error(`Failed to restart services (${serviceList}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function initializeGlobalSnapshot(provider: ethers.JsonRpcProvider): Promise<void> {
  // Check if already initialized
  if (fs.existsSync(SNAPSHOT_FILE)) {
    console.log("⏭️  Global snapshot already initialized, skipping...");
    return;
  }

  console.log("🔧 Initializing global snapshot for all tests...");

  // CRITICAL: Restart chain FIRST to reset to anvil-state.json (block 12593380)
  // This ensures snapshot is taken at the base block, not after services have advanced the chain
  console.log("🔄 Restarting chain to reload anvil-state.json...");
  execSync('docker compose restart chain', {
    stdio: 'pipe',
    timeout: 30000
  });

  // Wait for chain to be healthy after restart
  await waitForChainHealthy();

  // Advance blockchain time to current system time
  console.log("⏰ Advancing blockchain time to current system time...");
  const currentSystemTime = Math.floor(Date.now() / 1000);

  // Set next block timestamp to current time
  await provider.send("evm_setNextBlockTimestamp", [currentSystemTime]);

  // Mine a block to apply the new timestamp
  await provider.send("evm_mine", []);

  console.log(`✅ Blockchain time advanced to: ${new Date(currentSystemTime * 1000).toISOString()}`);

  // Get the current block number (should now be 12593380 from anvil-state.json + 1 from mining)
  const block = await provider.getBlock("latest");
  if (!block) {
    throw new Error("Failed to get latest block");
  }

  console.log(`📸 Taking Anvil snapshot at block: ${block.number}`);

  // Take snapshot immediately at chain start (before services advance the blockchain)
  const snapshotId = await takeSnapshot(provider);

  // Store snapshot ID and block number
  fs.writeFileSync(SNAPSHOT_FILE, snapshotId, "utf8");
  fs.writeFileSync(SNAPSHOT_BLOCK_FILE, block.number.toString(), "utf8");

  console.log(`✅ Global snapshot initialized at block: ${block.number} (snapshotId: ${snapshotId})`);
}

export async function revertToGlobalSnapshot(resetWatchTower: boolean = true): Promise<void> {
  // Revert blockchain to snapshot at block 12593380
  // Optionally reset watch-tower database and restart services with cached state

  // Read snapshot ID
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    throw new Error("Snapshot not initialized. Call initializeGlobalSnapshot first.");
  }

  const snapshotId = fs.readFileSync(SNAPSHOT_FILE, "utf8").trim();
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  try {
    // Step 1: Revert blockchain to snapshot FIRST (back to block 12593380)
    // CRITICAL: Must revert blockchain BEFORE resetting watch-tower
    // Otherwise watch-tower warms up to future blocks and misses events after revert
    console.log(`🔄 Reverting blockchain to snapshot ${snapshotId}...`);
    await revertToSnapshot(provider, snapshotId);

    const block = await provider.getBlock("latest");
    console.log(`✅ Blockchain reverted to block: ${block?.number}`);

    // Step 2: NOW reset watch-tower AFTER blockchain reverts
    // Watch-tower will warm up from snapshot block, not from future blocks
    // Only do this if test needs watch-tower (TWAP, stop-loss, etc.)
    if (resetWatchTower) {
      console.log('🗑️  Cleaning watch-tower volumes (removing and recreating)...');

      execSync('docker compose stop watch-tower', {
        stdio: 'pipe',
        timeout: 10000
      });

      execSync('docker compose rm -f watch-tower', {
        stdio: 'pipe',
        timeout: 10000
      });

      execSync('docker compose up -d watch-tower', {
        stdio: 'pipe',
        timeout: 15000
      });

      // Wait for watch-tower to be ready (blockchain time already matches system time)
      await waitForWatchTowerReady(60);
    } else {
      console.log('⏭️  Skipping watch-tower reset (not needed for this test)');
    }

    // Step 3: CRITICAL - Retake snapshot immediately after revert
    // Anvil consumes snapshots when reverting, so we must retake it for the next test
    const newSnapshotId = await takeSnapshot(provider);
    fs.writeFileSync(SNAPSHOT_FILE, newSnapshotId, "utf8");
    console.log(`📸 Snapshot retaken for next test (new ID: ${newSnapshotId})`);

    // Step 4: Stop all services that depend on database in correct order
    // Must stop dependents before stopping database
    console.log('🛑 Stopping services in dependency order...');

    // Stop autopilot first (depends on db)
    execSync('docker compose stop autopilot', {
      stdio: 'pipe',
      timeout: 30000
    });

    // Stop services that depend on db and orderbook
    execSync('docker compose stop driver baseline orderbook', {
      stdio: 'pipe',
      timeout: 30000
    });

    // Stop adminer (has connections to db, prevents volume removal)
    execSync('docker compose stop adminer', {
      stdio: 'pipe',
      timeout: 30000
    });

    // Stop database last
    execSync('docker compose stop db', {
      stdio: 'pipe',
      timeout: 30000
    });

    // Wait for db container to fully stop
    console.log('⏳ Waiting for database container to fully stop...');
    for (let i = 0; i < 30; i++) {
      try {
        const result = execSync('docker compose ps db --format json', {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        const status = JSON.parse(result);
        if (status.State !== 'running') {
          break;
        }
      } catch (error) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Remove stopped containers to release volume locks
    console.log('🗑️  Removing stopped containers (adminer, db)...');
    execSync('docker compose rm -f adminer db', {
      stdio: 'pipe',
      timeout: 10000
    });

    // Step 5: Wipe database volume completely
    console.log('🗑️  Wiping database volume for clean state...');
    execSync('docker volume rm offline-mode_postgres', {
      stdio: 'pipe',
      timeout: 10000
    });

    // Step 6: Start database with fresh volume
    console.log('🔄 Starting database with fresh volume...');
    execSync('docker compose up -d db', {
      stdio: 'pipe',
      timeout: 30000
    });

    // Wait for database to actually be ready and accepting connections
    console.log('⏳ Waiting for database to be ready...');
    for (let i = 0; i < 60; i++) {
      try {
        execSync('docker compose exec -T db psql -U postgres -c "SELECT 1;"', {
          stdio: 'pipe',
          timeout: 5000
        });
        console.log('✅ Database ready');
        break;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Step 7: Start adminer (database admin tool)
    execSync('docker compose up -d adminer', {
      stdio: 'pipe',
      timeout: 30000
    });

    // Step 8: Start orderbook (runs migrations on fresh database)
    console.log('🔄 Starting orderbook to run database migrations...');
    execSync('docker compose up -d orderbook', {
      stdio: 'pipe',
      timeout: 30000
    });

    // Step 9: Wait for orderbook to be ready and migrations to complete
    console.log('⏳ Waiting for orderbook to be ready...');
    await waitForOrderbookReady();

    console.log('⏳ Waiting for database schema migrations...');
    for (let i = 0; i < 60; i++) {
      try {
        const result = execSync(
          'docker compose exec -T db psql -U postgres -c "SELECT COUNT(*) FROM flyway_schema_history;"',
          { encoding: 'utf8', stdio: 'pipe' }
        );
        const count = parseInt(result.trim().split('\n')[2].trim(), 10);
        if (count > 0) {
          console.log('✅ Database schema ready');
          break;
        }
      } catch (error) {
        // Schema not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Step 10: Start remaining services that depend on orderbook/db
    console.log('🔄 Starting driver and baseline...');
    execSync('docker compose up -d driver baseline', {
      stdio: 'pipe',
      timeout: 30000
    });

    // Wait for driver to be ready
    console.log('⏳ Waiting for driver to be ready...');
    await waitForDriverReady();

    // Wait for baseline to index liquidity
    console.log('⏳ Waiting for baseline to index liquidity...');
    await waitForBaselineReady();

    // Step 11: NOW restart autopilot so it reads the clean database state
    // CRITICAL: Must do full stop+remove+start cycle (not just restart)
    // autopilot has internal state that survives restart, causing it to ignore DB reset
    console.log('🔄 Restarting autopilot with fresh state...');
    execSync('docker compose stop autopilot', {
      stdio: 'pipe',
      timeout: 30000
    });
    execSync('docker compose rm -f autopilot', {
      stdio: 'pipe',
      timeout: 10000
    });
    execSync('docker compose up -d autopilot', {
      stdio: 'pipe',
      timeout: 30000
    });

    // Poll autopilot container until it's actually running
    console.log('⏳ Waiting for autopilot container to start...');
    for (let i = 0; i < 60; i++) {
      try {
        const result = execSync('docker compose ps autopilot --format json', {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        const status = JSON.parse(result);
        if (status.State === 'running') {
          console.log('✅ Autopilot container running');
          break;
        }
      } catch (error) {
        // Container not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Wait for autopilot to actually connect to database and start indexing
    console.log('⏳ Waiting for autopilot to connect to database...');
    for (let i = 0; i < 60; i++) {
      try {
        const result = execSync(
          `docker compose exec -T db psql -U postgres -t -c "SELECT COUNT(*) FROM last_indexed_blocks WHERE contract IN ('onchain_orders', 'ethflow_refunds', 'settlements');"`,
          { encoding: 'utf8', stdio: 'pipe' }
        );
        const count = parseInt(result.trim(), 10);
        if (count > 0) {
          console.log('✅ Autopilot connected and started indexing');
          break;
        }
      } catch (error) {
        // Table might not exist yet or DB not ready
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Step 12: Wait for autopilot to sync up to current block
    // After database reset and restart, autopilot will index from snapshot block to current block
    // This prevents race conditions where tests submit orders before autopilot has indexed approvals
    const currentBlock = await provider.getBlock("latest");
    if (currentBlock) {
      await waitForAutopilotReady(currentBlock.number, 180); // 90s timeout (180 * 500ms), increased from 60s to account for degradation after multiple restarts
    }

  } catch (error) {
    // Re-throw error without logging - Jest will display it properly
    throw error;
  }
}

export function getGlobalSnapshotId(): string | undefined {
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    return undefined;
  }
  return fs.readFileSync(SNAPSHOT_FILE, "utf8").trim();
}
