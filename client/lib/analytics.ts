/**
 * Analytics integration point (Google Analytics 4 via gtag.js).
 *
 * Nothing is sent anywhere unless GA_MEASUREMENT_ID is set on the server, which
 * exposes it through /api/settings. Events are always mirrored to
 * window.__solviaEvents so they can be inspected during development and tests.
 * Event payloads contain product ids/prices only — no names, emails or addresses.
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __solviaEvents?: { name: string; params: Record<string, unknown> }[];
  }
}

let enabled = false;

export function initAnalytics(measurementId: string | null | undefined) {
  if (!measurementId || enabled || typeof document === 'undefined') return;
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) return;
  enabled = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { anonymize_ip: true, send_page_view: true });
}

export type Item = { item_id: string; item_name?: string; price: number; quantity?: number; item_variant?: string };

export function track(name: 'view_item' | 'add_to_cart' | 'view_cart' | 'begin_checkout' | 'purchase', params: Record<string, unknown>) {
  (window.__solviaEvents ||= []).push({ name, params });
  if (enabled && window.gtag) window.gtag('event', name, params);
}
