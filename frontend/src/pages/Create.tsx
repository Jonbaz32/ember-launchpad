import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseEther, decodeEventLog, formatEther } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useReadContract } from "wagmi";
import { factoryAbi } from "../lib/contracts";
import { useFactoryAddress } from "../hooks/useFactoryAddress";

export function Create() {
  const FACTORY_ADDRESS = useFactoryAddress();
  const navigate = useNavigate();
  const { isConnected } = useAccount();
  const publicClient = usePublicClient();

  const { data: creationFee } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "tokenCreationFee",
  });

  const { data: flatTradeFee } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "flatTradeFee",
  });

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [initialBuyEth, setInitialBuyEth] = useState("0.1");
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  function buildMetadataURI(): string {
    const metadata = { name, symbol, description, image: imageUrl || undefined };
    const json = JSON.stringify(metadata);
    return `data:application/json;base64,${btoa(json)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !symbol.trim()) {
      setError("Name and symbol are required.");
      return;
    }
    if (symbol.length > 11) {
      setError("Symbol should be 11 characters or fewer.");
      return;
    }

    try {
      const buyVal = initialBuyEth ? parseEther(initialBuyEth) : 0n;
      const flatFeeVal = (flatTradeFee as bigint) || 0n;
      if (buyVal > 0n && buyVal <= flatFeeVal) {
        setError(`Your initial buy must exceed the flat trade fee of ${formatEther(flatFeeVal)} ETH.`);
        return;
      }
      const feeVal = (creationFee as bigint) || 0n;
      const totalValue = buyVal + feeVal;

      const hash = await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: factoryAbi,
        functionName: "createToken",
        args: [name.trim(), symbol.trim().toUpperCase(), buildMetadataURI(), 0n],
        value: totalValue,
      });
      setTxHash(hash);

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({ abi: factoryAbi, ...log });
            if (decoded.eventName === "TokenCreated") {
              const tokenAddr = (decoded.args as unknown as { token: `0x${string}` }).token;
              navigate(`/token/${tokenAddr}`);
              return;
            }
          } catch {
            // not the event we're looking for, keep scanning
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transaction failed.";
      setError(message);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-ash-100 mb-2">Launch a token</h1>
      <p className="text-ash-500 mb-10 leading-relaxed">
        Deploys instantly with the full supply seeded onto a bonding curve — no pre-allocation
        for you as the creator. If you want to hold some supply, buy it like anyone else with
        the optional first buy below.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ember Cat"
            maxLength={40}
            className={inputClass}
          />
        </Field>

        <Field label="Symbol">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="EMBERCAT"
            maxLength={11}
            className={inputClass + " font-mono-data uppercase"}
          />
        </Field>

        <Field label="Description" optional>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this token about?"
            rows={3}
            className={inputClass + " resize-none"}
          />
        </Field>

        <Field label="Image URL" optional>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className={inputClass}
          />
        </Field>

        <Field label="Your first buy (ETH)" optional>
          <input
            value={initialBuyEth}
            onChange={(e) => setInitialBuyEth(e.target.value)}
            placeholder="0.1"
            inputMode="decimal"
            className={inputClass + " font-mono-data"}
          />
          <p className="text-xs text-ash-600 mt-1.5">
            Optional. Executes as a normal curve buy in the same transaction.
          </p>
        </Field>

        {/* Anti-Rug & Instant LP Guarantee Banner */}
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-xs space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <span>🛡️ 100% Anti-Rug Protection Guaranteed</span>
          </div>
          <p className="text-zinc-400 leading-relaxed">
            Your token deploys with <strong className="text-zinc-200">100% fair launch parameters</strong>: 0% team allocation, no presale, and immutable contracts.
          </p>
          <div className="flex items-center gap-2 text-amber-400 font-medium pt-1 border-t border-emerald-500/20">
            <span>🔒 Instant Locked Liquidity:</span>
            <span className="text-zinc-300">100% DEX LP burned on 42 ETH graduation</span>
          </div>
        </div>

        {error && <p className="text-sm text-ember-300">{error}</p>}

        {!isConnected ? (
          <p className="text-sm text-ash-600">Connect your wallet to launch a token.</p>
        ) : (
          <button
            type="submit"
            disabled={isPending || isConfirming}
            className="px-6 py-3 rounded-full bg-ember-500 text-char-950 font-semibold hover:bg-amber-400 transition-all shadow-[0_0_20px_rgba(245,158,11,0.25)] disabled:opacity-50 cursor-pointer"
          >
            {isPending ? "Confirm in wallet…" : isConfirming ? "Launching…" : "Launch token (100% Anti-Rug)"}
          </button>
        )}
      </form>
    </div>
  );
}

const inputClass =
  "w-full px-4 py-2.5 rounded-lg bg-char-800 border border-line text-ash-100 placeholder:text-ash-600 focus:border-ember-500 transition-colors outline-none";

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ash-300">
        {label}
        {optional && <span className="text-ash-600 font-normal"> · optional</span>}
      </span>
      {children}
    </label>
  );
}
