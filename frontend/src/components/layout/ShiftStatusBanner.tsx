import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Coffee, Timer } from "lucide-react";
import type { ReactElement } from "react";

import { getProfile } from "../../api/profile";
import { useAuthToken } from "../../auth/AuthTokenContext";
import { useShiftStore } from "../../stores/useShiftStore";
import { useTimerStore } from "../../stores/useTimerStore";
import { useShiftEngine } from "../../hooks/useShiftEngine";
import { formatVarianceDuration } from "../../utils/time";

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

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-sm font-semibold text-indigo-200">
            <Timer className="h-4 w-4" />{timerStatus === "idle" ? "Idle · Ready for next session" : currentShiftNumber ? `Shift ${currentShiftNumber}` : "No Active Shift"}
            {timerStatus !== "idle" && shiftEngine.activeShift ? <span className="font-normal text-indigo-300/80">({shiftEngine.activeShift.rule.name})</span> : null}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {timerStatus === "running" && timerKind === "break" && isBreak && breakTimeRemainingSec > 0 ? <div className="inline-flex items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200"><Coffee className="h-4 w-4" />Scheduled break · {formatCountdown(breakTimeRemainingSec)} remaining</div> : null}
        {timerStatus === "running" && timerKind === "work" && isLateArrival && shiftEngine.activeShift ? <div className="inline-flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-200"><AlertTriangle className="h-4 w-4" />Late arrival: {formatVarianceDuration(lateMinutes)} after scheduled</div> : null}
      </div>
    </div>
  );
}
