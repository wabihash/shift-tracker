import { useQuery } from "@tanstack/react-query";
import { useState, type ReactElement } from "react";

import { getHistorySummary } from "../../api/analytics";
import { useAuthToken } from "../../auth/AuthTokenContext";
import { formatVarianceDuration } from "../../utils/time";

export function HistoricalSummaryTable(): ReactElement {
  const token = useAuthToken();
  const [groupBy, setGroupBy] = useState<"week" | "month">("week");
  const historyQuery = useQuery({ queryKey: ["history-summary", groupBy], queryFn: () => getHistorySummary(groupBy), enabled: !!token });

  return <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5" aria-labelledby="history-summary-title">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="history-summary-title" className="text-sm font-semibold uppercase tracking-wide text-slate-200">History</h2><p className="mt-1 text-xs text-slate-500">Work goal, sleep baseline, and uncommitted buffer by period.</p></div>
      <div className="inline-flex rounded-md border border-slate-700 p-1" aria-label="History grouping">{(["week", "month"] as const).map((value) => <button key={value} type="button" aria-pressed={groupBy === value} onClick={() => setGroupBy(value)} className={`rounded px-3 py-1.5 text-xs font-medium capitalize ${groupBy === value ? "bg-indigo-500/20 text-indigo-200" : "text-slate-400 hover:text-slate-200"}`}>{value}</button>)}</div>
    </div>
    {historyQuery.isError ? <p role="alert" className="mb-3 text-sm text-rose-300">Could not load historical summary.</p> : null}
    <div className="overflow-x-auto rounded-lg border border-slate-800"><table className="min-w-full divide-y divide-slate-800 text-sm">
      <thead className="bg-slate-950/70 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Period</th><th className="px-3 py-2 text-right">Work Goal</th><th className="px-3 py-2 text-right">Sleep Tracker</th><th className="px-3 py-2 text-right">Uncommitted Buffer</th><th className="px-3 py-2 text-right">Time Lost</th></tr></thead>
      <tbody className="divide-y divide-slate-800">
        {historyQuery.isLoading ? <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Loading history…</td></tr> : null}
        {!historyQuery.isLoading && !historyQuery.isError && historyQuery.data?.rows.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No historical sessions yet.</td></tr> : null}
        {(historyQuery.data?.rows ?? []).map((row) => <tr key={row.period_start} className="text-slate-200"><th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">{row.period_label}</th><td className="px-3 py-2 text-right font-mono">{row.logged_hours.toFixed(1)} / {row.target_hours.toFixed(1)}h <span className="text-slate-500">({row.completion_percentage.toFixed(1)}%)</span></td><td className="px-3 py-2 text-right font-mono text-violet-200">{row.logged_sleep_hours.toFixed(1)} / {row.sleep_target_hours.toFixed(1)}h</td><td className="px-3 py-2 text-right font-mono text-slate-300">{row.weekly_buffer.toFixed(1)}h</td><td className="px-3 py-2 text-right text-amber-200">{formatVarianceDuration(row.total_deducted_minutes + row.late_arrival_minutes)}</td></tr>)}
      </tbody>
    </table></div>
  </section>;
}
