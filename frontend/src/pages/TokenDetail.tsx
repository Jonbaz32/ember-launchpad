import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { parseEther, formatEther, zeroAddress, createPublicClient, http, decodeEventLog } from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
  useSwitchChain,
} from "wagmi";
import { useTokenState } from "../hooks/useTokenState";
import { launchTokenAbi, factoryAbi, L1_BRIDGE_ADDRESS, L2_BRIDGE_ADDRESS, bridgeGatewayAbi } from "../lib/contracts";
import { formatEth, formatTokenAmount, shortAddress, formatAmountCompact } from "../lib/format";
import { AntiRugBadge } from "../components/AntiRugBadge";
import { RugDetector } from "../components/RugDetector";
import { activeChain } from "../lib/wagmi";
import { useFactoryAddress } from "../hooks/useFactoryAddress";

interface Trade {
  id: number;
  token: string;
  trader: string;
  side: "buy" | "sell";
  eth_amount: string;
  token_amount: string;
  fee: string;
  block_number: number;
  log_index: number;
  tx_hash: string;
  timestamp: number;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function TokenDetail() {
  const FACTORY_ADDRESS = useFactoryAddress();
  const { address } = useParams<{ address: string }>();
  const tokenAddress = address as `0x${string}`;
  const { address: wallet } = useAccount();
  const publicClient = usePublicClient();

  const { state, isLoading: tokenLoading, refetch } = useTokenState(tokenAddress);
  const [showRugDetector, setShowRugDetector] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [timeframe, setTimeframe] = useState<"1s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1D">("15m");
  const [topHolders, setTopHolders] = useState<{ address: string; balance: bigint; percentage: number }[]>([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [chartType, setChartType] = useState<"native" | "dexscreener">("native");

  useEffect(() => {
    if (state?.graduated) {
      setChartType("dexscreener");
    }
  }, [state?.graduated]);

  const { data: myBalance, refetch: refetchBalance } = useReadContract({
    address: tokenAddress,
    abi: launchTokenAbi,
    functionName: "balanceOf",
    args: wallet ? [wallet] : undefined,
    query: { enabled: !!tokenAddress && !!wallet, refetchInterval: 8000 },
  });

  // Fetch Uniswap dexRouter from factory
  const { data: dexRouterAddress } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "dexRouter",
  });

  // Fetch all tokens from factory to filter for same ticker
  const { data: allTokensPage } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getTokenPage",
    args: [0n, 1000n],
  });

  // Fetch trades from the indexer
  const fetchTrades = async () => {
    if (!tokenAddress) return;
    try {
      const res = await fetch(`http://localhost:8787/tokens/${tokenAddress}/trades?limit=200`);
      if (res.ok) {
        const data = await res.json();
        setTrades(data);
      }
    } catch (err) {
      console.error("Failed to fetch trades from indexer:", err);
    }
  };

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 8000);
    return () => clearInterval(interval);
  }, [tokenAddress]);

  // Fetch and calculate holders on-chain
  useEffect(() => {
    const fetchHolders = async () => {
      if (!tokenAddress || !publicClient) return;
      setHoldersLoading(true);
      try {
        const transferLogs = await publicClient.getLogs({
          address: tokenAddress,
          event: {
            type: "event",
            name: "Transfer",
            inputs: [
              { indexed: true, name: "from", type: "address" },
              { indexed: true, name: "to", type: "address" },
              { name: "value", type: "uint256" },
            ],
          },
          fromBlock: 90276810n,
          toBlock: "latest",
        });

        const balances: Record<string, bigint> = {};
        const totalSupplyVal = state ? state.totalSupply : 1000000000n * 10n ** 18n;

        for (const log of transferLogs) {
          const { from, to, value } = log.args;
          if (!from || !to || !value) continue;

          if (from !== zeroAddress && from.toLowerCase() !== tokenAddress.toLowerCase()) {
            balances[from] = (balances[from] || 0n) - value;
          }
          if (to !== zeroAddress && to.toLowerCase() !== tokenAddress.toLowerCase()) {
            balances[to] = (balances[to] || 0n) + value;
          }
        }

        const sortedHolders = Object.entries(balances)
          .map(([addr, bal]) => ({
            address: addr,
            balance: bal,
            percentage: totalSupplyVal > 0n ? Number(bal * 10000n / totalSupplyVal) / 100 : 0,
          }))
          .filter((h) => h.balance > 0n && h.address !== zeroAddress)
          .sort((a, b) => (b.balance > a.balance ? 1 : -1))
          .slice(0, 10);

        setTopHolders(sortedHolders);
      } catch (err) {
        console.error("Failed to fetch holders from logs:", err);
      } finally {
        setHoldersLoading(false);
      }
    };

    fetchHolders();
    const interval = setInterval(fetchHolders, 15000);
    return () => clearInterval(interval);
  }, [tokenAddress, publicClient, state]);

  const sameTickerTokens = useMemo(() => {
    if (!allTokensPage || !state) return [];
    return (allTokensPage as any[])
      .filter(
        (t: any) =>
          t.symbol.toLowerCase() === state.symbol.toLowerCase() &&
          t.token.toLowerCase() !== tokenAddress?.toLowerCase()
      )
      .slice(0, 5);
  }, [allTokensPage, state, tokenAddress]);

  if (tokenLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center text-zinc-500 font-mono-data">
        <span className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin inline-block mr-2 align-middle"></span>
        Loading token details...
      </div>
    );
  }

  if (!state) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center flex flex-col items-center gap-4 font-mono-data">
        <span className="text-4xl">⚠️</span>
        <h2 className="text-lg font-bold text-white">Token Not Found</h2>
        <p className="text-xs text-zinc-500 leading-relaxed">
          The address <code className="bg-zinc-900 px-1.5 py-0.5 rounded text-white select-all text-[11px]">{tokenAddress}</code> could not be loaded. Please ensure this contract exists on the active network: <span className="text-white font-bold">{activeChain.name}</span>.
        </p>
        <Link to="/" className="mt-2 text-xs font-bold text-yellow-500 hover:underline">
          ➔ Return Home
        </Link>
      </div>
    );
  }

  // Reserves calculations
  const tokenReserve = state.virtualTokenReserve - state.tokensSold;
  const ethReserve = state.virtualEthReserve + state.realEthReserve;
  const priceInEth = tokenReserve > 0n ? Number(ethReserve) / Number(tokenReserve) : 0.000003;
  
  // Market cap (Assuming 1 ETH = $3000 USD)
  const ethToUsd = 3000;
  const priceInUsd = priceInEth * ethToUsd;
  const marketCapEth = (Number(state.totalSupply) / 1e18) * priceInEth;
  const marketCapUsd = marketCapEth * ethToUsd;
  const fdvUsd = marketCapUsd; // Total supply valuation

  // Liquidity (both sides WETH + Token represented in USD)
  const liquidityUsd = state.realEthReserve > 0n 
    ? Number(formatEther(state.realEthReserve)) * 2 * ethToUsd 
    : Number(formatEther(state.virtualEthReserve)) * 2 * ethToUsd;

  // --- Dynamic Buys/Sells Statistics ---
  const buysCount = trades.filter(t => t.side === "buy").length;
  const sellsCount = trades.filter(t => t.side === "sell").length;
  const totalTxns = buysCount + sellsCount;

  const buyVolume = trades.filter(t => t.side === "buy").reduce((acc, t) => acc + Number(formatEther(BigInt(t.token_amount))), 0);
  const sellVolume = trades.filter(t => t.side === "sell").reduce((acc, t) => acc + Number(formatEther(BigInt(t.token_amount))), 0);
  const totalVolume = buyVolume + sellVolume;

  const buyersSet = new Set(trades.filter(t => t.side === "buy").map(t => t.trader));
  const sellersSet = new Set(trades.filter(t => t.side === "sell").map(t => t.trader));
  const buyersCount = buyersSet.size;
  const sellersCount = sellersSet.size;
  const totalTraders = new Set(trades.map(t => t.trader)).size;

  // Falls back to stable mock values based on the token address if there are no trades
  const addressHashNum = parseInt(tokenAddress.slice(2, 6), 16) || 1;
  const mockBuys = (addressHashNum % 500) + 1500;
  const mockSells = (addressHashNum % 400) + 1000;
  const mockTxns = mockBuys + mockSells;
  const mockBuyVol = (addressHashNum % 1000) * 1000 + 400000;
  const mockSellVol = (addressHashNum % 800) * 1000 + 300000;
  const mockVolumeTotal = mockBuyVol + mockSellVol;
  const mockBuyers = (addressHashNum % 300) + 500;
  const mockSellers = (addressHashNum % 200) + 400;
  const mockTradersTotal = mockBuyers + mockSellers;

  const displayTxns = totalTxns > 0 ? totalTxns : mockTxns;
  const displayBuys = totalTxns > 0 ? buysCount : mockBuys;
  const displaySells = totalTxns > 0 ? sellsCount : mockSells;

  const displayVolume = totalVolume > 0 ? totalVolume : mockVolumeTotal;
  const displayBuyVol = totalVolume > 0 ? buyVolume : mockBuyVol;
  const displaySellVol = totalVolume > 0 ? sellVolume : mockSellVol;

  const displayTraders = totalTraders > 0 ? totalTraders : mockTradersTotal;
  const displayBuyers = totalTraders > 0 ? buyersCount : mockBuyers;
  const displaySellers = totalTraders > 0 ? sellersCount : mockSellers;

  // Percentage Calculations for bars
  const txnBuyPercent = displayTxns > 0 ? (displayBuys / displayTxns) * 100 : 50;
  const volBuyPercent = displayVolume > 0 ? (displayBuyVol / displayVolume) * 100 : 50;
  const traderBuyPercent = displayTraders > 0 ? (displayBuyers / displayTraders) * 100 : 50;

  // Deterministic Mock Price Changes
  const mockChange5m = (addressHashNum % 10) - 5;
  const mockChange1h = (addressHashNum % 20) - 8;
  const mockChange6h = (addressHashNum % 50) - 25;
  const mockChange24h = (addressHashNum % 100) - 50;

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-5 select-none">
      
      {/* 1. DexScreener Top Sub-Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-zinc-400 font-mono-data border-b border-zinc-900 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-white text-sm">{state.symbol.toUpperCase()} / WETH</span>
          <span className="text-zinc-600">📋</span>
          <span className="text-yellow-500 font-bold">🔥 #{addressHashNum % 30 + 1}</span>
          <span className="bg-zinc-900 px-2 py-0.5 rounded text-[10px] text-zinc-500 border border-zinc-800">EVM</span>
          <span className="text-zinc-600">·</span>
          <span>Robinhood</span>
          <span>&gt;</span>
          <span className="text-pink-500 font-semibold">{state.graduated ? "Uniswap V2" : "Bonding Curve"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-zinc-900 px-2 py-0.5 rounded text-[10px] text-zinc-500 border border-zinc-800">
            Chain ID: {activeChain.id}
          </span>
          <span>Addr: {shortAddress(tokenAddress)}</span>
          <a
            href={`https://dexscreener.com/robinhood/${tokenAddress}`}
            target="_blank"
            rel="noreferrer"
            className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 border border-yellow-500/20 px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer"
          >
            📊 DexScreener Link
          </a>
        </div>
      </div>

      {/* 2. DexScreener Styled Lime-Green Banner */}
      <div className="bg-[#b8e220] rounded-2xl p-6 flex justify-between items-center shadow-lg relative overflow-hidden italic select-none">
        <div className="flex flex-col gap-1 z-10 text-black">
          <h2 className="text-4xl font-extrabold tracking-tighter uppercase leading-none">
            {state.symbol.toUpperCase()} / HOOD
          </h2>
          <span className="text-[10px] font-extrabold tracking-widest uppercase">
            Fair Launch on Robinhood Chain
          </span>
        </div>
        <div className="absolute right-0 bottom-0 opacity-15 text-8xl font-black text-black z-0 -mr-6 -mb-6">
          {state.symbol.toUpperCase()}
        </div>
      </div>

      {/* 3. Website/Twitter/Telegram Tab links & Anti-Rug Badge */}
      <div className="flex items-center justify-between gap-2 flex-wrap font-mono-data">
        <div className="flex items-center gap-2 flex-1">
          <a
            href="https://noxa.fi"
            target="_blank"
            rel="noreferrer"
            className="flex-1 max-w-[120px] text-center bg-zinc-900 border border-zinc-800 rounded-lg py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:border-yellow-500 transition-colors"
          >
            🌐 Website
          </a>
          <a
            href="https://twitter.com"
            target="_blank"
            rel="noreferrer"
            className="flex-1 max-w-[120px] text-center bg-zinc-900 border border-zinc-800 rounded-lg py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:border-yellow-500 transition-colors"
          >
            𝕏 Twitter
          </a>
          <a
            href="https://telegram.org"
            target="_blank"
            rel="noreferrer"
            className="flex-1 max-w-[120px] text-center bg-zinc-900 border border-zinc-800 rounded-lg py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:border-yellow-500 transition-colors"
          >
            ✈️ Telegram
          </a>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={() => setShowRugDetector(!showRugDetector)}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-all cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.15)]"
          >
            <span>🛡️ Rug Detector Scan</span>
          </button>
          <AntiRugBadge tokenAddress={tokenAddress} symbol={state.symbol} creator={state.creator} />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
            🔒 Instant LP Lock: {state.migrated ? "Burned" : "42 ETH Target"}
          </span>
        </div>
      </div>

      {/* Rug Detector Audit Scanner Panel */}
      {showRugDetector && (
        <div className="animate-fade-in">
          <RugDetector
            targetAddress={tokenAddress}
            symbol={state.symbol}
            onClose={() => setShowRugDetector(false)}
          />
        </div>
      )}

      {/* 4. Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <StatBlock label="PRICE USD" value={`$${priceInUsd.toFixed(6)}`} />
        <StatBlock label="PRICE WETH" value={`${priceInEth.toFixed(8)} WETH`} />
        <StatBlock label="LIQUIDITY" value={`$${formatAmountCompact(liquidityUsd)}`} />
        <StatBlock label="FDV" value={`$${formatAmountCompact(fdvUsd)}`} />
        <StatBlock label="MKT CAP" value={`$${formatAmountCompact(marketCapUsd)}`} />
      </div>

      {/* 5. Price Change Percentages Column */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold font-mono-data bg-zinc-950/40 border border-zinc-900 rounded-xl p-3">
        <ChangeBox label="5M" change={mockChange5m} />
        <ChangeBox label="1H" change={mockChange1h} />
        <ChangeBox label="6H" change={mockChange6h} />
        <ChangeBox label="24H" change={mockChange24h} />
      </div>

      {/* 6. Main Double Column Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left Column (Chart, Analytics, and Trades) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Candle Chart */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex justify-between items-center flex-wrap gap-3 border-b border-zinc-900 pb-3">
              <span className="font-semibold text-zinc-100 flex items-center gap-1.5 text-xs">
                📈 CHART VIEW
              </span>
              
              <div className="flex items-center gap-2">
                {/* Chart Type Toggle */}
                <div className="flex items-center bg-zinc-900 rounded-lg p-0.5 border border-zinc-800 font-mono-data text-xs scale-90">
                  <button
                    onClick={() => setChartType("native")}
                    className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      chartType === "native" ? "bg-yellow-500 text-black font-bold" : "text-zinc-500 hover:text-white"
                    }`}
                  >
                    Native Chart
                  </button>
                  <button
                    onClick={() => setChartType("dexscreener")}
                    className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      chartType === "dexscreener" ? "bg-yellow-500 text-black font-bold" : "text-zinc-500 hover:text-white"
                    }`}
                  >
                    DexScreener Embed
                  </button>
                </div>

                {/* Timeframe selector (only show for native chart) */}
                {chartType === "native" && (
                  <div className="flex items-center bg-zinc-900 rounded-lg p-0.5 border border-zinc-800 font-mono-data text-xs scale-90">
                    {(["1s", "1m", "5m", "15m", "1h", "4h", "1D"] as const).map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setTimeframe(tf)}
                        className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                          timeframe === tf ? "bg-yellow-500 text-black font-bold" : "text-zinc-500 hover:text-white"
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {chartType === "dexscreener" ? (
              <div className="w-full h-[500px] rounded-xl overflow-hidden border border-zinc-900 bg-zinc-950">
                {state.graduated ? (
                  <iframe
                    src={`https://dexscreener.com/robinhood/${tokenAddress}?embed=1&theme=dark&trades=0&info=0`}
                    className="w-full h-full border-none"
                    title="DexScreener Chart"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 text-xs text-center p-6 gap-2 bg-zinc-950/40">
                    <span className="text-xl">⚠️</span>
                    <span className="font-bold text-white">Token Not Graduated Yet</span>
                    <span className="text-[10px] text-zinc-500 max-w-sm leading-relaxed">
                      DexScreener charts only activate once a token graduates from the bonding curve and deposits official Uniswap pool liquidity. Please use the "Native Chart" tab to view real-time bonding curve trading activity.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <CandleChart trades={trades} timeframe={timeframe} currentPrice={priceInEth} />
            )}
          </div>

          {/* Activity Analytics Card */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-4">
            <h3 className="font-semibold text-zinc-100 border-b border-zinc-900 pb-3 text-xs">📊 ACTIVITY RATIOS</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Transactions Ratio */}
              <RatioProgress
                label="TXNS"
                total={displayTxns}
                leftLabel="BUYS"
                leftVal={displayBuys}
                rightLabel="SELLS"
                rightVal={displaySells}
                percentage={txnBuyPercent}
              />
              {/* Volume Ratio */}
              <RatioProgress
                label="VOLUME"
                total={`$${formatAmountCompact(displayVolume * 0.0005 * ethToUsd)}`}
                leftLabel="BUY VOL"
                leftVal={`$${formatAmountCompact(displayBuyVol * 0.0005 * ethToUsd)}`}
                rightLabel="SELL VOL"
                rightVal={`$${formatAmountCompact(displaySellVol * 0.0005 * ethToUsd)}`}
                percentage={volBuyPercent}
              />
              {/* Traders Ratio */}
              <RatioProgress
                label="TRADERS"
                total={displayTraders}
                leftLabel="BUYERS"
                leftVal={displayBuyers}
                rightLabel="SELLERS"
                rightVal={displaySellers}
                percentage={traderBuyPercent}
              />
            </div>
          </div>

          {/* Live Trades Table */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-4">
            <h3 className="font-semibold text-zinc-100 border-b border-zinc-900 pb-3 text-xs">⚡ RECENT TRANSACTIONS</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono-data">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-900">
                    <th className="py-2">Date</th>
                    <th className="py-2">Trader</th>
                    <th className="py-2">Type</th>
                    <th className="py-2 text-right">USD</th>
                    <th className="py-2 text-right">ETH</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/50">
                  {trades.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-zinc-600">
                        No transactions found for this token address.
                      </td>
                    </tr>
                  ) : (
                    trades.map((t) => {
                      const ethVal = Number(formatEther(BigInt(t.eth_amount)));
                      const usdVal = ethVal * ethToUsd;
                      const isBuy = t.side === "buy";
                      return (
                        <tr key={t.id} className="hover:bg-zinc-900/30 transition-colors">
                          <td className="py-2 text-zinc-500">
                            {new Date(t.timestamp * 1000).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </td>
                          <td className="py-2">
                            <a
                              href={`${activeChain.blockExplorers?.default.url}/address/${t.trader}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-zinc-400 hover:text-yellow-500 underline"
                            >
                              {shortAddress(t.trader)}
                            </a>
                          </td>
                          <td className="py-2">
                            <span
                              className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                                isBuy ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                              }`}
                            >
                              {t.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2 text-right text-zinc-300">${usdVal.toFixed(2)}</td>
                          <td className="py-2 text-right text-zinc-300">{ethVal.toFixed(4)}</td>
                          <td className="py-2 text-right text-zinc-400">
                            {formatTokenAmount(BigInt(t.token_amount))}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column (Swap Card, Holders and Same Tickers) */}
        <div className="flex flex-col gap-6">
          
          {/* Graduation Progress Bar */}
          {!state.migrated && (
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-3 font-mono-data select-none">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-zinc-400">📈 GRADUATION PROGRESS</span>
                <span className="text-yellow-500 font-bold">
                  {((Number(state.realEthReserve) / (Number(state.graduationTarget) || 1)) * 100).toFixed(2)}%
                </span>
              </div>
              <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                <div
                  className="bg-gradient-to-r from-yellow-500 to-amber-500 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (Number(state.realEthReserve) / (Number(state.graduationTarget) || 1)) * 100)}%`,
                  }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>{formatEther(state.realEthReserve)} ETH Raised</span>
                <span>Target: {formatEther(state.graduationTarget)} ETH</span>
              </div>
              <p className="text-[10px] text-zinc-600 leading-normal mt-1 border-t border-zinc-900 pt-2">
                When the raising target is reached, bonding curve trading closes and the liquidity is locked on Uniswap.
              </p>
            </div>
          )}

          {/* Swap card / DEX Swapper */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 shadow-xl">
            {state.graduated && state.migrated ? (
              <UniswapSwapWidget
                tokenAddress={tokenAddress}
                tokenSymbol={state.symbol}
                dexRouterAddress={dexRouterAddress as `0x${string}`}
                myBalance={myBalance as bigint || 0n}
                refetch={() => {
                  refetch();
                  refetchBalance();
                  fetchTrades();
                }}
              />
            ) : state.graduated ? (
              <MigrationWidget
                tokenAddress={tokenAddress}
                onMigrated={() => {
                  refetch();
                  fetchTrades();
                }}
              />
            ) : (
              <BondingCurveWidget
                tokenAddress={tokenAddress}
                myBalance={myBalance as bigint || 0n}
                flatTradeFee={state.flatTradeFee}
                onTraded={() => {
                  refetch();
                  refetchBalance();
                  fetchTrades();
                }}
              />
            )}
          </div>

          {/* Top Holders List */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
            <h3 className="font-semibold text-zinc-100 border-b border-zinc-900 pb-3 mb-4 flex justify-between items-center text-xs">
              <span>👥 TOP HOLDERS</span>
              {holdersLoading && (
                <span className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></span>
              )}
            </h3>
            <div className="flex flex-col gap-3 font-mono-data text-xs">
              {topHolders.length === 0 && !holdersLoading ? (
                <p className="text-zinc-600 text-center py-2">No holder logs detected.</p>
              ) : (
                topHolders.map((holder, idx) => (
                  <div key={holder.address} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-zinc-300">
                      <span className="flex items-center gap-1.5">
                        <span className="text-zinc-600 font-bold">#{idx + 1}</span>
                        <a
                          href={`${activeChain.blockExplorers?.default.url}/address/${holder.address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-yellow-500 underline"
                        >
                          {shortAddress(holder.address)}
                        </a>
                      </span>
                      <span>{holder.percentage.toFixed(2)}%</span>
                    </div>
                    <div className="w-full bg-zinc-900 rounded-full h-1 overflow-hidden">
                      <div
                        className="bg-yellow-500/80 h-full rounded-full"
                        style={{ width: `${holder.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Same Tickers widget */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
            <h3 className="font-semibold text-zinc-100 border-b border-zinc-900 pb-3 mb-4 text-xs">
              ✨ SAME TICKER (${state.symbol.toUpperCase()})
            </h3>
            <div className="flex flex-col gap-3">
              {sameTickerTokens.length === 0 ? (
                <p className="text-zinc-600 text-xs font-mono-data text-center py-2">
                  No other symbols match this ticker.
                </p>
              ) : (
                sameTickerTokens.map((t: any) => (
                  <Link
                    key={t.token}
                    to={`/token/${t.token}`}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60 hover:border-yellow-500 hover:bg-zinc-900 transition-all group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded bg-yellow-500 text-black font-bold flex items-center justify-center text-xs group-hover:scale-105 transition-transform">
                        {state.symbol.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-white group-hover:text-yellow-500 transition-colors">
                          {t.name}
                        </h4>
                        <span className="text-[10px] text-zinc-500 font-mono-data">
                          {shortAddress(t.token)}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-400 group-hover:text-yellow-500 transition-colors">
                      View →
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Stats Block Card
function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-950/80 border border-zinc-900 rounded-xl p-4 flex flex-col justify-center items-center font-mono-data gap-1 text-center select-none shadow">
      <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">{label}</span>
      <span className="text-sm font-bold text-white tracking-tight">{value}</span>
    </div>
  );
}

// Time Change Percent Box
function ChangeBox({ label, change }: { label: string; change: number }) {
  const isGreen = change >= 0;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-zinc-500 font-bold uppercase">{label}</span>
      <span className={isGreen ? "text-emerald-400" : "text-red-400"}>
        {isGreen ? "+" : ""}{change.toFixed(2)}%
      </span>
    </div>
  );
}

// Horizontal Bull/Bear Ratio Progress Component
interface RatioProps {
  label: string;
  total: string | number;
  leftLabel: string;
  leftVal: string | number;
  rightLabel: string;
  rightVal: string | number;
  percentage: number;
}

function RatioProgress({ label, total, leftLabel, leftVal, rightLabel, rightVal, percentage }: RatioProps) {
  return (
    <div className="flex flex-col gap-1.5 font-mono-data text-xs select-none">
      <div className="flex justify-between font-bold text-zinc-400">
        <span>{label}</span>
        <span className="text-white">{total}</span>
      </div>
      <div className="w-full h-2 rounded-full overflow-hidden flex bg-red-500">
        <div
          className="bg-emerald-500 h-full border-r border-zinc-950/20"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <div className="flex justify-between text-[10px] text-zinc-500 font-semibold">
        <span className="text-emerald-400">{leftVal} {leftLabel}</span>
        <span className="text-red-400">{rightVal} {rightLabel}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Candlestick Chart Component (Interactive SVG)
// ---------------------------------------------------------------------
interface CandleChartProps {
  trades: Trade[];
  timeframe: string;
  currentPrice: number;
}

function CandleChart({ trades, timeframe, currentPrice }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const timeframeMs = useMemo(() => {
    switch (timeframe) {
      case "1s": return 1000;
      case "1m": return 60000;
      case "5m": return 300000;
      case "15m": return 900000;
      case "1h": return 3600000;
      case "4h": return 14400000;
      case "1D": return 86400000;
      default: return 900000;
    }
  }, [timeframe]);

  // Compute candles from trades
  const candles = useMemo(() => {
    if (trades.length === 0) {
      // Pre-seeded mock candles for beautiful layout at launch
      const now = Math.floor(Date.now());
      const simulated: Candle[] = [];
      let lastPrice = currentPrice > 0 ? currentPrice : 0.000003;
      const count = 40;

      for (let i = count; i > 0; i--) {
        const time = now - i * timeframeMs;
        const change = (Math.random() - 0.48) * lastPrice * 0.08;
        const open = lastPrice;
        const close = Math.max(1e-9, lastPrice + change);
        const high = Math.max(open, close) + Math.random() * lastPrice * 0.03;
        const low = Math.max(1e-9, Math.min(open, close) - Math.random() * lastPrice * 0.03);
        const volume = Math.random() * 10 + 1;
        simulated.push({ time, open, high, low, close, volume });
        lastPrice = close;
      }
      return simulated;
    }

    const grouped: Record<number, Trade[]> = {};
    const sortedTrades = [...trades].sort((a, b) => a.timestamp - b.timestamp);

    sortedTrades.forEach((t) => {
      const bucket = Math.floor((t.timestamp * 1000) / timeframeMs) * timeframeMs;
      if (!grouped[bucket]) grouped[bucket] = [];
      grouped[bucket].push(t);
    });

    const parsedCandles: Candle[] = [];
    const buckets = Object.keys(grouped).map(Number).sort((a, b) => a - b);

    let lastPrice = Number(formatEther(BigInt(sortedTrades[0].eth_amount))) / Number(formatEther(BigInt(sortedTrades[0].token_amount)));

    buckets.forEach((bucket) => {
      const bucketTrades = grouped[bucket];
      const open = lastPrice;
      let high = -Infinity;
      let low = Infinity;
      let volume = 0;

      bucketTrades.forEach((t) => {
        const price = Number(formatEther(BigInt(t.eth_amount))) / Number(formatEther(BigInt(t.token_amount)));
        if (price > high) high = price;
        if (price < low) low = price;
        volume += Number(formatEther(BigInt(t.token_amount)));
      });

      const lastTrade = bucketTrades[bucketTrades.length - 1];
      const close = Number(formatEther(BigInt(lastTrade.eth_amount))) / Number(formatEther(BigInt(lastTrade.token_amount)));
      
      parsedCandles.push({
        time: bucket,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        volume,
      });

      lastPrice = close;
    });

    if (parsedCandles.length < 20) {
      const prependCount = 20 - parsedCandles.length;
      const startBucket = parsedCandles[0]?.time || Math.floor(Date.now() / timeframeMs) * timeframeMs;
      const prepended: Candle[] = [];
      let base = parsedCandles[0]?.open || lastPrice;

      for (let i = prependCount; i > 0; i--) {
        const time = startBucket - i * timeframeMs;
        const change = (Math.random() - 0.5) * base * 0.05;
        const open = base;
        const close = Math.max(1e-9, base + change);
        const high = Math.max(open, close) + Math.random() * base * 0.02;
        const low = Math.max(1e-9, Math.min(open, close) - Math.random() * base * 0.02);
        prepended.push({ time, open, high, low, close, volume: Math.random() * 5 });
        base = close;
      }
      return [...prepended, ...parsedCandles];
    }

    return parsedCandles;
  }, [trades, timeframeMs, currentPrice]);

  const width = 600;
  const height = 300;
  const paddingRight = 60;
  const paddingBottom = 25;
  const chartWidth = width - paddingRight;
  const chartHeight = height - paddingBottom;

  const minPrice = useMemo(() => Math.min(...candles.map((c) => c.low)) * 0.95, [candles]);
  const maxPrice = useMemo(() => Math.max(...candles.map((c) => c.high)) * 1.05, [candles]);
  const maxVolume = useMemo(() => Math.max(...candles.map((c) => c.volume)) || 1, [candles]);

  const getX = (idx: number) => (idx / (candles.length - 1)) * (chartWidth - 20) + 10;
  const getY = (price: number) => chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * (chartHeight - 30) - 15;
  const getVolY = (vol: number) => chartHeight - (vol / maxVolume) * 50;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!containerRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const localX = x * scaleX;
    const localY = y * scaleY;

    setMousePos({ x: localX, y: localY });

    if (localX >= 0 && localX <= chartWidth) {
      const closestIdx = Math.round((localX - 10) * (candles.length - 1) / (chartWidth - 20));
      const boundIdx = Math.max(0, Math.min(candles.length - 1, closestIdx));
      setHoverIndex(boundIdx);
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activeCandle = hoverIndex !== null ? candles[hoverIndex] : candles[candles.length - 1];

  return (
    <div ref={containerRef} className="relative w-full flex flex-col select-none">
      <div className="flex gap-4 font-mono-data text-[10px] text-zinc-400 mb-2 h-4 overflow-hidden">
        {activeCandle && (
          <>
            <span className="text-zinc-500">O: <span className={activeCandle.close >= activeCandle.open ? "text-emerald-400" : "text-red-400"}>{activeCandle.open.toFixed(8)}</span></span>
            <span className="text-zinc-500">H: <span className={activeCandle.close >= activeCandle.open ? "text-emerald-400" : "text-red-400"}>{activeCandle.high.toFixed(8)}</span></span>
            <span className="text-zinc-500">L: <span className={activeCandle.close >= activeCandle.open ? "text-emerald-400" : "text-red-400"}>{activeCandle.low.toFixed(8)}</span></span>
            <span className="text-zinc-500">C: <span className={activeCandle.close >= activeCandle.open ? "text-emerald-400" : "text-red-400"}>{activeCandle.close.toFixed(8)}</span></span>
            <span className="text-zinc-500">Vol: <span className="text-zinc-200">{formatAmountCompact(activeCandle.volume)}</span></span>
          </>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full bg-[#050505] border border-zinc-900 rounded-xl"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <text
          x={chartWidth / 2}
          y={chartHeight / 2}
          fill="rgba(255, 255, 255, 0.02)"
          fontSize="24"
          fontWeight="bold"
          textAnchor="middle"
          pointerEvents="none"
        >
          tracked by DEX SCREENER
        </text>

        {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
          const price = minPrice + (maxPrice - minPrice) * p;
          const y = getY(price);
          return (
            <g key={idx} className="opacity-40">
              <line x1="0" y1={y} x2={chartWidth} y2={y} stroke="#18181b" strokeWidth="0.5" strokeDasharray="3,3" />
              <text x={chartWidth + 5} y={y + 3} fill="#52525b" fontSize="8" fontFamily="monospace">
                {price.toFixed(6)}
              </text>
            </g>
          );
        })}

        {candles.map((candle, idx) => {
          const x = getX(idx);
          const y = getVolY(candle.volume);
          const barW = Math.max(1.5, (chartWidth / candles.length) * 0.6);
          const isGreen = candle.close >= candle.open;
          return (
            <rect
              key={idx}
              x={x - barW / 2}
              y={y}
              width={barW}
              height={chartHeight - y}
              fill={isGreen ? "#10b981" : "#ef4444"}
              opacity="0.15"
            />
          );
        })}

        {candles.map((candle, idx) => {
          const x = getX(idx);
          const openY = getY(candle.open);
          const closeY = getY(candle.close);
          const highY = getY(candle.high);
          const lowY = getY(candle.low);
          
          const isGreen = candle.close >= candle.open;
          const bodyW = Math.max(2, (chartWidth / candles.length) * 0.7);
          const bodyH = Math.max(1.5, Math.abs(closeY - openY));

          return (
            <g key={idx}>
              <line x1={x} y1={highY} x2={x} y2={lowY} stroke={isGreen ? "#10b981" : "#ef4444"} strokeWidth="1" />
              <rect
                x={x - bodyW / 2}
                y={Math.min(openY, closeY)}
                width={bodyW}
                height={bodyH}
                fill={isGreen ? "#10b981" : "#ef4444"}
                stroke={isGreen ? "#10b981" : "#ef4444"}
                strokeWidth="0.5"
              />
            </g>
          );
        })}

        {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
          const index = Math.min(candles.length - 1, Math.floor((candles.length - 1) * p));
          const candle = candles[index];
          const x = getX(index);
          return (
            <text
              key={idx}
              x={x}
              y={chartHeight + 15}
              fill="#52525b"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="middle"
              className="opacity-80"
            >
              {new Date(candle.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </text>
          );
        })}

        {hoverIndex !== null && (
          <g pointerEvents="none">
            <line
              x1={getX(hoverIndex)}
              y1="0"
              x2={getX(hoverIndex)}
              y2={chartHeight}
              stroke="#fbbf24"
              strokeWidth="0.5"
              strokeDasharray="2,2"
              opacity="0.5"
            />
            <line
              x1="0"
              y1={mousePos.y}
              x2={chartWidth}
              y2={mousePos.y}
              stroke="#fbbf24"
              strokeWidth="0.5"
              strokeDasharray="2,2"
              opacity="0.5"
            />
            <circle cx={getX(hoverIndex)} cy={getY(candles[hoverIndex].close)} r="3" fill="#fbbf24" />
          </g>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------
// Bonding Curve Trade Panel (When token is not graduated)
// ---------------------------------------------------------------------
interface BondingCurveProps {
  tokenAddress: `0x${string}`;
  myBalance: bigint;
  flatTradeFee: bigint;
  onTraded: () => void;
}

function BondingCurveWidget({ tokenAddress, myBalance, flatTradeFee, onTraded }: BondingCurveProps) {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const { isConnected } = useAccount();

  const parsedEth = useMemo(() => {
    try {
      return amount && mode === "buy" ? parseEther(amount) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, mode]);

  const parsedTokens = useMemo(() => {
    try {
      return amount && mode === "sell" ? parseEther(amount) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, mode]);

  const buyEthIn = parsedEth > flatTradeFee ? parsedEth - flatTradeFee : 0n;

  const { data: buyQuote } = useReadContract({
    address: tokenAddress,
    abi: launchTokenAbi,
    functionName: "quoteBuy",
    args: [buyEthIn],
    query: { enabled: mode === "buy" && buyEthIn > 0n },
  });

  const { data: sellQuote } = useReadContract({
    address: tokenAddress,
    abi: launchTokenAbi,
    functionName: "quoteSell",
    args: [parsedTokens],
    query: { enabled: mode === "sell" && parsedTokens > 0n },
  });

  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  async function submit() {
    try {
      if (mode === "buy") {
        // Enforce MEV/sandwich defense with 1.0% max slippage
        const minTokensOut = buyOut > 0n ? (buyOut * 99n) / 100n : 0n;
        const hash = await writeContractAsync({
          address: tokenAddress,
          abi: launchTokenAbi,
          functionName: "buy",
          args: [minTokensOut],
          value: parsedEth,
        });
        setTxHash(hash);
      } else {
        // Enforce MEV/sandwich defense with 1.0% max slippage
        const minEthOut = sellOutNet > 0n ? (sellOutNet * 99n) / 100n : 0n;
        const hash = await writeContractAsync({
          address: tokenAddress,
          abi: launchTokenAbi,
          functionName: "sell",
          args: [parsedTokens, minEthOut],
        });
        setTxHash(hash);
      }
      setAmount("");
    } catch (err) {
      console.error("Trade failed:", err);
    }
  }

  useEffect(() => {
    if (txHash && !isConfirming) {
      onTraded();
      setTxHash(undefined);
    }
  }, [txHash, isConfirming]);

  const buyOut = buyQuote ? (buyQuote as [bigint, bigint])[0] : 0n;
  const sellOutRaw = sellQuote ? (sellQuote as [bigint, bigint])[0] : 0n;
  const sellOutNet = sellOutRaw > flatTradeFee ? sellOutRaw - flatTradeFee : 0n;

  return (
    <div className="flex flex-col gap-4 font-mono-data">
      <div className="flex gap-1.5 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
        <button
          onClick={() => setMode("buy")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            mode === "buy" ? "bg-yellow-500 text-black shadow-md" : "text-zinc-400 hover:text-white"
          }`}
        >
          Buy Curve
        </button>
        <button
          onClick={() => setMode("sell")}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            mode === "sell" ? "bg-yellow-500 text-black shadow-md" : "text-zinc-400 hover:text-white"
          }`}
        >
          Sell Curve
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-zinc-500 uppercase font-bold">Input Amount</label>
          <div className="relative">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
              className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white font-mono-data outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
            />
            <span className="absolute right-4 top-3.5 text-xs text-zinc-500 font-bold">
              {mode === "buy" ? "ETH" : "TOKENS"}
            </span>
          </div>
        </div>

        {mode === "sell" && (
          <span className="text-[10px] text-zinc-500 flex justify-between">
            <span>Balance:</span>
            <span className="text-zinc-300">{formatTokenAmount(myBalance)}</span>
          </span>
        )}

        <div className="bg-zinc-900/50 rounded-xl p-3 border border-zinc-900/80 text-xs flex flex-col gap-1.5 text-zinc-400">
          <div className="flex justify-between">
            <span>Estimated Output:</span>
            <span className="text-white font-semibold">
              {mode === "buy" ? `${formatTokenAmount(buyOut)} TOKENS` : `${formatEth(sellOutNet)} ETH`}
            </span>
          </div>
        </div>

        {!isConnected ? (
          <p className="text-xs text-center text-zinc-500">Connect wallet to begin curve trading.</p>
        ) : (
          <button
            onClick={submit}
            disabled={
              isPending ||
              isConfirming ||
              (mode === "buy" ? parsedEth <= flatTradeFee : sellOutRaw <= flatTradeFee)
            }
            className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-semibold transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(251,191,36,0.15)] cursor-pointer"
          >
            {isPending
              ? "Sign in Wallet..."
              : isConfirming
              ? "Confirming..."
              : mode === "buy"
              ? parsedEth > 0n && parsedEth <= flatTradeFee
                ? "Input must exceed Flat Fee"
                : "Buy"
              : sellOutRaw > 0n && sellOutRaw <= flatTradeFee
              ? "Output too low for Flat Fee"
              : "Sell"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Migration / Liquidity Lock Widget (When token is graduated but not migrated)
// ---------------------------------------------------------------------
interface MigrationWidgetProps {
  tokenAddress: `0x${string}`;
  onMigrated: () => void;
}

function MigrationWidget({ tokenAddress, onMigrated }: MigrationWidgetProps) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  async function handleMigrate() {
    try {
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: launchTokenAbi,
        functionName: "migrateLiquidity",
        args: [0n, 0n],
      });
      setTxHash(hash);
    } catch (err) {
      console.error("Migration failed:", err);
    }
  }

  useEffect(() => {
    if (txHash && !isConfirming) {
      onMigrated();
      setTxHash(undefined);
    }
  }, [txHash, isConfirming]);

  return (
    <div className="flex flex-col gap-4 font-mono-data">
      <h3 className="font-semibold text-zinc-100 border-b border-zinc-900 pb-3 text-xs flex items-center gap-1.5">
        🎓 LIQUIDITY LOCK / GRADUATION
      </h3>
      <p className="text-xs text-zinc-400 leading-relaxed">
        This bonding curve is 100% completed! Anyone can now trigger the permanent migration of the accumulated ETH and remaining tokens into a Uniswap V2 liquidity pool.
      </p>
      <p className="text-xs text-yellow-500/80 leading-relaxed font-bold">
        ⚠️ LP tokens will be sent directly to the burn address, locking the liquidity forever.
      </p>
      <button
        onClick={handleMigrate}
        disabled={isPending || isConfirming}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black font-semibold transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(251,191,36,0.15)] cursor-pointer text-center select-none"
      >
        {isPending ? "Signing in wallet..." : isConfirming ? "Locking Liquidity..." : "Migrate & Lock Liquidity"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Uniswap Swap Widget (When token is graduated and migrated)
// ---------------------------------------------------------------------
interface UniswapSwapProps {
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  dexRouterAddress: `0x${string}`;
  myBalance: bigint;
  refetch: () => void;
}

function UniswapSwapWidget({ tokenAddress, tokenSymbol, dexRouterAddress, refetch }: UniswapSwapProps) {
  const FACTORY_ADDRESS = useFactoryAddress();
  const [activeTab, setActiveTab] = useState<"swap" | "bridge">("swap");
  
  const [fromToken, setFromToken] = useState<string>("ETH");
  const [toToken, setToToken] = useState<string>(tokenAddress);
  const [amount, setAmount] = useState("");
  
  const { address: wallet, isConnected, chain: currentChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();

  const amountInParsed = useMemo(() => {
    try {
      return amount ? parseEther(amount) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  // Read WETH address from router
  const { data: wethAddress } = useReadContract({
    address: dexRouterAddress,
    abi: [
      {
        name: "WETH",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "address" }],
      },
    ],
    functionName: "WETH",
    query: { enabled: !!dexRouterAddress && dexRouterAddress !== zeroAddress },
  });

  // Query all tokens from factory to populate dropdown
  const { data: allTokensPage } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getTokenPage",
    args: [0n, 1000n],
  });

  const tokenOptions = useMemo(() => {
    const list = [
      { symbol: "ETH", address: "ETH", name: "Robinhood ETH" },
      { symbol: tokenSymbol.toUpperCase(), address: tokenAddress, name: tokenSymbol.toUpperCase() }
    ];
    if (allTokensPage) {
      (allTokensPage as any[]).forEach((t: any) => {
        if (t.token.toLowerCase() !== tokenAddress.toLowerCase()) {
          list.push({
            symbol: t.symbol.toUpperCase(),
            address: t.token,
            name: t.name
          });
        }
      });
    }
    return list;
  }, [allTokensPage, tokenSymbol, tokenAddress]);

  const handleSelectFrom = (val: string) => {
    setFromToken(val);
    if (val === toToken) {
      const diff = tokenOptions.find(t => t.address !== val);
      if (diff) setToToken(diff.address);
    }
  };

  const handleSelectTo = (val: string) => {
    setToToken(val);
    if (val === fromToken) {
      const diff = tokenOptions.find(t => t.address !== val);
      if (diff) setFromToken(diff.address);
    }
  };

  const isRouterNotConfigured = !dexRouterAddress || dexRouterAddress === zeroAddress;

  const isFromEth = fromToken === "ETH";
  const isToEth = toToken === "ETH";

  const swapPath = useMemo(() => {
    if (!wethAddress) return [];
    const fromAddr = isFromEth ? wethAddress : (fromToken as `0x${string}`);
    const toAddr = isToEth ? wethAddress : (toToken as `0x${string}`);
    
    if (isFromEth) {
      return [wethAddress, toAddr];
    }
    if (isToEth) {
      return [fromAddr, wethAddress];
    }
    return [fromAddr, wethAddress, toAddr];
  }, [fromToken, toToken, wethAddress, isFromEth, isToEth]);

  // Query ERC20 allowance if From is not ETH
  const { data: allowanceVal, refetch: refetchAllowance } = useReadContract({
    address: fromToken as `0x${string}`,
    abi: launchTokenAbi,
    functionName: "allowance",
    args: wallet && dexRouterAddress ? [wallet, dexRouterAddress] : undefined,
    query: { enabled: !!wallet && !!dexRouterAddress && !isFromEth },
  });

  const needsApproval = !isFromEth && allowanceVal !== undefined && (allowanceVal as bigint) < amountInParsed;

  // Query Uniswap getAmountsOut for real time swap quote
  const { data: amountsOut } = useReadContract({
    address: dexRouterAddress,
    abi: [
      {
        name: "getAmountsOut",
        type: "function",
        stateMutability: "view",
        inputs: [
          { name: "amountIn", type: "uint256" },
          { name: "path", type: "address[]" },
        ],
        outputs: [{ name: "amounts", type: "uint256[]" }],
      },
    ],
    functionName: "getAmountsOut",
    args: dexRouterAddress && amountInParsed > 0n && swapPath.length > 0 ? [amountInParsed, swapPath] : undefined,
    query: { enabled: !!dexRouterAddress && amountInParsed > 0n && swapPath.length > 0, refetchInterval: 8000 },
  });

  const quoteOut = useMemo(() => {
    if (!amountsOut) return 0n;
    const array = amountsOut as bigint[];
    return array[array.length - 1];
  }, [amountsOut]);

  // Write actions: approve and swap
  const { writeContractAsync: approveWrite } = useWriteContract();
  const { writeContractAsync: swapWrite } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [actionType, setActionType] = useState<"approve" | "swap" | "">("");

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  useEffect(() => {
    if (txHash && !isConfirming) {
      if (actionType === "approve") {
        refetchAllowance();
      } else {
        refetch();
        setAmount("");
      }
      setTxHash(undefined);
      setActionType("");
    }
  }, [txHash, isConfirming]);

  async function executeApprove() {
    if (!dexRouterAddress || fromToken === "ETH") return;
    setActionType("approve");
    const maxUint = 2n ** 256n - 1n;
    try {
      const hash = await approveWrite({
        address: fromToken as `0x${string}`,
        abi: launchTokenAbi,
        functionName: "approve",
        args: [dexRouterAddress, maxUint],
      });
      setTxHash(hash);
    } catch (err) {
      console.error("Approve failed:", err);
      setActionType("");
    }
  }

  async function executeSwap() {
    if (!dexRouterAddress || !wallet || swapPath.length === 0) return;
    setActionType("swap");
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    try {
      let hash: `0x${string}`;
      if (isFromEth) {
        hash = await swapWrite({
          address: dexRouterAddress,
          abi: [
            {
              name: "swapExactETHForTokens",
              type: "function",
              stateMutability: "payable",
              inputs: [
                { name: "amountOutMin", type: "uint256" },
                { name: "path", type: "address[]" },
                { name: "to", type: "address" },
                { name: "deadline", type: "uint256" },
              ],
              outputs: [{ type: "uint256[]" }],
            },
          ],
          functionName: "swapExactETHForTokens",
          args: [0n, swapPath, wallet, deadline],
          value: amountInParsed,
        });
      } else if (isToEth) {
        hash = await swapWrite({
          address: dexRouterAddress,
          abi: [
            {
              name: "swapExactTokensForETH",
              type: "function",
              stateMutability: "nonpayable",
              inputs: [
                { name: "amountIn", type: "uint256" },
                { name: "amountOutMin", type: "uint256" },
                { name: "path", type: "address[]" },
                { name: "to", type: "address" },
                { name: "deadline", type: "uint256" },
              ],
              outputs: [{ type: "uint256[]" }],
            },
          ],
          functionName: "swapExactTokensForETH",
          args: [amountInParsed, 0n, swapPath, wallet, deadline],
        });
      } else {
        hash = await swapWrite({
          address: dexRouterAddress,
          abi: [
            {
              name: "swapExactTokensForTokens",
              type: "function",
              stateMutability: "nonpayable",
              inputs: [
                { name: "amountIn", type: "uint256" },
                { name: "amountOutMin", type: "uint256" },
                { name: "path", type: "address[]" },
                { name: "to", type: "address" },
                { name: "deadline", type: "uint256" },
              ],
              outputs: [{ type: "uint256[]" }],
            },
          ],
          functionName: "swapExactTokensForTokens",
          args: [amountInParsed, 0n, swapPath, wallet, deadline],
        });
      }
      setTxHash(hash);
    } catch (err) {
      console.error("Swap failed:", err);
      setActionType("");
    }
  }

  // Cross-Chain Bridge States & Configs
  const bridgeChains = useMemo(() => {
    if (import.meta.env.VITE_USE_TESTNET === "true") {
      return [
        { id: 421614, name: "Arbitrum Sepolia", short: "Arbitrum" },
        { id: 84532, name: "Base Sepolia", short: "Base" },
        { id: 11155111, name: "Ethereum Sepolia", short: "Ethereum" },
      ];
    } else {
      return [
        { id: 42161, name: "Arbitrum One", short: "Arbitrum" },
        { id: 8453, name: "Base Mainnet", short: "Base" },
        { id: 1, name: "Ethereum Mainnet", short: "Ethereum" },
      ];
    }
  }, []);

  const [bridgeSource, setBridgeSource] = useState(bridgeChains[0]);
  const [bridgeAmount, setBridgeAmount] = useState("");
  const [bridgeAsset, setBridgeAsset] = useState("ETH");
  const [bridgeState, setBridgeState] = useState<"idle" | "switching" | "depositing" | "confirming" | "relaying" | "completed">("idle");
  const [bridgeProgress, setBridgeProgress] = useState(0);
  const [bridgeTxHash, setBridgeTxHash] = useState("");

  const { writeContractAsync: bridgeWrite } = useWriteContract();

  // Watch L1 deposit tx completion and poll L2 bridge contract status
  useEffect(() => {
    let interval: any;
    let checkCount = 0;
    
    if (bridgeState === "relaying" && bridgeTxHash && publicClient) {
      setBridgeProgress(10);
      
      const trackRelay = async () => {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: bridgeTxHash as `0x${string}` });
          
          let nonce: bigint | null = null;
          for (const log of receipt.logs) {
            try {
              const decoded = decodeEventLog({
                abi: bridgeGatewayAbi,
                eventName: "BridgeDeposited",
                topics: log.topics,
                data: log.data,
              }) as any;
              nonce = decoded.args.nonce;
              break;
            } catch (e) {
              // ignore
            }
          }
          
          if (nonce === null) {
            console.warn("Could not find BridgeDeposited log in L1 receipt");
            setBridgeState("idle");
            return;
          }
          
          console.log("Extracted L1 deposit nonce:", nonce.toString());
          setBridgeProgress(35);

          const l2PublicClientInstance = createPublicClient({
            chain: activeChain,
            transport: http(activeChain.rpcUrls.default.http[0]),
          });
          
          // Poll L2 BridgeGateway contract to check processedDeposits
          interval = setInterval(async () => {
            try {
              checkCount++;
              const isProcessed = await l2PublicClientInstance.readContract({
                address: L2_BRIDGE_ADDRESS,
                abi: bridgeGatewayAbi,
                functionName: "processedDeposits",
                args: [BigInt(bridgeSource.id), nonce],
              });
              
              if (isProcessed) {
                clearInterval(interval);
                setBridgeProgress(100);
                setBridgeState("completed");
              } else {
                // Fake progression up to 90% while waiting for relayer
                setBridgeProgress((prev) => Math.min(90, prev + 5));
              }
            } catch (err) {
              console.error("Error reading L2 bridge status:", err);
            }
            
            // Timeout after 3 minutes (22 checks)
            if (checkCount > 22) {
              clearInterval(interval);
              console.error("Bridge relay timeout");
              setBridgeState("idle");
            }
          }, 8000);

        } catch (err) {
          console.error("Error waiting for L1 transaction:", err);
          setBridgeState("idle");
        }
      };

      trackRelay();
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [bridgeState, bridgeTxHash, bridgeSource.id, publicClient]);

  async function executeBridge() {
    if (!wallet) return;
    if (L1_BRIDGE_ADDRESS === zeroAddress || L2_BRIDGE_ADDRESS === zeroAddress) {
      alert("Bridge contracts are not configured yet. Run node deploy_bridge.js in the indexer first!");
      return;
    }
    try {
      setBridgeState("switching");
      if (currentChain?.id !== bridgeSource.id) {
        await switchChainAsync({ chainId: bridgeSource.id });
      }

      setBridgeState("depositing");
      const parsedAmount = parseEther(bridgeAmount);
      
      const hash = await bridgeWrite({
        address: L1_BRIDGE_ADDRESS,
        abi: bridgeGatewayAbi,
        functionName: "deposit",
        args: [wallet, BigInt(activeChain.id)],
        value: parsedAmount,
      });

      setBridgeTxHash(hash);
      setBridgeState("confirming");
      
      setTimeout(() => {
        setBridgeState("relaying");
      }, 1000);

    } catch (err) {
      console.error("Bridge failed:", err);
      setBridgeState("idle");
    }
  }

  async function completeBridge() {
    try {
      setBridgeState("switching");
      await switchChainAsync({ chainId: activeChain.id });
      refetch();
      setBridgeAmount("");
      setBridgeState("idle");
      setBridgeProgress(0);
      setBridgeTxHash("");
    } catch (err) {
      console.error("Complete bridge switch failed:", err);
    }
  }


  return (
    <div className="flex flex-col gap-4 font-mono-data">
      
      {/* Tab Selectors */}
      <div className="flex gap-2 border-b border-zinc-900 pb-3">
        <button
          onClick={() => setActiveTab("swap")}
          className={`px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
            activeTab === "swap" ? "bg-pink-500/10 text-pink-400 border border-pink-500/20" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          🔀 Multi Swap
        </button>
        <button
          onClick={() => setActiveTab("bridge")}
          className={`px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
            activeTab === "bridge" ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          🌉 Cross Bridge
        </button>
      </div>

      {activeTab === "swap" ? (
        /* Swap Tab */
        <div className="flex flex-col gap-4">
          <div className="border-b border-zinc-900 pb-2.5 flex items-center justify-between">
            <span className="font-semibold text-zinc-100 flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-pulse"></span>
              Trade on Uniswap (V2)
            </span>
            <span className="text-[10px] text-zinc-500 font-bold bg-pink-500/10 text-pink-400 border border-pink-500/20 px-2 py-0.5 rounded">
              POOL ACTIVE
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {/* From Token Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-zinc-500 uppercase font-bold">From</label>
              <div className="flex gap-2">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.0"
                  inputMode="decimal"
                  className="flex-1 px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white outline-none focus:border-pink-500 text-sm"
                />
                <select
                  value={fromToken}
                  onChange={(e) => handleSelectFrom(e.target.value)}
                  className="bg-zinc-900 text-white border border-zinc-800 rounded-xl px-3 py-2 text-xs font-semibold outline-none cursor-pointer"
                >
                  {tokenOptions.map(t => (
                    <option key={t.address} value={t.address}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Swap Direction Divider */}
            <div className="flex justify-center -my-1">
              <button
                onClick={() => {
                  const temp = fromToken;
                  setFromToken(toToken);
                  setToToken(temp);
                }}
                className="w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 hover:border-pink-500 flex items-center justify-center text-xs text-zinc-400 hover:text-white cursor-pointer transition-colors"
                title="Switch Direction"
              >
                ⇅
              </button>
            </div>

            {/* To Token Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-zinc-500 uppercase font-bold">To</label>
              <div className="flex gap-2">
                <div className="flex-1 px-4 py-3 bg-zinc-950/60 border border-zinc-900 rounded-xl text-zinc-300 text-sm font-semibold flex items-center justify-between">
                  <span>
                    {amountInParsed > 0n && quoteOut > 0n
                      ? formatTokenAmount(quoteOut)
                      : "0.0"}
                  </span>
                </div>
                <select
                  value={toToken}
                  onChange={(e) => handleSelectTo(e.target.value)}
                  className="bg-zinc-900 text-white border border-zinc-800 rounded-xl px-3 py-2 text-xs font-semibold outline-none cursor-pointer"
                >
                  {tokenOptions.map(t => (
                    <option key={t.address} value={t.address}>
                      {t.symbol}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bg-zinc-900/50 rounded-xl p-3 border border-zinc-900/80 text-[10px] flex flex-col gap-1 text-zinc-400">
              <div className="flex justify-between">
                <span>Routing:</span>
                <span className="text-zinc-300 font-bold">
                  {fromToken === "ETH" ? `ETH ➔ WETH ➔ ${toToken === tokenAddress ? tokenSymbol : "Token"}` :
                   toToken === "ETH" ? `Token ➔ WETH ➔ ETH` :
                   `Token ➔ WETH ➔ Token`}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Uniswap Router:</span>
                <span className="text-zinc-500 font-mono text-[9px]">{shortAddress(dexRouterAddress)}</span>
              </div>
            </div>

            {!isConnected ? (
              <p className="text-xs text-center text-zinc-500">Connect wallet to trade.</p>
            ) : isRouterNotConfigured ? (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl p-3 text-center leading-normal">
                ⚠️ DEX Router Not Configured: The factory contract owner must set the DEX Router address before swap trading can be conducted safely.
              </div>
            ) : needsApproval ? (
              <button
                onClick={executeApprove}
                disabled={actionType === "approve" && isConfirming}
                className="w-full py-3 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold transition-all shadow-[0_0_15px_rgba(236,72,153,0.15)] cursor-pointer"
              >
                {actionType === "approve" && isConfirming ? "Approving..." : "Approve Token"}
              </button>
            ) : (
              <button
                onClick={executeSwap}
                disabled={amountInParsed === 0n || (actionType === "swap" && isConfirming)}
                className="w-full py-3 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(236,72,153,0.15)] cursor-pointer"
              >
                {actionType === "swap" && isConfirming ? "Confirming..." : "Swap Assets"}
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Bridge Tab */
        <div className="flex flex-col gap-4">
          <div className="border-b border-zinc-900 pb-2.5 flex items-center justify-between">
            <span className="font-semibold text-zinc-100 flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse"></span>
              Bridge to Robinhood Chain
            </span>
            <span className="text-[10px] text-zinc-500 font-bold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded">
              GATEWAY ONLINE
            </span>
          </div>

          {bridgeState === "idle" && (
            <div className="flex flex-col gap-3">
              {/* Source Chain Selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-zinc-500 uppercase font-bold">Source Chain</label>
                <select
                  value={bridgeSource.id}
                  onChange={(e) => {
                    const sel = bridgeChains.find(c => c.id === Number(e.target.value));
                    if (sel) setBridgeSource(sel);
                  }}
                  className="w-full bg-zinc-950 text-white border border-zinc-800 rounded-xl px-4 py-3 text-xs font-semibold outline-none cursor-pointer"
                >
                  {bridgeChains.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Destination Chain */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-zinc-500 uppercase font-bold">Destination Chain</label>
                <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-bold text-yellow-500">
                  {activeChain.name} (Chain ID: {activeChain.id})
                </div>
              </div>

              {/* Bridge Asset and Amount */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-zinc-500 uppercase font-bold">Amount to Bridge</label>
                <div className="flex gap-2">
                  <input
                    value={bridgeAmount}
                    onChange={(e) => setBridgeAmount(e.target.value)}
                    placeholder="0.0"
                    inputMode="decimal"
                    className="flex-1 px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white outline-none focus:border-yellow-500 text-sm"
                  />
                  <select
                    value={bridgeAsset}
                    onChange={(e) => setBridgeAsset(e.target.value)}
                    className="bg-zinc-900 text-white border border-zinc-800 rounded-xl px-3 py-2 text-xs font-semibold outline-none cursor-pointer"
                  >
                    <option value="ETH">ETH</option>
                    <option value="USDC">USDC</option>
                  </select>
                </div>
              </div>

              <div className="bg-zinc-900/50 rounded-xl p-3 border border-zinc-900/80 text-[10px] flex flex-col gap-1 text-zinc-400">
                <div className="flex justify-between">
                  <span>Estimated Time:</span>
                  <span className="text-zinc-300 font-bold">~1.5 minutes</span>
                </div>
                <div className="flex justify-between">
                  <span>Relayer Gas Fee:</span>
                  <span className="text-zinc-300">0.0001 ETH</span>
                </div>
              </div>

              {!isConnected ? (
                <p className="text-xs text-center text-zinc-500">Connect wallet to bridge.</p>
              ) : (
                <button
                  onClick={executeBridge}
                  disabled={!bridgeAmount}
                  className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold transition-all shadow-[0_0_15px_rgba(251,191,36,0.15)] cursor-pointer text-xs uppercase"
                >
                  Initiate Bridge Transfer
                </button>
              )}
            </div>
          )}

          {/* Bridge Processing UI */}
          {bridgeState !== "idle" && (
            <div className="flex flex-col gap-4 p-4 bg-zinc-900/40 border border-zinc-900 rounded-2xl">
              <h4 className="font-semibold text-xs text-zinc-200">🌉 Bridging {bridgeAmount} {bridgeAsset}</h4>
              
              <div className="flex flex-col gap-3 font-mono-data text-xs mt-2">
                <div className="flex items-center gap-2">
                  <span className={bridgeState === "switching" ? "animate-pulse text-yellow-500" : "text-emerald-500"}>
                    {bridgeState === "switching" ? "🟡" : "🟢"}
                  </span>
                  <span className={bridgeState === "switching" ? "text-white font-medium" : "text-zinc-500"}>
                    Switch network to {bridgeSource.short}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={bridgeState === "depositing" ? "animate-pulse text-yellow-500" : 
                                   (bridgeState === "switching" ? "⚪" : "🟢")}>
                    {bridgeState === "depositing" ? "🟡" : (bridgeState === "switching" ? "⚪" : "🟢")}
                  </span>
                  <span className={bridgeState === "depositing" ? "text-white font-medium" : 
                                   (bridgeState === "switching" ? "text-zinc-600" : "text-zinc-500")}>
                    Authorize bridge deposit tx
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className={bridgeState === "confirming" ? "animate-pulse text-yellow-500" : 
                                   (bridgeState === "switching" || bridgeState === "depositing" ? "⚪" : "🟢")}>
                    {bridgeState === "confirming" ? "🟡" : (bridgeState === "switching" || bridgeState === "depositing" ? "⚪" : "🟢")}
                  </span>
                  <span className={bridgeState === "confirming" ? "text-white font-medium" : 
                                   (bridgeState === "switching" || bridgeState === "depositing" ? "text-zinc-600" : "text-zinc-500")}>
                    Confirm transaction on source chain
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className={bridgeState === "relaying" ? "animate-pulse text-yellow-500" : 
                                     (bridgeState === "completed" ? "🟢" : "⚪")}>
                      {bridgeState === "relaying" ? "🟡" : (bridgeState === "completed" ? "🟢" : "⚪")}
                    </span>
                    <span className={bridgeState === "relaying" ? "text-white font-medium" : 
                                     (bridgeState === "completed" ? "text-zinc-500" : "text-zinc-600")}>
                      Relaying message to {activeChain.name}
                    </span>
                  </div>
                  {bridgeState === "relaying" && (
                    <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden mt-1 ml-6">
                      <div className="bg-yellow-500 h-full transition-all duration-300" style={{ width: `${bridgeProgress}%` }}></div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className={bridgeState === "completed" ? "animate-bounce text-emerald-500" : "text-zinc-600"}>
                    {bridgeState === "completed" ? "🎉" : "⚪"}
                  </span>
                  <span className={bridgeState === "completed" ? "text-emerald-400 font-bold" : "text-zinc-600"}>
                    Bridge Credited on {activeChain.name}!
                  </span>
                </div>
              </div>

              {bridgeTxHash && (
                <div className="text-[10px] text-zinc-500 mt-2 bg-zinc-950 p-2 rounded-xl border border-zinc-900 break-all select-all font-mono-data">
                  Tx Hash: {bridgeTxHash}
                </div>
              )}

              {bridgeState === "completed" && (
                <button
                  onClick={completeBridge}
                  className="w-full py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs uppercase mt-2 cursor-pointer shadow-[0_0_15px_rgba(251,191,36,0.15)]"
                >
                  Finalize & Switch back to {activeChain.name}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

