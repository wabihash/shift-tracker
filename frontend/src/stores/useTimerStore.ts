import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type TimerStatus = "idle" | "running" | "paused";
export type TimerKind = "work" | "break";

export interface TimerSchedule {
  shiftNumber: number | null;
  scheduledStartIso: string | null;
  scheduledEndIso: string | null;
  breakOverrunMinutes: number;
  bedtimeLimitIso: string | null;
}

interface TimerState {
  status: TimerStatus;
  activeActivityId: number | null;
  plannedShiftId: number | null;
  grossSeconds: number;
  utcStartAnchor: string | null;
  notes: string;
  tickTs: number;
  timerKind: TimerKind;
  actualStartIso: string | null;
  shiftNumber: number | null;
  scheduledStartIso: string | null;
  scheduledEndIso: string | null;
  breakOverrunMinutes: number;
  bedtimeLimitIso: string | null;
  breakEndsAtIso: string | null;
}

interface TimerActions {
  startTimer: (activityId: number, plannedShiftId?: number | null, schedule?: TimerSchedule) => void;
  startBreak: (endIso: string) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => void;
  resetTimer: () => void;
  tick: () => void;
  setNotes: (notes: string) => void;
}

export type TimerStore = TimerState & TimerActions;

const initialState: TimerState = {
  status: "idle",
  activeActivityId: null,
  plannedShiftId: null,
  grossSeconds: 0,
  utcStartAnchor: null,
  notes: "",
  tickTs: 0,
  timerKind: "work",
  actualStartIso: null,
  shiftNumber: null,
  scheduledStartIso: null,
  scheduledEndIso: null,
  breakOverrunMinutes: 0,
  bedtimeLimitIso: null,
  breakEndsAtIso: null,
};

function anchorElapsedSeconds(utcStartAnchor: string | null): number {
  if (!utcStartAnchor) {
    return 0;
  }
  const anchorMs = Date.parse(utcStartAnchor);
  if (Number.isNaN(anchorMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - anchorMs) / 1000));
}

export function selectElapsedSeconds(state: TimerStore): number {
  if (state.timerKind === "break") return 0;
  if (state.status === "running") {
    return state.grossSeconds + anchorElapsedSeconds(state.utcStartAnchor);
  }
  return state.grossSeconds;
}

export function selectBreakRemainingSeconds(state: TimerStore): number {
  if (state.timerKind !== "break" || state.status !== "running" || !state.breakEndsAtIso) return 0;
  return Math.max(0, Math.ceil((Date.parse(state.breakEndsAtIso) - Date.now()) / 1000));
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      startTimer: (activityId, plannedShiftId = null, schedule) => {
        set({
          status: "running",
          activeActivityId: activityId,
          plannedShiftId,
          grossSeconds: 0,
          utcStartAnchor: new Date().toISOString(),
          tickTs: Date.now(),
          timerKind: "work",
          actualStartIso: new Date().toISOString(),
          shiftNumber: schedule?.shiftNumber ?? null,
          scheduledStartIso: schedule?.scheduledStartIso ?? null,
          scheduledEndIso: schedule?.scheduledEndIso ?? null,
          breakOverrunMinutes: schedule?.breakOverrunMinutes ?? 0,
          bedtimeLimitIso: schedule?.bedtimeLimitIso ?? null,
          breakEndsAtIso: null,
        });
      },

      startBreak: (endIso) => set({
        status: "running", timerKind: "break", activeActivityId: null, plannedShiftId: null,
        grossSeconds: 0, utcStartAnchor: null, actualStartIso: new Date().toISOString(),
        shiftNumber: null,
        scheduledStartIso: null, scheduledEndIso: endIso, breakOverrunMinutes: 0,
        bedtimeLimitIso: null, breakEndsAtIso: endIso, tickTs: Date.now(),
      }),

      pauseTimer: () => {
        const state = get();
        if (state.status !== "running") {
          return;
        }
        set({
          status: "paused",
          grossSeconds: selectElapsedSeconds(state),
          utcStartAnchor: null,
          tickTs: Date.now(),
        });
      },

      resumeTimer: () => {
        const state = get();
        if (state.status !== "paused") {
          return;
        }
        set({
          status: "running",
          utcStartAnchor: new Date().toISOString(),
          tickTs: Date.now(),
        });
      },

      stopTimer: () => {
        const state = get();
        if (state.status === "running") {
          set({
            status: "idle",
            grossSeconds: selectElapsedSeconds(state),
            utcStartAnchor: null,
            tickTs: Date.now(),
          });
          return;
        }
        set({
          status: "idle",
          utcStartAnchor: null,
          tickTs: Date.now(),
        });
      },

      resetTimer: () => {
        set({ ...initialState, tickTs: Date.now() });
      },

      tick: () => {
        if (get().timerKind === "break" && selectBreakRemainingSeconds(get()) <= 0) {
          set({ ...initialState, tickTs: Date.now() });
          return;
        }
        set({ tickTs: Date.now() });
      },

      setNotes: (notes) => {
        set({ notes });
      },
    }),
    {
      name: "shift-tracker-timer",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        status: state.status,
        activeActivityId: state.activeActivityId,
        plannedShiftId: state.plannedShiftId,
        grossSeconds: state.grossSeconds,
        utcStartAnchor: state.utcStartAnchor,
        notes: state.notes,
        timerKind: state.timerKind,
        actualStartIso: state.actualStartIso,
        shiftNumber: state.shiftNumber,
        scheduledStartIso: state.scheduledStartIso,
        scheduledEndIso: state.scheduledEndIso,
        breakOverrunMinutes: state.breakOverrunMinutes,
        bedtimeLimitIso: state.bedtimeLimitIso,
        breakEndsAtIso: state.breakEndsAtIso,
      }),
    },
  ),
);
