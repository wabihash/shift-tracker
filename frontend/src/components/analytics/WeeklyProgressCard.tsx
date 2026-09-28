import { Moon, Target, TrendingUp } from "lucide-react";
import { useMemo, type ReactElement } from "react";

import type { DateString, SessionLog, TimeString } from "../../types/schema";

export interface WeeklyProgressCardProps {
  weeklyTarget: number;
  completedHours: number;
  overallPercentage: number;
  weekEnd: DateString;
  wakeTime: TimeString;
  bedtimeLimit: TimeString;
  sessions: SessionLog[];
}

function parseTimeToMinutes(value: TimeString): number {
  const parts = value.split(":");
  return Number(parts[0] ?? 0) * 60 + Number(parts[1] ?? 0);
}

function isInSleepWindow(date: Date, wakeMinutes: number, bedMinutes: number): boolean {
  const slotMinutes = date.getHours() * 60 + date.getMinutes();
  if (wakeMinutes < bedMinutes) {
    return slotMinutes >= bedMinutes || slotMinutes < wakeMinutes;
  }
  return slotMinutes >= bedMinutes && slotMinutes < wakeMinutes;
}

function computeBedtimeCompliance(
  sessions: SessionLog[],
  wakeTime: TimeString,
  bedtimeLimit: TimeString,
): number {
  if (sessions.length === 0) {
    return 100;
  }

  const wakeMinutes = parseTimeToMinutes(wakeTime);
  const bedMinutes = parseTimeToMinutes(bedtimeLimit);
  const compliantCount = sessions.filter((session) => {
    const start = new Date(session.actual_start);
    const end = new Date(session.actual_end);
    return (
      !isInSleepWindow(start, wakeMinutes, bedMinutes) &&
      !isInSleepWindow(end, wakeMinutes, bedMinutes)
    );
  }).length;

  return Math.round((compliantCount / sessions.length) * 100);
}

function remainingDaysInWeek(weekEnd: DateString): number {
  const end = new Date(`${weekEnd}T23:59:59`);
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.ceil((end.getTime() - now.getTime()) / msPerDay);
  return Math.max(1, diff);
}

export function WeeklyProgressCard({
  weeklyTarget,
  completedHours,
  overallPercentage,
  weekEnd,
  wakeTime,
  bedtimeLimit,
  sessions,
}: WeeklyProgressCardProps): ReactElement {
  const safeTarget = weeklyTarget > 0 ? weeklyTarget : 68;
  const progressRatio = Math.min(1, completedHours / safeTarget);
  const hoursRemaining = Math.max(0, safeTarget - completedHours);
  const daysRemaining = remainingDaysInWeek(weekEnd);
  const pacePerDay = hoursRemaining / daysRemaining;

  const bedtimeCompliance = useMemo(
    () => computeBedtimeCompliance(sessions, wakeTime, bedtimeLimit),
    [sessions, wakeTime, bedtimeLimit],
  );

  const defenseLabel =
    bedtimeCompliance >= 90
      ? "Strong sleep boundary defense"
      : bedtimeCompliance >= 70
        ? "Moderate boundary pressure"
        : "Sleep boundary at risk";

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Weekly Macro Progress
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {completedHours.toFixed(1)}h of {safeTarget.toFixed(1)}h target
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-200">
          <Target className="h-3.5 w-3.5" aria-hidden />
          {overallPercentage.toFixed(1)}% complete
        </span>
      </div>

      <div
        className="mb-4 h-3 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeTarget}
        aria-valuenow={completedHours}
        aria-label="Weekly hours completed"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
          style={{ width: `${progressRatio * 100}%` }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="mb-1 inline-flex items-center gap-1 text-xs uppercase tracking-wide text-slate-400">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            Required Pace
          </p>
          <p className="font-mono text-lg text-slate-100">
            {pacePerDay.toFixed(1)}h/day
          </p>
          <p className="text-xs text-slate-500">
            {daysRemaining} day(s) left this week
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="mb-1 inline-flex items-center gap-1 text-xs uppercase tracking-wide text-slate-400">
            <Moon className="h-3.5 w-3.5" aria-hidden />
            Bedtime Compliance
          </p>
          <p className="font-mono text-lg text-slate-100">{bedtimeCompliance}%</p>
          <p className="text-xs text-slate-500">{defenseLabel}</p>
        </div>
      </div>
    </article>
  );
}
