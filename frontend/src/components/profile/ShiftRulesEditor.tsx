import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Clock3, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";

import { getProfile, getShiftRules, updateShiftRules } from "../../api/profile";
import { safeErrorMessage } from "../../api/client";
import { useAuthToken } from "../../auth/AuthTokenContext";
import { GuardrailCard } from "../common/GuardrailCard";
import type { ShiftRule, ShiftRuleUpdateInput, UserProfileDetail } from "../../types/schema";

type SlotDraft = { id: number; day_of_week: number; name: string; start: string; end: string; kind: "productive" | "break" };
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
type DayName = (typeof DAY_NAMES)[number];
type CadenceDays = Record<DayName, SlotDraft[]>;
const emptyCadence = (): CadenceDays => ({ Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [] });
const timeInput = (value?: string | null) => value?.slice(0, 5) ?? "";
const minutes = (value: string) => { const [h, m] = value.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };

function toDraft(rule: ShiftRule): SlotDraft {
  return { id: rule.id, day_of_week: rule.day_of_week ?? 0, name: rule.name, start: timeInput(rule.slot_start ?? rule.standard_start), end: timeInput(rule.slot_end ?? rule.standard_end), kind: rule.slot_type ?? "productive" };
}

function updatePayload(slot: SlotDraft, shiftNumber: number): ShiftRuleUpdateInput {
  const start = slot.start || "00:00";
  const end = slot.end || "01:00";
  return {
    ...(slot.id > 0 ? { id: slot.id } : {}), day_of_week: slot.day_of_week, shift_number: shiftNumber, name: slot.name.trim() || (slot.kind === "break" ? "Break" : `Shift ${shiftNumber}`),
    standard_start: `${start}:00`, standard_end: `${end}:00`, standard_break_minutes: 0,
    slot_type: slot.kind, slot_start: `${start}:00`, slot_end: `${end}:00`,
  };
}

export function ShiftRulesEditor({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement | null {
  const token = useAuthToken();
  const client = useQueryClient();
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getProfile, enabled: !!token });
  const [slotsByDay, setSlotsByDay] = useState<CadenceDays>(emptyCadence);
  const [selectedDay, setSelectedDay] = useState(0);
  const dayName = DAY_NAMES[selectedDay] ?? "Monday";
  const daySlots = slotsByDay[dayName];
  const profile = profileQuery.data;
  const rulesQuery = useQuery({ queryKey: ["shift-rules"], queryFn: getShiftRules, enabled: !!token && open });

  useEffect(() => {
    if (!open || !rulesQuery.data) return;
    const next = emptyCadence();
    DAY_NAMES.forEach((name, day) => { next[name] = (rulesQuery.data[name] ?? []).map((rule) => ({ ...toDraft(rule), day_of_week: day })); });
    setSlotsByDay(next);
  }, [open, rulesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: updateShiftRules,
    onSuccess: (rules) => {
      if (profile) {
        const detail: UserProfileDetail = { ...profile, shift_rules: rules };
        client.setQueryData(["profile"], detail);
      }
      const next = emptyCadence();
      for (const rule of rules) next[DAY_NAMES[rule.day_of_week] ?? "Monday"].push(toDraft(rule));
      setSlotsByDay(next);
      client.setQueryData(["shift-rules"], Object.fromEntries(DAY_NAMES.map((day) => [day, rules.filter((rule) => DAY_NAMES[rule.day_of_week] === day)])));
      void client.invalidateQueries({ queryKey: ["profile"] });
      onClose();
    },
  });

  const stats = useMemo(() => daySlots.reduce((totals, slot) => {
    const span = Math.max(0, minutes(slot.end) - minutes(slot.start));
    if (slot.kind === "break") totals.break += span; else totals.work += span;
    return totals;
  }, { work: 0, break: 0 }), [daySlots]);

  const warnings = useMemo(() => daySlots
    .filter((slot) => !slot.start || !slot.end || minutes(slot.end) === minutes(slot.start))
    .map((slot) => `${slot.name || "Schedule slot"} needs a start and end time.`), [daySlots]);

  if (!open) return null;
  const update = (id: number, changes: Partial<SlotDraft>) => setSlotsByDay((current) => ({ ...current, [dayName]: current[dayName].map((slot) => slot.id === id ? { ...slot, ...changes } : slot) }));
  const formattedHours = (value: number) => `${Math.floor(value / 60)}h ${value % 60}m`;
  const addSlot = () => {
    const previousEnd = daySlots.reduce((latest, slot) => Math.max(latest, minutes(slot.end)), 0);
    const start = `${String(Math.floor(previousEnd / 60) % 24).padStart(2, "0")}:${String(previousEnd % 60).padStart(2, "0")}`;
    const endMinute = Math.min(previousEnd + 60, 23 * 60 + 59);
    const end = `${String(Math.floor(endMinute / 60)).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}`;
    setSlotsByDay((current) => ({ ...current, [dayName]: [...current[dayName], { id: -Date.now(), day_of_week: selectedDay, name: "New Shift", start, end, kind: "productive" }] }));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="shift-editor-title" className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-800 p-5 sm:p-6">
          <div><div className="flex items-center gap-2 text-indigo-300"><Clock3 className="h-4 w-4"/><span className="text-xs font-semibold uppercase tracking-wider">Weekly cadence</span></div><h2 id="shift-editor-title" className="mt-1 text-xl font-semibold text-white">My Shifts &amp; Breaks</h2><p className="mt-1 text-sm text-slate-400">Set shift and break times separately for each day.</p></div>
          <button type="button" onClick={onClose} aria-label="Close shift configuration" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5"/></button>
        </header>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3 sm:px-6">
          <div className="flex flex-wrap gap-1">{DAY_NAMES.map((day, index) => <button type="button" key={day} aria-pressed={selectedDay === index} onClick={() => setSelectedDay(index)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${selectedDay === index ? "bg-indigo-500/20 text-indigo-200" : "text-slate-400 hover:bg-slate-800"}`}>{day}</button>)}</div>
          <div className="flex flex-wrap gap-2"><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200">Productive {formattedHours(stats.work)}</span><span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200">Breaks {formattedHours(stats.break)}</span></div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
          {profileQuery.isLoading || rulesQuery.isLoading ? <p className="py-12 text-center text-sm text-slate-400">Loading your schedule...</p> : null}
          {profileQuery.error || rulesQuery.error ? <p role="alert" className="text-sm text-rose-300">{safeErrorMessage(profileQuery.error ?? rulesQuery.error, "Could not load your schedule. Retry in a moment.")}</p> : null}
          {daySlots.map((slot, index) => <article key={slot.id} className={`rounded-xl border p-4 ${slot.kind === "break" ? "border-sky-500/20 bg-sky-500/[0.04]" : "border-slate-700 bg-slate-950/50"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-300">{slot.kind === "productive" ? `S${daySlots.slice(0, index + 1).filter((item) => item.kind === "productive").length}` : "B"}</span>
              <label className="sr-only" htmlFor={`slot-name-${slot.id}`}>Slot label</label><input id={`slot-name-${slot.id}`} value={slot.name} onChange={(event) => update(slot.id, { name: event.target.value })} className="min-w-36 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-white outline-none focus:border-indigo-400" placeholder="Name this slot"/>
              <div className="flex rounded-md border border-slate-700 p-0.5" role="group" aria-label="Rule type"><button type="button" aria-pressed={slot.kind === "productive"} onClick={() => update(slot.id, { kind: "productive" })} className={`rounded px-2.5 py-1.5 text-xs font-medium ${slot.kind === "productive" ? "bg-emerald-500/20 text-emerald-200" : "text-slate-400 hover:text-slate-200"}`}>Productive Shift</button><button type="button" aria-pressed={slot.kind === "break"} onClick={() => update(slot.id, { kind: "break" })} className={`rounded px-2.5 py-1.5 text-xs font-medium ${slot.kind === "break" ? "bg-sky-500/20 text-sky-200" : "text-slate-400 hover:text-slate-200"}`}>Break / Rest</button></div>
              <div className="flex gap-1"><button type="button" aria-label="Move slot up" disabled={index === 0} onClick={() => setSlotsByDay((current) => { const day = [...current[dayName]]; [day[index - 1], day[index]] = [day[index]!, day[index - 1]!]; return { ...current, [dayName]: day }; })} className="rounded p-2 text-slate-400 hover:bg-slate-800 disabled:opacity-30"><ArrowUp className="h-4 w-4"/></button><button type="button" aria-label="Move slot down" disabled={index === daySlots.length - 1} onClick={() => setSlotsByDay((current) => { const day = [...current[dayName]]; [day[index], day[index + 1]] = [day[index + 1]!, day[index]!]; return { ...current, [dayName]: day }; })} className="rounded p-2 text-slate-400 hover:bg-slate-800 disabled:opacity-30"><ArrowDown className="h-4 w-4"/></button><button type="button" aria-label={`Delete ${slot.name || "slot"}`} onClick={() => setSlotsByDay((current) => ({ ...current, [dayName]: current[dayName].filter((item) => item.id !== slot.id) }))} className="rounded p-2 text-rose-300 hover:bg-rose-500/10"><Trash2 className="h-4 w-4"/></button></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 pl-9 sm:max-w-md"><label className="space-y-1 text-xs text-slate-400"><span>Starts</span><input type="time" required value={slot.start} onChange={(event) => update(slot.id, { start: event.target.value })} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"/></label><label className="space-y-1 text-xs text-slate-400"><span>Ends</span><input type="time" required value={slot.end} onChange={(event) => update(slot.id, { end: event.target.value })} className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"/></label></div>
          </article>)}
          {daySlots.length === 0 ? <p className="rounded-lg border border-slate-800 p-4 text-sm text-slate-400">No shifts or breaks configured for this day.</p> : null}
          <button type="button" onClick={addSlot} disabled={Object.values(slotsByDay).reduce((count, day) => count + day.length, 0) >= 224} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 hover:border-indigo-400 hover:bg-indigo-500/5 disabled:opacity-40"><Plus className="h-4 w-4"/>Add Shift or Break</button>
          <div className="min-h-16 space-y-1">
            {warnings.length ? warnings.map((warning) => <GuardrailCard key={warning} tone="warning" title="Schedule time required" message={warning} />) : null}
            {saveMutation.error ? <GuardrailCard tone="critical" title="Could not save schedule" message={safeErrorMessage(saveMutation.error, "Review the schedule and try again.")} /> : null}
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-800 p-4 sm:px-6"><button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancel</button><button type="button" disabled={profileQuery.isLoading || rulesQuery.isLoading || saveMutation.isPending || warnings.length > 0} onClick={() => { const payload = DAY_NAMES.flatMap((day, dayIndex) => slotsByDay[day].map((slot, index, list) => { const productiveBefore = list.slice(0, index + 1).filter((item) => item.kind === "productive").length; const number = slot.kind === "productive" ? productiveBefore : Math.max(1, list.slice(0, index).filter((item) => item.kind === "productive").length); return updatePayload({ ...slot, day_of_week: dayIndex }, number); })); saveMutation.mutate(payload); }} className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">{saveMutation.isPending ? "Saving..." : "Save cadence"}</button></footer>
      </section>
    </div>
  );
}
