import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { TooltipProps } from 'recharts';

import { apiFetch } from '../lib/apiClient';
import { useTradesSynced } from '../lib/useTradesSynced';

type MixMode = 'asset' | 'market';

type MixSlice = {
  name: string;
  value: number;
  color: string;
};

const ASSET_COLORS = [
  '#facc15',
  '#22c55e',
  '#3b82f6',
  '#a78bfa',
  '#f97316',
  '#14b8a6',
  '#f43f5e',
  '#94a3b8',
];

const MARKET_COLORS: Record<string, string> = {
  Spot: '#facc15',
  'Futures USDT-M': '#22c55e',
  'Futures COIN-M': '#38bdf8',
  Futures: '#a78bfa',
};

function parseNum(raw: unknown): number {
  const n = Number(String(raw ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function baseAsset(pair: unknown): string {
  const raw = String(pair ?? '').trim().toUpperCase();
  if (!raw) return 'Unknown';
  const cleaned = raw.replace(/[-_]/g, '/');
  if (cleaned.includes('/')) {
    return cleaned.split('/')[0] || raw;
  }
  return raw.replace(/(USDT|USDC|BUSD|USD)$/i, '') || raw;
}

function marketLabel(accountType: unknown, marketType: unknown): string {
  const mt = String(marketType ?? '').trim().toLowerCase();
  const at = String(accountType ?? '').trim().toLowerCase();
  if (mt === 'usdm') return 'Futures USDT-M';
  if (mt === 'coinm') return 'Futures COIN-M';
  if (at === 'future' || at === 'futures' || at.startsWith('futures')) return 'Futures';
  return 'Spot';
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function MixTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as MixSlice | undefined;
  if (!row) return null;
  return (
    <div className="rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-zinc-200">{row.name}</div>
      <div className="mt-0.5 text-yellow-400">{formatUsd(row.value)}</div>
    </div>
  );
}

export function PortfolioMixWidget() {
  const [mode, setMode] = useState<MixMode>('asset');
  const [trades, setTrades] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/trades');
      if (!res.ok) {
        setTrades([]);
        return;
      }
      const raw = (await res.json()) as unknown;
      setTrades(Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : []);
    } catch {
      setTrades([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useTradesSynced(load);

  const slices = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const t of trades) {
      const notional = Math.abs(parseNum(t.entry_price) * parseNum(t.quantity));
      if (notional <= 0) continue;
      const key =
        mode === 'market'
          ? marketLabel(t.account_type, t.market_type)
          : baseAsset(t.pair);
      buckets.set(key, (buckets.get(key) ?? 0) + notional);
    }

    const ranked = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
    if (mode === 'market') {
      return ranked.map(([name, value]) => ({
        name,
        value,
        color: MARKET_COLORS[name] ?? '#94a3b8',
      }));
    }

    const top = ranked.slice(0, 6);
    const rest = ranked.slice(6);
    const out: MixSlice[] = top.map(([name, value], i) => ({
      name,
      value,
      color: ASSET_COLORS[i % ASSET_COLORS.length],
    }));
    const otherSum = rest.reduce((s, [, v]) => s + v, 0);
    if (otherSum > 0) {
      out.push({ name: 'Others', value: otherSum, color: '#52525b' });
    }
    return out;
  }, [trades, mode]);

  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2">
      <div className="flex shrink-0 justify-end gap-0.5">
        {(['asset', 'market'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              mode === key
                ? 'bg-yellow-500/15 text-yellow-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {key === 'asset' ? 'Assets' : 'Markets'}
          </button>
        ))}
      </div>

      {slices.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-zinc-500">
          No trade volume yet
        </div>
      ) : (
        <div className="flex h-[160px] min-h-[160px] w-full min-w-0 flex-1 items-center gap-3">
          <div className="h-[160px] min-w-0 flex-1">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={38}
                  outerRadius={58}
                  paddingAngle={1.5}
                  isAnimationActive={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} stroke="#0c0c0c" strokeWidth={1} />
                  ))}
                </Pie>
                <Tooltip content={(props) => <MixTooltip {...props} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="max-h-full min-w-[7.5rem] shrink-0 space-y-1.5 overflow-y-auto pr-0.5">
            {slices.map((s) => {
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              return (
                <div key={s.name} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="min-w-0 truncate text-[10px] text-zinc-400">{s.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] tabular-nums text-zinc-300">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
