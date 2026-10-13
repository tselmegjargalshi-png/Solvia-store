import { Icon } from '../components/Icon.tsx';
import { ProductGrid, ProductImage, srcSetFor } from '../components/product.tsx';
import { ErrorState, LoadingState } from '../components/ui.tsx';
import { useI18n, useLocalized } from '../i18n/index.tsx';
import { useFormat } from '../lib/format.ts';
import { useSeo } from '../lib/seo.ts';
import type { Category, Post, ProductCard } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { Link } from '../router.tsx';
import { useSettings } from '../state/settings.tsx';

type HomeData = { newArrivals: ProductCard[]; featured: ProductCard[]; bestSellers: ProductCard[]; onSale: ProductCard[]; posts: Post[]; categories: Category[] };

function SectionHead({ id, eyebrow, title, body, to, linkLabel }: { id?: string; eyebrow?: string; title: string; body?: string; to?: string; linkLabel?: string }) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 id={id} className="section-title">
          {title}
        </h2>
        {body && <p className="section-body">{body}</p>}
      </div>
      {to && (
        <Link to={to} className="link-arrow">
          {linkLabel} <Icon name="arrowRight" size={16} />
        </Link>
      )}
    </div>
  );
}

export function PostCard({ p }: { p: Post }) {
  const { date } = useFormat();
  const { t } = useI18n();
  return (
    <article className="post-card">
      <Link to={`/blog/${p.slug}`} className="post-card__media" tabIndex={-1} aria-hidden="true">
        <ProductImage src={p.image} alt="" aspect="16 / 10" sizes="(max-width: 640px) 100vw, 33vw" />
      </Link>
      <div className="post-card__body">
        <p className="post-card__meta">
          {p.category?.name}
          {p.publishedAt && <> · <time dateTime={p.publishedAt}>{date(p.publishedAt)}</time></>}
          {p.isSample && <span className="tag-sample">{t('common.sample')}</span>}
        </p>
        <h3 className="post-card__title">
          <Link to={`/blog/${p.slug}`}>{p.title}</Link>
        </h3>
        <p className="post-card__excerpt">{p.excerpt}</p>
      </div>
    </article>
  );
}

export default function Home() {
  const { t } = useI18n();
  const L = useLocalized();
  const s = useSettings();
  const { money } = useFormat();
  useSeo({});
  const { data, error, loading, reload } = useApi<HomeData>('/api/home');

  const collections = [
    { title: t('home.col1'), body: t('home.col1Body'), to: '/category/audio-tech', img: '/images/products/studio-wireless-headphones-detail.webp' },
    { title: t('home.col2'), body: t('home.col2Body'), to: '/category/outerwear', img: '/images/products/quilted-down-jacket-detail.webp' },
    { title: t('home.col3'), body: t('home.col3Body'), to: '/category/kitchen-dining', img: '/images/products/pour-over-kettle-detail.webp' },
  ];

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <picture className="hero__media">
          <source media="(min-width: 900px)" srcSet="/images/hero/hero-wide-900.webp 900w, /images/hero/hero-wide-1400.webp 1400w, /images/hero/hero-wide.webp 2000w" sizes="100vw" />
          <img src="/images/hero/hero-tall-700.webp" srcSet="/images/hero/hero-tall-700.webp 700w, /images/hero/hero-tall.webp 1000w" sizes="100vw" alt="" width={1000} height={1250} fetchPriority="high" decoding="async" />
        </picture>
        <div className="container hero__inner">
          <div className="hero__copy">
            <p className="eyebrow eyebrow--gold">{t('home.heroEyebrow')}</p>
            <h1 id="hero-title" className="hero__title">
              {t('home.heroTitle')
                .split('\n')
                .map((line, i) => (
                  <span key={i} className="hero__line">
                    {line}
                  </span>
                ))}
            </h1>
            <p className="hero__body">{t('home.heroBody')}</p>
            <div className="hero__ctas">
              <Link to="/shop" className="btn btn--gold btn--lg">
                {t('home.heroCta')} <Icon name="arrowRight" size={18} />
              </Link>
              <a href="#categories" className="btn btn--outline-light btn--lg">
                {t('home.heroCta2')}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--tight benefits-strip" aria-label={t('home.benefitsTitle')}>
        <div className="container">
          <ul className="benefits">
            {[
              ['tag', 'home.benefit1', 'home.benefit1Body'],
              ['box', 'home.benefit2', 'home.benefit2Body'],
              ['truck', 'home.benefit3', 'home.benefit3Body'],
              ['refresh', 'home.benefit4', 'home.benefit4Body'],
            ].map(([icon, title, body]) => (
              <li key={title} className="benefit">
                <span className="benefit__icon">
                  <Icon name={icon} size={22} />
                </span>
                <div>
                  <h3 className="benefit__title">{t(title as any)}</h3>
                  <p className="benefit__body">{t(body as any)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {loading && !data && (
        <div className="container section">
          <LoadingState rows={4} />
        </div>
      )}
      {error && !data && (
        <div className="container section">
          <ErrorState onRetry={reload} />
        </div>
      )}

      {data && (
        <>
          <section className="section" id="categories" aria-labelledby="cat-title">
            <div className="container">
              <div className="section-head">
                <div>
                  <h2 id="cat-title" className="section-title">
                    {t('home.categories')}
                  </h2>
                  <p className="section-body">{t('home.categoriesBody')}</p>
                </div>
                <Link to="/shop" className="link-arrow">
                  {t('home.viewAll')} <Icon name="arrowRight" size={16} />
                </Link>
              </div>
              <ul className="cat-grid">
                {data.categories.map((c) => (
                  <li key={c.id}>
                    <Link to={`/category/${c.slug}`} className="cat-tile">
                      <ProductImage src={c.image} alt="" sizes="(max-width: 640px) 50vw, 16vw" aspect="4 / 5" />
                      <span className="cat-tile__label">
                        <span className="cat-tile__name">{L(c.name, c.nameMn)}</span>
                        <Icon name="arrowRight" size={16} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="section section--alt" aria-labelledby="new-title">
            <div className="container">
              <SectionHead id="new-title" title={t('home.newArrivals')} to="/new-arrivals" linkLabel={t('home.viewAll')} />
              <ProductGrid items={data.newArrivals.slice(0, 8)} />
            </div>
          </section>

          {s.promo.enabled && s.promo.title && (
            <section className="promo" aria-labelledby="promo-title">
              <img className="promo__img" src="/images/promo/promo-outerwear-1100.webp" srcSet="/images/promo/promo-outerwear-700.webp 700w, /images/promo/promo-outerwear-1100.webp 1100w, /images/promo/promo-outerwear.webp 1800w" sizes="100vw" alt="" loading="lazy" decoding="async" width={1800} height={900} />
              <div className="container promo__inner">
                <div className="promo__copy">
                  {s.promo.eyebrow && <p className="eyebrow eyebrow--gold">{s.promo.eyebrow}</p>}
                  <h2 id="promo-title" className="promo__title">
                    {s.promo.title}
                  </h2>
                  {s.promo.body && <p className="promo__body">{s.promo.body}</p>}
                  {s.promo.ctaLabel && (
                    <Link to={s.promo.ctaHref || '/shop'} className="btn btn--gold">
                      {s.promo.ctaLabel} <Icon name="arrowRight" size={16} />
                    </Link>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="section" aria-labelledby="col-title">
            <div className="container">
              <SectionHead id="col-title" title={t('home.collectionsTitle')} />
              <ul className="collections">
                {collections.map((c) => (
                  <li key={c.to}>
                    <Link to={c.to} className="collection">
                      <ProductImage src={c.img} alt="" aspect="4 / 5" sizes="(max-width: 640px) 100vw, 33vw" />
                      <span className="collection__text">
                        <span className="collection__title">{c.title}</span>
                        <span className="collection__body">{c.body}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="section section--alt" aria-labelledby="feat-title">
            <div className="container">
              <SectionHead id="feat-title" eyebrow={t('home.featured')} title={t('home.featuredBody')} to="/shop?sort=featured" linkLabel={t('home.viewAll')} />
              <ProductGrid items={data.featured.slice(0, 8)} />
            </div>
          </section>

          {data.bestSellers.length >= 2 && (
            <section className="section" aria-labelledby="best-title">
              <div className="container">
                <SectionHead id="best-title" title={t('home.bestSellers')} body={t('home.bestSellersNote')} to="/best-sellers" linkLabel={t('home.viewAll')} />
                <ProductGrid items={data.bestSellers} />
              </div>
            </section>
          )}

          {data.onSale.length > 0 && (
            <section className="section section--alt" aria-labelledby="offer-title">
              <div className="container">
                <SectionHead id="offer-title" title={t('home.recommended')} to="/offers" linkLabel={t('home.viewAll')} />
                <ProductGrid items={data.onSale} />
              </div>
            </section>
          )}

          <section className="section section--navy" aria-labelledby="rev-title">
            <div className="container reviews-note">
              <div>
                <p className="eyebrow eyebrow--gold">{t('home.reviewsTitle')}</p>
                <h2 id="rev-title" className="section-title section-title--light">
                  {t('home.benefit1')} · {t('home.benefit2')} · {t('home.benefit3')}
                </h2>
              </div>
              <p className="reviews-note__body">
                {t('home.reviewsBody')} {s.shipping.freeShippingThreshold > 0 && t('home.freeOver', { amount: money(s.shipping.freeShippingThreshold) })}
              </p>
            </div>
          </section>

          {data.posts.length > 0 && (
            <section className="section" aria-labelledby="journal-title">
              <div className="container">
                <SectionHead id="journal-title" title={t('home.journal')} to="/blog" linkLabel={t('home.viewAll')} />
                <ul className="post-grid">
                  {data.posts.map((p) => (
                    <li key={p.id}>
                      <PostCard p={p} />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
