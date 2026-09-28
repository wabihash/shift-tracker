import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";

import { getPlannedShifts } from "../../api/planner";
import { recordSession } from "../../api/sessions";
import { sessionDeductionSchema } from "../../schemas/forms";
import { useTimerStore } from "../../stores/useTimerStore";
import type { DateString } from "../../types/schema";
import { useToast } from "../common/ToastProvider";

export interface DeductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activityId: number;
  plannedShiftId: number | null;
  grossSeconds: number;
  actualStartIso: string;
  actualEndIso: string;
}

function toDateString(value: Date): DateString {
  return value.toISOString().slice(0, 10);
}

function startOfDayIso(date: Date): string {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

function endOfDayIso(date: Date): string {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy.toISOString();
}

export function DeductionModal({
  isOpen,
  onClose,
  activityId,
  plannedShiftId,
  grossSeconds,
  actualStartIso,
  actualEndIso,
}: DeductionModalProps): ReactElement | null {
  const queryClient = useQueryClient();
  const resetTimer = useTimerStore((state) => state.resetTimer);
  const { sessionSaved } = useToast();

  const grossMinutes = Math.max(1, Math.round(grossSeconds / 60));
  const [deductedMinutes, setDeductedMinutes] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dayRange = useMemo(
    () => ({
      start: startOfDayIso(new Date(actualEndIso)),
      end: endOfDayIso(new Date(actualEndIso)),
    }),
    [actualEndIso],
  );

  const plannedShiftsQuery = useQuery({
    queryKey: ["planned-shifts", dayRange.start, dayRange.end],
    queryFn: () => getPlannedShifts(dayRange.start, dayRange.end),
    enabled: isOpen && plannedShiftId !== null,
  });

  const linkedPlannedShift = useMemo(() => {
    if (!plannedShiftId) {
      return null;
    }
    return (plannedShiftsQuery.data ?? []).find(
      (shift) => shift.id === plannedShiftId,
    );
  }, [plannedShiftsQuery.data, plannedShiftId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setDeductedMinutes(0);
    setNotes("");
    setError(null);
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

      return recordSession({
        activity_id: activityId,
        planned_shift_id: plannedShiftId,
        actual_start: actualStartIso,
        actual_end: actualEndIso,
        scheduled_start: linkedPlannedShift?.start_time ?? null,
        scheduled_end: linkedPlannedShift?.end_time ?? null,
        gross_minutes: grossMinutes,
        deducted_minutes: parsed.data.deducted_minutes,
        notes: parsed.data.notes ?? null,
        logged_date: toDateString(new Date(actualEndIso)),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["analytics"] }),
        queryClient.invalidateQueries({ queryKey: ["sessions"] }),
      ]);
      resetTimer();
      sessionSaved(netMinutes);
      onClose();
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
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
              value={deductedMinutes}
              onChange={(event) =>
                setDeductedMinutes(Number(event.target.value))
              }
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

          {error ? (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

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
