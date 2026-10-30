import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { authStatus, bootstrapAdmin, getCurrentUser, loginUser, logoutUser, type UserInfo } from "./auth.api";
import { AuthContext } from "./AuthContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const setupNeeded = await authStatus();
        if (!active) return;
        setNeedsSetup(setupNeeded);
        const token = sessionStorage.getItem("minipos-session");
        if (token && !setupNeeded) {
          try { setUser(await getCurrentUser(token)); }
          catch { sessionStorage.removeItem("minipos-session"); }
        }
      } catch {
        sessionStorage.removeItem("minipos-session");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const acceptSession = useCallback((result: { token: string; user: UserInfo }) => {
    sessionStorage.setItem("minipos-session", result.token);
    setUser(result.user);
    setNeedsSetup(false);
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    acceptSession(await loginUser(username, password));
  }, [acceptSession]);

  const setupAdmin = useCallback(async (username: string, displayName: string, password: string) => {
    acceptSession(await bootstrapAdmin(username, displayName, password));
  }, [acceptSession]);

  const signOut = useCallback(async () => {
    const token = sessionStorage.getItem("minipos-session");
    sessionStorage.removeItem("minipos-session");
    setUser(null);
    if (token) await logoutUser(token).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ user, loading, needsSetup, signIn, setupAdmin, signOut }), [user, loading, needsSetup, signIn, setupAdmin, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
