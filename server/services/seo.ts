import { all, get, type Row } from '../db/index.ts';
import { env } from '../env.ts';
import { getProductBySlug } from './catalog.ts';
import { getSettings } from './settings.ts';

export type PageMeta = {
  title: string;
  description: string;
  canonical: string;
  image?: string;
  type?: 'website' | 'product' | 'article';
  noindex?: boolean;
  jsonLd?: object[];
  status?: number;
};

const STATIC: Record<string, [string, string]> = {
  '/shop': ['Shop all products', 'Browse the full catalog with filters for category, brand, price, colour, size and availability.'],
  '/search': ['Search', 'Search the catalog.'],
  '/about': ['About us', 'Who we are and how we run the store.'],
  '/blog': ['Journal', 'Guides, product notes and store news.'],
  '/contact': ['Contact us', 'Get in touch with our customer care team.'],
  '/faq': ['Frequently asked questions', 'Answers about orders, delivery, payment and returns.'],
  '/shipping': ['Shipping & delivery', 'Delivery methods, fees, timing and coverage.'],
  '/returns': ['Returns & refunds', 'How returns, exchanges and refunds work.'],
  '/privacy': ['Privacy policy', 'How we collect, use and protect personal data.'],
  '/terms': ['Terms & conditions', 'The terms that apply when you shop with us.'],
  '/new-arrivals': ['New arrivals', 'The latest additions to the catalog.'],
  '/best-sellers': ['Best sellers', 'Products customers order most.'],
  '/offers': ['Offers', 'Products currently on sale.'],
};
const PRIVATE = /^\/(cart|checkout|account|wishlist|login|register|forgot-password|reset-password|order|admin)(\/|$)/;

function abs(p: string) {
  return p.startsWith('http') ? p : env.publicUrl + p;
}

function formatPrice(amount: number, decimals: number) {
  return (amount / 10 ** decimals).toFixed(decimals);
}

export function metaFor(pathname: string): PageMeta {
  const s = getSettings();
  const name = s.storeName;
  const canonical = env.publicUrl + (pathname === '/' ? '/' : pathname.replace(/\/$/, ''));
  const base: PageMeta = { title: `${name} — ${s.tagline}`, description: s.description, canonical, image: '/images/og-default.jpg', type: 'website' };

  if (pathname === '/') {
    return {
      ...base,
      jsonLd: [
        { '@context': 'https://schema.org', '@type': 'Organization', name, url: env.publicUrl, logo: abs('/images/og-default.jpg'), sameAs: Object.values(s.social).filter(Boolean) },
        { '@context': 'https://schema.org', '@type': 'WebSite', name, url: env.publicUrl, potentialAction: { '@type': 'SearchAction', target: `${env.publicUrl}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' } },
      ],
    };
  }
  if (PRIVATE.test(pathname)) return { ...base, title: `${name}`, noindex: true };
  if (STATIC[pathname]) return { ...base, title: `${STATIC[pathname][0]} | ${name}`, description: STATIC[pathname][1] };

  let m = /^\/category\/([^/]+)$/.exec(pathname);
  if (m) {
    const c = get<Row>('SELECT name, description, image FROM categories WHERE slug = ?', m[1]);
    if (!c) return { ...base, title: `Page not found | ${name}`, noindex: true, status: 404 };
    return {
      ...base,
      title: `${c.name} | ${name}`,
      description: c.description || `Shop ${c.name} at ${name}.`,
      image: c.image || base.image,
      jsonLd: [breadcrumb([['Home', '/'], ['Shop', '/shop'], [c.name, pathname]])],
    };
  }

  m = /^\/product\/([^/]+)$/.exec(pathname);
  if (m) {
    try {
      const p = getProductBySlug(m[1]);
      const offers = p.variants
        .filter((v) => v.active)
        .map((v) => ({
          '@type': 'Offer',
          sku: v.sku,
          price: formatPrice(v.price, s.currency.decimals),
          priceCurrency: s.currency.code,
          availability: v.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url: canonical,
          itemCondition: 'https://schema.org/NewCondition',
        }));
      const crumbs: [string, string][] = [['Home', '/'], ['Shop', '/shop'], ...p.breadcrumbs.map((b) => [b.name, `/category/${b.slug}`] as [string, string]), [p.name, pathname]];
      return {
        ...base,
        title: `${p.name}${p.brand ? ` by ${p.brand.name}` : ''} | ${name}`,
        description: p.shortDescription || p.description.slice(0, 155),
        image: p.images[0]?.url ?? base.image,
        type: 'product',
        // No aggregateRating/review markup: the store has no verified reviews.
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: p.name,
            sku: p.sku,
            description: p.shortDescription || p.description,
            image: p.images.map((i) => abs(i.url)),
            brand: p.brand ? { '@type': 'Brand', name: p.brand.name } : undefined,
            category: p.category?.name,
            offers: offers.length === 1 ? offers[0] : offers,
          },
          breadcrumb(crumbs),
        ],
      };
    } catch {
      return { ...base, title: `Product not found | ${name}`, noindex: true, status: 404 };
    }
  }

  m = /^\/blog\/([^/]+)$/.exec(pathname);
  if (m) {
    const post = get<Row>("SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'", m[1]);
    if (!post) return { ...base, title: `Article not found | ${name}`, noindex: true, status: 404 };
    return {
      ...base,
      title: `${post.seo_title || post.title} | ${name}`,
      description: post.meta_description || post.excerpt,
      image: post.image || base.image,
      type: 'article',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: post.title,
          datePublished: post.published_at,
          dateModified: post.updated_at,
          author: { '@type': 'Person', name: post.author },
          image: post.image ? [abs(post.image)] : undefined,
          publisher: { '@type': 'Organization', name },
        },
        breadcrumb([['Home', '/'], ['Journal', '/blog'], [post.title, pathname]]),
      ],
    };
  }
  return { ...base, title: `Page not found | ${name}`, noindex: true, status: 404 };
}

function breadcrumb(items: [string, string][]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([n, p], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: abs(p) })),
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderHead(meta: PageMeta) {
  const s = getSettings();
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}">`,
    `<link rel="canonical" href="${esc(meta.canonical)}">`,
    meta.noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow">',
    `<meta property="og:site_name" content="${esc(s.storeName)}">`,
    `<meta property="og:type" content="${meta.type === 'product' ? 'product' : meta.type === 'article' ? 'article' : 'website'}">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:url" content="${esc(meta.canonical)}">`,
    meta.image ? `<meta property="og:image" content="${esc(abs(meta.image))}">` : '',
    '<meta name="twitter:card" content="summary_large_image">',
    env.gscVerification ? `<meta name="google-site-verification" content="${esc(env.gscVerification)}">` : '',
    ...(meta.jsonLd ?? []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`),
  ];
  return tags.filter(Boolean).join('\n    ');
}

export function sitemapXml() {
  const urls: { loc: string; lastmod?: string }[] = [{ loc: '/' }];
  for (const p of Object.keys(STATIC)) if (p !== '/search') urls.push({ loc: p });
  for (const c of all<Row>('SELECT slug, updated_at FROM categories')) urls.push({ loc: `/category/${c.slug}`, lastmod: c.updated_at });
  for (const p of all<Row>("SELECT slug, updated_at FROM products WHERE status = 'active'")) urls.push({ loc: `/product/${p.slug}`, lastmod: p.updated_at });
  for (const b of all<Row>("SELECT slug, updated_at FROM blog_posts WHERE status = 'published'")) urls.push({ loc: `/blog/${b.slug}`, lastmod: b.updated_at });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${esc(env.publicUrl + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ''}</url>`).join('\n') +
    '\n</urlset>\n'
  );
}

export function robotsTxt() {
  return `User-agent: *
Disallow: /admin
Disallow: /account
Disallow: /cart
Disallow: /checkout
Disallow: /order/
Disallow: /api/
Allow: /

Sitemap: ${env.publicUrl}/sitemap.xml
`;
}
