import { create } from "zustand";

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
}

interface ShiftActions {
  updateShiftStatus: (payload: ShiftStatusPayload) => void;
  resetShiftStatus: () => void;
}

export type ShiftStore = ShiftState & ShiftActions;

const initialState: ShiftState = {
  currentShiftNumber: null,
  isBreak: false,
  breakTimeRemainingSec: 0,
  isLateArrival: false,
  lateMinutes: 0,
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
}));
