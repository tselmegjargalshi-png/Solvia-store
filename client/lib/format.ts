import { useI18n } from '../i18n/index.tsx';
import { useSettings } from '../state/settings.tsx';

/** Currency comes from store settings; number/date style from the interface language. They are independent. */
export function useFormat() {
  const { intlLocale } = useI18n();
  const settings = useSettings();
  const { code, decimals } = settings?.currency ?? { code: 'MNT', decimals: 0 };
  const moneyFmt = new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency: code,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const dateFmt = new Intl.DateTimeFormat(intlLocale, { year: 'numeric', month: 'short', day: 'numeric' });
  const dateTimeFmt = new Intl.DateTimeFormat(intlLocale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return {
    money: (minor: number) => moneyFmt.format(minor / 10 ** decimals),
    /** Convert a user-entered major-unit value (e.g. "189000" or "12.50") to minor units. */
    toMinor: (major: string | number) => Math.round(Number(major) * 10 ** decimals),
    toMajor: (minor: number) => minor / 10 ** decimals,
    date: (iso: string) => dateFmt.format(new Date(iso)),
    dateTime: (iso: string) => dateTimeFmt.format(new Date(iso)),
    number: (n: number) => new Intl.NumberFormat(intlLocale).format(n),
    decimals,
    currency: code,
  };
}
