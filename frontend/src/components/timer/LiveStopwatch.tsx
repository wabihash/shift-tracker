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
import { useShiftEngine, getBedtimeBoundary } from "../../hooks/useShiftEngine";
import { useToast } from "../common/ToastProvider";
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

  const bedtimeCommitRef = useRef<string | null>(null);
  const previousStartRequest = useRef(startRequest);
  const previousManualRequest = useRef(manualSessionRequest);

  const activitiesQuery = useQuery({
    queryKey: ["activities"],
    queryFn: getActivities,
    enabled: !!token,
  });

  const shiftEngine = useShiftEngine(profileQuery.data?.shift_rules ?? [], status, timerKind);

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
    !!activeShift &&
    status === "idle" &&
    !deductionOpen;

  const handleStart = useCallback(() => {
    if (typeof selectedActivityId !== "number") {
      return;
    }
    const start = shiftEngine.now;
    const cutoff = shiftEngine.precedingBreakEnd;
    const breakOverrunMinutes = cutoff && start > cutoff ? Math.floor((start.getTime() - cutoff.getTime()) / 60_000) : 0;
    const bedBoundary = getBedtimeBoundary(start, profileQuery.data?.bed_cutoff ?? "22:15");
    startTimer(selectedActivityId, null, {
      shiftNumber: activeShift?.rule.shift_number ?? runningShiftNumber,
      scheduledStartIso: activeShift?.scheduledStart.toISOString() ?? null,
      scheduledEndIso: activeShift?.scheduledEnd.toISOString() ?? null,
      breakOverrunMinutes,
      bedtimeLimitIso: bedBoundary.toISOString(),
    });
  }, [activeShift, profileQuery.data?.bed_cutoff, runningShiftNumber, selectedActivityId, shiftEngine.now, shiftEngine.precedingBreakEnd, startTimer]);

  useEffect(() => {
    if (previousStartRequest.current === startRequest) return;
    previousStartRequest.current = startRequest;
    if (canStart) {
      handleStart();
    } else if (status === "idle") {
      notify({
        type: "info",
        title: "Choose an activity first",
        message: "Select an activity in the Planner view, then start the stopwatch.",
      });
    }
  }, [canStart, handleStart, notify, startRequest, status]);

  useEffect(() => {
    if (previousManualRequest.current === manualSessionRequest) return;
    previousManualRequest.current = manualSessionRequest;
    setManualSessionOpen(true);
  }, [manualSessionRequest]);

  useEffect(() => {
    if ((status !== "running" && status !== "paused") || timerKind !== "work" || !activeActivityId) return;
    const state = useTimerStore.getState();
    const autoActivityId = state.activeActivityId;
    const actualStart = state.actualStartIso ? new Date(state.actualStartIso) : null;
    if (!actualStart || !autoActivityId) return;
    const bedtimeBoundary = state.bedtimeLimitIso
      ? new Date(state.bedtimeLimitIso)
      : getBedtimeBoundary(actualStart, profileQuery.data?.bed_cutoff ?? "22:15");
    const boundary = shiftEngine.now >= bedtimeBoundary ? bedtimeBoundary : null;
    if (!boundary || bedtimeCommitRef.current === `${actualStart.toISOString()}|${boundary.toISOString()}`) return;
    bedtimeCommitRef.current = `${actualStart.toISOString()}|${boundary.toISOString()}`;
    const grossSeconds = Math.min(selectElapsedSeconds(state), Math.max(0, (boundary.getTime() - actualStart.getTime()) / 1000));
    const grossMinutes = Math.floor(grossSeconds / 60);
    const boundaryIso = boundary.toISOString();
    const capture: SessionCapture = {
      grossSeconds,
      actualStartIso: actualStart.toISOString(),
      actualEndIso: boundaryIso,
      activityId: autoActivityId,
      plannedShiftId: state.plannedShiftId,
      shiftNumber: state.shiftNumber,
      scheduledStart: state.scheduledStartIso,
      scheduledEnd: state.scheduledEndIso,
      breakOverrunMinutes: state.breakOverrunMinutes,
    };
    stopTimer();
    if (grossMinutes <= 0) {
      resetTimer();
      return;
    }
    void submitOrQueueSession(
      {
        activity_id: capture.activityId,
        shift_number: capture.shiftNumber,
        planned_shift_id: capture.plannedShiftId,
        actual_start: capture.actualStartIso,
        actual_end: boundaryIso,
        scheduled_start: capture.scheduledStart,
        scheduled_end: capture.scheduledEnd,
        gross_minutes: grossMinutes,
        deducted_minutes: 0,
        break_overrun_minutes: capture.breakOverrunMinutes,
        notes: "Automatically stopped and saved at bedtime boundary.",
        logged_date: boundaryIso.slice(0, 10),
      },
      queryClient,
      {
        profile: profileQuery.data,
        activities: activitiesQuery.data,
      },
    ).then((result) => {
      if (result.isOffline) {
        notify({
          type: "info",
          title: "Offline Session",
          message: "Saved locally (Offline). Weekly analytics updated.",
        });
      } else {
        sessionSaved(grossMinutes);
      }
      resetTimer();
    }).catch((error: Error) => {
      setSessionCapture(capture);
      setDeductionOpen(true);
      notify({ type: "error", title: "Bedtime save failed", message: error.message || "Review and save the stopped session." });
    });
  }, [activeActivityId, activitiesQuery.data, notify, profileQuery.data, profileQuery.data?.bed_cutoff, queryClient, resetTimer, sessionSaved, shiftEngine.now, status, stopTimer, timerKind]);

  const handleStop = () => {
    const state = useTimerStore.getState();
    if (state.timerKind === "break") {
      stopTimer();
      resetTimer();
      return;
    }
    const endIso = new Date().toISOString();
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
  };

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
      </div>

      <div className={`rounded-xl border p-6 text-center transition-all duration-500 ${accentGlow ? "border-emerald-500/50 shadow-emerald-500/10 shadow-lg" : "border-indigo-500/30 bg-indigo-500/5"}`}>
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-indigo-300">
          Live Timer
        </p>
        <p className="font-mono text-5xl font-bold tracking-wider text-slate-50 sm:text-6xl">
          {formatElapsed(displayedSeconds)}
        </p>
        <div className="mx-auto mt-1 flex h-5 max-w-full items-center justify-center overflow-hidden">
          <span className="inline-block max-w-full truncate rounded border border-slate-700/70 bg-slate-900/50 px-2 py-0.5 font-mono text-[10px] text-slate-400" title={getCadenceMessage()}>
            {timerKind === "work" && status === "running" ? getRunningFocusCue(Math.floor(elapsedSeconds / 5) % 4) : getCadenceMessage()}
          </span>
        </div>
        <p className="mt-2 text-xs capitalize text-slate-400">{status}</p>
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
          onClose={() => {
            setDeductionOpen(false);
            setSessionCapture(null);
          }}
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
