# CoW Protocol Offline Playground

A self-contained, offline development environment for CoW Protocol that runs locally without requiring mainnet forks or archive nodes.

## What is this?

The CoW Protocol Offline Playground is a complete local blockchain environment that includes:

- **Local Anvil node** with persistent state
- **CoW Protocol contracts**: Settlement, VaultRelayer, Authenticator
- **DEX infrastructure**: Uniswap V2 (with liquidity pools)
- **Test tokens**: WETH, USDC, DAI
- **CoW Protocol services**: Orderbook API, Autopilot, Driver, Baseline Solver
- **Mock Balancer Vault** for settlement execution

All services work out-of-the-box with proper configuration pointing to the local blockchain.

## Quick Start

### Prerequisites

- Docker and Docker Compose

### Initialize the Environment

1. **Start all services**:
   ```bash
   cd /path/to/playground
   docker-compose -f docker-compose.offline.yml up -d
   ```

   On first run, the `chain-deployer` service will automatically:
   - Start a temporary Anvil instance
   - Deploy all contracts (tokens, Uniswap V2, CoW Protocol, etc.)
   - Add liquidity to Uniswap pairs
   - Generate configuration files (`.env.offline`, `driver.toml`, `baseline.toml`)
   - Save the blockchain state to `offline-mode/state/anvil-state.json`
   - Start the Anvil node with the deployed state

   On subsequent runs, the chain-deployer will detect the existing state and skip deployment, immediately starting the Anvil node with the saved state.

2. **Wait for services to be ready**:
   ```bash
   # Wait for orderbook API to be available
   curl --retry 24 --retry-delay 5 --retry-all-errors http://localhost:8080/api/v1/version
   ```

3. **Run the TypeScript integration tests**:
   ```bash
   cd offline-mode
   npm run test:order
   # or
   npm run test:cowshed
   ```

   These tests will:
   - Fund traders with tokens
   - Create and sign orders
   - Submit orders to the orderbook
   - Monitor settlement status
   - Verify balances changed correctly

### Access Points

Once running, you can access:

- **Orderbook API**: http://localhost:8080
- **Anvil RPC**: http://localhost:8545
- **Driver API**: http://localhost:9000
- **Grafana (monitoring)**: http://localhost:3000
- **Prometheus (metrics)**: http://localhost:9090
- **Adminer (database)**: http://localhost:8082

## Running Tests

The playground includes TypeScript-based integration tests to verify the setup and functionality.

### Test Suite

#### 1. Playground Order Test (Parameterized)

Test placing and settling orders with custom parameters:

```bash
npm run test:order
```

This will run with default parameters. For custom parameters, use ts-node directly:

```bash
npm run test:order --sellToken USDC --buyToken DAI --sellAmount 100e6 --from 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

**Parameters:**
- `--sellToken <TOKEN>`: Token to sell (WETH, USDC, DAI, USDT, or GNO)
- `--buyToken <TOKEN>`: Token to buy (WETH, USDC, DAI, USDT, or GNO)
- `--sellAmount <AMOUNT>`: Amount to sell with decimals (e.g., `100e6` for 100 USDC, `10e18` for 10 WETH)
- `--from <PRIVATE_KEY>`: Private key of the trader (defaults to Anvil account #0)

**Examples:**
```bash
# Sell 100 USDC for DAI
npx ts-node test/test-playground-order.ts --sellToken USDC --buyToken DAI --sellAmount 100e6

# Sell 10 GNO for WETH with custom private key
npx ts-node test/test-playground-order.ts --sellToken GNO --buyToken WETH --sellAmount 10e18 --from 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

This test will:
1. Fund the trader with sell tokens
2. Get a quote from the orderbook
3. Sign the order with EIP-712
4. Submit the order to the orderbook
5. Monitor settlement status (up to 2 minutes)
6. Display final balances

#### 2. CoWShed Integration Test

Test the full CoWShed proxy flow with hooks:

```bash
npm run test:cowshed
```

This test demonstrates:
1. Calculate CoWShed proxy address for a user
2. Create a pre-hook (token approval via hooks trampoline)
3. Submit an order with hooks in appData
4. Monitor for settlement
5. Verify hooks were executed correctly

**Note**: CoWShed proxies enable gasless approvals and other advanced features via pre/post settlement hooks.

### Expected Output

Both tests should complete in **15-30 seconds** when the system is healthy. If orders stay in "open" status for more than 60 seconds, check:

1. **Baseline solver status**: The solver may need to be restarted
   ```bash
   docker restart playground-baseline-1
   ```

2. **Driver logs**: Check for solver errors
   ```bash
   docker logs playground-driver-1 --tail 50
   ```

3. **Token liquidity**: Ensure Uniswap pools have sufficient liquidity for the trading pair

### Troubleshooting Tests

**Orders not settling:**
- Restart the baseline solver (known issue with solver degradation)
- Check that services are running: `docker-compose -f docker-compose.offline.yml ps`
- Verify token approvals are set

**TypeScript errors:**
- Ensure dependencies are installed: `npm install`
- Check that TypeScript is properly configured: `npx tsc --version`

### Contract Addresses

All deployed contract addresses are automatically stored in:
```
playground/.env.offline
```

This file is auto-generated during deployment and contains all token addresses, DEX contracts, and CoW Protocol contracts. The test scripts automatically load addresses from this file using the `loadAddresses()` utility function.

## Building Contracts from Source

If you need to rebuild contracts (for example, after modifying sources), use the Foundry profiles:

### Profile Overview

The project uses three Foundry profiles to handle different Solidity versions:

| Profile | Solidity Version | Contracts | Output Directory |
|---------|------------------|-----------|------------------|
| `default` | 0.8.26 | Custom contracts (tokens, mocks) | `contracts/out` |
| `uniswap-v2` | 0.5.16 | Uniswap V2 Core (Factory, Pair) | `contracts/out-uniswap-v2` |
| `uniswap-v2-periphery` | 0.6.6 | Uniswap V2 Router | `contracts/out-uniswap-v2-periphery` |
| `cow-protocol` | 0.7.6 | CoW Protocol contracts | `contracts/out-cow-protocol` |

### Building Specific Contracts

From the `poc-offline-mode` directory:

```bash
# Build custom contracts (default profile)
forge build

# Build Uniswap V2 Core (Factory, Pair)
forge build --profile uniswap-v2

# Build Uniswap V2 Router
forge build --profile uniswap-v2-periphery

# Build CoW Protocol contracts
forge build --profile cow-protocol
```

### Build All Contracts

To rebuild everything:

```bash
forge build && \
forge build --profile uniswap-v2 && \
forge build --profile uniswap-v2-periphery && \
forge build --profile cow-protocol
```

## Deploying from Scratch

If you want to redeploy everything from scratch:

1. **Delete the existing state**:
   ```bash
   rm offline-mode/state/anvil-state.json
   ```

2. **Start all services**:
   ```bash
   docker-compose -f docker-compose.offline.yml up -d
   ```

   The `chain-deployer` service will automatically:
   - Deploy all contracts from scratch
   - Add liquidity to Uniswap pairs
   - Generate configuration files in `playground/.env.offline`
   - Save the new blockchain state

   No manual deployment scripts are needed - everything is handled automatically by Docker!

## Configuring Balances

The playground uses a centralized configuration file to manage initial token supplies, liquidity pool amounts, and user wallet balances. This makes it easy to customize the environment without modifying code.

### Configuration File: `config/balances.json`

The configuration file has three main sections:

#### 1. Token Initial Supplies

Defines how many tokens to mint to the deployer account during deployment:

```json
{
  "tokens": {
    "WETH": {
      "decimals": 18,
      "initialSupply": "5000000000000000000000"  // 5,000 WETH
    },
    "USDC": {
      "decimals": 6,
      "initialSupply": "15000000000000"  // 15 million USDC
    }
    // ... other tokens
  }
}
```

#### 2. DeFi Protocol Liquidity

Defines liquidity amounts for DEX pools. Organized by protocol for future extensibility:

```json
{
  "defi": {
    "uniswapV2": {
      "WETH_USDC": {
        "token0Amount": "1000000000000000000000",  // 1000 WETH
        "token1Amount": "3000000000000"             // 3M USDC
      }
      // ... other pairs
    }
    // Future protocols like Balancer, Curve can be added here
  }
}
```

**Why this structure?** The nested `defi.uniswapV2` structure allows you to add other DeFi protocols in the future (e.g., `defi.balancer`, `defi.curve`) without conflicts.

#### 3. User Wallets

Defines which wallets should receive tokens during deployment:

```json
{
  "users": {
    "alice": {
      "address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "tokens": {
        "WETH": "100000000000000000000",   // 100 WETH
        "USDC": "100000000000",            // 100 USDC
        "DAI": "100000000000000000000000"  // 100K DAI
      }
    }
    // ... other users
  }
}
```

### Adding Your Own Wallet

To receive tokens in your wallet during deployment, simply add it to the `users` section:

```json
{
  "users": {
    "myWallet": {
      "address": "0xYourWalletAddressHere",
      "tokens": {
        "WETH": "1000000000000000000000",    // 1,000 WETH
        "USDC": "1000000000",                // 1,000 USDC
        "DAI": "5000000000000000000000000",  // 5M DAI
        "USDT": "1000000000",                // 1,000 USDT
        "GNO": "10000000000000000000000"     // 10,000 GNO
      }
    }
  }
}
```

After editing the file, redeploy to apply changes:

```bash
# Delete existing state
rm offline-mode/state/anvil-state.json

# Redeploy (will fund all configured users)
docker-compose -f docker-compose.offline.yml up -d
```

### Pre-configured Test Users

The playground comes with test users pre-configured:

| User | Address | WETH | DAI | Notes |
|------|---------|------|-----|-------|
| **alice** | `0x7099...79C8` | 100 | 100K | Anvil account #1 |
| **bob** | `0x3C44...293BC` | 50 | 50K | Anvil account #2 |
| **charlie** | `0x90F7...3b906` | 75 | 75K | Anvil account #3 |

These addresses correspond to Anvil's default test accounts, so you can use their private keys for testing.

### Modifying Token Amounts

To change how much of a token is available:

**For liquidity pools:**
```json
"defi": {
  "uniswapV2": {
    "WETH_DAI": {
      "token0Amount": "2000000000000000000000",  // Change from 1000 to 2000 WETH
      "token1Amount": "6000000000000000000000000" // Change from 3M to 6M DAI
    }
  }
}
```

**For user wallets:**
```json
"users": {
  "alice": {
    "address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "tokens": {
      "WETH": "500000000000000000000"  // Change from 100 to 500 WETH
    }
  }
}
```

### Understanding Token Decimals

When specifying amounts, remember to account for decimals:

| Token | Decimals | Example Amount | Human Readable |
|-------|----------|----------------|----------------|
| WETH | 18 | `1000000000000000000` | 1 WETH |
| USDC | 6 | `1000000` | 1 USDC |
| DAI | 18 | `1000000000000000000` | 1 DAI |
| USDT | 6 | `1000000` | 1 USDT |
| GNO | 18 | `1000000000000000000` | 1 GNO |

**Quick reference:**
- 18 decimals: multiply by `10^18` (or append 18 zeros)
- 6 decimals: multiply by `10^6` (or append 6 zeros)

### Future Protocol Support

The `defi` section is designed to support multiple protocols. In the future, you can add:

```json
{
  "defi": {
    "uniswapV2": { /* existing config */ },
    "balancer": {
      "WETH_DAI_USDC_POOL": {
        "wethAmount": "1000000000000000000000",
        "daiAmount": "1000000000000000000000000",
        "usdcAmount": "1000000000000"
      }
    },
    "curve": {
      "3POOL": {
        "daiAmount": "1000000000000000000000000",
        "usdcAmount": "1000000000000",
        "usdtAmount": "1000000000000"
      }
    }
  }
}
```

### Verifying Balances

After deployment, verify that wallets received the correct amounts:

```bash
# Check WETH balance for a wallet
cast call 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 "balanceOf(address)(uint256)" YOUR_WALLET_ADDRESS --rpc-url http://localhost:8545

# Check USDC balance
cast call 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 "balanceOf(address)(uint256)" YOUR_WALLET_ADDRESS --rpc-url http://localhost:8545

# Check DAI balance
cast call 0x6B175474E89094C44Da98b954EedeAC495271d0F "balanceOf(address)(uint256)" YOUR_WALLET_ADDRESS --rpc-url http://localhost:8545
```

### Token Addresses (Mainnet Compatible)

All tokens are deployed at their mainnet addresses for compatibility:

| Token | Address |
|-------|---------|
| WETH | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| DAI | `0x6B175474E89094C44Da98b954EedeAC495271d0F` |
| USDT | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| GNO | `0x6810e776880C02933D47DB1b9fc05908e5386b96` |

## Configuration Files

### Docker Configuration

- **`docker-compose.offline.yml`**: Defines all services (chain, database, orderbook, autopilot, driver, baseline solver)
- **`.env.offline`**: Environment variables for services

### Solver Configuration

- **`configs/offline/driver.toml`**: Driver configuration for offline mode
  - Chain ID: 31337
  - Settlement contract address
  - Gas estimation settings

### Blockchain State

- **`state/anvil-state.json`**: Persistent Anvil blockchain state
  - Automatically generated on first run by the chain-deployer service
  - Contains all deployed contracts and pre-seeded liquidity pools
  - Can be deleted to trigger a fresh deployment

## Architecture

```
┌─────────────────┐
│  Anvil (31337)  │  ← Local blockchain with persistent state
└────────┬────────┘
         │
    ┌────┴─────────────────────────────────┐
    │                                       │
┌───▼────────┐                    ┌────────▼──────┐
│   Tokens   │                    │  DEX Contracts │
│ WETH, USDC │                    │   Uniswap V2   │
│    DAI     │                    │  (with pools)  │
└────────────┘                    └────────────────┘
                                           │
         ┌─────────────────────────────────┤
         │                                 │
    ┌────▼──────────┐          ┌──────────▼──────┐
    │  CoW Protocol │          │ Balancer Vault  │
    │   Settlement  │◄─────────│     (Mock)      │
    │ VaultRelayer  │          └─────────────────┘
    └───────┬───────┘
            │
    ┌───────┴──────────────────────────────┐
    │                                       │
┌───▼─────┐  ┌──────────┐  ┌──────┐  ┌────▼────┐
│Orderbook│  │Autopilot │  │Driver│  │Baseline │
│   API   │  │          │  │      │  │ Solver  │
└─────────┘  └──────────┘  └──────┘  └─────────┘
```

## Troubleshooting

### Services not starting

Check Docker logs:
```bash
docker-compose -f docker-compose.offline.yml logs -f [service_name]
```

Services: `chain`, `orderbook`, `autopilot`, `driver`, `baseline`

### Orders not settling

1. Check if services are running:
   ```bash
   docker-compose -f docker-compose.offline.yml ps
   ```

2. Check driver logs for errors:
   ```bash
   docker-compose -f docker-compose.offline.yml logs driver --tail=50
   ```

3. Verify token approvals are set for VaultRelayer

### Reset everything

```bash
# Stop all services
docker-compose -f docker-compose.offline.yml down -v

# Remove state to trigger fresh deployment
rm offline-mode/state/anvil-state.json

# Start fresh (chain-deployer will automatically redeploy everything)
docker-compose -f docker-compose.offline.yml up -d
```

## Development Workflow

1. **Make code changes** to contracts or services
2. **Rebuild contracts** using appropriate Foundry profile (if contract changes were made)
3. **Redeploy** by deleting the state file: `rm offline-mode/state/anvil-state.json`
4. **Restart services**: `docker-compose -f docker-compose.offline.yml up -d`
5. **Test changes** using the TypeScript integration tests: `npm run test:order` or `npm run test:cowshed`

## Learn More

- [CoW Protocol Documentation](https://docs.cow.fi/)
- [Foundry Book](https://book.getfoundry.sh/)
- [Grant Application](grant_application-by-hand.md) - Full project roadmap and architecture

## License

This project is part of the CoW Protocol ecosystem and follows the same open-source licensing.
