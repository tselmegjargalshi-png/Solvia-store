import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { api, ApiError } from '../lib/api.ts';
import { Link } from '../router.tsx';
import { useSettings } from '../state/settings.tsx';
import { Icon } from './Icon.tsx';
import { Logo } from './Header.tsx';
import { Checkbox, FormAlert } from './ui.tsx';

export function Newsletter() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setState('busy');
    try {
      await api('/api/newsletter', { body: { email, consent } });
      setState('done');
    } catch (err) {
      setState('idle');
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(err instanceof ApiError && err.status ? err.message : t('common.networkError'));
    }
  };
  return (
    <section className="newsletter" aria-labelledby="nl-title">
      <div className="container newsletter__inner">
        <div>
          <p className="eyebrow eyebrow--gold">{t('newsletter.title')}</p>
          <h2 id="nl-title" className="newsletter__title">
            {t('newsletter.body')}
          </h2>
        </div>
        {state === 'done' ? (
          <FormAlert tone="success">{t('newsletter.success')}</FormAlert>
        ) : (
          <form className="newsletter__form" onSubmit={submit} noValidate>
            <div className="newsletter__row">
              <label htmlFor="nl-email" className="sr-only">
                {t('newsletter.email')}
              </label>
              <input id="nl-email" type="email" className="input input--dark" placeholder={t('newsletter.email')} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={!!errors.email || undefined} aria-describedby={errors.email ? 'nl-email-err' : undefined} required />
              <button className="btn btn--gold" disabled={state === 'busy'}>
                {t('newsletter.submit')}
              </button>
            </div>
            {errors.email && (
              <p id="nl-email-err" className="field__error field__error--dark">
                {errors.email}
              </p>
            )}
            <Checkbox className="check--dark" label={t('newsletter.consent')} checked={consent} onChange={(e) => setConsent(e.target.checked)} error={errors.consent} />
            {formError && <FormAlert>{formError}</FormAlert>}
          </form>
        )}
      </div>
    </section>
  );
}

const SOCIAL_LABEL: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', pinterest: 'Pinterest', x: 'X' };

export function Footer() {
  const { t, locale } = useI18n();
  const s = useSettings();
  const year = new Date().getFullYear();
  const socials = Object.entries(s.social).filter(([, url]) => !!url);
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__brand">
          <Logo light />
          <p>{s.description}</p>
          <ul className="footer__contact">
            <li>
              <Icon name="mail" size={16} /> <a href={`mailto:${s.contact.email}`}>{s.contact.email}</a>
            </li>
            <li>
              <Icon name="phone" size={16} /> <a href={`tel:${s.contact.phone.replace(/\s/g, '')}`}>{s.contact.phone}</a>
            </li>
            <li>
              <Icon name="clock" size={16} /> {s.contact.hours}
            </li>
          </ul>
        </div>
        <nav className="footer__col" aria-label={t('footer.shop')}>
          <h2>{t('footer.shop')}</h2>
          <Link to="/shop">{t('nav.allProducts')}</Link>
          <Link to="/new-arrivals">{t('nav.newArrivals')}</Link>
          <Link to="/best-sellers">{t('nav.bestSellers')}</Link>
          <Link to="/offers">{t('nav.offers')}</Link>
          <Link to="/wishlist">{t('nav.wishlist')}</Link>
        </nav>
        <nav className="footer__col" aria-label={t('footer.help')}>
          <h2>{t('footer.help')}</h2>
          <Link to="/faq">{t('nav.faq')}</Link>
          <Link to="/shipping">{t('footer.shipping')}</Link>
          <Link to="/returns">{t('footer.returns')}</Link>
          <Link to="/contact">{t('nav.contact')}</Link>
          <Link to="/account/orders">{t('nav.orders')}</Link>
        </nav>
        <nav className="footer__col" aria-label={t('footer.company')}>
          <h2>{t('footer.company')}</h2>
          <Link to="/about">{t('nav.about')}</Link>
          <Link to="/blog">{t('nav.blog')}</Link>
          <Link to="/privacy">{t('footer.privacy')}</Link>
          <Link to="/terms">{t('footer.terms')}</Link>
        </nav>
        {socials.length > 0 && (
          <div className="footer__col">
            <h2>{t('footer.follow')}</h2>
            <ul className="footer__social">
              {socials.map(([k, url]) => (
                <li key={k}>
                  <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${SOCIAL_LABEL[k] ?? k} ${t('a11y.newTab')}`}>
                    <Icon name={k} size={18} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="container footer__base">
        <p>{t('footer.rights', { year, store: s.storeName })}</p>
        <p className="footer__demo">{t('footer.demoNote')}</p>
        {locale === 'mn' && <p className="footer__demo">{t('footer.translationNote')}</p>}
      </div>
    </footer>
  );
}
