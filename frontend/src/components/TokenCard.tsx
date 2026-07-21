import { Link } from "react-router-dom";
import type { TokenInfo } from "../hooks/useTokens";
import { shortAddress } from "../lib/format";
import { AntiRugBadge } from "./AntiRugBadge";

function timeAgo(unixSeconds: bigint): string {
  const seconds = Math.max(0, Date.now() / 1000 - Number(unixSeconds));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function TokenCard({ info, rank }: { info: TokenInfo; rank: number }) {
  return (
    <Link
      to={`/token/${info.token}`}
      className="group relative flex flex-col gap-3 p-5 rounded-2xl border border-line bg-char-800 hover:border-ember-500/60 hover:-translate-y-0.5 transition-all shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-display font-semibold text-char-950 shrink-0 shadow-inner"
            style={{
              background: `linear-gradient(135deg, var(--color-gold-400), var(--color-ember-600))`,
            }}
          >
            {info.symbol.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-ash-100 truncate group-hover:text-amber-400 transition-colors">
              {info.name}
            </h3>
            <p className="text-xs text-ash-600 font-mono-data">${info.symbol}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-mono-data text-ash-600 shrink-0">
            #{rank}
          </span>
          <AntiRugBadge tokenAddress={info.token} symbol={info.symbol} creator={info.creator} compact />
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono-data pt-2 border-t border-line/60">
        <div className="flex items-center gap-1.5 text-emerald-400 text-[10px]">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Instant LP Lock</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <span>by {shortAddress(info.creator)}</span>
          <span>•</span>
          <span>{timeAgo(info.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

