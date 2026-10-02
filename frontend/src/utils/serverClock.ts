import { getApiBaseUrl } from "../api/client";

const CLOCK_STORAGE_KEY = "shift-tracker-server-clock";
const DEFAULT_OFFSET = 0;

function readSavedOffset(): number {
  try {
    const saved = localStorage.getItem(CLOCK_STORAGE_KEY);
    if (!saved) return DEFAULT_OFFSET;
    const value = JSON.parse(saved) as { offsetMs?: unknown };
    return typeof value.offsetMs === "number" && Number.isFinite(value.offsetMs)
      ? value.offsetMs
      : DEFAULT_OFFSET;
  } catch {
    return DEFAULT_OFFSET;
  }
}

let serverOffsetMs = typeof window === "undefined" ? DEFAULT_OFFSET : readSavedOffset();

/** Returns current time corrected by the most recent backend clock calibration. */
export function getAppNow(): Date {
  return new Date(Date.now() + serverOffsetMs);
}

/** Returns an ISO timestamp from the calibrated clock for session records. */
export function getAppNowIso(): string {
  return getAppNow().toISOString();
}

/**
 * Calibrate device wall time against the backend. The request midpoint reduces
 * the effect of network latency; failures preserve the last known calibration.
 */
export async function syncServerClock(): Promise<void> {
  const requestStartedAt = Date.now();
  try {
    const response = await fetch(`${getApiBaseUrl()}/health`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { server_time?: unknown };
    const serverTimeMs = typeof payload.server_time === "string"
      ? Date.parse(payload.server_time)
      : Number.NaN;
    const requestEndedAt = Date.now();
    if (!Number.isFinite(serverTimeMs)) return;

    serverOffsetMs = serverTimeMs - (requestStartedAt + requestEndedAt) / 2;
    try {
      localStorage.setItem(CLOCK_STORAGE_KEY, JSON.stringify({ offsetMs: serverOffsetMs }));
    } catch {
      // Clock correction still works for the current page if storage is blocked.
    }
  } catch {
    // Offline startup is supported; use the last saved calibration when available.
  }
}

export function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getClientTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
