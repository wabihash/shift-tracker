import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClockPlus, Pause, Play, Square } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";

import { getActivities } from "../../api/activities";
import { getProfile } from "../../api/profile";
import { submitOrQueueSession } from "../../services/sessionSubmission";
import { useAuthToken } from "../../auth/AuthTokenContext";
import { useShiftEngine } from "../../hooks/useShiftEngine";
import { useToast } from "../common/ToastProvider";
import { getAppNowIso } from "../../utils/serverClock";
import { getCadenceMessage, getRunningFocusCue } from "../../config/cadenceMessages";
import { useShiftStore } from "../../stores/useShiftStore";
import {
  selectElapsedSeconds,
  selectBreakRemainingSeconds,
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

interface SessionCapture {
  grossSeconds: number;
  actualStartIso: string;
  actualEndIso: string;
  activityId: number;
  plannedShiftId: number | null;
  shiftNumber: number | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  breakOverrunMinutes: number;
}

interface LiveStopwatchProps {
  startRequest?: number;
  manualSessionRequest?: number;
}

export function LiveStopwatch({
  startRequest = 0,
  manualSessionRequest = 0,
}: LiveStopwatchProps): ReactElement {
  const token = useAuthToken();
  const queryClient = useQueryClient();
  const { notify, sessionSaved } = useToast();
  const status = useTimerStore((state) => state.status);
  const activeActivityId = useTimerStore((state) => state.activeActivityId);
  const timerKind = useTimerStore((state) => state.timerKind);
  const scheduledEndIsoStored = useTimerStore((state) => state.scheduledEndIso);
  const runningShiftNumber = useShiftStore((state) => state.currentShiftNumber);
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getProfile, enabled: !!token });
  const tickTs = useTimerStore((state) => state.tickTs);
  const startTimer = useTimerStore((state) => state.startTimer);
  const pauseTimer = useTimerStore((state) => state.pauseTimer);
  const resumeTimer = useTimerStore((state) => state.resumeTimer);
  const stopTimer = useTimerStore((state) => state.stopTimer);
  const tick = useTimerStore((state) => state.tick);
  const startBreak = useTimerStore((state) => state.startBreak);
  const resetTimer = useTimerStore((state) => state.resetTimer);

  const [selectedActivityId, setSelectedActivityId] = useState<number | "">("");
  const [deductionOpen, setDeductionOpen] = useState(false);
  const [manualSessionOpen, setManualSessionOpen] = useState(false);
  const [sessionCapture, setSessionCapture] = useState<SessionCapture | null>(
    null,
  );
  const [accentGlow, setAccentGlow] = useState(false);

  const previousStartRequest = useRef(startRequest);
  const previousManualRequest = useRef(manualSessionRequest);

  const activitiesQuery = useQuery({
    queryKey: ["activities"],
    queryFn: getActivities,
    enabled: !!token,
  });

  const shiftEngine = useShiftEngine(profileQuery.data?.shift_rules ?? [], status, timerKind);

  useEffect(() => {
    const restored = useTimerStore.getState();
    if (restored.status === "idle" || (restored.status === "running" && !restored.utcStartAnchor)) {
      resetTimer();
    }
  }, [resetTimer]);

  useEffect(() => {
    const intervalId = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(intervalId);
  }, [tick]);

  useEffect(() => {
    if (activeActivityId) {
      setSelectedActivityId(activeActivityId);
    }
  }, [activeActivityId]);

  const elapsedSeconds = useTimerStore(selectElapsedSeconds);
  const breakRemainingSeconds = selectBreakRemainingSeconds(useTimerStore.getState());
  const displayedSeconds = timerKind === "break" ? breakRemainingSeconds : elapsedSeconds;
  const shiftWindowClosed = timerKind === "work" && status !== "idle" && !!scheduledEndIsoStored && shiftEngine.now.getTime() > Date.parse(scheduledEndIsoStored);
  void tickTs;

  const activeShift = shiftEngine.activeShift;

  const canStart =
    typeof selectedActivityId === "number" &&
    (shiftEngine.hasConfiguredShifts ? !!activeShift : true) &&
    status === "idle" &&
    !deductionOpen;

  const handleStart = useCallback(() => {
    if (typeof selectedActivityId !== "number") {
      return;
    }
    const start = shiftEngine.now;
    const cutoff = shiftEngine.precedingBreakEnd;
    const breakOverrunMinutes = cutoff && start > cutoff ? Math.floor((start.getTime() - cutoff.getTime()) / 60_000) : 0;
    startTimer(selectedActivityId, null, {
      shiftNumber: activeShift?.rule.shift_number ?? runningShiftNumber,
      scheduledStartIso: activeShift?.scheduledStart.toISOString() ?? null,
      scheduledEndIso: activeShift?.scheduledEnd.toISOString() ?? null,
      breakOverrunMinutes,
    });
  }, [activeShift, runningShiftNumber, selectedActivityId, shiftEngine.now, shiftEngine.precedingBreakEnd, startTimer]);

  useEffect(() => {
    if (previousStartRequest.current === startRequest) return;
    previousStartRequest.current = startRequest;
    if (canStart) {
      handleStart();
    } else if (status === "idle") {
      notify({
        type: "info",
        title: typeof selectedActivityId !== "number" ? "Choose an activity first" : "Ready to focus",
        message: typeof selectedActivityId !== "number"
          ? "Select or create an activity in the Activities view, then start the stopwatch."
          : "Select a shift window in Configure Shifts to enable starting the stopwatch.",
      });
    }
  }, [canStart, handleStart, notify, startRequest, status]);

  useEffect(() => {
    if (previousManualRequest.current === manualSessionRequest) return;
    previousManualRequest.current = manualSessionRequest;
    setManualSessionOpen(true);
  }, [manualSessionRequest]);

  const handleStop = useCallback(() => {
    const state = useTimerStore.getState();
    if (state.timerKind === "break") {
      stopTimer();
      resetTimer();
      return;
    }
    const endIso = getAppNowIso();
    const grossSeconds = selectElapsedSeconds(state);
    const activityId =
      activeActivityId ??
      (typeof selectedActivityId === "number" ? selectedActivityId : null);

    if (!activityId || grossSeconds <= 0) {
      stopTimer();
      return;
    }

    const actualStartIso = state.actualStartIso ?? new Date(Date.now() - grossSeconds * 1000).toISOString();

    stopTimer();
    setSessionCapture({
      grossSeconds,
      actualStartIso,
      actualEndIso: endIso,
      activityId,
      plannedShiftId: state.plannedShiftId,
      shiftNumber: state.shiftNumber,
      scheduledStart: state.scheduledStartIso,
      scheduledEnd: state.scheduledEndIso,
      breakOverrunMinutes: state.breakOverrunMinutes,
    });
    setDeductionOpen(true);
  }, [activeActivityId, selectedActivityId, stopTimer]);

  const handleDiscard = () => {
    resetTimer();
    setDeductionOpen(false);
    setSessionCapture(null);
  };

  useEffect(() => {
    const handleShortcutStart = () => {
      if (canStart) handleStart();
    };
    const handleShortcutStop = () => {
      if (status !== "idle") handleStop();
    };
    window.addEventListener("shift-tracker:start", handleShortcutStart);
    window.addEventListener("shift-tracker:stop", handleShortcutStop);
    return () => {
      window.removeEventListener("shift-tracker:start", handleShortcutStart);
      window.removeEventListener("shift-tracker:stop", handleShortcutStop);
    };
  }, [canStart, handleStart, handleStop, status]);

  return (
    <div className="space-y-4">
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

        <p className="mt-3 text-xs text-slate-400">{runningShiftNumber ? `Active Shift ${runningShiftNumber}` : "No active shift window"}</p>
        {!shiftEngine.hasConfiguredShifts ? <p className="mt-1 text-xs text-indigo-300">No shift windows configured. Starting now will track an unscheduled focus session.</p> : null}
      </div>

      <div className={`rounded-xl border p-6 text-center transition-all duration-500 ${accentGlow ? "border-emerald-500/50 shadow-emerald-500/10 shadow-lg" : "border-indigo-500/30 bg-indigo-500/5"}`}>
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-indigo-300">
          Live Timer
        </p>
        <p className="font-mono text-5xl font-bold tracking-wider text-slate-50 sm:text-6xl">
          {formatElapsed(displayedSeconds)}
        </p>
        <div className="mx-auto mt-1 flex h-7 items-center justify-center gap-[3px]" role="img" aria-label={status === "running" ? "Focus timer wave visualizer" : status === "paused" ? "Paused timer visualizer" : "Timer resting"}>
          {status !== "running" ? (
            <span className="h-px w-32 rounded-full bg-slate-700" aria-hidden="true" />
          ) : Array.from({ length: 25 }, (_, index) => (
            <span
              key={index}
              className="focus-wave-bar h-5 w-1 rounded-full bg-gradient-to-t from-emerald-500/70 to-cyan-300"
              aria-hidden="true"
            />
          ))}
        </div>
        <p className={`mt-1 h-5 truncate text-xs leading-5 ${status === "running" ? "text-emerald-300" : "text-slate-400"}`}>
          {status === "running" && timerKind === "work"
            ? `Focus mode active · ${getRunningFocusCue(Math.floor(elapsedSeconds / 5) % 4)}`
            : status === "running"
              ? "Break in progress · Take a moment to reset"
              : `${status === "paused" ? "Paused" : "Idle"} · ${getCadenceMessage()}`}
        </p>
          <p className="mt-1 text-xs text-slate-500">{runningShiftNumber ? `Shift ${runningShiftNumber}` : "No active shift"}</p>
      </div>

      {shiftWindowClosed && scheduledEndIsoStored ? <div role="alert" className="rounded-lg border-2 border-rose-500 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100 shadow-lg shadow-rose-950/30">Shift Window Closed at {new Date(scheduledEndIsoStored).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Stopping now will default to the scheduled end; verify overtime in the save dialog.</div> : null}

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
        {shiftEngine.activeBreak && status === "idle" ? <button type="button" onClick={() => startBreak(shiftEngine.activeBreak!.scheduledEnd.toISOString())} className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600"><span aria-hidden>☕</span>Start Break</button> : null}
        <button
          type="button"
          onClick={pauseTimer}
          disabled={status !== "running" || timerKind === "break"}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pause className="h-4 w-4" />
          Pause
        </button>
        <button
          type="button"
          onClick={resumeTimer}
          disabled={status !== "paused" || timerKind === "break"}
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
          {timerKind === "break" ? "End Break" : "Stop"}
        </button>
        {status !== "running" ? (
          <button
            type="button"
            onClick={handleDiscard}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-300 hover:border-rose-500/60 hover:bg-slate-800 hover:text-rose-200"
          >
            Reset / Discard
          </button>
        ) : null}
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
          onSessionSaved={() => {
            setAccentGlow(true);
            window.setTimeout(() => setAccentGlow(false), 2500);
          }}
          onClose={handleDiscard}
          activityId={sessionCapture.activityId}
          plannedShiftId={sessionCapture.plannedShiftId}
          scheduledStart={sessionCapture.scheduledStart}
          scheduledEnd={sessionCapture.scheduledEnd}
          shiftNumber={sessionCapture.shiftNumber}
          breakOverrunMinutes={sessionCapture.breakOverrunMinutes}
          grossSeconds={sessionCapture.grossSeconds}
          actualStartIso={sessionCapture.actualStartIso}
          actualEndIso={sessionCapture.actualEndIso}
        />
      ) : null}
    </div>
  );
}
