import { RefreshCw, Settings2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement, type TouchEvent } from "react";

import { useAuth } from "./context/AuthContext";
import { AnalyticsDashboard } from "./components/dashboard/AnalyticsDashboard";
import { ShiftStatusBanner } from "./components/layout/ShiftStatusBanner";
import { NetworkStatusBadge } from "./components/layout/NetworkStatusBadge";
import { WeeklyShiftTable } from "./components/planner/WeeklyShiftTable";
import { LiveStopwatch } from "./components/timer/LiveStopwatch";
import { ProfileSettings } from "./components/profile/ProfileSettings";
import { CadenceSettings } from "./components/profile/CadenceSettings";
import { ActivitiesManager } from "./components/activities/ActivitiesManager";
import { OfflineSyncListener } from "./components/common/OfflineSyncListener";
import { ToastProvider } from "./components/common/ToastProvider";
import { getCadenceMessage } from "./config/cadenceMessages";
import { InstallPwaButton } from "./components/InstallPwaButton";
import { getAppNow, syncServerClock } from "./utils/serverClock";
import { useClickOutside } from "./hooks/useClickOutside";

function AuthScreen(): ReactElement {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setBusy(true);
    try { await (mode === "login" ? login(email, password) : register(email, password)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to authenticate."); }
    finally { setBusy(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100"><section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-7 shadow-xl"><h1 className="text-2xl font-semibold">Shift Tracker</h1><p className="mt-2 text-sm text-slate-400">Sign in or create an account to continue.</p><form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}><label className="block space-y-1 text-sm text-slate-300">Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label><label className="block space-y-1 text-sm text-slate-300">Password<input required minLength={8} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>{error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}<button disabled={busy} className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">{busy ? "Please wait…" : mode === "login" ? "Log In" : "Create Account"}</button></form><button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }} className="mt-4 text-sm text-indigo-300 hover:text-indigo-200">{mode === "login" ? "Need an account? Register" : "Already registered? Log in"}</button></section></main>;
}

function UserMenu(): ReactElement {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside([triggerRef, menuRef], () => setOpen(false), { enabled: open });
  return <div className="relative"><button ref={triggerRef} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label="Profile menu" className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-semibold text-indigo-100">{user?.email.slice(0, 1).toUpperCase()}</button>{open ? <div ref={menuRef} role="menu" className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl"><p className="truncate text-xs text-slate-300">{user?.email}</p><button type="button" role="menuitem" onClick={logout} className="mt-3 w-full rounded-md px-3 py-2 text-left text-sm text-rose-200 hover:bg-slate-800">Log Out</button></div> : null}</div>;
}
function LiveClock(): ReactElement {
  const [now, setNow] = useState(getAppNow);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(getAppNow()), 1000);
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}

function ShiftTrackerApp(): ReactElement {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<"planner" | "analytics" | "activities" | "settings">("planner");
  const [shiftEditorOpen, setShiftEditorOpen] = useState(false);
  const [startStopwatchRequest, setStartStopwatchRequest] = useState(0);
  const [manualSessionRequest, setManualSessionRequest] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToastVisible, setRefreshToastVisible] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const refreshInProgress = useRef(false);
  const toastTimeout = useRef<number | null>(null);
  const pullStartY = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const mainScrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void syncServerClock();
    const intervalId = window.setInterval(() => void syncServerClock(), 5 * 60 * 1000);
    const handleOnline = () => void syncServerClock();
    window.addEventListener("online", handleOnline);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const refreshData = useCallback(async () => {
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;
    setRefreshing(true);
    pullDistanceRef.current = 0;
    setPullDistance(0);

    try {
      await Promise.allSettled([
        queryClient.refetchQueries({ queryKey: ["activities"], type: "active" }, { throwOnError: true }),
        queryClient.refetchQueries({ queryKey: ["sessions"], type: "active" }, { throwOnError: true }),
        queryClient.refetchQueries({ queryKey: ["profile"], type: "active" }, { throwOnError: true }),
        queryClient.refetchQueries({ queryKey: ["analytics"], type: "active" }, { throwOnError: true }),
      ]);
    } finally {
      refreshInProgress.current = false;
      setRefreshing(false);
      setRefreshToastVisible(true);
      if (toastTimeout.current !== null) window.clearTimeout(toastTimeout.current);
      toastTimeout.current = window.setTimeout(() => {
        setRefreshToastVisible(false);
        toastTimeout.current = null;
      }, 1500);
    }
  }, [queryClient]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "r" ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isEditableTarget(event.target)
      ) return;
      event.preventDefault();
      void refreshData();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [refreshData]);

  useEffect(() => () => {
    if (toastTimeout.current !== null) window.clearTimeout(toastTimeout.current);
  }, []);

  const updatePullDistance = (distance: number) => {
    pullDistanceRef.current = distance;
    setPullDistance(distance);
  };

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (
      !event.touches.length ||
      window.scrollY > 0 ||
      (mainScrollRef.current?.scrollTop ?? 0) > 0 ||
      isEditableTarget(event.target)
    ) return;
    pullStartY.current = event.touches[0].clientY;
  };

  const handleTouchMove = (event: TouchEvent<HTMLElement>) => {
    if (pullStartY.current === null || !event.touches.length) return;
    if (window.scrollY > 0 || (mainScrollRef.current?.scrollTop ?? 0) > 0) {
      pullStartY.current = null;
      updatePullDistance(0);
      return;
    }
    const distance = event.touches[0].clientY - pullStartY.current;
    updatePullDistance(distance > 0 ? Math.min(distance, 52) : 0);
  };

  const handleTouchEnd = () => {
    const shouldRefresh = pullDistanceRef.current >= 48;
    pullStartY.current = null;
    updatePullDistance(0);
    if (shouldRefresh) void refreshData();
  };

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
          <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold tracking-wide text-indigo-300">
                Shift Tracker
              </div>
              <LiveClock />
            </div>
            <QuoteBanner />
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              <NetworkStatusBadge />
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => void refreshData()}
                  disabled={refreshing}
                  aria-label="Refresh data"
                  aria-keyshortcuts="R"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:cursor-wait disabled:opacity-70"
                >
                  <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
                </button>
                <div className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden items-center gap-2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 shadow-lg md:group-hover:flex md:group-focus-within:flex">
                  <span>Refresh data</span>
                  <kbd className="rounded border border-slate-600 bg-slate-800 px-1 font-mono">R</kbd>
                </div>
              </div>
              <InstallPwaButton />
              <UserMenu />
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

        <main
          ref={mainScrollRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-3 px-4 pb-8 pt-3 sm:pt-4"
        >
          <div
            className="flex items-center justify-center overflow-hidden text-slate-400 transition-[height] duration-150 md:hidden"
            style={{ height: `${refreshing ? 44 : pullDistance}px` }}
            aria-hidden="true"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : pullDistance >= 48 ? "text-indigo-300" : ""}`} />
          </div>
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
        {refreshToastVisible ? (
          <div
            className="fixed bottom-4 left-1/2 z-[120] -translate-x-1/2 rounded-full border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs text-slate-200 shadow-md"
            role="status"
            aria-live="polite"
          >
            Data refreshed
          </div>
        ) : null}
      </div>
    </ToastProvider>
  );
}

export default function App(): ReactElement {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">Loading your account...</div>;
  return isAuthenticated ? <ShiftTrackerApp /> : <AuthScreen />;
}
