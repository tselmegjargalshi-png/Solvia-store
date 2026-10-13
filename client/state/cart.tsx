import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { MAX_QTY_PER_LINE } from '../../config/brand.ts';
import { api, isAbort } from '../lib/api.ts';
import { storage } from '../lib/storage.ts';
import type { Quote, QuoteIssue } from '../lib/types.ts';
import { useAuth } from './auth.tsx';

export type CartItem = { variantId: number; quantity: number };

type CartCtx = {
  items: CartItem[];
  count: number;
  quote: Quote | null;
  quoting: boolean;
  quoteError: boolean;
  notices: QuoteIssue[];
  couponCode: string;
  shippingMethod: string;
  add: (variantId: number, qty: number, maxAvailable: number) => { added: number; capped: boolean };
  setQuantity: (variantId: number, qty: number) => void;
  remove: (variantId: number) => void;
  replaceVariant: (from: number, to: number) => void;
  setCoupon: (code: string) => void;
  setShippingMethod: (code: string) => void;
  clear: () => void;
  dismissNotices: () => void;
  refreshQuote: () => void;
};
const Ctx = createContext<CartCtx>(null as any);

const clampQty = (n: number) => Math.max(1, Math.min(MAX_QTY_PER_LINE, Math.floor(n)));
function sanitize(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const map = new Map<number, number>();
  for (const r of raw) {
    const v = Number((r as any)?.variantId);
    const q = Number((r as any)?.quantity);
    if (Number.isInteger(v) && v > 0 && Number.isFinite(q) && q > 0) map.set(v, clampQty((map.get(v) ?? 0) + q));
  }
  return [...map].map(([variantId, quantity]) => ({ variantId, quantity }));
}

/**
 * Guest cart lives in localStorage; signed-in customers also get a server copy.
 * The cart only stores variant ids + quantities. Every price shown comes from
 * /api/cart/quote, which reads prices and stock from the database.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>(() => sanitize(storage.get('cart')));
  const [couponCode, setCouponCode] = useState<string>(() => storage.get<string>('cart.coupon') ?? '');
  const [shippingMethod, setShippingMethod] = useState('standard');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState(false);
  const [notices, setNotices] = useState<QuoteIssue[]>([]);
  const [tick, setTick] = useState(0);
  const syncing = useRef(false);

  useEffect(() => storage.set('cart', items), [items]);
  useEffect(() => storage.set('cart.coupon', couponCode), [couponCode]);

  // Keep tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'solvia.cart') setItems(sanitize(storage.get('cart')));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Server-side pricing whenever the cart changes.
  useEffect(() => {
    if (!items.length) {
      setQuote(null);
      setQuoteError(false);
      return;
    }
    const ctrl = new AbortController();
    setQuoting(true);
    const timer = setTimeout(() => {
      api<Quote>('/api/cart/quote', { body: { items, couponCode: couponCode || undefined, shippingMethod }, signal: ctrl.signal })
        .then((q) => {
          setQuote(q);
          setQuoteError(false);
          setQuoting(false);
          const real = q.issues.filter((i) => i.type !== 'invalid_quantity');
          if (real.length) {
            setNotices((n) => [...n, ...real]);
            // Reconcile local cart with what the server says is available.
            setItems((cur) =>
              cur
                .map((it) => {
                  const issue = real.find((i) => i.variantId === it.variantId);
                  if (!issue) return it;
                  if (issue.type === 'quantity_adjusted' && issue.available) return { ...it, quantity: issue.available };
                  return null;
                })
                .filter(Boolean) as CartItem[],
            );
          }
        })
        .catch((e) => {
          if (isAbort(e)) return;
          setQuoteError(true);
          setQuoting(false);
        });
    }, 120);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [items, couponCode, shippingMethod, tick]);

  // Persist to the server for signed-in customers.
  useEffect(() => {
    if (!user || syncing.current) return;
    const t = setTimeout(() => api('/api/account/cart', { method: 'PUT', body: { items } }).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [items, user]);

  // Merge guest + saved cart on login; clear on logout (shared-device safety).
  useEffect(() => {
    const onLogin = async () => {
      syncing.current = true;
      try {
        const r = await api<{ items: CartItem[] }>('/api/account/cart');
        setItems((cur) => {
          const map = new Map<number, number>();
          for (const it of [...r.items, ...cur]) map.set(it.variantId, clampQty(Math.max(map.get(it.variantId) ?? 0, it.quantity)));
          const merged = [...map].map(([variantId, quantity]) => ({ variantId, quantity }));
          api('/api/account/cart', { method: 'PUT', body: { items: merged } }).catch(() => {});
          return merged;
        });
      } catch {
        /* keep local cart */
      } finally {
        syncing.current = false;
      }
    };
    const onLogout = () => {
      setItems([]);
      setCouponCode('');
    };
    window.addEventListener('solvia:login', onLogin);
    window.addEventListener('solvia:logout', onLogout);
    return () => {
      window.removeEventListener('solvia:login', onLogin);
      window.removeEventListener('solvia:logout', onLogout);
    };
  }, []);

  const add = useCallback(
    (variantId: number, qty: number, maxAvailable: number) => {
      const limit = Math.min(maxAvailable, MAX_QTY_PER_LINE);
      const existing = items.find((i) => i.variantId === variantId)?.quantity ?? 0;
      const want = Math.max(0, Math.floor(qty));
      const added = Math.max(0, Math.min(want, limit - existing));
      if (added > 0) {
        setItems((cur) => {
          const found = cur.find((i) => i.variantId === variantId);
          return found ? cur.map((i) => (i.variantId === variantId ? { ...i, quantity: i.quantity + added } : i)) : [...cur, { variantId, quantity: added }];
        });
      }
      return { added, capped: added < want };
    },
    [items],
  );

  const value: CartCtx = {
    items,
    count: items.reduce((s, i) => s + i.quantity, 0),
    quote,
    quoting,
    quoteError,
    notices,
    couponCode,
    shippingMethod,
    add,
    setQuantity: (variantId, qty) => {
      if (!Number.isFinite(qty)) return;
      if (qty <= 0) setItems((cur) => cur.filter((i) => i.variantId !== variantId));
      else setItems((cur) => cur.map((i) => (i.variantId === variantId ? { ...i, quantity: clampQty(qty) } : i)));
    },
    remove: (variantId) => setItems((cur) => cur.filter((i) => i.variantId !== variantId)),
    replaceVariant: (from, to) =>
      setItems((cur) => {
        const src = cur.find((i) => i.variantId === from);
        if (!src || from === to) return cur;
        const rest = cur.filter((i) => i.variantId !== from);
        const dst = rest.find((i) => i.variantId === to);
        return dst ? rest.map((i) => (i.variantId === to ? { ...i, quantity: clampQty(i.quantity + src.quantity) } : i)) : [...rest, { variantId: to, quantity: src.quantity }];
      }),
    setCoupon: (code) => setCouponCode(code.trim().toUpperCase()),
    setShippingMethod,
    clear: () => {
      setItems([]);
      setCouponCode('');
      setNotices([]);
    },
    dismissNotices: () => setNotices([]),
    refreshQuote: () => setTick((t) => t + 1),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = () => useContext(Ctx);
