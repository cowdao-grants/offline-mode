#!/bin/bash
set -e  # Exit immediately if any command fails
set -o pipefail  # Catch errors in pipes

STATE_FILE="/state/anvil-state.json"
DEPLOYMENT_COMPLETE_FLAG="/tmp/deployment-complete"

# Cleanup function to kill Anvil on error
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo "❌ Script failed with exit code $exit_code"
        if [ ! -z "$ANVIL_PID" ]; then
            echo "🛑 Killing Anvil process $ANVIL_PID..."
            kill $ANVIL_PID 2>/dev/null || true
        fi
    fi
}
trap cleanup EXIT

echo "🔍 Chain Deployer: Checking for existing state..."

# Check if we have a deployment-ready state with contracts
if [ -f "$STATE_FILE" ]; then
    echo "✅ State file found at $STATE_FILE with deployed contracts"
    echo "🎉 Chain deployer is healthy - state already exists"
    touch "$DEPLOYMENT_COMPLETE_FLAG"
    exit 0
fi

echo "⚠️  No state file found. Starting deployment process..."

# Clean up any old broadcast directories that might have stale data
echo "🧹 Cleaning up old broadcast/cache directories..."
rm -rf /workspace/broadcast
rm -rf /workspace/cache
echo "✅ Old configuration cleaned"

# Install Node.js 18.x (LTS) and npm
echo "📦 Installing Node.js 18.x and npm..."
apt-get update -qq
apt-get install -y -qq curl
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y -qq nodejs
node --version
npm --version

# Install dependencies
echo "📦 Installing npm dependencies..."
cd /workspace
if ! npm install --legacy-peer-deps; then
    echo "❌ Failed to install npm dependencies"
    exit 1
fi

# Step 1: Start Anvil at target block number
TARGET_BLOCK=12593265
echo "🚀 Step 1: Starting Anvil at block $TARGET_BLOCK..."

anvil \
    --host 0.0.0.0 \
    --port 8545 \
    --chain-id 1 \
    --number $TARGET_BLOCK \
    --gas-limit 30000000 \
    --code-size-limit 50000 \
    --mnemonic "test test test test test test test test test test test junk" \
    --dump-state "$STATE_FILE" &

ANVIL_PID=$!
echo "📝 Anvil PID: $ANVIL_PID"

# Wait for Anvil to be ready
echo "⏳ Waiting for Anvil to be ready..."
for i in {1..30}; do
    if cast rpc eth_blockNumber --rpc-url http://127.0.0.1:8545 > /dev/null 2>&1; then
        echo "✅ Anvil is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Timeout waiting for Anvil to start"
        kill $ANVIL_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# Step 2: Set block number using vm.roll()
TARGET_BLOCK=12593265
echo "🔢 Step 2: Setting block number to $TARGET_BLOCK using vm.roll()..."
echo "📊 Note: This sets the block context for Forge scripts during deployment"

if ! forge script contracts/script/SetBlockNumber.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --unlocked; then
    echo "⚠️  Warning: Failed to run SetBlockNumber script, but continuing with deployment..."
fi

echo "✅ Block number context prepared for deployments"
echo ""

# Run deployment
echo "🚀 Step 3: Running deployment script..."
if ! npm run deploy:ts 2>&1 | tee /tmp/deployment.log; then
    echo "❌ Deployment script failed!"
    exit 1
fi

echo "✅ Deployment completed successfully!"

# Kill Anvil gracefully so it dumps the state
echo ""
echo "🛑 Stopping Anvil (this will automatically dump state)..."
echo "📝 Sending SIGTERM to Anvil PID $ANVIL_PID..."
kill -TERM $ANVIL_PID 2>/dev/null || true

echo "⏳ Waiting for Anvil to finish dumping state..."
sleep 3

# Check if process is still running
if ps -p $ANVIL_PID > /dev/null 2>&1; then
    echo "⚠️  Anvil still running, sending SIGKILL..."
    kill -9 $ANVIL_PID 2>/dev/null || true
fi

wait $ANVIL_PID 2>/dev/null || true

# Debug: Check if file exists and list directory
echo "🔍 Checking for state file at $STATE_FILE..."
ls -la /state/ || echo "❌ /state directory not accessible"

# Verify state file was created
if [ ! -f "$STATE_FILE" ]; then
    echo "❌ State file was not created at $STATE_FILE"
    exit 1
fi

echo "✅ State saved to $STATE_FILE ($(stat -f%z "$STATE_FILE" 2>/dev/null || stat -c%s "$STATE_FILE" 2>/dev/null) bytes)"
echo "   Note: Chain will start at block 12593265 when loaded (configured via --number flag)"
echo ""

echo ""
echo "✅ Deployment completed successfully!"
echo "📝 Note: Contract addresses are deterministic and defined in .env"
echo "   - Authenticator: 0x2c4c28DDBdAc9C5E7055b4C863b72eA0149D8aFE"
echo "   - Settlement: 0x9008D19f58AAbD9eD0D60971565AA8510560ab41"
echo "   - VaultRelayer: 0xC92E8bdf79f0507f65a392b0ab4667716BFE0110"
echo ""
echo "🎉 Chain deployer completed successfully!"
touch "$DEPLOYMENT_COMPLETE_FLAG"
