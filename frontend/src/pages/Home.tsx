import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTokenList } from "../hooks/useTokens";
import { TokenCard } from "../components/TokenCard";
import { INDEXER_URL } from "../lib/contracts";

export function Home() {
  const { tokens, isLoading, total } = useTokenList();
  const [stats, setStats] = useState<{ totalVolumeEth: number } | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch(`${INDEXER_URL}/stats`);
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      }
    }
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="font-mono-data text-xs text-claim-500 tracking-widest uppercase">
              Live on Robinhood Chain
            </span>
            <span className="text-zinc-700">•</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
              🛡️ 100% Anti-Rug Verified
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
              🔒 Instant LP Lock
            </span>
          </div>
          <h1 className="font-display text-5xl sm:text-6xl font-semibold leading-[1.05] tracking-tight text-ash-100">
            Every token starts <span className="ember-text">on the curve.</span>
          </h1>
          <p className="mt-6 text-lg text-ash-500 leading-relaxed max-w-xl">
            No presales, zero team allocation, and 100% anti-rug protection. Trade on a fair bonding curve, get instant locked liquidity upon graduation, or gamble for quick wins in the <span className="text-amber-400 font-medium">Ember Dice Casino</span>!
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/create"
              className="px-6 py-3 rounded-full bg-ember-500 text-char-950 font-medium hover:bg-ember-300 transition-all shadow-[0_0_20px_rgba(245,158,11,0.25)] flex items-center gap-2"
            >
              <span>Launch a token</span>
              <span className="text-xs">→</span>
            </Link>
            <Link
              to="/dice"
              className="px-6 py-3 rounded-full bg-zinc-900 border border-amber-500/40 text-amber-400 font-medium hover:bg-amber-500/10 hover:border-amber-400 transition-all flex items-center gap-2"
            >
              <span>🎲 Play Ember Dice</span>
              <span className="text-xs bg-amber-500/20 text-amber-300 font-mono-data px-1.5 py-0.5 rounded">HOT</span>
            </Link>
            <span className="text-sm text-ash-600 font-mono-data">
              {total} launched so far
              {stats !== null && (
                <>
                  <span className="mx-2 text-ash-700">|</span>
                  Total Volume: <span className="text-ember-500 font-semibold">{stats.totalVolumeEth.toFixed(4)} ETH</span>
                </>
              )}
            </span>
          </div>

          {/* Feature Badges Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 pt-8 border-t border-zinc-900">
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60">
              <div className="text-emerald-400 font-bold text-sm flex items-center gap-2 mb-1">
                <span>🛡️ Anti-Rug Shield</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                0% dev allocation, 100% tokens in bonding pool, immutable non-upgradeable contract mechanics.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60">
              <div className="text-amber-400 font-bold text-sm flex items-center gap-2 mb-1">
                <span>🔒 Instant LP Lock</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                100% of DEX liquidity tokens permanently sent to burn address upon hitting 42 ETH graduation target.
              </p>
            </div>
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60">
              <div className="text-purple-400 font-bold text-sm flex items-center gap-2 mb-1">
                <span>🎲 Dice Gamble Arena</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Provably fair dice roll game with custom multipliers, instant payouts, and zero counterparty risk.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-semibold text-ash-100">Recent launches</h2>
        </div>

        {isLoading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl border border-line bg-char-800 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && tokens.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-12 text-center">
            <p className="text-ash-500">Nothing's been launched yet.</p>
            <Link to="/create" className="text-ember-500 hover:text-ember-300 font-medium">
              Be the first →
            </Link>
          </div>
        )}

        {!isLoading && tokens.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tokens.map((t, i) => (
              <TokenCard key={t.token} info={t} rank={tokens.length - i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
