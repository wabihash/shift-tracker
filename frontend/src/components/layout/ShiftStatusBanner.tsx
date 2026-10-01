import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Coffee, Timer } from "lucide-react";
import type { ReactElement } from "react";

import { getProfile } from "../../api/profile";
import { useAuthToken } from "../../auth/AuthTokenContext";
import { useShiftStore } from "../../stores/useShiftStore";
import { useTimerStore } from "../../stores/useTimerStore";
import { useShiftEngine } from "../../hooks/useShiftEngine";
import { formatVarianceDuration } from "../../utils/time";
import { DEFAULT_BED_CUTOFF, DEFAULT_WAKE_TIME } from "../../types/schema";

function parseTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function formatClockMinutes(totalMinutes: number): string {
  const total = ((totalMinutes % 1440) + 1440) % 1440;
  const rawHours = Math.floor(total / 60);
  const minutes = total % 60;
  const period = rawHours >= 12 ? "PM" : "AM";
  return `${rawHours % 12 || 12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ShiftStatusBanner(): ReactElement {
  const token = useAuthToken();
  const timerStatus = useTimerStore((state) => state.status);
  const timerKind = useTimerStore((state) => state.timerKind);
  const isBreak = useShiftStore((state) => state.isBreak);
  const breakTimeRemainingSec = useShiftStore((state) => state.breakTimeRemainingSec);
  const isLateArrival = useShiftStore((state) => state.isLateArrival);
  const lateMinutes = useShiftStore((state) => state.lateMinutes);
  const currentShiftNumber = useShiftStore((state) => state.currentShiftNumber);
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getProfile, enabled: !!token });
  const profile = profileQuery.data;
  const shiftEngine = useShiftEngine(profile?.shift_rules ?? [], timerStatus, timerKind);
  const wakeMinutes = parseTimeToMinutes(profile?.wake_time ?? DEFAULT_WAKE_TIME);
  const bedMinutes = parseTimeToMinutes(profile?.bed_cutoff ?? DEFAULT_BED_CUTOFF);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-sm font-semibold text-indigo-200">
            <Timer className="h-4 w-4" />{currentShiftNumber ? `Shift ${currentShiftNumber}` : "No Active Shift"}
            {shiftEngine.activeShift ? <span className="font-normal text-indigo-300/80">({shiftEngine.activeShift.rule.name})</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded border border-slate-700 px-2 py-1">Wake {formatClockMinutes(wakeMinutes)}</span>
          <span className="rounded border border-slate-700 px-2 py-1">Bed {formatClockMinutes(bedMinutes)}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isBreak && breakTimeRemainingSec > 0 ? <div className="inline-flex items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200"><Coffee className="h-4 w-4" />Scheduled break · {formatCountdown(breakTimeRemainingSec)} remaining</div> : null}
        {isLateArrival && shiftEngine.activeShift ? <div className="inline-flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-200"><AlertTriangle className="h-4 w-4" />Late arrival: {formatVarianceDuration(lateMinutes)} after scheduled</div> : null}
      </div>
    </div>
  );
}
