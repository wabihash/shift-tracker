import { apiRequest } from "./client";
import type {
  ProfileUpdateInput,
  ShiftRule,
  ShiftRuleUpdateInput,
  UserProfileDetail,
} from "../types/schema";

export function getProfile(): Promise<UserProfileDetail> {
  return apiRequest<UserProfileDetail>("/api/profile");
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
