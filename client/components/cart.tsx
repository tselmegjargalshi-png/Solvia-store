import { useState, type ReactNode } from 'react';
import { useI18n, useLocalized } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { useFormat } from '../lib/format.ts';
import type { Product, Quote, QuoteLine } from '../lib/types.ts';
import { Link } from '../router.tsx';
import { useCart } from '../state/cart.tsx';
import { Icon } from './Icon.tsx';
import { PriceDisplay, ProductImage, QuantitySelector } from './product.tsx';

export function CartItem({ line, compact = false }: { line: QuoteLine; compact?: boolean }) {
  const { t } = useI18n();
  const L = useLocalized();
  const { money } = useFormat();
  const cart = useCart();
  const [options, setOptions] = useState<Product['variants'] | null>(null);
  const name = L(line.name, line.nameMn);

  const loadOptions = async () => {
    if (options) return setOptions(null);
    try {
      const r = await api<{ product: Product }>(`/api/products/${line.slug}`);
      setOptions(r.product.variants.filter((v) => v.active));
    } catch {
      setOptions([]);
    }
  };

  return (
    <li className={`cart-line ${compact ? 'cart-line--compact' : ''}`} data-testid="cart-line">
      <Link to={`/product/${line.slug}`} className="cart-line__img" tabIndex={-1} aria-hidden="true">
        <ProductImage src={line.image} alt="" sizes="120px" />
      </Link>
      <div className="cart-line__info">
        <h3 className="cart-line__name">
          <Link to={`/product/${line.slug}`}>{name}</Link>
        </h3>
        {line.variantLabel && <p className="cart-line__variant">{line.variantLabel}</p>}
        <div className="cart-line__unit">
          <span className="sr-only">{t('cart.unitPrice')}: </span>
          <PriceDisplay price={line.unitPrice} compareAt={line.compareAt} size="sm" />
        </div>
        {!compact && line.variantLabel && (
          <button className="link-btn link-btn--sm" onClick={loadOptions} aria-expanded={!!options}>
            {t('cart.changeOption')}
          </button>
        )}
        {options && options.length > 0 && (
          <label className="cart-line__swap">
            <span className="sr-only">{t('cart.changeOption')}</span>
            <select
              className="input input--sm"
              value={line.variantId}
              onChange={(e) => {
                cart.replaceVariant(line.variantId, Number(e.target.value));
                setOptions(null);
              }}
            >
              {options.map((v) => (
                <option key={v.id} value={v.id} disabled={!v.available}>
                  {[v.color, v.size].filter(Boolean).join(' / ')} — {money(v.price)}
                  {!v.available ? ` (${t('product.outOfStock')})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="cart-line__qty">
        {compact ? (
          <span className="cart-line__q">× {line.quantity}</span>
        ) : (
          <QuantitySelector size="sm" value={line.quantity} max={Math.min(line.stock, 10)} onChange={(n) => cart.setQuantity(line.variantId, n)} label={`${t('product.quantity')}: ${name}`} />
        )}
      </div>
      <p className="cart-line__total">
        <span className="sr-only">{t('cart.lineTotal')}: </span>
        {money(line.lineTotal)}
      </p>
      {!compact && (
        <button className="icon-btn icon-btn--sm cart-line__remove" onClick={() => cart.remove(line.variantId)} aria-label={t('cart.removeItem', { name })}>
          <Icon name="trash" size={18} />
        </button>
      )}
    </li>
  );
}

export function CartSummary({ quote, showCoupon = true, shippingLabel, children }: { quote: Quote; showCoupon?: boolean; shippingLabel?: string; children?: ReactNode }) {
  const { t } = useI18n();
  const { money } = useFormat();
  const cart = useCart();
  const [code, setCode] = useState(cart.couponCode);
  const apply = () => code.trim() && cart.setCoupon(code);
  const remaining = quote.freeShippingThreshold - (quote.subtotal - quote.discount);
  const couponMsg = quote.couponError?.startsWith('min_subtotal:') ? t('cart.couponMin', { amount: money(Number(quote.couponError.split(':')[1])) }) : quote.couponError;

  return (
    <section className="summary" aria-labelledby="summary-title">
      <h2 id="summary-title" className="summary__title">
        {t('cart.summary')}
      </h2>
      {showCoupon && (
        <div className="coupon">
          <label htmlFor="coupon" className="field__label">
            {t('cart.coupon')}
          </label>
          <div className="coupon__row">
            <input id="coupon" className="input input--sm" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }} autoComplete="off" aria-describedby="coupon-msg" maxLength={40} />
            {quote.coupon ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setCode('');
                  cart.setCoupon('');
                }}
              >
                {t('cart.removeCoupon')}
              </button>
            ) : (
              <button type="button" className="btn btn--outline btn--sm" disabled={!code.trim()} onClick={apply}>
                {t('cart.applyCoupon')}
              </button>
            )}
          </div>
          <p id="coupon-msg" className={quote.coupon ? 'field__ok' : couponMsg ? 'field__error' : 'sr-only'} aria-live="polite">
            {quote.coupon ? t('cart.couponApplied', { code: quote.coupon.code }) : couponMsg ?? ''}
          </p>
        </div>
      )}
      <dl className="totals" data-testid="totals">
        <div>
          <dt>{t('cart.subtotal')}</dt>
          <dd data-testid="subtotal">{money(quote.subtotal)}</dd>
        </div>
        {quote.discount > 0 && (
          <div className="totals__discount">
            <dt>
              {t('cart.discount')} {quote.coupon && <span className="tag-code">{quote.coupon.code}</span>}
            </dt>
            <dd data-testid="discount">−{money(quote.discount)}</dd>
          </div>
        )}
        <div>
          <dt>
            {t('cart.shipping')}
            {shippingLabel && <span className="totals__hint">{shippingLabel}</span>}
          </dt>
          <dd data-testid="shipping">{quote.shippingMethod ? (quote.shippingFee === 0 ? t('cart.free') : money(quote.shippingFee)) : t('cart.shippingEstimate')}</dd>
        </div>
        {quote.taxRate > 0 && !quote.taxInclusive && (
          <div>
            <dt>{t('cart.tax', { label: quote.taxLabel, rate: quote.taxRate })}</dt>
            <dd>{money(quote.tax)}</dd>
          </div>
        )}
        <div className="totals__grand">
          <dt>{t('cart.total')}</dt>
          <dd data-testid="total">{money(quote.total)}</dd>
        </div>
        {quote.taxRate > 0 && quote.taxInclusive && (
          <div className="totals__note">
            <dt>{t('cart.taxIncluded', { label: quote.taxLabel, rate: quote.taxRate })}</dt>
            <dd data-testid="tax">{money(quote.tax)}</dd>
          </div>
        )}
      </dl>
      {quote.freeShippingThreshold > 0 && quote.lines.length > 0 && (
        <p className="summary__ship">
          <Icon name="truck" size={16} /> {remaining > 0 ? t('cart.freeShippingHint', { amount: money(remaining) }) : t('cart.freeShippingReached')}
        </p>
      )}
      {children}
    </section>
  );
}

export function CartNotices() {
  const { t } = useI18n();
  const cart = useCart();
  if (!cart.notices.length) return null;
  return (
    <div className="alert alert--warning" role="alert">
      <Icon name="alert" size={18} />
      <div>
        <ul className="plain">
          {cart.notices.map((n, i) => (
            <li key={i}>{n.name ? t(`cart.issue.${n.type}` as any, { name: n.name, available: n.available ?? 0 }) : t('cart.issue.generic')}</li>
          ))}
        </ul>
        <button className="link-btn" onClick={cart.dismissNotices}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
