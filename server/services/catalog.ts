import { all, get, type Row } from '../db/index.ts';
import { notFound } from '../lib/http.ts';

/**
 * Effective-price rules (single source of truth, mirrored in SQL below):
 *   base = variant.price ?? product.price
 *   sale = variant has its own price ? variant.sale_price : (variant.sale_price ?? product.sale_price)
 *   unit price = sale when 0 <= sale < base, otherwise base
 */
export function variantPricing(p: { price: number; sale_price: number | null }, v: { price: number | null; sale_price: number | null }) {
  const base = v.price ?? p.price;
  const sale = v.price != null ? v.sale_price : v.sale_price ?? p.sale_price;
  const onSale = sale != null && sale < base;
  return { base, unit: onSale ? (sale as number) : base, onSale };
}

const BASE_SQL = 'COALESCE(v.price, p.price)';
const SALE_SQL = 'CASE WHEN v.price IS NOT NULL THEN v.sale_price ELSE COALESCE(v.sale_price, p.sale_price) END';
const EFF_SQL = `CASE WHEN (${SALE_SQL}) IS NOT NULL AND (${SALE_SQL}) < ${BASE_SQL} THEN (${SALE_SQL}) ELSE ${BASE_SQL} END`;

export const SORTS = ['featured', 'newest', 'price_asc', 'price_desc', 'name_asc', 'best_selling'] as const;
export type Sort = (typeof SORTS)[number];

export type ListQuery = {
  q?: string;
  category?: string;
  brands?: string[];
  colors?: string[];
  sizes?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
  featured?: boolean;
  sort?: Sort;
  page?: number;
  pageSize?: number;
  ids?: number[];
  excludeId?: number;
};

function likeEscape(s: string) {
  return '%' + s.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

export function categoryWithDescendants(slug: string): number[] {
  const cat = get<Row>('SELECT id FROM categories WHERE slug = ?', slug);
  if (!cat) return [];
  const rows = all<Row>(
    `WITH RECURSIVE tree(id) AS (SELECT ? UNION ALL SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id)
     SELECT id FROM tree`,
    cat.id,
  );
  return rows.map((r) => r.id);
}

/** Build WHERE for the "scope" filters (search + category) that facets are computed within. */
function scopeWhere(q: ListQuery, where: string[], params: any[]) {
  where.push("p.status = 'active'");
  if (q.q) {
    const terms = q.q.trim().split(/\s+/).slice(0, 6);
    for (const t of terms) {
      where.push(
        `(p.name LIKE ? ESCAPE '\\' OR p.name_mn LIKE ? ESCAPE '\\' OR p.short_description LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR b.name LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')`,
      );
      const l = likeEscape(t);
      params.push(l, l, l, l, l, l);
    }
  }
  if (q.category) {
    const ids = categoryWithDescendants(q.category);
    if (!ids.length) where.push('0');
    else {
      where.push(`p.category_id IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    }
  }
  if (q.ids?.length) {
    where.push(`p.id IN (${q.ids.map(() => '?').join(',')})`);
    params.push(...q.ids);
  }
  if (q.excludeId) {
    where.push('p.id <> ?');
    params.push(q.excludeId);
  }
}

const AGG_CTE = `
WITH agg AS (
  SELECT v.product_id,
         MIN(${EFF_SQL}) AS price_from,
         MIN(${BASE_SQL}) AS base_from,
         MAX(CASE WHEN (${SALE_SQL}) IS NOT NULL AND (${SALE_SQL}) < ${BASE_SQL} THEN 1 ELSE 0 END) AS on_sale,
         SUM(v.stock) AS stock,
         COUNT(*) AS variant_count
  FROM product_variants v JOIN products p ON p.id = v.product_id
  WHERE v.active = 1
  GROUP BY v.product_id
),
sold AS (
  SELECT oi.product_id, SUM(oi.quantity) AS units
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE o.status NOT IN ('cancelled','refunded')
  GROUP BY oi.product_id
)`;

export function listProducts(q: ListQuery) {
  const where: string[] = [];
  const params: any[] = [];
  scopeWhere(q, where, params);
  const scopeWhereSql = where.join(' AND ');
  const scopeParams = [...params];

  if (q.brands?.length) {
    where.push(`b.slug IN (${q.brands.map(() => '?').join(',')})`);
    params.push(...q.brands);
  }
  if (q.colors?.length) {
    where.push(
      `EXISTS (SELECT 1 FROM product_variants cv WHERE cv.product_id = p.id AND cv.active = 1 AND cv.color IN (${q.colors.map(() => '?').join(',')}))`,
    );
    params.push(...q.colors);
  }
  if (q.sizes?.length) {
    where.push(
      `EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id = p.id AND sv.active = 1 AND sv.size IN (${q.sizes.map(() => '?').join(',')}))`,
    );
    params.push(...q.sizes);
  }
  if (q.minPrice != null) {
    where.push('agg.price_from >= ?');
    params.push(q.minPrice);
  }
  if (q.maxPrice != null) {
    where.push('agg.price_from <= ?');
    params.push(q.maxPrice);
  }
  if (q.inStock) where.push('agg.stock > 0');
  if (q.onSale) where.push('agg.on_sale = 1');
  if (q.featured) where.push('p.featured = 1');
  if (q.sort === 'best_selling') where.push('COALESCE(sold.units, 0) > 0');

  const order: Record<Sort, string> = {
    featured: 'p.featured DESC, (agg.stock > 0) DESC, p.created_at DESC, p.id DESC',
    newest: 'p.created_at DESC, p.id DESC',
    price_asc: 'agg.price_from ASC, p.id ASC',
    price_desc: 'agg.price_from DESC, p.id ASC',
    name_asc: 'p.name COLLATE NOCASE ASC, p.id ASC',
    best_selling: 'COALESCE(sold.units, 0) DESC, p.id ASC',
  };
  const sort: Sort = q.sort && SORTS.includes(q.sort) ? q.sort : 'featured';
  const pageSize = Math.min(Math.max(q.pageSize ?? 12, 1), 48);
  const page = Math.max(q.page ?? 1, 1);

  const from = `FROM products p
    JOIN agg ON agg.product_id = p.id
    LEFT JOIN sold ON sold.product_id = p.id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id`;
  const whereSql = where.join(' AND ');

  const total = (get<Row>(`${AGG_CTE} SELECT COUNT(*) AS n ${from} WHERE ${whereSql}`, ...params)?.n as number) ?? 0;
  const rows = all<Row>(
    `${AGG_CTE} SELECT p.*, agg.price_from, agg.base_from, agg.on_sale, agg.stock, agg.variant_count,
       COALESCE(sold.units, 0) AS units_sold,
       b.name AS brand_name, b.slug AS brand_slug, c.name AS category_name, c.name_mn AS category_name_mn, c.slug AS category_slug
     ${from} WHERE ${whereSql} ORDER BY ${order[sort]} LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  );

  return {
    items: rows.map(toCard),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    sort,
    facets: facets(scopeWhereSql, scopeParams),
  };
}

function facets(scopeWhereSql: string, params: any[]) {
  const base = `FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id WHERE ${scopeWhereSql}`;
  const brands = all<Row>(
    `SELECT b.slug, b.name, COUNT(*) AS count ${base} AND b.id IS NOT NULL GROUP BY b.id ORDER BY b.name`,
    ...params,
  );
  const colors = all<Row>(
    `SELECT v.color AS value, MAX(v.color_hex) AS hex, COUNT(DISTINCT p.id) AS count
     FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${scopeWhereSql} AND v.active = 1 AND v.color <> '' GROUP BY v.color ORDER BY v.color`,
    ...params,
  );
  const sizes = all<Row>(
    `SELECT v.size AS value, COUNT(DISTINCT p.id) AS count, MIN(v.sort_order) AS so
     FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${scopeWhereSql} AND v.active = 1 AND v.size <> '' GROUP BY v.size ORDER BY so, v.size`,
    ...params,
  );
  const price = get<Row>(
    `${AGG_CTE} SELECT MIN(agg.price_from) AS min, MAX(agg.price_from) AS max FROM products p JOIN agg ON agg.product_id = p.id
     LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id WHERE ${scopeWhereSql}`,
    ...params,
  );
  return {
    brands,
    colors: colors.map(({ value, hex, count }) => ({ value, hex, count })),
    sizes: sizes.map(({ value, count }) => ({ value, count })).sort((a, b) => sizeRank(a.value) - sizeRank(b.value) || a.value.localeCompare(b.value)),
    price: { min: price?.min ?? 0, max: price?.max ?? 0 },
  };
}

const APPAREL_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
function sizeRank(v: string) {
  const i = APPAREL_ORDER.indexOf(v);
  if (i >= 0) return i;
  const n = parseFloat(v);
  if (Number.isFinite(n)) return 100 + n;
  return 10000;
}

function imagesFor(productId: number) {
  return all<Row>('SELECT url, alt, color FROM product_images WHERE product_id = ? ORDER BY sort_order, id', productId);
}

function toCard(r: Row) {
  const imgs = imagesFor(r.id);
  const colors = all<Row>(
    "SELECT DISTINCT color, color_hex FROM product_variants WHERE product_id = ? AND active = 1 AND color <> '' ORDER BY sort_order",
    r.id,
  );
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    nameMn: r.name_mn,
    shortDescription: r.short_description,
    brand: r.brand_name ? { name: r.brand_name, slug: r.brand_slug } : null,
    category: r.category_slug ? { name: r.category_name, nameMn: r.category_name_mn, slug: r.category_slug } : null,
    priceFrom: r.price_from,
    compareAt: r.on_sale ? Math.max(r.base_from, r.price_from) : null,
    onSale: !!r.on_sale,
    priceVaries: r.variant_count > 1 && hasPriceVariance(r.id),
    inStock: r.stock > 0,
    featured: !!r.featured,
    images: imgs.slice(0, 2),
    colors: colors.map((c) => ({ name: c.color, hex: c.color_hex })),
    createdAt: r.created_at,
  };
}

function hasPriceVariance(productId: number) {
  const r = get<Row>(
    `SELECT COUNT(DISTINCT ${EFF_SQL}) AS n FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.product_id = ? AND v.active = 1`,
    productId,
  );
  return (r?.n ?? 1) > 1;
}

export function getProductBySlug(slug: string, opts: { includeInactive?: boolean } = {}) {
  const p = get<Row>(
    `SELECT p.*, b.name AS brand_name, b.slug AS brand_slug, c.name AS category_name, c.name_mn AS category_name_mn, c.slug AS category_slug, c.parent_id AS category_parent
     FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ?`,
    slug,
  );
  if (!p || (!opts.includeInactive && p.status !== 'active')) throw notFound('Product not found.');
  return serializeProduct(p);
}

export function serializeProduct(p: Row) {
  const variants = all<Row>('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order, id', p.id);
  const breadcrumbs: { name: string; nameMn: string; slug: string }[] = [];
  let catId = p.category_id;
  let guard = 0;
  while (catId && guard++ < 6) {
    const c = get<Row>('SELECT id, parent_id, name, name_mn, slug FROM categories WHERE id = ?', catId);
    if (!c) break;
    breadcrumbs.unshift({ name: c.name, nameMn: c.name_mn, slug: c.slug });
    catId = c.parent_id;
  }
  return {
    id: p.id,
    slug: p.slug,
    sku: p.sku,
    name: p.name,
    nameMn: p.name_mn,
    shortDescription: p.short_description,
    description: p.description,
    specs: safeJson(p.specs_json, []),
    optionNames: safeJson(p.option_names_json, []) as string[],
    brand: p.brand_name ? { name: p.brand_name, slug: p.brand_slug } : null,
    category: p.category_slug ? { name: p.category_name, nameMn: p.category_name_mn, slug: p.category_slug } : null,
    breadcrumbs,
    price: p.price,
    salePrice: p.sale_price,
    status: p.status,
    featured: !!p.featured,
    images: imagesFor(p.id),
    variants: variants.map((v) => {
      const pr = variantPricing(p as any, v as any);
      return {
        id: v.id,
        sku: v.sku,
        color: v.color,
        colorHex: v.color_hex,
        size: v.size,
        price: pr.unit,
        compareAt: pr.onSale ? pr.base : null,
        stock: v.stock,
        available: !!v.active && v.stock > 0 && p.status === 'active',
        active: !!v.active,
        ownPrice: v.price,
        ownSalePrice: v.sale_price,
      };
    }),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export function safeJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

export function listCategories() {
  const rows = all<Row>(
    `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count
     FROM categories c ORDER BY c.sort_order, c.name`,
  );
  return rows.map((c) => ({
    id: c.id,
    parentId: c.parent_id,
    slug: c.slug,
    name: c.name,
    nameMn: c.name_mn,
    description: c.description,
    image: c.image,
    sortOrder: c.sort_order,
    productCount: c.product_count,
  }));
}
