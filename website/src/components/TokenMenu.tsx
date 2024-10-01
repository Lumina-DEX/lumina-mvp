"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Addresses } from "@/utils/addresses";
import useAccount from "@/states/useAccount";
import { minaTestnet } from "@/lib/wallet";

const TokenMenu = ({ pool, setPool, setToken }) => {

  const [tokenList, setTokenList] = useState([]);
  const accountState = useAccount();

  useEffect(() => {
    console.log("token", pool);
    console.log("accountState update");
    Addresses.getList().then((x: any) => {
      const network = accountState.network === minaTestnet ? "mina-devnet" : "zeko-devnet";
      const tokens = x?.tokens?.filter(z => z.chainId === network);
      setTokenList(tokens);
      const poolExist = tokens.find(z => z.poolAddress === pool);
      if (!poolExist && tokens?.length) {
        // if this pool didn't exist for this network we select the first token
        setPool(tokens[0].poolAddress);
      } else {
        setToken(poolExist);
      }
    });
  }, [accountState.network]);

  const selectPool = (poolAddress: any) => {
    setPool(poolAddress);
    if (setToken && tokenList) {
      const poolExist = tokenList.find(z => z.poolAddress === poolAddress);
      setToken(poolExist);
    }
  }

  return (<select className="ml-3" value={pool} onChange={(ev) => selectPool(ev.target.value)}>
    {tokenList.map(x => <option key={x.poolAddress} title={x.name} value={x.poolAddress}>{x.symbol}</option>)}
  </select>);
};

export default TokenMenu;
