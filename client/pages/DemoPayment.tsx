import { useState } from 'react';
import { Icon } from '../components/Icon.tsx';
import { ErrorState, FormAlert, LoadingState } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { api, ApiError } from '../lib/api.ts';
import { useFormat } from '../lib/format.ts';
import { useSeo } from '../lib/seo.ts';
import type { Order } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { useNavigate, useSearchParams } from '../router.tsx';

/**
 * Clearly labelled simulated payment step used when no live provider is configured.
 * It collects no card data; the server refuses these calls when live payments are on.
 */
export default function DemoPayment({ params }: { params: { number: string } }) {
  const { t } = useI18n();
  const { money } = useFormat();
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const token = qs.get('token') ?? '';
  useSeo({ title: t('demoPay.title'), noindex: true });
  const { data, error, loading, reload } = useApi<{ order: Order }>(`/api/orders/${encodeURIComponent(params.number)}?token=${encodeURIComponent(token)}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const go = async (outcome: 'success' | 'fail') => {
    setBusy(true);
    setErr('');
    try {
      await api('/api/payments/demo/confirm', { body: { number: params.number, token, outcome } });
      nav(`/order/${encodeURIComponent(params.number)}?token=${encodeURIComponent(token)}`, { replace: true });
    } catch (e) {
      setBusy(false);
      setErr(e instanceof ApiError && e.status === 403 ? t('demoPay.disabled') : e instanceof ApiError ? e.message : t('common.networkError'));
    }
  };

  if (loading) return <div className="container section"><LoadingState /></div>;
  if (error || !data) return <div className="container section"><ErrorState onRetry={reload} /></div>;
  const o = data.order;
  return (
    <div className="container section demo-pay">
      <div className="demo-pay__card">
        <p className="demo-pay__banner" role="note">
          <Icon name="alert" size={18} /> {t('demoPay.banner')}
        </p>
        <h1 className="page-title">{t('demoPay.title')}</h1>
        <p>{t('demoPay.body', { number: o.number, total: money(o.total) })}</p>
        {err && <FormAlert>{err}</FormAlert>}
        <div className="demo-pay__actions">
          <button className="btn btn--primary btn--lg" onClick={() => go('success')} disabled={busy || o.paymentStatus === 'paid'} data-testid="demo-pay-success">
            <Icon name="check" size={18} /> {t('demoPay.success')}
          </button>
          <button className="btn btn--outline" onClick={() => go('fail')} disabled={busy || o.paymentStatus === 'paid'}>
            {t('demoPay.fail')}
          </button>
        </div>
      </div>
    </div>
  );
}
