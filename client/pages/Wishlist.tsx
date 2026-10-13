import { ProductGrid } from '../components/product.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useSeo } from '../lib/seo.ts';
import type { ProductCard } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { Link } from '../router.tsx';
import { useAuth } from '../state/auth.tsx';
import { useWishlist } from '../state/wishlist.tsx';

export default function Wishlist() {
  const { t } = useI18n();
  const wl = useWishlist();
  const { user } = useAuth();
  useSeo({ title: t('wishlist.title'), noindex: true });
  const { data, error, loading, reload } = useApi<{ items: ProductCard[] }>(wl.ids.length ? `/api/products-by-ids?ids=${wl.ids.slice(0, 24).join(',')}` : null);
  return (
    <div className="container section">
      <h1 className="page-title">{t('wishlist.title')}</h1>
      {!user && wl.ids.length > 0 && (
        <p className="muted">
          {t('wishlist.guestNote')} <Link to="/login?next=/wishlist">{t('nav.signIn')}</Link>
        </p>
      )}
      {!wl.ids.length ? (
        <EmptyState icon="heart" title={t('wishlist.empty')} body={t('wishlist.emptyBody')} action={<Link to="/shop" className="btn btn--primary">{t('cart.continue')}</Link>} />
      ) : loading && !data ? (
        <LoadingState rows={4} />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <ProductGrid items={(data?.items ?? []).filter((p) => wl.has(p.id))} />
      )}
    </div>
  );
}
