import { EmptyState } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useSeo } from '../lib/seo.ts';
import { Link } from '../router.tsx';

export default function NotFound() {
  const { t } = useI18n();
  useSeo({ title: t('common.notFound'), noindex: true });
  return (
    <div className="container section">
      <EmptyState
        icon="search"
        title={t('common.notFound')}
        body={t('common.notFoundBody')}
        action={
          <div className="row-gap">
            <Link to="/" className="btn btn--primary">
              {t('common.backHome')}
            </Link>
            <Link to="/shop" className="btn btn--outline">
              {t('nav.allProducts')}
            </Link>
          </div>
        }
      />
    </div>
  );
}
