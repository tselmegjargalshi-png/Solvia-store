import { Pagination } from '../components/nav.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useSeo } from '../lib/seo.ts';
import type { Post } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { useSearchParams } from '../router.tsx';
import { PostCard } from './Home.tsx';

export default function Blog() {
  const { t } = useI18n();
  const [qs, setQs] = useSearchParams();
  const cat = qs.get('category') ?? '';
  const page = Number(qs.get('page')) || 1;
  useSeo({ title: t('blog.title'), description: t('blog.body') });
  const { data, error, loading, reload } = useApi<{ posts: Post[]; categories: { slug: string; name: string }[]; page: number; pages: number }>(`/api/blog?${new URLSearchParams({ ...(cat ? { category: cat } : {}), page: String(page) })}`);
  return (
    <div className="container section">
      <header className="page-head">
        <h1 className="page-title">{t('blog.title')}</h1>
        <p className="page-lede">{t('blog.body')}</p>
      </header>
      {data && (
        <div className="chips chips--tabs" role="group" aria-label={t('shop.category')}>
          <button className={`chip ${!cat ? 'is-active' : ''}`} aria-pressed={!cat} onClick={() => setQs({ category: null, page: null })}>
            {t('blog.all')}
          </button>
          {data.categories.map((c) => (
            <button key={c.slug} className={`chip ${cat === c.slug ? 'is-active' : ''}`} aria-pressed={cat === c.slug} onClick={() => setQs({ category: c.slug, page: null })}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !data!.posts.length ? (
        <EmptyState icon="file" title={t('blog.empty')} />
      ) : (
        <>
          <ul className="post-grid">
            {data!.posts.map((p) => (
              <li key={p.id}>
                <PostCard p={p} />
              </li>
            ))}
          </ul>
          <Pagination page={data!.page} pages={data!.pages} onChange={(p) => setQs({ page: p > 1 ? String(p) : null })} />
        </>
      )}
    </div>
  );
}
