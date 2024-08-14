import { fetchAccount, PublicKey, Field, UInt64 } from "o1js";

import type {
  ZkappWorkerRequest,
  ZkappWorkerReponse,
  WorkerFunctions,
} from "./zkappWorker";
import { Json } from "o1js/dist/node/bindings/mina-transaction/gen/transaction-bigint";

export default class ZkappWorkerClient {
  // ---------------------------------------------------------------------------------------

  setActiveInstanceToBerkeley() {
    return this._call("setActiveInstanceToBerkeley", {});
  }

  loadContract() {
    return this._call("loadContract", {});
  }

  compileContract() {
    return this._call("compileContract", {});
  }

  fetchAccount({
    publicKeyBase58,
  }: {
    publicKeyBase58: string;
  }): ReturnType<typeof fetchAccount> {
    const result = this._call("fetchAccount", {
      publicKey58: publicKeyBase58,
    });
    return result as ReturnType<typeof fetchAccount>;
  }

  fetchAccountToken({
    publicKeyBase58,
  }: {
    publicKeyBase58: string;
  }): ReturnType<typeof fetchAccount> {
    const result = this._call("fetchAccountToken", {
      publicKey58: publicKeyBase58,
    });
    return result as ReturnType<typeof fetchAccount>;
  }

  async getBalance(publicKey58: string): Promise<UInt64> {
    const result = await this._call("getBalance", { publicKey58 });
    return UInt64.fromJSON(JSON.parse(result as string));
  }

  initZkappInstance(publicKey: PublicKey) {
    return this._call("initZkappInstance", {
      publicKey58: publicKey.toBase58(),
    });
  }

  async getReserves(): Promise<any> {
    const result = await this._call("getReserves", {}) as string;
    return JSON.parse(result);
  }

  async swapFromMina(user: string, amt: number, minOut: number) {
    return await this._call("swapFromMinaTransaction", { user, amt, minOut });
  }

  async swapFromToken(user: string, amt: number, minOut: number) {
    return await this._call("swapFromTokenTransaction", { user, amt, minOut });
  }

  async deployPoolInstance(tokenX: string, tokenY: string) {
    return await this._call("deployPoolInstance", {
      tokenX, tokenY
    });
  }

  async getTransactionJSON(): Promise<string> {
    const result = await this._call("getTransactionJSON", {}) as string;
    return result;
  }


  async getKey() {
    const result = await this._call("getKey", {});
    return result;
  }

  // ---------------------------------------------------------------------------------------

  worker: Worker;

  promises: {
    [id: number]: { resolve: (res: any) => void; reject: (err: any) => void };
  };

  nextId: number;

  constructor() {
    this.worker = new Worker(new URL("./zkappWorker.ts", import.meta.url));
    this.promises = {};
    this.nextId = 0;

    this.worker.onmessage = (event: MessageEvent<ZkappWorkerReponse>) => {
      this.promises[event.data.id].resolve(event.data.data);
      delete this.promises[event.data.id];
    };
  }

  _call(fn: WorkerFunctions, args: any) {
    return new Promise((resolve, reject) => {
      this.promises[this.nextId] = { resolve, reject };

      const message: ZkappWorkerRequest = {
        id: this.nextId,
        fn,
        args,
      };

      this.worker.postMessage(message);

      this.nextId++;
    });
  }
}
