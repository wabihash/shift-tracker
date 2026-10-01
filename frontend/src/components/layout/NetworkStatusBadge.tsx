import { Loader2, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";

import { useShiftStore } from "../../stores/useShiftStore";

export function NetworkStatusBadge(): ReactElement {
  const isSyncing = useShiftStore((state) => state.isSyncing);
  const isStoreOffline = useShiftStore((state) => state.isOffline);
  const pendingOutboxCount = useShiftStore((state) => state.pendingOutboxCount);
  const [isBrowserOnline, setIsBrowserOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const onOnline = () => setIsBrowserOnline(true);
    const onOffline = () => setIsBrowserOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // 1. Syncing State: Blue animated badge ("Syncing [X] sessions...")
  if (isSyncing) {
    const countText = pendingOutboxCount > 0 ? `${pendingOutboxCount} ` : "";
    return (
      <div
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-950/80 px-2.5 py-1 text-xs font-medium text-sky-200 shadow-sm"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" aria-hidden="true" />
        <span>Syncing {countText}sessions...</span>
      </div>
    );
  }

  // 2. Offline State: Yellow badge ("Offline • Stored Locally")
  if (!isBrowserOnline || isStoreOffline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/80 px-2.5 py-1 text-xs font-medium text-amber-200 shadow-sm"
      >
        <WifiOff className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
        <span>Offline • Stored Locally</span>
        {pendingOutboxCount > 0 && (
          <span
            className="ml-0.5 rounded-full bg-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-100"
            title={`${pendingOutboxCount} offline session(s) queued for sync`}
          >
            {pendingOutboxCount}
          </span>
        )}
      </div>
    );
  }

  // 3. Online with queued sessions waiting for sync
  if (pendingOutboxCount > 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/40 bg-indigo-950/80 px-2.5 py-1 text-xs font-medium text-indigo-200 shadow-sm"
      >
        <Wifi className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
        <span>{pendingOutboxCount} pending sync</span>
      </div>
    );
  }

  // 4. Online and outbox clear: Subtle green dot
  return (
    <div
      role="status"
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-slate-400"
      title="Connected to network. All sessions synced."
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40"></span>
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
      </span>
      <span className="hidden text-[11px] text-slate-400 sm:inline">Online</span>
    </div>
  );
}
