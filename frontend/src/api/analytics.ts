import { apiRequest } from "./client";
import type {
  ActivityMetric,
  CapAlert,
  DateString,
  WeeklyAnalyticsResponse,
} from "../types/schema";

interface WeeklyAnalyticsWire {
  week_start: DateString;
  week_end: DateString;
  weekly_target_hours: number;
  total_net_hours: number;
  overall_completion_percentage: number;
  activities: Array<{
    activity_id: number;
    activity_name: string;
    color: string;
    target_hours: number;
    completed_hours: number;
    remaining_hours: number;
    percentage: number;
    deducted_minutes: number;
    is_cap_reached: boolean;
  }>;
  cap_alerts: Array<{
    activity_id: number;
    activity_name: string;
    message: string;
  }>;
  lost_minutes: {
    total_lost_deductions_min: number;
    total_late_arrival_min: number;
  };
}

function mapWeeklyAnalytics(wire: WeeklyAnalyticsWire): WeeklyAnalyticsResponse {
  const metrics: ActivityMetric[] = wire.activities.map((activity) => ({
    activity_id: activity.activity_id,
    name: activity.activity_name,
    color: activity.color,
    target_hours: activity.target_hours,
    completed_hours: activity.completed_hours,
    deducted_minutes: activity.deducted_minutes,
    remaining_hours: activity.remaining_hours,
    percentage: activity.percentage,
    is_cap_reached: activity.is_cap_reached,
  }));

  const metricsById = new Map(metrics.map((metric) => [metric.activity_id, metric]));

  const cap_alerts: CapAlert[] = wire.cap_alerts.map((alert) => {
    const metric = metricsById.get(alert.activity_id);
    return {
      activity: alert.activity_name,
      completed_hours: metric?.completed_hours ?? 0,
      target_hours: metric?.target_hours ?? 0,
      message: alert.message,
    };
  });

  return {
    weekly_target_goal: wire.weekly_target_hours,
    total_completed_hours: wire.total_net_hours,
    overall_percentage: wire.overall_completion_percentage,
    cap_alerts,
    metrics,
    total_lost_deductions_min: wire.lost_minutes.total_lost_deductions_min,
    total_late_arrival_min: wire.lost_minutes.total_late_arrival_min,
  };
}

export async function getWeeklyAnalytics(
  weekStart: DateString,
  weekEnd: DateString,
): Promise<WeeklyAnalyticsResponse> {
  const wire = await apiRequest<WeeklyAnalyticsWire>("/api/analytics/weekly", {
    query: { week_start: weekStart, week_end: weekEnd },
  });
  return mapWeeklyAnalytics(wire);
}
