import { z } from "zod";

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Color must be a valid hex code");

export const activitySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  weekly_target_hours: z
    .number()
    .min(0.25, "Please enter a valid positive duration (at least 0.25 hours).")
    .max(24, "Duration cannot exceed 24 hours.")
    .multipleOf(0.25, "Duration must use 0.25-hour increments."),
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
  weekly_target_hours: z
    .number()
    .min(0, "Weekly target cannot be negative")
    .max(168, "Weekly target cannot exceed 168 hours"),
});

export type ActivityFormValues = z.infer<typeof activitySchema>;
export type SessionDeductionFormValues = z.infer<typeof sessionDeductionSchema>;
export type ProfileSettingsFormValues = z.infer<typeof profileSettingsSchema>;
