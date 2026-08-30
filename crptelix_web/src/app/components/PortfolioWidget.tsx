import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { apiFetch } from '../lib/apiClient';
import { useTradesSynced } from '../lib/useTradesSynced';

type MixSlice = {
  name: string;
  value: number;
  color: string;
};

type PortfolioAsset = {
  asset: string;
  amount?: string;
  value_usdt: number;
};

type HistoryPoint = {
  date: string;
  total_usdt: number;
};

type BinancePortfolioPayload = {
  exchange_name: string;
  total_usdt: number;
  assets: PortfolioAsset[];
  captured_at: string | null;
  history: HistoryPoint[];
};

type CredentialsStatus = {
  binance_connected?: boolean;
};

type TimePeriod = '7d' | '1m' | '3m' | '1y' | 'All';

const KNOWN_ASSET_COLORS: Record<string, string> = {
  BTC: '#f7931a',
  ETH: '#627eea',
  SOL: '#00d4aa',
  USDT: '#26a17b',
  USDC: '#2775ca',
  BNB: '#f3ba2f',
};

const FALLBACK_COLORS = [
  '#facc15',
  '#22c55e',
  '#3b82f6',
  '#a78bfa',
  '#f97316',
  '#14b8a6',
  '#f43f5e',
  '#94a3b8',
];

const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '11px',
} as const;

const DUST_USDT = 0.01;
const TOP_SLICES = 7;
const PERIODS: TimePeriod[] = ['7d', '1m', '3m', '1y', 'All'];
const PERIOD_DAYS: Record<Exclude<TimePeriod, 'All'>, number> = {
  '7d': 7,
  '1m': 30,
  '3m': 90,
  '1y': 365,
};

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n >= 100 ? 0 : 2,
  }).format(n);
}

function formatCapturedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAxisDate(iso: string): string {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return iso;
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function colorForAsset(name: string, index: number): string {
  return KNOWN_ASSET_COLORS[name] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function PieSliceLabel({
  cx,
  cy,
  midAngle,
  outerRadius,
  percent,
  fill,
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  percent?: number;
  fill?: string;
}) {
  if (percent == null || percent < 0.04) return null;
  const radian = Math.PI / 180;
  const radius = (outerRadius ?? 0) + 16;
  const x = (cx ?? 0) + radius * Math.cos(-(midAngle ?? 0) * radian);
  const y = (cy ?? 0) + radius * Math.sin(-(midAngle ?? 0) * radian);
  return (
    <text
      x={x}
      y={y}
      fill={fill}
      textAnchor={x > (cx ?? 0) ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={10}
    >
      {(percent * 100).toFixed(1)}%
    </text>
  );
}

function slicesFromAssets(assets: PortfolioAsset[]): MixSlice[] {
  const ranked = assets
    .filter((a) => a.value_usdt >= DUST_USDT)
    .sort((a, b) => b.value_usdt - a.value_usdt);

  const top = ranked.slice(0, TOP_SLICES);
  const rest = ranked.slice(TOP_SLICES);
  const out: MixSlice[] = top.map((a, i) => ({
    name: a.asset,
    value: a.value_usdt,
    color: colorForAsset(a.asset, i),
  }));
  const otherSum = rest.reduce((s, a) => s + a.value_usdt, 0);
  if (otherSum > 0) {
    out.push({ name: 'Others', value: otherSum, color: '#6b7280' });
  }
  return out;
}

function filterHistory(history: HistoryPoint[], period: TimePeriod): HistoryPoint[] {
  if (period === 'All') return history;
  const days = PERIOD_DAYS[period];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return history.filter((p) => {
    const t = new Date(`${p.date}T00:00:00Z`).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

export function PortfolioWidget() {
  const [binanceConnected, setBinanceConnected] = useState(false);
  const [portfolio, setPortfolio] = useState<BinancePortfolioPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [period, setPeriod] = useState<TimePeriod>('All');
  const uid = useId().replace(/:/g, '');
  const gradientId = `pf-eq-${uid}`;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [statusRes, portfolioRes] = await Promise.all([
        apiFetch('/api/v1/exchanges/credentials/status'),
        apiFetch('/api/v1/exchanges/binance/portfolio'),
      ]);

      let connected = false;
      if (statusRes.ok) {
        const status = (await statusRes.json()) as CredentialsStatus;
        connected = Boolean(status.binance_connected);
      }
      setBinanceConnected(connected);

      if (!connected) {
        setPortfolio(null);
        return;
      }

      if (!portfolioRes.ok) {
        setPortfolio(null);
        setLoadFailed(true);
        return;
      }

      const data = (await portfolioRes.json()) as BinancePortfolioPayload;
      setPortfolio({
        ...data,
        assets: Array.isArray(data.assets) ? data.assets : [],
        history: Array.isArray(data.history) ? data.history : [],
      });
    } catch {
      setPortfolio(null);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useTradesSynced(load);

  const slices = useMemo(
    () => slicesFromAssets(portfolio?.assets ?? []),
    [portfolio]
  );
  const total =
    slices.reduce((s, x) => s + x.value, 0) || Number(portfolio?.total_usdt ?? 0);
  const capturedAt = formatCapturedAt(portfolio?.captured_at);
  const history = useMemo(
    () => filterHistory(portfolio?.history ?? [], period),
    [portfolio, period]
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 overflow-y-auto p-3">
      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-zinc-500">
          Loading allocation…
        </div>
      ) : !binanceConnected ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-xs text-zinc-500">
          Connect Binance to see spot and futures allocation.
        </div>
      ) : loadFailed ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-zinc-500">
          Could not load Binance allocation.
        </div>
      ) : slices.length === 0 && history.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-xs text-zinc-500">
          No valued Binance balances yet.
        </div>
      ) : (
        <>
          {slices.length > 0 && (
            <div className="shrink-0 rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-3 backdrop-blur-sm transition-all hover:border-yellow-500/30">
              <h3 className="mb-2 text-xs font-medium text-white">Binance</h3>
              <div className="flex items-center gap-3">
                <div className="min-w-[140px] flex-1" style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={slices}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={50}
                        labelLine={false}
                        label={PieSliceLabel}
                        isAnimationActive={false}
                      >
                        {slices.map((s) => (
                          <Cell key={s.name} fill={s.color} stroke="#fafafa" strokeWidth={1} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        itemStyle={{ color: '#ffffff' }}
                        labelStyle={{ color: '#ffffff' }}
                        formatter={(value: number) => formatUsd(Number(value))}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="min-w-[7.5rem] shrink-0 space-y-1.5">
                  {slices.map((s) => (
                    <div key={s.name} className="group flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="min-w-0 truncate text-[10px] text-gray-400 transition-colors group-hover:text-white">
                        {s.name}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-white">
                        {formatUsd(s.value)}
                      </span>
                    </div>
                  ))}
                  <div className="mt-1.5 border-t border-zinc-700/50 pt-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-yellow-400">Total</span>
                      <span className="text-[10px] font-medium tabular-nums text-yellow-400">
                        {formatUsd(total)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="min-h-[160px] flex-1 rounded-lg border border-zinc-800/50 bg-zinc-900/50 p-3 backdrop-blur-sm transition-all hover:border-yellow-500/30">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-gray-300">Binance History</h3>
              <div className="flex items-center gap-1">
                {PERIODS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPeriod(key)}
                    className={`rounded px-1.5 py-0.5 text-[10px] transition-all ${
                      period === key
                        ? 'bg-yellow-500/20 font-medium text-yellow-400'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
            {history.length === 0 ? (
              <div className="flex h-[120px] items-center justify-center text-[10px] text-zinc-600">
                Daily curve starts after the first 00:00 UTC snapshot.
              </div>
            ) : (
              <div style={{ height: 120, minWidth: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#52525b"
                      tick={{ fill: '#71717a', fontSize: 9 }}
                      tickLine={false}
                      tickFormatter={formatAxisDate}
                    />
                    <YAxis
                      stroke="#52525b"
                      tick={{ fill: '#71717a', fontSize: 9 }}
                      tickLine={false}
                      width={40}
                      tickFormatter={(v) => formatUsd(Number(v))}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      itemStyle={{ color: '#ffffff' }}
                      labelStyle={{ color: '#ffffff' }}
                      labelFormatter={(label) => formatAxisDate(String(label))}
                      formatter={(value: number) => [formatUsd(Number(value)), 'Balance']}
                    />
                    <Area
                      type="monotone"
                      dataKey="total_usdt"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill={`url(#${gradientId})`}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {capturedAt && (
            <p className="shrink-0 text-[10px] text-zinc-600">
              Snapshot from {capturedAt}. Daily poll at 00:00 UTC.
            </p>
          )}
        </>
      )}
    </div>
  );
}
