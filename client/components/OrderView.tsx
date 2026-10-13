import { useI18n, useLocalized } from '../i18n/index.tsx';
import { useFormat } from '../lib/format.ts';
import type { Order } from '../lib/types.ts';
import { useSettings } from '../state/settings.tsx';
import { Icon } from './Icon.tsx';
import { OrderStatusBadge, ProductImage } from './product.tsx';

/** Read-only order detail shared by the confirmation page, account order page and admin. */
export function OrderView({ order, showTimeline = true }: { order: Order; showTimeline?: boolean }) {
  const { t } = useI18n();
  const L = useLocalized();
  const { money, dateTime } = useFormat();
  const settings = useSettings();
  const method = settings.shipping.methods.find((m) => m.code === order.shippingMethod);
  return (
    <div className="order-view">
      <dl className="order-meta">
        <div>
          <dt>{t('order.number')}</dt>
          <dd className="mono">{order.number}</dd>
        </div>
        <div>
          <dt>{t('order.date')}</dt>
          <dd>
            <time dateTime={order.createdAt}>{dateTime(order.createdAt)}</time>
          </dd>
        </div>
        <div>
          <dt>{t('order.status')}</dt>
          <dd>
            <OrderStatusBadge status={order.status} />
          </dd>
        </div>
        <div>
          <dt>{t('order.paymentStatus')}</dt>
          <dd>
            <OrderStatusBadge status={order.paymentStatus} kind="payment" />
            {order.isDemoPayment && <span className="demo-flag demo-flag--inline">{t('common.demo')}</span>}
          </dd>
        </div>
      </dl>
      {order.isDemoPayment && (
        <p className="alert alert--warning">
          <Icon name="info" size={18} /> {t('order.demoPaid')}
        </p>
      )}

      <div className="order-cols">
        <section>
          <h2 className="h-sub">{t('order.items')}</h2>
          <ul className="order-items">
            {order.items.map((it, i) => (
              <li key={i} className="order-item">
                <ProductImage src={it.image} alt="" sizes="72px" className="order-item__img" />
                <div className="order-item__info">
                  <strong>{it.name}</strong>
                  {it.variantLabel && <span>{it.variantLabel}</span>}
                  <span className="muted">
                    {it.quantity} × {money(it.unitPrice)}
                  </span>
                </div>
                <span className="order-item__total">{money(it.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="totals totals--plain">
            <div>
              <dt>{t('cart.subtotal')}</dt>
              <dd>{money(order.subtotal)}</dd>
            </div>
            {order.discount > 0 && (
              <div className="totals__discount">
                <dt>
                  {t('cart.discount')} {order.couponCode && <span className="tag-code">{order.couponCode}</span>}
                </dt>
                <dd>−{money(order.discount)}</dd>
              </div>
            )}
            <div>
              <dt>{t('cart.shipping')}</dt>
              <dd>{order.shippingFee === 0 ? t('cart.free') : money(order.shippingFee)}</dd>
            </div>
            {!order.taxInclusive && order.tax > 0 && (
              <div>
                <dt>{settings.tax.label}</dt>
                <dd>{money(order.tax)}</dd>
              </div>
            )}
            <div className="totals__grand">
              <dt>{t('cart.total')}</dt>
              <dd>{money(order.total)}</dd>
            </div>
            {order.taxInclusive && order.tax > 0 && (
              <div className="totals__note">
                <dt>{t('cart.taxIncluded', { label: settings.tax.label, rate: settings.tax.rate })}</dt>
                <dd>{money(order.tax)}</dd>
              </div>
            )}
          </dl>
        </section>
        <section className="order-side">
          <h2 className="h-sub">{t('order.shipTo')}</h2>
          <address className="addr">
            {order.fullName}
            <br />
            {order.shippingAddress.address}
            <br />
            {order.shippingAddress.city}
            {order.shippingAddress.postalCode && `, ${order.shippingAddress.postalCode}`}
            <br />
            {order.shippingAddress.country}
            <br />
            {order.phone}
            <br />
            {order.email}
          </address>
          {order.deliveryNotes && <p className="muted">“{order.deliveryNotes}”</p>}
          <h2 className="h-sub">{t('order.method')}</h2>
          <p>{method ? L(method.name, method.nameMn) : order.shippingMethod}</p>
          <h2 className="h-sub">{t('order.paymentMethod')}</h2>
          <p>{t(`checkout.pay.${order.paymentMethod}` as any)}</p>
          {showTimeline && order.events.length > 0 && (
            <>
              <h2 className="h-sub">{t('order.timeline')}</h2>
              <ol className="timeline">
                {order.events.map((e, i) => (
                  <li key={i}>
                    <time dateTime={e.createdAt}>{dateTime(e.createdAt)}</time>
                    <span>{e.message}</span>
                    {e.actor && <span className="muted"> — {e.actor}</span>}
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
