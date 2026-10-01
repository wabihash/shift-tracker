import { createContext, useContext, type ReactElement, type ReactNode } from "react";

const AuthTokenContext = createContext<string | null>(null);

export function AuthTokenProvider({
  token,
  children,
}: {
  token: string;
  children: ReactNode;
}): ReactElement {
  return (
    <AuthTokenContext.Provider value={token}>
      {children}
    </AuthTokenContext.Provider>
  );
}

// This hook shares the auth context module with its provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuthToken(): string | null {
  return useContext(AuthTokenContext);
}
