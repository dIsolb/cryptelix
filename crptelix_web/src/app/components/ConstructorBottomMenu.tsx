import { LayoutGrid, Paintbrush, Type, Plus, LineChart, BarChart3, AreaChart, PieChart, Zap, Table, Wallet, Calendar, ListOrdered, Clock, X } from 'lucide-react';
import { WidgetType } from './DashboardWidget';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { BrushToolbar } from './BrushToolbar';
import type { DrawToolMode } from '../lib/drawingStorage';

interface ConstructorBottomMenuProps {
  onWidgetsToggle: () => void;
  onBrushToggle: () => void;
  onTextFieldAdd: () => void;
  onAddWidget: (type: WidgetType) => void;
  canvases: Array<{ id: string; name: string }>;
  activeCanvasId: string;
  onCanvasChange: (id: string) => void;
  onCanvasAdd: () => void;
  onCanvasRename: (id: string, newName: string) => void;
  onCanvasDelete: (id: string) => void;
  isWidgetsOpen: boolean;
  isBrushActive: boolean;
  drawToolMode: DrawToolMode;
  onDrawToolModeChange: (mode: DrawToolMode) => void;
  brushColor: string;
  onBrushColorChange: (color: string) => void;
}

export function ConstructorBottomMenu({
  onWidgetsToggle,
  onBrushToggle,
  onTextFieldAdd,
  onAddWidget,
  canvases,
  activeCanvasId,
  onCanvasChange,
  onCanvasAdd,
  onCanvasRename,
  onCanvasDelete,
  isWidgetsOpen,
  isBrushActive,
  drawToolMode,
  onDrawToolModeChange,
  brushColor,
  onBrushColorChange,
}: ConstructorBottomMenuProps) {
  const [editingCanvasId, setEditingCanvasId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const tabsScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Keep the active tab (and +) reachable after adding many canvases.
  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[data-active-canvas="true"]');
    active?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [activeCanvasId, canvases.length]);

  const widgets = [
    {
      type: 'line-chart' as WidgetType,
      icon: LineChart,
      label: 'Price Chart',
      description: 'Public Binance close prices for a pair from your Deal Base.',
    },
    {
      type: 'bar-chart' as WidgetType,
      icon: BarChart3,
      label: 'WvL',
      description: 'Bar chart of winning vs losing trades for each day of the selected week.',
    },
    {
      type: 'area-chart' as WidgetType,
      icon: AreaChart,
      label: 'Cul. PnL',
      description: 'Running net P&L over time (profit minus commissions), by trades or periods.',
    },
    {
      type: 'pie-chart' as WidgetType,
      icon: PieChart,
      label: 'Volume Mix',
      description: 'Share of traded volume by asset, or by Spot / USDT-M / COIN-M.',
    },
    {
      type: 'stats-card' as WidgetType,
      icon: Zap,
      label: 'Stats',
      description: 'Snapshot of net P&L, win rate, profit factor, drawdown, and trade counts.',
    },
    {
      type: 'table' as WidgetType,
      icon: Table,
      label: 'FTR',
      description: 'Full Trading Report: detailed metrics for the whole Deal Base history.',
    },
    {
      type: 'portfolio-widget' as WidgetType,
      icon: Wallet,
      label: 'Portfolio',
      description: 'Binance spot + futures allocation, with a daily equity curve.',
    },
    {
      type: 'pnl-calendar' as WidgetType,
      icon: Calendar,
      label: 'PnL Calendar',
      description: 'Daily net P&L heatmap from your Deal Base, by calendar month.',
    },
    {
      type: 'symbol-scorecard' as WidgetType,
      icon: ListOrdered,
      label: 'Symbol Scorecard',
      description: 'Per-pair trades, win rate, net P&L, and realized R.',
    },
    {
      type: 'session-heatmap' as WidgetType,
      icon: Clock,
      label: 'Session Heatmap',
      description: 'Net P&L by UTC hour and weekday across the Deal Base.',
    },
  ];

  const handleStartEditing = (canvasId: string, currentName: string) => {
    setEditingCanvasId(canvasId);
    setEditingName(currentName);
  };

  const handleSaveEdit = () => {
    if (editingCanvasId && editingName.trim()) {
      onCanvasRename(editingCanvasId, editingName.trim());
    }
    setEditingCanvasId(null);
    setEditingName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingCanvasId(null);
      setEditingName('');
    }
  };

  return (
    <div className="pointer-events-none relative z-30 overflow-visible bg-transparent">
      <div className="pointer-events-none flex flex-col gap-2 overflow-visible px-2 py-3 sm:min-h-[54px] sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:overflow-visible sm:px-3 sm:py-3">
        {/* Tools — centered; above dashboard tabs so they never get covered */}
        <div className="pointer-events-auto order-1 flex shrink-0 items-center justify-center gap-2 sm:absolute sm:left-1/2 sm:top-1/2 sm:z-20 sm:-translate-x-1/2 sm:-translate-y-1/2">
          <div className="relative" data-guide="widgets">
            <motion.button
              onClick={onWidgetsToggle}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all sm:gap-2 sm:px-4 sm:text-sm ${
                isWidgetsOpen
                  ? 'border-yellow-500/60 bg-zinc-900 text-yellow-400 shadow-sm shadow-yellow-500/20'
                  : 'border-zinc-700 bg-zinc-900 text-gray-300 hover:border-yellow-500/40 hover:bg-zinc-800 hover:text-white'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Widgets"
            >
              <LayoutGrid className="h-4 w-4 shrink-0" />
              <span className="hidden min-[380px]:inline">Widgets</span>
            </motion.button>

            {isWidgetsOpen && (
              <div
                data-guide="widgets"
                className="absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 overflow-visible pt-6"
              >
                <div className="flex items-center gap-2 overflow-visible">
                  {widgets.map((widget, index) => (
                    <motion.button
                      key={widget.type}
                      onClick={() => {
                        onAddWidget(widget.type);
                      }}
                      className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded border border-zinc-700 bg-zinc-900 transition-all hover:border-zinc-500 hover:bg-zinc-800"
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: index * 0.05,
                        type: 'spring',
                        stiffness: 400,
                        damping: 17,
                      }}
                      whileHover={{ scale: 1.1, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <widget.icon className="h-5 w-5 text-gray-400 transition-colors group-hover:text-white" />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <div className="w-48 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-center shadow-lg">
                          <div className="text-xs font-medium whitespace-nowrap text-gray-200">
                            {widget.label}
                          </div>
                          <div className="mt-1 text-[11px] leading-snug text-zinc-400">
                            {widget.description}
                          </div>
                        </div>
                        <div className="absolute left-1/2 top-full -mt-px -translate-x-1/2">
                          <div className="border-4 border-transparent border-t-zinc-900" />
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <motion.button
              data-guide="draw"
              onClick={() => onBrushToggle()}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all sm:gap-2 sm:px-4 sm:text-sm ${
                isBrushActive
                  ? 'border-yellow-500/60 bg-zinc-900 text-yellow-400 shadow-sm shadow-yellow-500/20'
                  : 'border-zinc-700 bg-zinc-900 text-gray-300 hover:border-yellow-500/40 hover:bg-zinc-800 hover:text-white'
              }`}
              title={isBrushActive ? 'Disable draw tools' : 'Enable draw tools'}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Paintbrush className="h-4 w-4 shrink-0" />
              <span className="hidden min-[380px]:inline">Draw</span>
            </motion.button>

            {isBrushActive && (
              <div className="absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 overflow-visible">
                <BrushToolbar
                  toolMode={drawToolMode}
                  brushColor={brushColor}
                  onToolModeChange={onDrawToolModeChange}
                  onBrushColorChange={onBrushColorChange}
                />
              </div>
            )}
          </div>

          <motion.button
            type="button"
            data-guide="text"
            onClick={onTextFieldAdd}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-gray-300 transition-all hover:border-yellow-500/40 hover:bg-zinc-800 hover:text-white sm:gap-2 sm:px-4 sm:text-sm"
            title="Add text field"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Type className="h-4 w-4 shrink-0" />
            <span className="hidden min-[380px]:inline">Text</span>
          </motion.button>
        </div>

        {/* Canvas tabs — scroll strip; glow is an inner blur (not box-shadow) so overflow won't clip it */}
        <div
          data-guide="dashboard"
          className="pointer-events-auto order-2 z-0 min-w-0 max-w-full sm:max-w-[min(42%,calc(50%-11rem))] lg:max-w-[min(44%,calc(50%-12rem))]"
        >
          <div
            ref={tabsScrollRef}
            className="scrollbar-hidden flex items-center gap-0.5 overflow-x-auto overscroll-x-contain px-1 py-1"
          >
          {canvases.map((canvas) => {
            const isActive = activeCanvasId === canvas.id;

            if (editingCanvasId === canvas.id) {
              return (
                <div key={canvas.id} className="relative shrink-0 px-1.5 py-3.5" data-active-canvas="true">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-[11px] inset-x-[5px] rounded-xl bg-yellow-400/55 blur-[7px]"
                  />
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleSaveEdit}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    className="relative z-[1] shrink-0 rounded-lg border-2 border-yellow-600 bg-yellow-500 px-3 py-1.5 text-xs font-medium text-black outline-none sm:px-4 sm:text-sm"
                  />
                </div>
              );
            }

            return (
              <div
                key={canvas.id}
                className="relative shrink-0 px-1.5 py-3.5"
                data-active-canvas={isActive ? 'true' : undefined}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-[11px] inset-x-[5px] rounded-xl bg-yellow-400/55 blur-[7px]"
                  />
                )}
                <button
                  onClick={() => onCanvasChange(canvas.id)}
                  onDoubleClick={() => handleStartEditing(canvas.id, canvas.name)}
                  className={`relative z-[1] flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-transform duration-150 ease-out hover:scale-105 sm:gap-1.5 sm:px-4 sm:text-sm ${
                    isActive
                      ? 'bg-yellow-500 text-black'
                      : 'border border-zinc-700 bg-zinc-900 text-gray-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  <span className="min-w-0 truncate">{canvas.name}</span>
                  {canvases.length > 1 && isActive && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-zinc-950/90 text-zinc-100 ring-1 ring-black/25 transition-colors hover:bg-black hover:text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCanvasDelete(canvas.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          onCanvasDelete(canvas.id);
                        }
                      }}
                      title="Delete canvas"
                    >
                      <X className="block h-3 w-3 shrink-0" strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              </div>
            );
          })}
          <motion.button
            onClick={onCanvasAdd}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-zinc-800 hover:text-yellow-400"
            title="Add new canvas"
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
          >
            <Plus className="h-4 w-4" />
          </motion.button>
          </div>
        </div>

        {/* Spacer balances centered tools on wide screens */}
        <div
          className="order-3 hidden shrink-0 sm:block sm:w-[min(42%,calc(50%-11rem))] lg:w-[min(44%,calc(50%-12rem))]"
          aria-hidden
        />
      </div>
    </div>
  );
}