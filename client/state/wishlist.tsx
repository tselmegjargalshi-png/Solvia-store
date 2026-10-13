import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api.ts';
import { storage } from '../lib/storage.ts';
import { useAuth } from './auth.tsx';

type Ctx = { ids: number[]; has: (id: number) => boolean; toggle: (id: number) => boolean };
const WishCtx = createContext<Ctx>(null as any);

/** Guests: localStorage. Signed-in: server, with the guest list merged in on login. */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<number[]>(() => (storage.get<number[]>('wishlist') ?? []).filter((n) => Number.isInteger(n)));

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const guest = storage.get<number[]>('wishlist') ?? [];
        if (guest.length) await api('/api/account/wishlist', { body: { productIds: guest } });
        const r = await api<{ productIds: number[] }>('/api/account/wishlist');
        setIds(r.productIds);
        storage.remove('wishlist');
      } catch {
        /* keep local */
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    if (!user) storage.set('wishlist', ids);
  }, [ids, user]);

  useEffect(() => {
    const onLogout = () => setIds([]);
    window.addEventListener('solvia:logout', onLogout);
    return () => window.removeEventListener('solvia:logout', onLogout);
  }, []);

  const toggle = (id: number) => {
    const adding = !ids.includes(id);
    setIds((cur) => (adding ? [id, ...cur] : cur.filter((x) => x !== id)));
    if (user) {
      (adding ? api('/api/account/wishlist', { body: { productId: id } }) : api(`/api/account/wishlist/${id}`, { method: 'DELETE' })).catch(() => {
        setIds((cur) => (adding ? cur.filter((x) => x !== id) : [id, ...cur]));
      });
    }
    return adding;
  };
  return <WishCtx.Provider value={{ ids, has: (id) => ids.includes(id), toggle }}>{children}</WishCtx.Provider>;
}

export const useWishlist = () => useContext(WishCtx);

/** Recently viewed products (local only). */
export const recent = {
  get: () => storage.get<number[]>('recent') ?? [],
  push: (id: number) => storage.set('recent', [id, ...(storage.get<number[]>('recent') ?? []).filter((x) => x !== id)].slice(0, 12)),
};
