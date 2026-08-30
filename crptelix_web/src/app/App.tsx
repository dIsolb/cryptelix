import { useCallback, useEffect, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { AiBot } from './components/AiBot';
import { AuthGate } from './components/auth/AuthGate';
import { DashboardCanvas } from './components/DashboardCanvas';
import { Widget, widgetDefaultSize } from './components/DashboardWidget';
import { TopBar } from './components/TopBar';
import { DataBase } from './components/DataBase';
import { ConstructorBottomMenu } from './components/ConstructorBottomMenu';
import { FeedbackSurveyHost } from './components/FeedbackSurveyHost';
import { CanvasHelpHint } from './components/CanvasHelpHint';
import { AppGuide, type GuidePhase } from './components/AppGuide';
import { loadConstructorState, saveConstructorState } from './lib/dashboardStorage';
import { DEFAULT_FONT_SIZE } from './components/CanvasTextElement';
import { scalePx, scaleSize } from './lib/uiScale';
import { APP_GUIDE_STEPS } from './lib/appGuideSteps';
import { hasSeenAppGuide, markAppGuideSeen } from './lib/appGuideStorage';
import type { AuthUser } from './lib/authStorage';

interface Canvas {
  id: string;
  name: string;
  widgets: Widget[];
}

function AuthenticatedApp({ user, logout }: { user: AuthUser; logout: () => void }) {
  const [initialState] = useState(() => loadConstructorState());
  const [canvases, setCanvases] = useState<Canvas[]>(initialState.canvases);
  const [activeCanvasId, setActiveCanvasId] = useState(initialState.activeCanvasId);
  const [currentView, setCurrentView] = useState<'constructor' | 'database'>('constructor');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isWidgetsOpen, setIsWidgetsOpen] = useState(false);
  const [isBrushActive, setIsBrushActive] = useState(false);
  const [drawToolMode, setDrawToolMode] = useState<'brush' | 'eraser'>('brush');
  const [brushColor, setBrushColor] = useState(initialState.brushColor);
  const [drawingsByCanvasId, setDrawingsByCanvasId] = useState<Record<string, string>>(
    initialState.drawingsByCanvasId
  );
  const [guidePhase, setGuidePhase] = useState<GuidePhase>('idle');
  const [tourIndex, setTourIndex] = useState(0);

  const activeCanvas = canvases.find((c) => c.id === activeCanvasId);
  const widgets = activeCanvas?.widgets || [];
  const guideActive = guidePhase !== 'idle';

  const addCanvas = () => {
    const newCanvas: Canvas = {
      id: `canvas-${Date.now()}`,
      name: `Dashboard ${canvases.length + 1}`,
      widgets: [],
    };
    setCanvases((prev) => [...prev, newCanvas]);
    setActiveCanvasId(newCanvas.id);
  };

  const renameCanvas = (id: string, newName: string) => {
    setCanvases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: newName } : c))
    );
  };

  const deleteCanvas = (id: string) => {
    if (canvases.length <= 1) return; // Don't delete if it's the last canvas

    setCanvases((prev) => prev.filter((c) => c.id !== id));
    setDrawingsByCanvasId((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    // If deleting the active canvas, switch to the first remaining canvas
    if (id === activeCanvasId) {
      const remainingCanvases = canvases.filter((c) => c.id !== id);
      if (remainingCanvases.length > 0) {
        setActiveCanvasId(remainingCanvases[0].id);
      }
    }
  };

  const handleAddWidget = (widget: Widget) => {
    setCanvases((prev) =>
      prev.map((c) =>
        c.id === activeCanvasId ? { ...c, widgets: [...c.widgets, widget] } : c
      )
    );
  };

  const handleRemoveWidget = (id: string) => {
    setCanvases((prev) =>
      prev.map((c) =>
        c.id === activeCanvasId ? { ...c, widgets: c.widgets.filter((w) => w.id !== id) } : c
      )
    );
  };

  const handleUpdatePosition = useCallback((id: string, position: { x: number; y: number }) => {
    setCanvases((prev) =>
      prev.map((c) =>
        c.id === activeCanvasId
          ? {
              ...c,
              widgets: c.widgets.map((w) => (w.id === id ? { ...w, position } : w)),
            }
          : c
      )
    );
  }, [activeCanvasId]);

  const handleUpdateSize = useCallback((id: string, size: { width: number; height: number }) => {
    setCanvases((prev) =>
      prev.map((c) =>
        c.id === activeCanvasId
          ? {
              ...c,
              widgets: c.widgets.map((w) => (w.id === id ? { ...w, size } : w)),
            }
          : c
      )
    );
  }, [activeCanvasId]);

  const handleUpdateWidgetData = (id: string, data: Record<string, unknown>) => {
    setCanvases((prev) =>
      prev.map((c) =>
        c.id === activeCanvasId
          ? {
              ...c,
              widgets: c.widgets.map((w) =>
                w.id === id ? { ...w, data: { ...(w.data ?? {}), ...data } } : w
              ),
            }
          : c
      )
    );
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      saveConstructorState({
        canvases,
        activeCanvasId,
        drawingsByCanvasId,
        brushColor,
      });
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [canvases, activeCanvasId, drawingsByCanvasId, brushColor]);

  useEffect(() => {
    if (!hasSeenAppGuide(user.id)) {
      setGuidePhase('welcome');
    }
  }, [user.id]);

  useEffect(() => {
    if (guidePhase !== 'tour') return;
    const step = APP_GUIDE_STEPS[tourIndex];
    if (!step) return;
    setCurrentView(step.view);
    setIsWidgetsOpen(Boolean(step.openWidgets));
    setIsChatOpen(false);
    setIsBrushActive(false);
  }, [guidePhase, tourIndex]);

  const resetWorkspaceAfterGuide = useCallback(() => {
    setIsWidgetsOpen(false);
    setIsBrushActive(false);
    setIsChatOpen(false);
    setCurrentView('constructor');
  }, []);

  const handleGuideBegin = () => {
    setTourIndex(0);
    setCurrentView('constructor');
    setGuidePhase('tour');
  };

  const handleGuideSkip = () => {
    markAppGuideSeen(user.id);
    resetWorkspaceAfterGuide();
    setGuidePhase('skipNote');
  };

  const handleGuideNext = () => {
    if (tourIndex >= APP_GUIDE_STEPS.length - 1) {
      markAppGuideSeen(user.id);
      resetWorkspaceAfterGuide();
      setGuidePhase('done');
      return;
    }
    setTourIndex((i) => i + 1);
  };

  const handleGuideBack = () => {
    setTourIndex((i) => Math.max(0, i - 1));
  };

  const handleGuideIdle = () => {
    resetWorkspaceAfterGuide();
    setGuidePhase('idle');
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex h-screen min-h-0 flex-col bg-black">
        <FeedbackSurveyHost userId={user.id} paused={guideActive} />
        {/* Top Bar */}
        <TopBar
          userEmail={user.email}
          userSignedInAt={user.signedInAt}
          onLogout={logout}
          currentView={currentView}
          onViewChange={setCurrentView}
          onWidgetsToggle={() => setIsWidgetsOpen(!isWidgetsOpen)}
          onChatToggle={() => setIsChatOpen(!isChatOpen)}
          isChatOpen={isChatOpen}
          isWidgetsOpen={isWidgetsOpen}
        />

        {/* Main Content Area — overflow only on canvas so floating controls' glow isn't clipped */}
        <div className="relative flex min-h-0 flex-1">
          {/* Workspace - Constructor, Database, or Portfolio */}
          <div className="relative min-w-0 flex-1 overflow-hidden">
            {currentView === 'constructor' ? (
              <DashboardCanvas
                widgets={widgets}
                onAddWidget={handleAddWidget}
                onRemoveWidget={handleRemoveWidget}
                onUpdateWidgetPosition={handleUpdatePosition}
                onUpdateWidgetSize={handleUpdateSize}
                onUpdateWidgetData={handleUpdateWidgetData}
                isWidgetsOpen={isWidgetsOpen}
                isBrushActive={isBrushActive}
                drawToolMode={drawToolMode}
                brushColor={brushColor}
                canvasId={activeCanvasId}
                drawingDataUrl={drawingsByCanvasId[activeCanvasId]}
                onDrawingChange={(dataUrl) =>
                  setDrawingsByCanvasId((prev) => ({ ...prev, [activeCanvasId]: dataUrl }))
                }
              />
            ) : (
              <DataBase />
            )}
          </div>

          {/* Right Sidebar - AI Bot (overlay on narrow screens; z above floating bottom tools) */}
          {isChatOpen && (
            <div className="pointer-events-auto absolute inset-y-0 right-0 z-50 w-full max-w-sm animate-in bg-[#0c0c0c] shadow-2xl slide-in-from-right duration-300 sm:relative sm:inset-auto sm:z-50 sm:w-80 sm:max-w-none sm:flex-shrink-0 sm:shadow-none">
              <AiBot />
            </div>
          )}

          {/* Floating constructor tools — overlaid on canvas, no bar */}
          {currentView === 'constructor' && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 overflow-visible pb-3">
              <div className="pointer-events-none overflow-visible">
                <ConstructorBottomMenu
                  onWidgetsToggle={() => setIsWidgetsOpen(!isWidgetsOpen)}
                  onBrushToggle={() => setIsBrushActive((active) => !active)}
                  isBrushActive={isBrushActive}
                  drawToolMode={drawToolMode}
                  onDrawToolModeChange={setDrawToolMode}
                  brushColor={brushColor}
                  onBrushColorChange={setBrushColor}
                  onTextFieldAdd={() => {
                    const newTextField = {
                      id: `text-${Date.now()}`,
                      type: 'text-field' as const,
                      title: 'Text',
                      position: { x: scalePx(100), y: scalePx(100) },
                      size: scaleSize(280, 120),
                      data: { text: '', html: '', fontSize: DEFAULT_FONT_SIZE },
                    };
                    handleAddWidget(newTextField);
                  }}
                  onAddWidget={(type) => {
                    const widgetTitles: Record<string, string> = {
                      'line-chart': 'Price Chart',
                      'bar-chart': 'Wins vs Losses',
                      'pie-chart': 'Volume Mix',
                      'area-chart': 'Cul. PnL',
                      'stats-card': 'Key Metrics',
                      'table': 'Full Trading Report',
                      'portfolio-widget': 'Portfolio Analytics',
                      'pnl-calendar': 'PnL Calendar',
                      'symbol-scorecard': 'Symbol Scorecard',
                      'session-heatmap': 'Session Heatmap',
                    };
                    const def = widgetDefaultSize(type);
                    const newWidget = {
                      id: `widget-${Date.now()}-${Math.random()}`,
                      type,
                      title: widgetTitles[type] || 'Widget',
                      position: {
                        x: Math.floor(Math.random() * scalePx(400)) + scalePx(50),
                        y: Math.floor(Math.random() * scalePx(200)) + scalePx(50),
                      },
                      size: scaleSize(def.width, def.height),
                    };
                    handleAddWidget(newWidget);
                  }}
                  canvases={canvases}
                  activeCanvasId={activeCanvasId}
                  onCanvasChange={setActiveCanvasId}
                  onCanvasAdd={addCanvas}
                  onCanvasRename={renameCanvas}
                  onCanvasDelete={deleteCanvas}
                  isWidgetsOpen={isWidgetsOpen}
                />
              </div>
            </div>
          )}

          {!guideActive && (
            <CanvasHelpHint
              currentView={currentView}
              onStartGuide={() => {
                setTourIndex(0);
                setCurrentView('constructor');
                setGuidePhase('welcome');
              }}
            />
          )}
        </div>

        <AppGuide
          phase={guidePhase}
          tourIndex={tourIndex}
          remeasureKey={`${currentView}:${isWidgetsOpen}`}
          onBegin={handleGuideBegin}
          onSkip={handleGuideSkip}
          onSkipNoteDismiss={handleGuideIdle}
          onNext={handleGuideNext}
          onBack={handleGuideBack}
          onDoneDismiss={handleGuideIdle}
        />
      </div>
    </DndProvider>
  );
}

function App() {
  return (
    <AuthGate>
      {(user, logout) => <AuthenticatedApp user={user} logout={logout} />}
    </AuthGate>
  );
}

export default App;
