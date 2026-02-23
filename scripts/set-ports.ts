#!/usr/bin/env ts-node
/**
 * Set port mappings in .env based on PORT_OFFSET
 * Usage:
 *   npm run set-ports 500
 *   npm run set-ports 0
 *   npm run set-ports  # Uses current PORT_OFFSET from .env or defaults to 0
 */

import * as fs from 'fs';
import * as path from 'path';

const ENV_FILE = path.join(__dirname, '..', '.env');

// Default port values
const DEFAULT_PORTS = {
  PORT_CHAIN: 8545,
  PORT_ORDERBOOK: 8080,
  PORT_ADMINER: 8082,
  PORT_DB: 5432,
  PORT_FRONTEND: 8000,
  PORT_EXPLORER: 8001,
  PORT_GRAFANA: 3000,
  PORT_PROMETHEUS: 9090,
};

function readEnvFile(): string {
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(`.env file not found at ${ENV_FILE}`);
  }
  return fs.readFileSync(ENV_FILE, 'utf8');
}

function parseOffset(content: string): number {
  const match = content.match(/^PORT_OFFSET=(\d+)/m);
  return match ? parseInt(match[1], 10) : 0;
}

function updateEnvFile(content: string, offset: number): string {
  // Update PORT_OFFSET
  content = content.replace(/^PORT_OFFSET=\d+/m, `PORT_OFFSET=${offset}`);

  // Update each port value
  for (const [portName, defaultValue] of Object.entries(DEFAULT_PORTS)) {
    const newValue = defaultValue + offset;
    const regex = new RegExp(`^${portName}=\\d+`, 'm');
    content = content.replace(regex, `${portName}=${newValue}`);
  }

  return content;
}

function main() {
  const args = process.argv.slice(2);

  // Read current .env
  const envContent = readEnvFile();

  // Determine offset
  let offset: number;
  if (args.length > 0) {
    offset = parseInt(args[0], 10);
    if (isNaN(offset)) {
      console.error(`❌ Invalid offset: ${args[0]}`);
      console.error('Usage: npm run set-ports <offset>');
      process.exit(1);
    }
  } else {
    offset = parseOffset(envContent);
  }

  console.log(`🔧 Setting ports with offset: ${offset}`);

  // Update .env file
  const updatedContent = updateEnvFile(envContent, offset);
  fs.writeFileSync(ENV_FILE, updatedContent, 'utf8');

  // Print results
  console.log('✅ Ports configured:');
  for (const [portName, defaultValue] of Object.entries(DEFAULT_PORTS)) {
    const newValue = defaultValue + offset;
    const label = portName.replace('PORT_', '').replace(/_/g, ' ');
    console.log(`   ${label.padEnd(15)} ${newValue}`);
  }

  console.log('');
  console.log('💡 Now run: docker-compose up -d');
}

main();
