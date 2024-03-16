import { AccountUpdate, Field, Mina, PrivateKey, UInt32 } from 'o1js';
import { Voucher, VoucherContract } from './nft.js';

let Local = Mina.LocalBlockchain();
Mina.setActiveInstance(Local);

const main = async () => {
  // a test account that pays all the fees
  let feePayerKey = Local.testAccounts[0].privateKey;
  let feePayer = Local.testAccounts[0].publicKey;

  // the zkapp account
  let zkappKey = PrivateKey.random();
  let zkappAddress = zkappKey.toPublicKey();
  let zkapp = new VoucherContract(zkappAddress);

  await VoucherContract.compile();

  let tx = await Mina.transaction(feePayer, async () => {
    AccountUpdate.fundNewAccount(feePayer);
    zkapp.deploy();
    zkapp.initState(feePayer, new UInt32(10));
  });
  await tx.prove();
  await tx.sign([feePayerKey, zkappKey]).send();

  const vouchers = [
    new Voucher({
      uri: Field(1),
      ownerPubKey: feePayer,
      useRandomCode: Field(0),
    }),
    new Voucher({
      uri: Field(1),
      ownerPubKey: feePayer,
      useRandomCode: Field(0),
    }),
    new Voucher({
      uri: Field(1),
      ownerPubKey: feePayer,
      useRandomCode: Field(0),
    }),
    new Voucher({
      uri: Field(1),
      ownerPubKey: feePayer,
      useRandomCode: Field(0),
    }),
  ];

  for (let i = 0; i < 2; i++) {
    let value = vouchers[i];

    let result: boolean | undefined;
    tx = await Mina.transaction(feePayer, async () => {
      result = await zkapp.mint(value);
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();

    console.log('voucher:', value.hash().toString(), 'result:', result);
  }

  console.log(zkapp.currentIdx.get().toString());

  for (let i = 0; i <= 2; i++) {
    let value = vouchers[i];
    let result: boolean | undefined;
    tx = await Mina.transaction(feePayer, async () => {
      result = await zkapp.use(new UInt32(i), value, Field(0));
    });
    await tx.prove();
    await tx.sign([feePayerKey]).send();

    console.log('result:', result);
  }
};

main();
