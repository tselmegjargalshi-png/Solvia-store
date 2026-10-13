import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon.tsx';
import { OrderView } from '../components/OrderView.tsx';
import { EmptyState, ErrorState, FormAlert, LoadingState } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { api, ApiError } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { useFormat } from '../lib/format.ts';
import { useSeo } from '../lib/seo.ts';
import type { Order } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { Link, useNavigate, useSearchParams } from '../router.tsx';
import { useAuth } from '../state/auth.tsx';

export default function OrderConfirmation({ params }: { params: { number: string } }) {
  const { t } = useI18n();
  const { money, dateTime } = useFormat();
  const { user } = useAuth();
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const token = qs.get('token') ?? '';
  useSeo({ title: t('order.number'), noindex: true });
  const { data, error, loading, reload } = useApi<{ order: Order }>(`/api/orders/${encodeURIComponent(params.number)}?token=${encodeURIComponent(token)}`);
  const [payErr, setPayErr] = useState('');
  const tracked = useRef(false);
  const o = data?.order;

  // Card payments confirmed by webhook may land a moment after the redirect: poll briefly.
  useEffect(() => {
    if (!o || o.paymentMethod !== 'card' || o.paymentStatus !== 'pending' || qs.get('payment') !== 'return') return;
    const id = setTimeout(reload, 3000);
    return () => clearTimeout(id);
  }, [o?.paymentStatus]);

  // "purchase" is only sent once payment is verified as paid — never for unpaid orders, and never for
  // simulated demo payments (they would put fake revenue into analytics).
  useEffect(() => {
    if (o && o.paymentStatus === 'paid' && !o.isDemoPayment && !tracked.current) {
      tracked.current = true;
      track('purchase', { transaction_id: o.number, currency: o.currency, value: o.total, shipping: o.shippingFee, tax: o.tax, demo: o.isDemoPayment, items: o.items.map((i) => ({ item_id: i.sku, price: i.unitPrice, quantity: i.quantity })) });
    }
  }, [o?.paymentStatus]);

  if (loading && !o) return <div className="container section"><LoadingState /></div>;
  if (error?.status === 404) return <div className="container section"><EmptyState icon="alert" title={t('order.notFound')} action={<Link to="/" className="btn btn--primary">{t('common.backHome')}</Link>} /></div>;
  if (error || !o) return <div className="container section"><ErrorState onRetry={reload} /></div>;

  const next =
    o.paymentMethod === 'card'
      ? o.paymentStatus === 'paid'
        ? o.isDemoPayment
          ? t('order.next.card_demo')
          : t('order.next.card_paid')
        : o.paymentStatus === 'failed'
          ? t('order.next.card_failed')
          : t('order.next.card_pending')
      : t(`order.next.${o.paymentMethod}` as any, { total: money(o.total), number: o.number });
  const canRetry = o.paymentMethod === 'card' && o.status === 'pending' && ['pending', 'failed'].includes(o.paymentStatus) && token && (!o.reservedUntil || new Date(o.reservedUntil) > new Date());

  const retry = async () => {
    setPayErr('');
    try {
      const r = await api<{ payment: { redirectUrl: string } }>(`/api/orders/${encodeURIComponent(o.number)}/pay`, { body: { token } });
      if (r.payment.redirectUrl.startsWith('/')) nav(r.payment.redirectUrl);
      else window.location.href = r.payment.redirectUrl;
    } catch (e) {
      setPayErr(e instanceof ApiError ? e.message : t('common.networkError'));
    }
  };

  return (
    <div className="container section confirm">
      <div className="confirm__head">
        <span className={`confirm__icon ${o.status === 'cancelled' ? 'is-muted' : ''}`}>
          <Icon name={o.status === 'cancelled' ? 'alert' : 'check'} size={28} />
        </span>
        <div>
          <h1 className="page-title">{t('order.thanks', { name: o.fullName.split(' ')[0] })}</h1>
          <p className="page-lede" role="status">
            {t('order.received', { number: o.number })}
          </p>
        </div>
      </div>
      <FormAlert tone={o.paymentStatus === 'failed' ? 'warning' : 'info'}>
        {next}
        {o.reservedUntil && o.paymentStatus !== 'paid' && o.status === 'pending' && <> {t('order.reservedUntil', { time: dateTime(o.reservedUntil) })}</>}
      </FormAlert>
      {canRetry && (
        <button className="btn btn--primary" onClick={retry}>
          <Icon name="card" size={18} /> {t('order.payNow')}
        </button>
      )}
      {payErr && <FormAlert>{payErr}</FormAlert>}
      <OrderView order={o} />
      <p className="muted confirm__save">
        {user ? (
          <Link to="/account/orders" className="link-arrow">
            {t('order.viewOrders')} <Icon name="arrowRight" size={16} />
          </Link>
        ) : (
          t('order.saveLink')
        )}
      </p>
    </div>
  );
}
