import { createContext, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

/**
 * A small history-API router (react-router could not be installed in the build
 * environment; this covers what the store needs: path params, query strings,
 * link interception, scroll handling and navigation blocking-free redirects).
 */
type Loc = { pathname: string; search: string };
const RouterCtx = createContext<{ loc: Loc; navigate: (to: string, opts?: { replace?: boolean; scroll?: boolean }) => void }>({
  loc: { pathname: '/', search: '' },
  navigate: () => {},
});

let externalNavigate: (to: string, opts?: { replace?: boolean; scroll?: boolean }) => void = (to) => (window.location.href = to);
export const navigate = (to: string, opts?: { replace?: boolean; scroll?: boolean }) => externalNavigate(to, opts);

export function RouterProvider({ children }: { children: ReactNode }) {
  const read = () => ({ pathname: window.location.pathname, search: window.location.search });
  const [loc, setLoc] = useState<Loc>(read);

  useEffect(() => {
    const onPop = () => setLoc(read());
    window.addEventListener('popstate', onPop);
    if ('scrollRestoration' in history) history.scrollRestoration = 'auto';
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const value = useMemo(() => {
    const nav = (to: string, opts: { replace?: boolean; scroll?: boolean } = {}) => {
      const url = new URL(to, window.location.origin);
      if (url.origin !== window.location.origin) {
        window.location.href = to;
        return;
      }
      const next = url.pathname + url.search + url.hash;
      if (next === window.location.pathname + window.location.search + window.location.hash) return;
      if (opts.replace) history.replaceState(null, '', next);
      else history.pushState(null, '', next);
      setLoc({ pathname: url.pathname, search: url.search });
      if (opts.scroll !== false) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    };
    externalNavigate = nav;
    return { loc, navigate: nav };
  }, [loc]);

  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>;
}

export const useLocation = () => useContext(RouterCtx).loc;
export const useNavigate = () => useContext(RouterCtx).navigate;

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | Record<string, string | null>, opts?: { replace?: boolean }) => void] {
  const { loc, navigate: nav } = useContext(RouterCtx);
  const params = useMemo(() => new URLSearchParams(loc.search), [loc.search]);
  const set = (next: URLSearchParams | Record<string, string | null>, opts: { replace?: boolean } = {}) => {
    let p: URLSearchParams;
    if (next instanceof URLSearchParams) p = next;
    else {
      p = new URLSearchParams(loc.search);
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === '') p.delete(k);
        else p.set(k, v);
      }
    }
    const qs = p.toString();
    nav(loc.pathname + (qs ? `?${qs}` : ''), { replace: opts.replace, scroll: false });
  };
  return [params, set];
}

export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const keys: string[] = [];
  const re = new RegExp(
    '^' +
      pattern.replace(/\/:([a-zA-Z]+)/g, (_m, k) => {
        keys.push(k);
        return '/([^/]+)';
      }) +
      '/?$',
  );
  const m = re.exec(pathname);
  if (!m) return null;
  const params: Record<string, string> = {};
  keys.forEach((k, i) => {
    try {
      params[k] = decodeURIComponent(m[i + 1]);
    } catch {
      params[k] = m[i + 1];
    }
  });
  return params;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean };
export function Link({ to, replace, onClick, children, ...rest }: LinkProps) {
  const nav = useNavigate();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
    if (/^(https?:|mailto:|tel:)/.test(to)) return;
    e.preventDefault();
    nav(to, { replace });
  };
  return (
    <a href={to} onClick={handle} {...rest}>
      {children}
    </a>
  );
}

export function NavLink({ to, className = '', end, ...rest }: LinkProps & { end?: boolean }) {
  const { pathname } = useLocation();
  const path = to.split('?')[0];
  const active = end ? pathname === path : pathname === path || pathname.startsWith(path + '/');
  return <Link to={to} className={`${className}${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} {...rest} />;
}

export function Redirect({ to }: { to: string }) {
  const nav = useNavigate();
  useEffect(() => nav(to, { replace: true }), [to]);
  return null;
}
