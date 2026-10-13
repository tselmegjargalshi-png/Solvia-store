import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CartItem, CartNotices, CartSummary } from '../components/cart.tsx';
import { Icon } from '../components/Icon.tsx';
import { Checkbox, EmptyState, FormAlert, LoadingState, SelectField, TextArea, TextField } from '../components/ui.tsx';
import { useI18n, useLocalized } from '../i18n/index.tsx';
import { api, ApiError } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { useFormat } from '../lib/format.ts';
import { useSeo } from '../lib/seo.ts';
import { Link, useNavigate } from '../router.tsx';
import { useAuth } from '../state/auth.tsx';
import { useCart } from '../state/cart.tsx';
import { useSettings } from '../state/settings.tsx';

type Form = {
  fullName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  postalCode: string;
  deliveryNotes: string;
  paymentMethod: 'cod' | 'bank_transfer' | 'card' | '';
  acceptTerms: boolean;
};
const COUNTRIES = ['Mongolia', 'China', 'Japan', 'South Korea', 'Kazakhstan', 'Russia', 'United States', 'Germany', 'United Kingdom', 'Other'];

function newKey() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Client-side checks mirror the server's, for fast feedback. The server re-validates everything. */
function validate(f: Form, t: (k: any) => string) {
  const e: Record<string, string> = {};
  const req = t('common.required');
  if (!f.fullName.trim()) e.fullName = req;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = f.email.trim() ? t('validation.email') : req;
  if (!/^\+?[0-9 ()-]{6,20}$/.test(f.phone.trim())) e.phone = f.phone.trim() ? t('validation.phone') : req;
  if (!f.country) e.country = req;
  if (!f.city.trim()) e.city = req;
  if (f.address.trim().length < 5) e.address = f.address.trim() ? t('validation.min5') : req;
  if (f.postalCode && !/^[A-Za-z0-9 -]*$/.test(f.postalCode)) e.postalCode = t('validation.postal');
  if (!f.paymentMethod) e.paymentMethod = req;
  if (!f.acceptTerms) e.acceptTerms = req;
  return e;
}

export default function Checkout() {
  const { t, locale } = useI18n();
  const L = useLocalized();
  const { money } = useFormat();
  const settings = useSettings();
  const cart = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  useSeo({ title: t('checkout.title'), noindex: true });

  const [f, setF] = useState<Form>({ fullName: '', email: '', phone: '', country: 'Mongolia', city: 'Ulaanbaatar', address: '', postalCode: '', deliveryNotes: '', paymentMethod: '', acceptTerms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [addresses, setAddresses] = useState<any[]>([]);
  const idemKey = useRef<string>(newKey());
  const submitted = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!user) return;
    setF((cur) => ({ ...cur, fullName: cur.fullName || user.fullName, email: cur.email || user.email, phone: cur.phone || user.phone }));
    api<{ addresses: any[] }>('/api/account/addresses')
      .then((r) => {
        setAddresses(r.addresses);
        const d = r.addresses.find((a) => a.isDefault);
        if (d) applyAddress(d);
      })
      .catch(() => {});
  }, [user?.id]);
  useEffect(() => {
    if (cart.quote) track('begin_checkout', { currency: cart.quote.currency, value: cart.quote.total });
  }, [!!cart.quote]);
  // A changed cart is a new checkout attempt: give it a fresh idempotency key.
  const cartSig = useMemo(() => JSON.stringify(cart.items), [cart.items]);
  useEffect(() => {
    if (!submitted.current) idemKey.current = newKey();
  }, [cartSig]);

  const applyAddress = (a: any) => setF((cur) => ({ ...cur, fullName: a.fullName, phone: a.phone, country: a.country, city: a.city, address: a.address, postalCode: a.postalCode }));
  const set = (k: keyof Form) => (e: any) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((cur) => ({ ...cur, [k]: v }));
    if (errors[k]) setErrors((er) => ({ ...er, [k]: '' }));
  };

  if (!cart.items.length && !busy) {
    return (
      <div className="container section">
        <h1 className="page-title">{t('checkout.title')}</h1>
        <EmptyState icon="bag" title={t('checkout.empty')} action={<Link to="/shop" className="btn btn--primary">{t('cart.continue')}</Link>} />
      </div>
    );
  }
  if (!cart.quote) return <div className="container section"><LoadingState /></div>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return; // duplicate-submit guard (plus the server-side idempotency key)
    setFormError('');
    const errs = validate(f, t);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setFormError(t('checkout.fixErrors'));
      setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setBusy(true);
    submitted.current = true;
    try {
      const r = await api<{ number: string; token: string | null; payment: { redirectUrl: string; isDemo: boolean } | null; paymentError?: string; duplicate?: boolean }>('/api/checkout', {
        body: { ...f, items: cart.items, shippingMethod: cart.shippingMethod, couponCode: cart.couponCode || undefined, idempotencyKey: idemKey.current, locale },
      });
      cart.clear();
      if (r.duplicate) {
        nav(user ? `/account/orders/${r.number}` : '/');
        return;
      }
      const confirmUrl = `/order/${encodeURIComponent(r.number)}?token=${encodeURIComponent(r.token ?? '')}`;
      if (r.payment?.redirectUrl) {
        if (r.payment.redirectUrl.startsWith('/')) nav(r.payment.redirectUrl);
        else window.location.href = r.payment.redirectUrl;
      } else nav(confirmUrl);
    } catch (err) {
      submitted.current = false;
      setBusy(false);
      if (err instanceof ApiError) {
        if (err.data?.code === 'cart_changed') {
          cart.refreshQuote();
          setFormError(t('checkout.cartChanged'));
        } else if (err.data?.code === 'empty_cart') setFormError(t('checkout.empty'));
        else if (Object.keys(err.fields).length) {
          setErrors(err.fields);
          setFormError(t('checkout.fixErrors'));
        } else setFormError(err.status === 0 ? t('common.networkError') : t('checkout.failed'));
      } else setFormError(t('checkout.failed'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const methods = settings.shipping.methods;
  const payOptions: { v: Form['paymentMethod']; icon: string }[] = [
    { v: 'cod', icon: 'cash' },
    { v: 'bank_transfer', icon: 'bank' },
    { v: 'card', icon: 'card' },
  ];

  return (
    <div className="container section checkout">
      <h1 className="page-title">{t('checkout.title')}</h1>
      {!user && (
        <p className="checkout__signin">
          {t('checkout.guestNote')}{' '}
          <Link to="/login?next=/checkout">{t('nav.signIn')}</Link>
        </p>
      )}
      <CartNotices />
      {formError && <FormAlert>{formError}</FormAlert>}
      <form ref={formRef} className="checkout__grid" onSubmit={submit} noValidate aria-busy={busy}>
        <div className="checkout__form">
          <fieldset className="panel">
            <legend className="panel__title">
              <span className="step">1</span> {t('checkout.contact')}
            </legend>
            <div className="form-grid">
              <TextField label={t('checkout.fullName')} value={f.fullName} onChange={set('fullName')} error={errors.fullName} autoComplete="name" required className="span-2" />
              <TextField label={t('checkout.email')} type="email" value={f.email} onChange={set('email')} error={errors.email} autoComplete="email" required />
              <TextField label={t('checkout.phone')} type="tel" value={f.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" required />
            </div>
          </fieldset>

          <fieldset className="panel">
            <legend className="panel__title">
              <span className="step">2</span> {t('checkout.shippingAddress')}
            </legend>
            {addresses.length > 0 && (
              <SelectField label={t('checkout.savedAddress')} defaultValue="" onChange={(e) => { const a = addresses.find((x) => String(x.id) === e.target.value); if (a) applyAddress(a); }}>
                <option value="">—</option>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}: {a.address}, {a.city}
                  </option>
                ))}
              </SelectField>
            )}
            <div className="form-grid">
              <SelectField label={t('checkout.country')} value={f.country} onChange={set('country')} error={errors.country} autoComplete="country-name">
                {COUNTRIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </SelectField>
              <TextField label={t('checkout.city')} value={f.city} onChange={set('city')} error={errors.city} autoComplete="address-level2" required />
              <TextField label={t('checkout.address')} value={f.address} onChange={set('address')} error={errors.address} autoComplete="street-address" required className="span-2" />
              <TextField label={t('checkout.postalCode')} value={f.postalCode} onChange={set('postalCode')} error={errors.postalCode} autoComplete="postal-code" />
              <TextArea label={t('checkout.notes')} value={f.deliveryNotes} onChange={set('deliveryNotes')} maxLength={500} rows={2} className="span-2" />
            </div>
          </fieldset>

          <fieldset className="panel">
            <legend className="panel__title">
              <span className="step">3</span> {t('checkout.delivery')}
            </legend>
            <div className="radio-cards">
              {methods.map((m) => {
                const free = m.code === 'standard' && settings.shipping.freeShippingThreshold > 0 && cart.quote!.subtotal - cart.quote!.discount >= settings.shipping.freeShippingThreshold;
                return (
                  <label key={m.code} className={`radio-card ${cart.shippingMethod === m.code ? 'is-active' : ''}`}>
                    <input type="radio" name="shippingMethod" value={m.code} checked={cart.shippingMethod === m.code} onChange={() => cart.setShippingMethod(m.code)} />
                    <span className="radio-card__body">
                      <strong>{L(m.name, m.nameMn)}</strong>
                      <span>{t(m.etaDays === '1' ? 'checkout.day' : 'checkout.days', { days: m.etaDays })}</span>
                    </span>
                    <span className="radio-card__price">{m.fee === 0 || free ? t('cart.free') : money(m.fee)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="panel" aria-describedby={errors.paymentMethod ? 'pay-err' : undefined}>
            <legend className="panel__title">
              <span className="step">4</span> {t('checkout.payment')}
            </legend>
            <div className="radio-cards">
              {payOptions.map((o) => (
                <label key={o.v} className={`radio-card ${f.paymentMethod === o.v ? 'is-active' : ''}`}>
                  <input type="radio" name="paymentMethod" value={o.v} checked={f.paymentMethod === o.v} onChange={set('paymentMethod')} aria-invalid={!!errors.paymentMethod || undefined} />
                  <Icon name={o.icon} size={22} />
                  <span className="radio-card__body">
                    <strong>{t(`checkout.pay.${o.v}` as any)}</strong>
                    <span>{t(`checkout.pay.${o.v}Body` as any)}</span>
                    {o.v === 'card' && !settings.payments.liveCardPayments && <span className="demo-flag">{t('checkout.pay.cardDemo')}</span>}
                  </span>
                </label>
              ))}
            </div>
            {errors.paymentMethod && (
              <p id="pay-err" className="field__error">
                {errors.paymentMethod}
              </p>
            )}
          </fieldset>
        </div>

        <aside className="checkout__aside">
          <div className="panel panel--sticky">
            <ul className="cart-lines cart-lines--compact">
              {cart.quote.lines.map((l) => (
                <CartItem key={l.variantId} line={l} compact />
              ))}
            </ul>
            <CartSummary quote={cart.quote} shippingLabel={methods.find((m) => m.code === cart.shippingMethod) ? ` · ${L(methods.find((m) => m.code === cart.shippingMethod)!.name, methods.find((m) => m.code === cart.shippingMethod)!.nameMn)}` : ''}>
              <Checkbox
                checked={f.acceptTerms}
                onChange={set('acceptTerms')}
                error={errors.acceptTerms}
                label={
                  <>
                    {t('checkout.terms', { terms: '\u0000', privacy: '\u0001' })
                      .split(/(\u0000|\u0001)/)
                      .map((part, i) =>
                        part === '\u0000' ? (
                          <Link key={i} to="/terms" target="_blank">
                            {t('checkout.termsLink')}
                          </Link>
                        ) : part === '\u0001' ? (
                          <Link key={i} to="/privacy" target="_blank">
                            {t('checkout.privacyLink')}
                          </Link>
                        ) : (
                          part
                        ),
                      )}
                  </>
                }
              />
              <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy || cart.quoting} aria-busy={busy} data-testid="place-order">
                {busy ? t('checkout.placing') : `${t('checkout.place')} · ${money(cart.quote.total)}`}
              </button>
              <p className="summary__note">
                <Icon name="shield" size={16} /> {t('checkout.secureNote')}
              </p>
            </CartSummary>
          </div>
        </aside>
      </form>
    </div>
  );
}
