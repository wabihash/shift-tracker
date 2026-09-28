import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Coffee, Timer } from "lucide-react";
import { useEffect, useMemo, type ReactElement } from "react";

import { getProfile } from "../../api/profile";
import { useModeStore } from "../../stores/useModeStore";
import { useShiftStore } from "../../stores/useShiftStore";
import { useTimerStore } from "../../stores/useTimerStore";
import type { ShiftRule, TimeString } from "../../types/schema";

function parseTimeToMinutes(value: TimeString): number {
  const parts = value.split(":");
  const hours = Number(parts[0] ?? 0);
  const minutes = Number(parts[1] ?? 0);
  return hours * 60 + minutes;
}

function withTimeOnDate(base: Date, timeValue: TimeString): Date {
  const result = new Date(base);
  const parts = timeValue.split(":");
  result.setHours(Number(parts[0] ?? 0), Number(parts[1] ?? 0), 0, 0);
  return result;
}

function isWithinShiftWindow(now: Date, start: Date, end: Date): boolean {
  if (end >= start) {
    return now >= start && now <= end;
  }
  return now >= start || now <= end;
}

function resolveActiveShift(
  rules: ShiftRule[],
  now: Date,
  mode: "STANDARD" | "RUSH",
): {
  shift: ShiftRule;
  scheduledStart: Date;
  scheduledEnd: Date;
  breakMinutes: number;
} | null {
  const sortedRules = [...rules].sort(
    (left, right) => left.shift_number - right.shift_number,
  );

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  for (const rule of sortedRules) {
    const startTime = mode === "RUSH" ? rule.rush_start : rule.standard_start;
    const endTime = mode === "RUSH" ? rule.rush_end : rule.standard_end;
    const breakMinutes =
      mode === "RUSH" ? rule.rush_break_minutes : rule.standard_break_minutes;

    const scheduledStart = withTimeOnDate(today, startTime);
    let scheduledEnd = withTimeOnDate(today, endTime);
    if (scheduledEnd <= scheduledStart) {
      scheduledEnd = new Date(scheduledEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    if (isWithinShiftWindow(now, scheduledStart, scheduledEnd)) {
      return { shift: rule, scheduledStart, scheduledEnd, breakMinutes };
    }
  }

  return null;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatClockMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const LATE_THRESHOLD_MS = 5 * 60 * 1000;
const LATE_IDLE_WINDOW_MS = 90 * 60 * 1000;

export function ShiftStatusBanner(): ReactElement {
  const activeMode = useModeStore((state) => state.activeMode);
  const timerStatus = useTimerStore((state) => state.status);

  const isBreak = useShiftStore((state) => state.isBreak);
  const breakTimeRemainingSec = useShiftStore(
    (state) => state.breakTimeRemainingSec,
  );
  const isLateArrival = useShiftStore((state) => state.isLateArrival);
  const lateMinutes = useShiftStore((state) => state.lateMinutes);
  const currentShiftNumber = useShiftStore((state) => state.currentShiftNumber);
  const updateShiftStatus = useShiftStore((state) => state.updateShiftStatus);

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  const shiftRules = profileQuery.data?.shift_rules ?? [];

  const activeShiftContext = useMemo(() => {
    return resolveActiveShift(shiftRules, new Date(), activeMode);
  }, [shiftRules, activeMode, profileQuery.dataUpdatedAt]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const context = resolveActiveShift(shiftRules, now, activeMode);

      if (!context) {
        updateShiftStatus({
          currentShiftNumber: null,
          isBreak: false,
          breakTimeRemainingSec: 0,
          isLateArrival: false,
          lateMinutes: 0,
        });
        return;
      }

      const shiftDurationMinutes = Math.floor(
        (context.scheduledEnd.getTime() - context.scheduledStart.getTime()) /
          60_000,
      );
      const elapsedShiftMinutes = Math.max(
        0,
        Math.floor(
          (now.getTime() - context.scheduledStart.getTime()) / 60_000,
        ),
      );

      const breakStartMinute =
        context.breakMinutes > 0
          ? Math.max(
              0,
              Math.floor((shiftDurationMinutes - context.breakMinutes) / 2),
            )
          : -1;
      const inBreakWindow =
        breakStartMinute >= 0 &&
        elapsedShiftMinutes >= breakStartMinute &&
        elapsedShiftMinutes < breakStartMinute + context.breakMinutes;

      const breakRemainingSec = inBreakWindow
        ? Math.max(
            0,
            (breakStartMinute + context.breakMinutes - elapsedShiftMinutes) *
              60 -
              now.getSeconds(),
          )
        : 0;

      let late = false;
      let lateMin = 0;

      if (timerStatus === "idle") {
        const msAfterScheduled =
          now.getTime() - context.scheduledStart.getTime();
        if (
          msAfterScheduled > LATE_THRESHOLD_MS &&
          msAfterScheduled <= LATE_IDLE_WINDOW_MS
        ) {
          late = true;
          lateMin = Math.floor(msAfterScheduled / 60_000);
        }
      }

      updateShiftStatus({
        currentShiftNumber: context.shift.shift_number,
        isBreak: inBreakWindow,
        breakTimeRemainingSec: breakRemainingSec,
        isLateArrival: late,
        lateMinutes: lateMin,
      });
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [
    shiftRules,
    activeMode,
    updateShiftStatus,
    timerStatus,
  ]);

  const wakeMinutes = profileQuery.data
    ? parseTimeToMinutes(profileQuery.data.wake_time)
    : parseTimeToMinutes("05:41");
  const bedMinutes = profileQuery.data
    ? parseTimeToMinutes(profileQuery.data.bedtime_limit)
    : parseTimeToMinutes("22:15");

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-sm font-semibold text-indigo-200">
            <Timer className="h-4 w-4" />
            {currentShiftNumber
              ? `Shift ${currentShiftNumber}`
              : "No Active Shift"}
            {activeShiftContext ? (
              <span className="font-normal text-indigo-300/80">
                ({activeShiftContext.shift.name})
              </span>
            ) : null}
          </div>

          <div
            className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
              activeMode === "RUSH"
                ? "border border-amber-500/40 bg-amber-500/10 text-amber-200"
                : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            {activeMode === "RUSH"
              ? "RUSH MODE - Compressed Breaks"
              : "STANDARD MODE"}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded border border-slate-700 px-2 py-1">
            Wake {formatClockMinutes(wakeMinutes)}
          </span>
          <span className="rounded border border-slate-700 px-2 py-1">
            Bed {formatClockMinutes(bedMinutes)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isBreak && breakTimeRemainingSec > 0 ? (
          <div className="inline-flex items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200">
            <Coffee className="h-4 w-4" />
            Break ends in {formatCountdown(breakTimeRemainingSec)}
          </div>
        ) : null}

        {isLateArrival && activeShiftContext ? (
          <div className="inline-flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-200">
            <AlertTriangle className="h-4 w-4" />
            Late arrival: {lateMinutes} min after scheduled start
          </div>
        ) : null}
      </div>
    </div>
  );
}
