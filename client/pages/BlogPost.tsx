import { Breadcrumbs } from '../components/nav.tsx';
import { ProductImage } from '../components/product.tsx';
import { Prose } from '../components/Prose.tsx';
import { EmptyState, ErrorState, FormAlert, LoadingState } from '../components/ui.tsx';
import { useI18n } from '../i18n/index.tsx';
import { useFormat } from '../lib/format.ts';
import { useSeo } from '../lib/seo.ts';
import type { Post } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { Link } from '../router.tsx';
import { PostCard } from './Home.tsx';

export default function BlogPost({ params }: { params: { slug: string } }) {
  const { t } = useI18n();
  const { date } = useFormat();
  const { data, error, loading, reload } = useApi<{ post: Post; related: Post[] }>(`/api/blog/${encodeURIComponent(params.slug)}`);
  const p = data?.post;
  useSeo({ title: p ? p.seoTitle || p.title : t('blog.title'), description: p?.metaDescription || p?.excerpt });
  if (loading && !p) return <div className="container section"><LoadingState /></div>;
  if (error?.status === 404) return <div className="container section"><EmptyState icon="file" title={t('common.notFound')} action={<Link to="/blog" className="btn btn--primary">{t('blog.title')}</Link>} /></div>;
  if (error || !p) return <div className="container section"><ErrorState onRetry={reload} /></div>;
  return (
    <article className="container article">
      <Breadcrumbs items={[{ label: t('nav.home'), to: '/' }, { label: t('blog.title'), to: '/blog' }, { label: p.title }]} />
      <header className="article__head">
        <p className="eyebrow">{p.category?.name}</p>
        <h1 className="article__title">{p.title}</h1>
        <p className="article__meta">
          {t('blog.by', { author: p.author })} · {p.publishedAt && <time dateTime={p.publishedAt}>{date(p.publishedAt)}</time>}
        </p>
      </header>
      {p.image && (
        <figure className="article__figure">
          <ProductImage src={p.image} alt={p.imageAlt} aspect="16 / 10" eager sizes="(max-width: 900px) 100vw, 860px" />
        </figure>
      )}
      {p.isSample && <FormAlert tone="info">{t('blog.sampleNote')}</FormAlert>}
      <div className="article__body">
        <Prose text={p.body ?? ''} />
      </div>
      {data!.related.length > 0 && (
        <section className="section" aria-labelledby="rel-posts">
          <h2 id="rel-posts" className="section-title">
            {t('blog.related')}
          </h2>
          <ul className="post-grid">
            {data!.related.map((r) => (
              <li key={r.id}>
                <PostCard p={r} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
