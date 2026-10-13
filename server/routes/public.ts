import { all, get, now, run, type Row } from '../db/index.ts';
import { notFound, type Router } from '../lib/http.ts';
import { rateLimit } from '../lib/security.ts';
import { V } from '../lib/validate.ts';
import { getProductBySlug, listCategories, listProducts, SORTS, type ListQuery, type Sort } from '../services/catalog.ts';
import { quote } from '../services/pricing.ts';
import { publicSettings } from '../services/settings.ts';

function csv(v: string | null) {
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20) : undefined;
}
function num(v: string | null) {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

export function parseListQuery(qs: URLSearchParams): ListQuery {
  const sort = qs.get('sort') as Sort | null;
  return {
    q: (qs.get('q') ?? '').slice(0, 100) || undefined,
    category: qs.get('category') || undefined,
    brands: csv(qs.get('brand')),
    colors: csv(qs.get('color')),
    sizes: csv(qs.get('size')),
    minPrice: num(qs.get('minPrice')),
    maxPrice: num(qs.get('maxPrice')),
    inStock: qs.get('inStock') === '1',
    onSale: qs.get('onSale') === '1',
    featured: qs.get('featured') === '1',
    sort: sort && SORTS.includes(sort) ? sort : undefined,
    page: num(qs.get('page')),
    pageSize: num(qs.get('pageSize')),
  };
}

export function serializePost(p: Row, full = false) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    image: p.image,
    imageAlt: p.image_alt,
    author: p.author,
    category: p.category_slug ? { slug: p.category_slug, name: p.category_name } : null,
    status: p.status,
    isSample: !!p.is_sample,
    seoTitle: p.seo_title,
    metaDescription: p.meta_description,
    publishedAt: p.published_at,
    ...(full ? { body: p.body } : {}),
  };
}

const POST_SELECT = `SELECT bp.*, bc.slug AS category_slug, bc.name AS category_name FROM blog_posts bp LEFT JOIN blog_categories bc ON bc.id = bp.category_id`;

export function publicRoutes(r: Router) {
  r.get('/api/health', () => ({ ok: true, time: now() }));
  r.get('/api/settings', () => publicSettings());
  r.get('/api/categories', () => ({ categories: listCategories() }));
  r.get('/api/brands', () => ({ brands: all('SELECT slug, name FROM brands ORDER BY name') }));

  r.get('/api/products', (ctx) => listProducts(parseListQuery(ctx.query)));
  r.get('/api/products/:slug', (ctx) => {
    const product = getProductBySlug(ctx.params.slug);
    const cat = product.category?.slug;
    const related = cat ? listProducts({ category: cat, excludeId: product.id, pageSize: 4, sort: 'featured' }).items : [];
    return { product, related };
  });
  /** Cards for a list of ids (recently viewed, wishlist for guests). Order preserved. */
  r.get('/api/products-by-ids', (ctx) => {
    const ids = (ctx.query.get('ids') ?? '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 24);
    if (!ids.length) return { items: [] };
    const { items } = listProducts({ ids, pageSize: 48 });
    return { items: ids.map((id) => items.find((i) => i.id === id)).filter(Boolean) };
  });

  r.get('/api/home', () => {
    const newArrivals = listProducts({ sort: 'newest', pageSize: 8 }).items;
    const featured = listProducts({ featured: true, pageSize: 8 }).items;
    const bestSellers = listProducts({ sort: 'best_selling', pageSize: 4 }).items;
    const onSale = listProducts({ onSale: true, pageSize: 4 }).items;
    const posts = all<Row>(`${POST_SELECT} WHERE bp.status = 'published' ORDER BY bp.published_at DESC LIMIT 3`).map((p) => serializePost(p));
    return { newArrivals, featured, bestSellers, onSale, posts, categories: listCategories().filter((c) => !c.parentId) };
  });

  /** Server-side cart pricing. The client never decides prices, discounts, shipping or tax. */
  r.post('/api/cart/quote', async (ctx) => {
    const body = await ctx.body();
    return quote(body.items ?? [], { couponCode: body.couponCode || undefined, shippingMethod: body.shippingMethod || undefined });
  });

  r.get('/api/blog', (ctx) => {
    const cat = ctx.query.get('category');
    const page = Math.max(1, Number(ctx.query.get('page')) || 1);
    const pageSize = 9;
    const where = ["bp.status = 'published'"];
    const params: any[] = [];
    if (cat) {
      where.push('bc.slug = ?');
      params.push(cat);
    }
    const total = get<Row>(`SELECT COUNT(*) AS n FROM blog_posts bp LEFT JOIN blog_categories bc ON bc.id = bp.category_id WHERE ${where.join(' AND ')}`, ...params)!.n;
    const posts = all<Row>(`${POST_SELECT} WHERE ${where.join(' AND ')} ORDER BY bp.published_at DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
    return {
      posts: posts.map((p) => serializePost(p)),
      categories: all('SELECT slug, name FROM blog_categories ORDER BY name'),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  });
  r.get('/api/blog/:slug', (ctx) => {
    const p = get<Row>(`${POST_SELECT} WHERE bp.slug = ? AND bp.status = 'published'`, ctx.params.slug);
    if (!p) throw notFound('Article not found.');
    const related = all<Row>(
      `${POST_SELECT} WHERE bp.status = 'published' AND bp.id <> ? ORDER BY (bp.category_id IS ?) DESC, bp.published_at DESC LIMIT 3`,
      p.id,
      p.category_id,
    );
    return { post: serializePost(p, true), related: related.map((x) => serializePost(x)) };
  });

  r.get('/api/faqs', () => ({
    faqs: all<Row>('SELECT id, question, answer, question_mn, answer_mn FROM faqs WHERE published = 1 ORDER BY sort_order, id').map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      questionMn: f.question_mn,
      answerMn: f.answer_mn,
    })),
  }));

  r.post('/api/newsletter', async (ctx) => {
    rateLimit(`newsletter:${ctx.ip}`, 10, 60 * 60_000);
    const v = new V(await ctx.body());
    const email = v.email('email');
    if (!v.bool('consent')) v.fail('consent', 'Please confirm you want to receive emails.');
    v.check();
    run('INSERT INTO newsletter_subscribers (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING', email, now());
    // Same response whether or not the address already existed (no enumeration).
    return { ok: true };
  });

  r.post('/api/contact', async (ctx) => {
    rateLimit(`contact:${ctx.ip}`, 5, 60 * 60_000);
    const v = new V(await ctx.body());
    const name = v.str('name', { required: true, max: 100 });
    const email = v.email('email');
    const subject = v.str('subject', { required: true, max: 150 });
    const message = v.str('message', { required: true, min: 10, max: 4000 });
    v.check();
    run('INSERT INTO contact_messages (name, email, subject, message, created_at) VALUES (?, ?, ?, ?, ?)', name, email, subject, message, now());
    return { ok: true };
  });
}
