# GoodAfterTime Order Requirements for Offline Mode

## Current Status

GoodAfterTime conditional orders are **NOT WORKING** in offline mode due to architectural limitations.

## Why GoodAfterTime Doesn't Work

### The Problem

The GoodAfterTime handler requires `offchainInput` to contain a `buyAmount` value:

```solidity
// GoodAfterTime.sol - getTradeableOrder()
uint256 buyAmount = abi.decode(offchainInput, (uint256));
```

If `offchainInput` is empty (`0x`), the `abi.decode()` call fails, causing the handler to revert.

### Watch-Tower Limitation

The watch-tower **hardcodes** `offchainInput = "0x"` in `/modules/watch-tower/src/domain/polling/index.ts:354`:

```typescript
const offchainInput = "0x";
```

This is not configurable through the watch-tower config file (`config/watch-tower-config.json`).

### Why This Works in Production

In production CoW Protocol:

1. **Watch-Tower** monitors `ConditionalOrderCreated` events and posts order details to the Orderbook API
2. **Solvers** (external services) query the orderbook for new orders
3. **Solvers** calculate competitive `buyAmount` based on current market conditions (Uniswap, Balancer, etc.)
4. **Solvers** call `getTradeableOrderWithSignature()` with their proposed `buyAmount` in `offchainInput`
5. **Solvers** submit the resulting signed order to the settlement contract

### What's Missing in Offline Mode

The **baseline solver** included in this setup:
- ✅ Routes regular orders through Uniswap
- ✅ Handles quote requests
- ❌ **Does NOT interact with conditional order handlers**
- ❌ **Does NOT monitor ComposableCoW events**
- ❌ **Does NOT generate offchainInput for GoodAfterTime**

There is **no specialized conditional order solver** available as an open-source repository that can be added as a submodule.

## Comparison with Other Conditional Order Types

### TWAP (✅ Working)
- **Does NOT need offchainInput** - handler ignores it
- Calculates `buyAmount` internally from TWAP parameters
- Works with watch-tower's empty `offchainInput`

### StopLoss (✅ Working with Mock Oracles)
- **Does NOT need offchainInput** - handler ignores it
- Calculates `buyAmount` from strike price and oracle prices
- Requires Chainlink price oracles (we provide mocks)

### GoodAfterTime (❌ NOT Working)
- **REQUIRES offchainInput** with `buyAmount`
- Cannot work with watch-tower's empty `offchainInput`
- Designed for dynamic pricing by external solvers

## Solutions to Make GoodAfterTime Work

### Option 1: Modify Watch-Tower (Recommended for Testing)

Patch the watch-tower to query Uniswap and generate a reasonable `buyAmount` for GoodAfterTime orders:

**File to modify:** `/modules/watch-tower/src/domain/polling/index.ts`

```typescript
// Current (line 354)
const offchainInput = "0x";

// Proposed change
const offchainInput = await generateOffchainInput(
  conditionalOrder.params.handler,
  conditionalOrder.params.staticInput,
  provider
);
```

Then implement `generateOffchainInput()` to:
1. Detect if handler is GoodAfterTime (check address)
2. Decode staticInput to get sell/buy tokens and sell amount
3. Query Uniswap for current market price
4. Calculate a competitive buyAmount
5. ABI encode the buyAmount as offchainInput

**Pros:**
- Enables GoodAfterTime testing in offline mode
- Self-contained solution

**Cons:**
- Requires forking/patching watch-tower
- Not how production works (watch-tower shouldn't price orders)

### Option 2: Build a Specialized Solver

Create a separate service that:
1. Monitors the Orderbook API for GoodAfterTime orders
2. Queries Uniswap/baseline solver for prices
3. Calls GoodAfterTime handler with proposed buyAmount
4. Submits resulting orders to settlement

**Pros:**
- Matches production architecture
- Reusable for future conditional order types

**Cons:**
- Significant development effort
- Requires Rust (to match services architecture) or TypeScript
- No existing codebase to reference

### Option 3: Use Frontend/Bot Integration

In production, GoodAfterTime orders are often created and monitored by:
- CoW Swap frontend
- Trading bots
- MEV searchers

These services monitor events, calculate prices, and submit orders directly.

**For offline mode testing:** You could write a simple script that:
1. Listens for `ConditionalOrderCreated` events
2. Calls the handler with a hardcoded buyAmount
3. Posts the result to the orderbook API

### Option 4: Skip GoodAfterTime for Offline Testing

**Current Recommendation:** Focus on TWAP and StopLoss testing, as they:
- Work with current infrastructure
- Cover the core conditional order functionality
- Don't require solver integration

## Summary

| Order Type | Works in Offline Mode? | Reason |
|------------|----------------------|--------|
| TWAP | ✅ Yes | Self-contained, no offchainInput needed |
| StopLoss | ✅ Yes (with mock oracles) | Self-contained, uses oracle prices |
| GoodAfterTime | ❌ No | Requires external solver to propose buyAmount |

## Next Steps

If GoodAfterTime support is critical:

1. **Short-term:** Patch watch-tower to query Uniswap and generate buyAmount
2. **Long-term:** Build a proper conditional order solver service

Otherwise, document this limitation and focus testing on TWAP and StopLoss orders.
