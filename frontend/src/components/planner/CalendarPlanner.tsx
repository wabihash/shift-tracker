import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addHours,
  endOfWeek,
  format,
  getDay,
  parse,
  startOfWeek,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { Calendar, dateFnsLocalizer, type SlotInfo } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "../../styles/calendar-custom.css";
import { Loader2, Moon, Sun } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";

import { getActivities } from "../../api/activities";
import {
  createPlannedShift,
  getPlannedShifts,
  updatePlannedShift,
} from "../../api/planner";
import { getProfile } from "../../api/profile";
import type { Activity, PlannedShift, TimeString } from "../../types/schema";
import { useToast } from "../common/ToastProvider";
import { CalendarSkeleton } from "../common/SkeletonLoaders";

const locales = { "en-US": enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const DnDCalendar = withDragAndDrop<PlannerCalendarEvent>(Calendar);

interface PlannerCalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource: {
    shift: PlannedShift;
    color: string;
  };
}

interface CreateShiftModalState {
  start: Date;
  end: Date;
}

function parseTimeToMinutes(value: TimeString): number {
  const parts = value.split(":");
  return Number(parts[0] ?? 0) * 60 + Number(parts[1] ?? 0);
}

function formatTimeLabel(value: TimeString): string {
  const padded = value.length === 5 ? `${value}:00` : value;
  const parsed = parse(padded, "HH:mm:ss", new Date());
  return format(parsed, "hh:mm a");
}

function isSleepSlot(
  date: Date,
  wakeMinutes: number,
  bedMinutes: number,
): boolean {
  const slotMinutes = date.getHours() * 60 + date.getMinutes();
  const slotEndMinutes = slotMinutes + 15;
  if (wakeMinutes === bedMinutes) {
    return false;
  }
  if (wakeMinutes < bedMinutes) {
    return (
      slotMinutes >= bedMinutes ||
      slotMinutes < wakeMinutes ||
      (slotMinutes < bedMinutes && slotEndMinutes > bedMinutes)
    );
  }
  return slotMinutes >= bedMinutes && slotMinutes < wakeMinutes;
}

function overlapsSleepWindow(
  start: Date,
  end: Date,
  wakeMinutes: number,
  bedMinutes: number,
): boolean {
  const cursor = new Date(start);
  cursor.setMinutes(cursor.getMinutes() - (cursor.getMinutes() % 30), 0, 0);
  while (cursor < end) {
    if (isSleepSlot(cursor, wakeMinutes, bedMinutes)) {
      return true;
    }
    cursor.setMinutes(cursor.getMinutes() + 30);
  }
  return isSleepSlot(start, wakeMinutes, bedMinutes);
}

function toIso(date: Date): string {
  return date.toISOString();
}

interface QuickCreateModalProps {
  slot: CreateShiftModalState;
  activities: Activity[];
  onClose: () => void;
  onCreate: (payload: {
    title: string;
    activity_id: number;
    start_time: string;
    end_time: string;
  }) => void;
  isSubmitting: boolean;
}

function QuickCreatePlannedShiftModal({
  slot,
  activities,
  onClose,
  onCreate,
  isSubmitting,
}: QuickCreateModalProps): ReactElement {
  const [title, setTitle] = useState("Focus Block");
  const [activityId, setActivityId] = useState<number | "">(
    activities[0]?.id ?? "",
  );

  useEffect(() => {
    const onEscape = () => onClose();
    document.addEventListener("shift-tracker:escape", onEscape);
    return () => document.removeEventListener("shift-tracker:escape", onEscape);
  }, [onClose]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || typeof activityId !== "number") {
      return;
    }
    onCreate({
      title: title.trim(),
      activity_id: activityId,
      start_time: toIso(slot.start),
      end_time: toIso(slot.end),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-create-title"
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
      >
        <h3 id="quick-create-title" className="text-lg font-semibold text-slate-100">
          Create Planned Shift
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          {format(slot.start, "MMM d, HH:mm")} - {format(slot.end, "HH:mm")}
        </p>

        <label className="mt-4 block space-y-1">
          <span className="text-sm text-slate-300">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
          />
        </label>

        <label className="mt-3 block space-y-1">
          <span className="text-sm text-slate-300">Activity</span>
          <select
            value={activityId}
            onChange={(event) =>
              setActivityId(
                event.target.value ? Number(event.target.value) : "",
              )
            }
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
          >
            {activities.length === 0 ? (
              <option value="">No activities available</option>
            ) : (
              activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))
            )}
          </select>
        </label>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            data-modal-close
            className="flex-1 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              isSubmitting || typeof activityId !== "number" || !title.trim()
            }
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

export function CalendarPlanner(): ReactElement {
  const queryClient = useQueryClient();
  const { sleepBoundary } = useToast();
  const [visibleRange, setVisibleRange] = useState(() => {
    const now = new Date();
    return {
      start: startOfWeek(now, { weekStartsOn: 1 }),
      end: endOfWeek(now, { weekStartsOn: 1 }),
    };
  });
  const [createSlot, setCreateSlot] = useState<CreateShiftModalState | null>(
    null,
  );
  const [sleepWarning, setSleepWarning] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  const activitiesQuery = useQuery({
    queryKey: ["activities"],
    queryFn: getActivities,
  });

  const plannedShiftsQuery = useQuery({
    queryKey: [
      "planned-shifts",
      visibleRange.start.toISOString(),
      visibleRange.end.toISOString(),
    ],
    queryFn: () =>
      getPlannedShifts(
        visibleRange.start.toISOString(),
        visibleRange.end.toISOString(),
      ),
  });

  const wakeMinutes = parseTimeToMinutes(profileQuery.data?.wake_time ?? "05:41");
  const bedMinutes = parseTimeToMinutes(
    profileQuery.data?.bedtime_limit ?? "22:15",
  );

  const activityColorById = useMemo(() => {
    const map = new Map<number, string>();
    for (const activity of activitiesQuery.data ?? []) {
      map.set(activity.id, activity.color);
    }
    return map;
  }, [activitiesQuery.data]);

  const events = useMemo<PlannerCalendarEvent[]>(() => {
    return (plannedShiftsQuery.data ?? []).map((shift) => ({
      id: shift.id,
      title: shift.title,
      start: new Date(shift.start_time),
      end: new Date(shift.end_time),
      resource: {
        shift,
        color: activityColorById.get(shift.activity_id) ?? "#6366f1",
      },
    }));
  }, [plannedShiftsQuery.data, activityColorById]);

  const invalidatePlannedShifts = async () => {
    await queryClient.invalidateQueries({ queryKey: ["planned-shifts"] });
  };

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      start,
      end,
    }: {
      id: number;
      start: Date;
      end: Date;
    }) =>
      updatePlannedShift(id, {
        start_time: toIso(start),
        end_time: toIso(end),
      }),
    onSuccess: invalidatePlannedShifts,
    onError: () => {
      setSleepWarning("Unable to update shift. Check sleep boundaries and retry.");
    },
  });

  const createMutation = useMutation({
    mutationFn: createPlannedShift,
    onSuccess: async () => {
      await invalidatePlannedShifts();
      setCreateSlot(null);
    },
  });

  const rejectSleepPlacement = useCallback(
    (start: Date, end: Date) => {
      if (overlapsSleepWindow(start, end, wakeMinutes, bedMinutes)) {
        const message = "Cannot plan during sleep hours (10:15 PM–5:41 AM). Choose a slot after wake and before bed cutoff.";
        setSleepWarning(message);
        const boundary = start.getHours() * 60 + start.getMinutes() < wakeMinutes
          ? "wake"
          : "bedtime";
        sleepBoundary(boundary, message);
        return true;
      }
      setSleepWarning(null);
      return false;
    },
    [wakeMinutes, bedMinutes, sleepBoundary],
  );

  const onSelectSlot = useCallback(
    (slotInfo: SlotInfo) => {
      const start = slotInfo.start;
      const end =
        slotInfo.end && slotInfo.end > start
          ? slotInfo.end
          : addHours(start, 1);

      if (rejectSleepPlacement(start, end)) {
        return;
      }

      setCreateSlot({ start, end });
    },
    [rejectSleepPlacement],
  );

  const slotPropGetter = useCallback(
    (date: Date) => {
      if (isSleepSlot(date, wakeMinutes, bedMinutes)) {
        return { className: "sleep-slot" };
      }
      return {};
    },
    [wakeMinutes, bedMinutes],
  );

  const eventPropGetter = useCallback((event: PlannerCalendarEvent) => {
    return {
      style: {
        backgroundColor: event.resource.color,
        borderColor: event.resource.color,
        color: "#0f172a",
        borderRadius: "6px",
        border: "none",
        opacity: 0.95,
      },
    };
  }, []);

  const onEventDrop = useCallback(
    ({
      event,
      start,
      end,
    }: {
      event: PlannerCalendarEvent;
      start: Date | string;
      end: Date | string;
    }) => {
      const nextStart = new Date(start);
      const nextEnd = new Date(end);
      if (rejectSleepPlacement(nextStart, nextEnd)) {
        return;
      }
      updateMutation.mutate({ id: event.id, start: nextStart, end: nextEnd });
    },
    [updateMutation, rejectSleepPlacement],
  );

  const onEventResize = useCallback(
    ({
      event,
      start,
      end,
    }: {
      event: PlannerCalendarEvent;
      start: Date | string;
      end: Date | string;
    }) => {
      const nextStart = new Date(start);
      const nextEnd = new Date(end);
      if (rejectSleepPlacement(nextStart, nextEnd)) {
        return;
      }
      updateMutation.mutate({ id: event.id, start: nextStart, end: nextEnd });
    },
    [updateMutation, rejectSleepPlacement],
  );

  const isLoading =
    profileQuery.isLoading ||
    activitiesQuery.isLoading ||
    plannedShiftsQuery.isLoading;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
        <span className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1">
          <Sun className="h-3.5 w-3.5 text-amber-300" />
          Wake {formatTimeLabel(profileQuery.data?.wake_time ?? "05:41")}
        </span>
        <span className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1">
          <Moon className="h-3.5 w-3.5 text-indigo-300" />
          Bed cutoff {formatTimeLabel(profileQuery.data?.bedtime_limit ?? "22:15")}
        </span>
        <span className="rounded border border-slate-700 px-2 py-1 text-slate-400">
          Shaded slots = sleep boundary (avoid planning)
        </span>
      </div>

      {sleepWarning ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {sleepWarning}
        </p>
      ) : null}

      <div className="h-[min(720px,70vh)] overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 p-2">
        {isLoading ? (
          <div className="h-full"><CalendarSkeleton /></div>
        ) : (
          <DnDCalendar
            localizer={localizer}
            events={events}
            defaultView="week"
            views={["week", "day"]}
            step={30}
            timeslots={2}
            selectable
            resizable
            popup
            onSelectSlot={onSelectSlot}
            onEventDrop={onEventDrop}
            onEventResize={onEventResize}
            slotPropGetter={slotPropGetter}
            eventPropGetter={eventPropGetter}
            onRangeChange={(range) => {
              if (Array.isArray(range)) {
                setVisibleRange({
                  start: range[0],
                  end: range[range.length - 1],
                });
                return;
              }
              setVisibleRange({ start: range.start, end: range.end });
            }}
            style={{ height: "100%" }}
          />
        )}
      </div>

      {createSlot ? (
        <QuickCreatePlannedShiftModal
          slot={createSlot}
          activities={activitiesQuery.data ?? []}
          onClose={() => setCreateSlot(null)}
          isSubmitting={createMutation.isPending}
          onCreate={(payload) => createMutation.mutate(payload)}
        />
      ) : null}
    </div>
  );
}
