/**
 * This script can be used to interact with the Add contract, after deploying it.
 *
 * We call the update() method on the contract, create a proof and send it to the chain.
 * The endpoint that we interact with is read from your config.json.
 *
 * This simulates a user interacting with the zkApp from a browser, except that here, sending the transaction happens
 * from the script and we're using your pre-funded zkApp account to pay the transaction fee. In a real web app, the user's wallet
 * would send the transaction and pay the fee.
 *
 * To run locally:
 * Build the project: `$ npm run build`
 * Run with node:     `$ node build/src/deploy.js`.
 */
import fs from 'fs/promises';
import { AccountUpdate, Field, Mina, NetworkId, PrivateKey, PublicKey, UInt64 } from 'o1js';
import { TokenA, Balancer, TokenStandard, BalancerHolder } from '../index.js';

// check command line arg
let deployAlias = "balancer";
if (!deployAlias)
    throw Error(`Missing <deployAlias> argument.

Usage:
node build/src/deploy/balancerHolder.js
`);
Error.stackTraceLimit = 1000;
const DEFAULT_NETWORK_ID = 'zeko';

// parse config and private key from file
type Config = {
    deployAliases: Record<
        string,
        {
            networkId?: string;
            url: string;
            keyPath: string;
            fee: string;
            feepayerKeyPath: string;
            feepayerAlias: string;
        }
    >;
};
let configJson: Config = JSON.parse(await fs.readFile('config.json', 'utf8'));
let config = configJson.deployAliases[deployAlias];
let feepayerKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
    await fs.readFile(config.feepayerKeyPath, 'utf8')
);

let zkAppKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
    await fs.readFile("keys/balancer.json", 'utf8'));

let zkAppToken0Base58: { privateKey: string; publicKey: string } = JSON.parse(
    await fs.readFile("keys/tokenA.json", 'utf8'));


let feepayerKey = PrivateKey.fromBase58(feepayerKeysBase58.privateKey);
let zkAppKey = PrivateKey.fromBase58(zkAppKeysBase58.privateKey);
let zkToken0PrivateKey = PrivateKey.fromBase58(zkAppToken0Base58.privateKey);


// set up Mina instance and contract we interact with
const Network = Mina.Network({
    // We need to default to the testnet networkId if none is specified for this deploy alias in config.json
    // This is to ensure the backward compatibility.
    networkId: (config.networkId ?? DEFAULT_NETWORK_ID) as NetworkId,
    mina: config.url
});
console.log("network", config.url);
// const Network = Mina.Network(config.url);
const fee = Number(config.fee) * 1e9; // in nanomina (1 billion = 1.0 mina)
Mina.setActiveInstance(Network);
let feepayerAddress = feepayerKey.toPublicKey();
let zkAppAddress = zkAppKey.toPublicKey();
let zkApp = new Balancer(zkAppAddress);
let zkToken0Address = zkToken0PrivateKey.toPublicKey();
let zkToken0 = new TokenA(zkToken0Address);

// compile the contract to create prover keys
console.log('compile the contract...');
await Balancer.compile();
await TokenA.compile();
await TokenStandard.compile();
await BalancerHolder.compile();

try {

    let tokenHolder0 = new BalancerHolder(zkAppAddress, zkToken0.deriveTokenId());
    const txn0 = await Mina.transaction({ sender: feepayerAddress, fee }, async () => {
        AccountUpdate.fundNewAccount(feepayerAddress, 1);
        await tokenHolder0.deploy();
        await zkToken0.approveAccountUpdate(tokenHolder0.self);
    });
    console.log("send create balancer holder");
    await txn0.prove();
    const sentTx = await txn0.sign([feepayerKey, zkToken0PrivateKey, zkAppKey]).send();
    console.log("sent create balancer holder");
    if (sentTx.status === 'pending') {
        console.log(
            '\nSuccess! Update transaction sent.\n' +
            '\nYour smart contract state will be updated' +
            '\nas soon as the transaction is included in a block:' +
            `\n${getTxnUrl(config.url, sentTx.hash)}`
        );
    }


} catch (err) {
    console.log(err);
}



function getTxnUrl(graphQlUrl: string, txnHash: string | undefined) {
    const hostName = new URL(graphQlUrl).hostname;
    const txnBroadcastServiceName = hostName
        .split('.')
        .filter((item) => item === 'minascan')?.[0];
    const networkName = graphQlUrl
        .split('/')
        .filter((item) => item === 'mainnet' || item === 'devnet')?.[0];
    if (txnBroadcastServiceName && networkName) {
        return `https://minascan.io/${networkName}/tx/${txnHash}?type=zk-tx`;
    }
    return `Transaction hash: ${txnHash}`;
}
