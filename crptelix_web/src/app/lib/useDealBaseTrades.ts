import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from './apiClient';
import type { TradeRow } from './tradeMetrics';
import { useTradesSynced } from './useTradesSynced';

export function useDealBaseTrades() {
  const [trades, setTrades] = useState<TradeRow[]>([]);

  const load = useCallback(async () => {
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
    void load();
  }, [load]);

  useTradesSynced(load);

  return trades;
}
