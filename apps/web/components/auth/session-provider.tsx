"use client";

import * as React from "react";

import { registerTokenGetter, registerTokenRefresher } from "@/lib/api/client";
import { refresh as refreshSession, type AuthTokens, type UserRole } from "@/lib/auth";

// The access token lives in memory only (never localStorage) so an XSS payload
// can't read it. A hard reload loses it, then re-hydrates from the httponly
// refresh cookie via POST /auth/refresh on mount.

type Session = {
  accessToken: string;
  role: UserRole;
  phoneVerified: boolean;
  emailVerified: boolean;
};

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  // True while the initial refresh-on-mount is in flight; route guards wait on
  // this so they don't bounce a user who is actually logged in.
  isLoading: boolean;
  setSession: (tokens: AuthTokens) => void;
  clear: () => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = React.useState<Session | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Ref mirror so the token getter always reads the latest token without being
  // re-registered on every session change.
  const sessionRef = React.useRef<Session | null>(null);
  sessionRef.current = session;

  // Register the getter during render (not in an effect): child effects run
  // before parent effects, so an effect-based registration could leave a child's
  // first authed call reading a null token.
  const getterRegistered = React.useRef(false);
  if (!getterRegistered.current) {
    getterRegistered.current = true;
    registerTokenGetter(() => sessionRef.current?.accessToken ?? null);
  }

  const setSession = React.useCallback((tokens: AuthTokens) => {
    setSessionState({
      accessToken: tokens.accessToken,
      role: tokens.role,
      phoneVerified: tokens.phoneVerified,
      emailVerified: tokens.emailVerified,
    });
  }, []);

  const clear = React.useCallback(() => setSessionState(null), []);

  // Register the 401 refresher (once). When any authed call 401s, the client
  // wrapper calls this to rotate the token via the refresh cookie and retries.
  // Hitting /auth/refresh is excluded from auto-refresh, so no recursion.
  const refresherRegistered = React.useRef(false);
  if (!refresherRegistered.current) {
    refresherRegistered.current = true;
    registerTokenRefresher(async () => {
      const result = await refreshSession();
      if (result.ok) {
        setSession(result.data);
        return result.data.accessToken;
      }
      clear();
      return null;
    });
  }

  // Re-hydrate from the httponly refresh cookie once on first mount. The ref
  // guard (not just the `active` flag) stops React strict-mode's double mount
  // from firing two concurrent /auth/refresh calls with the same cookie, which
  // could rotate-then-reject and revoke the fresh session.
  const didHydrate = React.useRef(false);
  React.useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    void (async () => {
      const result = await refreshSession();
      if (result.ok) setSession(result.data);
      setIsLoading(false);
    })();
  }, [setSession]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: session !== null,
      isLoading,
      setSession,
      clear,
    }),
    [session, isLoading, setSession, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }
  return ctx;
}
