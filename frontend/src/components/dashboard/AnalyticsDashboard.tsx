import { useQuery } from "@tanstack/react-query";
import { endOfWeek, format, startOfWeek } from "date-fns";
import { AlertCircle, CalendarRange, Loader2, Play, ClockPlus, Timer } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { getActivities } from "../../api/activities";
import { getWeeklyAnalytics } from "../../api/analytics";
import { getProfile } from "../../api/profile";
import { getSessions } from "../../api/sessions";
import { useAuthToken } from "../../auth/AuthTokenContext";
import type { DateString } from "../../types/schema";
import { ActivityBurndownChart } from "../analytics/ActivityBurndownChart";
import { CapAlertBanner } from "../analytics/CapAlertBanner";
import { TimeLossLedger } from "../analytics/TimeLossLedger";
import { HistoricalSummaryTable } from "../analytics/HistoricalSummaryTable";
import { WeeklyProgressCard } from "../analytics/WeeklyProgressCard";
import { BurndownChartSkeleton, WeeklyCardSkeleton } from "../common/SkeletonLoaders";
import { safeErrorMessage } from "../../api/client";
import { getAppNow } from "../../utils/serverClock";

interface AnalyticsDashboardProps {
  onStartStopwatch?: () => void;
  onLogPastSession?: () => void;
}

function toDateString(date: Date): DateString {
  return format(date, "yyyy-MM-dd");
}

function getDefaultWeekRange(): { start: DateString; end: DateString } {
  const now = getAppNow();
  return {
    start: toDateString(startOfWeek(now, { weekStartsOn: 1 })),
    end: toDateString(endOfWeek(now, { weekStartsOn: 1 })),
  };
}

export function AnalyticsDashboard({ onStartStopwatch, onLogPastSession }: AnalyticsDashboardProps): ReactElement {
  const token = useAuthToken();
  const defaultWeek = useMemo(() => getDefaultWeekRange(), []);
  const [weekStart, setWeekStart] = useState<DateString>(defaultWeek.start);
  const [weekEnd, setWeekEnd] = useState<DateString>(defaultWeek.end);
  const [view, setView] = useState<"week" | "history">("week");

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    enabled: !!token,
  });

  const analyticsQuery = useQuery({
    queryKey: ["analytics", weekStart, weekEnd],
    queryFn: () => getWeeklyAnalytics(weekStart, weekEnd),
    enabled: !!token,
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions", weekStart, weekEnd],
    queryFn: () => getSessions(weekStart, weekEnd),
    enabled: !!token,
  });

  const activitiesQuery = useQuery({
    queryKey: ["activities"],
    queryFn: getActivities,
    enabled: !!token,
  });

  const activityNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const activity of activitiesQuery.data ?? []) {
      map.set(activity.id, activity.name);
    }
    return map;
  }, [activitiesQuery.data]);

  const isLoading =
    profileQuery.isLoading ||
    analyticsQuery.isLoading ||
    sessionsQuery.isLoading ||
    activitiesQuery.isLoading;

  const hasError =
    profileQuery.isError ||
    analyticsQuery.isError ||
    sessionsQuery.isError ||
    activitiesQuery.isError;

  const errorMessage =
    (analyticsQuery.error as Error | undefined)?.message ??
    (sessionsQuery.error as Error | undefined)?.message ??
    (profileQuery.error as Error | undefined)?.message ??
    (activitiesQuery.error as Error | undefined)?.message ??
    "Unable to load analytics dashboard.";

  const analytics = analyticsQuery.data;
  const activityTarget = (activitiesQuery.data ?? []).reduce((sum, activity) => sum + activity.weekly_target_hours, 0);
  const weeklyTarget = activityTarget > 0 ? activityTarget : (profileQuery.data?.weekly_target_hours ?? 0);
  const trackedSessions = sessionsQuery.data ?? [];
  const completedHours = trackedSessions.reduce((sum, session) => sum + session.net_minutes / 60, 0);
  const overallPercentage = weeklyTarget > 0 ? Math.min(100, completedHours / weeklyTarget * 100) : 0;
  const activeWeekHasSessions = (sessionsQuery.data ?? []).length > 0;
  const isNewUser = !profileQuery.data?.weekly_target_hours || ((activitiesQuery.data?.length ?? 0) === 0 && !activeWeekHasSessions);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Analytics Command Center
          </h2>
          <p className="text-sm text-slate-500">
            Weekly burndown, cap alerts, and time-loss audit
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 p-2">
          <CalendarRange className="h-4 w-4 text-slate-400" aria-hidden />
          <label className="text-xs text-slate-400">
            Week start
            <input
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
              className="ml-2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            Week end
            <input
              type="date"
              value={weekEnd}
              onChange={(event) => setWeekEnd(event.target.value)}
              className="ml-2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
          </label>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-800" role="tablist" aria-label="Analytics views">
        {(["week", "history"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={view === tab} onClick={() => setView(tab)} className={`border-b-2 px-3 py-2 text-sm font-medium capitalize ${view === tab ? "border-indigo-400 text-indigo-200" : "border-transparent text-slate-400 hover:text-slate-200"}`}>{tab === "week" ? "Current Week" : "History"}</button>)}
      </div>

      {view === "history" ? <HistoricalSummaryTable /> : null}

      {view === "week" && isLoading ? (
        <div className="space-y-4" aria-label="Loading analytics" aria-busy="true">
          <div className="grid gap-4 xl:grid-cols-2"><WeeklyCardSkeleton /><WeeklyCardSkeleton /></div>
          <BurndownChartSkeleton />
          <div className="h-72 animate-pulse rounded-xl border border-slate-800 bg-slate-900/70" />
        </div>
      ) : view === "week" && hasError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Analytics unavailable</p>
            <p className="mt-1 text-rose-200/90">{safeErrorMessage(new Error(errorMessage), "Analytics are temporarily unavailable. Please retry.")}</p>
            <button
              type="button"
              onClick={() => {
                void profileQuery.refetch();
                void analyticsQuery.refetch();
                void sessionsQuery.refetch();
                void activitiesQuery.refetch();
              }}
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-rose-400/40 px-3 py-1.5 text-xs hover:bg-rose-500/10"
            >
              <Loader2 className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        </div>
      ) : view === "week" ? (
        <>
          {!activeWeekHasSessions || isNewUser ? <GettingStartedCard onStartStopwatch={onStartStopwatch} onLogPastSession={onLogPastSession} /> : null}
          <div className="grid gap-4 xl:grid-cols-2">
            <WeeklyProgressCard
              weeklyTarget={weeklyTarget}
              completedHours={completedHours}
              overallPercentage={overallPercentage}
              weekEnd={weekEnd}
              sessions={trackedSessions}
              weeklyBuffer={weeklyTarget > 0 ? Math.max(0, 168 - weeklyTarget) : 0}
              dailyBuffer={weeklyTarget > 0 ? Math.round((Math.max(0, 168 - weeklyTarget) / 7) * 10) / 10 : 0}
              hasTrackedSessions={activeWeekHasSessions}
            />
            <CapAlertBanner
              capAlerts={analytics?.cap_alerts ?? []}
              metrics={analytics?.metrics ?? []}
              weeklyTargetHours={weeklyTarget}
            />
          </div>

          <ActivityBurndownChart metrics={analytics?.metrics ?? []} />

          <TimeLossLedger
            totalDeductionMinutes={analytics?.total_lost_deductions_min ?? 0}
            totalLateArrivalMinutes={analytics?.total_late_arrival_min ?? 0}
            sessions={sessionsQuery.data ?? []}
            activityNameById={activityNameById}
          />
        </>
      ) : null}
    </section>
  );
}

function GettingStartedCard({ onStartStopwatch, onLogPastSession }: AnalyticsDashboardProps): ReactElement {
  const steps = [
    ["1. Set Your Target", "Choose a weekly focus target in Settings or set quotas for your activities."],
    ["2. Run Focus Sessions", "Use the Live Stopwatch to track deep work blocks."],
    ["3. Review Your Buffer", "Check your weekly pacing and available time as sessions accumulate."],
  ];

  return <article className="rounded-xl border border-indigo-500/25 bg-slate-900/90 p-5 sm:p-6">
    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-200"><Timer className="h-4 w-4" aria-hidden />⏱️ Getting Started</div>
    <h3 className="text-xl font-semibold text-slate-50">Welcome to Shift Tracker</h3>
    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">You haven't logged any shifts yet this week. Set your weekly targets and record your first focus block to see your pacing and buffer.</p>
    <div className="mt-5 grid gap-3 md:grid-cols-3">
      {steps.map(([title, description]) => <div key={title} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3"><h4 className="text-sm font-semibold text-slate-100">{title}</h4><p className="mt-1 text-xs leading-relaxed text-slate-400">{description}</p></div>)}
    </div>
    <div className="mt-5 flex flex-wrap gap-2">
      <button type="button" onClick={onStartStopwatch} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"><Play className="h-4 w-4" aria-hidden />Start Stopwatch</button>
      <button type="button" onClick={onLogPastSession} className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"><ClockPlus className="h-4 w-4" aria-hidden />Log Past Session</button>
    </div>
  </article>;
}
