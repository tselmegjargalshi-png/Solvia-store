import { ErrorState, LoadingState } from '../components/ui.tsx';
import { useI18n, useLocalized } from '../i18n/index.tsx';
import { useSeo } from '../lib/seo.ts';
import { useApi } from '../lib/useApi.ts';
import { Link } from '../router.tsx';

type Faq = { id: number; question: string; answer: string; questionMn: string; answerMn: string };

export default function FaqPage() {
  const { t } = useI18n();
  const L = useLocalized();
  useSeo({ title: t('faq.title') });
  const { data, error, loading, reload } = useApi<{ faqs: Faq[] }>('/api/faqs');
  const [before, after] = t('faq.body', { link: '\u0000' }).split('\u0000');
  return (
    <div className="container section narrow">
      <header className="page-head">
        <h1 className="page-title">{t('faq.title')}</h1>
        <p className="page-lede">
          {before}
          <Link to="/contact">{t('faq.contactLink')}</Link>
          {after}
        </p>
      </header>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <div className="accordion accordion--faq">
          {data!.faqs.map((f, i) => (
            <details key={f.id} open={i === 0}>
              <summary>{L(f.question, f.questionMn)}</summary>
              <div className="accordion__body">
                <p>{L(f.answer, f.answerMn)}</p>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
