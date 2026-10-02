import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactElement } from "react";

import {
  createActivity,
  deleteActivity,
  getActivities,
  updateActivity,
} from "../../api/activities";
import { useAuthToken } from "../../auth/AuthTokenContext";
import type { Activity, ActivityCreateInput } from "../../types/schema";
import { safeErrorMessage } from "../../api/client";
import { ConfirmModal } from "../common/ConfirmModal";
import { GuardrailCard } from "../common/GuardrailCard";

const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100";
const durationError = "Please enter a valid positive duration (at least 0.25 hours).";

function validateDuration(raw: string): { value?: number; error?: string } {
  if (!raw.trim()) return { error: durationError };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0.25) return { error: durationError };
  if (value > 24) return { error: "Duration cannot exceed 24 hours." };
  if (Math.abs(value * 4 - Math.round(value * 4)) > 1e-8) {
    return { error: "Duration must use 0.25-hour increments." };
  }
  return { value };
}

export function ActivitiesManager(): ReactElement {
  const token = useAuthToken();
  const queryClient = useQueryClient();
  const activitiesQuery = useQuery({
    queryKey: ["activities"],
    queryFn: getActivities,
    enabled: !!token,
  });
  const [draft, setDraft] = useState<ActivityCreateInput>({
    name: "",
    weekly_target_hours: 0,
    color: "#6366f1",
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftTargetInput, setDraftTargetInput] = useState("");
  const [editingTargetInput, setEditingTargetInput] = useState("");
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["activities"] }),
      queryClient.invalidateQueries({ queryKey: ["analytics"] }),
    ]);
  };

  const createMutation = useMutation({ mutationFn: createActivity, onSuccess: refresh });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Activity> }) => updateActivity(id, data),
    onSuccess: async () => {
      setEditingId(null);
      await refresh();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteActivity,
    onSuccess: refresh,
  });

  const confirmDelete = () => {
    if (pendingDeletion) deleteMutation.mutate(pendingDeletion.id);
    setPendingDeletion(null);
  };

  const handleDurationInput = (raw: string, setValue: (value: string) => void) => {
    if (raw.startsWith("-")) {
      setValue("");
      setError(durationError);
      return;
    }
    setValue(raw);
    setError(null);
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      setError("Enter an activity name.");
      return;
    }
    const duration = validateDuration(draftTargetInput);
    if (duration.error || duration.value === undefined) {
      setError(duration.error ?? durationError);
      return;
    }
    setError(null);
    createMutation.mutate({ ...draft, name, weekly_target_hours: duration.value }, {
      onSuccess: () => { setDraft({ name: "", weekly_target_hours: 0, color: "#6366f1" }); setDraftTargetInput(""); },
    });
  };

  const saveActivity = (activity: Activity, form: HTMLFormElement) => {
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const targetRaw = String(data.get("weekly_target_hours") ?? "").trim();
    const duration = validateDuration(targetRaw);
    const color = String(data.get("color") ?? "");
    if (duration.error || duration.value === undefined) {
      setError(duration.error ?? durationError);
      return;
    }
    if (!name || !/^#[0-9a-f]{6}$/i.test(color)) {
      setError("Enter an activity name and a valid color.");
      return;
    }
    setError(null);
    updateMutation.mutate({
      id: activity.id,
      data: { name, weekly_target_hours: duration.value, color },
    });
  };

  return (
    <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Activities</h2>
        <p className="mt-1 text-sm text-slate-400">Manage task types, weekly targets, and category colors.</p>
      </div>

      <form noValidate onSubmit={handleCreate} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4 sm:grid-cols-[minmax(12rem,1fr)_10rem_5rem_auto] sm:items-end">
        <label className="space-y-1 text-xs text-slate-400">
          <span>Activity name</span>
          <input className={inputClass} maxLength={255} required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label className="space-y-1 text-xs text-slate-400">
          <span>Weekly target hours</span>
          <input
            className={inputClass}
            type="number"
            min="0.25"
            max="24"
            step="0.25"
            required
            value={draftTargetInput}
            onKeyDown={(event) => { if (["-", "e", "E"].includes(event.key)) event.preventDefault(); }}
            onChange={(event) => {
              const raw = event.target.value;
              handleDurationInput(raw, setDraftTargetInput);
              const parsed = Number(raw);
              if (raw === "" || raw.startsWith("-") || !Number.isFinite(parsed)) {
                setDraft((current) => ({ ...current, weekly_target_hours: 0 }));
              } else {
                setDraft((current) => ({ ...current, weekly_target_hours: parsed }));
              }
            }}
          />
        </label>
        <label className="space-y-1 text-xs text-slate-400">
          <span>Color</span>
          <input className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 p-1" type="color" value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))} />
        </label>
        <button type="submit" disabled={!token || createMutation.isPending} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
          {createMutation.isPending ? "Adding..." : "Add activity"}
        </button>
      </form>

      {activitiesQuery.isLoading ? <p className="text-sm text-slate-400">Loading activities...</p> : null}
      <div className="min-h-16">{activitiesQuery.error || createMutation.error || updateMutation.error || deleteMutation.error || error ? (
        <GuardrailCard tone="critical" title="Could not update activities" message={error ?? safeErrorMessage(activitiesQuery.error ?? createMutation.error ?? updateMutation.error ?? deleteMutation.error, "Review the activity details and retry.")} />
      ) : null}</div>

      <ul className="divide-y divide-slate-800">
        {(activitiesQuery.data ?? []).map((activity) => (
          <li key={activity.id} className="py-3">
            {editingId === activity.id ? (
              <form noValidate onSubmit={(event) => { event.preventDefault(); saveActivity(activity, event.currentTarget); }} className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_10rem_5rem_auto_auto] sm:items-end">
                <label className="space-y-1 text-xs text-slate-400"><span>Name</span><input className={inputClass} name="name" defaultValue={activity.name} required maxLength={255} /></label>
                <label className="space-y-1 text-xs text-slate-400"><span>Weekly target hours</span><input className={inputClass} name="weekly_target_hours" type="number" min="0.25" max="24" step="0.25" required value={editingTargetInput} onKeyDown={(event) => { if (["-", "e", "E"].includes(event.key)) event.preventDefault(); }} onChange={(event) => handleDurationInput(event.target.value, setEditingTargetInput)} /></label>
                <label className="space-y-1 text-xs text-slate-400"><span>Color</span><input className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 p-1" name="color" type="color" defaultValue={activity.color} /></label>
                <button type="submit" disabled={updateMutation.isPending} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">Save</button>
                <button type="button" onClick={() => { setEditingId(null); setEditingTargetInput(""); setError(null); }} className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: activity.color }} aria-hidden="true" />
                <span className="min-w-40 flex-1 font-medium text-slate-200">{activity.name}</span>
                <span className="text-sm text-slate-400">{activity.weekly_target_hours} target hours</span>
                <button type="button" onClick={() => { setEditingId(activity.id); setEditingTargetInput(String(activity.weekly_target_hours)); setError(null); }} className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">Edit</button>
                <button type="button" onClick={() => setPendingDeletion(activity)} disabled={deleteMutation.isPending} className="rounded-md border border-rose-500/40 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">Delete</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!activitiesQuery.isLoading && activitiesQuery.data?.length === 0 ? (
        <p className="text-sm text-slate-400">No activities yet. Add one above to get started.</p>
      ) : null}

      <ConfirmModal
        isOpen={pendingDeletion !== null}
        title="Delete activity?"
        message={pendingDeletion
          ? `Delete “${pendingDeletion.name}”? Its sessions and planned shifts will also be deleted.`
          : "This activity and its related records will be deleted."}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive
        onConfirm={confirmDelete}
        onClose={() => setPendingDeletion(null)}
      />
    </section>
  );
}
