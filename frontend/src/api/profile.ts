import { apiRequest } from "./client";
import type {
  ProfileUpdateInput,
  ShiftRule,
  ShiftRuleUpdateInput,
  UserProfileDetail,
} from "../types/schema";

export function getProfile(): Promise<UserProfileDetail | null> {
  return apiRequest<UserProfileDetail | null>("/api/profile");
}

export function getShiftRules(): Promise<Record<string, ShiftRule[]>> {
  return apiRequest<Record<string, ShiftRule[]>>("/api/shift-rules");
}

export function updateProfile(data: ProfileUpdateInput): Promise<UserProfileDetail> {
  return apiRequest<UserProfileDetail>("/api/profile", {
    method: "PUT",
    body: data,
  });
}

export function updateShiftRules(
  rules: ShiftRuleUpdateInput[],
): Promise<ShiftRule[]> {
  return apiRequest<ShiftRule[]>("/api/shift-rules", {
    method: "PUT",
    body: rules,
  });
}
