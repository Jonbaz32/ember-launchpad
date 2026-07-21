import { useState, useEffect, useRef } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { shortAddress } from "../lib/format";
import { activeChain } from "../lib/wagmi";

export function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const isWrongChain = isConnected && chain && chain.id !== activeChain.id;

  // Auto-prompt to switch network if wrong chain is connected
  useEffect(() => {
    if (isConnected && chain && chain.id !== activeChain.id) {
      try {
        switchChain({ chainId: activeChain.id });
      } catch (err) {
        console.error("Failed to automatically switch chain:", err);
      }
    }
  }, [isConnected, chain, switchChain]);

  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setShowConnectModal(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 relative" ref={dropdownRef}>
        {isWrongChain && (
          <button
            onClick={() => switchChain({ chainId: activeChain.id })}
            className="text-xs bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-3 py-1.5 rounded-full hover:bg-yellow-500/20 transition-all font-medium flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
            Switch to {activeChain.name}
          </button>
        )}

        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="font-mono text-sm px-4 py-2 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-100 hover:border-yellow-500 transition-colors flex items-center gap-2 cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          {shortAddress(address)}
        </button>

        {showDropdown && (
          <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-950 border border-zinc-800 rounded-xl shadow-xl py-1.5 z-50">
            <button
              onClick={() => {
                disconnect();
                setShowDropdown(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              Disconnect Wallet
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          if (connectors.length > 1) {
            setShowConnectModal(true);
          } else if (connectors[0]) {
            connect({ connector: connectors[0] });
          }
        }}
        disabled={isPending || connectors.length === 0}
        className="text-sm font-semibold px-5 py-2 rounded-full bg-yellow-500 text-black hover:bg-yellow-400 transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-[0_0_15px_rgba(251,191,36,0.15)] cursor-pointer"
      >
        {isPending ? (
          <>
            <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
            Connecting…
          </>
        ) : (
          "Connect Wallet"
        )}
      </button>

      {showConnectModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div
            ref={modalRef}
            className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-lg text-zinc-100">Connect Wallet</h3>
              <button
                onClick={() => setShowConnectModal(false)}
                className="text-zinc-500 hover:text-zinc-300 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => {
                    connect({ connector });
                    setShowConnectModal(false);
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-yellow-500 text-zinc-200 font-medium transition-all text-left flex items-center justify-between group cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    {connector.icon && (
                      <img
                        src={connector.icon}
                        alt={connector.name}
                        className="w-6 h-6 rounded-md"
                      />
                    )}
                    {connector.name}
                  </span>
                  <span className="text-xs text-zinc-500 group-hover:text-yellow-500 transition-colors">
                    Detecting
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
