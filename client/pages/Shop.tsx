import { useState } from 'react';
import { FilterPanel, type Facets } from '../components/FilterPanel.tsx';
import { Icon } from '../components/Icon.tsx';
import { Breadcrumbs, Pagination } from '../components/nav.tsx';
import { ProductGrid } from '../components/product.tsx';
import { Dialog, EmptyState, ErrorState, LoadingState, SelectField } from '../components/ui.tsx';
import { useI18n, useLocalized } from '../i18n/index.tsx';
import { useFormat } from '../lib/format.ts';
import { useSeo } from '../lib/seo.ts';
import type { Category, ProductCard } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { Link, useSearchParams } from '../router.tsx';
import NotFound from './NotFound.tsx';

type ListResult = { items: ProductCard[]; total: number; page: number; pages: number; pageSize: number; sort: string; facets: Facets };
type Mode = 'all' | 'category' | 'search' | 'new' | 'best' | 'offers';

const SORTS = ['featured', 'newest', 'price_asc', 'price_desc', 'name_asc', 'best_selling'] as const;
const PASS = ['q', 'brand', 'color', 'size', 'minPrice', 'maxPrice', 'inStock', 'onSale', 'sort', 'page'];

export default function Shop({ mode = 'all', params: routeParams }: { mode?: Mode; params: { slug?: string } }) {
  const { t } = useI18n();
  const L = useLocalized();
  const { money } = useFormat();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const cats = useApi<{ categories: Category[] }>('/api/categories').data?.categories ?? [];

  const defaultSort = mode === 'new' ? 'newest' : mode === 'best' ? 'best_selling' : 'featured';
  const api = new URLSearchParams();
  for (const k of PASS) {
    const v = params.get(k);
    if (v) api.set(k, v);
  }
  if (!api.get('sort')) api.set('sort', defaultSort);
  if (mode === 'category' && routeParams.slug) api.set('category', routeParams.slug);
  if (mode === 'offers') api.set('onSale', '1');
  api.set('pageSize', '12');
  const skip = mode === 'search' && !params.get('q');
  const { data, error, loading, reload } = useApi<ListResult>(skip ? null : `/api/products?${api}`);

  const category = mode === 'category' ? cats.find((c) => c.slug === routeParams.slug) : undefined;
  const parent = category?.parentId ? cats.find((c) => c.id === category.parentId) : undefined;
  const q = params.get('q') ?? '';
  const title =
    mode === 'category' ? (category ? L(category.name, category.nameMn) : '') : mode === 'search' ? (q ? t('search.resultsFor', { q }) : t('nav.search')) : mode === 'new' ? t('nav.newArrivals') : mode === 'best' ? t('nav.bestSellers') : mode === 'offers' ? t('nav.offers') : t('shop.title');
  useSeo({ title: title || t('shop.title'), description: category?.description, noindex: mode === 'search' });

  if (mode === 'category' && cats.length && !category) return <NotFound />;

  const setParam = (patch: Record<string, string | null>) => setParams(patch);
  const chips: { key: string; label: string; remove: () => void }[] = [];
  const csv = (k: string) => (params.get(k) ?? '').split(',').filter(Boolean);
  for (const b of csv('brand')) chips.push({ key: `b-${b}`, label: data?.facets.brands.find((x) => x.slug === b)?.name ?? b, remove: () => setParam({ brand: csv('brand').filter((x) => x !== b).join(',') || null, page: null }) });
  for (const c of csv('color')) chips.push({ key: `c-${c}`, label: c, remove: () => setParam({ color: csv('color').filter((x) => x !== c).join(',') || null, page: null }) });
  for (const s of csv('size')) chips.push({ key: `s-${s}`, label: s, remove: () => setParam({ size: csv('size').filter((x) => x !== s).join(',') || null, page: null }) });
  if (params.get('minPrice') || params.get('maxPrice'))
    chips.push({ key: 'price', label: `${params.get('minPrice') ? money(Number(params.get('minPrice'))) : '…'} – ${params.get('maxPrice') ? money(Number(params.get('maxPrice'))) : '…'}`, remove: () => setParam({ minPrice: null, maxPrice: null, page: null }) });
  if (params.get('inStock') === '1') chips.push({ key: 'stock', label: t('shop.inStockOnly'), remove: () => setParam({ inStock: null, page: null }) });
  if (params.get('onSale') === '1' && mode !== 'offers') chips.push({ key: 'sale', label: t('shop.onSaleOnly'), remove: () => setParam({ onSale: null, page: null }) });
  const clearAll = () => setParams(new URLSearchParams(q ? { q } : {}));

  const crumbs = [{ label: t('nav.home'), to: '/' }, { label: t('nav.shop'), to: '/shop' }];
  if (parent) crumbs.push({ label: L(parent.name, parent.nameMn), to: `/category/${parent.slug}` });
  if (mode !== 'all') crumbs.push({ label: title, to: '' });

  const panel = (
    <FilterPanel facets={data?.facets ?? null} params={params} setParam={setParam} categories={cats} activeCategory={routeParams.slug} lockOnSale={mode === 'offers'} />
  );
  const countLabel = data ? (data.total === 1 ? t('shop.result1') : t('shop.results', { count: data.total })) : '';

  return (
    <div className="container shop">
      <Breadcrumbs items={crumbs} />
      <header className="shop__head">
        <div>
          <h1 className="page-title">{title}</h1>
          {category?.description && <p className="page-lede">{category.description}</p>}
          {category && cats.some((c) => c.parentId === category.id) && (
            <ul className="subcats">
              {cats
                .filter((c) => c.parentId === category.id)
                .map((c) => (
                  <li key={c.id}>
                    <Link to={`/category/${c.slug}`} className="chip">
                      {L(c.name, c.nameMn)}
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </header>

      <div className="shop__layout">
        <aside className="shop__aside" aria-label={t('shop.filters')}>
          {panel}
        </aside>
        <section className="shop__main" aria-busy={loading}>
          <div className="toolbar">
            <button className="btn btn--outline btn--sm toolbar__filters" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
              <Icon name="filter" size={16} /> {t('shop.filters')}
              {chips.length > 0 && <span className="count-pill">{chips.length}</span>}
            </button>
            <p className="toolbar__count" aria-live="polite">
              {countLabel}
            </p>
            <SelectField label={t('shop.sort')} className="toolbar__sort" value={api.get('sort') ?? defaultSort} onChange={(e) => setParam({ sort: e.target.value === defaultSort ? null : e.target.value, page: null })}>
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {t(`shop.sort.${s}` as any)}
                </option>
              ))}
            </SelectField>
          </div>

          {chips.length > 0 && (
            <ul className="active-chips" aria-label={t('shop.filters')}>
              {chips.map((c) => (
                <li key={c.key}>
                  <button className="chip chip--removable" onClick={c.remove} aria-label={t('shop.removeFilter', { name: c.label })}>
                    {c.label} <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
              <li>
                <button className="link-btn" onClick={clearAll}>
                  {t('shop.clear')}
                </button>
              </li>
            </ul>
          )}

          {skip && <EmptyState icon="search" title={t('search.empty')} />}
          {loading && !data && <LoadingState rows={6} />}
          {error && <ErrorState onRetry={reload} />}
          {data && !error && (
            <div className={loading ? 'is-refreshing' : ''}>
              {data.items.length === 0 ? (
                <EmptyState
                  icon="search"
                  title={mode === 'best' && !chips.length ? t('shop.bestSellersEmpty') : t('shop.emptyTitle')}
                  body={mode === 'best' && !chips.length ? undefined : t('shop.emptyBody')}
                  action={
                    chips.length ? (
                      <button className="btn btn--primary" onClick={clearAll}>
                        {t('shop.clear')}
                      </button>
                    ) : (
                      <Link to="/shop" className="btn btn--primary">
                        {t('nav.allProducts')}
                      </Link>
                    )
                  }
                />
              ) : (
                <>
                  <ProductGrid items={data.items} eagerCount={2} cols={3} />
                  <Pagination
                    page={data.page}
                    pages={data.pages}
                    onChange={(p) => {
                      setParam({ page: p > 1 ? String(p) : null });
                      window.scrollTo({ top: 0 });
                    }}
                  />
                </>
              )}
            </div>
          )}
        </section>
      </div>

      <Dialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('shop.filters')}
        variant="drawer-right"
        footer={
          <>
            <button className="btn btn--ghost" onClick={clearAll}>
              {t('shop.clear')}
            </button>
            <button className="btn btn--primary" onClick={() => setFiltersOpen(false)}>
              {t('shop.applyFilters', { count: data?.total ?? 0 })}
            </button>
          </>
        }
      >
        {panel}
      </Dialog>
    </div>
  );
}
