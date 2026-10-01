import { z } from "zod";

const timeStringSchema = z
  .string()
  .trim()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
    "Time must be in HH:MM or HH:MM:SS format",
  );

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Color must be a valid hex code");

export const activitySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  weekly_target_hours: z
    .number()
    .min(0.5, "Minimum target is 0.5 hours")
    .max(50, "Maximum target is 50 hours"),
  color: hexColorSchema,
});

export const sessionDeductionSchema = z.object({
  deducted_minutes: z
    .number()
    .min(0, "Deduction cannot be negative")
    .int("Deduction must be a whole number"),
  notes: z.string().trim().optional(),
});

export const profileSettingsSchema = z.object({
  wake_time: timeStringSchema,
  bed_cutoff: timeStringSchema,
  weekly_target_hours: z
    .number()
    .min(10, "Weekly target must be at least 10 hours")
    .max(120, "Weekly target cannot exceed 120 hours"),
  weekly_break_target_hours: z.number().positive("Weekly break/rest target must be greater than zero").max(168, "Weekly break/rest target cannot exceed 168 hours"),
});

export type ActivityFormValues = z.infer<typeof activitySchema>;
export type SessionDeductionFormValues = z.infer<typeof sessionDeductionSchema>;
export type ProfileSettingsFormValues = z.infer<typeof profileSettingsSchema>;
