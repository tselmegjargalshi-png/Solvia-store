import { all, get, now, run, tx } from '../db/index.ts';
import { slugify } from '../lib/validate.ts';
import { BLOG_CATEGORIES, BLOG_POSTS, BRANDS, CATEGORIES, FAQS, PRODUCTS } from './catalog-data.ts';

export const productImageName = (slug: string, color?: string) => `/images/products/${slug}-${color ? slugify(color) : 'main'}.webp`;
export const productDetailImageName = (slug: string) => `/images/products/${slug}-detail.webp`;

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();

/** Seed the demo catalog only when the database has no products. Never creates users or admins. */
export async function seedIfEmpty() {
  if (get('SELECT 1 FROM products LIMIT 1')) return false;
  seedCatalog();
  return true;
}

export function seedCatalog() {
  tx(() => {
    const t = now();
    const catIds: Record<string, number> = {};
    for (const c of CATEGORIES) {
      const parent = c.parent ? catIds[c.parent] : null;
      const firstProduct = PRODUCTS.find((p) => p.category === c.slug || CATEGORIES.some((x) => x.parent === c.slug && x.slug === p.category));
      const res = run(
        'INSERT INTO categories (parent_id, slug, name, name_mn, description, image, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
        parent,
        c.slug,
        c.name,
        c.nameMn,
        c.description,
        firstProduct ? productImageName(firstProduct.slug, firstProduct.colors?.[0]?.name) : '',
        c.sort,
        t,
        t,
      );
      catIds[c.slug] = Number(res.lastInsertRowid);
    }
    const brandIds: Record<string, number> = {};
    for (const b of BRANDS) brandIds[b] = Number(run('INSERT INTO brands (slug, name, created_at) VALUES (?,?,?)', slugify(b), b, t).lastInsertRowid);

    for (const p of PRODUCTS) {
      const created = daysAgo(p.daysAgo);
      const optionNames = [p.colors?.length ? 'Color' : null, p.sizes?.length ? 'Size' : null].filter(Boolean);
      const pid = Number(
        run(
          `INSERT INTO products (slug, sku, name, name_mn, short_description, description, specs_json, category_id, brand_id, price, sale_price, status, featured, option_names_json, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?)`,
          p.slug,
          p.sku,
          p.name,
          p.nameMn,
          p.short,
          p.description,
          JSON.stringify(p.specs.map(([label, value]) => ({ label, value }))),
          catIds[p.category],
          brandIds[p.brand],
          p.price,
          p.salePrice ?? null,
          p.featured ? 1 : 0,
          JSON.stringify(optionNames),
          created,
          created,
        ).lastInsertRowid,
      );

      // Images: one per colour (or a single main image), plus a detail shot.
      let sort = 0;
      const colors = p.colors?.length ? p.colors : [null];
      for (const c of colors) {
        run(
          'INSERT INTO product_images (product_id, url, alt, color, sort_order) VALUES (?,?,?,?,?)',
          pid,
          productImageName(p.slug, c?.name),
          `${p.name}${c ? ` in ${c.name}` : ''} on a plain studio background`,
          c?.name ?? '',
          sort++,
        );
      }
      run(
        'INSERT INTO product_images (product_id, url, alt, color, sort_order) VALUES (?,?,?,?,?)',
        pid,
        productDetailImageName(p.slug),
        `Close-up detail of the ${p.name}`,
        '',
        sort++,
      );

      // Variants: the colour × size matrix; a simple product gets one default variant.
      const sizes = p.sizes?.length ? p.sizes : [null];
      let order = 0;
      for (const c of colors) {
        for (const s of sizes) {
          const key = `${c?.name ?? ''}|${s ?? ''}`;
          const keyColorOnly = `${c?.name ?? ''}|`;
          const keySizeOnly = `|${s ?? ''}`;
          const stock = p.stock?.[key] ?? p.stock?.[keyColorOnly] ?? p.stock?.[keySizeOnly] ?? p.defaultStock ?? 10;
          const skuParts = [p.sku, c ? slugify(c.name).slice(0, 4).toUpperCase() : null, s ? slugify(s).toUpperCase() : null].filter(Boolean);
          const sizePrice = s && p.sizePrices?.[s];
          run(
            'INSERT INTO product_variants (product_id, sku, color, color_hex, size, price, sale_price, stock, active, sort_order) VALUES (?,?,?,?,?,?,?,?,1,?)',
            pid,
            skuParts.length > 1 ? skuParts.join('-') : `${p.sku}-STD`,
            c?.name ?? '',
            c?.hex ?? '',
            s ?? '',
            sizePrice && sizePrice !== p.price ? sizePrice : null,
            null,
            stock,
            order++,
          );
        }
      }
    }

    const blogCat: Record<string, number> = {};
    for (const c of BLOG_CATEGORIES) blogCat[c.slug] = Number(run('INSERT INTO blog_categories (slug, name) VALUES (?,?)', c.slug, c.name).lastInsertRowid);
    for (const b of BLOG_POSTS) {
      const d = daysAgo(b.daysAgo);
      run(
        `INSERT INTO blog_posts (slug, title, excerpt, body, image, image_alt, author, category_id, status, is_sample, seo_title, meta_description, published_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,'published',1,?,?,?,?,?)`,
        b.slug,
        b.title,
        b.excerpt,
        b.body,
        `/images/blog/${b.image}.webp`,
        `Illustration for the article “${b.title}”`,
        b.author,
        blogCat[b.category],
        b.title.slice(0, 60),
        b.excerpt.slice(0, 160),
        d,
        d,
        d,
      );
    }
    FAQS.forEach(([q, a, qmn, amn], i) => run('INSERT INTO faqs (question, answer, question_mn, answer_mn, sort_order) VALUES (?,?,?,?,?)', q, a, qmn, amn, i));
    run(
      "INSERT INTO coupons (code, description, type, value, min_subtotal, active) VALUES ('WELCOME10', '10% off orders over ₮100,000 (demo code)', 'percent', 10, 100000, 1)",
    );
  });
  return { products: all('SELECT id FROM products').length };
}
