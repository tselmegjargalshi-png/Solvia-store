import { useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { OrderStatusBadge } from '../../components/product.tsx';
import { Badge, ErrorState, LoadingState, TextField } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { useFormat } from '../../lib/format.ts';
import { useApi } from '../../lib/useApi.ts';
import { Link } from '../../router.tsx';
import { useToast } from '../../state/toast.tsx';
import { AdminDataTable, PageHeader } from './kit.tsx';

type C = { id: number; email: string; fullName: string; phone: string; role: string; status: string; createdAt: string; orders: number; spent: number };

export function Customers() {
  const { money, date } = useFormat();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, loading, error, reload } = useApi<{ customers: C[] }>(`/api/admin/customers?q=${encodeURIComponent(query)}`);
  return (
    <>
      <PageHeader title="Customers" sub="Accounts are created by customers. Administrators are managed with the create-admin script." />
      <form className="admin-filters" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
        <TextField label="Search name or email" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn--outline">Search</button>
      </form>
      {error ? <ErrorState onRetry={reload} /> : (
        <AdminDataTable
          rows={data?.customers ?? null}
          loading={loading}
          rowKey={(r) => r.id}
          empty="No accounts yet."
          columns={[
            { key: 'n', label: 'Name', render: (r) => <><Link to={`/admin/customers/${r.id}`} className="strong">{r.fullName}</Link><br /><span className="muted small">{r.email}</span></> },
            { key: 'r', label: 'Role', render: (r) => <Badge tone={r.role === 'admin' ? 'gold' : 'neutral'}>{r.role}</Badge> },
            { key: 's', label: 'Status', render: (r) => <Badge tone={r.status === 'active' ? 'success' : 'danger'}>{r.status}</Badge> },
            { key: 'o', label: 'Orders', className: 'num', render: (r) => r.orders },
            { key: 'sp', label: 'Ordered value', className: 'num', render: (r) => money(r.spent) },
            { key: 'j', label: 'Joined', render: (r) => date(r.createdAt) },
          ]}
        />
      )}
    </>
  );
}

export function CustomerDetail({ id }: { id: number }) {
  const { money, dateTime } = useFormat();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ customer: C; orders: any[] }>(`/api/admin/customers/${id}`);
  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState onRetry={reload} />;
  const c = data.customer;
  const toggle = async () => {
    try {
      await api(`/api/admin/customers/${id}`, { method: 'PATCH', body: { status: c.status === 'active' ? 'disabled' : 'active' } });
      toast({ tone: 'success', title: c.status === 'active' ? 'Account disabled and signed out' : 'Account re-enabled' });
      reload();
    } catch (e) {
      toast({ tone: 'error', title: (e as Error).message });
    }
  };
  return (
    <>
      <PageHeader
        title={c.fullName}
        sub={<>{c.email}{c.phone && <> · {c.phone}</>}</>}
        actions={
          <>
            <Link to="/admin/customers" className="btn btn--ghost"><Icon name="chevronLeft" size={16} /> Customers</Link>
            {c.role !== 'admin' && <button className={`btn ${c.status === 'active' ? 'btn--outline-danger' : 'btn--primary'}`} onClick={toggle}>{c.status === 'active' ? 'Disable account' : 'Enable account'}</button>}
          </>
        }
      />
      <section className="card">
        <h2 className="card__title">Order history</h2>
        <AdminDataTable
          rows={data.orders}
          rowKey={(r) => r.id}
          empty="No orders."
          columns={[
            { key: 'n', label: 'Order', render: (r) => <Link to={`/admin/orders/${r.id}`} className="mono">{r.number}</Link> },
            { key: 'd', label: 'Placed', render: (r) => dateTime(r.createdAt) },
            { key: 's', label: 'Status', render: (r) => <OrderStatusBadge status={r.status} /> },
            { key: 'p', label: 'Payment', render: (r) => <OrderStatusBadge status={r.paymentStatus} kind="payment" /> },
            { key: 't', label: 'Total', className: 'num', render: (r) => money(r.total) },
          ]}
        />
      </section>
    </>
  );
}
