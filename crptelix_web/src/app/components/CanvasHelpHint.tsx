import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './ui/utils';
import { ChatMessageMarkdown } from './ChatMessageMarkdown';

const HELP_MARKDOWN = `## Canvas controls

- **Pan** — middle or right mouse button, or hold **Space** and drag
- **Zoom** — **Ctrl** (or **Cmd**) + mouse wheel
- **Scroll a widget** — mouse wheel over a scrollable widget (e.g. Full Trading Report)
- **Select** — click and drag on empty canvas, or **Shift+click** widgets and drawings
`;

type HelpPanel = 'menu' | 'controls';

interface CanvasHelpHintProps {
  currentView: 'constructor' | 'database';
  onStartGuide: () => void;
}

export function CanvasHelpHint({ currentView, onStartGuide }: CanvasHelpHintProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [panel, setPanel] = useState<HelpPanel>('menu');
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setPanel('menu');
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, close]);

  return (
    <div
      ref={rootRef}
      className={cn(
        'pointer-events-auto absolute left-3 z-40',
        currentView === 'constructor' ? 'bottom-28 sm:bottom-24' : 'bottom-4'
      )}
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        className={cn(
          'overflow-hidden border border-zinc-800/80 bg-zinc-900/95 shadow-lg backdrop-blur-sm',
          isOpen ? 'min-w-[11.5rem] rounded-xl' : 'h-7 w-7 rounded-full'
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isOpen ? (
            <motion.div
              key={panel}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.18 }}
              className="px-1.5 py-1.5"
            >
              {panel === 'menu' ? (
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onStartGuide();
                    }}
                    className="rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-yellow-400"
                  >
                    App Guide
                  </button>
                  {currentView === 'constructor' && (
                    <button
                      type="button"
                      onClick={() => setPanel('controls')}
                      className="rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-yellow-400"
                    >
                      Canvas controls
                    </button>
                  )}
                </div>
              ) : (
                <div className="px-1.5 py-1">
                  <button
                    type="button"
                    onClick={() => setPanel('menu')}
                    className="mb-1.5 text-[10px] font-medium text-zinc-500 transition-colors hover:text-yellow-400"
                  >
                    Back
                  </button>
                  <ChatMessageMarkdown content={HELP_MARKDOWN} variant="assistant" />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.button
              key="trigger"
              type="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              onClick={() => {
                setPanel('menu');
                setIsOpen(true);
              }}
              className="flex h-7 w-7 items-center justify-center text-xs font-semibold text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-yellow-400/90"
              title="Help"
              aria-label="Help"
              aria-expanded={false}
            >
              ?
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
