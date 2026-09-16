import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../lib/apiClient';
import { useTradesSynced } from '../lib/useTradesSynced';

export interface FtrReportPayload {
  total_profit_gross_minus_loss: number;
  total_net_profit: number;
  total_trades: number;
  profit_per_week: number;
  profit_per_month: number;
  profit_per_day: number;
  profit_factor: number | null;
  percent_profitable: number;
  max_drawdown: number;
  max_drawdown_percent: number;
  max_consecutive_winners: number;
  max_consecutive_losers: number;
  largest_winning_trade: number;
  largest_losing_trade: number;
  gross_profit: number;
  gross_loss: number;
  commission_total: number;
  avg_winning_trade: number;
  avg_win_lose_ratio: number | null;
  avg_trade: number;
  avg_time_in_market_seconds: number;
  avg_mfe_points: number;
  avg_mfe_percent: number;
  avg_mae_points: number;
  avg_mae_percent: number;
  avg_losing_trade: number;
  winning_trades_count: number;
  losing_trades_count: number;
  trades_per_day: number;
}

export interface FtrReportRow {
  label: string;
  value: string | number;
  isPositive?: boolean;
  isNegative?: boolean;
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatPct(n: number, digits = 2): string {
  return `${n.toFixed(digits)}%`;
}

function formatDurationSec(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function buildRows(d: FtrReportPayload): FtrReportRow[] {
  const tnp = d.total_net_profit;
  const tnpPos = tnp > 0;
  const tnpNeg = tnp < 0;

  return [
    {
      label: 'Total Profit (Gross - Loss)',
      value: formatUsd(d.total_profit_gross_minus_loss),
      isPositive: d.total_profit_gross_minus_loss > 0,
      isNegative: d.total_profit_gross_minus_loss < 0,
    },
    {
      label: 'Total Net Profit (Inc Commissions)',
      value: formatUsd(tnp),
      isPositive: tnpPos,
      isNegative: tnpNeg,
    },
    { label: 'Total # Trades', value: d.total_trades },
    {
      label: 'Profit per Week',
      value: formatUsd(d.profit_per_week),
      isPositive: d.profit_per_week > 0,
      isNegative: d.profit_per_week < 0,
    },
    {
      label: 'Profit per Month',
      value: formatUsd(d.profit_per_month),
      isPositive: d.profit_per_month > 0,
      isNegative: d.profit_per_month < 0,
    },
    {
      label: 'Profit per Day',
      value: formatUsd(d.profit_per_day),
      isPositive: d.profit_per_day > 0,
      isNegative: d.profit_per_day < 0,
    },
    {
      label: 'Profit Factor',
      value: d.profit_factor != null && Number.isFinite(d.profit_factor) ? d.profit_factor.toFixed(3) : '—',
      isPositive: d.profit_factor != null && d.profit_factor >= 1,
      isNegative: d.profit_factor != null && d.profit_factor < 1,
    },
    {
      label: 'Percent Profitable',
      value: formatPct(d.percent_profitable),
      isPositive: d.percent_profitable > 50,
      isNegative: d.percent_profitable < 20,
    },
    {
      label: 'Max. Drawdown',
      value: formatUsd(d.max_drawdown),
      isNegative: true,
    },
    {
      label: 'Max Drawdown (%)',
      value: formatPct(d.max_drawdown_percent),
      isNegative: true,
    },
    { label: 'Max Consecutive Winners', value: d.max_consecutive_winners },
    { label: 'Max Consecutive Losers', value: d.max_consecutive_losers },
    {
      label: 'Largest Winning Trade',
      value: formatUsd(d.largest_winning_trade),
      isPositive: true,
    },
    {
      label: 'Largest Losing Trade',
      value: formatUsd(d.largest_losing_trade),
      isNegative: true,
    },
    {
      label: 'Gross Profit',
      value: formatUsd(d.gross_profit),
      isPositive: true,
    },
    {
      label: 'Gross Loss',
      value: formatUsd(d.gross_loss),
      isNegative: true,
    },
    { label: 'Commission', value: formatUsd(d.commission_total) },
    {
      label: 'Avg Winning Trade',
      value: formatUsd(d.avg_winning_trade),
      isPositive: true,
    },
    {
      label: 'Avg Win/Lose Trades',
      value:
        d.avg_win_lose_ratio != null && Number.isFinite(d.avg_win_lose_ratio)
          ? d.avg_win_lose_ratio.toFixed(3)
          : '—',
    },
    {
      label: 'Avg Trade',
      value: formatUsd(d.avg_trade),
      isPositive: d.avg_trade > 0,
      isNegative: d.avg_trade < 0,
    },
    {
      label: 'Avg Time In Market',
      value: formatDurationSec(d.avg_time_in_market_seconds),
    },
    {
      label: 'Avg MFE (Points)',
      value: d.avg_mfe_points.toFixed(2),
      isPositive: d.avg_mfe_points > 0,
    },
    {
      label: 'Avg MFE (Percent)',
      value: formatPct(d.avg_mfe_percent),
      isPositive: d.avg_mfe_percent > 0,
    },
    {
      label: 'Avg MAE (Points)',
      value: d.avg_mae_points !== 0 ? (-Math.abs(d.avg_mae_points)).toFixed(1) : '0.0',
      isNegative: true,
    },
    {
      label: 'Avg MAE (Percent)',
      value: formatPct(d.avg_mae_percent),
      isNegative: d.avg_mae_percent > 0,
    },
    {
      label: 'Avg Losing Trade',
      value: formatUsd(d.avg_losing_trade),
      isNegative: true,
    },
    {
      label: '# Winning Trades',
      value: d.winning_trades_count,
      isPositive: true,
    },
    { label: '# Trades/Day', value: d.trades_per_day.toFixed(3) },
    {
      label: '# Losing Trades',
      value: d.losing_trades_count,
      isNegative: true,
    },
  ];
}

interface FtrMetricRowProps {
  label: string;
  value: string | number;
  isPositive?: boolean;
  isNegative?: boolean;
  onSpawn: () => void;
}

function FtrMetricRow({ label, value, isPositive, isNegative, onSpawn }: FtrMetricRowProps) {
  const valueStr = typeof value === 'string' ? value : value.toString();
  const showTrend = isPositive || isNegative;

  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded py-2 pl-2 pr-1 transition-colors hover:bg-zinc-800/50">
      <span className="truncate text-sm text-gray-400">{label}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={`flex items-center gap-1 text-sm font-medium tabular-nums ${
            isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-white'
          }`}
        >
          {showTrend && (
            <>
              {isPositive && <TrendingUp className="h-3 w-3 shrink-0" aria-hidden />}
              {isNegative && <TrendingDown className="h-3 w-3 shrink-0" aria-hidden />}
            </>
          )}
          {valueStr}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSpawn();
          }}
          className="rounded p-1 text-yellow-500/90 transition-colors hover:bg-yellow-500/15 hover:text-yellow-400"
          title="Open as widget"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface FtrReportTableProps {
  onExtractMetric?: (
    label: string,
    value: string | number,
    isPositive?: boolean,
    isNegative?: boolean
  ) => void;
}

export function FtrLiveMetricCard({
  label,
  fallbackValue,
  fallbackPositive,
  fallbackNegative,
}: {
  label: string;
  fallbackValue?: string | number;
  fallbackPositive?: boolean;
  fallbackNegative?: boolean;
}) {
  const [row, setRow] = useState<FtrReportRow | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/trades/ftr-report');
      if (!res.ok) return;
      const data = (await res.json()) as FtrReportPayload;
      const found = buildRows(data).find((r) => r.label === label) ?? null;
      setRow(found);
    } catch {
      /* keep last / fallback */
    }
  }, [label]);

  useEffect(() => {
    void load();
    const later = window.setTimeout(() => void load(), 8000);
    return () => window.clearTimeout(later);
  }, [load]);

  useTradesSynced(load);

  const value = row?.value ?? fallbackValue ?? '—';
  const isPositive = row?.isPositive ?? fallbackPositive;
  const isNegative = row?.isNegative ?? fallbackNegative;
  const color = isPositive ? '#22c55e' : isNegative ? '#ef4444' : '#fafafa';

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-3 py-2">
      <div
        className="flex max-w-full items-center justify-center gap-2 text-center text-xl font-bold leading-tight"
        style={{ color }}
      >
        {isPositive && <TrendingUp className="h-7 w-7 shrink-0" aria-hidden />}
        {isNegative && <TrendingDown className="h-7 w-7 shrink-0" aria-hidden />}
        <span className="min-w-0 break-words">{value}</span>
      </div>
    </div>
  );
}

export function FtrReportTable({ onExtractMetric }: FtrReportTableProps) {
  const [rows, setRows] = useState<FtrReportRow[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/trades/ftr-report');
      if (!res.ok) {
        setRows([]);
        return;
      }
      const data = (await res.json()) as FtrReportPayload;
      setRows(buildRows(data));
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const later = window.setTimeout(() => void load(), 8000);
    return () => window.clearTimeout(later);
  }, [load]);

  useTradesSynced(load);

  return (
    <div className="space-y-0.5 pb-1">
      {rows.map((row) => (
        <FtrMetricRow
          key={row.label}
          label={row.label}
          value={row.value}
          isPositive={row.isPositive}
          isNegative={row.isNegative}
          onSpawn={() =>
            onExtractMetric?.(row.label, row.value, row.isPositive, row.isNegative)
          }
        />
      ))}
    </div>
  );
}
