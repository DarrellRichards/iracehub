"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface AuthSession {
  authenticated: boolean;
  expiresAt: number | null;
  refreshExpiresAt: number | null;
  isAdmin?: boolean;
}

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  logout: async () => {},
});

/** Refresh the access token by calling the server-side refresh route. */
async function callRefresh(): Promise<AuthSession | null> {
  const res = await fetch("/api/auth/refresh", { method: "POST" });
  if (!res.ok) return null;

  const data = await fetch("/api/auth/session").then((r) => r.json());
  return data as AuthSession;
}

/** Fetch the current session. */
async function fetchSession(): Promise<AuthSession> {
  const res = await fetch("/api/auth/session");
  return res.json() as Promise<AuthSession>;
}

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
// Refresh 30 s before expiry so we stay ahead of the deadline
const REFRESH_BEFORE_EXPIRY_MS = 30 * 1000;
const MIN_REFRESH_DELAY_MS = 5 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const lastActivityRef = useRef<number>(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Update activity timestamp on any user interaction. */
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const scheduleNextRefresh = useCallback(function scheduleRefresh(
    currentSession: AuthSession,
  ) {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    if (!currentSession.authenticated || !currentSession.expiresAt) return;

    const msUntilExpiry = currentSession.expiresAt - Date.now();
    const delay = Math.max(
      Math.min(msUntilExpiry - REFRESH_BEFORE_EXPIRY_MS, REFRESH_INTERVAL_MS),
      MIN_REFRESH_DELAY_MS,
    );

    refreshTimerRef.current = setTimeout(async () => {
      // Only refresh if the user has been active within the last 10 minutes
      const msSinceActivity = Date.now() - lastActivityRef.current;
      if (msSinceActivity > REFRESH_INTERVAL_MS) {
        // user inactive — keep scheduler alive and check again later
        scheduleRefresh(currentSession);
        return;
      }

      const updated = await callRefresh();
      if (updated) {
        setSession(updated);
        scheduleRefresh(updated);
      } else {
        // Refresh failed (token expired) — clear session
        setSession({
          authenticated: false,
          expiresAt: null,
          refreshExpiresAt: null,
          isAdmin: false,
        });
      }
    }, delay);
  }, []);

  useEffect(() => {
    lastActivityRef.current = Date.now();

    fetchSession().then((s) => {
      setSession(s);
      setLoading(false);
      if (s.authenticated) scheduleNextRefresh(s);
    });

    const events = ["mousemove", "keydown", "pointerdown", "scroll"] as const;
    events.forEach((e) =>
      window.addEventListener(e, recordActivity, { passive: true }),
    );

    return () => {
      events.forEach((e) => window.removeEventListener(e, recordActivity));
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [recordActivity, scheduleNextRefresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession({
      authenticated: false,
      expiresAt: null,
      refreshExpiresAt: null,
      isAdmin: false,
    });
    window.location.href = "/";
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
