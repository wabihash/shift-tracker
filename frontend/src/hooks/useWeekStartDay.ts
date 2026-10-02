import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "shift-tracker-week-start-day";
const CHANGE_EVENT = "shift-tracker:week-start-day-changed";
const DEFAULT_WEEK_START_DAY = 1;
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

function validDay(value: unknown): value is WeekStartDay {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

export function readWeekStartDay(): WeekStartDay {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return DEFAULT_WEEK_START_DAY;
  const stored = Number(raw);
  return validDay(stored) ? stored : DEFAULT_WEEK_START_DAY;
}

export function useWeekStartDay(): [WeekStartDay, (day: WeekStartDay) => void] {
  const [day, setDay] = useState(readWeekStartDay);

  useEffect(() => {
    const applyDay = (value: unknown) => {
      if (validDay(value)) setDay(value);
    };
    const handleCustomEvent = (event: Event) => {
      applyDay((event as CustomEvent<number>).detail);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) applyDay(Number(event.newValue));
    };
    window.addEventListener(CHANGE_EVENT, handleCustomEvent);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleCustomEvent);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const updateDay = useCallback((nextDay: WeekStartDay) => {
    if (!validDay(nextDay)) return;
    setDay(nextDay);
    window.localStorage.setItem(STORAGE_KEY, String(nextDay));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: nextDay }));
  }, []);

  return [day, updateDay];
}
