import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { ConnectButton } from "./ConnectButton";
import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { activeChain } from "../lib/wagmi";
import { factoryAbi } from "../lib/contracts";
import { useFactoryAddress } from "../hooks/useFactoryAddress";
import { RugDetector } from "./RugDetector";

export function Layout() {
  const FACTORY_ADDRESS = useFactoryAddress();
  const [searchQuery, setSearchQuery] = useState("");
  const [auditModalAddr, setAuditModalAddr] = useState<string | null>(null);
  const { isConnected, chain } = useAccount();
  const [showSocials, setShowSocials] = useState(false);
  const navigate = useNavigate();

  const isWrongChain = isConnected && chain && chain.id !== activeChain.id;

  // Read all tokens from factory to enable name/symbol searching
  const { data: allTokensPage } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getTokenPage",
    args: [0n, 1000n],
  });

  return (
    <div className="min-h-screen flex flex-col bg-black text-zinc-300">
      {/* Top Wrong Chain Banner if connected to wrong chain */}
      {isWrongChain && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-500 text-xs text-center py-2 px-4 font-medium flex items-center justify-center gap-2">
          <span>⚠️ Connected to the wrong network. Please switch to the {activeChain.name}.</span>
        </div>
      )}

      <header className="border-b border-zinc-900 bg-black/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo Section */}
          <Link to="/" className="flex flex-col group shrink-0">
            <div className="flex items-center gap-2">
              <EmberMark className="w-5 h-5" />
              <span className="font-display text-lg font-bold tracking-tight text-white group-hover:text-yellow-400 transition-colors">
                Ember Fun
              </span>
            </div>
            <span className="text-[9px] text-zinc-500 font-bold tracking-widest mt-0.5 uppercase leading-none">
              LAUNCH. TRADE. EARN.
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive
                  ? "text-yellow-500 font-semibold"
                  : "hover:text-white transition-colors"
              }
            >
              Discover
            </NavLink>
            <NavLink
              to="/swap"
              className={({ isActive }) =>
                isActive
                  ? "text-yellow-500 font-semibold"
                  : "hover:text-white transition-colors"
              }
            >
              Swap
            </NavLink>
            <NavLink
              to="/bridge"
              className={({ isActive }) =>
                isActive
                  ? "text-emerald-400 font-semibold flex items-center gap-1"
                  : "hover:text-emerald-300 transition-colors flex items-center gap-1"
              }
            >
              <span>Bridge</span>
              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1 py-0.2 rounded border border-emerald-500/30">
                DeBank
              </span>
            </NavLink>
            <NavLink
              to="/create"
              className={({ isActive }) =>
                isActive
                  ? "text-yellow-500 font-semibold"
                  : "hover:text-white transition-colors"
              }
            >
              Launch
            </NavLink>
            <NavLink
              to="/dice"
              className={({ isActive }) =>
                isActive
                  ? "text-amber-400 font-semibold flex items-center gap-1.5"
                  : "hover:text-amber-300 transition-colors flex items-center gap-1.5"
              }
            >
              <span>🎲 Dice Game</span>
              <span className="text-[9px] bg-gradient-to-r from-amber-500 to-yellow-400 text-char-950 font-extrabold px-1.5 py-0.2 rounded-full uppercase">
                HOT
              </span>
            </NavLink>
            <span className="text-zinc-700">|</span>
            <NavLink
              to="/portfolio"
              className={({ isActive }) =>
                isActive
                  ? "text-yellow-500 font-semibold"
                  : "hover:text-white transition-colors"
              }
            >
              Portfolio
            </NavLink>
            <div className="relative">
              <button
                onClick={() => setShowSocials(!showSocials)}
                className="hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
              >
                Socials
                <span className="text-[10px] text-zinc-500">▼</span>
              </button>
              {showSocials && (
                <div className="absolute left-0 mt-2 w-32 bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl py-1 z-50">
                  <a
                    href="https://x.com"
                    target="_blank"
                    rel="noreferrer"
                    className="block px-4 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors"
                  >
                    Twitter
                  </a>
                  <a
                    href="https://telegram.org"
                    target="_blank"
                    rel="noreferrer"
                    className="block px-4 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white transition-colors"
                  >
                    Telegram
                  </a>
                </div>
              )}
            </div>
          </nav>

          {/* Search and Wallet Section */}
          <div className="flex items-center gap-3 flex-1 md:flex-initial justify-end">
            <div className="relative hidden sm:block w-48 md:w-72">
              <input
                type="text"
                placeholder="Search contract address (0x...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    const q = searchQuery.trim();
                    if (/^0x[a-fA-F0-9]{40}$/.test(q)) {
                      setAuditModalAddr(q);
                      setSearchQuery("");
                    } else if (allTokensPage) {
                      const match = (allTokensPage as any[]).find(
                        (t: any) =>
                          t.symbol.toLowerCase() === q.toLowerCase() ||
                          t.name.toLowerCase().includes(q.toLowerCase())
                      );
                      if (match) {
                        navigate(`/token/${match.token}`);
                        setSearchQuery("");
                      }
                    }
                  }
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-full pl-4 pr-16 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-all font-mono-data"
              />
              {/^0x[a-fA-F0-9]{40}$/.test(searchQuery.trim()) ? (
                <button
                  onClick={() => {
                    setAuditModalAddr(searchQuery.trim());
                    setSearchQuery("");
                  }}
                  className="absolute right-1.5 top-1 font-mono-data text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 transition-all cursor-pointer"
                  title="Audit contract for Rug pull risks"
                >
                  🛡️ Audit
                </button>
              ) : (
                <span className="absolute right-3 top-2 text-[10px] text-zinc-600 font-mono-data">
                  ⏎
                </span>
              )}
            </div>

            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Network notice banner below header */}
      <div className="bg-zinc-950/80 border-b border-zinc-900 py-1.5 text-[11px] text-center text-zinc-500 px-4">
        Independent interface for Robinhood Chain (chain id {activeChain.id}). Not affiliated with Robinhood Markets, Inc.
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-zinc-900 bg-zinc-950/20 mt-24">
        <div className="max-w-7xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-zinc-500">
          <p className="max-w-md leading-relaxed">
            Ember is a fair-launch token protocol on Robinhood Chain. Every token starts on a
            bonding curve — no presale, no team allocation. Trading involves risk; tokens created
            here are not vetted or endorsed by Ember or Robinhood.
          </p>
          <div className="flex gap-4 font-mono-data">
            <a
              href="https://robinhoodchain.blockscout.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-yellow-500 transition-colors"
            >
              Explorer ↗
            </a>
            <a
              href="https://docs.robinhood.com/chain"
              target="_blank"
              rel="noreferrer"
              className="hover:text-yellow-500 transition-colors"
            >
              Robinhood Chain docs ↗
            </a>
          </div>
        </div>
      </footer>
      {/* Rug Detector Modal when searching contract address */}
      {auditModalAddr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setAuditModalAddr(null)}
        >
          <div
            className="w-full max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <RugDetector targetAddress={auditModalAddr} onClose={() => setAuditModalAddr(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

export function EmberMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path
        d="M16 2C16 2 8 10.5 8 18a8 8 0 0 0 16 0c0-3.5-2-6-3.5-8 .3 2-1 3.5-2.2 3.5C17 13.5 18 8 16 2Z"
        fill="url(#ember-grad)"
      />
      <defs>
        <linearGradient id="ember-grad" x1="8" y1="2" x2="24" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fbbf24" />
          <stop offset="0.5" stopColor="#d97706" />
          <stop offset="1" stopColor="#78350f" />
        </linearGradient>
      </defs>
    </svg>
  );
}
