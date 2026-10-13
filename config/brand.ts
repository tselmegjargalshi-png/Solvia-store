/**
 * Centralized brand + store defaults.
 *
 * Change the brand here. These values seed the store settings on first run;
 * after that, admins can edit store name, contact info, socials, currency,
 * shipping and tax from Admin → Settings (stored in the database).
 *
 * This file is shared by the server and the client, so keep it free of secrets.
 */
export const BRAND = {
  name: 'SOLVIA',
  tagline: 'Discover Better. Shop Smarter.',
  description:
    'A modern online store with premium presentation, convenient product discovery, transparent pricing and reliable ordering.',
  logoText: 'SOLVIA',
  /** Optional path to an uploaded logo image; empty = render the wordmark. */
  logoUrl: '',
  defaultLocale: 'en' as const,
  supportedLocales: ['en', 'mn'] as const,
};

export type Locale = (typeof BRAND.supportedLocales)[number];

/**
 * Currency is a store setting, independent of the interface language.
 * Amounts are stored as integers in the currency's minor unit
 * (MNT uses 0 decimals here, so 189000 = ₮189,000; USD would use cents).
 */
export const DEFAULT_CURRENCY = {
  code: 'MNT',
  decimals: 0,
};

export const DEFAULT_SOCIAL = {
  facebook: 'https://www.facebook.com/',
  instagram: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/',
  youtube: 'https://www.youtube.com/',
  pinterest: '',
  x: '',
};

export const DEFAULT_CONTACT = {
  email: 'hello@solvia.example',
  phone: '+976 7700 0000',
  address: 'Ulaanbaatar, Mongolia (demo address)',
  hours: 'Mon–Fri 09:00–18:00',
};

export const DEFAULT_SHIPPING = {
  freeShippingThreshold: 200000,
  methods: [
    { code: 'standard', name: 'Standard delivery', nameMn: 'Энгийн хүргэлт', fee: 8000, etaDays: '2–4' },
    { code: 'express', name: 'Express delivery', nameMn: 'Шуурхай хүргэлт', fee: 15000, etaDays: '1' },
    { code: 'pickup', name: 'Store pickup', nameMn: 'Дэлгүүрээс авах', fee: 0, etaDays: '1–2' },
  ],
};

export const DEFAULT_TAX = {
  enabled: true,
  /** Percentage, e.g. 10 = 10% */
  rate: 10,
  /** true = listed prices already include tax (common for retail); false = tax added at checkout */
  inclusive: true,
  label: 'VAT',
};

export const LOW_STOCK_THRESHOLD = 5;
/** Minutes an unpaid online-payment order keeps its reserved stock. */
export const RESERVATION_MINUTES = 30;
export const MAX_QTY_PER_LINE = 10;
