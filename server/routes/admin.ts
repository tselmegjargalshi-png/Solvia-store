import { LOW_STOCK_THRESHOLD } from '../../config/brand.ts';
import { all, get, now, run, tx, type Row } from '../db/index.ts';
import { badRequest, conflict, notFound, type Ctx, type Router } from '../lib/http.ts';
import { slugify, V } from '../lib/validate.ts';
import { requireAdmin } from '../services/auth.ts';
import { listCategories, serializeProduct } from '../services/catalog.ts';
import {
  changeOrderStatus,
  changePaymentStatusManually,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  rejectCancellation,
  serializeOrder,
  type OrderStatus,
  type PaymentStatus,
} from '../services/orders.ts';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../services/settings.ts';
import { MAX_UPLOAD_BYTES, saveImageUpload } from '../services/uploads.ts';
import { serializePost } from './public.ts';

const actorOf = (ctx: Ctx) => `admin:${ctx.user!.email}`;

/** Wrap every admin handler so authorization runs server-side before anything else. */
function admin(r: Router) {
  const wrap =
    (h: (ctx: Ctx) => unknown) =>
    (ctx: Ctx) => {
      requireAdmin(ctx);
      return h(ctx);
    };
  return {
    get: (p: string, h: (ctx: Ctx) => unknown) => r.get(p, wrap(h)),
    post: (p: string, h: (ctx: Ctx) => unknown) => r.post(p, wrap(h)),
    put: (p: string, h: (ctx: Ctx) => unknown) => r.put(p, wrap(h)),
    patch: (p: string, h: (ctx: Ctx) => unknown) => r.patch(p, wrap(h)),
    delete: (p: string, h: (ctx: Ctx) => unknown) => r.delete(p, wrap(h)),
  };
}

const money = (v: V, key: string, required = false) => v.int(key, { required, min: 0, max: 1_000_000_000 });

export function adminRoutes(router: Router) {
  const r = admin(router);

  // ---------------- Dashboard ----------------
  r.get('/api/admin/dashboard', () => {
    const counted = "status NOT IN ('cancelled')";
    const totals = get<Row>(`SELECT COUNT(*) AS orders,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.id AND p.is_demo = 1) THEN total END), 0) AS revenue,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id = orders.id AND p.is_demo = 1) THEN total END), 0) AS demo_revenue,
        COALESCE(SUM(CASE WHEN ${counted} THEN total END), 0) AS gross_ordered,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN cancel_requested = 1 THEN 1 ELSE 0 END) AS cancel_requests
      FROM orders`)!;
    const products = get<Row>("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active FROM products")!;
    const lowStock = all<Row>(
      `SELECT v.id, v.sku, v.color, v.size, v.stock, p.name, p.slug, p.id AS product_id FROM product_variants v JOIN products p ON p.id = v.product_id
       WHERE p.status = 'active' AND v.active = 1 AND v.stock <= ? ORDER BY v.stock ASC, p.name LIMIT 12`,
      LOW_STOCK_THRESHOLD,
    );
    const recent = all<Row>('SELECT * FROM orders ORDER BY created_at DESC LIMIT 8');
    const days: { date: string; orders: number; total: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      const row = get<Row>(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS t FROM orders WHERE substr(created_at, 1, 10) = ? AND ${counted}`, d)!;
      days.push({ date: d, orders: row.n, total: row.t });
    }
    return {
      totals: {
        orders: totals.orders,
        revenuePaid: totals.revenue,
        revenueDemo: totals.demo_revenue,
        grossOrdered: totals.gross_ordered,
        pendingOrders: totals.pending ?? 0,
        cancelRequests: totals.cancel_requests ?? 0,
        products: products.total,
        activeProducts: products.active ?? 0,
        customers: get<Row>("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'")!.n,
        subscribers: get<Row>('SELECT COUNT(*) AS n FROM newsletter_subscribers')!.n,
        messages: get<Row>('SELECT COUNT(*) AS n FROM contact_messages')!.n,
      },
      lowStock: lowStock.map((v) => ({ variantId: v.id, productId: v.product_id, sku: v.sku, name: v.name, slug: v.slug, label: [v.color, v.size].filter(Boolean).join(' / '), stock: v.stock })),
      recentOrders: recent.map(orderRow),
      salesByDay: days,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    };
  });

  // ---------------- Products ----------------
  r.get('/api/admin/products', (ctx) => {
    const q = ctx.query.get('q')?.trim();
    const status = ctx.query.get('status');
    const where: string[] = ['1'];
    const params: any[] = [];
    if (q) {
      where.push('(p.name LIKE ? OR p.sku LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (status && ['draft', 'active', 'archived'].includes(status)) {
      where.push('p.status = ?');
      params.push(status);
    }
    const rows = all<Row>(
      `SELECT p.id, p.name, p.slug, p.sku, p.price, p.sale_price, p.status, p.featured, p.updated_at, c.name AS category, b.name AS brand,
        (SELECT SUM(stock) FROM product_variants v WHERE v.product_id = p.id AND v.active = 1) AS stock,
        (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id) AS variants,
        (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY sort_order LIMIT 1) AS image
       FROM products p LEFT JOIN categories c ON c.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
       WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC`,
      ...params,
    );
    return {
      products: rows.map((p) => ({
        id: p.id, name: p.name, slug: p.slug, sku: p.sku, price: p.price, salePrice: p.sale_price, status: p.status, featured: !!p.featured,
        category: p.category, brand: p.brand, stock: p.stock ?? 0, variants: p.variants, image: p.image, updatedAt: p.updated_at,
      })),
    };
  });

  r.get('/api/admin/products/:id', (ctx) => {
    const p = get<Row>('SELECT * FROM products WHERE id = ?', Number(ctx.params.id));
    if (!p) throw notFound('Product not found.');
    return { product: { ...serializeProduct(p), categoryId: p.category_id, brandId: p.brand_id } };
  });

  function readProduct(body: any, existingId: number | null) {
    const v = new V(body);
    const name = v.str('name', { required: true, max: 140 });
    const slug = slugify(v.str('slug', { max: 90 }) || name);
    if (!slug) v.fail('slug', 'Enter a URL slug.');
    if (slug && get('SELECT 1 FROM products WHERE slug = ? AND id IS NOT ?', slug, existingId)) v.fail('slug', 'Another product already uses this slug.');
    const sku = v.str('sku', { required: true, max: 40, pattern: /^[A-Za-z0-9-_.]+$/, msg: 'Use letters, numbers, dashes or dots.' }).toUpperCase();
    if (sku && get('SELECT 1 FROM products WHERE sku = ? AND id IS NOT ?', sku, existingId)) v.fail('sku', 'Another product already uses this SKU.');
    const price = money(v, 'price', true);
    const salePrice = money(v, 'salePrice');
    if (price != null && salePrice != null && salePrice >= price) v.fail('salePrice', 'Sale price must be lower than the regular price.');
    const status = v.oneOf('status', ['draft', 'active', 'archived'] as const);
    const categoryId = v.int('categoryId');
    if (categoryId && !get('SELECT 1 FROM categories WHERE id = ?', categoryId)) v.fail('categoryId', 'Unknown category.');
    const brandId = v.int('brandId');
    if (brandId && !get('SELECT 1 FROM brands WHERE id = ?', brandId)) v.fail('brandId', 'Unknown brand.');

    const specs = (Array.isArray(body.specs) ? body.specs : [])
      .map((s: any) => ({ label: String(s?.label ?? '').trim().slice(0, 60), value: String(s?.value ?? '').trim().slice(0, 200) }))
      .filter((s: any) => s.label && s.value)
      .slice(0, 30);
    const images = (Array.isArray(body.images) ? body.images : [])
      .map((i: any) => ({ url: String(i?.url ?? '').trim(), alt: String(i?.alt ?? '').trim().slice(0, 200), color: String(i?.color ?? '').trim().slice(0, 40) }))
      .filter((i: any) => /^\/(images|uploads)\/[A-Za-z0-9/_.-]+$/.test(i.url))
      .slice(0, 12);
    images.forEach((img: any, idx: number) => {
      if (!img.alt) v.fail(`images.${idx}.alt`, 'Add alt text describing the image.');
    });

    const rawVariants: any[] = Array.isArray(body.variants) ? body.variants.slice(0, 100) : [];
    if (!rawVariants.length) v.fail('variants', 'Add at least one variant (a simple product has one).');
    const seen = new Set<string>();
    const variants = rawVariants.map((rv, i) => {
      const vv = new V(rv);
      const out = {
        id: vv.int('id'),
        sku: vv.str('sku', { required: true, max: 50, pattern: /^[A-Za-z0-9-_.]+$/ }).toUpperCase(),
        color: vv.str('color', { max: 40 }),
        colorHex: vv.str('colorHex', { max: 7, pattern: /^#[0-9A-Fa-f]{6}$/ }),
        size: vv.str('size', { max: 20 }),
        price: money(vv, 'price'),
        salePrice: money(vv, 'salePrice'),
        stock: vv.int('stock', { required: true, min: 0, max: 1_000_000 }) ?? 0,
        active: rv.active === undefined ? true : vv.bool('active'),
      };
      const combo = `${out.color}|${out.size}`;
      if (seen.has(combo)) vv.fail('color', 'Duplicate color/size combination.');
      seen.add(combo);
      const effBase = out.price ?? price ?? 0;
      if (out.salePrice != null && out.salePrice >= effBase) vv.fail('salePrice', 'Must be lower than the price.');
      if (out.sku) {
        const clash = get<Row>('SELECT product_id FROM product_variants WHERE sku = ? AND id IS NOT ?', out.sku, out.id);
        if (clash) vv.fail('sku', 'SKU already used.');
      }
      for (const [k, msg] of Object.entries(vv.errors)) v.fail(`variants.${i}.${k}`, msg);
      return out;
    });
    const optionNames = [variants.some((x) => x.color) && 'Color', variants.some((x) => x.size) && 'Size'].filter(Boolean);
    const data = {
      name,
      nameMn: v.str('nameMn', { max: 140 }),
      slug,
      sku,
      shortDescription: v.str('shortDescription', { max: 300 }),
      description: v.str('description', { max: 8000 }),
      specs,
      categoryId,
      brandId,
      price: price ?? 0,
      salePrice,
      status: status || 'draft',
      featured: v.bool('featured'),
      images,
      variants,
      optionNames,
    };
    v.check();
    return data;
  }

  function writeProduct(id: number, d: ReturnType<typeof readProduct>) {
    const t = now();
    run(
      `UPDATE products SET name=?, name_mn=?, slug=?, sku=?, short_description=?, description=?, specs_json=?, category_id=?, brand_id=?,
         price=?, sale_price=?, status=?, featured=?, option_names_json=?, updated_at=? WHERE id = ?`,
      d.name, d.nameMn, d.slug, d.sku, d.shortDescription, d.description, JSON.stringify(d.specs), d.categoryId, d.brandId,
      d.price, d.salePrice, d.status, d.featured ? 1 : 0, JSON.stringify(d.optionNames), t, id,
    );
    run('DELETE FROM product_images WHERE product_id = ?', id);
    d.images.forEach((img, i) => run('INSERT INTO product_images (product_id, url, alt, color, sort_order) VALUES (?, ?, ?, ?, ?)', id, img.url, img.alt, img.color, i));

    const keep = new Set<number>();
    // Clear SKUs first so swaps between rows don't trip the UNIQUE constraint.
    d.variants.forEach((vr, i) => {
      if (vr.id && get('SELECT 1 FROM product_variants WHERE id = ? AND product_id = ?', vr.id, id)) {
        run('UPDATE product_variants SET sku = ?, color = ?, size = ? WHERE id = ?', `__tmp_${vr.id}`, `__tmp_${vr.id}`, `__tmp_${i}`, vr.id);
      }
    });
    d.variants.forEach((vr, i) => {
      if (vr.id && get('SELECT 1 FROM product_variants WHERE id = ? AND product_id = ?', vr.id, id)) {
        run(
          'UPDATE product_variants SET sku=?, color=?, color_hex=?, size=?, price=?, sale_price=?, stock=?, active=?, sort_order=? WHERE id = ?',
          vr.sku, vr.color, vr.colorHex, vr.size, vr.price, vr.salePrice, vr.stock, vr.active ? 1 : 0, i, vr.id,
        );
        keep.add(vr.id);
      } else {
        const res = run(
          'INSERT INTO product_variants (product_id, sku, color, color_hex, size, price, sale_price, stock, active, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)',
          id, vr.sku, vr.color, vr.colorHex, vr.size, vr.price, vr.salePrice, vr.stock, vr.active ? 1 : 0, i,
        );
        keep.add(Number(res.lastInsertRowid));
      }
    });
    for (const old of all<Row>('SELECT id FROM product_variants WHERE product_id = ?', id)) {
      if (!keep.has(old.id)) run('DELETE FROM product_variants WHERE id = ?', old.id); // order_items keep their snapshot (FK set null)
    }
  }

  r.post('/api/admin/products', async (ctx) => {
    const d = readProduct(await ctx.body(), null);
    const id = tx(() => {
      const t = now();
      const res = run('INSERT INTO products (slug, sku, name, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', d.slug, d.sku, d.name, d.price, t, t);
      const id = Number(res.lastInsertRowid);
      writeProduct(id, d);
      return id;
    });
    return { id };
  });

  r.put('/api/admin/products/:id', async (ctx) => {
    const id = Number(ctx.params.id);
    if (!get('SELECT 1 FROM products WHERE id = ?', id)) throw notFound('Product not found.');
    const d = readProduct(await ctx.body(), id);
    tx(() => writeProduct(id, d));
    return { id };
  });

  /** Quick stock/price/feature edits from the list without resending the whole product. */
  r.patch('/api/admin/products/:id', async (ctx) => {
    const id = Number(ctx.params.id);
    const p = get<Row>('SELECT * FROM products WHERE id = ?', id);
    if (!p) throw notFound('Product not found.');
    const body = await ctx.body();
    if (body.status !== undefined) {
      if (!['draft', 'active', 'archived'].includes(body.status)) throw badRequest('Invalid status.');
      run('UPDATE products SET status = ?, updated_at = ? WHERE id = ?', body.status, now(), id);
    }
    if (body.featured !== undefined) run('UPDATE products SET featured = ?, updated_at = ? WHERE id = ?', body.featured ? 1 : 0, now(), id);
    return { ok: true };
  });

  r.patch('/api/admin/variants/:id/stock', async (ctx) => {
    const v = new V(await ctx.body());
    const stock = v.int('stock', { required: true, min: 0, max: 1_000_000 });
    v.check();
    const res = run('UPDATE product_variants SET stock = ? WHERE id = ?', stock, Number(ctx.params.id));
    if (!Number(res.changes)) throw notFound('Variant not found.');
    return { ok: true };
  });

  /** Delete only if never ordered; otherwise archive, so order history stays intact. */
  r.delete('/api/admin/products/:id', (ctx) => {
    const id = Number(ctx.params.id);
    if (!get('SELECT 1 FROM products WHERE id = ?', id)) throw notFound('Product not found.');
    if (get('SELECT 1 FROM order_items WHERE product_id = ?', id)) {
      run("UPDATE products SET status = 'archived', updated_at = ? WHERE id = ?", now(), id);
      return { archived: true };
    }
    run('DELETE FROM products WHERE id = ?', id);
    return { deleted: true };
  });

  r.post('/api/admin/uploads', async (ctx) => {
    const buf = await ctx.rawBody(MAX_UPLOAD_BYTES + 1);
    const url = await saveImageUpload(buf, String(ctx.req.headers['content-type'] ?? ''));
    return { url };
  });

  // ---------------- Categories & brands ----------------
  r.get('/api/admin/categories', () => ({ categories: listCategories() }));
  async function saveCategory(ctx: Ctx, id: number | null) {
    const v = new V(await ctx.body());
    const name = v.str('name', { required: true, max: 80 });
    const slug = slugify(v.str('slug', { max: 80 }) || name);
    if (get('SELECT 1 FROM categories WHERE slug = ? AND id IS NOT ?', slug, id)) v.fail('slug', 'Slug already in use.');
    const parentId = v.int('parentId');
    if (parentId) {
      if (parentId === id) v.fail('parentId', 'A category cannot be its own parent.');
      // Prevent cycles: walk up from the proposed parent.
      let cur: number | null = parentId;
      let guard = 0;
      while (cur && guard++ < 20) {
        if (cur === id) {
          v.fail('parentId', 'That would create a loop in the hierarchy.');
          break;
        }
        cur = (get<Row>('SELECT parent_id FROM categories WHERE id = ?', cur)?.parent_id as number) ?? null;
      }
    }
    const data = [parentId || null, slug, name, v.str('nameMn', { max: 80 }), v.str('description', { max: 400 }), v.str('image', { max: 200 }), v.int('sortOrder') ?? 0];
    v.check();
    const t = now();
    if (id) {
      run('UPDATE categories SET parent_id=?, slug=?, name=?, name_mn=?, description=?, image=?, sort_order=?, updated_at=? WHERE id = ?', ...data, t, id);
      return { id };
    }
    const res = run('INSERT INTO categories (parent_id, slug, name, name_mn, description, image, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)', ...data, t, t);
    return { id: Number(res.lastInsertRowid) };
  }
  r.post('/api/admin/categories', (ctx) => saveCategory(ctx, null));
  r.put('/api/admin/categories/:id', (ctx) => saveCategory(ctx, Number(ctx.params.id)));
  r.delete('/api/admin/categories/:id', (ctx) => {
    const id = Number(ctx.params.id);
    if (get('SELECT 1 FROM products WHERE category_id = ?', id)) throw conflict('Move or archive the products in this category first.');
    run('UPDATE categories SET parent_id = NULL WHERE parent_id = ?', id);
    run('DELETE FROM categories WHERE id = ?', id);
    return { ok: true };
  });

  r.get('/api/admin/brands', () => ({
    brands: all<Row>('SELECT b.id, b.slug, b.name, (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id) AS products FROM brands b ORDER BY b.name'),
  }));
  r.post('/api/admin/brands', async (ctx) => {
    const v = new V(await ctx.body());
    const name = v.str('name', { required: true, max: 60 });
    const slug = slugify(name);
    if (get('SELECT 1 FROM brands WHERE slug = ?', slug)) v.fail('name', 'Brand already exists.');
    v.check();
    const res = run('INSERT INTO brands (slug, name, created_at) VALUES (?, ?, ?)', slug, name, now());
    return { id: Number(res.lastInsertRowid) };
  });
  r.put('/api/admin/brands/:id', async (ctx) => {
    const v = new V(await ctx.body());
    const name = v.str('name', { required: true, max: 60 });
    v.check();
    run('UPDATE brands SET name = ? WHERE id = ?', name, Number(ctx.params.id));
    return { ok: true };
  });
  r.delete('/api/admin/brands/:id', (ctx) => {
    const id = Number(ctx.params.id);
    if (get('SELECT 1 FROM products WHERE brand_id = ?', id)) throw conflict('This brand still has products.');
    run('DELETE FROM brands WHERE id = ?', id);
    return { ok: true };
  });

  // ---------------- Orders ----------------
  r.get('/api/admin/orders', (ctx) => {
    const q = ctx.query.get('q')?.trim();
    const status = ctx.query.get('status');
    const payment = ctx.query.get('payment');
    const where = ['1'];
    const params: any[] = [];
    if (q) {
      where.push('(number LIKE ? OR email LIKE ? OR full_name LIKE ? OR phone LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (status === 'cancel_requested') where.push('cancel_requested = 1');
    else if (status && (ORDER_STATUSES as readonly string[]).includes(status)) {
      where.push('status = ?');
      params.push(status);
    }
    if (payment && (PAYMENT_STATUSES as readonly string[]).includes(payment)) {
      where.push('payment_status = ?');
      params.push(payment);
    }
    const page = Math.max(1, Number(ctx.query.get('page')) || 1);
    const total = get<Row>(`SELECT COUNT(*) AS n FROM orders WHERE ${where.join(' AND ')}`, ...params)!.n;
    const rows = all<Row>(`SELECT * FROM orders WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 25 OFFSET ?`, ...params, (page - 1) * 25);
    return { orders: rows.map(orderRow), total, page, pages: Math.max(1, Math.ceil(total / 25)) };
  });
  r.get('/api/admin/orders/:id', (ctx) => {
    const o = get<Row>('SELECT * FROM orders WHERE id = ?', Number(ctx.params.id));
    if (!o) throw notFound('Order not found.');
    return { order: serializeOrder(o, { admin: true }) };
  });
  r.post('/api/admin/orders/:id/status', async (ctx) => {
    const body = await ctx.body();
    if (!(ORDER_STATUSES as readonly string[]).includes(body.status)) throw badRequest('Invalid status.');
    const o = changeOrderStatus(Number(ctx.params.id), body.status as OrderStatus, actorOf(ctx), String(body.note ?? '').slice(0, 300));
    return { order: serializeOrder(o, { admin: true }) };
  });
  r.post('/api/admin/orders/:id/payment', async (ctx) => {
    const body = await ctx.body();
    if (!(PAYMENT_STATUSES as readonly string[]).includes(body.paymentStatus)) throw badRequest('Invalid payment status.');
    const o = changePaymentStatusManually(Number(ctx.params.id), body.paymentStatus as PaymentStatus, actorOf(ctx), String(body.note ?? '').slice(0, 300));
    return { order: serializeOrder(o, { admin: true }) };
  });
  r.post('/api/admin/orders/:id/cancel-request', async (ctx) => {
    const body = await ctx.body();
    const id = Number(ctx.params.id);
    if (body.decision === 'approve') {
      const o = changeOrderStatus(id, 'cancelled', actorOf(ctx), 'Customer cancellation request approved');
      return { order: serializeOrder(o, { admin: true }) };
    }
    rejectCancellation(id, actorOf(ctx), String(body.note ?? '').slice(0, 300));
    return { order: serializeOrder(get<Row>('SELECT * FROM orders WHERE id = ?', id)!, { admin: true }) };
  });

  // ---------------- Customers ----------------
  r.get('/api/admin/customers', (ctx) => {
    const q = ctx.query.get('q')?.trim();
    const rows = all<Row>(
      `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.status, u.created_at,
        (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders,
        (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id = u.id AND o.status NOT IN ('cancelled')) AS spent
       FROM users u ${q ? 'WHERE u.email LIKE ? OR u.full_name LIKE ?' : ''} ORDER BY u.created_at DESC LIMIT 200`,
      ...(q ? [`%${q}%`, `%${q}%`] : []),
    );
    return { customers: rows.map((u) => ({ id: u.id, email: u.email, fullName: u.full_name, phone: u.phone, role: u.role, status: u.status, createdAt: u.created_at, orders: u.orders, spent: u.spent })) };
  });
  r.get('/api/admin/customers/:id', (ctx) => {
    const u = get<Row>('SELECT id, email, full_name, phone, role, status, created_at FROM users WHERE id = ?', Number(ctx.params.id));
    if (!u) throw notFound('Customer not found.');
    const orders = all<Row>('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', u.id).map(orderRow);
    return { customer: { id: u.id, email: u.email, fullName: u.full_name, phone: u.phone, role: u.role, status: u.status, createdAt: u.created_at }, orders };
  });
  r.patch('/api/admin/customers/:id', async (ctx) => {
    const id = Number(ctx.params.id);
    const body = await ctx.body();
    if (!['active', 'disabled'].includes(body.status)) throw badRequest('Invalid status.');
    if (id === ctx.user!.id) throw badRequest('You cannot disable your own account.');
    const u = get<Row>('SELECT role FROM users WHERE id = ?', id);
    if (!u) throw notFound('Customer not found.');
    if (u.role === 'admin') throw badRequest('Administrator accounts are managed with the create-admin script.');
    run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', body.status, now(), id);
    if (body.status === 'disabled') run('DELETE FROM sessions WHERE user_id = ?', id);
    return { ok: true };
  });

  // ---------------- Blog ----------------
  const POST_SELECT = 'SELECT bp.*, bc.slug AS category_slug, bc.name AS category_name FROM blog_posts bp LEFT JOIN blog_categories bc ON bc.id = bp.category_id';
  r.get('/api/admin/blog', () => ({
    posts: all<Row>(`${POST_SELECT} ORDER BY bp.updated_at DESC`).map((p) => ({ ...serializePost(p), categoryId: p.category_id })),
    categories: all('SELECT id, slug, name FROM blog_categories ORDER BY name'),
  }));
  r.get('/api/admin/blog/:id', (ctx) => {
    const p = get<Row>(`${POST_SELECT} WHERE bp.id = ?`, Number(ctx.params.id));
    if (!p) throw notFound('Post not found.');
    return { post: { ...serializePost(p, true), categoryId: p.category_id } };
  });
  async function savePost(ctx: Ctx, id: number | null) {
    const v = new V(await ctx.body());
    const title = v.str('title', { required: true, max: 160 });
    const slug = slugify(v.str('slug', { max: 90 }) || title);
    if (get('SELECT 1 FROM blog_posts WHERE slug = ? AND id IS NOT ?', slug, id)) v.fail('slug', 'Slug already in use.');
    const status = v.oneOf('status', ['draft', 'published'] as const);
    const image = v.str('image', { max: 200 });
    const imageAlt = v.str('imageAlt', { max: 200 });
    if (image && !imageAlt) v.fail('imageAlt', 'Describe the featured image.');
    const fields = {
      excerpt: v.str('excerpt', { max: 400 }),
      body: v.str('body', { required: true, max: 50000 }),
      author: v.str('author', { required: true, max: 80 }),
      categoryId: v.int('categoryId'),
      seoTitle: v.str('seoTitle', { max: 70 }),
      metaDescription: v.str('metaDescription', { max: 170 }),
      isSample: v.bool('isSample'),
    };
    v.check();
    const t = now();
    const prev = id ? get<Row>('SELECT published_at FROM blog_posts WHERE id = ?', id) : null;
    const publishedAt = status === 'published' ? prev?.published_at ?? t : prev?.published_at ?? null;
    if (id) {
      run(
        `UPDATE blog_posts SET slug=?, title=?, excerpt=?, body=?, image=?, image_alt=?, author=?, category_id=?, status=?, is_sample=?, seo_title=?, meta_description=?, published_at=?, updated_at=? WHERE id = ?`,
        slug, title, fields.excerpt, fields.body, image, imageAlt, fields.author, fields.categoryId, status, fields.isSample ? 1 : 0, fields.seoTitle, fields.metaDescription, publishedAt, t, id,
      );
      return { id };
    }
    const res = run(
      `INSERT INTO blog_posts (slug, title, excerpt, body, image, image_alt, author, category_id, status, is_sample, seo_title, meta_description, published_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      slug, title, fields.excerpt, fields.body, image, imageAlt, fields.author, fields.categoryId, status, fields.isSample ? 1 : 0, fields.seoTitle, fields.metaDescription, publishedAt, t, t,
    );
    return { id: Number(res.lastInsertRowid) };
  }
  r.post('/api/admin/blog', (ctx) => savePost(ctx, null));
  r.put('/api/admin/blog/:id', (ctx) => savePost(ctx, Number(ctx.params.id)));
  r.delete('/api/admin/blog/:id', (ctx) => {
    run('DELETE FROM blog_posts WHERE id = ?', Number(ctx.params.id));
    return { ok: true };
  });

  // ---------------- FAQs ----------------
  r.get('/api/admin/faqs', () => ({ faqs: all<Row>('SELECT * FROM faqs ORDER BY sort_order, id').map((f) => ({ id: f.id, question: f.question, answer: f.answer, questionMn: f.question_mn, answerMn: f.answer_mn, sortOrder: f.sort_order, published: !!f.published })) }));
  async function saveFaq(ctx: Ctx, id: number | null) {
    const v = new V(await ctx.body());
    const vals = [
      v.str('question', { required: true, max: 300 }),
      v.str('answer', { required: true, max: 3000 }),
      v.str('questionMn', { max: 300 }),
      v.str('answerMn', { max: 3000 }),
      v.int('sortOrder') ?? 0,
      v.data.published === undefined || v.bool('published') ? 1 : 0,
    ];
    v.check();
    if (id) {
      run('UPDATE faqs SET question=?, answer=?, question_mn=?, answer_mn=?, sort_order=?, published=? WHERE id = ?', ...vals, id);
      return { id };
    }
    return { id: Number(run('INSERT INTO faqs (question, answer, question_mn, answer_mn, sort_order, published) VALUES (?,?,?,?,?,?)', ...vals).lastInsertRowid) };
  }
  r.post('/api/admin/faqs', (ctx) => saveFaq(ctx, null));
  r.put('/api/admin/faqs/:id', (ctx) => saveFaq(ctx, Number(ctx.params.id)));
  r.delete('/api/admin/faqs/:id', (ctx) => {
    run('DELETE FROM faqs WHERE id = ?', Number(ctx.params.id));
    return { ok: true };
  });

  // ---------------- Coupons ----------------
  r.get('/api/admin/coupons', () => ({ coupons: all('SELECT * FROM coupons ORDER BY id DESC') }));
  r.post('/api/admin/coupons', async (ctx) => {
    const v = new V(await ctx.body());
    const code = v.str('code', { required: true, max: 30, pattern: /^[A-Za-z0-9_-]+$/ }).toUpperCase();
    const type = v.oneOf('type', ['percent', 'fixed'] as const);
    const value = v.int('value', { required: true, min: 1, max: type === 'percent' ? 100 : 1_000_000_000 });
    const min = v.int('minSubtotal', { min: 0 }) ?? 0;
    if (get('SELECT 1 FROM coupons WHERE code = ?', code)) v.fail('code', 'Code already exists.');
    v.check();
    run('INSERT INTO coupons (code, description, type, value, min_subtotal, active, usage_limit) VALUES (?,?,?,?,?,1,?)', code, v.str('description', { max: 200 }), type, value, min, v.int('usageLimit', { min: 1 }));
    return { ok: true };
  });
  r.patch('/api/admin/coupons/:id', async (ctx) => {
    const body = await ctx.body();
    run('UPDATE coupons SET active = ? WHERE id = ?', body.active ? 1 : 0, Number(ctx.params.id));
    return { ok: true };
  });

  // ---------------- Messages & settings ----------------
  r.get('/api/admin/messages', () => ({ messages: all('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 200') }));

  r.get('/api/admin/settings', () => ({ settings: getSettings() }));
  r.put('/api/admin/settings', async (ctx) => {
    const body = await ctx.body();
    const cur = getSettings();
    const v = new V(body);
    const storeName = v.str('storeName', { required: true, max: 60 });
    const logoUrl = v.str('logoUrl', { max: 200 });
    if (logoUrl && !/^\/(uploads|images)\//.test(logoUrl)) v.fail('logoUrl', 'Upload the logo first.');
    const tagline = v.str('tagline', { max: 120 });
    const description = v.str('description', { max: 300 });
    const announcement = v.str('announcement', { max: 160 });

    const cv = new V(body.currency ?? {});
    const currency = { code: cv.str('code', { required: true, pattern: /^[A-Z]{3}$/, msg: 'Use a 3-letter ISO code.' }), decimals: cv.int('decimals', { required: true, min: 0, max: 3 }) ?? 0 };
    Object.entries(cv.errors).forEach(([k, m]) => v.fail(`currency.${k}`, m));

    const ct = new V(body.contact ?? {});
    const contact = { email: ct.email('email'), phone: ct.str('phone', { max: 40 }), address: ct.str('address', { max: 200 }), hours: ct.str('hours', { max: 100 }) };
    Object.entries(ct.errors).forEach(([k, m]) => v.fail(`contact.${k}`, m));

    const social: Record<string, string> = {};
    for (const k of Object.keys(DEFAULT_SETTINGS.social)) {
      const val = String(body.social?.[k] ?? '').trim();
      if (val && !/^https:\/\/[^\s]+$/.test(val)) v.fail(`social.${k}`, 'Use a full https:// link.');
      social[k] = val.slice(0, 200);
    }

    const tx_ = new V(body.tax ?? {});
    const tax = { enabled: tx_.bool('enabled'), rate: tx_.int('rate', { min: 0, max: 50 }) ?? 0, inclusive: tx_.bool('inclusive'), label: tx_.str('label', { max: 20 }) || 'Tax' };
    Object.entries(tx_.errors).forEach(([k, m]) => v.fail(`tax.${k}`, m));

    const sh = body.shipping ?? {};
    const methods = (Array.isArray(sh.methods) ? sh.methods : cur.shipping.methods).slice(0, 8).map((m: any, i: number) => {
      const mv = new V(m);
      const out = {
        code: slugify(mv.str('code', { required: true, max: 20 })),
        name: mv.str('name', { required: true, max: 60 }),
        nameMn: mv.str('nameMn', { max: 60 }),
        fee: mv.int('fee', { required: true, min: 0 }) ?? 0,
        etaDays: mv.str('etaDays', { max: 20 }),
      };
      Object.entries(mv.errors).forEach(([k, msg]) => v.fail(`shipping.methods.${i}.${k}`, msg));
      return out;
    });
    if (!methods.length) v.fail('shipping.methods', 'Keep at least one delivery method.');
    const freeShippingThreshold = new V(sh).int('freeShippingThreshold', { min: 0 }) ?? 0;

    const pv = new V(body.promo ?? {});
    const promo = {
      enabled: pv.bool('enabled'),
      eyebrow: pv.str('eyebrow', { max: 40 }),
      title: pv.str('title', { max: 80 }),
      body: pv.str('body', { max: 240 }),
      ctaLabel: pv.str('ctaLabel', { max: 30 }),
      ctaHref: pv.str('ctaHref', { max: 120, pattern: /^\/[^\s]*$/, msg: 'Use an internal path like /shop' }),
    };
    Object.entries(pv.errors).forEach(([k, m]) => v.fail(`promo.${k}`, m));
    v.check();

    saveSettings({ storeName, logoUrl, tagline, description, announcement, currency, contact, social, tax, shipping: { freeShippingThreshold, methods }, promo });
    return { settings: getSettings() };
  });
}

function orderRow(o: Row) {
  return {
    id: o.id,
    number: o.number,
    fullName: o.full_name,
    email: o.email,
    total: o.total,
    currency: o.currency,
    status: o.status,
    paymentStatus: o.payment_status,
    paymentMethod: o.payment_method,
    cancelRequested: !!o.cancel_requested,
    createdAt: o.created_at,
  };
}


