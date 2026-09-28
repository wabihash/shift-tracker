import { useQuery } from "@tanstack/react-query";
import { ClockPlus, Pause, Play, Square, Zap } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";

import { getActivities } from "../../api/activities";
import { getPlannedShifts } from "../../api/planner";
import { useModeStore } from "../../stores/useModeStore";
import {
  selectElapsedSeconds,
  useTimerStore,
} from "../../stores/useTimerStore";

import { DeductionModal } from "./DeductionModal";
import { ManualSessionModal } from "./ManualSessionModal";

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function startOfDayIso(date: Date): string {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

function endOfDayIso(date: Date): string {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy.toISOString();
}

interface SessionCapture {
  grossSeconds: number;
  actualStartIso: string;
  actualEndIso: string;
  activityId: number;
  plannedShiftId: number | null;
}

export function LiveStopwatch(): ReactElement {
  const status = useTimerStore((state) => state.status);
  const activeActivityId = useTimerStore((state) => state.activeActivityId);
  const plannedShiftId = useTimerStore((state) => state.plannedShiftId);
  const tickTs = useTimerStore((state) => state.tickTs);
  const startTimer = useTimerStore((state) => state.startTimer);
  const pauseTimer = useTimerStore((state) => state.pauseTimer);
  const resumeTimer = useTimerStore((state) => state.resumeTimer);
  const stopTimer = useTimerStore((state) => state.stopTimer);
  const tick = useTimerStore((state) => state.tick);

  const activeMode = useModeStore((state) => state.activeMode);

  const [selectedActivityId, setSelectedActivityId] = useState<number | "">("");
  const [selectedPlannedShiftId, setSelectedPlannedShiftId] = useState<
    number | ""
  >("");
  const [deductionOpen, setDeductionOpen] = useState(false);
  const [manualSessionOpen, setManualSessionOpen] = useState(false);
  const [sessionCapture, setSessionCapture] = useState<SessionCapture | null>(
    null,
  );

  const sessionWallStartRef = useRef<string | null>(null);

  const activitiesQuery = useQuery({
    queryKey: ["activities"],
    queryFn: getActivities,
  });

  const todayRange = useMemo(() => {
    const now = new Date();
    return { start: startOfDayIso(now), end: endOfDayIso(now) };
  }, []);

  const plannedShiftsQuery = useQuery({
    queryKey: ["planned-shifts", todayRange.start, todayRange.end],
    queryFn: () => getPlannedShifts(todayRange.start, todayRange.end),
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(intervalId);
  }, [tick]);

  useEffect(() => {
    if (activeActivityId) {
      setSelectedActivityId(activeActivityId);
    }
    if (plannedShiftId) {
      setSelectedPlannedShiftId(plannedShiftId);
    }
  }, [activeActivityId, plannedShiftId]);

  const elapsedSeconds = useTimerStore(selectElapsedSeconds);
  void tickTs;

  const filteredPlannedShifts = useMemo(() => {
    if (!selectedActivityId) {
      return plannedShiftsQuery.data ?? [];
    }
    return (plannedShiftsQuery.data ?? []).filter(
      (shift) => shift.activity_id === selectedActivityId,
    );
  }, [plannedShiftsQuery.data, selectedActivityId]);

  const canStart =
    typeof selectedActivityId === "number" &&
    status === "idle" &&
    !deductionOpen;

  const handleStart = () => {
    if (typeof selectedActivityId !== "number") {
      return;
    }
    sessionWallStartRef.current = new Date().toISOString();
    startTimer(
      selectedActivityId,
      typeof selectedPlannedShiftId === "number"
        ? selectedPlannedShiftId
        : null,
    );
  };

  const handleStop = () => {
    const endIso = new Date().toISOString();
    const grossSeconds = selectElapsedSeconds(useTimerStore.getState());
    const activityId =
      activeActivityId ??
      (typeof selectedActivityId === "number" ? selectedActivityId : null);

    if (!activityId || grossSeconds <= 0) {
      stopTimer();
      sessionWallStartRef.current = null;
      return;
    }

    const actualStartIso =
      sessionWallStartRef.current ??
      new Date(Date.now() - grossSeconds * 1000).toISOString();

    stopTimer();
    setSessionCapture({
      grossSeconds,
      actualStartIso,
      actualEndIso: endIso,
      activityId,
      plannedShiftId:
        plannedShiftId ??
        (typeof selectedPlannedShiftId === "number"
          ? selectedPlannedShiftId
          : null),
    });
    setDeductionOpen(true);
    sessionWallStartRef.current = null;
  };

  return (
    <div className="space-y-4">
      <div
        className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide ${
          activeMode === "RUSH"
            ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
        }`}
      >
        <span className="inline-flex items-center justify-center gap-2">
          <Zap className="h-4 w-4" />
          {activeMode === "RUSH" ? "RUSH Execution" : "STANDARD Execution"}
        </span>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
        <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
          Activity
        </label>
        <select
          value={selectedActivityId}
          disabled={status !== "idle"}
          onChange={(event) => {
            const value = event.target.value;
            setSelectedActivityId(value ? Number(value) : "");
            setSelectedPlannedShiftId("");
          }}
          className="mb-3 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 disabled:opacity-60"
        >
          <option value="">Select activity</option>
          {(activitiesQuery.data ?? []).map((activity) => (
            <option key={activity.id} value={activity.id}>
              {activity.name}
            </option>
          ))}
        </select>

        <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
          Planned Shift (optional)
        </label>
        <select
          value={selectedPlannedShiftId}
          disabled={status !== "idle" || !selectedActivityId}
          onChange={(event) => {
            const value = event.target.value;
            setSelectedPlannedShiftId(value ? Number(value) : "");
          }}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 disabled:opacity-60"
        >
          <option value="">No linked block</option>
          {filteredPlannedShifts.map((shift) => (
            <option key={shift.id} value={shift.id}>
              {shift.title}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-6 text-center">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-indigo-300">
          Live Timer
        </p>
        <p className="font-mono text-5xl font-bold tracking-wider text-slate-50 sm:text-6xl">
          {formatElapsed(elapsedSeconds)}
        </p>
        <p className="mt-2 text-xs capitalize text-slate-400">{status}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          Start
        </button>
        <button
          type="button"
          onClick={pauseTimer}
          disabled={status !== "running"}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pause className="h-4 w-4" />
          Pause
        </button>
        <button
          type="button"
          onClick={resumeTimer}
          disabled={status !== "paused"}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          Resume
        </button>
        <button
          type="button"
          onClick={handleStop}
          disabled={status === "idle" || deductionOpen}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Square className="h-4 w-4" />
          Stop
        </button>
      </div>

      <button
        type="button"
        onClick={() => setManualSessionOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-300 hover:border-indigo-500/60 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
      >
        <ClockPlus className="h-4 w-4" aria-hidden="true" />
        Log Past Session
      </button>

      <ManualSessionModal
        isOpen={manualSessionOpen}
        onClose={() => setManualSessionOpen(false)}
      />

      {sessionCapture ? (
        <DeductionModal
          isOpen={deductionOpen}
          onClose={() => {
            setDeductionOpen(false);
            setSessionCapture(null);
          }}
          activityId={sessionCapture.activityId}
          plannedShiftId={sessionCapture.plannedShiftId}
          grossSeconds={sessionCapture.grossSeconds}
          actualStartIso={sessionCapture.actualStartIso}
          actualEndIso={sessionCapture.actualEndIso}
        />
      ) : null}
    </div>
  );
}
