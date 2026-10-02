import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";

import { getProfile, updateProfile } from "../../api/profile";
import { safeErrorMessage } from "../../api/client";
import { useAuthToken } from "../../auth/AuthTokenContext";
import { useToast } from "../common/ToastProvider";
import { profileSettingsSchema, type ProfileSettingsFormValues } from "../../schemas/forms";
import type { UserProfileDetail } from "../../types/schema";

export function ProfileSettings(): ReactElement {
  const token = useAuthToken();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    enabled: !!token,
  });
  const [values, setValues] = useState<ProfileSettingsFormValues>({
    weekly_target_hours: 0,
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [weeklyTargetInput, setWeeklyTargetInput] = useState("0");

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) return;
    setValues({
      weekly_target_hours: profile.weekly_target_hours,
    });
    setWeeklyTargetInput(String(profile.weekly_target_hours));
  }, [profileQuery.data]);

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (profile: UserProfileDetail) => {
      queryClient.setQueryData(["profile"], profile);
      notify({ type: "success", title: "Settings saved", message: "Your weekly target was updated." });
      setValidationError(null);
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = profileSettingsSchema.safeParse(values);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? "Check the settings and try again.");
      return;
    }
    setValidationError(null);
    updateMutation.mutate(parsed.data);
  };

  return (
    <details className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-200">
        Profile settings
      </summary>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <label className="space-y-1 text-sm text-slate-300">
          <span>Weekly target hours</span>
          <input
            type="number"
            required
            min={0}
            max={168}
            step={0.5}
            value={weeklyTargetInput}
            onChange={(event) => {
              const raw = event.target.value;
              setWeeklyTargetInput(raw);
              if (raw !== "" && Number.isFinite(Number(raw))) {
                setValues((current) => ({ ...current, weekly_target_hours: Number(raw) }));
              }
            }}
            onBlur={() => {
              const parsed = Number(weeklyTargetInput);
              const valid = weeklyTargetInput !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= 168;
              const next = valid ? parsed : values.weekly_target_hours;
              setValues((current) => ({ ...current, weekly_target_hours: next }));
              setWeeklyTargetInput(String(next));
            }}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={updateMutation.isPending || profileQuery.isLoading || !token}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateMutation.isPending ? "Saving..." : "Save settings"}
          </button>
        </div>
        <p role="alert" className="min-h-5 text-xs text-rose-300 sm:col-span-2 lg:col-span-5">
          {validationError ?? (updateMutation.error ? safeErrorMessage(updateMutation.error, "Could not save profile preferences.") : "")}
        </p>
      </form>
    </details>
  );
}
