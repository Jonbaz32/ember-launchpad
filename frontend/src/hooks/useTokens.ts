import { useReadContract } from "wagmi";
import { factoryAbi } from "../lib/contracts";
import { useFactoryAddress } from "./useFactoryAddress";

export interface TokenInfo {
  token: `0x${string}`;
  creator: `0x${string}`;
  name: string;
  symbol: string;
  metadataURI: string;
  createdAt: bigint;
}

/// Pulls the most recent `limit` tokens from the factory (newest first). For a
/// production feed with search/sort/pagination at scale, point this at the indexer's
/// /tokens endpoint instead — this direct on-chain read is simplest for small catalogs.
export function useTokenList(limit = 50) {
  const FACTORY_ADDRESS = useFactoryAddress();
  const { data: total } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "allTokensLength",
  });

  const totalNum = total !== undefined ? Number(total as bigint) : 0;
  const offset = Math.max(0, totalNum - limit);
  const pageSize = totalNum - offset;

  const { data: page, isLoading, refetch } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getTokenPage",
    args: [BigInt(offset), BigInt(pageSize)],
    query: { enabled: totalNum > 0 },
  });

  const tokens = ((page as TokenInfo[] | undefined) || []).slice().reverse();

  return { tokens, isLoading, total: totalNum, refetch };
}
