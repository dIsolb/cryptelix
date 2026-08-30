import { Widget, WidgetType, widgetDefaultSize } from './DashboardWidget';
import { FlexibleWidget } from './FlexibleWidget';
import { ZoomIn, ZoomOut, LocateFixed } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DrawingCanvas } from './DrawingCanvas';
import { CanvasTextElement, type TextElementState, DEFAULT_FONT_SIZE, normalizeCommittedHtml } from './CanvasTextElement';
import { CanvasWidgetBody } from './CanvasWidgetBody';
import { DEFAULT_CANVAS_ZOOM, scaleSize } from '../lib/uiScale';
import {
  clientToWorldPoint,
  findStrokeAtPoint,
  normalizeRect,
  parseDrawingData,
  rectsIntersect,
  removeStrokesById,
  serializeDrawingData,
  strokeBounds,
  strokeIntersectsRect,
  translateStrokes,
  unionRects,
  type WorldRect,
} from '../lib/drawingStorage';

interface DashboardCanvasProps {
  widgets: Widget[];
  onAddWidget: (widget: Widget) => void;
  onRemoveWidget: (id: string) => void;
  onUpdateWidgetPosition: (id: string, position: { x: number; y: number }) => void;
  onUpdateWidgetSize: (id: string, size: { width: number; height: number }) => void;
  onUpdateWidgetData: (id: string, data: Record<string, unknown>) => void;
  isWidgetsOpen: boolean;
  isBrushActive: boolean;
  drawToolMode: 'brush' | 'eraser';
  onDrawToolModeChange: (mode: 'brush' | 'eraser') => void;
  brushColor: string;
  drawingDataUrl?: string;
  onDrawingChange?: (dataUrl: string) => void;
  canvasId?: string;
}

/** Workspace plane — scroll/pan in any direction (middle mouse, right mouse, or Space + drag) */
const WORLD_SIZE = 10000;
const WORLD_ORIGIN = WORLD_SIZE / 2;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
const ZOOM_WHEEL_STEP = 0.1;
const ZOOM_ANIM_MS = 280;
const SCROLL_TO_WIDGETS_MS = 520;

function clampScroll(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function getWorldPointAtAnchor(
  scrollLeft: number,
  scrollTop: number,
  zoomLevel: number,
  anchorX: number,
  anchorY: number
) {
  return {
    worldX: (scrollLeft + anchorX) / zoomLevel,
    worldY: (scrollTop + anchorY) / zoomLevel,
  };
}

function scrollForWorldPoint(
  worldX: number,
  worldY: number,
  zoomLevel: number,
  anchorX: number,
  anchorY: number
) {
  return {
    scrollLeft: worldX * zoomLevel - anchorX,
    scrollTop: worldY * zoomLevel - anchorY,
  };
}

type WorldBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
};

function getWidgetsWorldBounds(widgetList: Widget[]): WorldBounds | null {
  if (widgetList.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const widget of widgetList) {
    const x = WORLD_ORIGIN + (widget.position?.x ?? 0);
    const y = WORLD_ORIGIN + (widget.position?.y ?? 0);
    const width = widget.size?.width ?? 400;
    const height = widget.size?.height ?? 320;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function isBoundsInViewport(
  bounds: WorldBounds,
  scrollLeft: number,
  scrollTop: number,
  clientWidth: number,
  clientHeight: number,
  zoomLevel: number
): boolean {
  const viewLeft = scrollLeft / zoomLevel;
  const viewTop = scrollTop / zoomLevel;
  const viewRight = (scrollLeft + clientWidth) / zoomLevel;
  const viewBottom = (scrollTop + clientHeight) / zoomLevel;

  return !(
    bounds.maxX < viewLeft ||
    bounds.minX > viewRight ||
    bounds.maxY < viewTop ||
    bounds.minY > viewBottom
  );
}

function computeScrollTargetForBounds(
  bounds: WorldBounds,
  container: HTMLDivElement,
  zoomLevel: number
) {
  const anchorX = container.clientWidth / 2;
  const anchorY = container.clientHeight / 2;
  const { scrollLeft, scrollTop } = scrollForWorldPoint(
    bounds.centerX,
    bounds.centerY,
    zoomLevel,
    anchorX,
    anchorY
  );
  const maxScrollLeft = Math.max(0, WORLD_SIZE * zoomLevel - container.clientWidth);
  const maxScrollTop = Math.max(0, WORLD_SIZE * zoomLevel - container.clientHeight);

  return {
    scrollLeft: clampScroll(scrollLeft, maxScrollLeft),
    scrollTop: clampScroll(scrollTop, maxScrollTop),
  };
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function widgetWorldRect(widget: Widget): WorldRect {
  return {
    x: WORLD_ORIGIN + (widget.position?.x ?? 0),
    y: WORLD_ORIGIN + (widget.position?.y ?? 0),
    width: widget.size?.width ?? 400,
    height: widget.size?.height ?? 320,
  };
}

function widgetToTextElement(widget: Widget): TextElementState {
  const data = (widget.data ?? {}) as { text?: string; html?: string; fontSize?: number };
  const rawHtml = data.html ?? '';
  const htmlFromText = data.text ? data.text.replace(/\n/g, '<br>') : '';
  const sourceHtml =
    rawHtml.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim().length > 0
      ? rawHtml
      : htmlFromText;
  const html = normalizeCommittedHtml(sourceHtml);
  return {
    id: widget.id,
    text: data.text ?? '',
    html,
    fontSize: typeof data.fontSize === 'number' ? data.fontSize : DEFAULT_FONT_SIZE,
    x: widget.position?.x ?? 0,
    y: widget.position?.y ?? 0,
    width: widget.size?.width ?? 280,
    height: widget.size?.height ?? 120,
  };
}

export function DashboardCanvas({ 
  widgets, 
  onAddWidget, 
  onRemoveWidget, 
  onUpdateWidgetPosition, 
  onUpdateWidgetSize,
  onUpdateWidgetData,
  isWidgetsOpen,
  isBrushActive,
  drawToolMode,
  brushColor,
  drawingDataUrl,
  onDrawingChange,
  canvasId,
}: DashboardCanvasProps) {
  const [zoom, setZoom] = useState(DEFAULT_CANVAS_ZOOM);
  const zoomRef = useRef(DEFAULT_CANVAS_ZOOM);
  const zoomAnimFrameRef = useRef<number | null>(null);
  const scrollAnimFrameRef = useRef<number | null>(null);
  const zoomLabelRef = useRef<HTMLSpanElement | null>(null);
  const isZoomAnimatingRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<string[]>([]);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<WorldRect | null>(null);
  const [isMarqueeing, setIsMarqueeing] = useState(false);
  const [groupDrag, setGroupDrag] = useState<{ sourceId: string; dx: number; dy: number } | null>(
    null
  );
  const [boundsDragging, setBoundsDragging] = useState(false);
  const [widgetsOffScreen, setWidgetsOffScreen] = useState(false);
  const [isScrollingToWidgets, setIsScrollingToWidgets] = useState(false);
  const knownTextWidgetIdsRef = useRef(new Set<string>());
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeRef = useRef<WorldRect | null>(null);
  const groupBoundsDragRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const selectedWidgetIdsRef = useRef<string[]>([]);
  const selectedStrokeIdsRef = useRef<string[]>([]);
  selectedWidgetIdsRef.current = selectedWidgetIds;
  selectedStrokeIdsRef.current = selectedStrokeIds;
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const worldSurfaceRef = useRef<HTMLDivElement | null>(null);
  const hasCenteredScrollRef = useRef(false);
  const panStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  });

  const centerViewportOnOrigin = (zoomLevel: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const targetLeft = WORLD_ORIGIN * zoomLevel - container.clientWidth / 2;
    const targetTop = WORLD_ORIGIN * zoomLevel - container.clientHeight / 2;
    container.scrollLeft = Math.max(0, targetLeft);
    container.scrollTop = Math.max(0, targetTop);
  };

  const updateZoomLabel = (level: number) => {
    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${Math.round(level * 100)}%`;
    }
  };

  const syncWorldTransform = (level: number) => {
    const el = worldSurfaceRef.current;
    if (!el) return;
    el.style.transform = `scale(${level})`;
  };

  const setZoomAnimating = (active: boolean) => {
    isZoomAnimatingRef.current = active;
    const el = worldSurfaceRef.current;
    if (!el) return;
    if (active) {
      el.style.willChange = 'transform';
    } else {
      el.style.willChange = '';
    }
  };

  const commitZoom = (level: number) => {
    zoomRef.current = level;
    syncWorldTransform(level);
    updateZoomLabel(level);
    setZoom(level);
  };

  useEffect(() => {
    if (isZoomAnimatingRef.current) return;
    zoomRef.current = zoom;
    syncWorldTransform(zoom);
    updateZoomLabel(zoom);
  }, [zoom]);

  useEffect(() => {
    return () => {
      if (zoomAnimFrameRef.current != null) {
        cancelAnimationFrame(zoomAnimFrameRef.current);
      }
      if (scrollAnimFrameRef.current != null) {
        cancelAnimationFrame(scrollAnimFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hasCenteredScrollRef.current) return;
    const id = requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container || container.clientWidth === 0) return;
      syncWorldTransform(zoomRef.current);
      updateZoomLabel(zoomRef.current);
      centerViewportOnOrigin(zoomRef.current);
      hasCenteredScrollRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const cancelScrollAnimation = () => {
    if (scrollAnimFrameRef.current != null) {
      cancelAnimationFrame(scrollAnimFrameRef.current);
      scrollAnimFrameRef.current = null;
    }
    setIsScrollingToWidgets(false);
  };

  const cancelZoomAnimation = () => {
    cancelScrollAnimation();
    if (zoomAnimFrameRef.current != null) {
      cancelAnimationFrame(zoomAnimFrameRef.current);
      zoomAnimFrameRef.current = null;
    }
    if (isZoomAnimatingRef.current) {
      setZoomAnimating(false);
      commitZoom(zoomRef.current);
    }
  };

  const applyZoomAtAnchor = (
    nextZoom: number,
    anchorX: number,
    anchorY: number,
    options?: { animate?: boolean }
  ) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const targetZoom = clampZoom(nextZoom);
    const startZoom = zoomRef.current;
    if (Math.abs(targetZoom - startZoom) < 0.001) return;

    cancelZoomAnimation();

    const { worldX, worldY } = getWorldPointAtAnchor(
      container.scrollLeft,
      container.scrollTop,
      startZoom,
      anchorX,
      anchorY
    );

    if (!options?.animate) {
      const { scrollLeft, scrollTop } = scrollForWorldPoint(
        worldX,
        worldY,
        targetZoom,
        anchorX,
        anchorY
      );
      container.scrollLeft = scrollLeft;
      container.scrollTop = scrollTop;
      commitZoom(targetZoom);
      return;
    }

    setZoomAnimating(true);
    const startTime = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / ZOOM_ANIM_MS);
      const currentZoom = startZoom + (targetZoom - startZoom) * easeOutCubic(progress);
      const { scrollLeft, scrollTop } = scrollForWorldPoint(
        worldX,
        worldY,
        currentZoom,
        anchorX,
        anchorY
      );

      zoomRef.current = currentZoom;
      syncWorldTransform(currentZoom);
      updateZoomLabel(currentZoom);
      container.scrollLeft = scrollLeft;
      container.scrollTop = scrollTop;

      if (progress < 1) {
        zoomAnimFrameRef.current = requestAnimationFrame(tick);
      } else {
        zoomAnimFrameRef.current = null;
        setZoomAnimating(false);
        commitZoom(targetZoom);
      }
    };

    zoomAnimFrameRef.current = requestAnimationFrame(tick);
  };

  const getViewportCenter = (container: HTMLDivElement) => ({
    anchorX: container.clientWidth / 2,
    anchorY: container.clientHeight / 2,
  });

  const zoomFromViewportCenter = useCallback((delta: number, animate = true) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { anchorX, anchorY } = getViewportCenter(container);
    applyZoomAtAnchor(zoomRef.current + delta, anchorX, anchorY, { animate });
  }, []);

  const handleZoomIn = useCallback(() => {
    zoomFromViewportCenter(ZOOM_STEP, true);
  }, [zoomFromViewportCenter]);

  const handleZoomOut = useCallback(() => {
    zoomFromViewportCenter(-ZOOM_STEP, true);
  }, [zoomFromViewportCenter]);

  const handleResetZoom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { anchorX, anchorY } = getViewportCenter(container);
    applyZoomAtAnchor(DEFAULT_CANVAS_ZOOM, anchorX, anchorY, { animate: true });
  }, []);

  const updateWidgetsVisibility = useCallback(() => {
    const container = scrollContainerRef.current;
    const bounds = getWidgetsWorldBounds(widgets);
    if (!container || !bounds) {
      setWidgetsOffScreen(false);
      return;
    }
    const visible = isBoundsInViewport(
      bounds,
      container.scrollLeft,
      container.scrollTop,
      container.clientWidth,
      container.clientHeight,
      zoomRef.current
    );
    setWidgetsOffScreen(!visible);
  }, [widgets]);

  const animateScrollTo = useCallback(
    (targetLeft: number, targetTop: number, onComplete?: () => void) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      cancelScrollAnimation();

      const startLeft = container.scrollLeft;
      const startTop = container.scrollTop;
      const deltaLeft = targetLeft - startLeft;
      const deltaTop = targetTop - startTop;

      if (Math.abs(deltaLeft) < 1 && Math.abs(deltaTop) < 1) {
        onComplete?.();
        return;
      }

      setIsScrollingToWidgets(true);
      const startTime = performance.now();

      const tick = (now: number) => {
        const progress = Math.min(1, (now - startTime) / SCROLL_TO_WIDGETS_MS);
        const eased = easeInOutCubic(progress);
        container.scrollLeft = startLeft + deltaLeft * eased;
        container.scrollTop = startTop + deltaTop * eased;

        if (progress < 1) {
          scrollAnimFrameRef.current = requestAnimationFrame(tick);
        } else {
          scrollAnimFrameRef.current = null;
          setIsScrollingToWidgets(false);
          updateWidgetsVisibility();
          onComplete?.();
        }
      };

      scrollAnimFrameRef.current = requestAnimationFrame(tick);
    },
    [updateWidgetsVisibility]
  );

  const handleGoToWidgets = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    cancelScrollAnimation();

    const bounds = getWidgetsWorldBounds(widgets);
    const zoomLevel = zoomRef.current;

    if (!bounds) {
      const anchorX = container.clientWidth / 2;
      const anchorY = container.clientHeight / 2;
      const targetLeft = clampScroll(
        WORLD_ORIGIN * zoomLevel - anchorX,
        Math.max(0, WORLD_SIZE * zoomLevel - container.clientWidth)
      );
      const targetTop = clampScroll(
        WORLD_ORIGIN * zoomLevel - anchorY,
        Math.max(0, WORLD_SIZE * zoomLevel - container.clientHeight)
      );
      animateScrollTo(targetLeft, targetTop);
      return;
    }

    const { scrollLeft, scrollTop } = computeScrollTargetForBounds(bounds, container, zoomLevel);
    animateScrollTo(scrollLeft, scrollTop);
  }, [widgets, animateScrollTo]);

  useEffect(() => {
    updateWidgetsVisibility();
    const container = scrollContainerRef.current;
    if (!container) return;

    const onScroll = () => {
      if (!scrollAnimFrameRef.current) {
        updateWidgetsVisibility();
      }
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      container.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [updateWidgetsVisibility, widgets.length]);

  useEffect(() => {
    updateWidgetsVisibility();
  }, [zoom, updateWidgetsVisibility]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const state = panStateRef.current;
      const container = scrollContainerRef.current;
      if (!state.active || !container) return;

      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      container.scrollLeft = state.startScrollLeft - dx;
      container.scrollTop = state.startScrollTop - dy;
    };

    const stopPanning = () => {
      if (!panStateRef.current.active) return;
      panStateRef.current.active = false;
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopPanning);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopPanning);
    };
  }, []);

  useEffect(() => {
    const stopPanningFromRef = () => {
      if (panStateRef.current.active) {
        panStateRef.current.active = false;
        setIsPanning(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      e.preventDefault();
      setSpaceHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
        stopPanningFromRef();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const startPan = (event: React.MouseEvent<HTMLDivElement>) => {
    cancelScrollAnimation();
    const container = scrollContainerRef.current;
    if (!container) return;
    event.preventDefault();

    panStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: container.scrollLeft,
      startScrollTop: container.scrollTop,
    };
    setIsPanning(true);
  };

  const clearSelection = useCallback(() => {
    setSelectedWidgetIds([]);
    setSelectedStrokeIds([]);
    setEditingWidgetId(null);
  }, []);

  const selectWidget = useCallback((id: string, event?: { shiftKey: boolean; keepGroup?: boolean }) => {
    if (event?.shiftKey) {
      setSelectedWidgetIds((prev) => {
        const next =
          event.keepGroup && prev.includes(id)
            ? prev
            : event.keepGroup
              ? [...prev, id]
              : toggleId(prev, id);
        selectedWidgetIdsRef.current = next;
        return next;
      });
      setEditingWidgetId(null);
      return;
    }
    if (event?.keepGroup) return;
    selectedWidgetIdsRef.current = [id];
    selectedStrokeIdsRef.current = [];
    setSelectedWidgetIds([id]);
    setSelectedStrokeIds([]);
  }, []);

  const handleGroupDragLive = useCallback((sourceId: string, dx: number, dy: number) => {
    setGroupDrag({ sourceId, dx, dy });
  }, []);

  const handleGroupDragEnd = useCallback(
    (sourceId: string, dx: number, dy: number) => {
      setGroupDrag(null);
      for (const id of selectedWidgetIdsRef.current) {
        if (id === sourceId) continue;
        const widget = widgets.find((item) => item.id === id);
        if (!widget) continue;
        onUpdateWidgetPosition(id, {
          x: (widget.position?.x ?? 0) + dx,
          y: (widget.position?.y ?? 0) + dy,
        });
      }
      const strokeIds = selectedStrokeIdsRef.current;
      if (strokeIds.length && onDrawingChange) {
        const next = {
          version: 1 as const,
          strokes: translateStrokes(
            parseDrawingData(drawingDataUrl).strokes,
            strokeIds,
            dx,
            dy
          ),
        };
        onDrawingChange(serializeDrawingData(next));
      }
    },
    [widgets, onUpdateWidgetPosition, onDrawingChange, drawingDataUrl]
  );

  useEffect(() => {
    for (const w of widgets) {
      if (w.type !== 'text-field' || knownTextWidgetIdsRef.current.has(w.id)) continue;
      knownTextWidgetIdsRef.current.add(w.id);
      setSelectedWidgetIds([w.id]);
      setSelectedStrokeIds([]);
      setEditingWidgetId(w.id);
    }
  }, [widgets]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      const zoomIn =
        (e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey);
      const zoomOut = (e.key === '-' || e.key === '_') && (e.ctrlKey || e.metaKey);
      const resetZoom = e.key === '0' && (e.ctrlKey || e.metaKey);

      if (zoomIn) {
        e.preventDefault();
        handleZoomIn();
      } else if (zoomOut) {
        e.preventDefault();
        handleZoomOut();
      } else if (resetZoom) {
        e.preventDefault();
        handleResetZoom();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleZoomIn, handleZoomOut, handleResetZoom]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete') return;
      if (selectedWidgetIds.length === 0 && selectedStrokeIds.length === 0) return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      if (
        editingWidgetId &&
        selectedWidgetIds.length === 1 &&
        selectedWidgetIds[0] === editingWidgetId &&
        selectedStrokeIds.length === 0
      ) {
        const widget = widgets.find((item) => item.id === editingWidgetId);
        if (widget?.type === 'text-field') return;
      }

      e.preventDefault();
      for (const id of selectedWidgetIds) {
        onRemoveWidget(id);
      }
      if (selectedStrokeIds.length && onDrawingChange) {
        onDrawingChange(
          serializeDrawingData({
            version: 1,
            strokes: removeStrokesById(parseDrawingData(drawingDataUrl).strokes, selectedStrokeIds),
          })
        );
      }
      clearSelection();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedWidgetIds,
    selectedStrokeIds,
    editingWidgetId,
    widgets,
    onRemoveWidget,
    onDrawingChange,
    drawingDataUrl,
    clearSelection,
  ]);

  useEffect(() => {
    marqueeRef.current = marquee;
  }, [marquee]);

  useEffect(() => {
    if (!isMarqueeing) return;

    const onMove = (event: MouseEvent) => {
      const start = marqueeStartRef.current;
      const worldEl = worldSurfaceRef.current;
      if (!start || !worldEl) return;
      const point = clientToWorldPoint(event.clientX, event.clientY, worldEl, zoomRef.current);
      setMarquee(normalizeRect(start.x, start.y, point.x, point.y));
    };

    const onUp = () => {
      const current = marqueeRef.current;
      marqueeStartRef.current = null;
      setIsMarqueeing(false);
      setMarquee(null);
      if (!current || (current.width < 4 && current.height < 4)) {
        clearSelection();
        return;
      }

      const nextWidgets = widgets
        .filter((widget) => rectsIntersect(widgetWorldRect(widget), current))
        .map((widget) => widget.id);
      const nextStrokes = parseDrawingData(drawingDataUrl)
        .strokes.filter((stroke) => strokeIntersectsRect(stroke, current))
        .map((stroke) => stroke.id);

      setSelectedWidgetIds(nextWidgets);
      setSelectedStrokeIds(nextStrokes);
      setEditingWidgetId(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isMarqueeing, widgets, drawingDataUrl, clearSelection]);

  useEffect(() => {
    if (!boundsDragging) return;

    const onMove = (event: MouseEvent) => {
      const start = groupBoundsDragRef.current;
      if (!start) return;
      const z = zoomRef.current;
      setGroupDrag({
        sourceId: '__bounds__',
        dx: (event.clientX - start.clientX) / z,
        dy: (event.clientY - start.clientY) / z,
      });
    };

    const onUp = (event: MouseEvent) => {
      const start = groupBoundsDragRef.current;
      groupBoundsDragRef.current = null;
      setBoundsDragging(false);
      if (!start) {
        setGroupDrag(null);
        return;
      }
      const z = zoomRef.current;
      handleGroupDragEnd(
        '__bounds__',
        (event.clientX - start.clientX) / z,
        (event.clientY - start.clientY) / z
      );
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [boundsDragging, handleGroupDragEnd]);

  const handleWorldMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || spaceHeld || isBrushActive) return;
    if (event.target !== event.currentTarget) return;

    const worldEl = worldSurfaceRef.current;
    if (!worldEl) return;
    const point = clientToWorldPoint(event.clientX, event.clientY, worldEl, zoomRef.current);
    const hit = findStrokeAtPoint(parseDrawingData(drawingDataUrl).strokes, point);

    if (event.shiftKey) {
      if (hit) setSelectedStrokeIds((prev) => toggleId(prev, hit.id));
      return;
    }

    if (hit) {
      setSelectedStrokeIds([hit.id]);
      setSelectedWidgetIds([]);
      setEditingWidgetId(null);
      return;
    }

    event.preventDefault();
    marqueeStartRef.current = { x: point.x, y: point.y };
    setMarquee(normalizeRect(point.x, point.y, point.x, point.y));
    setIsMarqueeing(true);
  };

  const handleCanvasMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const isMiddle = event.button === 1;
    const isRight = event.button === 2;
    const isSpaceLeft = event.button === 0 && spaceHeld;
    if (!isMiddle && !isRight && !isSpaceLeft) return;
    clearSelection();
    startPan(event);
  };

  const handleTextElementUpdate = (updated: TextElementState) => {
    onUpdateWidgetPosition(updated.id, { x: updated.x, y: updated.y });
    onUpdateWidgetSize(updated.id, { width: updated.width, height: updated.height });
    onUpdateWidgetData(updated.id, {
      text: updated.text,
      html: updated.html,
      fontSize: updated.fontSize,
    });
  };

  // Native non-passive wheel: Ctrl/Cmd+wheel zooms. Plain wheel scrolls a
  // widget body when it overflows (FTR, Portfolio, text). Otherwise the
  // canvas scroll container pans as usual.
  const applyZoomAtAnchorRef = useRef(applyZoomAtAnchor);
  applyZoomAtAnchorRef.current = applyZoomAtAnchor;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const findWidgetScrollable = (start: EventTarget | null): HTMLElement | null => {
      let el = start instanceof Element ? start : null;
      while (el && el !== container) {
        if (el instanceof HTMLElement) {
          const style = window.getComputedStyle(el);
          const y =
            (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 1;
          const x =
            (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
            el.scrollWidth > el.clientWidth + 1;
          if (y || x) return el;
        }
        el = el.parentElement;
      }
      return null;
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const rect = container.getBoundingClientRect();
        const anchorX = event.clientX - rect.left;
        const anchorY = event.clientY - rect.top;
        const prevZoom = zoomRef.current;
        const delta = event.deltaY < 0 ? ZOOM_WHEEL_STEP : -ZOOM_WHEEL_STEP;
        const nextZoom = clampZoom(prevZoom + delta);
        if (nextZoom === prevZoom) return;
        applyZoomAtAnchorRef.current(nextZoom, anchorX, anchorY);
        return;
      }

      const scrollable = findWidgetScrollable(event.target);
      if (!scrollable) return;

      // At the widget edge, swallow the event so the canvas does not pan.
      event.preventDefault();
      event.stopPropagation();

      const dy = event.deltaY;
      const dx = event.deltaX;
      const canY =
        (dy < 0 && scrollable.scrollTop > 0) ||
        (dy > 0 && scrollable.scrollTop + scrollable.clientHeight < scrollable.scrollHeight - 1);
      const canX =
        (dx < 0 && scrollable.scrollLeft > 0) ||
        (dx > 0 && scrollable.scrollLeft + scrollable.clientWidth < scrollable.scrollWidth - 1);

      if (canY) scrollable.scrollTop += dy;
      if (canX) scrollable.scrollLeft += dx;
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  const handleAddWidgetFromToolbar = (type: WidgetType) => {
    const widgetTitles: Record<WidgetType, string> = {
      'line-chart': 'Price Chart',
      'bar-chart': 'WvL',
      'pie-chart': 'Volume Mix',
      'area-chart': 'Cul. PnL',
      'stats-card': 'Key Metrics',
      'table': 'Full Trading Report',
      'portfolio': 'Portfolio Analytics',
      'text-field': 'Text',
      'portfolio-widget': 'Portfolio Analytics',
      'pnl-calendar': 'PnL Calendar',
      'symbol-scorecard': 'Symbol Scorecard',
      'session-heatmap': 'Session Heatmap',
    };

    const randomX = Math.floor(Math.random() * 400) + 50;
    const randomY = Math.floor(Math.random() * 200) + 50;
    const def = widgetDefaultSize(type);

    const newWidget: Widget = {
      id: `widget-${Date.now()}-${Math.random()}`,
      type,
      title: widgetTitles[type] || 'Widget',
      position: { x: randomX, y: randomY },
      size: scaleSize(def.width, def.height),
    };
    onAddWidget(newWidget);
  };

  const handleExtractMetric = useCallback(
    (label: string, value: string | number, isPositive?: boolean, isNegative?: boolean) => {
      const ftrMetricKey = `ftr:${label}`;
      if (widgets.some((w) => w.data?.ftrMetricKey === ftrMetricKey)) {
        return;
      }
      const newWidget: Widget = {
        id: `ftr-spawn-${ftrMetricKey.replace(/[^\w-]+/g, '-').slice(0, 96)}`,
        type: 'stats-card',
        title: label,
        position: { x: Math.floor(Math.random() * 400) + 50, y: Math.floor(Math.random() * 200) + 50 },
        size: { width: 300, height: 180 },
        data: { value, isPositive, isNegative, ftrMetricKey },
      };
      onAddWidget(newWidget);
    },
    [widgets, onAddWidget]
  );

  const panCursor = isPanning ? 'cursor-grabbing' : spaceHeld ? 'cursor-grab' : 'cursor-default';

  const canvasControlButtonClass =
    'box-border flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-zinc-900/90 p-0 backdrop-blur-sm transition-colors hover:bg-zinc-800 disabled:opacity-60';
  const canvasControlIconClass = 'h-4 w-4 shrink-0 text-gray-400';
  const canvasControlZoomLabelClass =
    'max-w-full truncate text-[10px] font-medium leading-none tabular-nums text-gray-400';

  const strokeGroupUnion =
    selectedWidgetIds.length === 0 && selectedStrokeIds.length > 0
      ? unionRects(
          parseDrawingData(drawingDataUrl)
            .strokes.filter((stroke) => selectedStrokeIds.includes(stroke.id))
            .map((stroke) => strokeBounds(stroke))
            .filter((rect): rect is WorldRect => rect !== null)
        )
      : null;
  const marqueePreviewWidgetIds =
    marquee && (marquee.width > 2 || marquee.height > 2)
      ? new Set(
          widgets
            .filter((widget) => rectsIntersect(widgetWorldRect(widget), marquee))
            .map((widget) => widget.id)
        )
      : null;

  const strokeGroupBounds = strokeGroupUnion
    ? {
        x: strokeGroupUnion.x - 8,
        y: strokeGroupUnion.y - 8,
        width: strokeGroupUnion.width + 16,
        height: strokeGroupUnion.height + 16,
      }
    : null;

  return (
    <div className="relative flex h-full flex-col bg-zinc-950">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-zinc-950">
        <div
          ref={scrollContainerRef}
          className={`absolute inset-0 overflow-auto scrollbar-hidden ${panCursor}`}
          onMouseDown={handleCanvasMouseDown}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            ref={worldSurfaceRef}
            className={`relative origin-top-left ${isMarqueeing ? 'select-none' : ''}`}
            onMouseDown={handleWorldMouseDown}
            style={{
              width: WORLD_SIZE,
              height: WORLD_SIZE,
              transformOrigin: '0 0',
              backgroundColor: '#09090b',
              backgroundImage: `
                radial-gradient(circle, rgba(250, 204, 21, 0.08) 1px, transparent 1px),
                linear-gradient(rgba(250, 204, 21, 0.02) 1px, transparent 1px),
                linear-gradient(90deg, rgba(250, 204, 21, 0.02) 1px, transparent 1px)
              `,
              backgroundSize: `24px 24px, 48px 48px, 48px 48px`,
            }}
          >
            {widgets.map((widget) => {
              if (widget.type === 'text-field') {
                const isSelected = selectedWidgetIds.includes(widget.id);
                const isEditing = editingWidgetId === widget.id;
                return (
                  <CanvasTextElement
                    key={widget.id}
                    element={widgetToTextElement(widget)}
                    isSelected={isSelected}
                    isInGroup={isSelected && selectedWidgetIds.length > 1}
                    isPreviewSelected={Boolean(marqueePreviewWidgetIds?.has(widget.id))}
                    isEditing={isEditing}
                    canvasOrigin={{ x: WORLD_ORIGIN, y: WORLD_ORIGIN }}
                    zoomRef={zoomRef}
                    peerOffset={
                      groupDrag &&
                      isSelected &&
                      groupDrag.sourceId !== widget.id
                        ? { x: groupDrag.dx, y: groupDrag.dy }
                        : null
                    }
                    onSelect={(event) => {
                      selectWidget(widget.id, event);
                      if (!event?.shiftKey && !event?.keepGroup) {
                        setEditingWidgetId(widget.id);
                      }
                    }}
                    onStartEdit={() => {
                      selectWidget(widget.id);
                      setEditingWidgetId(widget.id);
                    }}
                    onEndEdit={() => setEditingWidgetId(null)}
                    onUpdate={handleTextElementUpdate}
                    onRemove={(id) => {
                      setSelectedWidgetIds((prev) => prev.filter((item) => item !== id));
                      onRemoveWidget(id);
                    }}
                    onGroupDragLive={(dx, dy) => handleGroupDragLive(widget.id, dx, dy)}
                    onGroupDragEnd={handleGroupDragEnd}
                  />
                );
              }

              const isSelected = selectedWidgetIds.includes(widget.id);
              return (
                <FlexibleWidget
                  key={widget.id}
                  widget={widget}
                  onRemove={(id) => {
                    setSelectedWidgetIds((prev) => prev.filter((item) => item !== id));
                    onRemoveWidget(id);
                  }}
                  onUpdatePosition={onUpdateWidgetPosition}
                  onUpdateSize={onUpdateWidgetSize}
                  canvasOrigin={{ x: WORLD_ORIGIN, y: WORLD_ORIGIN }}
                  zoomRef={zoomRef}
                  isSelected={isSelected}
                  isInGroup={isSelected && selectedWidgetIds.length > 1}
                  isPreviewSelected={Boolean(marqueePreviewWidgetIds?.has(widget.id))}
                  peerOffset={
                    groupDrag &&
                    isSelected &&
                    groupDrag.sourceId !== widget.id
                      ? { x: groupDrag.dx, y: groupDrag.dy }
                      : null
                  }
                  onSelect={(event) => {
                    selectWidget(widget.id, event);
                    if (!event?.shiftKey) setEditingWidgetId(null);
                  }}
                  onGroupDragLive={(dx, dy) => handleGroupDragLive(widget.id, dx, dy)}
                  onGroupDragEnd={handleGroupDragEnd}
                >
                  <CanvasWidgetBody widget={widget} onExtractMetric={handleExtractMetric} />
                </FlexibleWidget>
              );
            })}

            <DrawingCanvas
              isActive={isBrushActive}
              toolMode={drawToolMode}
              color={brushColor}
              canvasId={canvasId}
              worldSize={WORLD_SIZE}
              drawingData={drawingDataUrl}
              onDrawingChange={onDrawingChange}
              worldRef={worldSurfaceRef}
              zoomRef={zoomRef}
              selectedStrokeIds={selectedStrokeIds}
              previewOffset={
                groupDrag && selectedStrokeIds.length > 0
                  ? { x: groupDrag.dx, y: groupDrag.dy }
                  : null
              }
            />

            {strokeGroupBounds && (
              <div
                className="absolute z-[46] cursor-move rounded-sm border border-zinc-400/90 bg-zinc-400/15"
                style={{
                  left: strokeGroupBounds.x,
                  top: strokeGroupBounds.y,
                  width: Math.max(8, strokeGroupBounds.width),
                  height: Math.max(8, strokeGroupBounds.height),
                  transform: groupDrag
                    ? `translate3d(${groupDrag.dx}px, ${groupDrag.dy}px, 0)`
                    : undefined,
                }}
                onMouseDown={(event) => {
                  if (event.button !== 0 || isBrushActive) return;
                  event.preventDefault();
                  event.stopPropagation();
                  groupBoundsDragRef.current = { clientX: event.clientX, clientY: event.clientY };
                  setGroupDrag({ sourceId: '__bounds__', dx: 0, dy: 0 });
                  setBoundsDragging(true);
                }}
              />
            )}

            {marquee && (marquee.width > 0 || marquee.height > 0) && (
              <div
                className="pointer-events-none absolute z-[48] border border-zinc-400 bg-zinc-400/25"
                style={{
                  left: marquee.x,
                  top: marquee.y,
                  width: marquee.width,
                  height: marquee.height,
                }}
              />
            )}
          </div>
        </div>

      </div>

      {/* Fixed UI overlays — outside scroll/zoom layer (above floating bottom menu) */}
      <div className="pointer-events-none absolute inset-0 z-40">
        <div
          className="pointer-events-auto absolute bottom-28 right-3 flex flex-col gap-2 sm:bottom-20 sm:right-6"
          style={{ transform: 'none' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            data-guide="go-to-widgets"
            onClick={handleGoToWidgets}
            disabled={isScrollingToWidgets}
            className={`${canvasControlButtonClass} ${
              widgetsOffScreen
                ? 'border-yellow-500/60 bg-yellow-500/15 shadow-[0_0_14px_rgba(250,204,21,0.2)] hover:bg-yellow-500/25'
                : 'border-zinc-700 hover:border-yellow-500/50'
            } ${widgetsOffScreen && !isScrollingToWidgets ? 'animate-pulse' : ''}`}
            title="Go to widgets"
            aria-label="Go to widgets"
          >
            <LocateFixed
              className={`${canvasControlIconClass} ${widgetsOffScreen ? 'text-yellow-400' : ''}`}
            />
          </button>
          <button
            type="button"
            data-guide="zoom-in"
            onClick={handleZoomIn}
            className={`${canvasControlButtonClass} border-zinc-700 hover:border-yellow-500/50`}
            title="Zoom In"
            aria-label="Zoom in"
          >
            <ZoomIn className={canvasControlIconClass} />
          </button>
          <button
            type="button"
            onClick={handleResetZoom}
            className={`${canvasControlButtonClass} border-zinc-700 hover:border-yellow-500/50`}
            title="Reset zoom to 100%"
            aria-label="Reset zoom"
          >
            <span ref={zoomLabelRef} className={canvasControlZoomLabelClass}>
              {Math.round(zoom * 100)}%
            </span>
          </button>
          <button
            type="button"
            data-guide="zoom-out"
            onClick={handleZoomOut}
            className={`${canvasControlButtonClass} border-zinc-700 hover:border-yellow-500/50`}
            title="Zoom Out"
            aria-label="Zoom out"
          >
            <ZoomOut className={canvasControlIconClass} />
          </button>
        </div>
      </div>
    </div>
  );
}