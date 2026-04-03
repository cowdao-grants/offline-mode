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

export interface ComposableCowAddresses {
  composableCoW: string;
  extensibleFallbackHandler: string;
  currentBlockTimestampFactory: string;
  conditionalOrders: {
    goodAfterTime: string;
    perpetualStableSwap: string;
    stopLoss: string;
    twap: string;
    tradeAboveThreshold: string;
  };
}

export interface SafeAddresses {
  singleton: string;
  proxyFactory: string;
  compatibilityFallbackHandler: string;
  testUserSafe: string;
}

export interface AllAddresses {
  tokens: TokenAddresses;
  uniswap: UniswapAddresses;
  cowProtocol: CowProtocolAddresses;
  auxiliary: AuxiliaryAddresses;
  composableCow: ComposableCowAddresses;
  safe?: SafeAddresses;
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
