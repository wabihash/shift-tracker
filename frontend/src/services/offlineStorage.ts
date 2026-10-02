import { del, get, set } from "idb-keyval";

import type {
  SessionLog,
  SessionLogCreateInput,
  UserProfileDetail,
  VarianceType,
  WeeklyAnalyticsResponse,
} from "../types/schema";

export const OUTBOX_SESSIONS_KEY = "outbox_sessions";
export const CACHED_PROFILE_KEY = "cached_profile";
export const CACHED_WEEKLY_SUMMARY_KEY = "cached_weekly_summary";

export interface PendingSessionLog extends SessionLog {
  localId: string;
  queued_at?: string;
  client_timezone?: string;
}

function localUserId(): number | undefined {
  try {
    const raw = localStorage.getItem("user_profile");
    const id = raw ? (JSON.parse(raw) as { id?: unknown }).id : undefined;
    return typeof id === "number" ? id : undefined;
  } catch {
    return undefined;
  }
}

async function readOutbox(): Promise<PendingSessionLog[]> {
  return (await get<PendingSessionLog[]>(OUTBOX_SESSIONS_KEY)) ?? [];
}

function calculateVariance(
  scheduledStart: string | null | undefined,
  actualStart: string,
): { varianceType: VarianceType; varianceMinutes: number } {
  if (!scheduledStart) {
    return { varianceType: "ON_TIME", varianceMinutes: 0 };
  }
  const schedMs = Date.parse(scheduledStart);
  const actMs = Date.parse(actualStart);
  if (Number.isNaN(schedMs) || Number.isNaN(actMs)) {
    return { varianceType: "ON_TIME", varianceMinutes: 0 };
  }
  const diffMinutes = Math.round((actMs - schedMs) / 60000);
  if (diffMinutes > 3) {
    return { varianceType: "LATE_START", varianceMinutes: diffMinutes };
  }
  if (diffMinutes < -3) {
    return { varianceType: "EARLY_START", varianceMinutes: Math.abs(diffMinutes) };
  }
  return { varianceType: "ON_TIME", varianceMinutes: 0 };
}

/**
 * Persists an unsynced session locally into the IndexedDB outbox queue.
 * Assigns a temporary offline UUID and timestamps the record.
 */
export async function saveSessionLocally(
  sessionPayload: SessionLog | (SessionLogCreateInput & Partial<SessionLog>),
): Promise<PendingSessionLog> {
  const localId = sessionPayload.localId || `offline_${Date.now()}`;
  const now = new Date().toISOString();
  const deducted = sessionPayload.deducted_minutes ?? 0;
  const netMinutes = sessionPayload.net_minutes ?? Math.max(0, sessionPayload.gross_minutes - deducted);
  const variance = calculateVariance(sessionPayload.scheduled_start, sessionPayload.actual_start);

  const record: PendingSessionLog = {
    id: sessionPayload.id ?? 0,
    user_id: "user_id" in sessionPayload ? sessionPayload.user_id : localUserId(),
    activity_id: sessionPayload.activity_id,
    shift_number: sessionPayload.shift_number ?? null,
    planned_shift_id: sessionPayload.planned_shift_id ?? null,
    actual_start: sessionPayload.actual_start,
    actual_end: sessionPayload.actual_end,
    scheduled_start: sessionPayload.scheduled_start ?? null,
    scheduled_end: sessionPayload.scheduled_end ?? null,
    gross_minutes: sessionPayload.gross_minutes,
    deducted_minutes: deducted,
    net_minutes: netMinutes,
    variance_type: sessionPayload.variance_type ?? variance.varianceType,
    variance_minutes: sessionPayload.variance_minutes ?? variance.varianceMinutes,
    break_overrun_minutes: sessionPayload.break_overrun_minutes ?? 0,
    notes: sessionPayload.notes ?? null,
    logged_date: sessionPayload.logged_date,
    client_timezone: "client_timezone" in sessionPayload
      ? sessionPayload.client_timezone
      : undefined,
    localId,
    created_at: sessionPayload.created_at ?? now,
    queued_at: now,
  };

  const outbox = await readOutbox();
  await set(OUTBOX_SESSIONS_KEY, [...outbox, record]);
  return record;
}

/**
 * Retrieves all pending session logs awaiting synchronization with the server.
 */
export async function getPendingOutbox(): Promise<PendingSessionLog[]> {
  return readOutbox();
}

/**
 * Removes a verified session from the outbox after backend confirmation.
 */
export async function clearSyncedSession(localId: string): Promise<void> {
  const outbox = await readOutbox();
  await set(
    OUTBOX_SESSIONS_KEY,
    outbox.filter(
      (session) => session.localId !== localId && String(session.id) !== localId,
    ),
  );
}

/**
 * Clears all pending sessions from the outbox.
 */
export async function clearOutbox(): Promise<void> {
  await set(OUTBOX_SESSIONS_KEY, []);
}

/**
 * Caches weekly analytics and dashboard aggregates for offline presentation.
 */
export async function cacheDashboardData(
  summary: WeeklyAnalyticsResponse,
): Promise<void> {
  await set(CACHED_WEEKLY_SUMMARY_KEY, summary);
}

/**
 * Retrieves cached weekly snapshot for offline dashboard rendering.
 */
export async function getCachedDashboardData(): Promise<WeeklyAnalyticsResponse | null> {
  return (
    (await get<WeeklyAnalyticsResponse>(CACHED_WEEKLY_SUMMARY_KEY)) ?? null
  );
}

/**
 * Caches user profile and shift rules for offline reference.
 */
export async function cacheProfileData(
  profile: UserProfileDetail,
): Promise<void> {
  await set(CACHED_PROFILE_KEY, profile);
}

/**
 * Retrieves cached user profile.
 */
export async function getCachedProfileData(): Promise<UserProfileDetail | null> {
  return (await get<UserProfileDetail>(CACHED_PROFILE_KEY)) ?? null;
}

/**
 * Clears cached profile data.
 */
export async function clearCachedProfile(): Promise<void> {
  await del(CACHED_PROFILE_KEY);
}
