import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  startOfMonth,
} from 'date-fns';

import { formatUsd, heatColor, tradeDate, tradeNet } from '../lib/tradeMetrics';
import { useDealBaseTrades } from '../lib/useDealBaseTrades';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type DayBucket = { net: number; count: number };

export function PnlCalendarWidget() {
  const trades = useDealBaseTrades();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const buckets = useMemo(() => {
    const map = new Map<string, DayBucket>();
    for (const t of trades) {
      const d = tradeDate(t.date);
      if (!d) continue;
      const key = format(d, 'yyyy-MM-dd');
      const prev = map.get(key) ?? { net: 0, count: 0 };
      map.set(key, { net: prev.net + tradeNet(t), count: prev.count + 1 });
    }
    return map;
  }, [trades]);

  const days = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    return eachDayOfInterval({ start, end });
  }, [month]);

  const leadBlanks = (getDay(startOfMonth(month)) + 6) % 7;
  const monthNets = days.map((d) => buckets.get(format(d, 'yyyy-MM-dd'))?.net ?? 0);
  const maxAbs = Math.max(0, ...monthNets.map((n) => Math.abs(n)));
  const monthNet = monthNets.reduce((s, n) => s + n, 0);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-center gap-3 px-1">
        <button
          type="button"
          aria-label="Previous month"
          className="rounded border border-zinc-700 px-2 py-0.5 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
          onClick={() => setMonth((m) => addMonths(m, -1))}
        >
          &lt;
        </button>
        <span className="min-w-[8rem] text-center text-xs font-medium text-zinc-400">
          {format(month, 'MMMM yyyy')}
        </span>
        <button
          type="button"
          aria-label="Next month"
          className="rounded border border-zinc-700 px-2 py-0.5 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
          onClick={() => setMonth((m) => addMonths(m, 1))}
        >
          &gt;
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-500">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1">
        {Array.from({ length: leadBlanks }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const bucket = buckets.get(key);
          const net = bucket?.net ?? 0;
          const title = bucket
            ? `${key} · ${formatUsd(net)} · ${bucket.count} trade${bucket.count === 1 ? '' : 's'}`
            : key;
          return (
            <div
              key={key}
              title={title}
              className="flex min-h-[1.5rem] flex-col items-center justify-center rounded border border-zinc-800/80 text-[10px] text-zinc-300"
              style={{ backgroundColor: heatColor(net, maxAbs) }}
            >
              <span>{format(d, 'd')}</span>
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center justify-between text-[10px] text-zinc-500">
        <span>Net this month</span>
        <span className={monthNet > 0 ? 'text-green-400' : monthNet < 0 ? 'text-red-400' : 'text-zinc-400'}>
          {formatUsd(monthNet)}
        </span>
      </div>
    </div>
  );
}
