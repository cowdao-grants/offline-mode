import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
export const CONFIG = {
  rpcUrl: process.env.NODE_URL || 'http://localhost:8545',
  chainId: parseInt(process.env.CHAIN_ID || '1'),
  // Anvil default private keys
  account0PrivateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  account1PrivateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
};

// Contract addresses from environment
export const ADDRESSES = {
  settlement: process.env.SETTLEMENT_CONTRACT_ADDRESS!,
  vaultRelayer: process.env.VAULT_RELAYER_ADDRESS!,
  composableCoW: process.env.COMPOSABLE_COW_ADDRESS!,
  dai: process.env.DAI_ADDRESS!,
  weth: process.env.WETH_ADDRESS!,
  usdc: process.env.USDC_ADDRESS!,
  // Handler addresses
  twap: process.env.TWAP_ADDRESS!,
  stopLoss: process.env.STOP_LOSS_ADDRESS!,
  goodAfterTime: process.env.GOOD_AFTER_TIME_ADDRESS!,
  perpetualStableSwap: process.env.PERPETUAL_STABLE_SWAP_ADDRESS!,
  tradeAboveThreshold: process.env.TRADE_ABOVE_THRESHOLD_ADDRESS!,
  // COWShed
  cowShedFactory: process.env.COWSHED_COMPOSABLE_COW_FACTORY_ADDRESS!,
};

// ABIs
export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

export const COMPOSABLE_COW_ABI = [
  'function create((address handler, bytes32 salt, bytes staticInput) params, bool dispatch) returns ()',
  'function remove(bytes32 singleOrderHash)',
  'function getTradeableOrderWithSignature(address owner, (address handler, bytes32 salt, bytes staticInput) params, bytes offchainInput, bytes32[] proof) view returns ((address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)',
];

// Helper functions
export async function setupProvider() {
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  return provider;
}

export async function setupWallet(privateKey: string = CONFIG.account1PrivateKey) {
  const provider = await setupProvider();
  const wallet = new ethers.Wallet(privateKey, provider);
  return wallet;
}

export async function ensureTokenBalance(
  tokenAddress: string,
  userAddress: string,
  requiredAmount: bigint,
  wallet: ethers.Wallet
): Promise<void> {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const balance = await token.balanceOf(userAddress);

  if (balance < requiredAmount) {
    console.log(`   Need more tokens. Getting from Anvil account #0...`);

    const account0Wallet = new ethers.Wallet(CONFIG.account0PrivateKey, wallet.provider);
    const tokenFromAccount0 = new ethers.Contract(tokenAddress, ERC20_ABI, account0Wallet);

    const transferAmount = requiredAmount * 10n; // Get 10x what we need
    const transferTx = await tokenFromAccount0.transfer(userAddress, transferAmount);
    await transferTx.wait();

    const newBalance = await token.balanceOf(userAddress);
    console.log(`   ✅ Received tokens. New balance: ${ethers.formatEther(newBalance)}`);
  }
}

export async function ensureTokenAllowance(
  tokenAddress: string,
  spenderAddress: string,
  requiredAmount: bigint,
  wallet: ethers.Wallet
): Promise<void> {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const allowance = await token.allowance(wallet.address, spenderAddress);

  if (allowance < requiredAmount) {
    console.log(`   Approving spender to use tokens...`);
    const approveTx = await token.approve(spenderAddress, ethers.parseEther('1000000'));
    await approveTx.wait();
    console.log(`   ✅ Approved`);
  }
}

export async function waitForOrderExecution(
  checkBalanceFn: () => Promise<boolean>,
  timeoutMs: number = 600000, // 10 minutes
  checkIntervalMs: number = 10000 // 10 seconds
): Promise<boolean> {
  const startTime = Date.now();
  let elapsedSeconds = 0;

  while (Date.now() - startTime < timeoutMs) {
    const executed = await checkBalanceFn();
    if (executed) {
      return true;
    }

    elapsedSeconds += checkIntervalMs / 1000;
    console.log(`   [${elapsedSeconds}s] Waiting...`);

    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }

  return false;
}

export function printTestHeader(title: string, emoji: string = '🐮') {
  console.log('');
  console.log(`${emoji} ${title}`);
  console.log('='.repeat(title.length + 4));
  console.log('');
}

export function printSection(title: string) {
  console.log('');
  console.log('━'.repeat(60));
  console.log(title);
  console.log('━'.repeat(60));
}

export async function getCurrentTimestamp(provider: ethers.Provider): Promise<number> {
  const currentBlock = await provider.getBlock('latest');
  if (!currentBlock) throw new Error('Could not get current block');
  return currentBlock.timestamp;
}
