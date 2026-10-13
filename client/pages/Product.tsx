import { useEffect, useMemo, useState } from 'react';
import { LOW_STOCK_THRESHOLD } from '../../config/brand.ts';
import { Icon } from '../components/Icon.tsx';
import { Breadcrumbs } from '../components/nav.tsx';
import { PriceDisplay, ProductGrid, QuantitySelector, WishlistButton } from '../components/product.tsx';
import { ProductGallery } from '../components/ProductGallery.tsx';
import { EmptyState, ErrorState, FormAlert, LoadingState } from '../components/ui.tsx';
import { useI18n, useLocalized } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { useFormat } from '../lib/format.ts';
import { useSeo } from '../lib/seo.ts';
import type { Product, ProductCard, Variant } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { Link } from '../router.tsx';
import { useCart } from '../state/cart.tsx';
import { useSettings } from '../state/settings.tsx';
import { useToast } from '../state/toast.tsx';
import { recent } from '../state/wishlist.tsx';

export default function ProductPage({ params }: { params: { slug: string } }) {
  const { t } = useI18n();
  const L = useLocalized();
  const { money } = useFormat();
  const settings = useSettings();
  const cart = useCart();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ product: Product; related: ProductCard[] }>(`/api/products/${encodeURIComponent(params.slug)}`);
  const p = data?.product;

  const colors = useMemo(() => [...new Map((p?.variants ?? []).filter((v) => v.active && v.color).map((v) => [v.color, v.colorHex])).entries()], [p]);
  const sizes = useMemo(() => [...new Set((p?.variants ?? []).filter((v) => v.active && v.size).map((v) => v.size))], [p]);
  const [color, setColor] = useState<string>('');
  const [size, setSize] = useState<string>('');
  const [qty, setQty] = useState(1);
  const [notice, setNotice] = useState('');
  const [recentItems, setRecentItems] = useState<ProductCard[]>([]);

  useEffect(() => {
    if (!p) return;
    const firstAvail = p.variants.find((v) => v.available) ?? p.variants.find((v) => v.active);
    setColor(colors.length ? firstAvail?.color ?? colors[0][0] : '');
    setSize(sizes.length === 1 ? sizes[0] : '');
    setQty(1);
    track('view_item', { currency: settings.currency.code, value: firstAvail?.price, items: [{ item_id: p.sku, price: firstAvail?.price }] });
    const ids = recent.get().filter((id) => id !== p.id).slice(0, 4);
    recent.push(p.id);
    if (ids.length) api<{ items: ProductCard[] }>(`/api/products-by-ids?ids=${ids.join(',')}`).then((r) => setRecentItems(r.items)).catch(() => {});
    else setRecentItems([]);
  }, [p?.id]);

  const variant: Variant | undefined = p?.variants.find((v) => v.active && (colors.length ? v.color === color : true) && (sizes.length ? v.size === size : true));
  const needsSize = sizes.length > 1 && !size;
  const sizeAvailable = (s: string) => !!p?.variants.find((v) => v.size === s && (colors.length ? v.color === color : true) && v.available);
  const colorAvailable = (c: string) => !!p?.variants.find((v) => v.color === c && v.available);
  const images = useMemo(() => {
    if (!p) return [];
    const match = p.images.filter((i) => i.color === color);
    const generic = p.images.filter((i) => !i.color);
    const rest = p.images.filter((i) => i.color && i.color !== color);
    return colors.length ? [...match, ...generic, ...(match.length ? [] : rest)] : p.images;
  }, [p, color]);

  useSeo({ title: p ? `${p.name}${p.brand ? ` by ${p.brand.name}` : ''}` : undefined, description: p?.shortDescription });

  if (loading && !p) return <div className="container section"><LoadingState /></div>;
  if (error?.status === 404) return <div className="container section"><EmptyState title={t('product.notFound')} action={<Link to="/shop" className="btn btn--primary">{t('nav.allProducts')}</Link>} /></div>;
  if (error || !p) return <div className="container section"><ErrorState onRetry={reload} /></div>;

  const name = L(p.name, p.nameMn);
  const minPrice = Math.min(...p.variants.filter((v) => v.active).map((v) => v.price));
  const shownPrice = variant?.price ?? minPrice;
  const shownCompare = variant ? variant.compareAt : p.variants.find((v) => v.price === minPrice)?.compareAt ?? null;
  const stock = variant?.stock ?? 0;
  const canAdd = !!variant && variant.available && !needsSize;
  const inCart = cart.items.find((i) => i.variantId === variant?.id)?.quantity ?? 0;
  const maxQty = Math.max(1, Math.min(stock - inCart, 10));

  const onAdd = () => {
    setNotice('');
    if (needsSize) return setNotice(t('product.selectAll'));
    if (!variant || !variant.available) return setNotice(t('product.unavailableCombo'));
    const r = cart.add(variant.id, qty, variant.stock);
    if (r.added === 0) return setNotice(t('product.maxQty', { max: Math.min(variant.stock, 10) }));
    if (r.capped) setNotice(t('product.maxQty', { max: Math.min(variant.stock, 10) }));
    track('add_to_cart', { currency: settings.currency.code, value: variant.price * r.added, items: [{ item_id: variant.sku, price: variant.price, quantity: r.added }] });
    toast({ tone: 'success', title: t('product.added'), body: t('product.addedBody', { name, qty: r.added }), action: { label: t('product.viewCart'), href: '/cart' } });
    setQty(1);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast({ title: t('product.linkCopied'), tone: 'success' });
      }
    } catch {
      /* user cancelled */
    }
  };
  const shipFee = settings.shipping.methods.find((m) => m.code === 'standard')?.fee ?? 0;
  const expressFee = settings.shipping.methods.find((m) => m.code === 'express')?.fee ?? 0;

  return (
    <div className="container pdp">
      <Breadcrumbs items={[{ label: t('nav.home'), to: '/' }, { label: t('nav.shop'), to: '/shop' }, ...p.breadcrumbs.map((b) => ({ label: L(b.name, b.nameMn), to: `/category/${b.slug}` })), { label: name }]} />
      <div className="pdp__grid">
        <ProductGallery images={images} name={name} />
        <div className="pdp__info">
          {p.brand && <p className="pdp__brand">{p.brand.name}</p>}
          <h1 className="pdp__title">{name}</h1>
          <div className="pdp__price">
            <PriceDisplay price={shownPrice} compareAt={shownCompare} from={!variant && new Set(p.variants.map((v) => v.price)).size > 1} size="lg" />
            {shownCompare && shownCompare > shownPrice && <span className="badge badge--gold">{t('product.save', { amount: money(shownCompare - shownPrice) })}</span>}
          </div>
          <p className="pdp__tax">{settings.tax.enabled && settings.tax.inclusive ? t('product.taxIncl') : ''}</p>
          <p className="pdp__short">{p.shortDescription}</p>

          {colors.length > 0 && (
            <fieldset className="opt">
              <legend className="opt__label">
                {t('shop.color')}: <strong>{color}</strong>
              </legend>
              <div className="opt__swatches">
                {colors.map(([c, hex]) => (
                  <button key={c} type="button" className={`opt-swatch ${c === color ? 'is-active' : ''} ${!colorAvailable(c) ? 'is-unavailable' : ''}`} aria-pressed={c === color} aria-label={`${t('a11y.color', { name: c })}${!colorAvailable(c) ? ` — ${t('product.outOfStock')}` : ''}`} onClick={() => { setColor(c); setNotice(''); setQty(1); }}>
                    <span style={{ background: hex }} />
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {sizes.length > 0 && (
            <fieldset className="opt">
              <legend className="opt__label">
                {t('shop.size')}: <strong>{size || '—'}</strong>
              </legend>
              <div className="opt__sizes">
                {sizes.map((s) => {
                  const avail = sizeAvailable(s);
                  return (
                    <button key={s} type="button" className={`size-btn ${s === size ? 'is-active' : ''}`} aria-pressed={s === size} disabled={!avail} aria-label={avail ? s : `${s} — ${t('product.outOfStock')}`} onClick={() => { setSize(s); setNotice(''); setQty(1); }}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <p className={`stock ${canAdd ? (stock <= LOW_STOCK_THRESHOLD ? 'stock--low' : 'stock--in') : 'stock--out'}`} aria-live="polite" data-testid="stock-status">
            <span className="stock__dot" aria-hidden="true" />
            {needsSize ? t('product.selectOption', { option: t('shop.size').toLowerCase() }) : !variant ? t('product.unavailableCombo') : !variant.available ? t('product.outOfStock') : stock <= LOW_STOCK_THRESHOLD ? t('product.lowStock', { count: stock }) : t('product.inStock')}
          </p>

          <div className="pdp__buy">
            <QuantitySelector value={Math.min(qty, maxQty)} onChange={setQty} max={maxQty} disabled={!canAdd || inCart >= Math.min(stock, 10)} />
            <button className="btn btn--primary btn--lg pdp__add" onClick={onAdd} disabled={!variant?.available && !needsSize} data-testid="add-to-cart">
              <Icon name="bag" size={18} /> {variant && !variant.available ? t('product.outOfStock') : t('product.addToCart')}
            </button>
            <WishlistButton productId={p.id} name={name} className="wish-btn--lg" />
          </div>
          {notice && <FormAlert tone="warning">{notice}</FormAlert>}
          {inCart > 0 && (
            <p className="pdp__incart">
              <Icon name="check" size={16} /> {inCart} × <Link to="/cart">{t('nav.cart')}</Link>
            </p>
          )}

          <dl className="pdp__meta">
            <div>
              <dt>{t('product.sku')}</dt>
              <dd>{variant?.sku ?? p.sku}</dd>
            </div>
            {p.category && (
              <div>
                <dt>{t('shop.category')}</dt>
                <dd>
                  <Link to={`/category/${p.category.slug}`}>{L(p.category.name, p.category.nameMn)}</Link>
                </dd>
              </div>
            )}
          </dl>

          <div className="accordion">
            <details open>
              <summary>{t('product.description')}</summary>
              <div className="accordion__body prose">
                <p>{p.description}</p>
              </div>
            </details>
            {p.specs.length > 0 && (
              <details>
                <summary>{t('product.specs')}</summary>
                <div className="accordion__body">
                  <table className="specs">
                    <tbody>
                      {p.specs.map((s) => (
                        <tr key={s.label}>
                          <th scope="row">{s.label}</th>
                          <td>{s.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            <details>
              <summary>{t('product.shipping')}</summary>
              <div className="accordion__body">
                <p>{t('product.shippingBody', { fee: money(shipFee), threshold: money(settings.shipping.freeShippingThreshold), express: money(expressFee) })}</p>
                <Link to="/shipping">{t('footer.shipping')}</Link>
              </div>
            </details>
            <details>
              <summary>{t('product.returns')}</summary>
              <div className="accordion__body">
                <p>{t('product.returnsBody')}</p>
                <Link to="/returns">{t('footer.returns')}</Link>
              </div>
            </details>
          </div>

          <div className="pdp__share">
            <span>{t('product.share')}:</span>
            <button className="icon-btn icon-btn--sm" onClick={share} aria-label={t('product.copyLink')}>
              <Icon name="link" size={18} />
            </button>
            <a className="icon-btn icon-btn--sm" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`} target="_blank" rel="noopener noreferrer" aria-label={`Facebook ${t('a11y.newTab')}`}>
              <Icon name="facebook" size={18} />
            </a>
          </div>
        </div>
      </div>

      {data.related.length > 0 && (
        <section className="section" aria-labelledby="related-title">
          <h2 id="related-title" className="section-title">
            {t('product.related')}
          </h2>
          <ProductGrid items={data.related} />
        </section>
      )}
      {recentItems.length > 0 && (
        <section className="section section--flush" aria-labelledby="recent-title">
          <h2 id="recent-title" className="section-title">
            {t('product.recent')}
          </h2>
          <ProductGrid items={recentItems} />
        </section>
      )}
    </div>
  );
}
