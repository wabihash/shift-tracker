import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from "react";

export type ToastType = "success" | "warning" | "error" | "info";

export interface ToastInput {
  type: ToastType;
  title: string;
  message: string;
}

export interface ToastMessage extends ToastInput {
  id: string;
}

interface ToastContextValue {
  notify: (toast: ToastInput) => void;
  dismiss: (id: string) => void;
  sessionSaved: (netMinutes: number) => void;
  capWarning: (activityName: string, message?: string) => void;
  sleepBoundary: (boundary: "bedtime" | "wake", message?: string) => void;
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
};

export function ToastProvider({ children }: PropsWithChildren): ReactElement {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const announcedBoundaries = useRef<Set<string>>(new Set());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((toast: ToastInput) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current, { ...toast, id }]);
  }, []);

  const sessionSaved = useCallback((netMinutes: number) => {
    const hours = Math.floor(netMinutes / 60);
    const minutes = netMinutes % 60;
    const netTime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    notify({
      type: "success",
      title: "Session saved",
      message: `${netTime} of net focus time recorded.`,
    });
  }, [notify]);

  const capWarning = useCallback((activityName: string, message?: string) => {
    notify({
      type: "warning",
      title: `${activityName} cap reached`,
      message: message ?? "Additional time may not count toward your weekly target.",
    });
  }, [notify]);

  const sleepBoundary = useCallback((boundary: "bedtime" | "wake", message?: string) => {
    const bedtime = boundary === "bedtime";
    notify({
      type: "warning",
      title: bedtime ? "Bedtime boundary" : "Wake time boundary",
      message: message ?? (bedtime
        ? "The 10:15 PM bed cutoff is approaching."
        : "The 5:41 AM wake boundary has started."),
    });
  }, [notify]);

  useEffect(() => {
    const checkSleepBoundary = () => {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const boundary = minutes === 22 * 60 + 15
        ? "bedtime"
        : minutes === 5 * 60 + 41
          ? "wake"
          : null;
      if (!boundary) return;

      const localDate = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      const key = `${localDate}:${boundary}`;
      if (announcedBoundaries.current.has(key)) return;
      announcedBoundaries.current.add(key);
      sleepBoundary(
        boundary,
        boundary === "bedtime"
          ? "It is 10:15 PM, your bed cutoff. Wrap up and protect your sleep window."
          : "It is 5:41 AM, your wake time. Your planned work window has started.",
      );
    };

    checkSleepBoundary();
    const interval = window.setInterval(checkSleepBoundary, 15_000);
    return () => window.clearInterval(interval);
  }, [sleepBoundary]);

  const value = useMemo(
    () => ({ notify, dismiss, sessionSaved, capWarning, sleepBoundary }),
    [notify, dismiss, sessionSaved, capWarning, sleepBoundary],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
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
    const timeout = window.setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow-xl backdrop-blur ${classes}`}
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

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return context;
}
