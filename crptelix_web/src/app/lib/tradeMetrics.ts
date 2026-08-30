export type TradeRow = Record<string, unknown>;

export function parseNum(raw: unknown): number {
  const n = Number(String(raw ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function tradeNet(t: TradeRow): number {
  return parseNum(t.pnl) - parseNum(t.commission);
}

export function tradeDate(raw: unknown): Date | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2,
  }).format(n);
}

export function heatColor(net: number, maxAbs: number): string {
  if (maxAbs <= 0 || net === 0) return 'rgba(63, 63, 70, 0.45)';
  const t = Math.min(1, Math.abs(net) / maxAbs);
  const alpha = 0.18 + t * 0.72;
  return net > 0 ? `rgba(34, 197, 94, ${alpha})` : `rgba(239, 68, 68, ${alpha})`;
}
