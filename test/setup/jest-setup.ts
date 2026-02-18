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

  // Clean database before running tests to prevent old orders from interfering
  await cleanDatabase();

  console.log('\n🔍 Checking if services are running...\n');

  const requiredServices = [
    { name: 'Anvil Chain', url: 'http://localhost:8545', method: 'POST', body: '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' },
    { name: 'Orderbook API', url: 'http://localhost:8080/api/v1/version', method: 'GET' },
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
        `cast send ${oracle.address} "setPrice(int256)" ${oracle.price} --private-key ${deployerKey} --rpc-url http://localhost:8545 2>/dev/null`,
        { stdio: 'pipe' }
      );
      console.log(`✅ ${oracle.name} oracle timestamp refreshed`);
    } catch (error) {
      console.log(`⚠️  Failed to refresh ${oracle.name} oracle`);
    }
  }

  console.log('\n✅ Oracle timestamps refreshed!\n');
}
