import { AlertTriangle, ChevronDown, ChevronUp, PartyPopper, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import type { ActivityMetric, CapAlert } from "../../types/schema";
import { useToast } from "../common/ToastProvider";
import { getAppNow, getLocalDateString } from "../../utils/serverClock";

export interface CapAlertBannerProps {
  capAlerts: CapAlert[];
  metrics: ActivityMetric[];
  weeklyTargetHours: number;
}

function storageKey(weekLabel: string): string {
  return `shift-tracker-cap-dismissed:${weekLabel}`;
}

export function CapAlertBanner({
  capAlerts,
  metrics,
  weeklyTargetHours,
}: CapAlertBannerProps): ReactElement | null {
  const weekLabel = useMemo(() => getLocalDateString(getAppNow()), []);
  const [collapsed, setCollapsed] = useState(false);
  const { capWarning } = useToast();
  const notifiedCaps = useRef<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey(weekLabel));
      if (!raw) {
        return new Set<string>();
      }
      return new Set<string>(JSON.parse(raw) as string[]);
    } catch {
      return new Set<string>();
    }
  });

  const cappedMetrics = useMemo(
    () => metrics.filter((metric) => metric.is_cap_reached),
    [metrics],
  );
  const visibleAlerts = capAlerts.filter(
    (alert) => !dismissed.has(alert.activity),
  );

  useEffect(() => {
    const current = new Set(cappedMetrics.map((metric) => metric.name));
    for (const metric of cappedMetrics) {
      if (!notifiedCaps.current.has(metric.name)) {
        capWarning(metric.name, `The weekly target of ${metric.target_hours.toFixed(1)} hours has been reached.`);
      }
    }
    notifiedCaps.current = current;
  }, [capWarning, cappedMetrics]);

  if (visibleAlerts.length === 0 && cappedMetrics.length === 0) {
    return null;
  }

  const dismissAlert = (activityName: string) => {
    setDismissed((previous) => {
      const next = new Set(previous);
      next.add(activityName);
      sessionStorage.setItem(
        storageKey(weekLabel),
        JSON.stringify(Array.from(next)),
      );
      return next;
    });
  };

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-amber-200">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Cap Alert Station
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/10"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <>
              Expand <ChevronDown className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Collapse <ChevronUp className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>

      {!collapsed ? (
        <ul className="space-y-2">
          {visibleAlerts.map((alert) => (
            <li
              key={alert.activity}
              className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/30 bg-slate-950/50 px-3 py-2"
            >
              <div>
                <p className="inline-flex items-center gap-2 text-sm font-medium text-amber-100">
                  <PartyPopper className="h-4 w-4" aria-hidden />
                  {alert.activity} cap reached
                </p>
                <p className="mt-1 text-xs text-amber-200/80">
                  Cap reached for {alert.activity}. Additional hours in this
                  category will not count toward the {weeklyTargetHours.toFixed(0)}
                  h macro target.
                </p>
                <p className="mt-1 text-xs text-slate-400">{alert.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissAlert(alert.activity)}
                className="rounded p-1 text-amber-200/80 hover:bg-amber-500/10"
                aria-label={`Dismiss ${alert.activity} cap alert`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}

          {visibleAlerts.length === 0
            ? cappedMetrics.map((metric) => (
                <li
                  key={metric.activity_id}
                  className="rounded-lg border border-amber-500/30 bg-slate-950/50 px-3 py-2 text-xs text-amber-100"
                >
                  Cap reached for {metric.name}. Additional hours in this category
                  will not count toward the {weeklyTargetHours.toFixed(0)}h macro
                  target.
                </li>
              ))
            : null}
        </ul>
      ) : null}
    </section>
  );
}
