import { useAuth } from "../context/AuthContext";

// Compatibility hook for existing query components.
export function useAuthToken(): string | null {
  return useAuth().token;
}
