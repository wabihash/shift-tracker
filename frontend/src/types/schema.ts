/** ISO-8601 date string (YYYY-MM-DD) */
export type DateString = string;

/** ISO-8601 time string (HH:MM:SS) */
export type TimeString = string;

export const DEFAULT_WAKE_TIME: TimeString = "00:00";
export const DEFAULT_BED_CUTOFF: TimeString = "00:00";

/** ISO-8601 datetime string */
export type DateTimeString = string;

export type VarianceType =
  | "ON_TIME"
  | "LATE_START"
  | "EARLY_START"
  | "EARLY_EXIT";

export interface UserProfile {
  id: number;
  clerk_user_id: string;
  user_name: string | null;
  wake_time: TimeString;
  bed_cutoff: TimeString;
  weekly_target_hours: number;
  weekly_break_target_hours: number;
  /** Present on persisted records; omitted on some profile API responses. */
  created_at?: DateTimeString;
}

export interface ShiftRule {
  id: number;
  profile_id: number;
  shift_number: number;
  day_of_week: number;
  name: string;
  standard_start: TimeString;
  standard_end: TimeString;
  standard_break_minutes: number;
  slot_type: "productive" | "break";
  slot_start: TimeString | null;
  slot_end: TimeString | null;
}

/** GET /api/profile response (includes nested shift rules). */
export interface UserProfileDetail extends UserProfile {
  shift_rules: ShiftRule[];
}

export interface Activity {
  id: number;
  profile_id: number;
  name: string;
  weekly_target_hours: number;
  color: string;
}

export interface PlannedShift {
  id: number;
  clerk_user_id: string;
  activity_id: number;
  title: string;
  start_time: DateTimeString;
  end_time: DateTimeString;
  is_recurring: boolean;
}

export interface SessionLog {
  id: number;
  clerk_user_id: string;
  activity_id: number;
  shift_number: number | null;
  planned_shift_id: number | null;
  actual_start: DateTimeString;
  actual_end: DateTimeString;
  scheduled_start: DateTimeString | null;
  scheduled_end: DateTimeString | null;
  gross_minutes: number;
  deducted_minutes: number;
  net_minutes: number;
  variance_type: VarianceType;
  variance_minutes: number;
  break_overrun_minutes: number;
  notes: string | null;
  logged_date: DateString;
  created_at?: DateTimeString;
  localId?: string;
}

export interface CapAlert {
  activity: string;
  completed_hours: number;
  target_hours: number;
  message: string;
}

export interface ActivityMetric {
  activity_id: number;
  name: string;
  color: string;
  target_hours: number;
  completed_hours: number;
  logged_hours?: number;
  deducted_minutes: number;
  remaining_hours: number;
  percentage: number;
  is_cap_reached: boolean;
}

export interface WeeklyAnalyticsResponse {
  weekly_target_goal: number;
  total_completed_hours: number;
  overall_percentage: number;
  cap_alerts: CapAlert[];
  metrics: ActivityMetric[];
  total_lost_deductions_min: number;
  total_late_arrival_min: number;
  weekly_buffer: number;
  daily_buffer: number;
  logged_sleep_hours: number;
}

export interface HistoricalSummaryRow {
  period_label: string;
  period_start: DateString;
  logged_hours: number;
  target_hours: number;
  completion_percentage: number;
  total_deducted_minutes: number;
  late_arrival_minutes: number;
  logged_sleep_hours: number;
  weekly_buffer: number;
  daily_buffer: number;
}

export interface HistoricalSummaryResponse {
  group_by: "week" | "month";
  rows: HistoricalSummaryRow[];
  weekly_buffer: number;
  daily_buffer: number;
}

export interface ProfileUpdateInput {
  wake_time: TimeString;
  bed_cutoff: TimeString;
  weekly_target_hours: number;
  weekly_break_target_hours: number;
}

export interface ShiftRuleUpdateInput {
  id?: number;
  shift_number: number;
  day_of_week: number;
  name: string;
  standard_start: TimeString;
  standard_end: TimeString;
  standard_break_minutes: number;
  slot_type: "productive" | "break";
  slot_start: TimeString;
  slot_end: TimeString;
}

export interface ActivityCreateInput {
  name: string;
  weekly_target_hours?: number;
  color?: string;
}

export interface ActivityUpdateInput {
  name?: string;
  weekly_target_hours?: number;
  color?: string;
}

export interface PlannedShiftCreateInput {
  title: string;
  activity_id: number;
  start_time: DateTimeString;
  end_time: DateTimeString;
  is_recurring?: boolean;
}

export interface PlannedShiftUpdateInput {
  title?: string;
  activity_id?: number;
  start_time?: DateTimeString;
  end_time?: DateTimeString;
  is_recurring?: boolean;
}

export interface SessionLogCreateInput {
  activity_id: number;
  shift_number?: number | null;
  planned_shift_id?: number | null;
  actual_start: DateTimeString;
  actual_end: DateTimeString;
  scheduled_start?: DateTimeString | null;
  scheduled_end?: DateTimeString | null;
  gross_minutes: number;
  deducted_minutes?: number;
  break_overrun_minutes?: number;
  notes?: string | null;
  logged_date: DateString;
}
