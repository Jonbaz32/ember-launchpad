import { useState, useEffect } from "react";
import { useReadContracts } from "wagmi";
import { launchTokenAbi } from "../lib/contracts";
import { zeroAddress } from "viem";

interface TokenState {
  name: string;
  symbol: string;
  creator: `0x${string}`;
  metadataURI: string;
  totalSupply: bigint;
  realEthReserve: bigint;
  tokensSold: bigint;
  graduationTarget: bigint;
  graduated: boolean;
  migrated: boolean;
  creatorFeePool: bigint;
  tradeFeeBps: bigint;
  virtualEthReserve: bigint;
  virtualTokenReserve: bigint;
  flatTradeFee: bigint;
}

export function useTokenState(tokenAddress: `0x${string}` | undefined) {
  const [cachedState, setCachedState] = useState<TokenState | undefined>(undefined);
  
  const contract = { address: tokenAddress as `0x${string}`, abi: launchTokenAbi as any } as const;

  const { data, isLoading: isRpcLoading, refetch } = useReadContracts({
    contracts: tokenAddress
      ? [
          { ...contract, functionName: "name" },
          { ...contract, functionName: "symbol" },
          { ...contract, functionName: "creator" },
          { ...contract, functionName: "metadataURI" },
          { ...contract, functionName: "totalSupply" },
          { ...contract, functionName: "realEthReserve" },
          { ...contract, functionName: "tokensSold" },
          { ...contract, functionName: "graduationTarget" },
          { ...contract, functionName: "graduated" },
          { ...contract, functionName: "migrated" },
          { ...contract, functionName: "creatorFeePool" },
          { ...contract, functionName: "tradeFeeBps" },
          { ...contract, functionName: "virtualEthReserve" },
          { ...contract, functionName: "virtualTokenReserve" },
          { ...contract, functionName: "flatTradeFee" },
        ]
      : [],
    query: { enabled: !!tokenAddress, refetchInterval: 8000 },
  });

  // Fetch fast indexed cache from indexer REST API
  useEffect(() => {
    if (!tokenAddress) {
      setCachedState(undefined);
      return;
    }

    let active = true;
    const fetchCached = async () => {
      try {
        const res = await fetch(`http://localhost:8787/tokens/${tokenAddress}`);
        if (res.ok && active) {
          const row = await res.json();
          if (row && row.address) {
            setCachedState({
              name: row.name,
              symbol: row.symbol,
              creator: row.creator || zeroAddress,
              metadataURI: row.metadata_uri || "",
              totalSupply: BigInt(row.total_supply || 0),
              realEthReserve: BigInt(row.real_eth_reserve || 0),
              tokensSold: BigInt(row.tokens_sold || 0),
              graduationTarget: BigInt(row.graduation_target || 0),
              graduated: Boolean(row.graduated),
              migrated: Boolean(row.migrated),
              creatorFeePool: 0n,
              tradeFeeBps: 100n,
              virtualEthReserve: 30n * 10n ** 18n,
              virtualTokenReserve: 1073000000n * 10n ** 18n,
              flatTradeFee: 200000000000000n,
            });
          }
        }
      } catch (err) {
        // Silently catch network errors and rely on standard RPC multicall fallback
        console.warn("Fast indexer load failed; falling back to direct RPC query:", err);
      }
    };

    fetchCached();
    return () => {
      active = false;
    };
  }, [tokenAddress]);

  // Combine RPC live state and cached indexer state
  const state = (() => {
    // 1. If RPC multicall has successfully returned verified on-chain data, prioritize it
    if (data && data.length >= 15 && data[0]?.status === "success" && data[1]?.status === "success") {
      const name = data[0].result as string;
      const symbol = data[1].result as string;
      const creator = data[2]?.status === "success" ? (data[2].result as `0x${string}`) : zeroAddress;
      const metadataURI = data[3]?.status === "success" ? (data[3].result as string) : "";
      const totalSupply = data[4]?.status === "success" ? (data[4].result as bigint) : 0n;
      const realEthReserve = data[5]?.status === "success" ? (data[5].result as bigint) : 0n;
      const tokensSold = data[6]?.status === "success" ? (data[6].result as bigint) : 0n;
      const graduationTarget = data[7]?.status === "success" ? (data[7].result as bigint) : 0n;
      const graduated = data[8]?.status === "success" ? (data[8].result as boolean) : true;
      const migrated = data[9]?.status === "success" ? (data[9].result as boolean) : true;
      const creatorFeePool = data[10]?.status === "success" ? (data[10].result as bigint) : 0n;
      const tradeFeeBps = data[11]?.status === "success" ? (data[11].result as bigint) : 0n;
      const virtualEthReserve = data[12]?.status === "success" ? (data[12].result as bigint) : 0n;
      const virtualTokenReserve = data[13]?.status === "success" ? (data[13].result as bigint) : 0n;
      const flatTradeFee = data[14]?.status === "success" ? (data[14].result as bigint) : 1000000000000000n;

      return {
        name,
        symbol,
        creator,
        metadataURI,
        totalSupply,
        realEthReserve,
        tokensSold,
        graduationTarget,
        graduated,
        migrated,
        creatorFeePool,
        tradeFeeBps,
        virtualEthReserve,
        virtualTokenReserve,
        flatTradeFee,
      };
    }

    // 2. If RPC is still loading/resolving but indexer has returned cached data, use it for instant load
    if (cachedState) {
      return cachedState;
    }

    return undefined;
  })();

  const isLoading = isRpcLoading && !cachedState;

  return {
    isLoading,
    refetch,
    state,
  };
}
