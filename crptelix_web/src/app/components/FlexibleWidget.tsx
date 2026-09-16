import { memo, useRef, useEffect, useState, type MutableRefObject } from 'react';
import { GripVertical, X } from 'lucide-react';
import { Widget } from './DashboardWidget';
import { Card } from './ui/card';
import {
  applyDragTranslate,
  applyResizeBox,
  clearDragTransform,
  pinElementBox,
  computeResizeBox,
} from '../lib/canvasInteraction';

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type InteractionMode = 'idle' | 'drag' | 'resize';

const TEXT_MIN_WIDTH = 80;
const TEXT_MIN_HEIGHT = 40;
const WIDGET_MIN_WIDTH = 238;
const WIDGET_MIN_HEIGHT = 170;
const BODY_DRAG_THRESHOLD = 5;

/** Chart widgets need a fixed viewport; others scroll when content exceeds the box. */
function widgetBodyClass(type: Widget['type']): string {
  if (
    type === 'line-chart' ||
    type === 'bar-chart' ||
    type === 'area-chart' ||
    type === 'pie-chart' ||
    type === 'pnl-calendar' ||
    type === 'session-heatmap'
  ) {
    return 'min-h-0 min-w-0 flex-1 overflow-hidden';
  }
  return 'widget-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-0.5';
}

function displayWidgetTitle(widget: Widget): string {
  if (widget.type === 'line-chart') return 'Price Chart';
  if (widget.type === 'area-chart') return 'Cul. PnL';
  if (widget.type === 'pie-chart') return 'Volume Mix';
  if (widget.type === 'pnl-calendar') return 'PnL Calendar';
  if (widget.type === 'symbol-scorecard') return 'Symbol Scorecard';
  if (widget.type === 'session-heatmap') return 'Session Heatmap';
  return widget.title;
}

function clearTextSelection() {
  window.getSelection()?.removeAllRanges();
}

const RESIZE_HANDLES: { id: ResizeHandle; className: string; cursor: string }[] = [
  { id: 'nw', className: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2', cursor: 'cursor-nw-resize' },
  { id: 'ne', className: 'top-0 right-0 translate-x-1/2 -translate-y-1/2', cursor: 'cursor-ne-resize' },
  { id: 'se', className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2', cursor: 'cursor-se-resize' },
  { id: 'sw', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2', cursor: 'cursor-sw-resize' },
];

export type CanvasSelectEvent = { shiftKey: boolean; keepGroup?: boolean };

interface FlexibleWidgetProps {
  widget: Widget;
  onRemove: (id: string) => void;
  onUpdatePosition: (id: string, position: { x: number; y: number }) => void;
  onUpdateSize: (id: string, size: { width: number; height: number }) => void;
  canvasOrigin?: { x: number; y: number };
  zoomRef?: MutableRefObject<number>;
  isSelected?: boolean;
  isInGroup?: boolean;
  isPreviewSelected?: boolean;
  isEditing?: boolean;
  peerOffset?: { x: number; y: number } | null;
  onSelect?: (event?: CanvasSelectEvent) => void;
  onGroupDragLive?: (dx: number, dy: number) => void;
  onGroupDragEnd?: (sourceId: string, dx: number, dy: number) => void;
  children: React.ReactNode;
}

function FlexibleWidgetInner({
  widget,
  onRemove,
  onUpdatePosition,
  onUpdateSize,
  canvasOrigin = { x: 0, y: 0 },
  zoomRef,
  isSelected = false,
  isInGroup = false,
  isPreviewSelected = false,
  isEditing = false,
  peerOffset = null,
  onSelect,
  onGroupDragLive,
  onGroupDragEnd,
  children,
}: FlexibleWidgetProps) {
  const [isInteracting, setIsInteracting] = useState(false);
  const interactionRef = useRef<InteractionMode>('idle');
  const resizeHandleRef = useRef<ResizeHandle>('se');
  const widgetRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({
    clientX: 0,
    clientY: 0,
    posX: 0,
    posY: 0,
    sizeW: 0,
    sizeH: 0,
    originX: 0,
    originY: 0,
  });
  const suppressTextSelectRef = useRef(false);
  const pendingBodyDragRef = useRef<{
    clientX: number;
    clientY: number;
    posX: number;
    posY: number;
    sizeW: number;
    sizeH: number;
    originX: number;
    originY: number;
  } | null>(null);

  const isTextField = widget.type === 'text-field';
  const position = widget.position || { x: 0, y: 0 };
  const size = widget.size || { width: 340, height: 272 };
  const displayX = canvasOrigin.x + position.x;
  const displayY = canvasOrigin.y + position.y;
  const minWidth = isTextField ? TEXT_MIN_WIDTH : WIDGET_MIN_WIDTH;
  const minHeight = isTextField ? TEXT_MIN_HEIGHT : WIDGET_MIN_HEIGHT;

  useEffect(() => {
    if (!isInteracting) return;
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.userSelect = prev;
    };
  }, [isInteracting]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (interactionRef.current === 'idle' && pendingBodyDragRef.current) {
        const pending = pendingBodyDragRef.current;
        const dist = Math.hypot(e.clientX - pending.clientX, e.clientY - pending.clientY);
        if (dist < BODY_DRAG_THRESHOLD) return;
        pendingBodyDragRef.current = null;
        interactionRef.current = 'drag';
        dragStartRef.current = pending;
        setIsInteracting(true);
        clearTextSelection();
      }

      const mode = interactionRef.current;
      if (mode === 'idle') return;

      e.preventDefault();
      const el = widgetRef.current;
      if (!el) return;

      const start = dragStartRef.current;
      const z = zoomRef?.current ?? 1;
      const dx = (e.clientX - start.clientX) / z;
      const dy = (e.clientY - start.clientY) / z;

      if (mode === 'drag') {
        applyDragTranslate(el, dx, dy);
        onGroupDragLive?.(dx, dy);
        return;
      }

      const box = computeResizeBox(
        resizeHandleRef.current,
        { x: start.posX, y: start.posY, width: start.sizeW, height: start.sizeH },
        dx,
        dy,
        minWidth,
        minHeight
      );
      applyResizeBox(el, start.originX, start.originY, box.x, box.y, box.width, box.height);
    };

    const handleMouseUp = (e: MouseEvent) => {
      pendingBodyDragRef.current = null;
      const mode = interactionRef.current;
      if (mode === 'idle') return;

      interactionRef.current = 'idle';

      const el = widgetRef.current;
      const start = dragStartRef.current;
      const z = zoomRef?.current ?? 1;
      const dx = (e.clientX - start.clientX) / z;
      const dy = (e.clientY - start.clientY) / z;

      if (mode === 'drag') {
        if (el) clearDragTransform(el);
        onUpdatePosition(widget.id, { x: start.posX + dx, y: start.posY + dy });
        onGroupDragEnd?.(widget.id, dx, dy);
      } else {
        const box = computeResizeBox(
          resizeHandleRef.current,
          { x: start.posX, y: start.posY, width: start.sizeW, height: start.sizeH },
          dx,
          dy,
          minWidth,
          minHeight
        );
        if (el) pinElementBox(el, start.originX, start.originY, box.x, box.y, box.width, box.height);
        onUpdateSize(widget.id, { width: box.width, height: box.height });
        if (box.x !== start.posX || box.y !== start.posY) {
          onUpdatePosition(widget.id, { x: box.x, y: box.y });
        }
      }

      setIsInteracting(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('pointerup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('pointerup', handleMouseUp);
    };
  }, [widget.id, onUpdatePosition, onUpdateSize, onGroupDragLive, onGroupDragEnd, zoomRef, minWidth, minHeight]);

  useEffect(() => {
    const el = widgetRef.current;
    if (!el || isInteracting) return;
    if (peerOffset) applyDragTranslate(el, peerOffset.x, peerOffset.y);
    else clearDragTransform(el);
  }, [peerOffset, isInteracting]);

  const beginDragOrResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearTextSelection();
  };

  const startInteraction = (mode: InteractionMode, e: React.MouseEvent, handle?: ResizeHandle) => {
    beginDragOrResize(e);
    if (mode === 'resize' && handle) resizeHandleRef.current = handle;
    interactionRef.current = mode;
    setIsInteracting(true);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      posX: position.x,
      posY: position.y,
      sizeW: size.width,
      sizeH: size.height,
      originX: canvasOrigin.x,
      originY: canvasOrigin.y,
    };
  };

  const emitSelect = (e: { shiftKey: boolean }) => {
    onSelect?.({ shiftKey: e.shiftKey, keepGroup: isSelected && !e.shiftKey });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.resize-handle')) return;
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    emitSelect(e);
    startInteraction('drag', e);
  };

  const isChromeHit = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return true;
    return Boolean(el.closest('.resize-handle, button, a, input, select, textarea'));
  };

  const handleSelectOnly = (e: React.MouseEvent) => {
    if (isChromeHit(e.target)) return;
    e.stopPropagation();
    if (e.shiftKey) return;
    emitSelect(e);
  };

  const handlePointerCapture = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (isChromeHit(e.target)) return;
    if (e.shiftKey) {
      e.preventDefault();
      suppressTextSelectRef.current = true;
      clearTextSelection();
      onSelect?.({ shiftKey: true });
      return;
    }
    if (isInGroup) {
      e.preventDefault();
      suppressTextSelectRef.current = true;
      clearTextSelection();
      onSelect?.({ shiftKey: false, keepGroup: true });
      startInteraction('drag', e);
      return;
    }
    handleBodyDragCapture(e);
  };

  const handleBodyDragCapture = (e: React.MouseEvent) => {
    if (e.button !== 0 || e.detail < 2) return;
    if (isChromeHit(e.target)) return;
    emitSelect(e);
    pendingBodyDragRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      posX: position.x,
      posY: position.y,
      sizeW: size.width,
      sizeH: size.height,
      originX: canvasOrigin.x,
      originY: canvasOrigin.y,
    };
  };

  const handleResizeStart = (handle: ResizeHandle) => (e: React.MouseEvent) => {
    if (isTextField) emitSelect(e);
    startInteraction('resize', e, handle);
  };

  const handleTextWrapperMouseDown = (e: React.MouseEvent) => {
    if (isEditing) return;
    if ((e.target as HTMLElement).closest('.resize-handle')) return;
    e.stopPropagation();
    emitSelect(e);
  };

  return (
    <div
      ref={widgetRef}
      className={`absolute ${isTextField ? '' : 'group isolate'} ${isInteracting ? 'z-50 select-none' : isSelected ? 'z-40' : 'z-10'}`}
      style={{
        left: `${displayX}px`,
        top: `${displayY}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
      }}
      onMouseDown={isTextField ? handleTextWrapperMouseDown : undefined}
      onMouseDownCapture={isTextField ? undefined : handlePointerCapture}
    >
      {isTextField ? (
        <div className="relative h-full w-full">
          {isSelected && (
            <div className="absolute -top-9 left-0 z-30 flex items-center gap-0.5 rounded-md border border-zinc-700 bg-zinc-900/95 px-1 py-0.5 shadow-lg">
              <div
                className="cursor-move rounded p-1 hover:bg-zinc-800"
                onMouseDown={handleMouseDown}
                title="Move"
              >
                <GripVertical className="h-3.5 w-3.5 text-zinc-400" />
              </div>
              <button
                type="button"
                onClick={() => onRemove(widget.id)}
                className="rounded p-1 hover:bg-red-500/20"
                title="Remove"
              >
                <X className="h-3.5 w-3.5 text-zinc-400 hover:text-red-400" />
              </button>
            </div>
          )}

          <div
            className={`relative h-full w-full overflow-hidden rounded-sm ${
              isSelected
                ? 'border border-zinc-600/80'
                : 'hover:ring-1 hover:ring-zinc-600/60'
            }`}
          >
            <div
              data-text-body
              className={`relative z-10 h-full w-full overflow-hidden px-1 py-1 ${isInteracting ? 'pointer-events-none' : ''}`}
            >
              {children}
            </div>
          </div>

          {isSelected && !isEditing && (
            <>
              {RESIZE_HANDLES.map(({ id, className, cursor }) => (
                <div
                  key={id}
                  className={`resize-handle absolute z-50 h-3 w-3 select-none rounded-full border-2 border-yellow-400 bg-zinc-950 ${className} ${cursor}`}
                  onMouseDown={handleResizeStart(id)}
                />
              ))}
            </>
          )}
        </div>
      ) : (
        <>
          <Card
            className={`group h-full overflow-hidden border bg-zinc-900 ${
              isSelected
                ? 'border-zinc-600/80'
                : isPreviewSelected
                  ? 'border-yellow-400/80 shadow-[0_0_0_1px_rgba(250,204,21,0.55)]'
                  : 'border-zinc-800 hover:border-zinc-700'
            }`}
            onMouseDown={handleSelectOnly}
            onMouseUp={() => {
              suppressTextSelectRef.current = false;
            }}
            onSelectStart={(e) => {
              if (suppressTextSelectRef.current || e.shiftKey) e.preventDefault();
            }}
          >
            <button
              type="button"
              onClick={() => onRemove(widget.id)}
              className="absolute right-2 top-2 z-20 rounded p-1 opacity-0 transition-opacity hover:bg-red-500/20 group-hover:opacity-100"
              title="Remove"
            >
              <X className="h-4 w-4 text-gray-500 hover:text-red-400" />
            </button>

            <div
              className={`flex h-full min-h-0 flex-col overflow-hidden bg-zinc-900 p-3 ${isInteracting ? 'pointer-events-none' : ''}`}
            >
              <h3
                className="mb-2 shrink-0 cursor-move select-none truncate text-sm font-semibold text-white"
                onMouseDown={handleMouseDown}
                title="Drag to move"
              >
                <span className="inline-flex max-w-full items-center gap-1.5">
                  <span className="truncate">{displayWidgetTitle(widget)}</span>
                  {widget.type === 'line-chart' && (
                    <span className="shrink-0 rounded border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-yellow-400">
                      Binance
                    </span>
                  )}
                </span>
              </h3>
              <div className={widgetBodyClass(widget.type)}>
                {children}
              </div>
            </div>
          </Card>

          {isSelected &&
            RESIZE_HANDLES.map(({ id, className, cursor }) => (
              <div
                key={id}
                className={`resize-handle absolute z-50 h-3 w-3 select-none rounded-full border-2 border-yellow-400 bg-zinc-950 ${className} ${cursor}`}
                onMouseDown={handleResizeStart(id)}
              />
            ))}
        </>
      )}
    </div>
  );
}

export const FlexibleWidget = memo(FlexibleWidgetInner);
