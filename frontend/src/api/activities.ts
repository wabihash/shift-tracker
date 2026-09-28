import { apiRequest } from "./client";
import type {
  Activity,
  ActivityCreateInput,
  ActivityUpdateInput,
} from "../types/schema";

export function getActivities(): Promise<Activity[]> {
  return apiRequest<Activity[]>("/api/activities");
}

export function createActivity(data: ActivityCreateInput): Promise<Activity> {
  return apiRequest<Activity>("/api/activities", {
    method: "POST",
    body: data,
  });
}

export function updateActivity(
  id: number,
  data: ActivityUpdateInput,
): Promise<Activity> {
  return apiRequest<Activity>(`/api/activities/${id}`, {
    method: "PUT",
    body: data,
  });
}

export function deleteActivity(id: number): Promise<void> {
  return apiRequest<void>(`/api/activities/${id}`, {
    method: "DELETE",
  });
}
