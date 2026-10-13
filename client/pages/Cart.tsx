import { useEffect } from 'react';
import { CartItem, CartNotices, CartSummary } from '../components/cart.tsx';
import { Icon } from '../components/Icon.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { track } from '../lib/analytics.ts';
import { useSeo } from '../lib/seo.ts';
import { Link } from '../router.tsx';
import { useCart } from '../state/cart.tsx';
import { useSettings } from '../state/settings.tsx';
import { useLocalized } from '../i18n/index.tsx';

export default function CartPage() {
  const { t } = useI18n();
  const cart = useCart();
  const settings = useSettings();
  const L = useLocalized();
  const std = settings.shipping.methods.find((m) => m.code === cart.shippingMethod);
  useSeo({ title: t('cart.title'), noindex: true });
  useEffect(() => {
    if (cart.quote) track('view_cart', { currency: cart.quote.currency, value: cart.quote.total, items: cart.quote.lines.map((l) => ({ item_id: l.sku, price: l.unitPrice, quantity: l.quantity })) });
  }, [!!cart.quote]);

  return (
    <div className="container section cart-page">
      <h1 className="page-title">{t('cart.title')}</h1>
      <CartNotices />
      {cart.items.length === 0 ? (
        <EmptyState
          icon="bag"
          title={t('cart.empty')}
          body={t('cart.emptyBody')}
          action={
            <Link to="/shop" className="btn btn--primary">
              {t('cart.continue')}
            </Link>
          }
        />
      ) : cart.quoteError && !cart.quote ? (
        <ErrorState body={t('common.networkError')} onRetry={cart.refreshQuote} />
      ) : !cart.quote ? (
        <LoadingState label={t('cart.updating')} />
      ) : (
        <div className="cart-layout" aria-busy={cart.quoting}>
          <div>
            <ul className="cart-lines">
              {cart.quote.lines.map((l) => (
                <CartItem key={l.variantId} line={l} />
              ))}
            </ul>
            <Link to="/shop" className="link-arrow link-arrow--back">
              <Icon name="chevronLeft" size={16} /> {t('cart.continue')}
            </Link>
          </div>
          <CartSummary quote={cart.quote} shippingLabel={std ? ` · ${L(std.name, std.nameMn)}` : undefined}>
            <Link to="/checkout" className={`btn btn--primary btn--lg btn--block ${cart.quoting ? 'is-disabled' : ''}`} aria-disabled={cart.quoting} data-testid="checkout-link">
              {t('cart.checkout')} <Icon name="arrowRight" size={18} />
            </Link>
            <p className="summary__note">
              <Icon name="shield" size={16} /> {t('cart.pricesNote')}
            </p>
          </CartSummary>
        </div>
      )}
    </div>
  );
}
