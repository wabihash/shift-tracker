import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { apiRequest } from "../api/client";

export interface AuthUser { id: number; email: string }
interface AuthResult { access_token: string; user: AuthUser }
interface AuthContextValue {
  user: AuthUser | null; token: string | null; isAuthenticated: boolean; isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem("access_token");
      const savedUser = localStorage.getItem("user_profile");
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser) as AuthUser);
      }
    } catch {
      // Keep the session available offline; malformed local profile is simply ignored.
    } finally {
      setIsLoading(false);
    }
  }, []);

  const acceptAuth = useCallback((result: AuthResult) => {
    localStorage.setItem("access_token", result.access_token);
    localStorage.setItem("user_profile", JSON.stringify(result.user));
    setToken(result.access_token);
    setUser(result.user);
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    acceptAuth(await apiRequest<AuthResult>("/api/auth/login", { method: "POST", body: { email, password } }));
  }, [acceptAuth]);
  const register = useCallback(async (email: string, password: string) => {
    acceptAuth(await apiRequest<AuthResult>("/api/auth/register", { method: "POST", body: { email, password } }));
  }, [acceptAuth]);
  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_profile");
    setToken(null);
    setUser(null);
  }, []);
  const value = useMemo(() => ({ user, token, isAuthenticated: Boolean(token && user), isLoading, login, register, logout }), [user, token, isLoading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
