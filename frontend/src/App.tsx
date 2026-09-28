import { UserButton, useAuth } from "@clerk/clerk-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";

import { setClerkTokenGetter } from "./api/client";
import { AnalyticsDashboard } from "./components/dashboard/AnalyticsDashboard";
import { ShiftStatusBanner } from "./components/layout/ShiftStatusBanner";
import { CalendarPlanner } from "./components/planner/CalendarPlanner";
import { LiveStopwatch } from "./components/timer/LiveStopwatch";
import { KeyboardShortcutsModal } from "./components/common/KeyboardShortcutsModal";
import { ToastProvider } from "./components/common/ToastProvider";

function TokenBridge(): null {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    setClerkTokenGetter(async () => {
      if (!isSignedIn) {
        return null;
      }
      return getToken();
    });

    return () => {
      setClerkTokenGetter(async () => null);
    };
  }, [getToken, isLoaded, isSignedIn]);

  return null;
}

function LiveClock(): ReactElement {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const formatted = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(now),
    [now],
  );

  return (
    <div className="rounded-md border border-slate-700 bg-slate-900/80 px-3 py-1.5 font-mono text-sm text-slate-100">
      {formatted}
    </div>
  );
}

function QuoteBanner(): ReactElement {
  return (
    <div className="hidden flex-1 truncate px-4 text-sm text-slate-300 md:block">
      Execute the shift architecture with precision. Track time, honor caps, ship
      outcomes.
    </div>
  );
}

export default function App(): ReactElement {
  return (
    <ToastProvider>
      <TokenBridge />
      <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
            <div className="text-sm font-semibold tracking-wide text-indigo-300">
              Shift Tracker
            </div>
            <LiveClock />
            <QuoteBanner />
            <div className="ml-auto flex items-center gap-2">
              <KeyboardShortcutsModal />
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8",
                  },
                }}
              />
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-4">
          <ShiftStatusBanner />

          <div className="flex flex-1 flex-col gap-4 lg:flex-row">
            <section className="w-full shrink-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4 lg:w-[350px] xl:w-[400px]">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Execution Station
              </h2>
              <LiveStopwatch />
            </section>

            <section className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Planner
              </h2>
              <CalendarPlanner />
            </section>
          </div>

          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <AnalyticsDashboard />
          </section>
        </main>
      </div>
    </ToastProvider>
  );
}
