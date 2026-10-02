import type {
  Activity,
  CapAlert,
  SessionLog,
  ShiftRule,
  UserProfileDetail,
  WeeklyAnalyticsResponse,
} from "../types/schema";

export interface RecalculateOptions {
  profile?: UserProfileDetail | null;
  activities?: Activity[] | null;
  isSleepActivity?: boolean;
}

/**
 * Calculates scheduled break hours from shift rules.
 * Returns zero when no break rules exist.
 */
export function calculateScheduledBreakHours(
  rules?: ShiftRule[] | null,
  fallback = 0,
): number {
  if (!rules || rules.length === 0) {
    return fallback;
  }
  let breakMinutes = 0;
  for (const rule of rules) {
    if (rule.slot_type === "break") {
      const start = rule.slot_start || rule.standard_start;
      const end = rule.slot_end || rule.standard_end;
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      breakMinutes += ((eh * 60 + em) - (sh * 60 + sm) + 1440) % 1440;
    }
  }
  return breakMinutes > 0 ? breakMinutes / 60.0 : fallback;
}

/**
 * Recomputes buffer from configured weekly target hours.
 */
export function calculateWeeklyBuffer(
  weeklyTarget: number,
): { weeklyBuffer: number; dailyBuffer: number } {
  const weeklyBuffer = Math.max(0, Math.round((168.0 - weeklyTarget) * 10) / 10);
  const dailyBuffer = Math.round((weeklyBuffer / 7.0) * 10) / 10;
  return { weeklyBuffer, dailyBuffer };
}

/**
 * Recalculates weekly analytics locally in real-time when saving a session offline.
 */
export function recalculateWeeklyAnalytics(
  current: WeeklyAnalyticsResponse,
  session: SessionLog,
  options?: RecalculateOptions,
): WeeklyAnalyticsResponse {
  const isSleep =
    options?.isSleepActivity ??
    (options?.activities?.find((a) => a.id === session.activity_id)?.name.trim().toLowerCase() === "sleep");

  const netHours = session.net_minutes / 60.0;

  // 1. Update activity stream metrics
  let matchedStream = false;
  const updatedMetrics = current.metrics.map((metric) => {
    if (metric.activity_id === session.activity_id) {
      matchedStream = true;
      const completed_hours = Math.round((metric.completed_hours + netHours) * 100) / 100;
      const target_hours = metric.target_hours;
      const remaining_hours = Math.max(0, Math.round((target_hours - completed_hours) * 100) / 100);
      const percentage =
        target_hours > 0
          ? Math.min(100, Math.round((completed_hours / target_hours) * 10000) / 100)
          : (completed_hours > 0 ? 100 : 0);
      const is_cap_reached = target_hours > 0 && completed_hours >= target_hours;

      return {
        ...metric,
        completed_hours,
        logged_hours: completed_hours,
        remaining_hours,
        percentage,
        deducted_minutes: metric.deducted_minutes + session.deducted_minutes,
        is_cap_reached,
      };
    }
    return metric;
  });

  // If activity stream was not in metrics yet, add it
  if (!matchedStream && !isSleep) {
    const activityMeta = options?.activities?.find((a) => a.id === session.activity_id);
    const target = activityMeta?.weekly_target_hours ?? 0;
    const completed_hours = Math.round(netHours * 100) / 100;
    const remaining_hours = Math.max(0, Math.round((target - completed_hours) * 100) / 100);
    const percentage =
      target > 0
        ? Math.min(100, Math.round((completed_hours / target) * 10000) / 100)
        : (completed_hours > 0 ? 100 : 0);

    updatedMetrics.push({
      activity_id: session.activity_id,
      name: activityMeta?.name ?? `Activity #${session.activity_id}`,
      color: activityMeta?.color ?? "#6366f1",
      target_hours: target,
      completed_hours,
      logged_hours: completed_hours,
      remaining_hours,
      percentage,
      deducted_minutes: session.deducted_minutes,
      is_cap_reached: target > 0 && completed_hours >= target,
    });
  }

  // 2. Cap alerts
  const updatedCapAlerts: CapAlert[] = [...current.cap_alerts];
  for (const metric of updatedMetrics) {
    if (metric.is_cap_reached && !isSleep) {
      const alreadyHasAlert = updatedCapAlerts.some((alert) => alert.activity === metric.name);
      if (!alreadyHasAlert) {
        updatedCapAlerts.push({
          activity: metric.name,
          completed_hours: metric.completed_hours,
          target_hours: metric.target_hours,
          message: `${metric.name} reached its weekly target of ${metric.target_hours} hours.`,
        });
      }
    }
  }

  // 3. Overall completed hours and percentage (sleep does not count toward productive target)
  const total_completed_hours = isSleep
    ? current.total_completed_hours
    : Math.round((current.total_completed_hours + netHours) * 100) / 100;

  const weekly_target_goal = options?.activities?.reduce((sum, activity) => sum + activity.weekly_target_hours, 0) || options?.profile?.weekly_target_hours || current.weekly_target_goal;
  const overall_percentage =
    weekly_target_goal > 0
      ? Math.min(100, Math.round((total_completed_hours / weekly_target_goal) * 10000) / 100)
      : (total_completed_hours > 0 ? 100 : 0);

  const logged_sleep_hours = isSleep
    ? Math.round((current.logged_sleep_hours + netHours) * 100) / 100
    : current.logged_sleep_hours;

  // 4. Distraction deductions and friction ledger
  const total_lost_deductions_min =
    current.total_lost_deductions_min + session.deducted_minutes;

  const lateMinutes =
    session.variance_type === "LATE_START" ? session.variance_minutes : 0;
  const total_late_arrival_min = current.total_late_arrival_min + lateMinutes;

  // 5. Recalculate actual break hours and break overrun minutes
  const { weeklyBuffer, dailyBuffer } = calculateWeeklyBuffer(weekly_target_goal);

  return {
    weekly_target_goal,
    total_completed_hours,
    overall_percentage,
    cap_alerts: updatedCapAlerts,
    metrics: updatedMetrics,
    total_lost_deductions_min,
    total_late_arrival_min,
    weekly_buffer: weeklyBuffer,
    daily_buffer: dailyBuffer,
    logged_sleep_hours,
  };
}
