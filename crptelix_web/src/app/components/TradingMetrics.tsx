import { TrendingUp, TrendingDown } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../lib/apiClient';
import { useTradesSynced } from '../lib/useTradesSynced';

interface TradesStatsPayload {
  total_net_profit: number;
  profit_factor: number | null;
  total_trades: number;
  winners: number;
  losers: number;
  max_drawdown: number;
  max_drawdown_percent: number;
  percent_profitable: number;
  avg_trade: number;
  avg_winning_trade?: number;
  avg_losing_trade?: number;
  realized_rr?: number | null;
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function percentProfitableColor(pct: number): string {
  if (pct < 20) return 'text-red-400';
  if (pct <= 50) return 'text-yellow-400';
  return 'text-green-400';
}

export function KeyMetricsCards() {
  const [stats, setStats] = useState<TradesStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/trades/stats');
      if (!res.ok) {
        console.error('Failed to fetch /api/v1/trades/stats', res.status);
        setStats(null);
        return;
      }
      const data = (await res.json()) as TradesStatsPayload;
      setStats(data);
    } catch (e) {
      console.error('Error fetching trade stats', e);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useTradesSynced(() => {
    void load();
  });

  const tnp = stats?.total_net_profit ?? 0;
  const tnpPositive = tnp > 0;
  const tnpNegative = tnp < 0;
  const tnpColor = tnpPositive ? 'text-green-400' : tnpNegative ? 'text-red-400' : 'text-zinc-200';

  const avg = stats?.avg_trade ?? 0;
  const avgColor = avg > 0 ? 'text-green-400' : avg < 0 ? 'text-red-400' : 'text-zinc-200';

  const pp = stats?.percent_profitable ?? 0;
  const ppColor = percentProfitableColor(pp);

  const pfDisplay =
    stats?.profit_factor != null && Number.isFinite(stats.profit_factor)
      ? stats.profit_factor.toFixed(3)
      : '—';

  const maxDd = stats?.max_drawdown ?? 0;
  const maxDdPct = stats?.max_drawdown_percent ?? 0;

  const cardClass =
    'flex min-h-[5.25rem] min-w-0 flex-col justify-between rounded-lg border border-zinc-800 bg-zinc-900/95 p-3';

  return (
    <div className="w-full min-w-0">
      <div className="grid grid-cols-2 gap-2">
        <div className={cardClass}>
          <div className="text-xs font-medium text-gray-400">Total Net Profit</div>
          <div
            className={`flex min-w-0 items-center gap-1 text-lg font-bold leading-tight tabular-nums ${tnpColor}`}
          >
            {tnpPositive && <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />}
            {tnpNegative && <TrendingDown className="h-4 w-4 shrink-0" aria-hidden />}
            <span className="truncate">{loading && !stats ? '…' : formatUsd(tnp)}</span>
          </div>
          <div className="text-xs text-gray-500">Inc. commissions</div>
        </div>

        <div className={cardClass}>
          <div className="text-xs font-medium text-gray-400">Profit Factor</div>
          <div className="truncate text-lg font-bold tabular-nums text-zinc-100">
            {loading && !stats ? '…' : pfDisplay}
          </div>
          <div className="text-xs text-gray-500">Gross profit / |gross loss|</div>
        </div>

        <div className={cardClass}>
          <div className="text-xs font-medium text-gray-400">Total Trades</div>
          <div className="truncate text-lg font-bold tabular-nums text-zinc-100">
            {loading && !stats ? '…' : stats?.total_trades ?? 0}
          </div>
          <div className="text-xs leading-snug">
            <span className="font-medium text-green-400">{stats?.winners ?? 0} winners</span>
            <span className="text-gray-500"> / </span>
            <span className="font-medium text-red-400">{stats?.losers ?? 0} losers</span>
          </div>
        </div>

        <div className={cardClass}>
          <div className="text-xs font-medium text-gray-400">Max Drawdown</div>
          <div className="flex min-w-0 items-center gap-1 text-lg font-bold leading-tight text-red-400 tabular-nums">
            <TrendingDown className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{loading && !stats ? '…' : formatUsd(maxDd)}</span>
          </div>
          <div className="text-xs tabular-nums text-gray-500">
            {loading && !stats ? '…' : `${maxDdPct.toFixed(2)}%`}
          </div>
        </div>

        <div className={cardClass}>
          <div className="text-xs font-medium text-gray-400">Percent Profitable</div>
          <div className={`truncate text-lg font-bold tabular-nums ${ppColor}`}>
            {loading && !stats ? '…' : `${pp.toFixed(2)}%`}
          </div>
          <div className="text-xs text-gray-500">Win rate</div>
        </div>

        <div className={cardClass}>
          <div className="text-xs font-medium text-gray-400">Avg Trade</div>
          <div className={`truncate text-lg font-bold tabular-nums ${avgColor}`}>
            {loading && !stats ? '…' : formatUsd(avg)}
          </div>
          <div className="text-xs text-gray-500">Per trade</div>
        </div>

        <div className={cardClass}>
          <div className="text-xs font-medium text-gray-400">Realized R:R</div>
          <div className="truncate text-lg font-bold tabular-nums text-zinc-100">
            {loading && !stats
              ? '…'
              : stats?.realized_rr != null && Number.isFinite(stats.realized_rr)
                ? `${stats.realized_rr.toFixed(2)}R`
                : '—'}
          </div>
          <div className="text-xs text-gray-500">Avg win / |avg loss|</div>
        </div>
      </div>
    </div>
  );
}
