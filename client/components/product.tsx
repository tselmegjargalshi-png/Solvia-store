import { useState } from 'react';
import { MAX_QTY_PER_LINE } from '../../config/brand.ts';
import { useLocalized, useT } from '../i18n/index.tsx';
import { useFormat } from '../lib/format.ts';
import type { ProductCard as Card } from '../lib/types.ts';
import { Link } from '../router.tsx';
import { useToast } from '../state/toast.tsx';
import { useWishlist } from '../state/wishlist.tsx';
import { Icon } from './Icon.tsx';
import { Badge } from './ui.tsx';

/** Generated catalog images ship in 480/800/1200 widths; uploads are a single size. */
export function srcSetFor(url: string) {
  if (!/^\/images\/(products|blog)\/[^/]+\.webp$/.test(url)) return undefined;
  const base = url.replace(/\.webp$/, '');
  if (url.includes('/blog/')) return `${base}-600.webp 600w, ${base}-1000.webp 1000w, ${url} 1600w`;
  return `${base}-480.webp 480w, ${base}-800.webp 800w, ${url} 1200w`;
}

export function ProductImage({ src, alt, sizes = '(max-width: 640px) 50vw, 25vw', className = '', eager = false, aspect = '4 / 5' }: { src?: string; alt: string; sizes?: string; className?: string; eager?: boolean; aspect?: string }) {
  const [failed, setFailed] = useState(false);
  const t = useT();
  if (!src || failed) {
    return (
      <div className={`img-fallback ${className}`} style={{ aspectRatio: aspect }} role="img" aria-label={alt || t('product.noImage')}>
        <Icon name="box" size={28} />
        <span>{t('product.noImage')}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      srcSet={srcSetFor(src)}
      sizes={sizes}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
      width={1200}
      height={1500}
      className={className}
      style={{ aspectRatio: aspect }}
      onError={() => setFailed(true)}
    />
  );
}

export function PriceDisplay({ price, compareAt, from = false, size = 'md' }: { price: number; compareAt?: number | null; from?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const { money } = useFormat();
  const t = useT();
  const onSale = compareAt != null && compareAt > price;
  return (
    <p className={`price price--${size}`}>
      {from && <span className="price__from">{t('product.from')} </span>}
      <span className={`price__now ${onSale ? 'price__now--sale' : ''}`}>{money(price)}</span>
      {onSale && (
        <>
          <span className="sr-only">,</span>
          <s className="price__was" aria-label={`${money(compareAt!)}`}>
            {money(compareAt!)}
          </s>
        </>
      )}
    </p>
  );
}

export function QuantitySelector({ value, onChange, max = MAX_QTY_PER_LINE, min = 1, label, size = 'md', disabled }: { value: number; onChange: (n: number) => void; max?: number; min?: number; label?: string; size?: 'sm' | 'md'; disabled?: boolean }) {
  const t = useT();
  const cap = Math.max(min, Math.min(max, MAX_QTY_PER_LINE));
  const set = (n: number) => onChange(Math.max(min, Math.min(cap, Math.floor(n) || min)));
  return (
    <div className={`qty qty--${size}`} role="group" aria-label={label ?? t('product.quantity')}>
      <button type="button" className="qty__btn" onClick={() => set(value - 1)} disabled={disabled || value <= min} aria-label={t('product.decrease')}>
        <Icon name="minus" size={16} />
      </button>
      <input
        className="qty__input"
        type="number"
        inputMode="numeric"
        min={min}
        max={cap}
        value={value}
        disabled={disabled}
        aria-label={label ?? t('product.quantity')}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value === '') return;
          set(n);
        }}
      />
      <button type="button" className="qty__btn" onClick={() => set(value + 1)} disabled={disabled || value >= cap} aria-label={t('product.increase')}>
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

export function WishlistButton({ productId, name, className = '' }: { productId: number; name: string; className?: string }) {
  const wl = useWishlist();
  const t = useT();
  const toast = useToast();
  const active = wl.has(productId);
  return (
    <button
      type="button"
      className={`wish-btn ${active ? 'is-active' : ''} ${className}`}
      aria-pressed={active}
      aria-label={`${active ? t('product.wishlistRemove') : t('product.wishlistAdd')}: ${name}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const added = wl.toggle(productId);
        toast({ title: added ? t('wishlist.added') : t('wishlist.removed'), body: name, tone: 'success', action: added ? { label: t('nav.wishlist'), href: '/wishlist' } : undefined });
      }}
    >
      <Icon name="heart" size={18} />
    </button>
  );
}

export function ProductCard({ p, eager = false }: { p: Card; eager?: boolean }) {
  const t = useT();
  const L = useLocalized();
  const name = L(p.name, p.nameMn);
  return (
    <article className="pcard">
      <Link to={`/product/${p.slug}`} className="pcard__media" tabIndex={-1} aria-hidden="true">
        <ProductImage src={p.images[0]?.url} alt="" eager={eager} sizes="(max-width: 640px) 50vw, (max-width: 1100px) 33vw, 25vw" className="pcard__img" />
        {p.images[1] && <ProductImage src={p.images[1].url} alt="" sizes="(max-width: 640px) 50vw, 25vw" className="pcard__img pcard__img--alt" />}
      </Link>
      <div className="pcard__badges">
        {p.onSale && <Badge tone="gold">{t('product.sale')}</Badge>}
        {!p.inStock && <Badge tone="neutral">{t('product.outOfStock')}</Badge>}
      </div>
      <WishlistButton productId={p.id} name={name} className="pcard__wish" />
      <div className="pcard__body">
        {p.brand && <p className="pcard__brand">{p.brand.name}</p>}
        <h3 className="pcard__title">
          <Link to={`/product/${p.slug}`} className="pcard__link">
            {name}
          </Link>
        </h3>
        <PriceDisplay price={p.priceFrom} compareAt={p.compareAt} from={p.priceVaries} size="sm" />
        {p.colors.length > 1 && (
          <ul className="pcard__swatches" aria-label={t('shop.color')}>
            {p.colors.slice(0, 5).map((c) => (
              <li key={c.name} className="swatch-dot" style={{ background: c.hex }} title={c.name}>
                <span className="sr-only">{c.name}</span>
              </li>
            ))}
            {p.colors.length > 5 && <li className="pcard__more">+{p.colors.length - 5}</li>}
          </ul>
        )}
      </div>
    </article>
  );
}

export function ProductGrid({ items, eagerCount = 0, cols = 4 }: { items: Card[]; eagerCount?: number; cols?: 3 | 4 }) {
  return (
    <ul className={`pgrid pgrid--${cols}`}>
      {items.map((p, i) => (
        <li key={p.id}>
          <ProductCard p={p} eager={i < eagerCount} />
        </li>
      ))}
    </ul>
  );
}

const STATUS_TONE: Record<string, 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'info' | 'navy'> = {
  pending: 'warning',
  confirmed: 'info',
  processing: 'info',
  shipped: 'navy',
  delivered: 'success',
  cancelled: 'neutral',
  refunded: 'neutral',
  unpaid: 'neutral',
  paid: 'success',
  failed: 'danger',
};
export function OrderStatusBadge({ status, kind = 'order' }: { status: string; kind?: 'order' | 'payment' }) {
  const t = useT();
  const key = (kind === 'order' ? `status.${status}` : `pay.${status}`) as any;
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{t(key)}</Badge>;
}
