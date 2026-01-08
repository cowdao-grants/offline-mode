# ComposableCow Test Suite

This directory contains comprehensive integration tests for CoW Protocol's ComposableCow conditional orders functionality in offline mode.

## Overview

ComposableCow enables **conditional orders** (programmatic orders) that execute automatically when specific conditions are met. These tests validate the full end-to-end flow:

1. Order creation through ComposableCow
2. Watch-tower detection and monitoring
3. Discrete order generation when conditions are met
4. Order settlement through CoW Protocol

## Test Files

### 📁 `helpers.ts`
Shared utilities and helper functions used across all tests:
- Provider and wallet setup
- Token balance management
- Order execution monitoring
- Common formatting functions

### 🔄 `twap.test.ts`
**Time-Weighted Average Price (TWAP) Orders**
- Sells a large amount over time in smaller parts
- Reduces market impact
- Use case: Selling 30 DAI → WETH in 3 parts over 15 minutes

```bash
npm run test:composable-cow:twap
```

### 🛑 `stop-loss.test.ts`
**Stop-Loss Orders**
- Automatically sells when price drops below a threshold
- Protects against downside risk
- Use case: Sell 1 WETH if price drops below $2500

```bash
npm run test:composable-cow:stop-loss
```

### ⏰ `good-after-time.test.ts`
**Good After Time Orders**
- Order becomes valid only after a specific timestamp
- Useful for scheduled trades
- Use case: Sell 50 DAI → WETH starting 30 seconds from now

```bash
npm run test:composable-cow:good-after-time
```

## Running Tests

### Prerequisites

1. **Start offline mode environment:**
   ```bash
   docker-compose up -d
   ```

2. **Deploy contracts:**
   ```bash
   npm run deploy:all
   ```

3. **Wait for services to be ready:**
   - Watch-tower should be running
   - Orderbook API should be available
   - Chain-deployer should be synced

### Run Individual Tests

```bash
# TWAP order test
npm run test:composable-cow:twap

# Stop-loss order test
npm run test:composable-cow:stop-loss

# Good after time order test
npm run test:composable-cow:good-after-time
```

### Run All Tests (if implemented)

```bash
npm run test:composable-cow:all
```

## Test Structure

Each test follows this pattern:

```
1. Setup & Configuration
   ├─ Load environment variables
   ├─ Connect to provider
   └─ Setup wallet

2. Token Setup
   ├─ Ensure user has required tokens
   └─ Approve VaultRelayer to spend tokens

3. Create Conditional Order
   ├─ Encode order parameters
   ├─ Call ComposableCow.create()
   └─ Verify order creation

4. Monitor Execution
   ├─ Poll balances periodically
   ├─ Detect order execution
   └─ Report results
```

## Understanding the Results

### ✅ Successful Execution
```
✅ Conditional order created in block 12345
ℹ️  Order owner: 0x7099... (EOA)
✅ Order executed!
Final Balances:
   DAI: 70.0 (Δ -30.0)
   WETH: 0.015 (Δ +0.015)
```

### ⏱️ Timeout (Expected for some tests)
```
⏱️  Timeout reached. Order not executed within monitoring period.
ℹ️  This is expected if conditions haven't been met yet.
```

This is normal for:
- **Stop-Loss**: If market price hasn't hit the strike
- **TWAP**: If start time hasn't been reached
- **Good After Time**: If validFrom time hasn't passed

### ❌ Errors

Check these if tests fail:

1. **Contract not deployed:**
   ```
   Error: call revert exception
   ```
   → Run `npm run deploy:composablecow`

2. **Watch-tower not detecting orders:**
   → Check `docker logs offline-mode-watch-tower-1`

3. **Insufficient token balance:**
   → Ensured automatically by helpers, but check Anvil account #0 has tokens

## Order Types Explained

### TWAP (Time-Weighted Average Price)
- **Purpose**: Split large orders into smaller chunks over time
- **Parameters**:
  - `partSellAmount`: Amount per part
  - `n`: Number of parts
  - `t`: Time between parts
  - `t0`: Start time
- **When it executes**: At each time interval (t0, t0+t, t0+2t, ...)

### Stop-Loss
- **Purpose**: Protect against price drops
- **Parameters**:
  - `strike`: Price threshold
  - `sellAmount`: Amount to sell
  - `buyAmount`: Minimum to receive
- **When it executes**: When price drops to or below strike

### Good After Time
- **Purpose**: Schedule orders for future execution
- **Parameters**:
  - `validFrom`: Earliest execution time
  - `validTo`: Latest execution time
  - `sellAmount`, `buyAmount`: Order amounts
- **When it executes**: After validFrom, when conditions allow

## Advanced Usage

### Custom Order Parameters

Modify the configuration objects in each test to customize:
- Token pairs
- Amounts
- Time intervals
- Price thresholds

Example for TWAP:
```typescript
const twapConfig = {
  partSellAmount: ethers.parseEther('20'),  // 20 DAI per part
  n: 5,  // 5 parts
  t: 600,  // 10 minutes between parts
  // ...
};
```

### Adding New Order Types

To add a new order type:

1. Create `test/composable-cow/new-type.test.ts`
2. Import helpers from `./helpers`
3. Follow the test structure pattern
4. Add npm script to `package.json`
5. Update this README

### Debugging

Enable verbose logging:
```bash
# Watch-tower logs
docker logs offline-mode-watch-tower-1 -f

# Chain-deployer logs
docker logs offline-mode-chain-deployer-1 -f

# Orderbook logs
docker logs offline-mode-orderbook-1 -f
```

## Architecture

```
┌─────────────────┐
│  Test Script    │
│  (TypeScript)   │
└────────┬────────┘
         │ create()
         ↓
┌─────────────────┐
│  ComposableCow  │  ← On-chain contract
│   Contract      │
└────────┬────────┘
         │ ConditionalOrderCreated event
         ↓
┌─────────────────┐
│  Watch-Tower    │  ← Monitors & generates orders
│   Service       │
└────────┬────────┘
         │ POST /api/v1/orders
         ↓
┌─────────────────┐
│  Orderbook API  │  ← Validates & stores orders
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│    Solvers      │  ← Find best execution
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Settlement     │  ← Executes trades on-chain
│   Contract      │
└─────────────────┘
```

## Troubleshooting

### Test hangs at "Waiting for order execution"

**Cause**: Watch-tower may not be detecting the order

**Solutions**:
1. Check watch-tower is running: `docker ps | grep watch-tower`
2. Check logs: `docker logs offline-mode-watch-tower-1 --tail 50`
3. Verify order was created: Check for `ConditionalOrderCreated` event in test output
4. Restart watch-tower: `docker restart offline-mode-watch-tower-1`

### Order created but never executes

**Cause**: Conditions not met

**Solutions**:
- **TWAP**: Wait for start time (t0) to pass
- **Stop-Loss**: Price conditions may not be met in offline mode
- **Good After Time**: Wait for validFrom timestamp

### "Insufficient balance" errors

**Cause**: Test wallet doesn't have enough tokens

**Solutions**:
1. Check Anvil account #0 has tokens (it's pre-funded)
2. Helpers automatically transfer from account #0
3. Restart Anvil if needed: `docker-compose restart chain`

## Further Reading

- [ComposableCow Documentation](https://docs.cow.fi/cow-protocol/reference/contracts/periphery/composable-cow)
- [CoW Protocol Docs](https://docs.cow.fi/)
- [Conditional Orders Guide](https://docs.cow.fi/cow-protocol/tutorials/cow-swap/create-conditional-orders)

## Contributing

When adding new test scenarios:
1. Follow the existing test structure
2. Use helpers from `helpers.ts`
3. Add clear console output with emojis
4. Document order parameters
5. Update this README
