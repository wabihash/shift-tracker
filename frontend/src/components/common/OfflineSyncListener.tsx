import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { recordSession } from "../../api/sessions";
import {
  clearSyncedSession,
  getPendingOutbox,
} from "../../services/offlineStorage";
import { useShiftStore } from "../../stores/useShiftStore";
import { useToast } from "./ToastProvider";

export function OfflineSyncListener(): null {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const isSyncingRef = useRef(false);

  const syncPendingSessions = useCallback(async () => {
    if (isSyncingRef.current) {
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      useShiftStore.getState().setOfflineStatus(true);
      return;
    }

    useShiftStore.getState().setOfflineStatus(false);

    const pending = await getPendingOutbox();
    useShiftStore.getState().setPendingOutboxCount(pending.length);

    if (pending.length === 0) {
      return;
    }

    isSyncingRef.current = true;
    useShiftStore.getState().setSyncingStatus(true);

    let syncedCount = 0;

    try {
      for (const item of pending) {
        // Stop if network dropped again mid-sync
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          useShiftStore.getState().setOfflineStatus(true);
          break;
        }

        try {
          // Post each pending payload sequentially to POST /api/sessions
          await recordSession({
            activity_id: item.activity_id,
            shift_number: item.shift_number,
            planned_shift_id: item.planned_shift_id,
            actual_start: item.actual_start,
            actual_end: item.actual_end,
            scheduled_start: item.scheduled_start,
            scheduled_end: item.scheduled_end,
            gross_minutes: item.gross_minutes,
            deducted_minutes: item.deducted_minutes,
            break_overrun_minutes: item.break_overrun_minutes,
            notes: item.notes,
            logged_date: item.logged_date,
          });

          // Upon receiving verified response, remove from IndexedDB
          await clearSyncedSession(item.localId);
          syncedCount++;

          const remaining = await getPendingOutbox();
          useShiftStore.getState().setPendingOutboxCount(remaining.length);
        } catch (itemError) {
          // If connection failed, halt queue processing and resume on next online event
          if (
            typeof navigator !== "undefined" &&
            (!navigator.onLine || (itemError instanceof Error && itemError.message.toLowerCase().includes("failed to fetch")))
          ) {
            useShiftStore.getState().setOfflineStatus(true);
            break;
          }
          // If it's a persistent 4xx/validation error on an individual record, continue with others
          console.error("Failed to sync individual offline session:", itemError);
        }
      }

      // Check if outbox is completely cleared
      const remainingAfter = await getPendingOutbox();
      useShiftStore.getState().setPendingOutboxCount(remainingAfter.length);

      if (remainingAfter.length === 0 && syncedCount > 0) {
        // Synchronize local records with Neon PostgreSQL IDs
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["analytics"] }),
          queryClient.invalidateQueries({ queryKey: ["sessions"] }),
        ]);

        notify({
          type: "success",
          title: "Offline Sync Complete",
          message: "All offline sessions successfully synced.",
        });
      }
    } finally {
      isSyncingRef.current = false;
      useShiftStore.getState().setSyncingStatus(false);
    }
  }, [notify, queryClient]);

  useEffect(() => {
    // Initial sync check on mount
    void getPendingOutbox().then((items) => {
      useShiftStore.getState().setPendingOutboxCount(items.length);
      if (typeof navigator !== "undefined" && navigator.onLine && items.length > 0) {
        void syncPendingSessions();
      }
    });

    const handleOffline = () => {
      useShiftStore.getState().setOfflineStatus(true);
    };

    window.addEventListener("online", syncPendingSessions);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", syncPendingSessions);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPendingSessions]);

  return null;
}
