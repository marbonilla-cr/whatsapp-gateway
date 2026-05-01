import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import type { AuthUser } from '@/lib/auth';
import { clearSession, getStoredUser, loginRequest, setSession } from '@/lib/auth';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUserFromStorage: () => void;
};

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [loading, setLoading] = useState(false);

  const setUserFromStorage = useCallback(() => {
    setUser(getStoredUser());
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await loginRequest(email, password);
      setSession(res.access, res.refresh, res.user);
      setUser(res.user);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    void fetch(`${(import.meta.env.VITE_GATEWAY_URL ?? '').replace(/\/$/, '')}/auth/logout`, { method: 'POST' }).catch(
      () => undefined
    );
    setLocation('/login');
  }, [setLocation]);

  const value = useMemo(
    () => ({ user, loading, login, logout, setUserFromStorage }),
    [user, loading, login, logout, setUserFromStorage]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
