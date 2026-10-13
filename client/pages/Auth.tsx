import { useState, type FormEvent, type ReactNode } from 'react';
import { Checkbox, FormAlert, PasswordField, TextField } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { api, ApiError } from '../lib/api.ts';
import { useSeo } from '../lib/seo.ts';
import { Link, useNavigate, useSearchParams } from '../router.tsx';
import { useAuth } from '../state/auth.tsx';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

function AuthShell({ title, body, children, foot }: { title: string; body?: string; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth__card">
        <h1 className="page-title">{title}</h1>
        {body && <p className="page-lede">{body}</p>}
        {children}
        {foot && <div className="auth__foot">{foot}</div>}
      </div>
    </div>
  );
}

function useForm<T extends Record<string, any>>(initial: T) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof T) => (e: any) => {
    setV((cur) => ({ ...cur, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    if (errors[k as string]) setErrors((x) => ({ ...x, [k]: '' }));
  };
  const run = async (fn: () => Promise<void>, networkMsg: string) => {
    setBusy(true);
    setFormError('');
    setErrors({});
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        if (Object.keys(e.fields).length) setErrors(e.fields);
        setFormError(e.status === 0 ? networkMsg : e.message);
      } else setFormError(networkMsg);
    } finally {
      setBusy(false);
    }
  };
  return { v, set, errors, formError, busy, run };
}

export default function Auth({ mode }: { mode: Mode }) {
  const { t, locale } = useI18n();
  const auth = useAuth();
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const next = safeNext(qs.get('next'));
  const [done, setDone] = useState(false);
  const titles: Record<Mode, string> = { login: t('auth.loginTitle'), register: t('auth.registerTitle'), forgot: t('auth.forgotTitle'), reset: t('auth.resetTitle') };
  useSeo({ title: titles[mode], noindex: true });
  const f = useForm({ email: '', password: '', fullName: '', acceptTerms: false, marketing: false });

  const termsLabel = t('auth.acceptTerms', { terms: '\u0000', privacy: '\u0001' })
    .split(/(\u0000|\u0001)/)
    .map((p, i) => (p === '\u0000' ? <Link key={i} to="/terms">{t('checkout.termsLink')}</Link> : p === '\u0001' ? <Link key={i} to="/privacy">{t('checkout.privacyLink')}</Link> : p));

  if (mode === 'login') {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      f.run(async () => {
        const u = await auth.login(f.v.email, f.v.password);
        nav(next ?? (u.role === 'admin' ? '/admin' : '/account'), { replace: true });
      }, t('common.networkError'));
    };
    return (
      <AuthShell
        title={titles.login}
        body={qs.get('next') ? t('auth.required') : t('auth.loginBody')}
        foot={
          <>
            {t('auth.noAccount')} <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>{t('auth.createOne')}</Link>
          </>
        }
      >
        {f.formError && <FormAlert>{f.formError}</FormAlert>}
        <form onSubmit={submit} noValidate className="stack">
          <TextField label={t('auth.email')} type="email" autoComplete="email" value={f.v.email} onChange={f.set('email')} error={f.errors.email} required />
          <PasswordField label={t('auth.password')} autoComplete="current-password" value={f.v.password} onChange={f.set('password')} required />
          <Link to="/forgot-password" className="auth__forgot">
            {t('auth.forgot')}
          </Link>
          <button className="btn btn--primary btn--lg btn--block" disabled={f.busy} aria-busy={f.busy}>
            {t('auth.submitLogin')}
          </button>
        </form>
      </AuthShell>
    );
  }

  if (mode === 'register') {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      f.run(async () => {
        await auth.register({ ...f.v, locale });
        nav(next ?? '/account', { replace: true });
      }, t('common.networkError'));
    };
    return (
      <AuthShell
        title={titles.register}
        body={t('auth.registerBody')}
        foot={
          <>
            {t('auth.haveAccount')} <Link to="/login">{t('nav.signIn')}</Link>
          </>
        }
      >
        {f.formError && <FormAlert>{f.formError}</FormAlert>}
        <form onSubmit={submit} noValidate className="stack">
          <TextField label={t('auth.fullName')} autoComplete="name" value={f.v.fullName} onChange={f.set('fullName')} error={f.errors.fullName} required />
          <TextField label={t('auth.email')} type="email" autoComplete="email" value={f.v.email} onChange={f.set('email')} error={f.errors.email} required />
          <PasswordField label={t('auth.password')} autoComplete="new-password" value={f.v.password} onChange={f.set('password')} error={f.errors.password} hint={t('auth.passwordHint')} required minLength={10} />
          <Checkbox label={<>{termsLabel}</>} checked={f.v.acceptTerms} onChange={f.set('acceptTerms')} error={f.errors.acceptTerms} />
          <Checkbox label={t('auth.marketing')} checked={f.v.marketing} onChange={f.set('marketing')} />
          <button className="btn btn--primary btn--lg btn--block" disabled={f.busy} aria-busy={f.busy}>
            {t('auth.submitRegister')}
          </button>
        </form>
      </AuthShell>
    );
  }

  if (mode === 'forgot') {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      f.run(async () => {
        await api('/api/auth/forgot-password', { body: { email: f.v.email } });
        setDone(true);
      }, t('common.networkError'));
    };
    return (
      <AuthShell title={titles.forgot} body={t('auth.forgotBody')} foot={<Link to="/login">{t('auth.backToLogin')}</Link>}>
        {done ? (
          <>
            <FormAlert tone="success">{t('auth.forgotSent')}</FormAlert>
            <p className="muted small">{t('auth.forgotDevNote')}</p>
          </>
        ) : (
          <>
            {f.formError && <FormAlert>{f.formError}</FormAlert>}
            <form onSubmit={submit} noValidate className="stack">
              <TextField label={t('auth.email')} type="email" autoComplete="email" value={f.v.email} onChange={f.set('email')} error={f.errors.email} required />
              <button className="btn btn--primary btn--lg btn--block" disabled={f.busy}>
                {t('auth.sendLink')}
              </button>
            </form>
          </>
        )}
      </AuthShell>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    f.run(async () => {
      await api('/api/auth/reset-password', { body: { token: qs.get('token') ?? '', password: f.v.password } });
      setDone(true);
    }, t('common.networkError'));
  };
  return (
    <AuthShell title={titles.reset} foot={<Link to="/login">{t('auth.backToLogin')}</Link>}>
      {done ? (
        <FormAlert tone="success">
          {t('auth.resetDone')} <Link to="/login">{t('nav.signIn')}</Link>
        </FormAlert>
      ) : (
        <>
          {f.formError && <FormAlert>{f.formError}</FormAlert>}
          <form onSubmit={submit} noValidate className="stack">
            <PasswordField label={t('auth.newPassword')} autoComplete="new-password" value={f.v.password} onChange={f.set('password')} error={f.errors.password} hint={t('auth.passwordHint')} required />
            <button className="btn btn--primary btn--lg btn--block" disabled={f.busy}>
              {t('auth.resetSubmit')}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
