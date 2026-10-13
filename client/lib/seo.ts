import { useEffect } from 'react';
import { useSettings } from '../state/settings.tsx';

/**
 * Keep <title>, meta description, canonical and robots in sync on client-side navigation.
 * The server renders the same tags into the initial HTML for crawlers (server/services/seo.ts).
 */
export function useSeo(opts: { title?: string; description?: string; noindex?: boolean; canonicalPath?: string }) {
  const s = useSettings();
  const store = s?.storeName ?? 'SOLVIA';
  const title = opts.title ? `${opts.title} | ${store}` : `${store} — ${s?.tagline ?? ''}`;
  useEffect(() => {
    document.title = title;
    setMeta('name', 'description', opts.description ?? s?.description ?? '');
    setMeta('name', 'robots', opts.noindex ? 'noindex, nofollow' : 'index, follow');
    setMeta('property', 'og:title', title);
    if (opts.description) setMeta('property', 'og:description', opts.description);
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) {
      const u = new URL(canonical.href);
      canonical.href = u.origin + (opts.canonicalPath ?? window.location.pathname);
    }
  }, [title, opts.description, opts.noindex, opts.canonicalPath, s?.description]);
}

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}
