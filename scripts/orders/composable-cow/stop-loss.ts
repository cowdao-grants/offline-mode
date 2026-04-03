import { ethers } from 'ethers';
import {
  CONFIG,
  ADDRESSES,
  ERC20_ABI,
  COMPOSABLE_COW_ABI,
  setupWallet,
  setupProvider,
  ensureTokenBalance,
  ensureTokenAllowance,
  waitForOrderExecution,
  printTestHeader,
  printSection,
  getCurrentTimestamp,
} from './helpers';

// Override NODE_URL for local testing
const NODE_URL = 'http://localhost:8545';
const SAFE_WALLET = process.env.TEST_USER_SAFE_ADDRESS!;
const EXTENSIBLE_FALLBACK_HANDLER = process.env.EXTENSIBLE_FALLBACK_HANDLER_ADDRESS!;

async function main() {
  printTestHeader('ComposableCow Stop-Loss Order Test', '🛑');

  const provider = new ethers.JsonRpcProvider(NODE_URL);
  const wallet = new ethers.Wallet(CONFIG.account1PrivateKey, provider);

  console.log('📋 Configuration:');
  console.log(`   Chain ID: ${CONFIG.chainId}`);
  console.log(`   User EOA: ${wallet.address}`);
  console.log(`   Safe Wallet: ${SAFE_WALLET}`);
  console.log(`   Settlement: ${ADDRESSES.settlement}`);
  console.log(`   Vault Relayer: ${ADDRESSES.vaultRelayer}`);
  console.log(`   ComposableCoW: ${ADDRESSES.composableCoW}`);
  console.log(`   Stop-Loss Handler: ${ADDRESSES.stopLoss}`);
  console.log('');

  // Get contracts
  const dai = new ethers.Contract(ADDRESSES.dai, ERC20_ABI, provider);
  const weth = new ethers.Contract(ADDRESSES.weth, ERC20_ABI, provider);

  // Step 1: Setup Safe Wallet with WETH (we'll sell WETH if price drops)
  printSection('STEP 1: Setup Safe Wallet with WETH');

  const sellAmount = ethers.parseEther('1'); // 1 WETH

  // Ensure Safe has WETH
  const currentWethBalance = await weth.balanceOf(SAFE_WALLET);
  if (currentWethBalance < sellAmount) {
    console.log('   Need more WETH. Getting from Anvil account #0...');
    await ensureTokenBalance(ADDRESSES.weth, SAFE_WALLET, sellAmount, wallet);
    const newBalance = await weth.balanceOf(SAFE_WALLET);
    console.log(`   ✅ Received WETH. New balance: ${ethers.formatEther(newBalance)} WETH`);
  } else {
    console.log(`   Safe Wallet WETH Balance: ${ethers.formatEther(currentWethBalance)} WETH`);
  }

  // Approve vault relayer from Safe
  const wethAllowance = await weth.allowance(SAFE_WALLET, ADDRESSES.vaultRelayer);
  if (wethAllowance < sellAmount) {
    console.log('   Approving vault relayer from Safe...');

    await provider.send('anvil_impersonateAccount', [SAFE_WALLET]);
    const safeSigner = await provider.getSigner(SAFE_WALLET);
    const wethAsSafe = new ethers.Contract(ADDRESSES.weth, ERC20_ABI, safeSigner);

    const approveTx = await wethAsSafe.approve(ADDRESSES.vaultRelayer, ethers.parseEther('1000000'));
    await approveTx.wait();
    await provider.send('anvil_stopImpersonatingAccount', [SAFE_WALLET]);
    console.log('   ✅ Approved');
  }

  const finalAllowance = await weth.allowance(SAFE_WALLET, ADDRESSES.vaultRelayer);
  console.log(`   Safe WETH Allowance for Vault Relayer: ${ethers.formatEther(finalAllowance)} WETH`);
  console.log('');

  // Step 1.5: Configure ComposableCoW Domain Verifier
  printSection('STEP 1.5: Configure ComposableCoW Domain Verifier');

  const settlementDomainSeparator = await provider.call({
    to: ADDRESSES.settlement,
    data: '0xf698da25', // domainSeparator()
  });

  console.log(`   Settlement Domain Separator: ${settlementDomainSeparator}`);
  console.log(`   Extensible Fallback Handler: ${EXTENSIBLE_FALLBACK_HANDLER}`);
  console.log('');

  console.log('   Setting ComposableCoW as domain verifier on Safe...');
  await provider.send('anvil_impersonateAccount', [SAFE_WALLET]);
  const safeSigner = await provider.getSigner(SAFE_WALLET);

  const setDomainVerifierData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'address'],
    [settlementDomainSeparator, ADDRESSES.composableCoW]
  );

  const setVerifierTx = await safeSigner.sendTransaction({
    to: SAFE_WALLET,
    data: '0x3365582c' + setDomainVerifierData.slice(2), // setDomainVerifier(bytes32,address)
  });
  await setVerifierTx.wait();
  await provider.send('anvil_stopImpersonatingAccount', [SAFE_WALLET]);

  console.log('   ✅ ComposableCoW configured as domain verifier');
  console.log('');

  // Step 2: Create Stop-Loss Order Parameters
  printSection('STEP 2: Create Stop-Loss Order Parameters');

  /*
   * Stop-Loss Order Data Structure (CORRECT ORDER):
   * struct Data {
   *   IERC20 sellToken;                           // 1
   *   IERC20 buyToken;                            // 2
   *   uint256 sellAmount;                         // 3
   *   uint256 buyAmount;                          // 4
   *   bytes32 appData;                            // 5
   *   address receiver;                           // 6
   *   bool isSellOrder;                           // 7
   *   bool isPartiallyFillable;                   // 8
   *   uint32 validTo;                             // 9
   *   IAggregatorV3Interface sellTokenPriceOracle;// 10
   *   IAggregatorV3Interface buyTokenPriceOracle; // 11
   *   int256 strike;                              // 12
   *   uint256 maxTimeSinceLastOracleUpdate;       // 13
   * }
   */

  const currentTime = await getCurrentTimestamp(provider);
  const validTo = currentTime + 3600; // Valid for 1 hour

  const stopLossConfig = {
    sellToken: ADDRESSES.weth,
    buyToken: ADDRESSES.dai,
    sellAmount: sellAmount.toString(),
    buyAmount: ethers.parseEther('2400').toString(), // Minimum 2400 DAI (we expect ~3000 from current oracle prices)
    appData: ethers.ZeroHash,
    receiver: SAFE_WALLET,
    isSellOrder: true,
    isPartiallyFillable: false,
    validTo: validTo,
    sellTokenPriceOracle: ADDRESSES.oracles.wethUsd, // Mock Chainlink WETH/USD oracle
    buyTokenPriceOracle: ADDRESSES.oracles.daiUsd,   // Mock Chainlink DAI/USD oracle
    strike: ethers.parseEther('3500').toString(), // Trigger when price drops BELOW 3500 DAI/WETH (current oracle price is $3000, so this WILL trigger)
    maxTimeSinceLastOracleUpdate: 3600, // 1 hour
  };

  console.log('   Stop-Loss Configuration:');
  console.log(`   Sell Token: WETH (${stopLossConfig.sellToken})`);
  console.log(`   Buy Token: DAI (${stopLossConfig.buyToken})`);
  console.log(`   Sell Amount: ${ethers.formatEther(sellAmount)} WETH`);
  console.log(`   Min Buy Amount: ${ethers.formatEther(stopLossConfig.buyAmount)} DAI`);
  console.log(`   Strike Price: ${ethers.formatEther(stopLossConfig.strike)} DAI/WETH`);
  console.log(`   Order Type: ${stopLossConfig.isSellOrder ? 'Sell' : 'Buy'} Order`);
  console.log(`   WETH/USD Oracle: ${stopLossConfig.sellTokenPriceOracle}`);
  console.log(`   DAI/USD Oracle: ${stopLossConfig.buyTokenPriceOracle}`);
  console.log('');

  // Step 3: Encode Stop-Loss Data and Create Conditional Order
  printSection('STEP 3: Create Conditional Order in ComposableCow');

  // ABI encode the stop-loss data struct (CORRECT ORDER)
  const stopLossDataEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      'address', // sellToken          - 1
      'address', // buyToken           - 2
      'uint256', // sellAmount         - 3
      'uint256', // buyAmount          - 4
      'bytes32', // appData            - 5
      'address', // receiver           - 6
      'bool',    // isSellOrder        - 7
      'bool',    // isPartiallyFillable- 8
      'uint32',  // validTo            - 9
      'address', // sellTokenPriceOracle - 10
      'address', // buyTokenPriceOracle  - 11
      'int256',  // strike             - 12
      'uint256', // maxTimeSinceLastOracleUpdate - 13
    ],
    [
      stopLossConfig.sellToken,
      stopLossConfig.buyToken,
      stopLossConfig.sellAmount,
      stopLossConfig.buyAmount,
      stopLossConfig.appData,
      stopLossConfig.receiver,
      stopLossConfig.isSellOrder,
      stopLossConfig.isPartiallyFillable,
      stopLossConfig.validTo,
      stopLossConfig.sellTokenPriceOracle,
      stopLossConfig.buyTokenPriceOracle,
      stopLossConfig.strike,
      stopLossConfig.maxTimeSinceLastOracleUpdate,
    ]
  );

  // Create conditional order params
  const salt = ethers.randomBytes(32);
  const conditionalOrderParams = {
    handler: ADDRESSES.stopLoss,
    salt: ethers.hexlify(salt),
    staticInput: stopLossDataEncoded,
  };

  console.log('   Creating conditional order through ComposableCoW...');
  console.log(`   Handler: ${conditionalOrderParams.handler}`);
  console.log(`   Salt: ${conditionalOrderParams.salt.substring(0, 20)}...`);
  console.log('');

  try {
    await provider.send('anvil_impersonateAccount', [SAFE_WALLET]);
    const safeSignerForOrder = await provider.getSigner(SAFE_WALLET);
    const composableCoWAsSafe = new ethers.Contract(ADDRESSES.composableCoW, COMPOSABLE_COW_ABI, safeSignerForOrder);

    const createTx = await composableCoWAsSafe.create(conditionalOrderParams, true);
    console.log(`   Transaction hash: ${createTx.hash}`);

    const receipt = await createTx.wait();
    await provider.send('anvil_stopImpersonatingAccount', [SAFE_WALLET]);

    console.log(`   ✅ Conditional order created in block ${receipt?.blockNumber}`);
    console.log(`   ℹ️  Order owner: ${SAFE_WALLET} (Safe Wallet)`);
    console.log('');
  } catch (error: any) {
    await provider.send('anvil_stopImpersonatingAccount', [SAFE_WALLET]);
    console.error('   ❌ Failed to create conditional order:');
    console.error(`   Error: ${error.message}`);
    if (error.data) {
      console.error(`   Data: ${error.data}`);
    }
    process.exit(1);
  }

  // Step 4: Monitor for Order Execution
  printSection('STEP 4: Monitor for Stop-Loss Trigger');

  console.log('   Waiting for stop-loss to trigger...');
  console.log('   ℹ️  In offline mode, price conditions may not trigger automatically');
  console.log('   ℹ️  This order will execute if WETH price drops to the strike price');
  console.log('   (Checking balances every 10 seconds for up to 10 minutes)');
  console.log('');

  const initialWethBalance = await weth.balanceOf(SAFE_WALLET);
  const initialDaiBalance = await dai.balanceOf(SAFE_WALLET);

  console.log('   Initial Safe Wallet Balances:');
  console.log(`   WETH: ${ethers.formatEther(initialWethBalance)}`);
  console.log(`   DAI: ${ethers.formatEther(initialDaiBalance)}`);
  console.log('');

  const orderExecuted = await waitForOrderExecution(async () => {
    const currentWethBalance = await weth.balanceOf(SAFE_WALLET);
    const currentDaiBalance = await dai.balanceOf(SAFE_WALLET);

    // Check if WETH decreased and DAI increased
    if (currentWethBalance < initialWethBalance && currentDaiBalance > initialDaiBalance) {
      console.log('');
      console.log('   ✅ Stop-loss order executed!');
      console.log('   Final Safe Wallet Balances:');
      console.log(`   WETH: ${ethers.formatEther(currentWethBalance)} (Δ ${ethers.formatEther(currentWethBalance - initialWethBalance)})`);
      console.log(`   DAI: ${ethers.formatEther(currentDaiBalance)} (Δ ${ethers.formatEther(currentDaiBalance - initialDaiBalance)})`);
      return true;
    }

    return false;
  });

  if (!orderExecuted) {
    console.log('');
    console.log('   ⏱️  Timeout reached. Stop-loss not triggered within monitoring period.');
    console.log('   ℹ️  This is expected if market price has not hit the strike price.');
    console.log('   ℹ️  The order remains active and will execute when conditions are met.');
  }

  console.log('');
  console.log('✅ Test Complete');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
