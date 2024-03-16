import {
    PublicKey,
    fetchAccount,
    PrivateKey,
    Field,
    Mina,
    AccountUpdate,
    TokenId,
    UInt32,
} from 'o1js';


import { VoucherContract } from './nft.js';

export { deployNFT };

async function loopUntilAccountExists({
    account,
    eachTimeNotExist,
    isZkAppAccount,
}: {
    account: PublicKey;
    eachTimeNotExist: () => void;
    isZkAppAccount: boolean;
}) {
    for (; ;) {
        let response = await fetchAccount({ publicKey: account });
        let accountExists = response.account !== undefined;
        if (isZkAppAccount) {
            accountExists = response.account?.zkapp?.appState !== undefined;
        }
        if (!accountExists) {
            eachTimeNotExist();
            await new Promise((resolve) => setTimeout(resolve, 5000));
        } else {
            return response.account!;
        }
    }
}

const deployTransactionFee = 100_000_000;

async function deploy(
    deployerPrivateKey: PrivateKey,
    merchantPubKey: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkapp: VoucherContract,
    verificationKey: { data: string; hash: string | Field }
) {
    let sender = deployerPrivateKey.toPublicKey();
    let zkAppPublicKey = zkAppPrivateKey.toPublicKey();
    console.log('using deployer private key with public key', sender.toBase58());
    console.log(
        'using zkApp private key with public key',
        zkAppPublicKey.toBase58()
    );

    console.log('Deploying zkapp for public key', zkAppPublicKey.toBase58());
    let transaction = await Mina.transaction(
        { sender, fee: deployTransactionFee },
        () => {
            AccountUpdate.fundNewAccount(sender);
            // NOTE: this calls `init()` if this is the first deploy
            zkapp.deploy({ verificationKey });
            zkapp.initState(merchantPubKey, new UInt32(10));
        }
    );
    await transaction.prove();
    transaction.sign([deployerPrivateKey, zkAppPrivateKey]);

    console.log('Sending the deploy transaction...');
    const res = await transaction.send();
    if (res.status === 'rejected') {
        console.log('error sending transaction (see above)');
    } else {
        console.log(
            'See deploy transaction at',
            'https://minascan.io/berkeley/tx/' + res.hash
        );
        console.log('waiting for zkApp account to be deployed...');
        await res.wait();
    }
    return true;
}

async function deployNFT(
    graphqlUrl: string,
    deployerPrivatekeyBase58: string,
    merchantPubKeyBase58: string,
) {
    const CustomNet = Mina.Network(graphqlUrl);
    Mina.setActiveInstance(CustomNet);

    const deployerPrivateKey = PrivateKey.fromBase58(deployerPrivatekeyBase58);
    const deployerPublicKey = deployerPrivateKey.toPublicKey();

    const zkAppPrivateKey = PrivateKey.random();
    const zkAppPublicKey = zkAppPrivateKey.toPublicKey();

    const merchantPubKey = PublicKey.fromBase58(merchantPubKeyBase58);

    console.log('zkAppPrivateKey', zkAppPrivateKey.toBase58());
    console.log('zkAppPublicKey', zkAppPublicKey.toBase58());

    // ----------------------------------------------------
    // Check deployer account

    let account = await loopUntilAccountExists({
        account: deployerPublicKey,
        eachTimeNotExist: () => {
            console.log('Deployer account does not exist. ');
        },
        isZkAppAccount: false,
    });

    console.log(`Using fee payer account with nonce ${account.nonce}, balance ${account.balance}`);

    // ----------------------------------------------------
    // Deploy zkApp

    console.log('Compiling smart contract...');
    let { verificationKey } = await VoucherContract.compile();

    let zkapp = new VoucherContract(zkAppPublicKey);

    // Programmatic deploy:
    //   Besides the CLI, you can also create accounts programmatically. This is useful if you need
    //   more custom account creation - say deploying a zkApp to a different key than the fee payer
    //   key, programmatically parameterizing a zkApp before initializing it, or creating Smart
    //   Contracts programmatically for users as part of an application.
    await deploy(deployerPrivateKey, merchantPubKey, zkAppPrivateKey, zkapp, verificationKey);

    await loopUntilAccountExists({
        account: zkAppPublicKey,
        eachTimeNotExist: () =>
            console.log('waiting for zkApp Voucher to be deployed...'),
        isZkAppAccount: true,
    });

    return {
        zkAppPublicKey: zkAppPublicKey.toBase58(),
        zkAppPrivateKey: zkAppPrivateKey.toBase58(),
    }
}

