import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  useRef,
  type FormEvent,
  type ReactElement,
} from "react";

import { getActivities } from "../../api/activities";
import { getProfile } from "../../api/profile";
import { useAuthToken } from "../../auth/AuthTokenContext";
import { submitOrQueueSession } from "../../services/sessionSubmission";
import { sessionDeductionSchema } from "../../schemas/forms";
import { useTimerStore } from "../../stores/useTimerStore";
import { useToast } from "../common/ToastProvider";
import { safeErrorMessage } from "../../api/client";
import { GuardrailCard } from "../common/GuardrailCard";
import { getClientTimezone, getLocalDateString } from "../../utils/serverClock";
import { useClickOutside } from "../../hooks/useClickOutside";

export interface DeductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionSaved?: () => void;
  activityId: number;
  plannedShiftId: number | null;
  shiftNumber: number | null;
  breakOverrunMinutes: number;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  grossSeconds: number;
  actualStartIso: string;
  actualEndIso: string;
}

export function DeductionModal({
  isOpen,
  onClose,
  onSessionSaved,
  activityId,
  plannedShiftId,
  scheduledStart,
  scheduledEnd,
  shiftNumber: _shiftNumber,
  breakOverrunMinutes,
  grossSeconds,
  actualStartIso,
  actualEndIso,
}: DeductionModalProps): ReactElement | null {
  const token = useAuthToken();
  const queryClient = useQueryClient();
  const resetTimer = useTimerStore((state) => state.resetTimer);
  const dialogRef = useRef<HTMLDivElement>(null);
  useClickOutside([dialogRef], onClose, { enabled: isOpen, closeOnEscape: false });
  const { sessionSaved, notify } = useToast();

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    enabled: isOpen && !!token,
  });

  const activitiesQuery = useQuery({
    queryKey: ["activities"],
    queryFn: getActivities,
    enabled: isOpen && !!token,
  });

  const isPastShiftBoundary = !!scheduledEnd && Date.parse(actualEndIso) > Date.parse(scheduledEnd);
  const [logOvertime, setLogOvertime] = useState(false);
  const creditedEndIso = isPastShiftBoundary && !logOvertime ? scheduledEnd! : actualEndIso;
  const creditedSeconds = isPastShiftBoundary && !logOvertime
    ? Math.max(0, (Date.parse(scheduledEnd!) - Date.parse(actualStartIso)) / 1000)
    : grossSeconds;
  const grossMinutes = Math.max(1, Math.floor(creditedSeconds / 60));
  const [deductedMinutes, setDeductedMinutes] = useState(0);
  const [deductedMinutesInput, setDeductedMinutesInput] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setDeductedMinutes(0);
    setDeductedMinutesInput("0");
    setNotes("");
    setError(null);
    setLogOvertime(false);
  }, [isOpen, grossSeconds]);

  const netMinutes = useMemo(
    () => Math.max(0, grossMinutes - deductedMinutes),
    [grossMinutes, deductedMinutes],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsed = sessionDeductionSchema.safeParse({
        deducted_minutes: deductedMinutes,
        notes: notes.trim() || undefined,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid deduction");
      }
      if (parsed.data.deducted_minutes > grossMinutes) {
        throw new Error("Deductions cannot exceed gross minutes");
      }

      return submitOrQueueSession(
        {
          activity_id: activityId,
          shift_number: _shiftNumber,
          planned_shift_id: plannedShiftId,
          actual_start: actualStartIso,
          actual_end: creditedEndIso,
          scheduled_start: scheduledStart,
          scheduled_end: scheduledEnd,
          gross_minutes: grossMinutes,
          deducted_minutes: parsed.data.deducted_minutes,
          break_overrun_minutes: breakOverrunMinutes,
          notes: parsed.data.notes ?? null,
          logged_date: getLocalDateString(new Date(creditedEndIso)),
          client_timezone: getClientTimezone(),
        },
        queryClient,
        {
          profile: profileQuery.data,
          activities: activitiesQuery.data,
        },
      );
    },
    onSuccess: (result) => {
      resetTimer();
      if (result.isOffline) {
        notify({
          type: "info",
          title: "Offline Session",
          message: "Saved locally (Offline). Weekly analytics updated.",
        });
      } else {
        sessionSaved(netMinutes, 3000);
      }
      onSessionSaved?.();
      onClose();
    },
    onError: (mutationError: Error) => {
      setError(safeErrorMessage(mutationError, "Could not save session. Review the details and try again."));
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    const onEscape = () => onClose();
    document.addEventListener("shift-tracker:escape", onEscape);
    return () => document.removeEventListener("shift-tracker:escape", onEscape);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    saveMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="deduction-modal-title"
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3
              id="deduction-modal-title"
              className="text-lg font-semibold text-slate-100"
            >
              Session Deductions
            </h3>
            <p className="text-sm text-slate-400">
              Record distractions and finalize this execution block.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-modal-close
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {isPastShiftBoundary ? <fieldset className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <legend className="px-1 text-xs font-semibold text-amber-200">Shift boundary verification</legend>
            <label className="flex cursor-pointer items-start gap-2 py-1 text-sm text-slate-200"><input type="radio" name="shift-boundary-choice" checked={!logOvertime} onChange={() => setLogOvertime(false)} className="mt-1 accent-emerald-500"/><span>I finished at scheduled time (clamp)</span></label>
            <label className="flex cursor-pointer items-start gap-2 py-1 text-sm text-slate-200"><input type="radio" name="shift-boundary-choice" checked={logOvertime} onChange={() => setLogOvertime(true)} className="mt-1 accent-amber-500"/><span>I intentionally worked into the break/buffer (log overtime)</span></label>
          </fieldset> : null}

          {breakOverrunMinutes > 0 ? <p className="rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">Break overrun recorded: {breakOverrunMinutes} minutes.</p> : null}
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
            <div>
              <p className="text-slate-400">Gross Minutes</p>
              <p className="font-mono text-lg text-slate-100">{grossMinutes}</p>
            </div>
            <div>
              <p className="text-slate-400">Net Focus Time</p>
              <p className="font-mono text-lg text-emerald-300">{netMinutes}</p>
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-sm text-slate-300">Deducted Minutes</span>
            <input
              type="number"
              min={0}
              max={grossMinutes}
              step={1}
              value={deductedMinutesInput}
              onChange={(event) => {
                const raw = event.target.value;
                setDeductedMinutesInput(raw);
                if (raw === "") { setDeductedMinutes(0); return; }
                const parsed = Number(raw);
                if (Number.isFinite(parsed)) setDeductedMinutes(parsed);
              }}
              onBlur={() => {
                const parsed = Number(deductedMinutesInput);
                const normalized = deductedMinutesInput.trim() === "" || !Number.isFinite(parsed) || parsed < 0
                  ? "0"
                  : String(Math.min(parsed, grossMinutes));
                setDeductedMinutesInput(normalized);
                setDeductedMinutes(Number(normalized));
              }}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-slate-300">Session Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
              placeholder="Late return, context switch, unplanned break..."
            />
          </label>

          <div className="min-h-16">{error ? <GuardrailCard tone="critical" title="Could not save session" message={safeErrorMessage(new Error(error), "Review the deductions and try again.")} /> : null}</div>

          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Session"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
