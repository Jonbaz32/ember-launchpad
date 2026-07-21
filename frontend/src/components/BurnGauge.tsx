import { useMemo } from "react";

const SIZE = 220;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export function BurnGauge({
  fractionOfBalance,
  claimableEth,
}: {
  /** 0..1 — how much of the creator's current balance the slider is set to burn */
  fractionOfBalance: number;
  /** live-formatted ETH string to show in the center, e.g. "0.842" */
  claimableEth: string;
}) {
  const dashOffset = useMemo(() => CIRC * (1 - Math.min(1, Math.max(0, fractionOfBalance))), [
    fractionOfBalance,
  ]);

  return (
    <div className="relative w-[220px] h-[220px] shrink-0">
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--color-char-700)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="url(#burn-gauge-grad)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 200ms ease-out" }}
        />
        <defs>
          <linearGradient id="burn-gauge-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-gold-400)" />
            <stop offset="100%" stopColor="var(--color-ember-600)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] font-mono-data text-ash-600 uppercase tracking-wide">
          claim preview
        </span>
        <span className="font-display text-3xl font-semibold text-ash-100 mt-1">
          {claimableEth}
        </span>
        <span className="text-xs font-mono-data text-ash-600">ETH</span>
      </div>
    </div>
  );
}
