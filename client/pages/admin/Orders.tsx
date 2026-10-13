import { useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { Pagination } from '../../components/nav.tsx';
import { OrderView } from '../../components/OrderView.tsx';
import { OrderStatusBadge } from '../../components/product.tsx';
import { ConfirmationDialog, ErrorState, FormAlert, LoadingState, SelectField, TextField } from '../../components/ui.tsx';
import { api, ApiError } from '../../lib/api.ts';
import { useFormat } from '../../lib/format.ts';
import type { Order } from '../../lib/types.ts';
import { useApi } from '../../lib/useApi.ts';
import { Link, useSearchParams } from '../../router.tsx';
import { useToast } from '../../state/toast.tsx';
import { AdminDataTable, PageHeader } from './kit.tsx';

type Row = { id: number; number: string; fullName: string; email: string; total: number; status: string; paymentStatus: string; paymentMethod: string; cancelRequested: boolean; createdAt: string };
const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
const PAYMENTS = ['unpaid', 'pending', 'paid', 'failed', 'refunded'];
const METHOD: Record<string, string> = { card: 'Card', cod: 'Cash on delivery', bank_transfer: 'Bank transfer' };

export function OrdersList() {
  const { money, dateTime } = useFormat();
  const [qs, setQs] = useSearchParams();
  const [q, setQ] = useState(qs.get('q') ?? '');
  const params = new URLSearchParams();
  for (const k of ['q', 'status', 'payment', 'page']) if (qs.get(k)) params.set(k, qs.get(k)!);
  const { data, loading, error, reload } = useApi<{ orders: Row[]; total: number; page: number; pages: number }>(`/api/admin/orders?${params}`);
  return (
    <>
      <PageHeader title="Orders" sub={data ? `${data.total} orders` : undefined} />
      <form className="admin-filters" onSubmit={(e) => { e.preventDefault(); setQs({ q: q || null, page: null }); }}>
        <TextField label="Search number, name, email, phone" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        <SelectField label="Status" value={qs.get('status') ?? ''} onChange={(e) => setQs({ status: e.target.value || null, page: null })}>
          <option value="">All</option>
          <option value="cancel_requested">Cancellation requested</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </SelectField>
        <SelectField label="Payment" value={qs.get('payment') ?? ''} onChange={(e) => setQs({ payment: e.target.value || null, page: null })}>
          <option value="">All</option>
          {PAYMENTS.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </SelectField>
        <button className="btn btn--outline">Search</button>
      </form>
      {error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <>
          <AdminDataTable
            rows={data?.orders ?? null}
            loading={loading}
            rowKey={(r) => r.id}
            empty="No orders match."
            columns={[
              { key: 'n', label: 'Order', render: (r) => <><Link to={`/admin/orders/${r.id}`} className="mono strong">{r.number}</Link>{r.cancelRequested && <><br /><span className="badge badge--warning">Cancel requested</span></>}</> },
              { key: 'c', label: 'Customer', render: (r) => <>{r.fullName}<br /><span className="muted small">{r.email}</span></> },
              { key: 'd', label: 'Placed', render: (r) => dateTime(r.createdAt) },
              { key: 'm', label: 'Method', render: (r) => METHOD[r.paymentMethod] ?? r.paymentMethod },
              { key: 's', label: 'Status', render: (r) => <OrderStatusBadge status={r.status} /> },
              { key: 'p', label: 'Payment', render: (r) => <OrderStatusBadge status={r.paymentStatus} kind="payment" /> },
              { key: 't', label: 'Total', className: 'num', render: (r) => money(r.total) },
            ]}
          />
          {data && <Pagination page={data.page} pages={data.pages} onChange={(p) => setQs({ page: p > 1 ? String(p) : null })} />}
        </>
      )}
    </>
  );
}

export function OrderDetail({ id }: { id: number }) {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useApi<{ order: Order }>(`/api/admin/orders/${id}`);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<{ kind: 'status' | 'payment' | 'cancel'; value: string } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState onRetry={reload} />;
  const o = data.order;

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    setErr('');
    try {
      const url = pending.kind === 'status' ? `/api/admin/orders/${id}/status` : pending.kind === 'payment' ? `/api/admin/orders/${id}/payment` : `/api/admin/orders/${id}/cancel-request`;
      const body = pending.kind === 'status' ? { status: pending.value, note } : pending.kind === 'payment' ? { paymentStatus: pending.value, note } : { decision: pending.value, note };
      const r = await api<{ order: Order }>(url, { body });
      setData({ order: r.order });
      setNote('');
      toast({ tone: 'success', title: 'Order updated' });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Network error');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const describe = (p: NonNullable<typeof pending>) =>
    p.kind === 'status'
      ? p.value === 'cancelled'
        ? 'Cancel this order? Reserved stock is returned to inventory.'
        : `Move the order to “${p.value}”?`
      : p.kind === 'payment'
        ? p.value === 'refunded'
          ? 'Record a refund? This only records it here — process the actual refund with your payment provider or bank.'
          : `Record payment as “${p.value}”? Use this only after you have confirmed the money was received.`
        : p.value === 'approve'
          ? 'Approve the cancellation? The order will be cancelled and stock returned.'
          : 'Decline the cancellation request?';

  return (
    <>
      <PageHeader title={`Order ${o.number}`} sub={<>{o.fullName} · {o.email}</>} actions={<Link to="/admin/orders" className="btn btn--ghost"><Icon name="chevronLeft" size={16} /> Orders</Link>} />
      {err && <FormAlert>{err}</FormAlert>}
      <div className="editor-grid">
        <section className="card">
          <OrderView order={o} />
        </section>
        <aside className="stack">
          {o.cancelRequested && (
            <section className="card card--warn">
              <h2 className="card__title">Cancellation requested</h2>
              <p>{o.cancelReason || 'No reason given.'}</p>
              <div className="row-gap">
                <button className="btn btn--danger btn--sm" onClick={() => setPending({ kind: 'cancel', value: 'approve' })}>Approve</button>
                <button className="btn btn--outline btn--sm" onClick={() => setPending({ kind: 'cancel', value: 'reject' })}>Decline</button>
              </div>
            </section>
          )}
          <section className="card">
            <h2 className="card__title">Fulfilment</h2>
            <p className="small muted">Only valid next steps are offered.</p>
            {o.allowedStatuses?.length ? (
              <div className="btn-col">
                {o.allowedStatuses.map((s) => (
                  <button key={s} className={`btn btn--sm ${s === 'cancelled' ? 'btn--outline-danger' : 'btn--outline'}`} onClick={() => setPending({ kind: 'status', value: s })}>
                    Mark as {s}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">No further status changes.</p>
            )}
            {o.paymentMethod === 'card' && o.status === 'pending' && o.paymentStatus !== 'paid' && <p className="small muted">Card orders confirm automatically when the payment provider verifies payment.</p>}
          </section>
          <section className="card">
            <h2 className="card__title">Payment</h2>
            {o.payments.map((p, i) => (
              <p key={i} className="small">
                {p.provider} · {p.status}
                {p.isDemo && <span className="demo-flag demo-flag--inline">DEMO</span>}
                {p.note && <span className="muted"> — {p.note}</span>}
              </p>
            ))}
            {o.allowedPaymentStatuses?.length ? (
              <div className="btn-col">
                {o.allowedPaymentStatuses.map((s) => (
                  <button key={s} className="btn btn--outline btn--sm" onClick={() => setPending({ kind: 'payment', value: s })}>
                    {s === 'paid' ? 'Record payment received' : s === 'refunded' ? 'Record refund' : `Mark payment ${s}`}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted small">No manual payment actions available.</p>
            )}
          </section>
          <section className="card">
            <TextField label="Note for the next action (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </section>
        </aside>
      </div>
      <ConfirmationDialog open={!!pending} title="Confirm action" body={pending ? describe(pending) : ''} busy={busy} tone={pending?.value === 'cancelled' || pending?.value === 'approve' ? 'danger' : 'default'} onCancel={() => setPending(null)} onConfirm={run} />
    </>
  );
}
