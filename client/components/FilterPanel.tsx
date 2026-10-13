import { useEffect, useState, type FormEvent } from 'react';
import { useI18n, useLocalized } from '../i18n/index.tsx';
import { useFormat } from '../lib/format.ts';
import type { Category } from '../lib/types.ts';
import { Link } from '../router.tsx';

export type Facets = {
  brands: { slug: string; name: string; count: number }[];
  colors: { value: string; hex: string; count: number }[];
  sizes: { value: string; count: number }[];
  price: { min: number; max: number };
};

type Props = {
  facets: Facets | null;
  params: URLSearchParams;
  setParam: (patch: Record<string, string | null>) => void;
  categories: Category[];
  activeCategory?: string;
  hideCategory?: boolean;
  lockOnSale?: boolean;
};

const csv = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

/** Every control here maps to a URL parameter that the /api/products query actually filters on. */
export function FilterPanel({ facets, params, setParam, categories, activeCategory, hideCategory, lockOnSale }: Props) {
  const { t } = useI18n();
  const L = useLocalized();
  const { toMajor, toMinor, money } = useFormat();
  const toggleIn = (key: string, value: string) => {
    const cur = csv(params.get(key));
    const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
    setParam({ [key]: next.length ? next.join(',') : null, page: null });
  };
  const [min, setMin] = useState(params.get('minPrice') ? String(toMajor(Number(params.get('minPrice')))) : '');
  const [max, setMax] = useState(params.get('maxPrice') ? String(toMajor(Number(params.get('maxPrice')))) : '');
  const [priceErr, setPriceErr] = useState('');
  useEffect(() => {
    setMin(params.get('minPrice') ? String(toMajor(Number(params.get('minPrice')))) : '');
    setMax(params.get('maxPrice') ? String(toMajor(Number(params.get('maxPrice')))) : '');
  }, [params.get('minPrice'), params.get('maxPrice')]);
  const applyPrice = (e: FormEvent) => {
    e.preventDefault();
    const a = min === '' ? null : Number(min);
    const b = max === '' ? null : Number(max);
    if ((a != null && (!Number.isFinite(a) || a < 0)) || (b != null && (!Number.isFinite(b) || b < 0))) return setPriceErr(t('shop.priceInvalid'));
    if (a != null && b != null && a > b) return setPriceErr(t('shop.priceOrder'));
    setPriceErr('');
    setParam({ minPrice: a == null ? null : String(toMinor(a)), maxPrice: b == null ? null : String(toMinor(b)), page: null });
  };
  const brands = csv(params.get('brand'));
  const colors = csv(params.get('color'));
  const sizes = csv(params.get('size'));
  const top = categories.filter((c) => !c.parentId);

  return (
    <div className="filters">
      {!hideCategory && (
        <fieldset className="filter">
          <legend className="filter__title">{t('shop.category')}</legend>
          <ul className="filter__cats">
            <li>
              <Link to="/shop" className={!activeCategory ? 'is-active' : ''}>
                {t('nav.allProducts')}
              </Link>
            </li>
            {top.map((c) => (
              <li key={c.id}>
                <Link to={`/category/${c.slug}`} className={activeCategory === c.slug ? 'is-active' : ''}>
                  {L(c.name, c.nameMn)}
                </Link>
                <ul>
                  {categories
                    .filter((x) => x.parentId === c.id)
                    .map((x) => (
                      <li key={x.id}>
                        <Link to={`/category/${x.slug}`} className={activeCategory === x.slug ? 'is-active' : ''}>
                          {L(x.name, x.nameMn)}
                        </Link>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <fieldset className="filter">
        <legend className="filter__title">{t('shop.availability')}</legend>
        <label className="toggle-row">
          <input type="checkbox" checked={params.get('inStock') === '1'} onChange={(e) => setParam({ inStock: e.target.checked ? '1' : null, page: null })} />
          <span>{t('shop.inStockOnly')}</span>
        </label>
        {!lockOnSale && (
          <label className="toggle-row">
            <input type="checkbox" checked={params.get('onSale') === '1'} onChange={(e) => setParam({ onSale: e.target.checked ? '1' : null, page: null })} />
            <span>{t('shop.onSaleOnly')}</span>
          </label>
        )}
      </fieldset>

      <fieldset className="filter">
        <legend className="filter__title">{t('shop.price')}</legend>
        <form className="price-form" onSubmit={applyPrice} noValidate>
          <label className="sr-only" htmlFor="pmin">
            {t('shop.min')}
          </label>
          <input id="pmin" className="input input--sm" inputMode="decimal" placeholder={facets ? money(facets.price.min) : t('shop.min')} value={min} onChange={(e) => setMin(e.target.value.replace(/[^\d.]/g, ''))} aria-describedby={priceErr ? 'price-err' : undefined} />
          <span aria-hidden="true">–</span>
          <label className="sr-only" htmlFor="pmax">
            {t('shop.max')}
          </label>
          <input id="pmax" className="input input--sm" inputMode="decimal" placeholder={facets ? money(facets.price.max) : t('shop.max')} value={max} onChange={(e) => setMax(e.target.value.replace(/[^\d.]/g, ''))} aria-describedby={priceErr ? 'price-err' : undefined} />
          <button className="btn btn--outline btn--sm">{t('shop.applyPrice')}</button>
        </form>
        {priceErr && (
          <p id="price-err" className="field__error" role="alert">
            {priceErr}
          </p>
        )}
      </fieldset>

      {facets && facets.brands.length > 0 && (
        <fieldset className="filter">
          <legend className="filter__title">{t('shop.brand')}</legend>
          {facets.brands.map((b) => (
            <label key={b.slug} className="toggle-row">
              <input type="checkbox" checked={brands.includes(b.slug)} onChange={() => toggleIn('brand', b.slug)} />
              <span>{b.name}</span>
              <span className="toggle-row__count">{b.count}</span>
            </label>
          ))}
        </fieldset>
      )}

      {facets && facets.colors.length > 0 && (
        <fieldset className="filter">
          <legend className="filter__title">{t('shop.color')}</legend>
          <div className="swatches">
            {facets.colors.map((c) => (
              <button key={c.value} type="button" className={`swatch ${colors.includes(c.value) ? 'is-active' : ''}`} aria-pressed={colors.includes(c.value)} onClick={() => toggleIn('color', c.value)} title={`${c.value} (${c.count})`}>
                <span className="swatch__dot" style={{ background: c.hex || '#ccc' }} aria-hidden="true" />
                <span className="swatch__label">{c.value}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {facets && facets.sizes.length > 0 && (
        <fieldset className="filter">
          <legend className="filter__title">{t('shop.size')}</legend>
          <div className="chips">
            {facets.sizes.map((s) => (
              <button key={s.value} type="button" className={`chip ${sizes.includes(s.value) ? 'is-active' : ''}`} aria-pressed={sizes.includes(s.value)} onClick={() => toggleIn('size', s.value)}>
                {s.value}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
