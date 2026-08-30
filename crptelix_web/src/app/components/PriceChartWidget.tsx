import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { apiFetch } from '../lib/apiClient';
import { useTradesSynced } from '../lib/useTradesSynced';

type TradeRow = Record<string, unknown>;
type KlineInterval = '1h' | '4h' | '1d';

type PricePoint = {
  time: number;
  date: string;
  price: number;
};

const INTERVALS: { key: KlineInterval; label: string }[] = [
  { key: '1h', label: '1H' },
  { key: '4h', label: '4H' },
  { key: '1d', label: '1D' },
];

const INTERVAL_LIMIT: Record<KlineInterval, number> = {
  '1h': 168,
  '4h': 180,
  '1d': 180,
};

const QUOTE_ONLY = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD', 'USD', 'DAI', 'TUSD']);

function binanceSpotKey(pair: string): string | null {
  let raw = pair.trim().toUpperCase();
  if (!raw) return null;
  if (raw.includes(':')) raw = raw.split(':')[0];
  raw = raw.replace(/[-_ ]/g, '/');
  let base = '';
  let quote = '';
  if (raw.includes('/')) {
    [base, quote] = raw.split('/');
  } else {
    const known = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'USD', 'BTC', 'ETH', 'BNB'];
    const q = known.find((k) => raw.endsWith(k) && raw.length > k.length);
    if (!q) return null;
    base = raw.slice(0, -q.length);
    quote = q;
  }
  base = (base || '').trim();
  quote = (quote || '').trim();
  if (!base || !quote || QUOTE_ONLY.has(base) || base === quote) return null;
  if (quote === 'USD') quote = 'USDT';
  return `${base}${quote}`;
}

function displaySpotPair(key: string): string {
  const quotes = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'BTC', 'ETH', 'BNB'];
  const quote = quotes.find((q) => key.endsWith(q) && key.length > q.length);
  if (!quote) return key;
  return `${key.slice(0, -quote.length)}/${quote}`;
}

function parseNum(raw: unknown): number {
  const n = Number(String(raw ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function formatAxisDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatPrice(n: number): string {
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function PriceChartWidget() {
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [pair, setPair] = useState<string>('');
  const [interval, setInterval] = useState<KlineInterval>('1h');
  const [klines, setKlines] = useState<PricePoint[]>([]);
  const [klineError, setKlineError] = useState(false);

  const loadTrades = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/trades');
      if (!res.ok) {
        setTrades([]);
        return;
      }
      const raw = (await res.json()) as unknown;
      setTrades(Array.isArray(raw) ? (raw as TradeRow[]) : []);
    } catch {
      setTrades([]);
    }
  }, []);

  useEffect(() => {
    void loadTrades();
  }, [loadTrades]);

  useTradesSynced(loadTrades);

  const pairs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of trades) {
      const key = binanceSpotKey(String(t.pair ?? ''));
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key);
  }, [trades]);

  useEffect(() => {
    if (!pairs.length) {
      setPair('');
      return;
    }
    if (!pair || !pairs.includes(pair)) setPair(pairs[0]);
  }, [pairs, pair]);

  useEffect(() => {
    if (!pair) {
      setKlines([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch(
          `/api/v1/market/klines?symbol=${encodeURIComponent(pair)}&interval=${interval}&limit=${INTERVAL_LIMIT[interval]}`
        );
        if (!res.ok) {
          if (!cancelled) {
            setKlines([]);
            setKlineError(true);
          }
          return;
        }
        const payload = (await res.json()) as { candles?: Array<Record<string, unknown>> };
        const candles = Array.isArray(payload.candles) ? payload.candles : [];
        const points: PricePoint[] = candles
          .map((c) => {
            const time = Number(c.open_time_ms);
            const price = parseNum(c.close);
            return {
              time,
              date: Number.isFinite(time) ? new Date(time).toISOString() : '',
              price,
            };
          })
          .filter((p) => p.date && p.price > 0);
        if (!cancelled) {
          setKlines(points);
          setKlineError(false);
        }
      } catch {
        if (!cancelled) {
          setKlines([]);
          setKlineError(true);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [pair, interval]);

  const latest = klines.length ? klines[klines.length - 1].price : 0;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col [contain:layout]">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold tabular-nums text-zinc-100">
          {klines.length ? formatPrice(latest) : '—'}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {INTERVALS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setInterval(key)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                interval === key
                  ? 'bg-yellow-500/15 text-yellow-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
          {pairs.length > 0 && (
            <select
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              className="max-w-[9rem] cursor-pointer rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-200 outline-none"
              title="Pair"
            >
              {pairs.map((p) => (
                <option key={p} value={p}>
                  {displaySpotPair(p)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {klines.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-zinc-500">
          {klineError
            ? 'No public Binance price for this pair'
            : pair
              ? 'Loading Binance price…'
              : 'No pairs in Deal Base'}
        </div>
      ) : (
        <div className="min-h-0 min-w-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={klines} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#a1a1aa' }}
                stroke="#52525b"
                tickLine={false}
                tickFormatter={formatAxisDate}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: '#a1a1aa' }}
                stroke="#52525b"
                tickLine={false}
                width={52}
                tickFormatter={(v) => formatPrice(Number(v))}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: 8,
                  color: '#ffffff',
                  fontSize: 12,
                }}
                itemStyle={{ color: '#ffffff' }}
                labelStyle={{ color: '#ffffff' }}
                labelFormatter={(label) => formatAxisDate(String(label))}
                formatter={(value: number) => [formatPrice(value), 'Close']}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#facc15"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
