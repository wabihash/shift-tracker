import { apiRequest } from "./client";
import type {
  DateTimeString,
  PlannedShift,
  PlannedShiftCreateInput,
  PlannedShiftUpdateInput,
} from "../types/schema";

export function getPlannedShifts(
  start: DateTimeString,
  end: DateTimeString,
): Promise<PlannedShift[]> {
  return apiRequest<PlannedShift[]>("/api/planned-shifts", {
    query: { start, end },
  });
}

export function createPlannedShift(
  data: PlannedShiftCreateInput,
): Promise<PlannedShift> {
  return apiRequest<PlannedShift>("/api/planned-shifts", {
    method: "POST",
    body: data,
  });
}

export function updatePlannedShift(
  id: number,
  data: PlannedShiftUpdateInput,
): Promise<PlannedShift> {
  return apiRequest<PlannedShift>(`/api/planned-shifts/${id}`, {
    method: "PUT",
    body: data,
  });
}

export function deletePlannedShift(id: number): Promise<void> {
  return apiRequest<void>(`/api/planned-shifts/${id}`, {
    method: "DELETE",
  });
}
