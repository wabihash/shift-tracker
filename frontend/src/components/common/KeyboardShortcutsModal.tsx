import { Keyboard, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactElement } from "react";

import { useTimerStore } from "../../stores/useTimerStore";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest(
    "input, textarea, select, [contenteditable='true'], [role='textbox']",
  ));
}

export function KeyboardShortcutsModal(): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    previousFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.getElementById("shortcuts-close")?.focus();
    return () => previousFocus.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const editable = isEditableTarget(event.target);
      if (event.key === "Escape") {
        if (isOpen) {
          setIsOpen(false);
          return;
        }
        const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-modal='true']");
        if (dialog) {
          event.preventDefault();
          dialog.dispatchEvent(new CustomEvent("shift-tracker:escape", { bubbles: true }));
        }
        return;
      }

      if (event.altKey || event.repeat) return;
      if (editable) return;
      if (event.code === "Space" && !event.ctrlKey && !event.metaKey) {
        const timer = useTimerStore.getState();
        if (timer.status === "running") {
          event.preventDefault();
          timer.pauseTimer();
        } else if (timer.status === "paused") {
          event.preventDefault();
          timer.resumeTimer();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="Show keyboard shortcuts"
      >
        <Keyboard className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Shortcuts</span>
      </button>
      {isOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsOpen(false); }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsOpen(false);
              if (event.key === "Tab") {
                event.preventDefault();
                document.getElementById("shortcuts-close")?.focus();
              }
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="shortcuts-title" className="text-lg font-semibold text-slate-100">Keyboard shortcuts</h2>
              <button id="shortcuts-close" type="button" onClick={() => setIsOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close shortcuts">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <dl className="space-y-3 text-sm">
              <Shortcut keys={<Key>Space</Key>} description="Start or pause/resume the active stopwatch (outside text fields)." />
              <Shortcut keys={<Key>Esc</Key>} description="Close the open dialog or cancel its form." />
            </dl>
            <p className="mt-5 text-xs text-slate-500">Shortcuts are disabled while typing in text fields.</p>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Key({ children }: { children: string }): ReactElement {
  return <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-xs">{children}</kbd>;
}

function Shortcut({ keys, description }: { keys: ReactElement; description: string }): ReactElement {
  return <div className="flex items-center justify-between gap-4"><dt className="text-slate-300">{description}</dt><dd className="shrink-0">{keys}</dd></div>;
}
