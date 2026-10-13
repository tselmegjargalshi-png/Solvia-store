import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { Checkbox, ErrorState, FormAlert, LoadingState, TextArea, TextField } from '../../components/ui.tsx';
import { api, ApiError } from '../../lib/api.ts';
import { useFormat } from '../../lib/format.ts';
import { useApi } from '../../lib/useApi.ts';
import { useRefreshSettings, type Settings } from '../../state/settings.tsx';
import { useToast } from '../../state/toast.tsx';
import { fieldErrors, PageHeader } from './kit.tsx';

type S = Omit<Settings, 'payments' | 'analytics'>;

export default function SettingsAdmin() {
  const toast = useToast();
  const refresh = useRefreshSettings();
  const { toMajor, toMinor } = useFormat();
  const { data, loading, error, reload } = useApi<{ settings: S }>('/api/admin/settings');
  const [s, setS] = useState<S | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setS(data.settings);
  }, [data]);
  if (loading && !s) return <LoadingState />;
  if (error || !s) return <ErrorState onRetry={reload} />;

  const up = <K extends keyof S>(k: K, v: S[K]) => setS({ ...s, [k]: v });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api('/api/admin/settings', { method: 'PUT', body: s });
      refresh();
      toast({ tone: 'success', title: 'Settings saved' });
    } catch (err) {
      setErrors(err instanceof ApiError ? fieldErrors(err) : { _: 'Network error' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };
  const uploadLogo = async (f?: File) => {
    if (!f) return;
    try {
      const r = await api<{ url: string }>('/api/admin/uploads', { raw: f });
      up('logoUrl', r.url);
    } catch (e) {
      toast({ tone: 'error', title: 'Upload failed', body: (e as Error).message });
    }
  };

  return (
    <form onSubmit={save} noValidate>
      <PageHeader title="Store settings" actions={<button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>} />
      {Object.keys(errors).length > 0 && (
        <FormAlert>
          {errors._ ?? 'Please correct the highlighted fields.'}
          <ul className="plain small">{Object.entries(errors).filter(([k]) => k !== '_').map(([k, v]) => <li key={k}><code>{k}</code>: {v}</li>)}</ul>
        </FormAlert>
      )}
      <div className="settings-cards">
        <section className="card stack">
          <h2 className="card__title">Brand</h2>
          <TextField label="Store name" value={s.storeName} onChange={(e) => up('storeName', e.target.value)} error={errors.storeName} />
          <TextField label="Tagline" value={s.tagline} onChange={(e) => up('tagline', e.target.value)} />
          <TextArea label="Short description (used for SEO and footer)" value={s.description} onChange={(e) => up('description', e.target.value)} rows={3} />
          <div className="row-gap">
            {s.logoUrl && <img src={s.logoUrl} alt="Current logo" className="logo-preview" />}
            <label className="btn btn--outline btn--sm upload-btn"><Icon name="upload" size={16} /> Upload logo<input type="file" accept="image/png,image/webp,image/jpeg" className="sr-only" onChange={(e) => uploadLogo(e.target.files?.[0])} /></label>
            {s.logoUrl && <button type="button" className="link-btn" onClick={() => up('logoUrl', '')}>Use text wordmark</button>}
          </div>
          <TextField label="Announcement bar" value={s.announcement} onChange={(e) => up('announcement', e.target.value)} hint="Leave empty to hide." />
        </section>

        <section className="card stack">
          <h2 className="card__title">Homepage promotion</h2>
          <Checkbox label="Show promotional banner" checked={s.promo.enabled} onChange={(e) => up('promo', { ...s.promo, enabled: e.target.checked })} />
          <TextField label="Eyebrow" value={s.promo.eyebrow} onChange={(e) => up('promo', { ...s.promo, eyebrow: e.target.value })} />
          <TextField label="Title" value={s.promo.title} onChange={(e) => up('promo', { ...s.promo, title: e.target.value })} />
          <TextArea label="Body" value={s.promo.body} onChange={(e) => up('promo', { ...s.promo, body: e.target.value })} rows={2} hint="Avoid countdowns or claims you can't back up." />
          <div className="form-grid">
            <TextField label="Button label" value={s.promo.ctaLabel} onChange={(e) => up('promo', { ...s.promo, ctaLabel: e.target.value })} />
            <TextField label="Button link" value={s.promo.ctaHref} onChange={(e) => up('promo', { ...s.promo, ctaHref: e.target.value })} error={errors['promo.ctaHref']} />
          </div>
        </section>

        <section className="card stack">
          <h2 className="card__title">Currency</h2>
          <p className="small muted">Currency is independent of the interface language. Changing it does not convert existing prices.</p>
          <div className="form-grid">
            <TextField label="ISO code" value={s.currency.code} onChange={(e) => up('currency', { ...s.currency, code: e.target.value.toUpperCase() })} error={errors['currency.code']} maxLength={3} />
            <TextField label="Decimal places" inputMode="numeric" value={String(s.currency.decimals)} onChange={(e) => up('currency', { ...s.currency, decimals: Number(e.target.value) || 0 })} error={errors['currency.decimals']} />
          </div>
        </section>

        <section className="card stack">
          <h2 className="card__title">Tax</h2>
          <Checkbox label="Charge tax" checked={s.tax.enabled} onChange={(e) => up('tax', { ...s.tax, enabled: e.target.checked })} />
          <div className="form-grid">
            <TextField label="Label" value={s.tax.label} onChange={(e) => up('tax', { ...s.tax, label: e.target.value })} />
            <TextField label="Rate (%)" inputMode="numeric" value={String(s.tax.rate)} onChange={(e) => up('tax', { ...s.tax, rate: Number(e.target.value) || 0 })} error={errors['tax.rate']} />
          </div>
          <Checkbox label="Prices already include tax" checked={s.tax.inclusive} onChange={(e) => up('tax', { ...s.tax, inclusive: e.target.checked })} />
        </section>

        <section className="card stack span-all">
          <h2 className="card__title">Shipping</h2>
          <TextField label={`Free standard delivery threshold (${s.currency.code}, 0 = never)`} inputMode="decimal" value={String(toMajor(s.shipping.freeShippingThreshold))} onChange={(e) => up('shipping', { ...s.shipping, freeShippingThreshold: toMinor(e.target.value || 0) })} />
          <div className="table-wrap">
            <table className="table table--compact">
              <thead><tr><th>Code</th><th>Name</th><th>Name (MN)</th><th>Fee</th><th>ETA (days)</th><th><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>
                {s.shipping.methods.map((m, i) => {
                  const setM = (patch: object) => up('shipping', { ...s.shipping, methods: s.shipping.methods.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <tr key={i}>
                      <td><input className="input input--sm" value={m.code} aria-label="Code" onChange={(e) => setM({ code: e.target.value })} /></td>
                      <td><input className="input input--sm" value={m.name} aria-label="Name" onChange={(e) => setM({ name: e.target.value })} /></td>
                      <td><input className="input input--sm" value={m.nameMn} aria-label="Mongolian name" onChange={(e) => setM({ nameMn: e.target.value })} /></td>
                      <td><input className="input input--sm" inputMode="decimal" value={String(toMajor(m.fee))} aria-label="Fee" onChange={(e) => setM({ fee: toMinor(e.target.value || 0) })} /></td>
                      <td><input className="input input--sm" value={m.etaDays} aria-label="ETA" onChange={(e) => setM({ etaDays: e.target.value })} /></td>
                      <td><button type="button" className="icon-btn icon-btn--sm" aria-label="Remove method" disabled={s.shipping.methods.length === 1} onClick={() => up('shipping', { ...s.shipping, methods: s.shipping.methods.filter((_, j) => j !== i) })}><Icon name="trash" size={16} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => up('shipping', { ...s.shipping, methods: [...s.shipping.methods, { code: `method${s.shipping.methods.length + 1}`, name: 'New method', nameMn: '', fee: 0, etaDays: '3' }] })}><Icon name="plus" size={16} /> Add method</button>
        </section>

        <section className="card stack">
          <h2 className="card__title">Contact</h2>
          <TextField label="Email" type="email" value={s.contact.email} onChange={(e) => up('contact', { ...s.contact, email: e.target.value })} error={errors['contact.email']} />
          <TextField label="Phone" value={s.contact.phone} onChange={(e) => up('contact', { ...s.contact, phone: e.target.value })} />
          <TextField label="Address" value={s.contact.address} onChange={(e) => up('contact', { ...s.contact, address: e.target.value })} />
          <TextField label="Opening hours" value={s.contact.hours} onChange={(e) => up('contact', { ...s.contact, hours: e.target.value })} />
        </section>

        <section className="card stack">
          <h2 className="card__title">Social links</h2>
          <p className="small muted">Links only — no social login or posting is integrated.</p>
          {Object.keys(s.social).map((k) => (
            <TextField key={k} label={k[0].toUpperCase() + k.slice(1)} value={s.social[k]} onChange={(e) => up('social', { ...s.social, [k]: e.target.value })} error={errors[`social.${k}`]} placeholder="https://…" />
          ))}
        </section>
      </div>
    </form>
  );
}
