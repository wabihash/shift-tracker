import { Sparkles, Target, TrendingUp } from "lucide-react";
import type { ReactElement } from "react";

import type { DateString, SessionLog } from "../../types/schema";
import { getAppNow } from "../../utils/serverClock";
import { getMilestoneMessage } from "../../config/cadenceMessages";

export interface WeeklyProgressCardProps {
  weeklyTarget: number;
  completedHours: number;
  overallPercentage: number;
  weekEnd: DateString;
  sessions: SessionLog[];
  weeklyBuffer: number;
  dailyBuffer: number;
  hasTrackedSessions?: boolean;
}

function remainingDaysInWeek(weekEnd: DateString): number {
  const now = getAppNow();
  const [endYear, endMonth, endDay] = weekEnd.split("-").map(Number);
  const endCalendarDay = Date.UTC(endYear, endMonth - 1, endDay);
  const todayCalendarDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const calendarDays = Math.round((endCalendarDay - todayCalendarDay) / 86_400_000) + 1;
  return Math.max(1, calendarDays);
}

export function WeeklyProgressCard({
  weeklyTarget,
  completedHours,
  overallPercentage,
  weekEnd,
  sessions,
  weeklyBuffer,
  dailyBuffer,
  hasTrackedSessions = true,
}: WeeklyProgressCardProps): ReactElement {
  const safeTarget = weeklyTarget;
  const progressRatio = safeTarget > 0 ? Math.min(1, completedHours / safeTarget) : 0;
  const hoursRemaining = Math.max(0, safeTarget - completedHours);
  const daysRemaining = remainingDaysInWeek(weekEnd);
  const pacePerDay = weeklyTarget > 0 ? Math.max(0, hoursRemaining / daysRemaining) : 0;

  const milestone = getMilestoneMessage(overallPercentage);

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Weekly Macro Progress
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {safeTarget > 0 ? `${completedHours.toFixed(1)}h of ${safeTarget.toFixed(1)}h target` : "0.0h of 0.0h target"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 text-xs font-semibold text-indigo-200">
            <Target className="h-3.5 w-3.5" aria-hidden />
            {hasTrackedSessions ? `${overallPercentage.toFixed(1)}% complete` : "No data yet"}
          </span>
          <div className="flex h-6 max-w-[min(26rem,65vw)] items-center gap-1 overflow-hidden text-right text-[11px] text-slate-400" title={milestone ?? undefined}>
            {milestone ? <><Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden /><span className="truncate">{milestone}</span></> : null}
          </div>
        </div>
      </div>

      <div
        className="mb-4 h-3 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeTarget || 1}
        aria-valuenow={completedHours}
        aria-label="Weekly hours completed"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
          style={{ width: `${progressRatio * 100}%` }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-violet-500/25 bg-violet-500/[0.06] p-3 sm:col-span-2">
          <p className="text-xs uppercase tracking-wide text-violet-200">Your Weekly Buffer</p>
          <p className="mt-1 font-mono text-xl text-slate-100">{weeklyTarget <= 0 ? "— hrs" : `${weeklyBuffer.toFixed(1)} hrs`}</p>
          <p className="mt-1 text-xs text-slate-400">{weeklyTarget <= 0 ? "Set your weekly target to calculate your buffer margin." : `Daily Average Buffer: ${dailyBuffer.toFixed(1)} hrs/day`}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="mb-1 inline-flex items-center gap-1 text-xs uppercase tracking-wide text-slate-400">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            Required Pace
          </p>
          <p className="font-mono text-lg text-slate-100">
            {weeklyTarget > 0 ? `${pacePerDay.toFixed(1)} h/day` : "0.0 h/day"}
          </p>
          <p className="text-xs text-slate-500">
            {daysRemaining} day(s) left this week
          </p>
        </div>

      </div>
    </article>
  );
}
