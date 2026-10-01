export type CadenceDay = "regular" | "wednesday" | "friday" | "sunday";

export const CADENCE_MESSAGES: Record<CadenceDay, string> = {
  regular: "Execute precisely. Track time, honor caps, ship outcomes.",
  wednesday: "Wednesday cadence: Hard stop 8 PM. Protect evening recovery.",
  friday: "Deep Focus Protocol: High intensity, full break buffers.",
  sunday: "Finish by 5:15 PM. Guard your 4h inactive evening recharge.",
};

export const RUNNING_FOCUS_CUES = [
  "Stay hard • Hold the standard.",
  "Lock in • Zero distractions.",
  "In the zone • Doing great.",
  "Protect the block • Ship outcomes.",
] as const;

export const SESSION_SAVED_CUES = [
  "Block logged. Velocity maintained. ⚡",
  "Great work. Velocity maintained. ⚡",
  "Banked and logged. Stay hard.",
] as const;

export function getRunningFocusCue(index = 0): string {
  return RUNNING_FOCUS_CUES[index % RUNNING_FOCUS_CUES.length] ?? RUNNING_FOCUS_CUES[0];
}

export function getSessionSavedCue(index = Math.floor(Math.random() * SESSION_SAVED_CUES.length)): string {
  return SESSION_SAVED_CUES[index % SESSION_SAVED_CUES.length] ?? SESSION_SAVED_CUES[0];
}

export function getMilestoneMessage(percent: number): string | null {
  if (percent >= 100) return "68h Core Achieved. Master-level execution. Enter recovery mode.";
  if (percent >= 75) return "Final stretch. Maintain form through the finish.";
  if (percent >= 50) return "Halfway marker cleared. Energy management is working.";
  if (percent >= 25) return "Strong opening phase. Pace is locked.";
  return null;
}

export function getCadenceMessage(date: Date = new Date()): string {
  switch (date.getDay()) {
    case 3:
      return CADENCE_MESSAGES.wednesday;
    case 5:
      return CADENCE_MESSAGES.friday;
    case 0:
      return CADENCE_MESSAGES.sunday;
    default:
      return CADENCE_MESSAGES.regular;
  }
}
