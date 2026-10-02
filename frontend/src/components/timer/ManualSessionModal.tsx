import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Loader2, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";

import { getActivities } from "../../api/activities";
import { getProfile } from "../../api/profile";
import { useAuthToken } from "../../auth/AuthTokenContext";
import { submitOrQueueSession } from "../../services/sessionSubmission";
import { useToast } from "../common/ToastProvider";
import { safeErrorMessage } from "../../api/client";
import { GuardrailCard } from "../common/GuardrailCard";

interface ManualSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function combineLocalDateTime(dateValue: string, timeValue: string, dayOffset = 0): Date | null {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  if ([year, month, day, hour, minute].some((part) => !Number.isInteger(part))) {
    return null;
  }

  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day ||
    value.getHours() !== hour ||
    value.getMinutes() !== minute
  ) {
    return null;
  }
  value.setDate(value.getDate() + dayOffset);
  return value;
}

function dateTimeInput(date: Date): string {
  return date.toISOString();
}

const fieldClassName =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30";

export function ManualSessionModal({
  isOpen,
  onClose,
}: ManualSessionModalProps): ReactElement | null {
  const token = useAuthToken();
  const queryClient = useQueryClient();
  const { sessionSaved, notify } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<HTMLSelectElement>(null);
  const [activityId, setActivityId] = useState("");
  const [loggedDate, setLoggedDate] = useState(() => localDateValue(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [deductionInput, setDeductionInput] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    enabled: !!token,
  });

  const activitiesQuery = useQuery({
    queryKey: ["activities"],
    queryFn: getActivities,
    enabled: isOpen && !!token,
  });

  const parsedDeduction = deductionInput.trim() === "" ? 0 : Number(deductionInput);
  const deductionIsValid =
    Number.isInteger(parsedDeduction) && parsedDeduction >= 0;
  const actualStart = useMemo(
    () => combineLocalDateTime(loggedDate, startTime),
    [loggedDate, startTime],
  );
  const actualEnd = useMemo(
    () => combineLocalDateTime(loggedDate, endTime, endTime < startTime ? 1 : 0),
    [loggedDate, endTime, startTime],
  );
  const windowIsValid = actualStart !== null && actualEnd !== null && actualEnd > actualStart;
  const startMinuteOfDay = actualStart ? actualStart.getHours() * 60 + actualStart.getMinutes() : 0;
  const endMinuteOfDay = actualEnd ? actualEnd.getHours() * 60 + actualEnd.getMinutes() : 0;
  const grossMinutes = windowIsValid && actualStart && actualEnd
    ? endTime < startTime ? 1440 - startMinuteOfDay + endMinuteOfDay : endMinuteOfDay - startMinuteOfDay
    : 0;
  const netMinutes = Math.max(0, grossMinutes - (deductionIsValid ? parsedDeduction : 0));

  useEffect(() => {
    if (!isOpen) return;
    setActivityId("");
    setLoggedDate(localDateValue(new Date()));
    setStartTime("09:00");
    setEndTime("10:00");
    setDeductionInput("0");
    setNotes("");
    setError(null);
    const frame = window.requestAnimationFrame(() => activityRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onEscape = () => onClose();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("shift-tracker:escape", onEscape);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("shift-tracker:escape", onEscape);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!activityId) throw new Error("Choose an activity.");
      if (!windowIsValid || !actualStart || !actualEnd) {
        throw new Error("Choose a valid date and an end time after the start time.");
      }
      if (!deductionIsValid) {
        throw new Error("Deduction must be a whole number of minutes greater than or equal to zero.");
      }
      if (parsedDeduction > grossMinutes) {
        throw new Error("Deduction cannot exceed the session duration.");
      }
      if (notes.length > 2000) throw new Error("Notes must be 2,000 characters or fewer.");

      return submitOrQueueSession(
        {
          activity_id: Number(activityId),
          planned_shift_id: null,
          actual_start: dateTimeInput(actualStart),
          actual_end: dateTimeInput(actualEnd),
          scheduled_start: null,
          scheduled_end: null,
          gross_minutes: grossMinutes,
          deducted_minutes: parsedDeduction,
          notes: notes.trim() || null,
          logged_date: actualEnd ? localDateValue(actualEnd) : loggedDate,
        },
        queryClient,
        {
          profile: profileQuery.data,
          activities: activitiesQuery.data,
        },
      );
    },
    onSuccess: (result) => {
      if (result.isOffline) {
        notify({
          type: "info",
          title: "Offline Session",
          message: "Saved locally (Offline). Weekly analytics updated.",
        });
      } else {
        sessionSaved(netMinutes);
      }
      onClose();
    },
    onError: (mutationError: Error) => setError(safeErrorMessage(mutationError, "Could not save session. Review the details and try again.")),
  });

  if (!isOpen) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    saveMutation.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saveMutation.isPending) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-session-title"
        aria-describedby="manual-session-description"
        className="my-auto w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 text-indigo-300">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wider">Manual entry</span>
            </div>
            <h2 id="manual-session-title" className="text-xl font-semibold text-slate-100">
              Log Past Session
            </h2>
            <p id="manual-session-description" className="mt-1 text-sm text-slate-400">
              Record a session you completed without the live timer.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saveMutation.isPending}
            className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:opacity-50"
            aria-label="Close Log Past Session"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-300">Activity</span>
            <select
              ref={activityRef}
              required
              value={activityId}
              onChange={(event) => setActivityId(event.target.value)}
              className={fieldClassName}
              aria-describedby={activitiesQuery.isError ? "manual-activity-error" : undefined}
            >
              <option value="">Choose an activity</option>
              {(activitiesQuery.data ?? []).map((activity) => (
                <option key={activity.id} value={activity.id}>{activity.name}</option>
              ))}
            </select>
            {activitiesQuery.isLoading ? <span className="text-xs text-slate-500">Loading activities…</span> : null}
            {activitiesQuery.isError ? (
              <span id="manual-activity-error" className="text-xs text-rose-300" role="alert">
                Unable to load activities. Close this form and retry.
              </span>
            ) : null}
            {!activitiesQuery.isLoading && !activitiesQuery.isError && activitiesQuery.data?.length === 0 ? (
              <span className="text-xs text-amber-300">Create an activity before logging a session.</span>
            ) : null}
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1.5 sm:col-span-1">
              <span className="text-sm font-medium text-slate-300">Start date</span>
              <input required type="date" value={loggedDate} onChange={(event) => setLoggedDate(event.target.value)} className={fieldClassName} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-300">Start time</span>
              <input required type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={fieldClassName} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-300">End time</span>
              <input required type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className={fieldClassName} />
            </label>
          </div>

          {!windowIsValid ? (
            <p role="alert" className="text-sm text-rose-300">End time must be after start time, and the selected local time must exist.</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-300">Deduction / interruptions (minutes)</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={grossMinutes}
                step={1}
                value={deductionInput}
                onChange={(event) => setDeductionInput(event.target.value)}
                className={fieldClassName}
                aria-invalid={!deductionIsValid || parsedDeduction > grossMinutes}
              />
            </label>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3" aria-live="polite">
              <div>
                <p className="text-xs text-slate-400">Gross</p>
                <p className="font-mono text-lg text-slate-100">{windowIsValid ? grossMinutes : "—"}<span className="ml-1 text-xs text-slate-500">min</span></p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Net focus</p>
                <p className="font-mono text-lg text-emerald-300">{windowIsValid && deductionIsValid && parsedDeduction <= grossMinutes ? netMinutes : "—"}<span className="ml-1 text-xs text-slate-500">min</span></p>
              </div>
            </div>
          </div>
          {!deductionIsValid || parsedDeduction > grossMinutes ? (
            <p role="alert" className="text-sm text-rose-300">
              {deductionIsValid ? "Deduction cannot exceed gross session minutes." : "Enter a whole number of deduction minutes greater than or equal to zero."}
            </p>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-300">Notes / description <span className="font-normal text-slate-500">(optional)</span></span>
            <textarea
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={`${fieldClassName} resize-y`}
              placeholder="For example: attended morning class"
            />
            <span className="block text-right text-xs text-slate-500">{notes.length}/2000</span>
          </label>

          <div className="min-h-12">{error ? <GuardrailCard tone="critical" title="Could not save session" message={safeErrorMessage(new Error(error), "Review the session details and try again.")} /> : null}</div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saveMutation.isPending} className="rounded-md border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50">Cancel</button>
            <button
              type="submit"
              disabled={saveMutation.isPending || activitiesQuery.isLoading || activitiesQuery.isError || !activitiesQuery.data?.length || !windowIsValid || !deductionIsValid || parsedDeduction > grossMinutes}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Saving…</> : "Save Past Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
