import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfWeek } from "date-fns";
import { useEffect, useMemo, useState, type ReactElement } from "react";

import { getActivities } from "../../api/activities";
import { getSessions } from "../../api/sessions";
import { getProfile } from "../../api/profile";
import { useAuthToken } from "../../auth/AuthTokenContext";
import { useShiftStore } from "../../stores/useShiftStore";
import { useTimerStore } from "../../stores/useTimerStore";
import type { Activity, SessionLog, ShiftRule } from "../../types/schema";
import { getAppNow } from "../../utils/serverClock";

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeOnDate(date: Date, value: string): Date {
  const [hours, minutes] = value.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return result;
}

function sessionShift(session: SessionLog, day: Date, rules: ShiftRule[]): number | null {
  if (session.shift_number) return session.shift_number;
  const actual = new Date(session.actual_start);
  const scheduled = session.scheduled_start ? new Date(session.scheduled_start) : null;
  const previousDay = new Date(day);
  previousDay.setDate(previousDay.getDate() - 1);
  const currentDayNumber = (day.getDay() + 6) % 7;
  const previousDayNumber = (previousDay.getDay() + 6) % 7;
  for (const rule of rules) {
    const ruleDate = rule.day_of_week === currentDayNumber
      ? day
      : rule.day_of_week === previousDayNumber
        ? previousDay
        : null;
    if (!ruleDate) continue;
    if (rule.slot_type === "break") continue;
    const startValue = rule.slot_start ?? rule.standard_start;
    const endValue = rule.slot_end ?? rule.standard_end;
    const start = timeOnDate(ruleDate, startValue);
    const end = timeOnDate(ruleDate, endValue);
    if (end <= start) end.setDate(end.getDate() + 1);
    const candidate = scheduled ?? actual;
    if (candidate >= start && candidate < end) return rule.shift_number;
  }
  return null;
}

function activityFor(session: SessionLog, activities: Activity[]): Activity | undefined {
  return activities.find((activity) => activity.id === session.activity_id);
}

export function WeeklyShiftTable(): ReactElement {
  const token = useAuthToken();
  const currentShiftNumber = useShiftStore((state) => state.currentShiftNumber);
  const timerStatus = useTimerStore((state) => state.status);
  const activeActivityId = useTimerStore((state) => state.activeActivityId);
  const [now, setNow] = useState(getAppNow);
  useEffect(() => {
    const id = window.setInterval(() => setNow(getAppNow()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const weekStart = useMemo(() => startOfWeek(now, { weekStartsOn: 1 }), [now]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const dates = useMemo(() => ({ start: dateKey(weekStart), end: dateKey(addDays(weekStart, 6)) }), [weekStart]);
  const sessionsQuery = useQuery({
    queryKey: ["sessions", dates.start, dates.end],
    queryFn: () => getSessions(dates.start, dates.end),
    enabled: !!token,
    refetchInterval: 30_000,
  });
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getProfile, enabled: !!token });
  const activitiesQuery = useQuery({ queryKey: ["activities"], queryFn: getActivities, enabled: !!token });
  const rules = useMemo(() => profileQuery.data?.shift_rules ?? [], [profileQuery.data?.shift_rules]);
  const activities = useMemo(() => activitiesQuery.data ?? [], [activitiesQuery.data]);

  const logsByCell = useMemo(() => {
    const grouped = new Map<string, SessionLog[]>();
    for (const session of sessionsQuery.data ?? []) {
      const day = days.find((candidate) => dateKey(candidate) === session.logged_date);
      if (!day) continue;
      const shift = sessionShift(session, day, rules);
      if (shift === null || shift < 1 || shift > 4) continue;
      const key = `${dateKey(day)}-${shift}`;
      grouped.set(key, [...(grouped.get(key) ?? []), session]);
    }
    return grouped;
  }, [days, rules, sessionsQuery.data]);

  const activeRule = rules.find((rule) => rule.day_of_week === (now.getDay() + 6) % 7 && rule.shift_number === currentShiftNumber && rule.slot_type !== "break");
  const activeWindow = activeRule ? {
    start: timeOnDate(now, activeRule.slot_start ?? activeRule.standard_start),
    end: timeOnDate(now, activeRule.slot_end ?? activeRule.standard_end),
  } : null;
  if (activeWindow && activeWindow.end <= activeWindow.start) activeWindow.end.setDate(activeWindow.end.getDate() + 1);
  const todayKey = dateKey(now);
  const shiftNumbers = [...new Set(rules.filter((rule) => rule.slot_type !== "break").map((rule) => rule.shift_number))].sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Current Week Shifts &amp; Activities</h2>
        <p className="mt-1 text-sm text-slate-400">Live execution logs for {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}.</p>
      </div>
      {sessionsQuery.isError || profileQuery.isError || activitiesQuery.isError ? <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">Unable to load this week’s shift activity. Refresh to retry.</p> : null}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-950/80">
              <th scope="col" className="sticky left-0 z-10 border-b border-r border-slate-800 bg-slate-950 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Shift</th>
              {days.map((day) => <th key={dateKey(day)} scope="col" className={`border-b border-slate-800 px-3 py-3 text-center ${dateKey(day) === todayKey ? "bg-emerald-500/10 text-emerald-200" : "text-slate-300"}`}><span className="block text-xs uppercase tracking-wide">{format(day, "EEE")}</span><span className="mt-1 block font-mono text-xs text-slate-500">{format(day, "MMM d")}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {shiftNumbers.map((shiftNumber) => (
              <tr key={shiftNumber}>
                <th scope="row" className="sticky left-0 z-10 border-r border-b border-slate-800 bg-slate-950 px-3 py-3 text-xs font-semibold text-slate-300">{rules.find((rule) => rule.shift_number === shiftNumber && rule.slot_type !== "break")?.name ?? `Shift ${shiftNumber}`}</th>
                {days.map((day) => {
                  const key = `${dateKey(day)}-${shiftNumber}`;
                  const scheduledRule = rules.find((rule) => rule.day_of_week === (day.getDay() + 6) % 7 && rule.shift_number === shiftNumber && rule.slot_type !== "break");
                  const sessions = logsByCell.get(key) ?? [];
                  const isLiveHere = dateKey(day) === todayKey && shiftNumber === currentShiftNumber && timerStatus !== "idle" && !!activeActivityId;
                  const isToday = dateKey(day) === todayKey;
                  const cellStart = activeRule && isToday && shiftNumber === currentShiftNumber ? activeWindow?.start : null;
                  const isActive = !!cellStart && !!activeWindow && now >= activeWindow.start && now <= activeWindow.end;
                  return <td key={key} className={`border-b border-l border-slate-800 p-2 align-top ${isToday ? "bg-emerald-500/[0.035]" : ""} ${isActive ? "relative z-[1] rounded-sm ring-2 ring-emerald-500 animate-pulse" : ""}`}>
                    {isLiveHere ? <div className="mb-1 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-1.5 text-xs font-semibold text-emerald-200">{activities.find((activity) => activity.id === activeActivityId)?.name ?? "Active activity"}<span className="block text-[10px] opacity-75">Running</span></div> : null}
                    {sessions.length ? <div className="space-y-1">{sessions.map((session) => {
                      const activity = activityFor(session, activities);
                      const color = activity?.color ?? "#64748b";
                      const running = new Date(session.actual_end).getTime() > now.getTime();
                      return <div key={session.id} title={`${activity?.name ?? "Activity"}${running ? " · Running" : " · Completed"}`} className="rounded-md border px-2 py-1.5 text-xs font-medium" style={{ color, borderColor: `${color}80`, backgroundColor: `${color}1a` }}><span className="block truncate">{activity?.name ?? "Unknown activity"}</span><span className="mt-0.5 block text-[10px] opacity-70">{running ? "Running" : "Completed"}</span></div>;
                    })}</div> : !isLiveHere ? <span className="block px-2 py-2 text-center text-xs text-slate-600">{scheduledRule ? "—" : "Open"}</span> : null}
                  </td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
