import { useState, useMemo, useEffect } from "react";
import { formatEther, isAddress } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useBalance,
} from "wagmi";
import { Link } from "react-router-dom";
import { launchTokenAbi, factoryAbi } from "../lib/contracts";
import { formatTokenAmount, shortAddress } from "../lib/format";
import { activeChain } from "../lib/wagmi";
import { useFactoryAddress } from "../hooks/useFactoryAddress";

export function Portfolio() {
  const FACTORY_ADDRESS = useFactoryAddress();
  const { address: connectedWallet } = useAccount();
  const [lookupInput, setLookupInput] = useState("");
  
  // Resolve which address we are currently inspecting
  const targetAddress = useMemo(() => {
    if (isAddress(lookupInput.trim())) {
      return lookupInput.trim() as `0x${string}`;
    }
    return connectedWallet;
  }, [lookupInput, connectedWallet]);

  const isValidLookup = !!targetAddress;

  // Get Native ETH balance of target address
  const { data: ethBalance, isLoading: ethLoading } = useBalance({
    address: targetAddress,
    query: { enabled: !!targetAddress, refetchInterval: 8000 }
  });

  // Fetch all factory tokens (as fallback)
  const { data: allTokensPage, isLoading: pageLoading } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getTokenPage",
    args: [0n, 1000n],
  });

  // Query Blockscout API for all ERC-20 token balances
  const [blockscoutTokens, setBlockscoutTokens] = useState<any[]>([]);
  const [bsLoading, setBsLoading] = useState(false);

  useEffect(() => {
    if (!targetAddress) return;
    const fetchBS = async () => {
      setBsLoading(true);
      try {
        const res = await fetch(`https://robinhoodchain.blockscout.com/api/v2/addresses/${targetAddress}/tokens`);
        if (res.ok) {
          const data = await res.json();
          const items = (data.items || []).filter(
            (item: any) =>
              item.token &&
              item.token.type === "ERC-20" &&
              item.value &&
              BigInt(item.value) > 0n
          );
          setBlockscoutTokens(items);
        }
      } catch (err) {
        console.warn("Failed to fetch Blockscout tokens:", err);
      } finally {
        setBsLoading(false);
      }
    };
    fetchBS();
  }, [targetAddress]);

  // Combine Blockscout tokens and Factory tokens (fallback)
  const detectedTokens = useMemo(() => {
    const list: { address: `0x${string}`; symbol: string; name: string; decimals: number }[] = [];
    const seen = new Set<string>();

    blockscoutTokens.forEach((item: any) => {
      const addr = item.token.address.toLowerCase();
      if (!seen.has(addr)) {
        seen.add(addr);
        list.push({
          address: item.token.address as `0x${string}`,
          symbol: item.token.symbol || "UNKNOWN",
          name: item.token.name || "Unknown Token",
          decimals: Number(item.token.decimals || 18),
        });
      }
    });

    // Fallback: If Blockscout returned nothing, list all factory-launched tokens
    if (list.length === 0 && allTokensPage) {
      (allTokensPage as any[]).forEach((t: any) => {
        const addr = t.token.toLowerCase();
        if (!seen.has(addr)) {
          seen.add(addr);
          list.push({
            address: t.token as `0x${string}`,
            symbol: t.symbol,
            name: t.name,
            decimals: 18,
          });
        }
      });
    }

    return list;
  }, [blockscoutTokens, allTokensPage]);

  // Query DexScreener for pricing info
  const [dexPrices, setDexPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (detectedTokens.length === 0) return;
    const fetchPrices = async () => {
      try {
        const addrs = detectedTokens.map(t => t.address).join(",");
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs}`);
        if (res.ok) {
          const data = await res.json();
          const prices: Record<string, number> = {};
          if (data.pairs) {
            data.pairs.forEach((pair: any) => {
              const baseAddr = pair.baseToken.address.toLowerCase();
              if (!prices[baseAddr] || Number(pair.priceUsd) > prices[baseAddr]) {
                prices[baseAddr] = Number(pair.priceUsd);
              }
            });
          }
          setDexPrices(prices);
        }
      } catch (err) {
        console.warn("Failed to fetch DexScreener prices for portfolio:", err);
      }
    };
    fetchPrices();
  }, [detectedTokens]);

  // Construct batch calls for exact block balances and curve reserves
  const factoryCalls = useMemo(() => {
    if (!targetAddress || detectedTokens.length === 0) return [];
    const calls: any[] = [];
    detectedTokens.forEach((t) => {
      const contract = { address: t.address, abi: launchTokenAbi as any } as const;
      calls.push({ ...contract, functionName: "balanceOf", args: [targetAddress] });
      calls.push({ ...contract, functionName: "virtualTokenReserve" });
      calls.push({ ...contract, functionName: "virtualEthReserve" });
      calls.push({ ...contract, functionName: "realEthReserve" });
      calls.push({ ...contract, functionName: "tokensSold" });
      calls.push({ ...contract, functionName: "totalSupply" });
      calls.push({ ...contract, functionName: "graduated" });
    });
    return calls;
  }, [detectedTokens, targetAddress]);

  const { data: batchData, isLoading: batchLoading } = useReadContracts({
    contracts: factoryCalls,
    query: { enabled: factoryCalls.length > 0, refetchInterval: 8000 },
  });

  // Compile active holdings with real time price math
  const holdings = useMemo(() => {
    if (detectedTokens.length === 0 || !batchData) return [];
    const list: {
      address: `0x${string}`;
      name: string;
      symbol: string;
      balance: bigint;
      priceInEth: number;
      priceInUsd: number;
      valueEth: number;
      valueUsd: number;
      pctOwned: number;
      graduated: boolean;
    }[] = [];
    
    const ethToUsd = 3000; // static ETH valuation rate

    detectedTokens.forEach((t, idx) => {
      const offset = idx * 7;
      
      const balRes = batchData[offset];
      const vTokenRes = batchData[offset + 1];
      const vEthRes = batchData[offset + 2];
      const rEthRes = batchData[offset + 3];
      const soldRes = batchData[offset + 4];
      const supplyRes = batchData[offset + 5];
      const gradRes = batchData[offset + 6];

      if (balRes?.status === "success" && (balRes.result as bigint) > 0n) {
        const balance = balRes.result as bigint;
        
        let priceInUsd = dexPrices[t.address.toLowerCase()] || 0;
        let priceInEth = priceInUsd / ethToUsd;

        const isBondingCurve = vTokenRes?.status === "success" && vEthRes?.status === "success";

        // Fallback to bonding curve reserve logic if not indexed on DexScreener
        if (priceInUsd === 0 && isBondingCurve) {
          const vToken = vTokenRes.result as bigint;
          const vEth = vEthRes.result as bigint;
          const rEth = rEthRes?.status === "success" ? (rEthRes.result as bigint) : 0n;
          const sold = soldRes?.status === "success" ? (soldRes.result as bigint) : 0n;

          const tokenReserve = vToken - sold;
          const ethReserve = vEth + rEth;
          priceInEth = tokenReserve > 0n ? Number(ethReserve) / Number(tokenReserve) : 0.000003;
          priceInUsd = priceInEth * ethToUsd;
        }

        // Hardcode helper for standard stables if needed
        if (priceInUsd === 0) {
          if (t.symbol.toUpperCase() === "USDC" || t.symbol.toUpperCase() === "USDT") {
            priceInUsd = 1.0;
            priceInEth = 1.0 / ethToUsd;
          }
        }

        const balanceFloat = Number(balance) / 10 ** t.decimals;
        const valueUsd = balanceFloat * priceInUsd;
        const valueEth = valueUsd / ethToUsd;

        const totalSupply = supplyRes?.status === "success" ? (supplyRes.result as bigint) : 0n;
        const pctOwned = totalSupply > 0n ? (Number(balance * 10000n / totalSupply) / 100) : 0;
        const graduated = gradRes?.status === "success" ? (gradRes.result as boolean) : false;

        list.push({
          address: t.address,
          name: t.name,
          symbol: t.symbol.toUpperCase(),
          balance,
          priceInEth,
          priceInUsd,
          valueEth,
          valueUsd,
          pctOwned,
          graduated
        });
      }
    });

    return list;
  }, [detectedTokens, batchData, dexPrices]);

  // Aggregate total net worth
  const totals = useMemo(() => {
    const ethToUsd = 3000;
    const ethVal = ethBalance ? Number(formatEther(ethBalance.value)) : 0;
    const tokenValUsd = holdings.reduce((sum, h) => sum + h.valueUsd, 0);
    const totalUsd = (ethVal * ethToUsd) + tokenValUsd;
    
    return {
      ethAmount: ethVal,
      ethUsd: ethVal * ethToUsd,
      tokenUsd: tokenValUsd,
      totalUsd,
    };
  }, [ethBalance, holdings]);

  const isLoading = ethLoading || pageLoading || bsLoading || batchLoading;

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6 select-none font-mono-data">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-900 pb-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>💼</span> Portfolio Explorer
          </h2>
          <p className="text-zinc-500 text-xs mt-1">
            Track token holdings, valuations, and contract prices in real-time.
          </p>
        </div>

        {/* Custom Address Lookup Bar */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search address..."
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-yellow-500 transition-all w-64 md:w-80"
          />
          {lookupInput && (
            <button
              onClick={() => setLookupInput("")}
              className="text-zinc-500 hover:text-zinc-300 text-xs px-2 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Connection / Lookup state checks */}
      {!isValidLookup ? (
        <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-10 text-center flex flex-col items-center gap-4 py-16">
          <span className="text-4xl animate-bounce">🔑</span>
          <h3 className="font-bold text-white text-base">Connect Wallet or Search Address</h3>
          <p className="text-xs text-zinc-500 max-w-sm leading-relaxed">
            Please connect your Web3 wallet using the header button or enter any target contract address above to inspect its real-time portfolio.
          </p>
        </div>
      ) : (
        <>
          {/* Inspected Address Label banner */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-zinc-950/40 border border-zinc-900 p-4 rounded-2xl gap-2 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse"></span>
              Inspecting Account:
              <a
                href={`${activeChain.blockExplorers?.default.url}/address/${targetAddress}`}
                target="_blank"
                rel="noreferrer"
                className="text-white hover:text-yellow-500 font-bold underline select-all"
              >
                {targetAddress}
              </a>
              {targetAddress.toLowerCase() === connectedWallet?.toLowerCase() && (
                <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                  YOU
                </span>
              )}
            </span>
            <span className="text-zinc-500 text-[10px]">
              Chain ID: {activeChain.id} ({activeChain.name})
            </span>
          </div>

          {/* Aggregate Valuation Metrics Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Net Worth */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-1.5 shadow">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">NET WORTH USD</span>
              <span className="text-2xl font-black text-white">
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin inline-block align-middle"></span>
                ) : (
                  `$${totals.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                )}
              </span>
            </div>

            {/* ETH Balance */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-1.5 shadow">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">ROBINHOOD ETH HOLDING</span>
              <span className="text-xl font-bold text-white flex justify-between items-baseline gap-2">
                <span>{totals.ethAmount.toFixed(4)} ETH</span>
                <span className="text-xs text-zinc-500">${totals.ethUsd.toFixed(2)}</span>
              </span>
            </div>

            {/* Tokens Balance Valuation */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-1.5 shadow">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">TOKEN HOLDINGS VALUE</span>
              <span className="text-xl font-bold text-white flex justify-between items-baseline gap-2">
                <span>${totals.tokenUsd.toFixed(2)}</span>
                <span className="text-xs text-zinc-500">{holdings.length} Assets</span>
              </span>
            </div>
          </div>

          {/* Holdings Grid/Table */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-5 shadow-2xl flex flex-col gap-4">
            <h3 className="font-bold text-white text-sm border-b border-zinc-900 pb-3">
              📦 DEPLOYED TOKEN BALANCES
            </h3>

            {isLoading ? (
              <div className="text-center py-12 text-zinc-500 text-xs">
                <span className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin inline-block mr-2 align-middle"></span>
                Querying holdings on-chain...
              </div>
            ) : holdings.length === 0 ? (
              <div className="text-center py-12 text-zinc-600 text-xs">
                No active token holdings found for this address.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono-data">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-900 font-bold">
                      <th className="py-2.5">Asset</th>
                      <th className="py-2.5">Balance</th>
                      <th className="py-2.5 text-right">Price (USD)</th>
                      <th className="py-2.5 text-right">Valuation (USD)</th>
                      <th className="py-2.5 text-right">Ownership</th>
                      <th className="py-2.5 text-right">Market</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/50">
                    {holdings.map((h) => (
                      <tr key={h.address} className="hover:bg-zinc-900/30 transition-colors">
                        <td className="py-3.5">
                          <Link to={`/token/${h.address}`} className="flex items-center gap-2.5 group">
                            <div className="w-8 h-8 rounded-full bg-yellow-500 text-black flex items-center justify-center font-bold text-xs group-hover:scale-105 transition-transform shrink-0">
                              {h.symbol.slice(0, 2)}
                            </div>
                            <div>
                              <h4 className="font-bold text-white group-hover:text-yellow-500 transition-colors text-xs">
                                {h.name}
                              </h4>
                              <span className="text-[10px] text-zinc-500 leading-none block mt-0.5">
                                {h.symbol} · {shortAddress(h.address)}
                              </span>
                            </div>
                          </Link>
                        </td>
                        <td className="py-3.5 text-zinc-300 font-bold">
                          {formatTokenAmount(h.balance)}
                        </td>
                        <td className="py-3.5 text-right text-zinc-300">
                          <div className="font-bold">${h.priceInUsd.toFixed(6)}</div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">{h.priceInEth.toFixed(7)} ETH</div>
                        </td>
                        <td className="py-3.5 text-right font-bold text-white">
                          ${h.valueUsd.toFixed(2)}
                        </td>
                        <td className="py-3.5 text-right text-zinc-400 font-bold">
                          {h.pctOwned.toFixed(2)}%
                        </td>
                        <td className="py-3.5 text-right">
                          <Link
                            to={`/token/${h.address}`}
                            className="bg-zinc-900 hover:bg-zinc-800 hover:border-yellow-500 text-zinc-300 border border-zinc-800 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all"
                          >
                            Trade
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
