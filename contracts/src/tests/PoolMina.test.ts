import { AccountUpdate, Bool, fetchAccount, Mina, PrivateKey, PublicKey, UInt64, UInt8 } from 'o1js';

import { PoolMina, PoolMinaDeployProps, minimunLiquidity } from '../PoolMina';
import { MinaTokenHolder } from '../MinaTokenHolder';
import { FungibleToken } from '../FungibleToken';
import { mulDiv } from '../MathLibrary';
import { FungibleTokenAdmin } from '../FungibleTokenAdmin';

let proofsEnabled = false;

describe('Pool Mina', () => {
  let deployerAccount: Mina.TestPublicKey,
    deployerKey: PrivateKey,
    senderAccount: Mina.TestPublicKey,
    senderKey: PrivateKey,
    bobAccount: Mina.TestPublicKey,
    bobKey: PrivateKey,
    aliceAccount: Mina.TestPublicKey,
    aliceKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: PoolMina,
    zkTokenAdminAddress: PublicKey,
    zkTokenAdminPrivateKey: PrivateKey,
    zkTokenAdmin: FungibleTokenAdmin,
    zkToken0Address: PublicKey,
    zkToken0PrivateKey: PrivateKey,
    zkToken0: FungibleToken,
    zkLiquidityTokenAdminAddress: PublicKey,
    zkLiquidityTokenAdminPrivateKey: PrivateKey,
    zkLiquidityTokenAdmin: FungibleTokenAdmin,
    zkLiquidityTokenAddress: PublicKey,
    zkLiquidityTokenPrivateKey: PrivateKey,
    zkLiquidityToken: FungibleToken,
    tokenHolder0: MinaTokenHolder;

  beforeAll(async () => {
    const analyze = await PoolMina.analyzeMethods();
    getGates(analyze);

    if (proofsEnabled) {
      console.time('compile pool');
      await FungibleTokenAdmin.compile();
      await FungibleToken.compile();
      const key = await PoolMina.compile();
      await MinaTokenHolder.compile();
      console.timeEnd('compile pool');
    }

    function getGates(analyze: any) {
      for (const key in analyze) {
        if (Object.prototype.hasOwnProperty.call(analyze, key)) {
          const element = analyze[key];
          console.log(key, element?.gates.length)
        }
      }
    }
  });



  beforeEach(async () => {
    const Local = await Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    [deployerAccount, senderAccount, bobAccount, aliceAccount] = Local.testAccounts;
    deployerKey = deployerAccount.key;
    senderKey = senderAccount.key;
    bobKey = bobAccount.key;
    aliceKey = aliceAccount.key;

    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new PoolMina(zkAppAddress);

    zkTokenAdminPrivateKey = PrivateKey.random();
    zkTokenAdminAddress = zkTokenAdminPrivateKey.toPublicKey();
    zkTokenAdmin = new FungibleTokenAdmin(zkTokenAdminAddress);

    zkToken0PrivateKey = PrivateKey.random();
    zkToken0Address = zkToken0PrivateKey.toPublicKey();
    zkToken0 = new FungibleToken(zkToken0Address);

    zkLiquidityTokenAdminPrivateKey = PrivateKey.random();
    zkLiquidityTokenAdminAddress = zkLiquidityTokenAdminPrivateKey.toPublicKey();
    zkLiquidityTokenAdmin = new FungibleTokenAdmin(zkLiquidityTokenAdminAddress);

    zkLiquidityTokenPrivateKey = PrivateKey.random();
    zkLiquidityTokenAddress = zkLiquidityTokenPrivateKey.toPublicKey();
    zkLiquidityToken = new FungibleToken(zkLiquidityTokenAddress);


    // deploy liquidity token
    const txn0 = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 3);
      await zkLiquidityTokenAdmin.deploy({
        adminPublicKey: zkAppAddress,
      });
      await zkLiquidityToken.deploy({
        symbol: "lma",
        src: "https://github.com/MinaFoundation/mina-fungible-token/blob/main/FungibleToken.ts",
      });
      await zkLiquidityToken.initialize(
        zkLiquidityTokenAdminAddress,
        UInt8.from(9),
        Bool(false),
      )
    });
    await txn0.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn0.sign([deployerKey, zkLiquidityTokenAdminPrivateKey, zkLiquidityTokenPrivateKey]).send();


    const args: PoolMinaDeployProps = { token: zkToken0Address, liquidityToken: zkLiquidityTokenAddress };

    await fetchAccount({ publicKey: zkLiquidityTokenAddress });

    const txn = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 4);
      await zkApp.deploy(args);
      await zkTokenAdmin.deploy({
        adminPublicKey: deployerAccount,
      });
      await zkToken0.deploy({
        symbol: "tokA",
        src: "https://github.com/MinaFoundation/mina-fungible-token/blob/main/FungibleToken.ts",
      });
      await zkToken0.initialize(
        zkTokenAdminAddress,
        UInt8.from(9),
        Bool(false),
      )

      //await zkApp.initialize();
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey, zkTokenAdminPrivateKey, zkToken0PrivateKey]).send();

    tokenHolder0 = new MinaTokenHolder(zkAppAddress, zkToken0.deriveTokenId());

    const txn2 = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 1);
      await zkApp.initialize();
      /*await tokenHolder0.deploy();
       await zkToken0.approveAccountUpdate(tokenHolder0.self);*/
    });
    await txn2.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn2.sign([deployerKey, zkAppPrivateKey, zkTokenAdminPrivateKey]).send();


    // mint token to user
    await mintToken(senderAccount);

  });

  it('add first liquidity', async () => {

    let amt = UInt64.from(10 * 10 ** 9);
    let amtToken = UInt64.from(50 * 10 ** 9);
    let txn = await Mina.transaction(senderAccount, async () => {
      AccountUpdate.fundNewAccount(senderAccount, 2);
      await zkApp.supplyFirstLiquidities(amtToken, amt);
    });
    console.log("supplyFirstLiquidities", txn.toPretty());
    console.log("supplyFirstLiquidities au", txn.transaction.accountUpdates.length);
    await txn.prove();
    await txn.sign([senderKey, zkAppPrivateKey]).send();


    const liquidityUser = Mina.getBalance(senderAccount, zkApp.deriveTokenId());
    const expected = amt.value.add(amtToken.value).sub(minimunLiquidity.value);
    console.log("liquidity user", liquidityUser.toString());
    expect(liquidityUser.value).toEqual(expected);

    const balanceToken = Mina.getBalance(zkAppAddress, zkToken0.deriveTokenId());
    expect(balanceToken.value).toEqual(amtToken.value);

    const balanceMina = Mina.getBalance(zkAppAddress);
    expect(balanceMina.value).toEqual(amt.value);

  });

  it('transfer token', async () => {
    let amt = UInt64.from(10 * 10 ** 9);
    let amtToken = UInt64.from(50 * 10 ** 9);
    let txn = await Mina.transaction(senderAccount, async () => {
      AccountUpdate.fundNewAccount(senderAccount, 2);
      await zkApp.supplyFirstLiquidities(amtToken, amt);
    });
    await txn.prove();
    await txn.sign([senderKey, zkAppPrivateKey]).send();

    txn = await Mina.transaction(senderAccount, async () => {
      await zkApp.transferToken();
    });
    console.log("transferToken", txn.toPretty());
    console.log("transferToken au", txn.transaction.accountUpdates.length);

    await txn.prove();
    await txn.sign([senderKey]).send();

    txn = await Mina.transaction(senderAccount, async () => {
      await zkToken0.transfer(zkApp.address, senderAccount, UInt64.from(10));
    });

    await txn.prove();
    await expect(txn.sign([senderKey]).send()).rejects.toThrow();
  });


  it('withdraw liquidity', async () => {

    const minaUser = Mina.getBalance(senderAccount);
    console.log("mina before", minaUser.toBigInt());
    let amt = UInt64.from(10 * 10 ** 9);
    let amtToken = UInt64.from(50 * 10 ** 9);
    let txn = await Mina.transaction(senderAccount, async () => {
      AccountUpdate.fundNewAccount(senderAccount, 2);
      await zkApp.supplyFirstLiquidities(amtToken, amt);
    });
    await txn.prove();
    await txn.sign([senderKey, zkAppPrivateKey]).send();

    const minaUserAfterDeposit = Mina.getBalance(senderAccount);
    const expectedMina = minaUser.sub(amt);
    //expect(minaUserAfterDeposit.value).toEqual(expectedMina.value);
    console.log("mina after deposit", minaUserAfterDeposit.toBigInt());

    const liquidityUser = Mina.getBalance(senderAccount, zkApp.deriveTokenId());
    const expected = amt.value.add(amtToken.value).sub(minimunLiquidity.value);

    txn = await Mina.transaction(senderAccount, async () => {
      await zkApp.withdrawLiquidity(liquidityUser);
    });
    console.log("withdraw liquidity", txn.toPretty());
    console.log("withdraw liquidity au", txn.transaction.accountUpdates.length);

    await txn.prove();
    await txn.sign([senderKey, zkAppPrivateKey]).send();

    const minaUserAfter = Mina.getBalance(senderAccount);
    console.log("mina after", minaUserAfter.toBigInt());

  });

  it('add liquidity from mina ', async () => {

    let amt = UInt64.from(10 * 10 ** 9);
    let amtToken = UInt64.from(50 * 10 ** 9);
    let txn = await Mina.transaction(senderAccount, async () => {
      AccountUpdate.fundNewAccount(senderAccount, 2);
      await zkApp.supplyFirstLiquidities(amtToken, amt);
    });
    console.log("createPool au", txn.transaction.accountUpdates.length);
    await txn.prove();
    await txn.sign([senderKey]).send();

    let liquidityUser = Mina.getBalance(senderAccount, zkApp.deriveTokenId());
    const expected = amt.value.add(amtToken.value).sub(minimunLiquidity.value);
    console.log("liquidity user", liquidityUser.toString());
    expect(liquidityUser.value).toEqual(expected);

    let amtMina = UInt64.from(1 * 10 ** 9);
    txn = await Mina.transaction(senderAccount, async () => {
      await zkApp.supplyLiquidityFromMina(amtMina, amtToken);
    });
    console.log("add liquidity from mina", txn.toPretty());
    console.log("add liquidity from mina au", txn.transaction.accountUpdates.length);
    await txn.prove();
    await txn.sign([senderKey]).send();
    liquidityUser = Mina.getBalance(senderAccount, zkApp.deriveTokenId());
    console.log("liquidity user", liquidityUser.toString());
  });

  it('add liquidity from token ', async () => {
    let amt = UInt64.from(10 * 10 ** 9);
    let amtToken = UInt64.from(50 * 10 ** 9);
    let txn = await Mina.transaction(senderAccount, async () => {
      AccountUpdate.fundNewAccount(senderAccount, 2);
      await zkApp.supplyFirstLiquidities(amtToken, amt);
    });
    console.log("createPool au", txn.transaction.accountUpdates.length);
    await txn.prove();
    await txn.sign([senderKey]).send();

    let liquidityUser = Mina.getBalance(senderAccount, zkApp.deriveTokenId());
    const expected = amt.value.add(amtToken.value).sub(minimunLiquidity.value);
    console.log("liquidity user", liquidityUser.toString());
    expect(liquidityUser.value).toEqual(expected);

    let amtToken2 = UInt64.from(3 * 10 ** 9);
    txn = await Mina.transaction(senderAccount, async () => {
      await zkApp.supplyLiquidityFromToken(amtToken2, amt);
    });
    console.log("add liquidity from token", txn.toPretty());
    console.log("add liquidity from token au", txn.transaction.accountUpdates.length);
    await txn.prove();
    await txn.sign([senderKey]).send();
    liquidityUser = Mina.getBalance(senderAccount, zkApp.deriveTokenId());
    console.log("liquidity user", liquidityUser.toString());
  });


  it('swap from mina', async () => {
    let amt = UInt64.from(10 * 10 ** 9);
    let amtToken = UInt64.from(50 * 10 ** 9);
    const txn = await Mina.transaction(senderAccount, async () => {
      AccountUpdate.fundNewAccount(senderAccount, 2);
      await zkApp.supplyFirstLiquidities(amtToken, amt);
    });
    await txn.prove();
    await txn.sign([senderKey]).send();

    let amountIn = UInt64.from(1.3 * 10 ** 9);

    const reserveIn = Mina.getBalance(zkAppAddress);
    const reserveOut = Mina.getBalance(zkAppAddress, zkToken0.deriveTokenId());

    const balBefore = Mina.getBalance(senderAccount, zkToken0.deriveTokenId());

    const balanceMin = reserveOut.sub(reserveOut.div(100));
    const balanceMax = reserveIn.add(reserveIn.div(100));

    const expectedOut = mulDiv(balanceMin, amountIn, balanceMax.add(amountIn));
    const optimalOut = mulDiv(reserveOut, amountIn, reserveIn.add(amountIn));

    const minOut = optimalOut.sub(optimalOut.div(50)); // 2 % dif 

    const txn2 = await Mina.transaction(senderAccount, async () => {
      //AccountUpdate.fundNewAccount(senderAccount, 2);
      await zkApp.swapFromMina(amountIn, minOut, balanceMin, balanceMax);
      //await zkToken0.approveAccountUpdate(zkApp.self);
    });
    console.log("swap from mina", txn2.toPretty());
    console.log("swap from mina au", txn2.transaction.accountUpdates.length);
    await txn2.prove();
    await txn2.sign([senderKey]).send();

    const resIN = reserveIn.add(amountIn);
    const resOut = reserveOut.sub(expectedOut);

    const reserveIn2 = Mina.getBalance(zkAppAddress);
    const reserveOut2 = Mina.getBalance(zkAppAddress, zkToken0.deriveTokenId());
    expect(reserveIn2.value).toEqual(resIN.value);
    expect(reserveOut2.value).toEqual(resOut.value);

    const balAfter = Mina.getBalance(senderAccount, zkToken0.deriveTokenId());
    expect(balAfter.value).toEqual(balBefore.add(expectedOut).value);
  });

  it('try hack swap from mina', async () => {
    let amt = UInt64.from(10 * 10 ** 9);
    let amtToken = UInt64.from(50 * 10 ** 9);
    const txn = await Mina.transaction(senderAccount, async () => {
      AccountUpdate.fundNewAccount(senderAccount, 2);
      await zkApp.supplyFirstLiquidities(amtToken, amt);
    });
    await txn.prove();
    await txn.sign([senderKey]).send();

    let amountIn = UInt64.from(1.3 * 10 ** 9);

    const reserveIn = Mina.getBalance(zkAppAddress);
    const reserveOut = Mina.getBalance(zkAppAddress, zkToken0.deriveTokenId());

    const txn2 = await Mina.transaction(senderAccount, async () => {
      await tokenHolder0.swap(amountIn, UInt64.from(1), reserveIn, reserveOut);
      await zkToken0.approveAccountUpdate(zkApp.self);
    });
    await txn2.prove();
    // expect failed
    await expect(txn2.sign([senderKey]).send()).rejects.toThrow();

  });

  it('swap from token', async () => {
    let amt = UInt64.from(10 * 10 ** 9);
    let amtToken = UInt64.from(50 * 10 ** 9);
    const txn = await Mina.transaction(senderAccount, async () => {
      AccountUpdate.fundNewAccount(senderAccount, 2);
      await zkApp.supplyFirstLiquidities(amtToken, amt);
    });
    await txn.prove();
    await txn.sign([senderKey]).send();

    const reserveIn = Mina.getBalance(zkAppAddress, zkToken0.deriveTokenId());
    const reserveOut = Mina.getBalance(zkAppAddress);
    let amountIn = UInt64.from(1.3 * 10 ** 9);

    const balanceMin = reserveOut.sub(reserveOut.div(100));
    const balanceMax = reserveIn.add(reserveIn.div(100));

    const expectedOut = mulDiv(balanceMin, amountIn, balanceMax.add(amountIn));
    const optimalOut = mulDiv(reserveOut, amountIn, reserveIn.add(amountIn));

    const minOut = optimalOut.sub(optimalOut.div(50)); // 2 % dif 

    const balBefore = Mina.getBalance(senderAccount, zkToken0.deriveTokenId());

    const userMinaBalBefore = Mina.getBalance(senderAccount);

    const txn2 = await Mina.transaction(senderAccount, async () => {
      //AccountUpdate.fundNewAccount(senderAccount, 2);
      await zkApp.swapFromToken(amountIn, minOut, balanceMin, balanceMax);
    });
    console.log("swap from token", txn2.toPretty());
    console.log("swap from token au", txn2.transaction.accountUpdates.length);
    await txn2.prove();
    await txn2.sign([senderKey]).send();

    const userMinaBalAfter = Mina.getBalance(senderAccount);

    console.log('optimal out', optimalOut.toBigInt());
    console.log('minimal out', minOut.toBigInt());
    console.log('expected out', expectedOut.toBigInt());
    console.log('received', userMinaBalAfter.sub(userMinaBalBefore).toBigInt());

    // const resIN = reserveIn.add(amountIn);
    // const resOut = reserveOut.sub(expectedOut);

    // const reserveIn2 = Mina.getBalance(zkAppAddress, zkToken0.deriveTokenId());
    // const reserveOut2 = Mina.getBalance(zkAppAddress, zkToken0.deriveTokenId());
    // expect(reserveIn2.value).toEqual(resIN.value);
    // expect(reserveOut2.value).toEqual(resOut.value);

    const balAfter = Mina.getBalance(senderAccount, zkToken0.deriveTokenId());
    expect(balAfter.value).toEqual(balBefore.sub(amountIn).value);
  });

  function showBalanceToken0() {
    let bal = Mina.getBalance(senderAccount, zkToken0.deriveTokenId());
    console.log("balance user 0", bal.toBigInt());
    return bal;
  }

  function showBalanceToken1() {
    let bal = Mina.getBalance(senderAccount);
    console.log("balance user 1", bal.toBigInt());
    return bal;
  }

  async function mintToken(user: PublicKey) {
    // token are minted to original deployer, so just transfer it for test
    const txn = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 1);
      await zkToken0.mint(user, UInt64.from(1000 * 10 ** 9));
    });
    await txn.prove();
    await txn.sign([deployerKey, zkToken0PrivateKey]).send();

  }

});