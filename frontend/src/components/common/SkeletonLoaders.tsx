import type { ReactElement } from "react";

const pulse = "animate-pulse rounded bg-slate-800/90";

export function WeeklyCardSkeleton(): ReactElement {
  return (
    <article aria-label="Loading weekly progress" aria-busy="true" className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className={`${pulse} mb-4 h-4 w-40`} />
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div className={`${pulse} mb-3 h-3 w-20`} /><div className={`${pulse} h-6 w-16`} /></div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div className={`${pulse} mb-3 h-3 w-24`} /><div className={`${pulse} h-6 w-14`} /></div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div className={`${pulse} mb-3 h-3 w-20`} /><div className={`${pulse} h-6 w-12`} /></div>
      </div>
      <div className={`${pulse} mt-4 h-2 w-full rounded-full`} />
    </article>
  );
}

export function BurndownChartSkeleton(): ReactElement {
  return (
    <article aria-label="Loading activity burndown chart" aria-busy="true" className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className={`${pulse} mb-4 h-4 w-44`} />
      <div className="h-[min(420px,60vh)] space-y-4 rounded-lg border border-slate-800 bg-slate-950/40 p-5 pt-8">
        {["w-4/5", "w-2/3", "w-full", "w-3/5", "w-4/5"].map((width, index) => (
          <div key={index} className="flex h-10 items-center gap-4"><div className={`${pulse} h-3 w-24 shrink-0`} /><div className={`${pulse} h-5 ${width}`} /></div>
        ))}
      </div>
    </article>
  );
}

export function CalendarSkeleton(): ReactElement {
  return (
    <div aria-label="Loading calendar" aria-busy="true" className="h-full min-h-0 animate-pulse space-y-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
      <div className="flex justify-between"><div className={`${pulse} h-8 w-36`} /><div className={`${pulse} h-8 w-32`} /></div>
      <div className="grid grid-cols-7 gap-1">{Array.from({ length: 7 }, (_, i) => <div key={i} className={`${pulse} h-9`} />)}</div>
      <div className="grid h-[calc(100%-5rem)] grid-cols-7 gap-1">{Array.from({ length: 7 }, (_, i) => <div key={i} className="space-y-1 border-l border-slate-800 p-1">{Array.from({ length: 8 }, (_, j) => <div key={j} className={`${pulse} h-10 w-full ${j % 3 === 0 ? "opacity-70" : "opacity-40"}`} />)}</div>)}</div>
    </div>
  );
}
