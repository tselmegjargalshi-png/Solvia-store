import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api.ts';
import type { User } from '../lib/types.ts';

type AuthCtx = {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: Record<string, unknown>) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
};
const Ctx = createContext<AuthCtx>(null as any);

/**
 * Client-side view of the session. The server is the authority: the session lives in an
 * HttpOnly cookie, and every protected endpoint re-checks it. This state only drives UI.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: User | null }>('/api/auth/me');
      setUser(r.user);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await api<{ user: User }>('/api/auth/login', { body: { email, password } });
    setUser(r.user);
    window.dispatchEvent(new CustomEvent('solvia:login'));
    return r.user;
  };
  const register = async (data: Record<string, unknown>) => {
    const r = await api<{ user: User }>('/api/auth/register', { body: data });
    setUser(r.user);
    window.dispatchEvent(new CustomEvent('solvia:login'));
    return r.user;
  };
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    window.dispatchEvent(new CustomEvent('solvia:logout'));
  };

  return <Ctx.Provider value={{ user, ready, login, register, logout, refresh, setUser }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
