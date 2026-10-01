import { Clock, TimerOff } from "lucide-react";
import { useMemo, type ReactElement } from "react";

import type { SessionLog } from "../../types/schema";
import { formatVarianceDuration } from "../../utils/time";

export interface TimeLossLedgerProps {
  totalDeductionMinutes: number;
  totalLateArrivalMinutes: number;
  sessions: SessionLog[];
  activityNameById?: Map<number, string>;
}

function minutesToHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function TimeLossLedger({
  totalDeductionMinutes,
  totalLateArrivalMinutes,
  sessions,
  activityNameById,
}: TimeLossLedgerProps): ReactElement {
  const transitionDelayMinutes = useMemo(() => {
    return sessions.reduce(
      (sum, session) => sum
        + (session.variance_type === "EARLY_EXIT" ? Math.max(0, session.variance_minutes) : 0)
        + session.break_overrun_minutes,
      0,
    );
  }, [sessions]);

  const totalLostMinutes =
    totalDeductionMinutes + totalLateArrivalMinutes + transitionDelayMinutes;

  const frictionSessions = useMemo(() => {
    return sessions
      .filter(
        (session) =>
          session.deducted_minutes > 0 ||
          session.break_overrun_minutes > 0 ||
          session.variance_type === "LATE_START" ||
          session.variance_type === "EARLY_EXIT",
      )
      .sort(
        (left, right) =>
          new Date(right.actual_start).getTime() -
          new Date(left.actual_start).getTime(),
      )
      .slice(0, 12);
  }, [sessions]);

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Time-Loss Ledger
      </h3>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Distraction Deductions
          </p>
          <p className="font-mono text-lg text-rose-300">
            {totalDeductionMinutes}m
          </p>
          <p className="text-xs text-slate-500">
            {minutesToHours(totalDeductionMinutes)}h lost
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Late Arrivals
          </p>
          <p className="font-mono text-lg text-amber-300">
            {totalLateArrivalMinutes}m
          </p>
          <p className="text-xs text-slate-500">
            {minutesToHours(totalLateArrivalMinutes)}h lost
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Break / Transition Lag
          </p>
          <p className="font-mono text-lg text-orange-300">
            {transitionDelayMinutes}m
          </p>
          <p className="text-xs text-slate-500">
            {minutesToHours(transitionDelayMinutes)}h lost
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-slate-400">
            <TimerOff className="h-3.5 w-3.5" aria-hidden />
            Total Leakage
          </p>
          <p className="font-mono text-lg text-slate-100">
            {totalLostMinutes}m
          </p>
          <p className="text-xs text-slate-500">
            {minutesToHours(totalLostMinutes)}h equivalent
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-950/70 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Activity</th>
              <th className="px-3 py-2">Deduction</th>
              <th className="px-3 py-2">Variance</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {frictionSessions.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  No friction events recorded this week.
                </td>
              </tr>
            ) : (
              frictionSessions.map((session) => (
                <tr key={session.id} className="text-slate-200">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      {formatWhen(session.actual_start)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {activityNameById?.get(session.activity_id) ??
                      `Activity #${session.activity_id}`}
                  </td>
                  <td className="px-3 py-2 text-rose-300">
                    {session.deducted_minutes}m
                  </td>
                  <td className="px-3 py-2 text-amber-200">
                    {session.variance_type === "LATE_START"
                      ? `Late arrival: ${formatVarianceDuration(session.variance_minutes)} after scheduled`
                      : session.variance_type.replaceAll("_", " ")}
                    {session.variance_type !== "LATE_START" && session.variance_minutes !== 0
                      ? ` (${formatVarianceDuration(Math.abs(session.variance_minutes))})`
                      : ""}
                    {session.break_overrun_minutes > 0
                      ? ` · Break overrun: ${formatVarianceDuration(session.break_overrun_minutes)}`
                      : ""}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-slate-400">
                    {session.notes ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
