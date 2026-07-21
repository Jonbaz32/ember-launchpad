import { useState, useMemo, useEffect } from "react";
import { parseEther, formatEther, zeroAddress } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useBalance,
} from "wagmi";
import { launchTokenAbi, factoryAbi } from "../lib/contracts";
import { formatTokenAmount, formatEth } from "../lib/format";
import { useFactoryAddress } from "../hooks/useFactoryAddress";

export function Swap() {
  const FACTORY_ADDRESS = useFactoryAddress();
  const [activeSubTab, setActiveSubTab] = useState<"market" | "limit" | "dca">("market");
  const [fromToken, setFromToken] = useState<string>("ETH");
  const [toToken, setToToken] = useState<string>("");
  const [amount, setAmount] = useState("");
  
  const { address: wallet, isConnected } = useAccount();

  // Get Native ETH balance
  const { data: ethBalance } = useBalance({
    address: wallet,
    query: { enabled: !!wallet, refetchInterval: 8000 }
  });

  // Fetch all factory tokens
  const { data: allTokensPage } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getTokenPage",
    args: [0n, 1000n],
  });

  // Read Uniswap dexRouter from factory
  const { data: dexRouterAddress } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "dexRouter",
  });

  // Construct options list
  const tokenOptions = useMemo(() => {
    const list = [{ symbol: "ETH", address: "ETH", name: "Robinhood ETH" }];
    if (allTokensPage) {
      (allTokensPage as any[]).forEach((t: any) => {
        list.push({
          symbol: t.symbol.toUpperCase(),
          address: t.token,
          name: t.name
        });
      });
    }
    return list;
  }, [allTokensPage]);

  // Set default To token once options load
  useEffect(() => {
    if (tokenOptions.length > 1 && !toToken) {
      setToToken(tokenOptions[1].address);
    }
  }, [tokenOptions, toToken]);

  // Fetch balances for all factory tokens for "My Positions"
  const factoryContracts = useMemo(() => {
    if (!allTokensPage || !wallet) return [];
    return (allTokensPage as any[]).map((t: any) => ({
      address: t.token,
      abi: launchTokenAbi as any,
      functionName: "balanceOf",
      args: [wallet],
    }));
  }, [allTokensPage, wallet]);

  const { data: balancesData } = useReadContracts({
    contracts: factoryContracts,
    query: { enabled: factoryContracts.length > 0, refetchInterval: 8000 },
  });

  // Compile user's active holdings positions
  const positions = useMemo(() => {
    const list: { symbol: string; name: string; balance: bigint; valueUsd: number; address: string }[] = [];
    const ethToUsd = 3000;

    if (ethBalance) {
      list.push({
        symbol: "ETH",
        name: "Robinhood ETH",
        balance: ethBalance.value,
        valueUsd: Number(formatEther(ethBalance.value)) * ethToUsd,
        address: "ETH"
      });
    }

    if (allTokensPage && balancesData) {
      (allTokensPage as any[]).forEach((t: any, idx: number) => {
        const balResult = balancesData[idx];
        if (balResult && balResult.status === "success") {
          const bal = balResult.result as bigint;
          if (bal > 0n) {
            // Simulated position value based on standard $3000 ETH rate
            list.push({
              symbol: t.symbol.toUpperCase(),
              name: t.name,
              balance: bal,
              valueUsd: Number(formatEther(bal)) * 0.0005 * ethToUsd, // Estimating index values
              address: t.token
            });
          }
        }
      });
    }
    return list;
  }, [allTokensPage, balancesData, ethBalance]);

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

  // Find balance of selected From token
  const fromTokenBalance = useMemo(() => {
    if (!wallet) return 0n;
    if (fromToken === "ETH") return ethBalance ? ethBalance.value : 0n;
    
    if (allTokensPage && balancesData) {
      const idx = (allTokensPage as any[]).findIndex((t: any) => t.token.toLowerCase() === fromToken.toLowerCase());
      if (idx !== -1 && balancesData[idx]?.status === "success") {
        return balancesData[idx].result as bigint;
      }
    }
    return 0n;
  }, [fromToken, wallet, ethBalance, allTokensPage, balancesData]);

  const amountInParsed = useMemo(() => {
    try {
      return amount ? parseEther(amount) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  // Read WETH address from router
  const { data: wethAddress } = useReadContract({
    address: dexRouterAddress as `0x${string}`,
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

  const isRouterNotConfigured = !dexRouterAddress || (dexRouterAddress as string) === zeroAddress;

  const isFromEth = fromToken === "ETH";
  const isToEth = toToken === "ETH";

  const selectedTokenAddress = isFromEth ? toToken : fromToken;

  const queryAddress = (selectedTokenAddress && selectedTokenAddress !== "ETH")
    ? (selectedTokenAddress as `0x${string}`)
    : undefined;

  const fromTokenAddress = (fromToken && fromToken !== "ETH")
    ? (fromToken as `0x${string}`)
    : undefined;

  const { data: isTokenGraduated } = useReadContract({
    address: queryAddress,
    abi: launchTokenAbi,
    functionName: "graduated",
    query: { enabled: !!queryAddress },
  });

  const graduated = queryAddress ? (isTokenGraduated !== false) : false; // Fallback to Uniswap (true) for custom ERC20s

  const { data: flatTradeFeeVal } = useReadContract({
    address: queryAddress,
    abi: launchTokenAbi,
    functionName: "flatTradeFee",
    query: { enabled: !!queryAddress && !graduated },
  });

  const flatTradeFee = (flatTradeFeeVal as bigint) || 0n;

  const buyEthIn = isFromEth && amountInParsed > flatTradeFee ? amountInParsed - flatTradeFee : 0n;

  const { data: quoteBuyData } = useReadContract({
    address: queryAddress,
    abi: launchTokenAbi,
    functionName: "quoteBuy",
    args: [buyEthIn],
    query: { enabled: !!queryAddress && isFromEth && !graduated && buyEthIn > 0n },
  });

  const { data: quoteSellData } = useReadContract({
    address: queryAddress,
    abi: launchTokenAbi,
    functionName: "quoteSell",
    args: [amountInParsed],
    query: { enabled: !!queryAddress && !isFromEth && !graduated && amountInParsed > 0n },
  });

  const swapPath = useMemo(() => {
    if (!wethAddress || !toToken) return [];
    const fromAddr = isFromEth ? wethAddress : (fromToken as `0x${string}`);
    const toAddr = isToEth ? wethAddress : (toToken as `0x${string}`);
    
    if (isFromEth) return [wethAddress, toAddr];
    if (isToEth) return [fromAddr, wethAddress];
    return [fromAddr, wethAddress, toAddr];
  }, [fromToken, toToken, wethAddress, isFromEth, isToEth]);

  // Query ERC20 allowance if From is not ETH
  const { data: allowanceVal, refetch: refetchAllowance } = useReadContract({
    address: fromTokenAddress,
    abi: launchTokenAbi,
    functionName: "allowance",
    args: wallet && dexRouterAddress ? [wallet, dexRouterAddress as `0x${string}`] : undefined,
    query: { enabled: !!wallet && !!dexRouterAddress && !!fromTokenAddress && graduated },
  });

  const needsApproval = graduated && !isFromEth && allowanceVal !== undefined && (allowanceVal as bigint) < amountInParsed;

  // Query Uniswap getAmountsOut for swap quote
  const { data: amountsOut } = useReadContract({
    address: dexRouterAddress as `0x${string}`,
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
    query: { enabled: !!dexRouterAddress && amountInParsed > 0n && swapPath.length > 0 && graduated, refetchInterval: 8000 },
  });

  const quoteOut = useMemo(() => {
    if (amountInParsed === 0n) return 0n;
    if (!graduated) {
      if (isFromEth) {
        return quoteBuyData ? (quoteBuyData as [bigint, bigint])[0] : 0n;
      } else {
        const sellOutRaw = quoteSellData ? (quoteSellData as [bigint, bigint])[0] : 0n;
        return sellOutRaw > flatTradeFee ? sellOutRaw - flatTradeFee : 0n;
      }
    }
    if (!amountsOut) return 0n;
    const array = amountsOut as bigint[];
    return array[array.length - 1];
  }, [amountInParsed, graduated, isFromEth, quoteBuyData, quoteSellData, amountsOut, flatTradeFee]);

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
        args: [dexRouterAddress as `0x${string}`, maxUint],
      });
      setTxHash(hash);
    } catch (err) {
      console.error("Approve failed:", err);
      setActionType("");
    }
  }

  async function executeSwap() {
    if (!wallet) return;
    setActionType("swap");

    try {
      let hash: `0x${string}`;

      if (!graduated) {
        // Direct bonding curve swap with 1.0% max slippage protection
        if (isFromEth) {
          const rawQuoteOut = quoteBuyData ? (quoteBuyData as [bigint, bigint])[0] : 0n;
          const minTokensOut = rawQuoteOut > 0n ? (rawQuoteOut * 99n) / 100n : 0n;
          hash = await swapWrite({
            address: selectedTokenAddress as `0x${string}`,
            abi: launchTokenAbi,
            functionName: "buy",
            args: [minTokensOut],
            value: amountInParsed,
          });
        } else {
          const rawQuoteEthOut = quoteSellData ? (quoteSellData as [bigint, bigint])[1] : 0n;
          const minEthOut = rawQuoteEthOut > 0n ? (rawQuoteEthOut * 99n) / 100n : 0n;
          hash = await swapWrite({
            address: selectedTokenAddress as `0x${string}`,
            abi: launchTokenAbi,
            functionName: "sell",
            args: [amountInParsed, minEthOut],
          });
        }
      } else {
        // Uniswap Router swap
        if (!dexRouterAddress || swapPath.length === 0) return;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

        if (isFromEth) {
          hash = await swapWrite({
            address: dexRouterAddress as `0x${string}`,
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
            address: dexRouterAddress as `0x${string}`,
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
            address: dexRouterAddress as `0x${string}`,
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
      }
      setTxHash(hash);
    } catch (err) {
      console.error("Swap failed:", err);
      setActionType("");
    }
  }

  return (
    <div className="max-w-md mx-auto bg-black border border-zinc-900 rounded-3xl p-5 shadow-2xl flex flex-col gap-6 relative pb-20 select-none">
      
      {/* 1. Header Navigation Tabs */}
      <div className="flex items-center justify-between text-zinc-400 font-bold border-b border-zinc-900 pb-3">
        <div className="flex gap-4 text-sm">
          <span className="text-white cursor-pointer border-b-2 border-yellow-500 pb-3 -mb-3.5">Swap</span>
          <span className="hover:text-white cursor-not-allowed">Advanced</span>
          <span className="hover:text-white cursor-not-allowed">Bridge</span>
        </div>
        <div className="flex items-center gap-3 text-zinc-500 text-xs">
          <span>📋</span>
          <span>⚙️</span>
        </div>
      </div>

      {/* 2. Sub-selectors (Market, Limit, DCA) */}
      <div className="flex bg-zinc-900/60 p-1 rounded-xl gap-1 border border-zinc-900/80 font-bold text-xs max-w-fit">
        <button
          onClick={() => setActiveSubTab("market")}
          className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
            activeSubTab === "market" ? "bg-zinc-800 text-white shadow" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Market
        </button>
        <button
          onClick={() => setActiveSubTab("limit")}
          className={`px-3 py-1.5 rounded-lg transition-colors cursor-not-allowed text-zinc-600`}
        >
          Limit
        </button>
        <button
          onClick={() => setActiveSubTab("dca")}
          className={`px-3 py-1.5 rounded-lg transition-colors cursor-not-allowed text-zinc-600`}
        >
          DCA
        </button>
      </div>

      {/* Balance display */}
      <div className="flex justify-between items-center text-xs text-zinc-500 font-mono-data px-1 -mb-3">
        <span>Balance: {isFromEth ? formatEth(fromTokenBalance) : formatTokenAmount(fromTokenBalance)}</span>
        <button
          onClick={() => {
            if (fromTokenBalance > 0n) {
              setAmount(formatEther(fromTokenBalance));
            }
          }}
          className="text-yellow-500 hover:text-yellow-400 font-bold cursor-pointer"
        >
          Max
        </button>
      </div>

      {/* 3. Swap Cards */}
      <div className="flex flex-col gap-1 relative">
        {/* From Card */}
        <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 flex flex-col gap-2">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-yellow-500 text-black flex items-center justify-center font-bold text-[10px]">
                {fromToken === "ETH" ? "Ξ" : tokenOptions.find(t => t.address === fromToken)?.symbol.slice(0, 1)}
              </div>
              <select
                value={fromToken}
                onChange={(e) => handleSelectFrom(e.target.value)}
                className="bg-transparent text-white font-bold text-lg outline-none cursor-pointer"
              >
                {tokenOptions.map(t => (
                  <option key={t.address} value={t.address}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="bg-transparent text-right text-white font-mono-data font-bold text-2xl outline-none w-1/2 placeholder-zinc-700"
            />
          </div>
        </div>

        {/* Circular Direction Toggle Switch */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <button
            onClick={() => {
              const temp = fromToken;
              setFromToken(toToken);
              setToToken(temp);
            }}
            className="w-8 h-8 rounded-full bg-zinc-950 border border-zinc-800 hover:border-yellow-500 flex items-center justify-center text-sm text-zinc-300 hover:text-white cursor-pointer transition-colors shadow-lg"
          >
            ⇅
          </button>
        </div>

        {/* To Card */}
        <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-4 flex flex-col gap-2 mt-0.5">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-yellow-500 text-black flex items-center justify-center font-bold text-[10px]">
                {toToken === "ETH" ? "Ξ" : tokenOptions.find(t => t.address === toToken)?.symbol.slice(0, 1) || "T"}
              </div>
              <select
                value={toToken}
                onChange={(e) => handleSelectTo(e.target.value)}
                className="bg-transparent text-white font-bold text-lg outline-none cursor-pointer"
              >
                {tokenOptions.map(t => (
                  <option key={t.address} value={t.address}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-right text-zinc-300 font-mono-data font-bold text-2xl w-1/2">
              {amountInParsed > 0n && quoteOut > 0n ? (isToEth ? formatEth(quoteOut) : formatTokenAmount(quoteOut)) : "0.0"}
            </div>
          </div>
        </div>


      </div>

      {/* 4. Action Swap Button */}
      {!isConnected ? (
        <p className="text-xs text-center text-zinc-500">Connect wallet to perform DEX swaps.</p>
      ) : isRouterNotConfigured ? (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl p-3 text-center leading-normal">
          ⚠️ DEX Router Not Configured: The factory contract owner must set the DEX Router address before swap trading can be conducted safely.
        </div>
      ) : needsApproval ? (
        <button
          onClick={executeApprove}
          disabled={actionType === "approve" && isConfirming}
          className="w-full py-3.5 rounded-2xl bg-lime-500 hover:bg-lime-400 text-black font-bold text-sm transition-all shadow-[0_0_20px_rgba(132,204,22,0.2)] cursor-pointer text-center select-none"
        >
          {actionType === "approve" && isConfirming ? "Approving Spender..." : "Approve Token"}
        </button>
      ) : (
        <button
          onClick={executeSwap}
          disabled={
            amountInParsed === 0n ||
            (actionType === "swap" && isConfirming) ||
            (!graduated && isFromEth && amountInParsed <= flatTradeFee) ||
            (!graduated && !isFromEth && amountInParsed > 0n && quoteOut === 0n)
          }
          className="w-full py-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-yellow-500 text-white font-bold text-sm transition-all disabled:opacity-50 cursor-pointer text-center select-none"
        >
          {actionType === "swap" && isConfirming
            ? "Executing Swap..."
            : !graduated && isFromEth && amountInParsed > 0n && amountInParsed <= flatTradeFee
            ? "Input must exceed Flat Fee"
            : !graduated && !isFromEth && amountInParsed > 0n && quoteOut === 0n
            ? "Output too low for Flat Fee"
            : "Swap"}
        </button>
      )}

      {/* 5. Positions Portfolio List */}
      <div className="flex flex-col gap-3 mt-2 border-t border-zinc-900 pt-4">
        <div className="flex justify-between items-center font-bold text-zinc-400 text-xs">
          <div className="flex gap-4">
            <span className="text-white border-b border-yellow-500 pb-1">My positions</span>
            <span className="hover:text-white cursor-not-allowed">Open orders (0)</span>
          </div>
          <span>🔍</span>
        </div>

        <div className="flex flex-col gap-2 font-mono-data text-xs mt-1">
          {positions.length === 0 ? (
            <p className="text-zinc-600 text-center py-4">No positions detected in wallet.</p>
          ) : (
            positions.map((pos) => (
              <div
                key={pos.address}
                className="flex items-center justify-between p-3 bg-zinc-900/25 border border-zinc-900/60 rounded-xl hover:border-zinc-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-yellow-500 text-black flex items-center justify-center font-bold text-xs">
                    {pos.symbol.slice(0, 1)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-xs">{pos.name}</h4>
                    <span className="text-[10px] text-zinc-500">
                      {formatTokenAmount(pos.balance)} {pos.symbol}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-bold text-white">${pos.valueUsd.toFixed(2)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 6. Sticky footer representation (OKX DEX app footer mockup) */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/95 backdrop-blur border-t border-zinc-900 py-2.5 px-6 flex justify-between text-[9px] text-zinc-500 font-bold rounded-b-3xl">
        <div className="flex flex-col items-center gap-1 cursor-not-allowed">
          <span>💼</span>
          <span>OKX</span>
        </div>
        <div className="flex flex-col items-center gap-1 cursor-not-allowed">
          <span>🧭</span>
          <span>Explore</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-lime-500 cursor-pointer">
          <div className="w-7 h-7 rounded-full bg-lime-500 text-black flex items-center justify-center text-xs shadow-[0_0_15px_rgba(132,204,22,0.35)] -mt-4">
            ⇅
          </div>
          <span>DEX</span>
        </div>
        <div className="flex flex-col items-center gap-1 cursor-not-allowed">
          <span>📈</span>
          <span>DeFi</span>
        </div>
        <div className="flex flex-col items-center gap-1 cursor-not-allowed">
          <span>🚀</span>
          <span>Boost</span>
        </div>
      </div>
    </div>
  );
}
