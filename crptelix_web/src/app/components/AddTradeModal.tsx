import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { SideToggle } from './SideToggle';
import { formatNumber } from './ui/utils';
import { apiFetch } from '../lib/apiClient';

type ColumnType = 'text' | 'number' | 'percentage';

interface AddTradeModalProps {
  onClose: () => void;
  /** Server JSON (snake_case) from POST /api/v1/trades — includes real UUID id */
  onCreated: (createdTrade: Record<string, unknown>) => Promise<void> | void;
  customColumns?: { name: string; type: ColumnType }[];
}

export function AddTradeModal({ onClose, onCreated, customColumns = [] }: AddTradeModalProps) {
  const [date, setDate] = useState('');
  const [pair, setPair] = useState('');
  const [side, setSide] = useState<'Long' | 'Short'>('Long');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [pnl, setPnl] = useState('');
  const [commission, setCommission] = useState('');
  const [notes, setNotes] = useState('');
  const [exchangeTradeId, setExchangeTradeId] = useState('');
  const [exchangeName, setExchangeName] = useState('binance');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [pairError, setPairError] = useState<string | null>(null);

  const normalizeNumericInput = (raw: string, decimals: number): string => {
    const cleaned = raw.replace(',', '.').trim();
    if (cleaned === '') return '';
    const num = Number(cleaned);
    if (Number.isNaN(num)) return raw;
    return formatNumber(num, decimals);
  };

  /**
   * Values may include Intl grouping from onBlur (e.g. "50,000.12") or typed decimals.
   * Strip grouping/spaces, then parseFloat — a single .replace(',', '.') breaks on comma-formatted numbers.
   */
  const parseNumericForPayload = (raw: string): number | null => {
    const s = String(raw ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s/g, '')
      .replace(/,/g, '')
      .replace(/^\+/, '')
      .trim();
    if (s === '') return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setPairError(null);

    const normalizedPair = pair.trim().toUpperCase();
    if (!normalizedPair.includes('/')) {
      setPairError('Pair must be in format BASE/QUOTE, e.g. BTC/USDT.');
      setSubmitting(false);
      return;
    }

    try {
      // Backend expects ISO datetime; convert from datetime-local input.
      const isoDate = date ? new Date(date).toISOString() : null;

      const custom_fields: Record<string, unknown> = {};
      customColumns.forEach((col) => {
        const key = col.name;
        const value = customValues[key];
        if (value !== undefined && value !== '') {
          custom_fields[key] = value;
        }
      });

      const entryNum = parseNumericForPayload(entryPrice);
      const exitNum = parseNumericForPayload(exitPrice);
      const pnlNum = parseNumericForPayload(pnl);
      const commissionNum = parseNumericForPayload(commission);

      const payload = {
        is_manual: true,
        date: isoDate,
        pair: normalizedPair,
        side,
        entry_price: entryNum !== null ? entryNum : 0,
        exit_price: exitNum,
        quantity: parseNumericForPayload(quantity) ?? 0,
        pnl: pnlNum,
        commission: commissionNum,
        notes: notes || null,
        custom_fields,
        exchange_trade_id: exchangeTradeId || `${Date.now()}`,
        exchange_name: exchangeName || 'binance',
      };

      const res = await apiFetch('/api/v1/trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseText = await res.text();

      if (!res.ok) {
        throw new Error(responseText || 'Failed to create trade');
      }

      const created = JSON.parse(responseText) as Record<string, unknown>;
      await onCreated(created);
    } catch (err) {
      console.error(err);
      setError('Failed to create trade. Please check your input and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg mx-4 bg-zinc-900 rounded-xl border border-yellow-500/20 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Add New Trade</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Pair
              </label>
              <input
                type="text"
                value={pair}
                onChange={(e) => {
                  const value = e.target.value.toUpperCase();
                  setPair(value);
                  if (value.includes('/')) {
                    setPairError(null);
                  }
                }}
                placeholder="e.g. BTC/USDT"
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50"
                required
              />
              {pairError && (
                <p className="mt-1 text-xs text-red-400">
                  {pairError}
                </p>
              )}
            </div>
          </div>

          {customColumns.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {customColumns.map((col) => (
                <div key={col.name}>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    {col.name}
                  </label>
                  <input
                    type={col.type === 'number' ? 'number' : 'text'}
                    value={customValues[col.name] ?? ''}
                    onChange={(e) =>
                      setCustomValues((prev) => ({ ...prev, [col.name]: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50"
                    placeholder={`Custom field: ${col.name}`}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Side
              </label>
              <SideToggle value={side} onChange={setSide} layout="stack" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Entry Price
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={entryPrice}
                onChange={(e) =>
                  setEntryPrice(e.target.value.replace(',', '.'))
                }
                onBlur={(e) =>
                  setEntryPrice(normalizeNumericInput(e.target.value, 4))
                }
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Exit Price
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={exitPrice}
                onChange={(e) =>
                  setExitPrice(e.target.value.replace(',', '.'))
                }
                onBlur={(e) =>
                  setExitPrice(normalizeNumericInput(e.target.value, 4))
                }
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Quantity
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={quantity}
                onChange={(e) =>
                  setQuantity(e.target.value.replace(',', '.'))
                }
                onBlur={(e) =>
                  setQuantity(normalizeNumericInput(e.target.value, 6))
                }
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                P&amp;L
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={pnl}
                onChange={(e) =>
                  setPnl(e.target.value.replace(',', '.'))
                }
                onBlur={(e) =>
                  setPnl(normalizeNumericInput(e.target.value, 2))
                }
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Commission
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={commission}
                onChange={(e) =>
                  setCommission(e.target.value.replace(',', '.'))
                }
                onBlur={(e) =>
                  setCommission(normalizeNumericInput(e.target.value, 6))
                }
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50"
              placeholder="Optional notes about this trade..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Exchange Trade ID
              </label>
              <input
                type="text"
                value={exchangeTradeId}
                onChange={(e) => setExchangeTradeId(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50"
                placeholder="Optional; auto-filled if empty"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Exchange Name
              </label>
              <input
                type="text"
                value={exchangeName}
                onChange={(e) => setExchangeName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50"
                placeholder="e.g., binance"
                required
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 mt-1">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors text-sm"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-zinc-700 disabled:text-gray-500 text-black font-semibold rounded-lg transition-all disabled:cursor-not-allowed text-sm"
            >
              {submitting ? 'Saving...' : 'Save Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

