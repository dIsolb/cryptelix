import { useMemo } from 'react';

import { formatUsd, heatColor, tradeDate, tradeNet } from '../lib/tradeMetrics';
import { useDealBaseTrades } from '../lib/useDealBaseTrades';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type Cell = { net: number; count: number };

export function SessionHeatmapWidget() {
  const trades = useDealBaseTrades();

  const grid = useMemo(() => {
    const cells: Cell[][] = Array.from({ length: 24 }, () =>
      WEEKDAYS.map(() => ({ net: 0, count: 0 }))
    );
    for (const t of trades) {
      const d = tradeDate(t.date);
      if (!d) continue;
      const hour = d.getUTCHours();
      const dow = (d.getUTCDay() + 6) % 7;
      const cell = cells[hour][dow];
      cell.net += tradeNet(t);
      cell.count += 1;
    }
    return cells;
  }, [trades]);

  const maxAbs = useMemo(() => {
    let m = 0;
    for (const row of grid) {
      for (const c of row) m = Math.max(m, Math.abs(c.net));
    }
    return m;
  }, [grid]);

  if (trades.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-500">
        No trades yet
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-1.5">
      <div className="shrink-0 text-[10px] text-zinc-500">Hour × weekday (UTC)</div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="grid gap-px"
          style={{ gridTemplateColumns: '1.75rem repeat(7, minmax(0, 1fr))' }}
        >
          <div />
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-0.5 text-center text-[9px] text-zinc-500">
              {d}
            </div>
          ))}
          {grid.map((row, hour) => (
            <div key={`h-${hour}`} className="contents">
              <div className="pr-1 text-right text-[9px] leading-4 text-zinc-600">
                {String(hour).padStart(2, '0')}
              </div>
              {row.map((cell, dow) => (
                <div
                  key={`${hour}-${dow}`}
                  title={`${WEEKDAYS[dow]} ${String(hour).padStart(2, '0')}:00 UTC · ${formatUsd(cell.net)} · ${cell.count} trade${cell.count === 1 ? '' : 's'}`}
                  className="h-3.5 min-h-[14px] rounded-[2px] border border-zinc-800/60"
                  style={{ backgroundColor: heatColor(cell.net, maxAbs) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
