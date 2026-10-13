import { Icon } from '../../components/Icon.tsx';
import { OrderStatusBadge } from '../../components/product.tsx';
import { ErrorState, LoadingState } from '../../components/ui.tsx';
import { useFormat } from '../../lib/format.ts';
import { useApi } from '../../lib/useApi.ts';
import { Link } from '../../router.tsx';
import { AdminDataTable, Kpi, PageHeader } from './kit.tsx';

type Dash = {
  totals: { orders: number; revenuePaid: number; revenueDemo: number; grossOrdered: number; pendingOrders: number; cancelRequests: number; products: number; activeProducts: number; customers: number; subscribers: number; messages: number };
  lowStock: { variantId: number; productId: number; sku: string; name: string; label: string; stock: number }[];
  recentOrders: { id: number; number: string; fullName: string; total: number; status: string; paymentStatus: string; createdAt: string }[];
  salesByDay: { date: string; orders: number; total: number }[];
  lowStockThreshold: number;
};

function SalesChart({ days }: { days: Dash['salesByDay'] }) {
  const { money, date } = useFormat();
  const max = Math.max(1, ...days.map((d) => d.total));
  const W = 700;
  const H = 200;
  const bw = W / days.length;
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-labelledby="chart-title chart-desc" className="chart__svg">
        <title id="chart-title">Order value per day, last 14 days</title>
        <desc id="chart-desc">Bar chart. The table below lists the same values.</desc>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1="0" x2={W} y1={H - g * H} y2={H - g * H} className="chart__grid" />
        ))}
        {days.map((d, i) => {
          const h = (d.total / max) * (H - 8);
          return (
            <g key={d.date}>
              <rect x={i * bw + bw * 0.18} y={H - h} width={bw * 0.64} height={Math.max(h, d.total ? 2 : 0)} rx="3" className="chart__bar">
                <title>{`${date(d.date)}: ${money(d.total)} (${d.orders} orders)`}</title>
              </rect>
              {i % 2 === 0 && (
                <text x={i * bw + bw / 2} y={H + 18} textAnchor="middle" className="chart__label">
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <details className="chart__table">
        <summary>Show data table</summary>
        <table className="table table--compact">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col" className="num">Orders</th>
              <th scope="col" className="num">Value</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{date(d.date)}</td>
                <td className="num">{d.orders}</td>
                <td className="num">{money(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export default function Dashboard() {
  const { money, dateTime } = useFormat();
  const { data, error, loading, reload } = useApi<Dash>('/api/admin/dashboard');
  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState onRetry={reload} />;
  const tt = data.totals;
  return (
    <>
      <PageHeader title="Dashboard" sub="Figures come straight from the order and product tables — nothing here is estimated." />
      <div className="kpis">
        <Kpi label="Total orders" value={tt.orders} hint={`${tt.pendingOrders} pending`} />
        <Kpi label="Revenue (verified paid)" value={money(tt.revenuePaid)} hint="Real payments only" tone="gold" />
        <Kpi label="Demo-mode payments" value={money(tt.revenueDemo)} hint="Simulated — not real money" />
        <Kpi label="Ordered value (excl. cancelled)" value={money(tt.grossOrdered)} hint="Includes unpaid COD / transfer" />
        <Kpi label="Products" value={`${tt.activeProducts} / ${tt.products}`} hint="Active / total" />
        <Kpi label="Low-stock variants" value={data.lowStock.length} hint={`≤ ${data.lowStockThreshold} units`} tone={data.lowStock.length ? 'warn' : undefined} />
      </div>
      {tt.cancelRequests > 0 && (
        <Link to="/admin/orders?status=cancel_requested" className="alert alert--warning alert--link">
          <Icon name="alert" size={18} /> {tt.cancelRequests} cancellation request(s) need review
        </Link>
      )}
      <div className="admin-grid">
        <section className="card">
          <h2 className="card__title">Sales overview</h2>
          <SalesChart days={data.salesByDay} />
        </section>
        <section className="card">
          <h2 className="card__title">Low stock</h2>
          {data.lowStock.length === 0 ? (
            <p className="muted">All active variants are above the threshold.</p>
          ) : (
            <ul className="low-stock">
              {data.lowStock.map((v) => (
                <li key={v.variantId}>
                  <Link to={`/admin/products/${v.productId}`}>
                    {v.name}
                    {v.label && <span className="muted"> · {v.label}</span>}
                  </Link>
                  <span className={`badge ${v.stock === 0 ? 'badge--danger' : 'badge--warning'}`}>{v.stock === 0 ? 'Out' : `${v.stock} left`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="card">
        <div className="row-between">
          <h2 className="card__title">Recent orders</h2>
          <Link to="/admin/orders" className="link-arrow">
            All orders <Icon name="arrowRight" size={16} />
          </Link>
        </div>
        <AdminDataTable
          rows={data.recentOrders}
          rowKey={(r) => r.id}
          empty="No orders yet."
          columns={[
            { key: 'n', label: 'Order', render: (r) => <Link to={`/admin/orders/${r.id}`} className="mono">{r.number}</Link> },
            { key: 'c', label: 'Customer', render: (r) => r.fullName },
            { key: 'd', label: 'Date', render: (r) => dateTime(r.createdAt) },
            { key: 's', label: 'Status', render: (r) => <OrderStatusBadge status={r.status} /> },
            { key: 'p', label: 'Payment', render: (r) => <OrderStatusBadge status={r.paymentStatus} kind="payment" /> },
            { key: 't', label: 'Total', className: 'num', render: (r) => money(r.total) },
          ]}
        />
      </section>
    </>
  );
}
