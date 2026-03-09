/**
 * Jest global setup
 * Cleans database and checks if required services are running before tests start
 */

import dotenv from 'dotenv';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Clean the test database to ensure fresh state for integration tests.
 * Removes old orders that would interfere with tests by causing "insufficient_balance" errors.
 */
async function cleanDatabase() {
  try {
    // Check if database volume exists
    const volumeExists = execSync(
      'docker volume ls --format "{{.Name}}" | grep -q "^offline-mode_postgres$"',
      { stdio: 'pipe' }
    ).toString();

    // Check if database is running
    try {
      execSync('docker compose ps db --format json | grep -q "running"', { stdio: 'pipe' });
    } catch {
      // Database not running, no cleanup needed
      return;
    }

    console.log('🧹 Cleaning database for fresh test run...\n');

    // Stop dependent services
    execSync('docker compose stop orderbook autopilot driver baseline watch-tower', { stdio: 'ignore' });

    // Remove database and volume
    execSync('docker compose down db', { stdio: 'ignore' });
    execSync('docker volume rm offline-mode_postgres', { stdio: 'ignore' });

    // Restart database
    execSync('docker compose up -d db', { stdio: 'ignore' });
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Run migrations
    execSync('docker compose up -d db-migrations', { stdio: 'ignore' });
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Start application services
    execSync('docker compose up -d orderbook autopilot driver baseline watch-tower', { stdio: 'ignore' });

    // Wait for services to be healthy
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      try {
        execSync('docker compose ps orderbook --format json | grep -q "healthy"', { stdio: 'pipe' });
        console.log('✅ Database cleaned and services ready!\n');

        // Wait for liquidity to be available by testing quote API
        console.log('⏳ Waiting for liquidity pools to be indexed...\n');
        let liquidityReady = false;
        let liquidityAttempts = 0;
        const maxLiquidityAttempts = 30; // 30 attempts * 2 seconds = 60 seconds max

        while (!liquidityReady && liquidityAttempts < maxLiquidityAttempts) {
          try {
            // Test quote with a common pair (DAI -> WETH)
            const PORT_ORDERBOOK = process.env.PORT_ORDERBOOK || '8080';
            const testQuoteResponse = await fetch(`http://localhost:${PORT_ORDERBOOK}/api/v1/quote`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sellToken: '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
                buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
                receiver: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
                sellAmountBeforeFee: '100000000000000000000', // 100 DAI
                kind: 'sell',
                from: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
              })
            });

            if (testQuoteResponse.ok) {
              liquidityReady = true;
              console.log('✅ Liquidity pools indexed and quote API ready!\n');
            } else {
              liquidityAttempts++;
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (error) {
            liquidityAttempts++;
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        if (!liquidityReady) {
          console.warn('⚠️  Liquidity may not be fully ready, but continuing with tests...\n');
        }

        return;
      } catch {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.warn('⚠️  Services may not be fully ready, but continuing with tests...\n');
  } catch (error) {
    // Silently continue if cleanup fails - services might be in a state where cleanup isn't needed
  }
}

export default async function globalSetup() {
  // Load environment variables from .env file
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });

  // Construct URLs from PORT_* environment variables
  const PORT_CHAIN = process.env.PORT_CHAIN || '8545';
  const PORT_ORDERBOOK = process.env.PORT_ORDERBOOK || '8080';
  const RPC_URL = `http://localhost:${PORT_CHAIN}`;
  const ORDERBOOK_URL = `http://localhost:${PORT_ORDERBOOK}`;

  // Clean database before running tests to prevent old orders from interfering
  await cleanDatabase();

  console.log('\n🔍 Checking if services are running...\n');

  const requiredServices = [
    { name: 'Anvil Chain', url: RPC_URL, method: 'POST', body: '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' },
    { name: 'Orderbook API', url: `${ORDERBOOK_URL}/api/v1/version`, method: 'GET' },
  ];

  for (const service of requiredServices) {
    try {
      const response = await fetch(service.url, {
        method: service.method,
        headers: service.body ? { 'Content-Type': 'application/json' } : {},
        body: service.body,
      });

      if (response.ok) {
        console.log(`✅ ${service.name} is running`);
      } else {
        throw new Error(`Service returned status ${response.status}`);
      }
    } catch (error) {
      console.error(`\n❌ ${service.name} is not running!`);
      console.error(`   URL: ${service.url}`);
      console.error(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('\n⚠️  Please start the services first:');
      console.error('   docker-compose up -d\n');
      process.exit(1);
    }
  }

  console.log('\n✅ All required services are running!\n');

  // Refresh oracle timestamps to ensure they're fresh for stop-loss tests
  console.log('🔄 Refreshing oracle timestamps...\n');

  const oracles = [
    { name: 'WETH/USD', address: process.env.WETH_USD_ORACLE_ADDRESS, price: '300000000000' },
    { name: 'DAI/USD', address: process.env.DAI_USD_ORACLE_ADDRESS, price: '100000000' },
    { name: 'USDC/USD', address: process.env.USDC_USD_ORACLE_ADDRESS, price: '100000000' },
    { name: 'USDT/USD', address: process.env.USDT_USD_ORACLE_ADDRESS, price: '100000000' },
    { name: 'GNO/USD', address: process.env.GNO_USD_ORACLE_ADDRESS, price: '40000000000' },
  ];

  const deployerKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

  for (const oracle of oracles) {
    if (!oracle.address) {
      console.log(`⚠️  ${oracle.name} oracle address not found in .env`);
      continue;
    }

    try {
      // Call setPrice on each oracle to refresh timestamp
      const { execSync } = require('child_process');
      execSync(
        `cast send ${oracle.address} "setPrice(int256)" ${oracle.price} --private-key ${deployerKey} --rpc-url ${RPC_URL} 2>/dev/null`,
        { stdio: 'pipe' }
      );
      console.log(`✅ ${oracle.name} oracle timestamp refreshed`);
    } catch (error) {
      console.log(`⚠️  Failed to refresh ${oracle.name} oracle`);
    }
  }

  console.log('\n✅ Oracle timestamps refreshed!\n');

  // Initialize global snapshot and reset watchtower
  // This ensures watchtower starts scanning from the snapshot block
  console.log('📸 Taking global snapshot for all tests...\n');

  try {
    // Clean up any existing snapshot files from previous runs
    const { existsSync, unlinkSync } = await import('fs');
    const snapshotIdFile = path.resolve(__dirname, '../utils/../../.snapshot-id.tmp');
    const snapshotBlockFile = path.resolve(__dirname, '../utils/../../.snapshot-block.tmp');
    if (existsSync(snapshotIdFile)) {
      unlinkSync(snapshotIdFile);
    }
    if (existsSync(snapshotBlockFile)) {
      unlinkSync(snapshotBlockFile);
    }

    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // Import and initialize the global snapshot
    const { initializeGlobalSnapshot } = await import('../utils/shared-snapshot');
    await initializeGlobalSnapshot(provider);

    console.log('\n🔄 Resetting watchtower to start from snapshot block...\n');

    // Now reset watchtower so it starts from the snapshot block
    execSync('docker compose exec -T watch-tower sh -c "rm -rf /usr/src/app/database/*"', {
      stdio: 'pipe',
      timeout: 10000
    });

    execSync('docker compose restart watch-tower', {
      stdio: 'pipe',
      timeout: 15000
    });

    // Wait for watchtower to restart
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('✅ Watchtower reset complete - will scan from snapshot block\n');
  } catch (error) {
    console.error('⚠️  Failed to initialize snapshot or reset watchtower:', error);
    console.error('Continuing anyway...\n');
  }
}
