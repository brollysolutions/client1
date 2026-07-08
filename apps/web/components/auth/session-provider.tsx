"use client";

import * as React from "react";

import { registerTokenGetter, registerTokenRefresher } from "@/lib/api/client";
import { refresh as refreshSession, type AuthTokens, type UserRole } from "@/lib/auth";

// The access token lives in memory only (never localStorage) so an XSS payload
// can't read it. A hard reload loses it, then re-hydrates from the httponly
// refresh cookie via POST /auth/refresh on mount.

// A readable, non-sensitive hint that a session MIGHT exist. The real session is
// the httponly refresh cookie, which JS cannot see, so without this the provider
// would probe /auth/refresh on every mount — including on /register and /login
// where no one has logged in yet, producing a harmless but noisy 401 in the
// console. Set on login, cleared on logout or a failed re-hydrate. It only gates
// whether we bother probing; it is never trusted as proof of auth.
const SESSION_HINT_KEY = "auth.session_hint";

function shouldProbeSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SESSION_HINT_KEY) === "1";
  } catch {
    // Storage blocked (private mode) — we can't track the hint, so fall back to
    // the original always-probe behaviour rather than silently dropping sessions.
    return true;
  }
}

function setSessionHint(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(SESSION_HINT_KEY, "1");
    else window.localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    /* storage unavailable — shouldProbeSession() fails open to probing */
  }
}

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
    setSessionHint(true);
  }, []);

  const clear = React.useCallback(() => {
    setSessionState(null);
    setSessionHint(false);
  }, []);

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
    // No prior login on this device → no refresh cookie to restore. Skip the probe
    // (and its cosmetic 401) entirely; the user is simply not authenticated.
    if (!shouldProbeSession()) {
      setIsLoading(false);
      return;
    }
    void (async () => {
      const result = await refreshSession();
      if (result.ok) setSession(result.data);
      // Do NOT clear the hint on failure here: refreshSession() can't tell a real
      // auth rejection from a transient network/5xx blip, and clearing on a blip
      // would skip the probe on every later reload — a still-valid cookie would
      // then never re-hydrate (sticky logout). A genuinely dead session is cleared
      // by the 401 refresher (clear()) during normal authed use; the cost of a
      // stale hint is at most one cosmetic 401 per reload.
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
