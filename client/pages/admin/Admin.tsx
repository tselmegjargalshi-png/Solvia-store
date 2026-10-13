import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { EmptyState, LoadingState } from '../../components/ui.tsx';
import { useSeo } from '../../lib/seo.ts';
import { Link, matchPath, Redirect, useLocation } from '../../router.tsx';
import { useAuth } from '../../state/auth.tsx';
import { AdminSidebar } from './kit.tsx';
import Dashboard from './Dashboard.tsx';
import { ProductEditor, ProductsList } from './Products.tsx';
import { OrderDetail, OrdersList } from './Orders.tsx';
import { Brands, Categories } from './Catalog.tsx';
import { CustomerDetail, Customers } from './Customers.tsx';
import { BlogEditor, BlogList, Coupons, Faqs, Messages } from './ContentAdmin.tsx';
import SettingsAdmin from './Settings.tsx';

const ROUTES: [string, (p: any) => any][] = [
  ['/admin', () => <Dashboard />],
  ['/admin/products', () => <ProductsList />],
  ['/admin/products/new', () => <ProductEditor id={null} />],
  ['/admin/products/:id', (p) => <ProductEditor id={Number(p.id)} />],
  ['/admin/orders', () => <OrdersList />],
  ['/admin/orders/:id', (p) => <OrderDetail id={Number(p.id)} />],
  ['/admin/categories', () => <Categories />],
  ['/admin/brands', () => <Brands />],
  ['/admin/customers', () => <Customers />],
  ['/admin/customers/:id', (p) => <CustomerDetail id={Number(p.id)} />],
  ['/admin/blog', () => <BlogList />],
  ['/admin/blog/new', () => <BlogEditor id={null} />],
  ['/admin/blog/:id', (p) => <BlogEditor id={Number(p.id)} />],
  ['/admin/faqs', () => <Faqs />],
  ['/admin/coupons', () => <Coupons />],
  ['/admin/messages', () => <Messages />],
  ['/admin/settings', () => <SettingsAdmin />],
];

/**
 * Admin shell. The client-side role check only decides what to render —
 * every /api/admin/* endpoint independently enforces the admin role on the server.
 */
export default function Admin() {
  const { user, ready } = useAuth();
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  useSeo({ title: 'Admin', noindex: true });
  useEffect(() => setNavOpen(false), [pathname]);

  if (!ready) return <LoadingState />;
  if (!user) return <Redirect to={`/login?next=${encodeURIComponent(pathname)}`} />;
  if (user.role !== 'admin') {
    return (
      <div className="container section">
        <EmptyState icon="shield" title="Administrator access required" body="Your account does not have permission to view the admin dashboard." action={<Link to="/" className="btn btn--primary">Back to store</Link>} />
      </div>
    );
  }
  let page: any = <EmptyState icon="search" title="Admin page not found" />;
  for (const [pattern, render] of ROUTES) {
    const m = matchPath(pattern, pathname);
    if (m && !(pattern === '/admin/products/:id' && m.id === 'new') && !(pattern === '/admin/blog/:id' && m.id === 'new')) {
      page = render(m);
      break;
    }
  }
  return (
    <div className="admin">
      <a href="#admin-main" className="skip-link">
        Skip to content
      </a>
      <aside className={`admin__side ${navOpen ? 'is-open' : ''}`}>
        <AdminSidebar onNavigate={() => setNavOpen(false)} />
      </aside>
      {navOpen && <div className="admin__scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <div className="admin__body">
        <div className="admin__bar">
          <button className="icon-btn admin__burger" aria-label="Open admin menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>
            <Icon name="menu" />
          </button>
          <span className="muted small">
            Signed in as <strong>{user.email}</strong>
          </span>
        </div>
        <main id="admin-main" className="admin__main" tabIndex={-1}>
          {page}
        </main>
      </div>
    </div>
  );
}
