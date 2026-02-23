/**
 * Utility functions for deployment scripts
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { ForgeBroadcastResult } from './types';
import { logger, formatSection, formatDeployment, indent, formatListItem } from './logger';

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
    logger.debug(`Removing previous broadcast directory: ${broadcastDir}`);
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

  logger.debug(`Running: ${args}`);

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
    logger.error({ stderr }, 'Command stderr output');
  }
  if (stdout) {
    logger.trace({ stdout }, 'Command stdout output');
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
    logger.error({ stderr }, 'Command stderr output');
  }
  if (stdout) {
    logger.trace({ stdout }, 'Command stdout output');
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
  logger.debug(`Deploying ${contractName} at ${contractAddress}`);

  // Fetch bytecode from mainnet
  logger.trace(indent(`Fetching ${contractName} bytecode from mainnet`));
  const { stdout: bytecode } = await execAsync(
    `cast code ${contractAddress} --rpc-url ${mainnetRpcUrl}`
  );
  const bytecodeStr = bytecode.trim();
  logger.trace(indent(`Bytecode length: ${bytecodeStr.length} chars`, 2));

  // Fetch storage from mainnet if slots specified
  const storageValues: Record<number, string> = {};
  if (storageSlots.length > 0) {
    logger.trace(indent(`Fetching ${contractName} storage from mainnet`));
    for (const slot of storageSlots) {
      const { stdout: value } = await execAsync(
        `cast storage ${contractAddress} ${slot} --rpc-url ${mainnetRpcUrl}`
      );
      const valueStr = value.trim();
      storageValues[slot] = valueStr;
      logger.trace(indent(`Slot ${slot}: ${valueStr}`, 2));
    }
  }

  // Set bytecode on local chain
  logger.debug(indent(`Setting ${contractName} bytecode at ${contractAddress}`));
  await execAsync(
    `cast rpc anvil_setCode ${contractAddress} ${bytecodeStr} --rpc-url ${localRpcUrl}`
  );

  // Set storage on local chain if any slots were fetched
  if (storageSlots.length > 0) {
    logger.trace(indent(`Setting ${contractName} storage`));
    for (const slot of storageSlots) {
      await execAsync(
        `cast rpc anvil_setStorageAt ${contractAddress} 0x${slot.toString(16)} ${storageValues[slot]} --rpc-url ${localRpcUrl}`
      );
    }
  }

  logger.info(indent(`${contractName} deployed successfully at ${contractAddress}`));
}


/**
 * Print a section header
 */
export function printSection(title: string): void {
  logger.info(formatSection(title));
}

/**
 * Print deployment result
 */
export function printDeployment(name: string, address: string): void {
  logger.info(indent(formatDeployment(name, address)));
}

/**
 * Print deployment summary
 */
export function printDeploymentSummary(): void {
  logger.info('Deployment Summary:');
  logger.info(indent('Step 1: Tokens deployed (WETH, USDC, DAI, USDT, GNO)'));
  logger.info(indent('Step 2: Uniswap V2 deployed (Factory, Router, 10 Pairs)'));
  logger.info(indent('Step 3: CoW Protocol deployed (Settlement, Auth, VaultRelayer)'));
  logger.info(indent('Step 3.5: TradeSimulator contract deployed'));
  logger.info(indent('Step 3.6: Signatures contract deployed'));
  logger.info(indent('Step 3.7: HooksTrampoline contract deployed'));
  logger.info(indent('Step 3.8: CoWShed deployed (Factory, Implementation)'));
  logger.info(indent('Step 5: Liquidity added to all pairs'));
  logger.info(indent('Step 6: Uniswap Router initialized (token approvals)'));
  logger.info(indent('Step 7: Addresses exported to JSON'));
  logger.info(indent('Step 8: Configuration files generated'));
}

/**
 * Print output files information
 */
export function printOutputFiles(): void {
  logger.info('Output files:');
  logger.info(indent(formatListItem('playground/.env.offline (deployment addresses, auto-generated)')));
  logger.info(indent(formatListItem('offline-mode/config/offline/driver.toml (auto-generated)')));
  logger.info(indent(formatListItem('offline-mode/config/offline/baseline.toml (auto-generated)')));
}

/**
 * Print next steps
 */
export function printNextSteps(): void {
  logger.info('Next: Start the full stack with:');
  logger.info(indent('cd ../../playground'));
  logger.info(indent('docker compose -f docker-compose.offline.yml up'));
}
