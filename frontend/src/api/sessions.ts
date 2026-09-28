import { apiRequest } from "./client";
import type {
  DateString,
  SessionLog,
  SessionLogCreateInput,
} from "../types/schema";

export function recordSession(data: SessionLogCreateInput): Promise<SessionLog> {
  return apiRequest<SessionLog>("/api/sessions", {
    method: "POST",
    body: data,
  });
}

export function getSessions(
  startDate: DateString,
  endDate: DateString,
): Promise<SessionLog[]> {
  return apiRequest<SessionLog[]>("/api/sessions", {
    query: { start_date: startDate, end_date: endDate },
  });
}
