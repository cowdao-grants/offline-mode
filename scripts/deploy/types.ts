/**
 * Shared types for deployment scripts
 */

export interface DeploymentConfig {
  rpcUrl: string;
  deployerPrivateKey: string;
  chainId: number;
}

export interface TokenAddresses {
  WETH: string;
  USDC: string;
  DAI: string;
  USDT: string;
  GNO: string;
}

export interface UniswapAddresses {
  factory: string;
  router: string;
  pairs: {
    WETH_USDC: string;
    WETH_DAI: string;
    USDC_DAI: string;
    WETH_USDT: string;
    WETH_GNO: string;
    USDC_USDT: string;
    USDC_GNO: string;
    DAI_USDT: string;
    DAI_GNO: string;
    USDT_GNO: string;
  };
}

export interface CowProtocolAddresses {
  authenticator: string;
  settlement: string;
  vaultRelayer: string;
  balancerVault: string;
}

export interface AuxiliaryAddresses {
  tradeSimulator: string;
  signatures: string;
  hooksTrampoline: string;
  cowShed: {
    factory: string;
    implementation: string;
  };
}

export interface AllAddresses {
  tokens: TokenAddresses;
  uniswap: UniswapAddresses;
  cowProtocol: CowProtocolAddresses;
  auxiliary: AuxiliaryAddresses;
}

export interface ForgeTransaction {
  contractName?: string;
  contractAddress: string;
  transactionType: 'CREATE' | 'CREATE2' | 'CALL';
}

export interface ForgeLog {
  topics: string[];
  data: string;
}

export interface ForgeReceipt {
  logs: ForgeLog[];
}

export interface ForgeBroadcastResult {
  transactions: ForgeTransaction[];
  receipts: ForgeReceipt[];
}
