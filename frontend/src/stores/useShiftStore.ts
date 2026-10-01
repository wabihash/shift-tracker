import { create } from "zustand";

import type { WeeklyAnalyticsResponse } from "../types/schema";

export interface ShiftStatusPayload {
  currentShiftNumber?: number | null;
  isBreak?: boolean;
  breakTimeRemainingSec?: number;
  isLateArrival?: boolean;
  lateMinutes?: number;
}

interface ShiftState {
  currentShiftNumber: number | null;
  isBreak: boolean;
  breakTimeRemainingSec: number;
  isLateArrival: boolean;
  lateMinutes: number;
  isOffline: boolean;
  isSyncing: boolean;
  pendingOutboxCount: number;
  weeklyAnalytics: WeeklyAnalyticsResponse | null;
}

interface ShiftActions {
  updateShiftStatus: (payload: ShiftStatusPayload) => void;
  resetShiftStatus: () => void;
  setOfflineStatus: (isOffline: boolean) => void;
  setSyncingStatus: (isSyncing: boolean) => void;
  setPendingOutboxCount: (count: number) => void;
  incrementPendingOutbox: () => void;
  decrementPendingOutbox: () => void;
  setWeeklyAnalytics: (analytics: WeeklyAnalyticsResponse | null) => void;
}

export type ShiftStore = ShiftState & ShiftActions;

const initialState: ShiftState = {
  currentShiftNumber: null,
  isBreak: false,
  breakTimeRemainingSec: 0,
  isLateArrival: false,
  lateMinutes: 0,
  isOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
  isSyncing: false,
  pendingOutboxCount: 0,
  weeklyAnalytics: null,
};

export const useShiftStore = create<ShiftStore>((set) => ({
  ...initialState,

  updateShiftStatus: (payload) => {
    set((state) => ({
      currentShiftNumber:
        payload.currentShiftNumber !== undefined
          ? payload.currentShiftNumber
          : state.currentShiftNumber,
      isBreak:
        payload.isBreak !== undefined ? payload.isBreak : state.isBreak,
      breakTimeRemainingSec:
        payload.breakTimeRemainingSec !== undefined
          ? payload.breakTimeRemainingSec
          : state.breakTimeRemainingSec,
      isLateArrival:
        payload.isLateArrival !== undefined
          ? payload.isLateArrival
          : state.isLateArrival,
      lateMinutes:
        payload.lateMinutes !== undefined
          ? payload.lateMinutes
          : state.lateMinutes,
    }));
  },

  resetShiftStatus: () => {
    set(initialState);
  },

  setOfflineStatus: (isOffline) => {
    set({ isOffline });
  },

  setSyncingStatus: (isSyncing) => {
    set({ isSyncing });
  },

  setPendingOutboxCount: (pendingOutboxCount) => {
    set({ pendingOutboxCount: Math.max(0, pendingOutboxCount) });
  },

  incrementPendingOutbox: () => {
    set((state) => ({ pendingOutboxCount: state.pendingOutboxCount + 1 }));
  },

  decrementPendingOutbox: () => {
    set((state) => ({ pendingOutboxCount: Math.max(0, state.pendingOutboxCount - 1) }));
  },

  setWeeklyAnalytics: (weeklyAnalytics) => {
    set({ weeklyAnalytics });
  },
}));
