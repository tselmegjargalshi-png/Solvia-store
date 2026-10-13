import { useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon.tsx';
import { FormAlert, TextArea, TextField } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { api, ApiError } from '../lib/api.ts';
import { useSeo } from '../lib/seo.ts';
import { useAuth } from '../state/auth.tsx';
import { useSettings } from '../state/settings.tsx';

export default function Contact() {
  const { t } = useI18n();
  const s = useSettings();
  const { user } = useAuth();
  useSeo({ title: t('contact.title'), description: t('contact.body') });
  const [v, setV] = useState({ name: user?.fullName ?? '', email: user?.email ?? '', subject: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [err, setErr] = useState('');
  const set = (k: keyof typeof v) => (e: any) => setV({ ...v, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('busy');
    setErrors({});
    setErr('');
    try {
      await api('/api/contact', { body: v });
      setState('sent');
    } catch (ex) {
      setState('idle');
      if (ex instanceof ApiError) {
        setErrors(ex.fields);
        setErr(ex.status === 0 ? t('common.networkError') : ex.message);
      }
    }
  };
  return (
    <div className="container section contact">
      <header className="page-head">
        <h1 className="page-title">{t('contact.title')}</h1>
        <p className="page-lede">{t('contact.body')}</p>
      </header>
      <div className="contact__grid">
        {state === 'sent' ? (
          <FormAlert tone="success">{t('contact.sent')}</FormAlert>
        ) : (
          <form className="panel stack" onSubmit={submit} noValidate>
            {err && <FormAlert>{err}</FormAlert>}
            <div className="form-grid">
              <TextField label={t('contact.name')} value={v.name} onChange={set('name')} error={errors.name} autoComplete="name" required />
              <TextField label={t('auth.email')} type="email" value={v.email} onChange={set('email')} error={errors.email} autoComplete="email" required />
              <TextField label={t('contact.subject')} value={v.subject} onChange={set('subject')} error={errors.subject} className="span-2" required />
              <TextArea label={t('contact.message')} value={v.message} onChange={set('message')} error={errors.message} rows={6} className="span-2" required maxLength={4000} />
            </div>
            <button className="btn btn--primary btn--lg" disabled={state === 'busy'}>
              {t('contact.send')}
            </button>
          </form>
        )}
        <aside className="panel panel--navy">
          <h2 className="panel__title">{t('contact.details')}</h2>
          <ul className="contact__list">
            <li>
              <Icon name="mail" /> <a href={`mailto:${s.contact.email}`}>{s.contact.email}</a>
            </li>
            <li>
              <Icon name="phone" /> <a href={`tel:${s.contact.phone.replace(/\s/g, '')}`}>{s.contact.phone}</a>
            </li>
            <li>
              <Icon name="pin" /> {s.contact.address}
            </li>
            <li>
              <Icon name="clock" /> {t('contact.hours')}: {s.contact.hours}
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
