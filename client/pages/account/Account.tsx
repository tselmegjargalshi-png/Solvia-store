import { useState, type FormEvent } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { OrderView } from '../../components/OrderView.tsx';
import { OrderStatusBadge } from '../../components/product.tsx';
import { Checkbox, ConfirmationDialog, Dialog, EmptyState, ErrorState, FormAlert, LoadingState, PasswordField, SelectField, TextArea, TextField } from '../../components/ui.tsx';
import { useI18n } from '../../i18n/index.tsx';
import { api, ApiError } from '../../lib/api.ts';
import { useFormat } from '../../lib/format.ts';
import { useSeo } from '../../lib/seo.ts';
import type { Order } from '../../lib/types.ts';
import { useApi } from '../../lib/useApi.ts';
import { Link, NavLink, Redirect, useLocation } from '../../router.tsx';
import { useAuth } from '../../state/auth.tsx';
import { useToast } from '../../state/toast.tsx';

type OrderRow = { number: string; status: string; paymentStatus: string; total: number; createdAt: string; itemCount: number };

function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const { t } = useI18n();
  const { money, date } = useFormat();
  if (!orders.length) return <EmptyState icon="box" title={t('account.noOrders')} action={<Link to="/shop" className="btn btn--primary">{t('cart.continue')}</Link>} />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">{t('account.orderCol')}</th>
            <th scope="col">{t('account.dateCol')}</th>
            <th scope="col">{t('account.statusCol')}</th>
            <th scope="col" className="num">
              {t('account.totalCol')}
            </th>
            <th scope="col">
              <span className="sr-only">{t('account.view')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.number}>
              <td className="mono">{o.number}</td>
              <td>{date(o.createdAt)}</td>
              <td>
                <OrderStatusBadge status={o.status} />
              </td>
              <td className="num">{money(o.total)}</td>
              <td>
                <Link to={`/account/orders/${o.number}`} className="link-arrow">
                  {t('account.view')} <Icon name="chevronRight" size={14} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overview() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<{ orders: OrderRow[] }>('/api/account/orders');
  return (
    <>
      <h2 className="h-sub">{t('account.welcome', { name: user!.fullName })}</h2>
      <div className="account-cards">
        <Link to="/account/orders" className="account-card">
          <Icon name="box" /> {t('account.orders')}
        </Link>
        <Link to="/account/addresses" className="account-card">
          <Icon name="pin" /> {t('account.addresses')}
        </Link>
        <Link to="/wishlist" className="account-card">
          <Icon name="heart" /> {t('account.wishlist')}
        </Link>
        <Link to="/account/settings" className="account-card">
          <Icon name="settings" /> {t('account.settings')}
        </Link>
      </div>
      <h2 className="h-sub">{t('account.recentOrders')}</h2>
      {loading ? <LoadingState /> : error ? <ErrorState onRetry={reload} /> : <OrdersTable orders={(data?.orders ?? []).slice(0, 5)} />}
    </>
  );
}

function Orders() {
  const { data, error, loading, reload } = useApi<{ orders: OrderRow[] }>('/api/account/orders');
  if (loading) return <LoadingState />;
  if (error) return <ErrorState onRetry={reload} />;
  return <OrdersTable orders={data!.orders} />;
}

function OrderDetail({ number }: { number: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ order: Order }>(`/api/orders/${encodeURIComponent(number)}`);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (loading) return <LoadingState />;
  if (error?.status === 404) return <EmptyState icon="alert" title={t('order.notFound')} />;
  if (error || !data) return <ErrorState onRetry={reload} />;
  const o = data.order;
  const canCancel = ['pending', 'confirmed'].includes(o.status) && !o.cancelRequested;
  return (
    <>
      <Link to="/account/orders" className="link-arrow link-arrow--back">
        <Icon name="chevronLeft" size={16} /> {t('account.orders')}
      </Link>
      {o.cancelRequested && <FormAlert tone="info">{t('order.cancelRequested')}</FormAlert>}
      <OrderView order={o} />
      {canCancel && (
        <button className="btn btn--outline" onClick={() => setOpen(true)}>
          {t('order.requestCancel')}
        </button>
      )}
      <ConfirmationDialog
        open={open}
        title={t('order.requestCancel')}
        body={t('order.cancelConfirm')}
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          setErr('');
          try {
            await api(`/api/account/orders/${encodeURIComponent(o.number)}/cancel-request`, { body: { reason } });
            setOpen(false);
            toast({ tone: 'success', title: t('order.cancelRequested') });
            reload();
          } catch (e) {
            setErr(e instanceof ApiError ? e.message : t('common.networkError'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextArea label={t('order.cancelReason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} />
        {err && <FormAlert>{err}</FormAlert>}
      </ConfirmationDialog>
    </>
  );
}

type Address = { id: number; label: string; fullName: string; phone: string; country: string; city: string; address: string; postalCode: string; isDefault: boolean };
const EMPTY_ADDR = { label: 'Home', fullName: '', phone: '', country: 'Mongolia', city: 'Ulaanbaatar', address: '', postalCode: '', isDefault: false };

function Addresses() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useApi<{ addresses: Address[] }>('/api/account/addresses');
  const [editing, setEditing] = useState<(typeof EMPTY_ADDR & { id?: number }) | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<Address | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setErrors({});
    try {
      if (editing.id) await api(`/api/account/addresses/${editing.id}`, { method: 'PUT', body: editing });
      else await api('/api/account/addresses', { body: editing });
      setEditing(null);
      reload();
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.keys(err.fields).length ? err.fields : { _: err.message });
    } finally {
      setBusy(false);
    }
  };
  const set = (k: string) => (e: any) => setEditing((cur) => ({ ...cur!, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  if (loading) return <LoadingState />;
  if (error) return <ErrorState onRetry={reload} />;
  return (
    <>
      <div className="row-between">
        <h2 className="h-sub">{t('account.addresses')}</h2>
        <button className="btn btn--primary btn--sm" onClick={() => setEditing({ ...EMPTY_ADDR })}>
          <Icon name="plus" size={16} /> {t('account.addAddress')}
        </button>
      </div>
      {!data!.addresses.length ? (
        <EmptyState icon="pin" title={t('account.noAddresses')} />
      ) : (
        <ul className="addr-grid">
          {data!.addresses.map((a) => (
            <li key={a.id} className="addr-card">
              <p className="addr-card__label">
                {a.label} {a.isDefault && <span className="badge badge--gold">{t('account.default')}</span>}
              </p>
              <address className="addr">
                {a.fullName}
                <br />
                {a.address}, {a.city} {a.postalCode}
                <br />
                {a.country} · {a.phone}
              </address>
              <div className="addr-card__actions">
                <button className="link-btn" onClick={() => setEditing({ ...a })}>
                  {t('common.edit')}
                </button>
                <button className="link-btn link-btn--danger" onClick={() => setDel(a)}>
                  {t('common.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t('account.editAddress') : t('account.addAddress')}>
        {editing && (
          <form onSubmit={save} noValidate className="form-grid">
            {errors._ && <FormAlert>{errors._}</FormAlert>}
            <TextField label={t('account.label')} value={editing.label} onChange={set('label')} error={errors.label} />
            <TextField label={t('checkout.fullName')} value={editing.fullName} onChange={set('fullName')} error={errors.fullName} autoComplete="name" />
            <TextField label={t('checkout.phone')} value={editing.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" type="tel" />
            <TextField label={t('checkout.country')} value={editing.country} onChange={set('country')} error={errors.country} autoComplete="country-name" />
            <TextField label={t('checkout.city')} value={editing.city} onChange={set('city')} error={errors.city} />
            <TextField label={t('checkout.address')} value={editing.address} onChange={set('address')} error={errors.address} className="span-2" autoComplete="street-address" />
            <TextField label={t('checkout.postalCode')} value={editing.postalCode} onChange={set('postalCode')} error={errors.postalCode} />
            <Checkbox label={t('account.makeDefault')} checked={editing.isDefault} onChange={set('isDefault')} className="span-2" />
            <div className="span-2 form-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn--primary" disabled={busy}>
                {t('common.save')}
              </button>
            </div>
          </form>
        )}
      </Dialog>
      <ConfirmationDialog
        open={!!del}
        tone="danger"
        title={t('account.deleteAddress')}
        confirmLabel={t('common.delete')}
        onCancel={() => setDel(null)}
        onConfirm={async () => {
          await api(`/api/account/addresses/${del!.id}`, { method: 'DELETE' }).catch(() => {});
          setDel(null);
          reload();
        }}
      />
    </>
  );
}

function Settings() {
  const { t, setLocale } = useI18n();
  const { user, setUser } = useAuth();
  const [p, setP] = useState({ fullName: user!.fullName, phone: user!.phone ?? '', locale: user!.locale ?? 'en' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState<{ profile?: string; pw?: string }>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setErrs({});
    try {
      const r = await api<{ user: any }>('/api/account/profile', { method: 'PUT', body: p });
      setUser({ ...user!, ...r.user });
      setLocale(p.locale as any);
      setMsg({ profile: t('account.saved') });
    } catch (err) {
      if (err instanceof ApiError) setErrs(err.fields);
    }
  };
  const savePw = async (e: FormEvent) => {
    e.preventDefault();
    setErrs({});
    try {
      await api('/api/account/password', { method: 'PUT', body: pw });
      setPw({ currentPassword: '', newPassword: '' });
      setMsg({ pw: t('account.passwordUpdated') });
    } catch (err) {
      if (err instanceof ApiError) setErrs(Object.keys(err.fields).length ? err.fields : { newPassword: err.message });
    }
  };
  return (
    <div className="settings-grid">
      <form className="panel" onSubmit={saveProfile} noValidate>
        <h2 className="panel__title">{t('account.profile')}</h2>
        <TextField label={t('auth.email')} value={user!.email} disabled />
        <TextField label={t('auth.fullName')} value={p.fullName} onChange={(e) => setP({ ...p, fullName: e.target.value })} error={errs.fullName} autoComplete="name" />
        <TextField label={t('checkout.phone')} value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} error={errs.phone} autoComplete="tel" type="tel" />
        <SelectField label={t('account.preferredLanguage')} value={p.locale} onChange={(e) => setP({ ...p, locale: e.target.value })}>
          <option value="en">English</option>
          <option value="mn">Монгол</option>
        </SelectField>
        {msg.profile && <FormAlert tone="success">{msg.profile}</FormAlert>}
        <button className="btn btn--primary">{t('account.saveProfile')}</button>
      </form>
      <form className="panel" onSubmit={savePw} noValidate>
        <h2 className="panel__title">{t('account.changePassword')}</h2>
        <PasswordField label={t('account.currentPassword')} value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} error={errs.currentPassword} autoComplete="current-password" />
        <PasswordField label={t('auth.newPassword')} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} error={errs.newPassword} hint={t('auth.passwordHint')} autoComplete="new-password" />
        {msg.pw && <FormAlert tone="success">{msg.pw}</FormAlert>}
        <button className="btn btn--primary">{t('account.updatePassword')}</button>
      </form>
    </div>
  );
}

export default function Account({ tab, params }: { tab: 'overview' | 'orders' | 'order' | 'addresses' | 'settings'; params: { number?: string } }) {
  const { t } = useI18n();
  const { user, ready } = useAuth();
  const { pathname } = useLocation();
  useSeo({ title: t('account.title'), noindex: true });
  if (!ready) return <div className="container section"><LoadingState /></div>;
  if (!user) return <Redirect to={`/login?next=${encodeURIComponent(pathname)}`} />;
  return (
    <div className="container section account">
      <h1 className="page-title">{t('account.title')}</h1>
      <div className="account__layout">
        <nav className="account__nav" aria-label={t('a11y.accountNav')}>
          <NavLink to="/account" end className="side-link">
            <Icon name="home" size={18} /> {t('account.overview')}
          </NavLink>
          <NavLink to="/account/orders" className="side-link">
            <Icon name="box" size={18} /> {t('account.orders')}
          </NavLink>
          <NavLink to="/account/addresses" className="side-link">
            <Icon name="pin" size={18} /> {t('account.addresses')}
          </NavLink>
          <NavLink to="/wishlist" className="side-link">
            <Icon name="heart" size={18} /> {t('account.wishlist')}
          </NavLink>
          <NavLink to="/account/settings" className="side-link">
            <Icon name="settings" size={18} /> {t('account.settings')}
          </NavLink>
        </nav>
        <div className="account__main">
          {tab === 'overview' && <Overview />}
          {tab === 'orders' && <Orders />}
          {tab === 'order' && <OrderDetail number={params.number!} />}
          {tab === 'addresses' && <Addresses />}
          {tab === 'settings' && <Settings />}
        </div>
      </div>
    </div>
  );
}
