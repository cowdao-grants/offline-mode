/**
 * Utility functions for deployment scripts
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { ForgeBroadcastResult } from './types';

const execAsync = promisify(exec);

/**
 * Execute a forge script command
 */
export async function runForgeScript(
  scriptPath: string,
  scriptName: string,
  rpcUrl: string,
  privateKey: string,
  options: {
    broadcast?: boolean;
    skipSimulation?: boolean;
    verbosity?: number;
    env?: Record<string, string>;
  } = {}
): Promise<void> {
  const {
    broadcast = true,
    skipSimulation = true,
    verbosity = 3,
    env = {},
  } = options;

  // Clean up any previous broadcast for this script to avoid resume errors
  const broadcastDir = path.join(__dirname, '../..', 'broadcast', `${scriptName}.s.sol`);
  if (fs.existsSync(broadcastDir)) {
    console.log(`Removing previous broadcast directory: ${broadcastDir}`);
    fs.rmSync(broadcastDir, { recursive: true, force: true });
  }

  const args = [
    'forge script',
    `${scriptPath}:${scriptName}`,
    `--rpc-url ${rpcUrl}`,
    broadcast ? '--broadcast' : '',
    privateKey ? `--private-key ${privateKey}` : '',
    skipSimulation ? '--skip-simulation' : '',
    `-${'v'.repeat(verbosity)}`,
  ].filter(Boolean).join(' ');

  console.log(`Running: ${args}`);

  const envVars = {
    ...process.env,
    ...env,
  } as NodeJS.ProcessEnv;

  // Only add DEPLOYER_PRIVATE_KEY if privateKey is provided
  if (privateKey) {
    envVars.DEPLOYER_PRIVATE_KEY = privateKey;
  }

  const { stdout, stderr } = await execAsync(args, {
    env: envVars,
    cwd: path.join(__dirname, '../..'),
  });

  if (stderr && !stderr.includes('Warning')) {
    console.error('stderr:', stderr);
  }
  if (stdout) {
    console.log(stdout);
  }
}

/**
 * Read the latest broadcast result for a script
 */
export function readBroadcastResult(scriptName: string): ForgeBroadcastResult {
  const broadcastPath = path.join(
    __dirname,
    '../..',
    'broadcast',
    `${scriptName}.s.sol`,
    '1',
    'run-latest.json'
  );

  if (!fs.existsSync(broadcastPath)) {
    throw new Error(`Broadcast file not found: ${broadcastPath}`);
  }

  const content = fs.readFileSync(broadcastPath, 'utf8');
  return JSON.parse(content);
}

/**
 * Extract contract address from broadcast by contract name and transaction type
 */
export function extractAddress(
  broadcast: ForgeBroadcastResult,
  contractName?: string,
  transactionType: 'CREATE' | 'CREATE2' = 'CREATE2',
  index: number = 0
): string {
  const transactions = broadcast.transactions.filter(tx => {
    if (contractName) {
      return tx.contractName === contractName && tx.transactionType === transactionType;
    }
    return tx.transactionType === transactionType;
  });

  if (transactions.length === 0) {
    throw new Error(`No transaction found for ${contractName || 'unnamed contract'} with type ${transactionType}`);
  }

  if (index >= transactions.length) {
    throw new Error(`Index ${index} out of bounds (found ${transactions.length} transactions)`);
  }

  return transactions[index].contractAddress;
}

/**
 * Extract pair address from PairCreated event log
 */
export function extractPairAddress(
  broadcast: ForgeBroadcastResult,
  pairIndex: number
): string {
  // PairCreated event topic
  const pairCreatedTopic = '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9';

  const pairLogs = broadcast.receipts.flatMap(receipt =>
    receipt.logs.filter(log => log.topics[0] === pairCreatedTopic)
  );

  if (pairIndex >= pairLogs.length) {
    throw new Error(`Pair index ${pairIndex} out of bounds (found ${pairLogs.length} pairs)`);
  }

  // Extract address from data field (first 32 bytes after 0x, skip 24 leading zeros)
  const data = pairLogs[pairIndex].data;
  return '0x' + data.slice(26, 66);
}

/**
 * Call a view function on a contract using cast
 */
export async function castCall(
  contractAddress: string,
  functionSig: string,
  rpcUrl: string
): Promise<string> {
  const { stdout } = await execAsync(
    `cast call ${contractAddress} "${functionSig}" --rpc-url ${rpcUrl}`
  );
  return stdout.trim();
}

/**
 * Send a transaction to a contract using cast
 */
export async function castSend(
  contractAddress: string,
  functionSig: string,
  args: string[],
  privateKey: string,
  rpcUrl: string,
  chainId: number
): Promise<void> {
  const argsStr = args.join(' ');
  const { stdout, stderr } = await execAsync(
    `cast send ${contractAddress} "${functionSig}" ${argsStr} --private-key ${privateKey} --rpc-url ${rpcUrl} --chain ${chainId}`
  );

  if (stderr) {
    console.error('stderr:', stderr);
  }
  if (stdout) {
    console.log(stdout);
  }
}

/**
 * Deploy a contract at a specific address by copying bytecode and storage from mainnet
 * @param contractAddress - The address where to deploy the contract (on local chain)
 * @param mainnetRpcUrl - The mainnet RPC URL to fetch bytecode/storage from
 * @param localRpcUrl - The local RPC URL to deploy to
 * @param storageSlots - Array of storage slot numbers to copy from mainnet (optional)
 * @param contractName - Name of the contract for logging purposes
 */
export async function deployOnAddressWithStorage(
  contractAddress: string,
  mainnetRpcUrl: string,
  localRpcUrl: string,
  contractName: string,
  storageSlots: number[] = []
): Promise<void> {
  console.log(`Deploying ${contractName} at ${contractAddress}...`);

  // Fetch bytecode from mainnet
  console.log(`  Fetching ${contractName} bytecode from mainnet...`);
  const { stdout: bytecode } = await execAsync(
    `cast code ${contractAddress} --rpc-url ${mainnetRpcUrl}`
  );
  const bytecodeStr = bytecode.trim();
  console.log(`    Bytecode length: ${bytecodeStr.length} chars`);

  // Fetch storage from mainnet if slots specified
  const storageValues: Record<number, string> = {};
  if (storageSlots.length > 0) {
    console.log(`  Fetching ${contractName} storage from mainnet...`);
    for (const slot of storageSlots) {
      const { stdout: value } = await execAsync(
        `cast storage ${contractAddress} ${slot} --rpc-url ${mainnetRpcUrl}`
      );
      const valueStr = value.trim();
      storageValues[slot] = valueStr;
      console.log(`    Slot ${slot}: ${valueStr}`);
    }
  }

  // Set bytecode on local chain
  console.log(`  Setting ${contractName} bytecode at ${contractAddress}...`);
  await execAsync(
    `cast rpc anvil_setCode ${contractAddress} ${bytecodeStr} --rpc-url ${localRpcUrl}`
  );

  // Set storage on local chain if any slots were fetched
  if (storageSlots.length > 0) {
    console.log(`  Setting ${contractName} storage...`);
    for (const slot of storageSlots) {
      await execAsync(
        `cast rpc anvil_setStorageAt ${contractAddress} 0x${slot.toString(16)} ${storageValues[slot]} --rpc-url ${localRpcUrl}`
      );
    }
  }

  console.log(`  ✅ ${contractName} deployed at ${contractAddress}`);
}


/**
 * Print a section header
 */
export function printSection(title: string): void {
  console.log('');
  console.log('━'.repeat(60));
  console.log(title);
  console.log('━'.repeat(60));
}

/**
 * Print deployment result
 */
export function printDeployment(name: string, address: string): void {
  console.log(`  ${name}: ${address}`);
}

/**
 * Print deployment summary
 */
export function printDeploymentSummary(): void {
  console.log('📋 Deployment Summary:');
  console.log('  ✅ Step 1: Tokens deployed (WETH, USDC, DAI, USDT, GNO)');
  console.log('  ✅ Step 2: Uniswap V2 deployed (Factory, Router, 10 Pairs)');
  console.log('  ✅ Step 3: CoW Protocol deployed (Settlement, Auth, VaultRelayer)');
  console.log('  ✅ Step 3.5: TradeSimulator contract deployed');
  console.log('  ✅ Step 3.6: Signatures contract deployed');
  console.log('  ✅ Step 3.7: HooksTrampoline contract deployed');
  console.log('  ✅ Step 3.8: CoWShed deployed (Factory, Implementation)');
  console.log('  ✅ Step 5: Liquidity added to all pairs');
  console.log('  ✅ Step 6: Uniswap Router initialized (token approvals)');
  console.log('  ✅ Step 7: Addresses exported to JSON');
  console.log('  ✅ Step 8: Configuration files generated');
}

/**
 * Print output files information
 */
export function printOutputFiles(): void {
  console.log('📁 Output files:');
  console.log('  - playground/.env.offline (deployment addresses, auto-generated)');
  console.log('  - offline-mode/configs/offline/driver.toml (auto-generated)');
  console.log('  - offline-mode/configs/offline/baseline.toml (auto-generated)');
}

/**
 * Print next steps
 */
export function printNextSteps(): void {
  console.log('🚀 Next: Start the full stack with:');
  console.log('  cd ../../playground');
  console.log('  docker compose -f docker-compose.offline.yml up');
}
