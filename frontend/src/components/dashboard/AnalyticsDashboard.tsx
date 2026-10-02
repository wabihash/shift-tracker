import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { AlertCircle, CalendarRange, Loader2, Play, ClockPlus, Timer } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { getActivities } from "../../api/activities";
import { getWeeklyAnalytics } from "../../api/analytics";
import { getProfile, updateProfile } from "../../api/profile";
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
import { useWeekStartDay, type WeekStartDay } from "../../hooks/useWeekStartDay";

interface AnalyticsDashboardProps {
  onStartStopwatch?: () => void;
  onLogPastSession?: () => void;
}

function toDateString(date: Date): DateString {
  return format(date, "yyyy-MM-dd");
}

export function AnalyticsDashboard({ onStartStopwatch, onLogPastSession }: AnalyticsDashboardProps): ReactElement {
  const token = useAuthToken();
  const queryClient = useQueryClient();
  const [weekStartDay, setWeekStartDay] = useWeekStartDay();
  const [now, setNow] = useState(getAppNow);
  const [weekStart, setWeekStart] = useState<DateString>(() => toDateString(startOfWeek(getAppNow(), { weekStartsOn: weekStartDay })));
  const [followCurrentPeriod, setFollowCurrentPeriod] = useState(true);
  const [weekStartError, setWeekStartError] = useState(false);
  const userChangedAnchor = useRef(false);
  const [view, setView] = useState<"week" | "history">("week");

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(getAppNow()), 15_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    enabled: !!token,
  });

  useEffect(() => {
    const profileDay = profileQuery.data?.week_start_day;
    if (profileDay === undefined || userChangedAnchor.current) return;
    if (profileDay < 0 || profileDay > 6) return;
    const anchorDay = profileDay as WeekStartDay;
    setWeekStartDay(anchorDay);
    setWeekStart(toDateString(startOfWeek(now, { weekStartsOn: anchorDay })));
  }, [now, profileQuery.data?.week_start_day, setWeekStartDay]);

  const currentPeriodStart = toDateString(startOfWeek(now, { weekStartsOn: weekStartDay }));
  useEffect(() => {
    if (followCurrentPeriod && weekStart !== currentPeriodStart) {
      setWeekStart(currentPeriodStart);
    }
  }, [currentPeriodStart, followCurrentPeriod, weekStart]);

  const weekEnd = useMemo(
    () => toDateString(addDays(parseISO(weekStart), 6)),
    [weekStart],
  );

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
  const weeklyTarget = profileQuery.data?.weekly_target_hours ?? analyticsQuery.data?.weekly_target_goal ?? 0;
  const trackedSessions = sessionsQuery.data ?? [];
  const sleepActivityIds = new Set((activitiesQuery.data ?? []).filter((activity) => activity.name.trim().toLowerCase() === "sleep").map((activity) => activity.id));
  const completedHours = trackedSessions.filter((session) => !sleepActivityIds.has(session.activity_id)).reduce((sum, session) => sum + session.net_minutes / 60, 0);
  const overallPercentage = weeklyTarget > 0 ? Math.min(100, completedHours / weeklyTarget * 100) : 0;
  const activeWeekHasSessions = (sessionsQuery.data ?? []).length > 0;
  const isNewUser = !profileQuery.data?.weekly_target_hours || ((activitiesQuery.data?.length ?? 0) === 0 && !activeWeekHasSessions);

  const handleWeekStartChange = (value: DateString) => {
    if (!value) return;
    const selectedStart = parseISO(value);
    if (Number.isNaN(selectedStart.getTime()) || value < currentPeriodStart) {
      setWeekStartError(true);
      setWeekStart(currentPeriodStart);
      setFollowCurrentPeriod(true);
      return;
    }
    const selectedDay = selectedStart.getDay() as WeekStartDay;
    setWeekStartError(false);
    userChangedAnchor.current = true;
    setWeekStart(value);
    setWeekStartDay(selectedDay);
    setFollowCurrentPeriod(value === toDateString(startOfWeek(now, { weekStartsOn: selectedDay })));
    void updateProfile({ week_start_day: selectedDay })
      .then((profile) => queryClient.setQueryData(["profile"], profile))
      .catch(() => {
        // The local preference remains available if the profile update is offline.
      });
  };

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
          <label className="flex flex-col text-xs text-slate-400">
            Week start
            <input
              type="date"
              value={weekStart}
              min={currentPeriodStart}
              aria-invalid={weekStartError}
              onChange={(event) => handleWeekStartChange(event.target.value)}
              className={`mt-1 rounded border bg-slate-950 px-2 py-1 text-sm text-slate-100 ${weekStartError ? "border-amber-500" : "border-slate-700"}`}
            />
            {weekStartError ? <span role="alert" className="mt-1 max-w-60 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] leading-snug text-amber-200">⚠️ Week start cannot be set in the past. Please select today or an upcoming start day.</span> : null}
          </label>
          <label className="text-xs text-slate-400">
            Week end
            <input
              type="date"
              value={weekEnd}
              readOnly
              aria-readonly="true"
              className="ml-2 w-36 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-400"
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
              weeklyBuffer={analytics?.weekly_buffer ?? 0}
              dailyBuffer={analytics?.daily_buffer ?? 0}
              plannedSleep={(() => { const sleep = activitiesQuery.data?.find((a) => a.name.trim().toLowerCase() === "sleep"); return sleep && sleep.weekly_target_hours > 0 ? sleep.weekly_target_hours : 56; })()}
              loggedSleep={analytics?.logged_sleep_hours ?? 0}
              hasSleepSessions={(analytics?.logged_sleep_hours ?? 0) > 0}
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
