export function formatEth(wei: bigint, decimals = 4): string {
  const asFloat = Number(wei) / 1e18;
  if (asFloat === 0) return "0";
  if (asFloat < 0.0001) return "<0.0001";
  return asFloat.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export function formatTokenAmount(wei: bigint, decimals = 2): string {
  const asFloat = Number(wei) / 1e18;
  if (asFloat >= 1_000_000_000) return (asFloat / 1_000_000_000).toFixed(decimals) + "B";
  if (asFloat >= 1_000_000) return (asFloat / 1_000_000).toFixed(decimals) + "M";
  if (asFloat >= 1_000) return (asFloat / 1_000).toFixed(decimals) + "K";
  return asFloat.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export function shortAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function bpsToPercent(bps: bigint | number): string {
  return (Number(bps) / 100).toString() + "%";
}

export function curveProgress(realEthReserve: bigint, graduationTarget: bigint): number {
  if (graduationTarget === 0n) return 0;
  const pct = (Number(realEthReserve) / Number(graduationTarget)) * 100;
  return Math.min(100, Math.max(0, pct));
}

export function formatAmountCompact(num: number, decimals = 1): string {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(decimals) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(decimals) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(decimals) + "K";
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
