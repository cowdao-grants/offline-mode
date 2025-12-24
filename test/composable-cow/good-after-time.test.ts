// WIP
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
  printTestHeader('ComposableCow Good After Time Order Test', '⏰');

  const provider = new ethers.JsonRpcProvider(NODE_URL);
  const wallet = new ethers.Wallet(CONFIG.account1PrivateKey, provider);

  console.log('📋 Configuration:');
  console.log(`   Chain ID: ${CONFIG.chainId}`);
  console.log(`   User EOA: ${wallet.address}`);
  console.log(`   Safe Wallet: ${SAFE_WALLET}`);
  console.log(`   Settlement: ${ADDRESSES.settlement}`);
  console.log(`   Vault Relayer: ${ADDRESSES.vaultRelayer}`);
  console.log(`   ComposableCoW: ${ADDRESSES.composableCoW}`);
  console.log(`   Good After Time Handler: ${ADDRESSES.goodAfterTime}`);
  console.log('');

  // Get contracts
  const dai = new ethers.Contract(ADDRESSES.dai, ERC20_ABI, provider);
  const weth = new ethers.Contract(ADDRESSES.weth, ERC20_ABI, provider);

  // Step 1: Setup Safe Wallet with DAI
  printSection('STEP 1: Setup Safe Wallet with DAI');

  const sellAmount = ethers.parseEther('50'); // 50 DAI
  await ensureTokenBalance(ADDRESSES.dai, SAFE_WALLET, sellAmount, wallet);

  const daiBalance = await dai.balanceOf(SAFE_WALLET);
  console.log(`   Safe Wallet DAI Balance: ${ethers.formatEther(daiBalance)} DAI`);

  // Approve vault relayer from Safe
  const daiAllowance = await dai.allowance(SAFE_WALLET, ADDRESSES.vaultRelayer);
  if (daiAllowance < sellAmount) {
    console.log('   Approving vault relayer from Safe...');
    await provider.send('anvil_impersonateAccount', [SAFE_WALLET]);
    const safeSigner = await provider.getSigner(SAFE_WALLET);
    const daiAsSafe = new ethers.Contract(ADDRESSES.dai, ERC20_ABI, safeSigner);
    const approveTx = await daiAsSafe.approve(ADDRESSES.vaultRelayer, ethers.parseEther('1000000'));
    await approveTx.wait();
    await provider.send('anvil_stopImpersonatingAccount', [SAFE_WALLET]);
    console.log('   ✅ Approved');
  }
  const finalAllowance = await dai.allowance(SAFE_WALLET, ADDRESSES.vaultRelayer);
  console.log(`   Safe DAI Allowance for Vault Relayer: ${ethers.formatEther(finalAllowance)} DAI`);
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

  // Step 2: Create Good After Time Order Parameters
  printSection('STEP 2: Create Good After Time Order Parameters');

  const currentTime = await getCurrentTimestamp(provider);
  const validFrom = currentTime - 10; // Valid from 10 seconds ago (immediately tradeable)
  const validTo = currentTime + 3600; // Valid for 1 hour from now

  /*
   * Good After Time Order Data Structure:
   * struct Data {
   *   IERC20 sellToken;
   *   IERC20 buyToken;
   *   address receiver;
   *   uint256 sellAmount;
   *   uint256 buyAmount;
   *   uint32 validTo;
   *   bytes32 appData;
   *   uint256 feeAmount;
   *   bytes32 kind;  // sell or buy
   *   bool partiallyFillable;
   *   bytes32 sellTokenBalance;
   *   bytes32 buyTokenBalance;
   *   uint256 validFrom;  // The "good after" time
   * }
   */

  const goodAfterTimeConfig = {
    sellToken: ADDRESSES.dai,
    buyToken: ADDRESSES.weth,
    receiver: SAFE_WALLET,
    sellAmount: sellAmount.toString(),
    buyAmount: ethers.parseEther('0.020').toString(), // Minimum 0.020 WETH (0.0004 WETH/DAI rate, below market 0.0005)
    validTo: validTo,
    appData: ethers.ZeroHash,
    feeAmount: 0,
    kind: ethers.id('sell').slice(0, 66), // bytes32 for "sell"
    partiallyFillable: false,
    sellTokenBalance: ethers.id('erc20').slice(0, 66), // bytes32 for "erc20"
    buyTokenBalance: ethers.id('erc20').slice(0, 66),
    validFrom: validFrom,
  };

  console.log('   Good After Time Configuration:');
  console.log(`   Sell Token: DAI (${goodAfterTimeConfig.sellToken})`);
  console.log(`   Buy Token: WETH (${goodAfterTimeConfig.buyToken})`);
  console.log(`   Sell Amount: ${ethers.formatEther(sellAmount)} DAI`);
  console.log(`   Min Buy Amount: ${ethers.formatEther(goodAfterTimeConfig.buyAmount)} WETH`);
  console.log(`   Valid From: ${new Date(validFrom * 1000).toISOString()} (immediately valid)`);
  console.log(`   Valid To: ${new Date(validTo * 1000).toISOString()}`);
  console.log('');

  // Step 3: Encode Good After Time Data and Create Conditional Order
  printSection('STEP 3: Create Conditional Order in ComposableCow');

  // ABI encode the good-after-time data struct
  const goodAfterTimeDataEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      'address', // sellToken
      'address', // buyToken
      'address', // receiver
      'uint256', // sellAmount
      'uint256', // buyAmount
      'uint32',  // validTo
      'bytes32', // appData
      'uint256', // feeAmount
      'bytes32', // kind
      'bool',    // partiallyFillable
      'bytes32', // sellTokenBalance
      'bytes32', // buyTokenBalance
      'uint256', // validFrom
    ],
    [
      goodAfterTimeConfig.sellToken,
      goodAfterTimeConfig.buyToken,
      goodAfterTimeConfig.receiver,
      goodAfterTimeConfig.sellAmount,
      goodAfterTimeConfig.buyAmount,
      goodAfterTimeConfig.validTo,
      goodAfterTimeConfig.appData,
      goodAfterTimeConfig.feeAmount,
      goodAfterTimeConfig.kind,
      goodAfterTimeConfig.partiallyFillable,
      goodAfterTimeConfig.sellTokenBalance,
      goodAfterTimeConfig.buyTokenBalance,
      goodAfterTimeConfig.validFrom,
    ]
  );

  // Create conditional order params
  const salt = ethers.randomBytes(32);
  const conditionalOrderParams = {
    handler: ADDRESSES.goodAfterTime,
    salt: ethers.hexlify(salt),
    staticInput: goodAfterTimeDataEncoded,
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
  printSection('STEP 4: Monitor for Order Execution');

  console.log('   Waiting for order execution...');
  console.log(`   ℹ️  Order is valid from: ${new Date(validFrom * 1000).toISOString()} (already valid)`);
  console.log('   (Checking balances every 10 seconds for up to 10 minutes)');
  console.log('');

  const initialDaiBalance = await dai.balanceOf(SAFE_WALLET);
  const initialWethBalance = await weth.balanceOf(SAFE_WALLET);

  console.log('   Initial Safe Wallet Balances:');
  console.log(`   DAI: ${ethers.formatEther(initialDaiBalance)}`);
  console.log(`   WETH: ${ethers.formatEther(initialWethBalance)}`);
  console.log('');

  const orderExecuted = await waitForOrderExecution(async () => {
    const currentDaiBalance = await dai.balanceOf(SAFE_WALLET);
    const currentWethBalance = await weth.balanceOf(SAFE_WALLET);

    // Check if DAI decreased and WETH increased
    if (currentDaiBalance < initialDaiBalance && currentWethBalance > initialWethBalance) {
      console.log('');
      console.log('   ✅ Order executed!');
      console.log('   Final Safe Wallet Balances:');
      console.log(`   DAI: ${ethers.formatEther(currentDaiBalance)} (Δ ${ethers.formatEther(currentDaiBalance - initialDaiBalance)})`);
      console.log(`   WETH: ${ethers.formatEther(currentWethBalance)} (Δ ${ethers.formatEther(currentWethBalance - initialWethBalance)})`);
      return true;
    }

    return false;
  });

  if (!orderExecuted) {
    console.log('');
    console.log('   ⏱️  Timeout reached. Order not executed within monitoring period.');
    console.log('   ℹ️  Check watch-tower logs for any issues.');
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
