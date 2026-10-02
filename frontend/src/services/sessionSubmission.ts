import type { QueryClient } from "@tanstack/react-query";

import { recordSession } from "../api/sessions";
import { useShiftStore } from "../stores/useShiftStore";
import type {
  Activity,
  SessionLog,
  SessionLogCreateInput,
  UserProfileDetail,
  WeeklyAnalyticsResponse,
} from "../types/schema";
import { recalculateWeeklyAnalytics } from "./offlineAnalytics";
import {
  cacheDashboardData,
  getCachedDashboardData,
  getCachedProfileData,
  saveSessionLocally,
  type PendingSessionLog,
} from "./offlineStorage";

export interface SessionSubmissionResult {
  session: SessionLog | PendingSessionLog;
  isOffline: boolean;
}

export interface SessionSubmissionOptions {
  profile?: UserProfileDetail | null;
  activities?: Activity[] | null;
  weekStart?: string;
  weekEnd?: string;
}

/**
 * Determines whether an error is a client-side network error or timeout.
 */
export function isNetworkOrOfflineError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return true;
  }
  if (error instanceof TypeError) {
    return true; // Typical for fetch() failing on network loss
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("failed to fetch") ||
      message.includes("network") ||
      message.includes("offline") ||
      message.includes("timeout") ||
      message.includes("abort") ||
      message.includes("econnrefused") ||
      message.includes("net::")
    );
  }
  return false;
}

/**
 * Intercepts session submission during network dropouts, saves to IndexedDB,
 * updates Zustand store, and optimistically updates TanStack Query analytics.
 */
export async function submitOrQueueSession(
  sessionInput: SessionLogCreateInput,
  queryClient: QueryClient,
  options?: SessionSubmissionOptions,
): Promise<SessionSubmissionResult> {
  const isCurrentlyOffline =
    typeof navigator !== "undefined" && !navigator.onLine;

  if (isCurrentlyOffline) {
    return handleOfflineSubmission(sessionInput, queryClient, options);
  }

  try {
    const session = await recordSession(sessionInput);

    // Online submission succeeded: invalidate queries so server state is fresh
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
      queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    ]);

    useShiftStore.getState().setOfflineStatus(false);
    return { session, isOffline: false };
  } catch (error) {
    if (isNetworkOrOfflineError(error)) {
      // Network dropped or request timed out: fallback to offline flow
      return handleOfflineSubmission(sessionInput, queryClient, options);
    }
    // Re-throw genuine validation or server error (e.g., 400 Bad Request)
    throw error;
  }
}

/**
 * Handles offline persistence, local analytics math recalculation, and cache updates.
 */
async function handleOfflineSubmission(
  sessionInput: SessionLogCreateInput,
  queryClient: QueryClient,
  options?: SessionSubmissionOptions,
): Promise<SessionSubmissionResult> {
  useShiftStore.getState().setOfflineStatus(true);

  // 1. Persist session to IndexedDB outbox queue
  const savedRecord = await saveSessionLocally(sessionInput);
  useShiftStore.getState().incrementPendingOutbox();

  // Resolve profile and activities from options, queryClient cache, or IndexedDB cache
  const resolvedProfile =
    options?.profile ??
    queryClient.getQueryData<UserProfileDetail>(["profile"]) ??
    (await getCachedProfileData());
  const resolvedActivities =
    options?.activities ??
    queryClient.getQueryData<Activity[]>(["activities"]);

  // 2. Optimistically update TanStack Query weekly analytics cache
  let appliedAnalytics: WeeklyAnalyticsResponse | null = null;

  // Update all matching active queries that start with ["analytics"] (prefix match)
  queryClient.setQueriesData<WeeklyAnalyticsResponse>(
    { queryKey: ["analytics"] },
    (oldData) => {
      if (!oldData) return oldData;
      const updated = recalculateWeeklyAnalytics(oldData, savedRecord, {
        profile: resolvedProfile,
        activities: resolvedActivities,
      });
      appliedAnalytics = updated;
      return updated;
    },
  );

  // Fallback: If no query was currently cached in memory, fetch and update cached dashboard data
  if (!appliedAnalytics) {
    const cachedDashboard = await getCachedDashboardData();
    if (cachedDashboard) {
      appliedAnalytics = recalculateWeeklyAnalytics(cachedDashboard, savedRecord, {
        profile: resolvedProfile,
        activities: resolvedActivities,
      });
    } else {
      const defaultWeekly: WeeklyAnalyticsResponse = {
        weekly_target_goal: resolvedActivities?.reduce((sum, activity) => sum + activity.weekly_target_hours, 0) || resolvedProfile?.weekly_target_hours || 0,
        total_completed_hours: 0,
        overall_percentage: 0,
        cap_alerts: [],
        metrics: (resolvedActivities ?? []).map((a) => ({
          activity_id: a.id,
          name: a.name,
          color: a.color,
          target_hours: a.weekly_target_hours,
          completed_hours: 0,
          logged_hours: 0,
          deducted_minutes: 0,
          remaining_hours: a.weekly_target_hours,
          percentage: 0,
          is_cap_reached: false,
        })),
        total_lost_deductions_min: 0,
        total_late_arrival_min: 0,
        weekly_buffer: Math.max(0, 168 - (resolvedActivities?.reduce((sum, activity) => sum + activity.weekly_target_hours, 0) || resolvedProfile?.weekly_target_hours || 0)),
        daily_buffer: Math.round(Math.max(0, 168 - (resolvedActivities?.reduce((sum, activity) => sum + activity.weekly_target_hours, 0) || resolvedProfile?.weekly_target_hours || 0)) / 7 * 10) / 10,
        logged_sleep_hours: 0,
      };
      appliedAnalytics = recalculateWeeklyAnalytics(defaultWeekly, savedRecord, {
        profile: resolvedProfile,
        activities: resolvedActivities,
      });
    }
  }

  // Explicitly ensure ['analytics', 'weekly'] cache is updated
  if (appliedAnalytics) {
    queryClient.setQueryData<WeeklyAnalyticsResponse>(["analytics", "weekly"], appliedAnalytics);
  }

  // 3. Update local Zustand state and persist the recomputed weekly analytics to IndexedDB
  if (appliedAnalytics) {
    useShiftStore.getState().setWeeklyAnalytics(appliedAnalytics);
    await cacheDashboardData(appliedAnalytics);
  }

  // 4. Optimistically append session to TanStack Query sessions cache
  queryClient.setQueriesData<SessionLog[]>(
    { queryKey: ["sessions"] },
    (oldSessions) => {
      if (!oldSessions) return [savedRecord];
      return [...oldSessions, savedRecord];
    },
  );

  return { session: savedRecord, isOffline: true };
}
