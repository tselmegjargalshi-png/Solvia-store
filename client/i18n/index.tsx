import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BRAND, type Locale } from '../../config/brand.ts';
import { en, type TKey } from './en.ts';
import { mn } from './mn.ts';
import { storage } from '../lib/storage.ts';

const DICTS = { en, mn } as const;
const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', mn: 'mn-MN' };

type Ctx = {
  locale: Locale;
  intlLocale: string;
  setLocale: (l: Locale) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
};
const I18nCtx = createContext<Ctx>(null as any);

function initialLocale(): Locale {
  const saved = storage.get<string>('locale');
  if (saved && (BRAND.supportedLocales as readonly string[]).includes(saved)) return saved as Locale;
  return BRAND.defaultLocale;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback((l: Locale) => {
    storage.set('locale', l);
    setLocaleState(l);
  }, []);
  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => {
      let s: string = (DICTS[locale] as Record<string, string>)[key] ?? en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    [locale],
  );
  const value = useMemo(() => ({ locale, intlLocale: INTL_LOCALE[locale], setLocale, t }), [locale, setLocale, t]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
export const useT = () => useContext(I18nCtx).t;

/** Pick the localized name when one exists (e.g. product.nameMn), else the default. */
export function useLocalized() {
  const { locale } = useI18n();
  return (en_: string, mn_?: string | null) => (locale === 'mn' && mn_ ? mn_ : en_);
}
