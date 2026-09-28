import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type TimerStatus = "idle" | "running" | "paused";

interface TimerState {
  status: TimerStatus;
  activeActivityId: number | null;
  plannedShiftId: number | null;
  grossSeconds: number;
  utcStartAnchor: string | null;
  notes: string;
  tickTs: number;
}

interface TimerActions {
  startTimer: (activityId: number, plannedShiftId?: number | null) => void;
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
  if (state.status === "running") {
    return state.grossSeconds + anchorElapsedSeconds(state.utcStartAnchor);
  }
  return state.grossSeconds;
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      startTimer: (activityId, plannedShiftId = null) => {
        set({
          status: "running",
          activeActivityId: activityId,
          plannedShiftId,
          grossSeconds: 0,
          utcStartAnchor: new Date().toISOString(),
          tickTs: Date.now(),
        });
      },

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
      }),
    },
  ),
);
