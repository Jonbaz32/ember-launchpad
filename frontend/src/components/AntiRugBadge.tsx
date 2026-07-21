import { useState } from "react";

export function AntiRugBadge({
  tokenAddress,
  symbol,
  creator,
  compact = false,
}: {
  tokenAddress?: string;
  symbol?: string;
  creator?: string;
  compact?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(true);
        }}
        className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-400 transition-all cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.15)] ${
          compact ? "text-[10px] py-0.5 px-2" : ""
        }`}
        title="Click to view Anti-Rug Security Scorecard"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <svg
          className="w-3.5 h-3.5 text-emerald-400 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <span>Anti-Rug 100%</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-emerald-500/30 bg-zinc-950 p-6 shadow-2xl text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-white">
                    Anti-Rug Security Scorecard
                  </h3>
                  <p className="text-xs text-emerald-400 font-mono-data">
                    {symbol ? `$${symbol} • ` : ""}100 / 100 SECURITY RATING (PASS)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-500 hover:text-white text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Scorecard checklist */}
            <div className="space-y-3 font-sans text-xs">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-emerald-400 text-sm font-bold">✓</span>
                <div>
                  <div className="font-semibold text-white">0% Team Allocation / No Presale</div>
                  <div className="text-zinc-400 mt-0.5">
                    100% of supply (1,000,000,000 tokens) was deposited into the fair-launch bonding curve contract at creation.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-emerald-400 text-sm font-bold">✓</span>
                <div>
                  <div className="font-semibold text-white">Instant DEX LP Token Burn</div>
                  <div className="text-zinc-400 mt-0.5">
                    Upon reaching 42 ETH graduation, 100% of DEX liquidity tokens are transferred to address(0). Dev cannot pull liquidity.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-emerald-400 text-sm font-bold">✓</span>
                <div>
                  <div className="font-semibold text-white">No Mint / Non-Upgradeable Contract</div>
                  <div className="text-zinc-400 mt-0.5">
                    The token supply is capped forever at 1B. There is no mint function, no blacklist, and no admin freeze controls.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                <span className="text-emerald-400 text-sm font-bold">✓</span>
                <div>
                  <div className="font-semibold text-white">Fair Burn-to-Claim Fee Model</div>
                  <div className="text-zinc-400 mt-0.5">
                    Creators cannot drain fee reserves. Creators can only claim fees by burning an exact percentage of live token supply.
                  </div>
                </div>
              </div>
            </div>

            {tokenAddress && (
              <div className="mt-4 pt-3 border-t border-zinc-900 text-[10px] text-zinc-500 font-mono-data flex justify-between items-center">
                <span>
                  Contract: {tokenAddress.slice(0, 8)}...{tokenAddress.slice(-6)}
                  {creator ? ` • Dev: ${creator.slice(0, 6)}...` : ""}
                </span>
                <a
                  href={`https://robinhoodchain.blockscout.com/address/${tokenAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline"
                >
                  Verify Code ↗
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
