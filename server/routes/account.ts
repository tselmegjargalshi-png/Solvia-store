import { MAX_QTY_PER_LINE } from '../../config/brand.ts';
import { env } from '../env.ts';
import { all, get, now, run, tx, type Row } from '../db/index.ts';
import { badRequest, notFound, unauthorized, type Router } from '../lib/http.ts';
import { DUMMY_HASH, hashPassword, passwordProblems, randomToken, rateLimit, sha256, verifyPassword } from '../lib/security.ts';
import { V } from '../lib/validate.ts';
import { createSession, destroySession, publicUser, requireUser } from '../services/auth.ts';
import { listProducts } from '../services/catalog.ts';
import { findOrderForViewer, requestCancellation, serializeOrder } from '../services/orders.ts';

export function accountRoutes(r: Router) {
  // ---------- Auth ----------
  r.get('/api/auth/me', (ctx) => ({ user: publicUser(ctx.user) }));

  r.post('/api/auth/register', async (ctx) => {
    rateLimit(`register:${ctx.ip}`, 10, 60 * 60_000);
    const v = new V(await ctx.body());
    const fullName = v.str('fullName', { required: true, max: 100 });
    const email = v.email('email');
    const password = String(v.data.password ?? '');
    const pwErr = passwordProblems(password);
    if (pwErr) v.fail('password', pwErr);
    if (!v.bool('acceptTerms')) v.fail('acceptTerms', 'Please accept the terms to create an account.');
    v.check();
    if (get('SELECT 1 FROM users WHERE email = ?', email)) {
      throw badRequest('Please correct the highlighted fields.', { fields: { email: 'An account with this email already exists. Try signing in.' } });
    }
    const hash = await hashPassword(password);
    const t = now();
    const res = run(
      'INSERT INTO users (email, password_hash, full_name, role, locale, marketing_opt_in, created_at, updated_at) VALUES (?, ?, ?, \'customer\', ?, ?, ?, ?)',
      email,
      hash,
      fullName,
      v.data.locale === 'mn' ? 'mn' : 'en',
      v.bool('marketing') ? 1 : 0,
      t,
      t,
    );
    const id = Number(res.lastInsertRowid);
    createSession(ctx.res, id);
    return { user: { id, email, fullName, role: 'customer', locale: v.data.locale === 'mn' ? 'mn' : 'en', phone: '' } };
  });

  r.post('/api/auth/login', async (ctx) => {
    const body = await ctx.body();
    const email = String(body.email ?? '').trim().toLowerCase();
    rateLimit(`login:ip:${ctx.ip}`, 20, 15 * 60_000);
    rateLimit(`login:email:${email}`, 8, 15 * 60_000);
    const u = get<Row>('SELECT id, password_hash, status FROM users WHERE email = ?', email);
    const ok = await verifyPassword(String(body.password ?? ''), u?.password_hash ?? DUMMY_HASH);
    if (!u || !ok) throw unauthorized('Email or password is incorrect.');
    if (u.status !== 'active') throw unauthorized('This account is disabled. Please contact support.');
    createSession(ctx.res, u.id);
    const user = get<Row>('SELECT id, email, full_name, role, status, locale, phone FROM users WHERE id = ?', u.id)!;
    return { user: publicUser(user as any) };
  });

  r.post('/api/auth/logout', (ctx) => {
    destroySession(ctx);
    return { ok: true };
  });

  r.post('/api/auth/forgot-password', async (ctx) => {
    rateLimit(`forgot:${ctx.ip}`, 5, 60 * 60_000);
    const v = new V(await ctx.body());
    const email = v.email('email');
    v.check();
    const u = get<Row>("SELECT id FROM users WHERE email = ? AND status = 'active'", email);
    if (u) {
      const token = randomToken(32);
      run('DELETE FROM password_resets WHERE user_id = ?', u.id);
      run(
        'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        u.id,
        sha256(token),
        new Date(Date.now() + 30 * 60_000).toISOString(),
      );
      // No email provider is configured in this build. In development the link is logged
      // so the flow can be exercised; wire an email service before production (see README).
      if (env.logResetLinks && !env.isProd) console.log(`[password-reset] ${env.publicUrl}/reset-password?token=${token}`);
    }
    // Identical response either way, so the endpoint can't be used to discover accounts.
    return { ok: true };
  });

  r.post('/api/auth/reset-password', async (ctx) => {
    rateLimit(`reset:${ctx.ip}`, 10, 60 * 60_000);
    const body = await ctx.body();
    const v = new V(body);
    const pwErr = passwordProblems(String(body.password ?? ''));
    if (pwErr) v.fail('password', pwErr);
    v.check();
    const row = get<Row>('SELECT * FROM password_resets WHERE token_hash = ?', sha256(String(body.token ?? '')));
    if (!row || row.used_at || row.expires_at < now()) throw badRequest('This reset link is invalid or has expired. Please request a new one.');
    const hash = await hashPassword(String(body.password));
    tx(() => {
      run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hash, now(), row.user_id);
      run('UPDATE password_resets SET used_at = ? WHERE id = ?', now(), row.id);
      run('DELETE FROM sessions WHERE user_id = ?', row.user_id); // sign out everywhere
    });
    return { ok: true };
  });

  // ---------- Profile ----------
  r.put('/api/account/profile', async (ctx) => {
    const u = requireUser(ctx);
    const v = new V(await ctx.body());
    const fullName = v.str('fullName', { required: true, max: 100 });
    const phone = v.phone('phone', false);
    const locale = v.oneOf('locale', ['en', 'mn'] as const, false) || 'en';
    v.check();
    run('UPDATE users SET full_name = ?, phone = ?, locale = ?, updated_at = ? WHERE id = ?', fullName, phone, locale, now(), u.id);
    return { user: { ...publicUser(u), fullName, phone, locale } };
  });

  r.put('/api/account/password', async (ctx) => {
    const u = requireUser(ctx);
    rateLimit(`pwchange:${u.id}`, 10, 60 * 60_000);
    const body = await ctx.body();
    const row = get<Row>('SELECT password_hash FROM users WHERE id = ?', u.id)!;
    const v = new V(body);
    if (!(await verifyPassword(String(body.currentPassword ?? ''), row.password_hash))) v.fail('currentPassword', 'Current password is incorrect.');
    const pwErr = passwordProblems(String(body.newPassword ?? ''));
    if (pwErr) v.fail('newPassword', pwErr);
    v.check();
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', await hashPassword(body.newPassword), now(), u.id);
    run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', u.id, sha256(ctx.cookies.solvia_session ?? ''));
    return { ok: true };
  });

  // ---------- Addresses ----------
  const addrOut = (a: Row) => ({
    id: a.id,
    label: a.label,
    fullName: a.full_name,
    phone: a.phone,
    country: a.country,
    city: a.city,
    address: a.address,
    postalCode: a.postal_code,
    isDefault: !!a.is_default,
  });
  function readAddress(body: any) {
    const v = new V(body);
    const data = {
      label: v.str('label', { max: 40 }) || 'Home',
      fullName: v.str('fullName', { required: true, max: 100 }),
      phone: v.phone('phone'),
      country: v.str('country', { required: true, max: 60 }),
      city: v.str('city', { required: true, max: 80 }),
      address: v.str('address', { required: true, max: 300 }),
      postalCode: v.str('postalCode', { max: 20 }),
      isDefault: v.bool('isDefault'),
    };
    v.check();
    return data;
  }
  r.get('/api/account/addresses', (ctx) => {
    const u = requireUser(ctx);
    return { addresses: all<Row>('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id', u.id).map(addrOut) };
  });
  r.post('/api/account/addresses', async (ctx) => {
    const u = requireUser(ctx);
    const d = readAddress(await ctx.body());
    const count = get<Row>('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?', u.id)!.n;
    if (count >= 10) throw badRequest('You can save up to 10 addresses.');
    tx(() => {
      const isDefault = d.isDefault || count === 0;
      if (isDefault) run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', u.id);
      run(
        'INSERT INTO addresses (user_id, label, full_name, phone, country, city, address, postal_code, is_default, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        u.id, d.label, d.fullName, d.phone, d.country, d.city, d.address, d.postalCode, isDefault ? 1 : 0, now(),
      );
    });
    return { ok: true };
  });
  r.put('/api/account/addresses/:id', async (ctx) => {
    const u = requireUser(ctx);
    const a = get<Row>('SELECT id FROM addresses WHERE id = ? AND user_id = ?', Number(ctx.params.id), u.id);
    if (!a) throw notFound('Address not found.');
    const d = readAddress(await ctx.body());
    tx(() => {
      if (d.isDefault) run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', u.id);
      run(
        'UPDATE addresses SET label=?, full_name=?, phone=?, country=?, city=?, address=?, postal_code=?, is_default = CASE WHEN ? THEN 1 ELSE is_default END WHERE id = ?',
        d.label, d.fullName, d.phone, d.country, d.city, d.address, d.postalCode, d.isDefault ? 1 : 0, a.id,
      );
    });
    return { ok: true };
  });
  r.delete('/api/account/addresses/:id', (ctx) => {
    const u = requireUser(ctx);
    run('DELETE FROM addresses WHERE id = ? AND user_id = ?', Number(ctx.params.id), u.id);
    return { ok: true };
  });

  // ---------- Orders (ownership enforced in SQL) ----------
  r.get('/api/account/orders', (ctx) => {
    const u = requireUser(ctx);
    const rows = all<Row>(
      `SELECT o.number, o.status, o.payment_status, o.total, o.currency, o.created_at, (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS items
       FROM orders o WHERE o.user_id = ? ORDER BY o.created_at DESC`,
      u.id,
    );
    return {
      orders: rows.map((o) => ({ number: o.number, status: o.status, paymentStatus: o.payment_status, total: o.total, currency: o.currency, createdAt: o.created_at, itemCount: o.items })),
    };
  });
  r.get('/api/orders/:number', (ctx) => {
    const o = findOrderForViewer(ctx.params.number, ctx.user?.id ?? null, ctx.query.get('token'));
    return { order: serializeOrder(o) };
  });
  r.post('/api/account/orders/:number/cancel-request', async (ctx) => {
    const u = requireUser(ctx);
    const o = get<Row>('SELECT id FROM orders WHERE number = ? AND user_id = ?', ctx.params.number, u.id);
    if (!o) throw notFound('Order not found.');
    const body = await ctx.body();
    requestCancellation(o.id, u.id, String(body.reason ?? '').trim());
    return { ok: true };
  });

  // ---------- Wishlist ----------
  r.get('/api/account/wishlist', (ctx) => {
    const u = requireUser(ctx);
    const ids = all<Row>('SELECT product_id FROM wishlist_items WHERE user_id = ? ORDER BY created_at DESC', u.id).map((x) => x.product_id);
    const items = ids.length ? listProducts({ ids, pageSize: 48 }).items : [];
    return { productIds: ids, items: ids.map((id) => items.find((i) => i.id === id)).filter(Boolean) };
  });
  r.post('/api/account/wishlist', async (ctx) => {
    const u = requireUser(ctx);
    const body = await ctx.body();
    const ids: number[] = (Array.isArray(body.productIds) ? body.productIds : [body.productId]).map(Number).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, 100);
    for (const id of ids) {
      if (get("SELECT 1 FROM products WHERE id = ? AND status = 'active'", id)) {
        run('INSERT INTO wishlist_items (user_id, product_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', u.id, id, now());
      }
    }
    return { ok: true };
  });
  r.delete('/api/account/wishlist/:productId', (ctx) => {
    const u = requireUser(ctx);
    run('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?', u.id, Number(ctx.params.productId));
    return { ok: true };
  });

  // ---------- Server cart (signed-in customers) ----------
  r.get('/api/account/cart', (ctx) => {
    const u = requireUser(ctx);
    return { items: all<Row>('SELECT variant_id AS variantId, quantity FROM cart_items WHERE user_id = ? ORDER BY id', u.id) };
  });
  /** Replace the stored cart with the client's cart (client merges guest + server cart before calling). */
  r.put('/api/account/cart', async (ctx) => {
    const u = requireUser(ctx);
    const body = await ctx.body();
    const items: { variantId: number; quantity: number }[] = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    tx(() => {
      run('DELETE FROM cart_items WHERE user_id = ?', u.id);
      for (const it of items) {
        const vid = Number(it.variantId);
        const q = Math.min(Number(it.quantity), MAX_QTY_PER_LINE);
        if (!Number.isInteger(vid) || !Number.isInteger(q) || q <= 0) continue;
        if (!get('SELECT 1 FROM product_variants WHERE id = ?', vid)) continue;
        run('INSERT INTO cart_items (user_id, variant_id, quantity, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, variant_id) DO UPDATE SET quantity = excluded.quantity', u.id, vid, q, now());
      }
    });
    return { ok: true };
  });
}

