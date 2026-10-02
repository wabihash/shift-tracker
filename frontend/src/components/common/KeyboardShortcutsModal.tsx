import { Keyboard, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactElement } from "react";

import { useTimerStore } from "../../stores/useTimerStore";
import { useClickOutside } from "../../hooks/useClickOutside";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest(
    "input, textarea, select, [contenteditable='true'], [role='textbox']",
  ));
}

async function hardReload(): Promise<void> {
  try {
    if ("caches" in window) {
      await Promise.all((await caches.keys()).map((cacheName) => caches.delete(cacheName)));
    }
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } finally {
    window.location.reload();
  }
}

export function KeyboardShortcutsModal(): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useClickOutside([triggerRef, dialogRef], () => setIsOpen(false), { enabled: isOpen });

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
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void hardReload();
        return;
      }
      if (event.key === "Escape") {
        if (isOpen) {
          event.preventDefault();
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

      if (event.altKey || event.repeat || editable) return;
      if (event.key === "?") {
        event.preventDefault();
        setIsOpen((open) => !open);
        return;
      }
      if (event.key.toLowerCase() === "s" && !event.ctrlKey && !event.metaKey) {
        if (useTimerStore.getState().status !== "idle") {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("shift-tracker:stop"));
          setIsOpen(false);
        }
        return;
      }
      if (event.code === "Space" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        const timer = useTimerStore.getState();
        if (timer.status === "running") timer.pauseTimer();
        else if (timer.status === "paused") timer.resumeTimer();
        else window.dispatchEvent(new CustomEvent("shift-tracker:start"));
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <>
      <div className="group relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-label="Shortcuts & Quick Actions"
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          className="flex min-h-11 min-w-11 items-center justify-center gap-0.5 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
        >
          <Keyboard className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-semibold" aria-hidden="true">?</span>
        </button>
        <div className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 shadow-lg md:group-hover:block md:group-focus-within:block">
          Shortcuts &amp; Quick Actions (?)
        </div>
      </div>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm md:items-center md:p-4"
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            className="w-full max-w-md rounded-t-2xl border border-slate-700 bg-slate-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:rounded-xl md:pb-5"
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsOpen(false);
              if (event.key === "Tab") {
                event.preventDefault();
                document.getElementById("shortcuts-close")?.focus();
              }
            }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id="shortcuts-title" className="text-lg font-semibold text-slate-100">Shortcuts &amp; Quick Actions</h2>
              <button id="shortcuts-close" type="button" onClick={() => setIsOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close shortcuts">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-5">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-300">Timer Controls</h3>
                <dl className="space-y-3 text-sm">
                  <Shortcut keys={<Key>Space</Key>} description="Start, pause, or resume the active session." />
                  <Shortcut keys={<Key>S</Key>} description="Stop the session and open the save dialog." />
                  <Shortcut keys={<Key>Esc</Key>} description="Close the open modal or discard the session." />
                </dl>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-300">Sync &amp; Reload</h3>
                <dl className="space-y-3 text-sm">
                  <Shortcut keys={<Key>R</Key>} description="Re-sync shifts and refresh metrics from the server." />
                  <Shortcut keys={<Key>Ctrl + Shift + R</Key>} description="Clear cached assets and service worker, then reload." />
                </dl>
              </section>
            </div>
            <p className="mt-5 text-xs text-slate-500">Keyboard shortcuts are disabled while typing in text fields.</p>
            <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300 md:hidden">Quick tip: tap <span className="font-semibold text-slate-100">↻</span> to sync. Tap outside a modal or its <span className="font-semibold text-slate-100">×</span> button to dismiss it.</p>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Key({ children }: { children: string }): ReactElement {
  return <kbd className="whitespace-nowrap rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-xs">{children}</kbd>;
}

function Shortcut({ keys, description }: { keys: ReactElement; description: string }): ReactElement {
  return <div className="flex items-center justify-between gap-4"><dt className="text-slate-300">{description}</dt><dd className="shrink-0">{keys}</dd></div>;
}
