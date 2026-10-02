import { AlertCircle, AlertTriangle, CheckCircle2, Info, Moon, type LucideIcon, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from "react";

import { getSessionSavedCue } from "../../config/cadenceMessages";

export type ToastType = "success" | "warning" | "error" | "info" | "protected";

export interface ToastInput {
  type: ToastType;
  title: string;
  message: string;
}

export interface ToastMessage extends ToastInput {
  id: string;
  durationMs?: number;
}

interface ToastContextValue {
  notify: (toast: ToastInput) => void;
  dismiss: (id: string) => void;
  sessionSaved: (netMinutes: number, durationMs?: number) => void;
  capWarning: (activityName: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const AUTO_DISMISS_MS = 4000;

const appearance: Record<ToastType, { icon: LucideIcon; classes: string }> = {
  success: {
    icon: CheckCircle2,
    classes: "border-emerald-500/40 bg-emerald-950/95 text-emerald-100",
  },
  warning: {
    icon: AlertTriangle,
    classes: "border-amber-500/40 bg-amber-950/95 text-amber-100",
  },
  error: {
    icon: AlertCircle,
    classes: "border-rose-500/40 bg-rose-950/95 text-rose-100",
  },
  info: {
    icon: Info,
    classes: "border-sky-500/40 bg-sky-950/95 text-sky-100",
  },
  protected: {
    icon: Moon,
    classes: "border-indigo-500/40 bg-slate-950/95 text-indigo-100",
  },
};

export function ToastProvider({ children }: PropsWithChildren): ReactElement {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((toast: ToastInput) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current, { ...toast, id }]);
  }, []);

  const sessionSaved = useCallback((_netMinutes: number, durationMs = AUTO_DISMISS_MS) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current, { id, type: "success", title: "Session saved", message: getSessionSavedCue(), durationMs }]);
  }, []);

  const capWarning = useCallback((activityName: string, message?: string) => {
    notify({
      type: "warning",
      title: `${activityName} cap reached`,
      message: message ?? "Additional time may not count toward your weekly target.",
    });
  }, [notify]);

  const value = useMemo(
    () => ({ notify, dismiss, sessionSaved, capWarning }),
    [notify, dismiss, sessionSaved, capWarning],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex max-h-[calc(100vh-2rem)] w-[min(24rem,calc(100vw-2rem))] flex-col-reverse gap-2 overflow-y-auto"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
        role="status"
      >
        {toasts.map((toast) => {
          const Icon = appearance[toast.type].icon;
          return (
            <ToastCard
              key={toast.id}
              toast={toast}
              Icon={Icon}
              classes={appearance[toast.type].classes}
              onDismiss={dismiss}
            />
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  Icon,
  classes,
  onDismiss,
}: {
  toast: ToastMessage;
  Icon: LucideIcon;
  classes: string;
  onDismiss: (id: string) => void;
}): ReactElement {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(toast.id), toast.durationMs ?? AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [toast.id, toast.durationMs, onDismiss]);

  return (
    <div
      className={`pointer-events-auto flex animate-[toast-in_180ms_ease-out] items-start gap-3 rounded-lg border p-3 shadow-xl backdrop-blur ${classes}`}
      data-toast-type={toast.type}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{toast.title}</p>
        <p className="mt-0.5 text-sm opacity-90">{toast.message}</p>
      </div>
      <button
        type="button"
        className="rounded p-1 opacity-80 transition hover:bg-white/10 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        onClick={() => onDismiss(toast.id)}
        aria-label={`Dismiss notification: ${toast.title}`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// This hook shares the toast context module with its provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return context;
}
