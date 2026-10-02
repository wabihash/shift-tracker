import { useEffect, useMemo, useState } from "react";

import { useShiftStore } from "../stores/useShiftStore";
import type { TimerKind, TimerStatus } from "../stores/useTimerStore";
import type { ShiftRule, TimeString } from "../types/schema";
import { getAppNow } from "../utils/serverClock";

export interface ShiftWindow {
  rule: ShiftRule;
  scheduledStart: Date;
  scheduledEnd: Date;
}

function dayNumber(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function atTime(day: Date, value: TimeString): Date {
  const [hour, minute] = value.split(":").map(Number);
  const result = new Date(day);
  result.setHours(hour ?? 0, minute ?? 0, 0, 0);
  return result;
}

function ruleWindow(rule: ShiftRule, day: Date): ShiftWindow {
  const startTime = rule.slot_start ?? rule.standard_start;
  const endTime = rule.slot_end ?? rule.standard_end;
  const scheduledStart = atTime(day, startTime);
  const scheduledEnd = atTime(day, endTime);
  if (scheduledEnd <= scheduledStart) scheduledEnd.setDate(scheduledEnd.getDate() + 1);
  return { rule, scheduledStart, scheduledEnd };
}

function contains(window: ShiftWindow, now: Date): boolean {
  return now >= window.scheduledStart && now < window.scheduledEnd;
}

export function useShiftEngine(
  rules: ShiftRule[],
  timerStatus: TimerStatus,
  timerKind: TimerKind,
) {
  const [now, setNow] = useState(getAppNow);
  const updateShiftStatus = useShiftStore((state) => state.updateShiftStatus);
  const storedShiftNumber = useShiftStore((state) => state.currentShiftNumber);
  const hasConfiguredShifts = rules.some((rule) => rule.slot_type !== "break");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(getAppNow()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const current = useMemo(() => {
    if (!rules.length) return { shift: null, breakWindow: null, shifts: [], breaks: [] };
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const days = [new Date(today), new Date(today.getTime() - 86_400_000)];
    const shifts: ShiftWindow[] = [];
    const breaks: ShiftWindow[] = [];
    for (const day of days) {
      for (const rule of rules.filter((item) => item.day_of_week === dayNumber(day))) {
        if (rule.slot_type === "break") breaks.push(ruleWindow(rule, day));
        else shifts.push(ruleWindow(rule, day));
      }
    }
    return {
      shift: shifts.find((window) => contains(window, now)) ?? null,
      breakWindow: breaks.find((window) => contains(window, now)) ?? null,
      shifts,
      breaks,
    };
  }, [now, rules]);

  const precedingBreakEnd = useMemo(() => {
    if (!current.shift) return null;
    const prior = current.breaks
      .filter((window) => window.scheduledEnd <= current.shift!.scheduledStart)
      .sort((left, right) => right.scheduledEnd.getTime() - left.scheduledEnd.getTime())[0];
    return prior?.scheduledEnd ?? null;
  }, [current.breaks, current.shift]);

  useEffect(() => {
    const shift = current.shift;
    const breakWindow = current.breakWindow;
    const passiveBreak = Boolean(breakWindow && timerStatus === "idle");
    const breakTimer = timerKind === "break" && timerStatus !== "idle";
    const lateMinutes = shift && timerStatus === "idle"
      ? Math.max(0, Math.floor((now.getTime() - shift.scheduledStart.getTime()) / 60_000))
      : 0;
    updateShiftStatus({
      currentShiftNumber: shift?.rule.shift_number ?? (timerStatus !== "idle" ? storedShiftNumber : null),
      isBreak: passiveBreak || breakTimer,
      breakTimeRemainingSec: breakWindow && (passiveBreak || breakTimer)
        ? Math.max(0, Math.ceil((breakWindow.scheduledEnd.getTime() - now.getTime()) / 1000))
        : 0,
      isLateArrival: lateMinutes > 5,
      lateMinutes,
    });
  }, [current, now, storedShiftNumber, timerKind, timerStatus, updateShiftStatus]);

  return {
    now,
    currentShift: current.shift,
    activeShift: current.shift,
    activeBreak: current.breakWindow,
    isBreak: Boolean(current.breakWindow),
    timeRemaining: current.shift
      ? Math.max(0, Math.ceil((current.shift.scheduledEnd.getTime() - now.getTime()) / 1000))
      : null,
    hasConfiguredShifts,
    precedingBreakEnd,
  };
}
