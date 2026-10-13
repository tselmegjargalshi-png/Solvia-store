import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Locale } from '../../config/brand.ts';
import { useI18n, useLocalized } from '../i18n/index.tsx';
import { useApi } from '../lib/useApi.ts';
import type { Category } from '../lib/types.ts';
import { Link, NavLink, useLocation, useNavigate } from '../router.tsx';
import { useAuth } from '../state/auth.tsx';
import { useCart } from '../state/cart.tsx';
import { useSettings } from '../state/settings.tsx';
import { useWishlist } from '../state/wishlist.tsx';
import { Icon } from './Icon.tsx';
import { Dialog } from './ui.tsx';

export function Logo({ light = false }: { light?: boolean }) {
  const s = useSettings();
  return (
    <Link to="/" className={`logo ${light ? 'logo--light' : ''}`} aria-label={`${s.storeName} — home`}>
      {s.logoUrl ? <img src={s.logoUrl} alt={s.storeName} className="logo__img" /> : <span className="logo__word">{s.storeName}</span>}
    </Link>
  );
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className={`lang ${compact ? 'lang--compact' : ''}`} role="group" aria-label={t('nav.language')}>
      <Icon name="globe" size={16} />
      {(['en', 'mn'] as Locale[]).map((l) => (
        <button key={l} type="button" className={`lang__btn ${locale === l ? 'is-active' : ''}`} aria-pressed={locale === l} onClick={() => setLocale(l)} lang={l}>
          {l === 'en' ? 'EN' : 'MN'}
          <span className="sr-only"> — {l === 'en' ? 'English' : 'Монгол'}</span>
        </button>
      ))}
    </div>
  );
}

export function SearchBar({ onDone, autoFocus = false }: { onDone?: () => void; autoFocus?: boolean }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const { search } = useLocation();
  const [q, setQ] = useState(() => new URLSearchParams(search).get('q') ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    nav(`/search?q=${encodeURIComponent(term)}`);
    onDone?.();
  };
  return (
    <form role="search" className="searchbar" onSubmit={submit}>
      <label htmlFor="site-search" className="sr-only">
        {t('search.label')}
      </label>
      <Icon name="search" size={18} className="searchbar__icon" />
      <input id="site-search" type="search" className="searchbar__input" placeholder={t('search.placeholder')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} maxLength={100} enterKeyHint="search" />
      <button type="submit" className="btn btn--primary btn--sm">
        {t('search.submit')}
      </button>
    </form>
  );
}

function useCategories() {
  return useApi<{ categories: Category[] }>('/api/categories').data?.categories ?? [];
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className="menu" ref={ref}>
      <button className="icon-btn" aria-expanded={open} aria-haspopup="true" aria-label={t('nav.account')} onClick={() => setOpen((o) => !o)}>
        <Icon name="user" />
      </button>
      {open && (
        <div className="menu__panel">
          {user ? (
            <>
              <p className="menu__who">
                <strong>{user.fullName}</strong>
                <span>{user.email}</span>
              </p>
              <Link to="/account" className="menu__item" onClick={close}>
                {t('nav.myAccount')}
              </Link>
              <Link to="/account/orders" className="menu__item" onClick={close}>
                {t('nav.orders')}
              </Link>
              <Link to="/wishlist" className="menu__item" onClick={close}>
                {t('nav.wishlist')}
              </Link>
              {user.role === 'admin' && (
                <Link to="/admin" className="menu__item menu__item--gold" onClick={close}>
                  {t('nav.admin')}
                </Link>
              )}
              <button
                className="menu__item"
                onClick={async () => {
                  close();
                  await logout();
                  nav('/');
                }}
              >
                {t('nav.signOut')}
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="menu__item" onClick={close}>
                {t('nav.signIn')}
              </Link>
              <Link to="/register" className="menu__item" onClick={close}>
                {t('nav.register')}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { t } = useI18n();
  const L = useLocalized();
  const s = useSettings();
  const cart = useCart();
  const wl = useWishlist();
  const { user, logout } = useAuth();
  const cats = useCategories();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const catsRef = useRef<HTMLLIElement>(null);
  const top = cats.filter((c) => !c.parentId);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setCatsOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!catsOpen) return;
    const onDoc = (e: MouseEvent) => !catsRef.current?.contains(e.target as Node) && setCatsOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCatsOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [catsOpen]);

  const links = [
    { to: '/new-arrivals', label: t('nav.newArrivals') },
    { to: '/best-sellers', label: t('nav.bestSellers') },
    { to: '/offers', label: t('nav.offers') },
    { to: '/blog', label: t('nav.blog') },
    { to: '/about', label: t('nav.about') },
    { to: '/contact', label: t('nav.contact') },
  ];

  return (
    <>
      <a href="#main" className="skip-link">
        {t('nav.skip')}
      </a>
      {s.announcement && (
        <div className="announce">
          <div className="container announce__inner">
            <p className="announce__text">
              <Icon name="truck" size={16} /> {s.announcement}
            </p>
            <LanguageSwitcher compact />
          </div>
        </div>
      )}
      <header className="header">
        <div className="container header__inner">
          <button className="icon-btn header__burger" aria-label={t('nav.menu')} aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Icon name="menu" />
          </button>
          <Logo />
          <nav className="header__nav" aria-label={t('a11y.mainNav')}>
            <ul>
              <li>
                <NavLink to="/shop" className="nav-link">
                  {t('nav.shop')}
                </NavLink>
              </li>
              <li className="has-mega" ref={catsRef}>
                <button className={`nav-link ${pathname.startsWith('/category') ? 'is-active' : ''}`} aria-expanded={catsOpen} onClick={() => setCatsOpen((o) => !o)}>
                  {t('nav.categories')} <Icon name="chevronDown" size={14} />
                </button>
                {catsOpen && (
                  <div className="mega">
                    <div className="mega__grid">
                      {top.map((c) => (
                        <div key={c.id} className="mega__col">
                          <Link to={`/category/${c.slug}`} className="mega__head">
                            {L(c.name, c.nameMn)}
                          </Link>
                          <ul>
                            {cats
                              .filter((x) => x.parentId === c.id)
                              .map((x) => (
                                <li key={x.id}>
                                  <Link to={`/category/${x.slug}`}>{L(x.name, x.nameMn)}</Link>
                                </li>
                              ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                    <Link to="/shop" className="mega__all">
                      {t('nav.allProducts')} <Icon name="arrowRight" size={16} />
                    </Link>
                  </div>
                )}
              </li>
              {links.map((l) => (
                <li key={l.to}>
                  <NavLink to={l.to} className="nav-link">
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="header__actions">
            <button className="icon-btn" aria-label={t('nav.search')} aria-expanded={searchOpen} aria-controls="search-panel" onClick={() => setSearchOpen((o) => !o)}>
              <Icon name="search" />
            </button>
            <Link to="/wishlist" className="icon-btn icon-btn--count header__wish" aria-label={`${t('nav.wishlist')} (${wl.ids.length})`}>
              <Icon name="heart" />
              {wl.ids.length > 0 && <span className="count-dot">{wl.ids.length}</span>}
            </Link>
            <AccountMenu />
            <Link to="/cart" className="icon-btn icon-btn--count" aria-label={t('nav.cartCount', { count: cart.count })} data-testid="cart-link">
              <Icon name="bag" />
              {cart.count > 0 && (
                <span className="count-dot count-dot--gold" data-testid="cart-count">
                  {cart.count}
                </span>
              )}
            </Link>
          </div>
        </div>
        {searchOpen && (
          <div className="search-panel" id="search-panel">
            <div className="container">
              <SearchBar autoFocus onDone={() => setSearchOpen(false)} />
            </div>
          </div>
        )}
      </header>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title={t('nav.menu')} variant="drawer-left">
        <SearchBar onDone={() => setMenuOpen(false)} />
        <nav aria-label={t('a11y.mainNav')} className="mnav">
          <Link to="/shop" className="mnav__link">
            {t('nav.allProducts')}
          </Link>
          <p className="mnav__group">{t('nav.categories')}</p>
          {top.map((c) => (
            <div key={c.id}>
              <Link to={`/category/${c.slug}`} className="mnav__link">
                {L(c.name, c.nameMn)}
              </Link>
              {cats
                .filter((x) => x.parentId === c.id)
                .map((x) => (
                  <Link key={x.id} to={`/category/${x.slug}`} className="mnav__link mnav__link--sub">
                    {L(x.name, x.nameMn)}
                  </Link>
                ))}
            </div>
          ))}
          <p className="mnav__group">{t('nav.shop')}</p>
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="mnav__link">
              {l.label}
            </Link>
          ))}
          <Link to="/faq" className="mnav__link">
            {t('nav.faq')}
          </Link>
          <p className="mnav__group">{t('nav.account')}</p>
          {user ? (
            <>
              <Link to="/account" className="mnav__link">
                {t('nav.myAccount')}
              </Link>
              {user.role === 'admin' && (
                <Link to="/admin" className="mnav__link">
                  {t('nav.admin')}
                </Link>
              )}
              <button
                className="mnav__link"
                onClick={async () => {
                  setMenuOpen(false);
                  await logout();
                  nav('/');
                }}
              >
                {t('nav.signOut')}
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="mnav__link">
                {t('nav.signIn')}
              </Link>
              <Link to="/register" className="mnav__link">
                {t('nav.register')}
              </Link>
            </>
          )}
        </nav>
        <div className="mnav__foot">
          <LanguageSwitcher />
        </div>
      </Dialog>
    </>
  );
}
