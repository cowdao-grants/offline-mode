# Integration Tests

This directory contains Jest integration tests for CoW Protocol orders in the offline development environment.

## Prerequisites

**⚠️ IMPORTANT:** You must have the Docker Compose services running before running tests!

The tests interact with:
- **Anvil chain** (`http://localhost:8545`) - For blockchain transactions
- **Orderbook API** (`http://localhost:8080`) - For submitting orders
- **Autopilot, Driver, and Solver** - For order settlement

## Running Tests

### 1. Start Services

First, ensure all services are running:

```bash
docker-compose up -d
```

Wait for services to be ready (optional but recommended):

```bash
curl --retry 24 --retry-delay 5 --retry-all-errors http://localhost:8080/api/v1/version
```

### 2. Run Tests

Run all integration tests:

```bash
npm test
```

Run tests in watch mode (for development):

```bash
npm run test:watch
```

Run a specific test file:

```bash
npx jest test/__tests__/orders/limit-order.test.ts
```

### 3. Stop Services (when done)

```bash
docker-compose down
```

## Test Structure

```
test/
├── __tests__/
│   └── orders/
│       ├── limit-order.test.ts    - Limit order (sell) tests
│       └── market-order.test.ts   - Market order (buy) tests
├── utils/
│   ├── loadAddresses.ts           - Load deployed contract addresses
│   └── order-helpers.ts           - Shared test utilities
└── setup/
    └── jest-setup.ts              - Pre-test service check
```

## What Gets Tested

### Limit Orders (Sell Orders)
- DAI → WETH swap
- USDC → DAI swap
- Verifies balances change correctly
- Waits for settlement (up to 2 minutes)

### Market Orders (Buy Orders)
- Buy 1 WETH with DAI
- Buy 100 USDC with DAI
- Verifies exact buy amounts received
- Handles fee calculations

## Test Configuration

- **Timeout:** 2 minutes per test (configured in `jest.config.js`)
- **Environment:** Node.js
- **Test Runner:** Jest with ts-jest
- **Test Wallets:**
  - Limit orders use Anvil account #1 (alice)
  - Market orders use Anvil account #2 (bob)

## Troubleshooting

### Error: "Anvil Chain is not running"

Start the Docker services:
```bash
docker-compose up -d
```

### Error: "Orderbook API is not running"

Check if all services started successfully:
```bash
docker-compose ps
docker-compose logs orderbook
```

### Tests Timeout

If tests are timing out:
1. Check solver logs: `docker-compose logs baseline`
2. Restart baseline solver: `docker-compose restart baseline`
3. Verify liquidity pools have sufficient funds

### Orders Not Settling

Common causes:
- Baseline solver degraded (restart it)
- Insufficient token approvals (tests handle this automatically)
- No liquidity in the trading pair

## CI/CD Integration

These tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Start services
        run: docker-compose up -d

      - name: Wait for services
        run: |
          curl --retry 24 --retry-delay 5 --retry-all-errors \
            http://localhost:8080/api/v1/version

      - name: Run tests
        run: npm test

      - name: Stop services
        if: always()
        run: docker-compose down
```

## Manual Order Scripts

For manual order submission (not automated tests), see:
- `scripts/orders/` - Manual order submission scripts
- Run with `npm run order:*` commands

These are **not** Jest tests and don't require `npm test`.
