import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ShiftMode = "STANDARD" | "RUSH";

interface ModeState {
  activeMode: ShiftMode;
  isManualOverride: boolean;
}

interface ModeActions {
  setMode: (mode: ShiftMode) => void;
  toggleMode: () => void;
  resetToAutoMode: () => void;
}

export type ModeStore = ModeState & ModeActions;

export const useModeStore = create<ModeStore>()(
  persist(
    (set, get) => ({
      activeMode: "STANDARD",
      isManualOverride: false,

      setMode: (mode) => {
        set({ activeMode: mode, isManualOverride: true });
      },

      toggleMode: () => {
        const next = get().activeMode === "STANDARD" ? "RUSH" : "STANDARD";
        set({ activeMode: next, isManualOverride: true });
      },

      resetToAutoMode: () => {
        set({ isManualOverride: false, activeMode: "STANDARD" });
      },
    }),
    {
      name: "shift-tracker-mode",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
