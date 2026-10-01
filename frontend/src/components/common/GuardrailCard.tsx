import { AlertCircle, Moon, ShieldAlert, X, type LucideIcon } from "lucide-react";
import type { ReactElement } from "react";

export function GuardrailCard({
  tone = "warning",
  title,
  message,
  onDismiss,
}: {
  tone?: "warning" | "critical" | "sleep";
  title: string;
  message: string;
  onDismiss?: () => void;
}): ReactElement {
  const Icon: LucideIcon = tone === "sleep" ? Moon : tone === "critical" ? AlertCircle : ShieldAlert;
  const accent = tone === "critical" ? "border-l-rose-400" : tone === "sleep" ? "border-l-indigo-400" : "border-l-amber-400";
  const iconTone = tone === "critical" ? "text-rose-300" : tone === "sleep" ? "text-indigo-300" : "text-amber-300";
  return (
    <div role="alert" className={`flex min-h-16 items-center gap-3 rounded-lg border border-slate-700 border-l-4 ${accent} bg-slate-900/95 px-3 py-2 shadow-lg`}>
      <Icon className={`h-5 w-5 shrink-0 ${iconTone}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-100">{title}</p>
        <p className="mt-0.5 text-xs text-slate-300">{message}</p>
      </div>
      {onDismiss ? <button type="button" onClick={onDismiss} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Dismiss warning"><X className="h-4 w-4"/></button> : null}
    </div>
  );
}
