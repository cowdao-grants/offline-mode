/**
 * Shared utilities for CoW Protocol order testing
 */

import { ethers } from 'ethers';
import { loadAddresses as loadAddressesFromEnv } from './loadAddresses';
import { advanceTime } from './anvil-helpers';

// Load addresses and restructure for test compatibility
function loadAddresses() {
  const addresses = loadAddressesFromEnv();

  return {
    tokens: addresses.tokens,
    settlement: addresses.cowProtocol.settlement,
    vaultRelayer: addresses.cowProtocol.vaultRelayer,
    authenticator: addresses.cowProtocol.authenticator,
  };
}

// Configuration
export const CONFIG = {
  rpcUrl: `http://localhost:${process.env.PORT_CHAIN || '8545'}`,
  orderbookUrl: `http://localhost:${process.env.PORT_ORDERBOOK || '8080'}`,
  chainId: 1,
};

// Token decimals mapping
export const TOKEN_DECIMALS: Record<string, number> = {
  WETH: 18,
  DAI: 18,
  GNO: 18,
  USDC: 6,
  USDT: 6,
};

// EIP-712 Type definitions for CoW Protocol orders
export const ORDER_TYPE_FIELDS = [
  { name: 'sellToken', type: 'address' },
  { name: 'buyToken', type: 'address' },
  { name: 'receiver', type: 'address' },
  { name: 'sellAmount', type: 'uint256' },
  { name: 'buyAmount', type: 'uint256' },
  { name: 'validTo', type: 'uint32' },
  { name: 'appData', type: 'bytes32' },
  { name: 'feeAmount', type: 'uint256' },
  { name: 'kind', type: 'string' },
  { name: 'partiallyFillable', type: 'bool' },
  { name: 'sellTokenBalance', type: 'string' },
  { name: 'buyTokenBalance', type: 'string' },
];

export interface OrderData {
  sellToken: string;
  buyToken: string;
  receiver: string;
  sellAmount: string;
  buyAmount: string;
  validTo: number;
  appData: string;
  feeAmount: string;
  kind: string;
  partiallyFillable: boolean;
  sellTokenBalance: string;
  buyTokenBalance: string;
}

// Load deployed addresses
let cachedAddresses: ReturnType<typeof loadAddresses> | null = null;

export function getAddresses() {
  if (!cachedAddresses) {
    cachedAddresses = loadAddresses();
  }
  return cachedAddresses;
}

export function getTokenAddress(symbol: string): string {
  const addresses = getAddresses();
  const address = addresses.tokens[symbol as keyof typeof addresses.tokens];
  if (!address) {
    throw new Error(`Token ${symbol} not found. Available: ${Object.keys(addresses.tokens).join(', ')}`);
  }
  return address;
}

export function getTokenDecimals(symbol: string): number {
  const decimals = TOKEN_DECIMALS[symbol];
  if (decimals === undefined) {
    throw new Error(`Unknown token ${symbol}`);
  }
  return decimals;
}

export function parseAmount(amount: string): bigint {
  // Handle scientific notation like 10e18, 1000e6
  if (amount.includes('e')) {
    const [base, exp] = amount.split('e');
    const baseNum = parseFloat(base);
    const expNum = parseInt(exp);
    return BigInt(Math.floor(baseNum * Math.pow(10, expNum)));
  }
  return BigInt(amount);
}

export function formatBalance(balance: bigint, decimals: number): string {
  if (decimals === 18) {
    return ethers.formatEther(balance);
  }
  return (Number(balance) / Math.pow(10, decimals)).toFixed(decimals === 6 ? 2 : 4);
}

export async function ensureTokenBalance(
  provider: ethers.Provider,
  userAddress: string,
  tokenAddress: string,
  requiredAmount: bigint
): Promise<void> {
  const erc20Abi = ['function balanceOf(address) view returns (uint256)', 'function transfer(address, uint256) returns (bool)'];

  const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
  const balance = await tokenContract.balanceOf(userAddress);

  if (balance >= requiredAmount) {
    return;
  }

  // Transfer from deployer (Anvil account #0)
  const deployerPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const deployer = new ethers.Wallet(deployerPrivateKey, provider);
  const tokenFromDeployer = tokenContract.connect(deployer) as any;

  const transferAmount = requiredAmount * 10n;
  const nonce = await deployer.getNonce();
  const tx = await tokenFromDeployer.transfer(userAddress, transferAmount, { nonce });
  await tx.wait(); // Wait for transaction to be mined
}

export async function getQuote(
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  from: string
): Promise<any> {
  const quoteUrl = `${CONFIG.orderbookUrl}/api/v1/quote`;

  const quoteRequest = {
    sellToken,
    buyToken,
    receiver: from,
    sellAmountBeforeFee: sellAmount,
    kind: 'sell',
    from,
  };

  const response = await fetch(quoteUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quoteRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Quote request failed: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export async function submitOrder(
  orderData: OrderData,
  signature: string,
  from: string
): Promise<string> {
  const orderUrl = `${CONFIG.orderbookUrl}/api/v1/orders`;

  const orderPayload = {
    ...orderData,
    from,
    signature,
    signingScheme: 'eip712',
  };

  const response = await fetch(orderUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Order submission failed: ${response.statusText} - ${errorText}`);
  }

  const result: string = await response.text();
  return result.replace(/"/g, '');
}

export async function waitForOrderExecution(
  orderUid: string,
  maxWaitSeconds = 120,
  provider?: ethers.Provider
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds
  const pollIntervalSeconds = pollInterval / 1000;

  while ((Date.now() - startTime) / 1000 < maxWaitSeconds) {
    try {
      const orderUrl = `${CONFIG.orderbookUrl}/api/v1/orders/${orderUid}`;
      const response = await fetch(orderUrl);

      if (response.ok) {
        const orderData = await response.json() as any;

        if (orderData.status === 'fulfilled') {
          return true;
        } else if (orderData.status === 'expired' || orderData.status === 'cancelled') {
          throw new Error(`Order ${orderData.status}`);
        }
      }
    } catch (error) {
      // Continue polling
    }

    // Mine a block manually to trigger autopilot auction (every 2 seconds)
    // This keeps autopilot running without auto-advancing time
    if (provider) {
      const jsonRpcProvider = provider as ethers.JsonRpcProvider;
      try {
        // Mine a single block - autopilot will pick it up and run an auction
        await jsonRpcProvider.send('anvil_mine', [1]);
      } catch (error) {
        // Ignore mining errors
      }
      // Wait 2 seconds (SETTLE_INTERVAL) for autopilot to process
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } else {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  return false;
}

export async function getTokenBalance(
  provider: ethers.Provider,
  tokenAddress: string,
  userAddress: string
): Promise<bigint> {
  const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
  const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
  return await tokenContract.balanceOf(userAddress);
}

export async function approveToken(
  signer: ethers.Signer,
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint
): Promise<void> {
  const erc20Abi = ['function approve(address, uint256) returns (bool)'];
  const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, signer);

  const nonce = await signer.getNonce();
  const tx = await tokenContract.approve(spenderAddress, amount, { nonce });
  await tx.wait();
}
