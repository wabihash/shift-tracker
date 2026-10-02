import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from "@clerk/clerk-react";
import { Settings2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";

import { setClerkTokenGetter } from "./api/client";
import { AuthTokenProvider } from "./auth/AuthTokenContext";
import { AnalyticsDashboard } from "./components/dashboard/AnalyticsDashboard";
import { ShiftStatusBanner } from "./components/layout/ShiftStatusBanner";
import { NetworkStatusBadge } from "./components/layout/NetworkStatusBadge";
import { WeeklyShiftTable } from "./components/planner/WeeklyShiftTable";
import { LiveStopwatch } from "./components/timer/LiveStopwatch";
import { ProfileSettings } from "./components/profile/ProfileSettings";
import { CadenceSettings } from "./components/profile/CadenceSettings";
import { ActivitiesManager } from "./components/activities/ActivitiesManager";
import { KeyboardShortcutsModal } from "./components/common/KeyboardShortcutsModal";
import { OfflineSyncListener } from "./components/common/OfflineSyncListener";
import { ToastProvider } from "./components/common/ToastProvider";
import { getCadenceMessage } from "./config/cadenceMessages";
import { InstallPwaButton } from "./components/InstallPwaButton";

function AuthenticatedDashboard(): ReactElement | null {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setClerkTokenGetter(async () => null);
      setToken(null);
      return;
    }

    let active = true;
    setToken(null);
    void getToken().then((initialToken) => {
      if (!active || !initialToken) {
        return;
      }
      setClerkTokenGetter(() => getToken());
      setToken(initialToken);
    });

    return () => {
      active = false;
      setClerkTokenGetter(async () => null);
    };
  }, [getToken, isLoaded, isSignedIn]);

  return isLoaded && isSignedIn && token ? (
    <AuthTokenProvider token={token}>
      <ShiftTrackerApp />
    </AuthTokenProvider>
  ) : null;
}

function AuthenticatedApp(): ReactElement {
  const { isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">
        Loading your account...
      </div>
    );
  }

  return (
    <>
      <SignedIn>
        <AuthenticatedDashboard />
      </SignedIn>
      <SignedOut>
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
          <section className="w-full max-w-md space-y-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center shadow-xl">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Shift Tracker</h1>
              <p className="mt-2 text-sm text-slate-400">Sign in to manage your shifts and sessions.</p>
            </div>
            <SignInButton mode="modal">
              <button type="button" className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-900">Sign in</button>
            </SignInButton>
          </section>
        </main>
      </SignedOut>
    </>
  );
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
    <div className="hidden h-5 min-w-0 flex-1 px-4 md:block" aria-live="polite">
      <span className="inline-block h-5 max-w-[420px] truncate text-xs text-slate-400" title={getCadenceMessage()}>
        {getCadenceMessage()}
      </span>
    </div>
  );
}

function ShiftTrackerApp(): ReactElement {
  const [activeView, setActiveView] = useState<"planner" | "analytics" | "activities" | "settings">("planner");
  const [shiftEditorOpen, setShiftEditorOpen] = useState(false);
  const [startStopwatchRequest, setStartStopwatchRequest] = useState(0);
  const [manualSessionRequest, setManualSessionRequest] = useState(0);

  const tabs = [
    { id: "planner", label: "Planner" },
    { id: "analytics", label: "Analytics" },
    { id: "activities", label: "Activities" },
    { id: "settings", label: "Settings" },
  ] as const;

  return (
    <ToastProvider>
      <OfflineSyncListener />
      <CadenceSettings open={shiftEditorOpen} onClose={() => setShiftEditorOpen(false)} />
      <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-slate-950 pt-2 text-slate-100">
        <header className="sticky top-0 z-40 shrink-0 border-b border-slate-800 bg-slate-900/95 shadow-lg shadow-slate-950/20 backdrop-blur">
          <div className="mx-auto flex min-h-16 max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold tracking-wide text-indigo-300">
                Shift Tracker
              </div>
              <LiveClock />
            </div>
            <QuoteBanner />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <NetworkStatusBadge />
              <button type="button" onClick={() => setShiftEditorOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300">
                <Settings2 className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Configure Shifts</span><span className="sm:hidden">Shifts</span>
              </button>
              <KeyboardShortcutsModal />
              <InstallPwaButton />
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
          <nav aria-label="Main navigation" className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 pb-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id)}
                aria-current={activeView === tab.id ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 ${
                  activeView === tab.id
                    ? "bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-400/30"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-3 px-4 pb-8 pt-3 sm:pt-4">
          {activeView !== "settings" ? <ShiftStatusBanner /> : null}

          <section aria-label="Planner view" className={`${activeView === "planner" ? "flex" : "hidden"} min-w-0 flex-1 flex-col gap-4 lg:flex-row`}>
            <section className="w-full shrink-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4 lg:w-[350px] xl:w-[400px]">
              <h2 id="execution-station" className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Execution Station</h2>
              <div id="execution-station"><LiveStopwatch startRequest={startStopwatchRequest} manualSessionRequest={manualSessionRequest} /></div>
            </section>
            <section className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <WeeklyShiftTable />
            </section>
          </section>

          <section aria-label="Analytics view" className={`${activeView === "analytics" ? "block" : "hidden"} min-w-0 rounded-xl border border-slate-800 bg-slate-900/40 p-4`}>
            <AnalyticsDashboard
              onStartStopwatch={() => {
                setActiveView("planner");
                setStartStopwatchRequest((request) => request + 1);
                window.setTimeout(() => document.getElementById("execution-station")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
              }}
              onLogPastSession={() => {
                setActiveView("planner");
                setManualSessionRequest((request) => request + 1);
                window.setTimeout(() => document.getElementById("execution-station")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
              }}
            />
          </section>

          <section aria-label="Activities view" className={`${activeView === "activities" ? "block" : "hidden"} min-w-0`}>
            <ActivitiesManager />
          </section>

          <section aria-label="Settings view" className={`${activeView === "settings" ? "block" : "hidden"} min-w-0 space-y-4`}>
            <ProfileSettings />
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-sm font-semibold text-slate-100">Shift cadence</h2><p className="mt-1 text-xs text-slate-400">Configure shift and break names and times for each weekday.</p></div>
                <button type="button" onClick={() => setShiftEditorOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-500/20"><Settings2 className="h-4 w-4" aria-hidden="true" />Configure Shifts</button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </ToastProvider>
  );
}

export default function App(): ReactElement {
  return <AuthenticatedApp />;
}
