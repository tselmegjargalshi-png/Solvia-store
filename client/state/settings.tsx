import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { BRAND, DEFAULT_CONTACT, DEFAULT_CURRENCY, DEFAULT_SHIPPING, DEFAULT_SOCIAL, DEFAULT_TAX } from '../../config/brand.ts';
import { api } from '../lib/api.ts';
import { initAnalytics } from '../lib/analytics.ts';

export type Settings = {
  storeName: string;
  logoUrl: string;
  tagline: string;
  description: string;
  currency: { code: string; decimals: number };
  contact: typeof DEFAULT_CONTACT;
  social: Record<string, string>;
  shipping: { freeShippingThreshold: number; methods: { code: string; name: string; nameMn: string; fee: number; etaDays: string }[] };
  tax: typeof DEFAULT_TAX;
  promo: { enabled: boolean; eyebrow: string; title: string; body: string; ctaLabel: string; ctaHref: string };
  announcement: string;
  payments: { provider: 'demo' | 'stripe'; liveCardPayments: boolean };
  analytics: { gaMeasurementId: string | null };
};

/** Defaults from the shared brand config so the shell renders before /api/settings returns. */
const FALLBACK: Settings = {
  storeName: BRAND.name,
  logoUrl: BRAND.logoUrl,
  tagline: BRAND.tagline,
  description: BRAND.description,
  currency: DEFAULT_CURRENCY,
  contact: DEFAULT_CONTACT,
  social: DEFAULT_SOCIAL,
  shipping: DEFAULT_SHIPPING,
  tax: DEFAULT_TAX,
  promo: { enabled: false, eyebrow: '', title: '', body: '', ctaLabel: '', ctaHref: '/shop' },
  announcement: '',
  payments: { provider: 'demo', liveCardPayments: false },
  analytics: { gaMeasurementId: null },
};

const SettingsCtx = createContext<Settings>(FALLBACK);
const RefreshCtx = createContext<() => void>(() => {});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(FALLBACK);
  const load = () =>
    api<Settings>('/api/settings')
      .then((s) => {
        setSettings(s);
        initAnalytics(s.analytics?.gaMeasurementId);
      })
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);
  return (
    <SettingsCtx.Provider value={settings}>
      <RefreshCtx.Provider value={load}>{children}</RefreshCtx.Provider>
    </SettingsCtx.Provider>
  );
}

export const useSettings = () => useContext(SettingsCtx);
export const useRefreshSettings = () => useContext(RefreshCtx);
