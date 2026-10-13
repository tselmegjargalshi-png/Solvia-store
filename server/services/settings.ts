import {
  BRAND,
  DEFAULT_CONTACT,
  DEFAULT_CURRENCY,
  DEFAULT_SHIPPING,
  DEFAULT_SOCIAL,
  DEFAULT_TAX,
} from '../../config/brand.ts';
import { all, run } from '../db/index.ts';
import { env, livePaymentsConfigured } from '../env.ts';

export type ShippingMethod = { code: string; name: string; nameMn: string; fee: number; etaDays: string };

export type StoreSettings = {
  storeName: string;
  logoUrl: string;
  tagline: string;
  description: string;
  currency: { code: string; decimals: number };
  contact: typeof DEFAULT_CONTACT;
  social: Record<string, string>;
  shipping: { freeShippingThreshold: number; methods: ShippingMethod[] };
  tax: typeof DEFAULT_TAX;
  promo: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
  };
  announcement: string;
};

export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: BRAND.name,
  logoUrl: BRAND.logoUrl,
  tagline: BRAND.tagline,
  description: BRAND.description,
  currency: DEFAULT_CURRENCY,
  contact: DEFAULT_CONTACT,
  social: DEFAULT_SOCIAL,
  shipping: DEFAULT_SHIPPING,
  tax: DEFAULT_TAX,
  promo: {
    enabled: true,
    eyebrow: 'Seasonal edit',
    title: 'Up to 25% off selected pieces',
    body: 'Sale prices are shown on each product and applied automatically in your cart. While stock lasts.',
    ctaLabel: 'Shop offers',
    ctaHref: '/shop?onSale=1',
  },
  announcement: 'Free standard delivery on orders over ₮200,000',
};

let cache: StoreSettings | null = null;

export function getSettings(): StoreSettings {
  if (cache) return cache;
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const merged: any = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) {
    try {
      const v = JSON.parse(r.value);
      merged[r.key] = v && typeof v === 'object' && !Array.isArray(v) ? { ...merged[r.key], ...v } : v;
    } catch {
      /* ignore corrupt row */
    }
  }
  cache = merged;
  return merged;
}

export function saveSettings(patch: Partial<StoreSettings>) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      k,
      JSON.stringify(v),
    );
  }
  cache = null;
}

/** Settings safe to send to any visitor. No secrets live in settings, but keep the shape explicit. */
export function publicSettings() {
  const s = getSettings();
  return {
    ...s,
    payments: {
      provider: livePaymentsConfigured() ? 'stripe' : 'demo',
      liveCardPayments: livePaymentsConfigured(),
    },
    analytics: { gaMeasurementId: env.gaMeasurementId || null },
  };
}
