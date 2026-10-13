import type { ReactNode } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { EmptyState, LoadingState } from '../../components/ui.tsx';
import { NavLink } from '../../router.tsx';
import { useSettings } from '../../state/settings.tsx';

const NAV: [string, string, string][] = [
  ['/admin', 'chart', 'Dashboard'],
  ['/admin/orders', 'box', 'Orders'],
  ['/admin/products', 'tag', 'Products'],
  ['/admin/categories', 'grid', 'Categories'],
  ['/admin/brands', 'list', 'Brands'],
  ['/admin/customers', 'users', 'Customers'],
  ['/admin/coupons', 'card', 'Coupons'],
  ['/admin/blog', 'file', 'Blog'],
  ['/admin/faqs', 'help', 'FAQs'],
  ['/admin/messages', 'mail', 'Messages'],
  ['/admin/settings', 'settings', 'Settings'],
];

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const s = useSettings();
  return (
    <div className="admin-side">
      <div className="admin-side__brand">
        <span className="logo__word logo__word--light">{s.storeName}</span>
        <span className="admin-side__tag">Admin</span>
      </div>
      <nav aria-label="Admin">
        {NAV.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === '/admin'} className="admin-link" onClick={onNavigate}>
            <Icon name={icon} size={18} /> {label}
          </NavLink>
        ))}
      </nav>
      <NavLink to="/" className="admin-link admin-link--muted">
        <Icon name="arrowRight" size={18} /> View store
      </NavLink>
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="admin-head">
      <div>
        <h1 className="admin-title">{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {actions && <div className="admin-head__actions">{actions}</div>}
    </header>
  );
}

export type Column<T> = { key: string; label: string; render: (row: T) => ReactNode; className?: string };

/** Responsive data table: scrolls horizontally inside its card on narrow screens. */
export function AdminDataTable<T>({ columns, rows, rowKey, loading, empty = 'Nothing here yet.', caption }: { columns: Column<T>[]; rows: T[] | null; rowKey: (r: T) => string | number; loading?: boolean; empty?: string; caption?: string }) {
  if (loading && !rows) return <LoadingState />;
  if (rows && !rows.length) return <EmptyState icon="list" title={empty} />;
  return (
    <div className={`table-wrap ${loading ? 'is-refreshing' : ''}`}>
      <table className="table table--admin">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.className}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} className={c.className} data-label={c.label}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'gold' | 'warn' }) {
  return (
    <div className={`kpi ${tone ? `kpi--${tone}` : ''}`}>
      <p className="kpi__label">{label}</p>
      <p className="kpi__value">{value}</p>
      {hint && <p className="kpi__hint">{hint}</p>}
    </div>
  );
}

/** Extract { fields } from an ApiError for forms. */
export function fieldErrors(e: any): Record<string, string> {
  return e?.fields && Object.keys(e.fields).length ? e.fields : { _: e?.message ?? 'Request failed' };
}
