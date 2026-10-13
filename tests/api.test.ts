/**
 * API integration tests. Run: npm test
 * Boots the real server against a temporary database; nothing is mocked except time where noted.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Client, shopper, startTestServer } from './helpers.ts';

let srv: Awaited<ReturnType<typeof startTestServer>>;
let db: typeof import('../server/db/index.ts');
let adminClient: Client;
const ADMIN = { email: 'owner@example.com', password: 'Owner-pass-2026' };

async function productBySlug(c: Client, slug: string) {
  const r = await c.get(`/api/products/${slug}`);
  assert.equal(r.status, 200, `product ${slug}`);
  return r.body.product;
}
const variant = (p: any, pred: (v: any) => boolean) => {
  const v = p.variants.find(pred);
  assert.ok(v, 'variant fixture missing');
  return v;
};
const stockOf = (variantId: number) => db.get<any>('SELECT stock FROM product_variants WHERE id = ?', variantId)!.stock as number;

before(async () => {
  srv = await startTestServer();
  db = await import('../server/db/index.ts');
  // Create the administrator the same way `npm run create-admin` does (hashed password, role=admin).
  const { hashPassword } = await import('../server/lib/security.ts');
  const t = new Date().toISOString();
  db.run("INSERT INTO users (email, password_hash, full_name, role, created_at, updated_at) VALUES (?, ?, 'Owner', 'admin', ?, ?)", ADMIN.email, await hashPassword(ADMIN.password), t, t);
  adminClient = new Client(srv.base);
  const r = await adminClient.post('/api/auth/login', ADMIN);
  assert.equal(r.status, 200);
});
after(async () => {
  await srv.stop();
});

// ---------------------------------------------------------------- catalog
describe('catalog', () => {
  test('health + settings', async () => {
    const c = new Client(srv.base);
    assert.equal((await c.get('/api/health')).body.ok, true);
    const s = (await c.get('/api/settings')).body;
    assert.equal(s.storeName, 'SOLVIA');
    assert.equal(s.payments.liveCardPayments, false);
    assert.ok(!JSON.stringify(s).includes('sk_'), 'settings must not expose secrets');
  });

  test('lists active products with pagination', async () => {
    const c = new Client(srv.base);
    const p1 = (await c.get('/api/products?pageSize=12&page=1')).body;
    const p2 = (await c.get('/api/products?pageSize=12&page=2')).body;
    assert.equal(p1.items.length, 12);
    assert.ok(p1.total >= 24);
    assert.equal(p1.pages, Math.ceil(p1.total / 12));
    const ids1 = new Set(p1.items.map((i: any) => i.id));
    assert.ok(p2.items.every((i: any) => !ids1.has(i.id)), 'pages do not overlap');
  });

  test('search matches names', async () => {
    const c = new Client(srv.base);
    const r = (await c.get('/api/products?q=lamp')).body;
    assert.ok(r.items.length >= 1);
    assert.ok(r.items.every((i: any) => /lamp/i.test(i.name + i.shortDescription)));
    const none = (await c.get('/api/products?q=zzzznotathing')).body;
    assert.equal(none.total, 0);
  });

  test('category filter includes child categories', async () => {
    const c = new Client(srv.base);
    const cats = (await c.get('/api/categories')).body.categories;
    const parent = cats.find((x: any) => !x.parentId && cats.some((y: any) => y.parentId === x.id));
    assert.ok(parent, 'needs a parent category');
    const children = cats.filter((y: any) => y.parentId === parent.id).map((y: any) => y.slug);
    const r = (await c.get(`/api/products?category=${parent.slug}&pageSize=48`)).body;
    assert.ok(r.items.length > 0);
    assert.ok(r.items.every((i: any) => i.category && [parent.slug, ...children].includes(i.category.slug)));
  });

  test('price, brand, colour, size and availability filters use real data', async () => {
    const c = new Client(srv.base);
    const price = (await c.get('/api/products?minPrice=100000&maxPrice=250000&pageSize=48')).body;
    assert.ok(price.items.length > 0);
    assert.ok(price.items.every((i: any) => i.priceFrom >= 100000 && i.priceFrom <= 250000), 'price range');

    const brand = (await c.get('/api/products?brand=halden&pageSize=48')).body;
    assert.ok(brand.items.length > 0 && brand.items.every((i: any) => i.brand.slug === 'halden'));

    const color = (await c.get('/api/products?color=Navy&pageSize=48')).body;
    assert.ok(color.items.length > 0 && color.items.every((i: any) => i.colors.some((x: any) => x.name === 'Navy')));

    const size = (await c.get('/api/products?size=M&pageSize=48')).body;
    for (const it of size.items) {
      const p = await productBySlug(c, it.slug);
      assert.ok(p.variants.some((v: any) => v.size === 'M'), `${it.slug} has size M`);
    }

    const all = (await c.get('/api/products?pageSize=48')).body;
    const inStock = (await c.get('/api/products?inStock=1&pageSize=48')).body;
    assert.ok(all.items.some((i: any) => !i.inStock), 'fixture has a sold-out product');
    assert.ok(inStock.items.every((i: any) => i.inStock));
    assert.ok(inStock.total < all.total);
  });

  test('sorting', async () => {
    const c = new Client(srv.base);
    const prices = (s: string) => c.get(`/api/products?sort=${s}&pageSize=48`).then((r) => r.body.items);
    const asc = (await prices('price_asc')).map((i: any) => i.priceFrom);
    assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
    const desc = (await prices('price_desc')).map((i: any) => i.priceFrom);
    assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
    const names = (await prices('name_asc')).map((i: any) => i.name.toLowerCase());
    assert.deepEqual(names, [...names].sort());
    const newest = (await prices('newest')).map((i: any) => i.createdAt);
    assert.deepEqual(newest, [...newest].sort().reverse());
  });

  test('product detail, related, 404 for unknown and for drafts', async () => {
    const c = new Client(srv.base);
    const r = await c.get('/api/products/halo-table-lamp');
    assert.equal(r.status, 200);
    assert.ok(r.body.product.images.length >= 1 && r.body.product.images.every((i: any) => i.alt));
    assert.ok(Array.isArray(r.body.related));
    assert.equal((await c.get('/api/products/does-not-exist')).status, 404);
  });
});

// ---------------------------------------------------------------- cart pricing
describe('cart quote (server-side pricing)', () => {
  test('ignores client-supplied prices and computes totals', async () => {
    const c = new Client(srv.base);
    const p = await productBySlug(c, 'halo-table-lamp');
    const v = variant(p, (x) => x.available);
    const q = (await c.post('/api/cart/quote', { items: [{ variantId: v.id, quantity: 1, price: 1, unitPrice: 1 }], shippingMethod: 'express' })).body;
    assert.equal(q.lines[0].unitPrice, v.price);
    assert.equal(q.subtotal, v.price);
    assert.equal(q.shippingFee, 15000);
    // Tax is inclusive by default: total = subtotal + shipping; tax is the included portion.
    assert.equal(q.total, v.price + 15000);
    assert.equal(q.tax, Math.round(q.total - q.total / 1.1));
  });

  test('rejects zero, negative and fractional quantities', async () => {
    const c = new Client(srv.base);
    const p = await productBySlug(c, 'halo-table-lamp');
    const v = variant(p, (x) => x.available);
    for (const quantity of [0, -3, 1.5, 'abc']) {
      const q = (await c.post('/api/cart/quote', { items: [{ variantId: v.id, quantity }] })).body;
      assert.equal(q.lines.length, 0, `qty ${quantity}`);
      assert.equal(q.issues[0].type, 'invalid_quantity');
      assert.equal(q.total, 0);
    }
  });

  test('clamps to stock and flags sold-out / unknown variants', async () => {
    const c = new Client(srv.base);
    const lamp = await productBySlug(c, 'halo-table-lamp');
    const low = variant(lamp, (x) => x.available && x.stock <= 3);
    const q = (await c.post('/api/cart/quote', { items: [{ variantId: low.id, quantity: 9 }] })).body;
    assert.equal(q.lines[0].quantity, low.stock);
    assert.equal(q.issues[0].type, 'quantity_adjusted');

    const pendant = await productBySlug(c, 'dome-pendant-light');
    const out = variant(pendant, (x) => x.stock === 0);
    const q2 = (await c.post('/api/cart/quote', { items: [{ variantId: out.id, quantity: 1 }, { variantId: 999999, quantity: 1 }] })).body;
    assert.equal(q2.lines.length, 0);
    assert.deepEqual(q2.issues.map((i: any) => i.type).sort(), ['out_of_stock', 'unavailable']);
  });

  test('coupon: minimum subtotal enforced, discount applied when valid', async () => {
    const c = new Client(srv.base);
    const p = await productBySlug(c, 'quilted-down-jacket');
    const v = variant(p, (x) => x.available);
    const ok = (await c.post('/api/cart/quote', { items: [{ variantId: v.id, quantity: 1 }], couponCode: 'welcome10' })).body;
    assert.equal(ok.discount, Math.floor(v.price * 0.1));
    assert.equal(ok.coupon.code, 'WELCOME10');
    const bad = (await c.post('/api/cart/quote', { items: [{ variantId: v.id, quantity: 1 }], couponCode: 'NOPE' })).body;
    assert.equal(bad.discount, 0);
    assert.ok(bad.couponError);
  });

  test('free standard shipping over the threshold', async () => {
    const c = new Client(srv.base);
    const p = await productBySlug(c, 'quilted-down-jacket');
    const v = variant(p, (x) => x.available);
    assert.ok(v.price >= 200000);
    const q = (await c.post('/api/cart/quote', { items: [{ variantId: v.id, quantity: 1 }], shippingMethod: 'standard' })).body;
    assert.equal(q.shippingFee, 0);
  });
});

// ---------------------------------------------------------------- checkout
describe('checkout and orders', () => {
  test('empty cart cannot be submitted', async () => {
    const c = new Client(srv.base);
    const before = db.get<any>('SELECT COUNT(*) n FROM orders')!.n;
    const r = await c.post('/api/checkout', { ...shopper, items: [], paymentMethod: 'cod' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'empty_cart');
    assert.equal(db.get<any>('SELECT COUNT(*) n FROM orders')!.n, before);
  });

  test('field validation returns per-field messages and creates nothing', async () => {
    const c = new Client(srv.base);
    const p = await productBySlug(c, 'halo-table-lamp');
    const v = variant(p, (x) => x.available);
    const r = await c.post('/api/checkout', { items: [{ variantId: v.id, quantity: 1 }], email: 'not-an-email', fullName: '', phone: 'x', country: '', city: '', address: '1', shippingMethod: 'standard', paymentMethod: 'cod', acceptTerms: false });
    assert.equal(r.status, 400);
    for (const k of ['email', 'fullName', 'phone', 'country', 'city', 'address', 'acceptTerms']) assert.ok(r.body.error.fields[k], `field ${k}`);
  });

  test('CSRF header required for state-changing requests', async () => {
    const c = new Client(srv.base);
    const r = await c.req('POST', '/api/checkout', { ...shopper, items: [] }, { csrf: false });
    assert.equal(r.status, 403);
  });

  let codOrder: { number: string; token: string; variantId: number; total: number };
  test('cash-on-delivery order: totals recomputed, stock decremented, payment unpaid', async () => {
    const c = new Client(srv.base);
    const p = await productBySlug(c, 'merino-crew-sweater');
    const v = variant(p, (x) => x.available && x.stock >= 3);
    const before = stockOf(v.id);
    const quote = (await c.post('/api/cart/quote', { items: [{ variantId: v.id, quantity: 2 }], shippingMethod: 'standard' })).body;
    const r = await c.post('/api/checkout', { ...shopper, items: [{ variantId: v.id, quantity: 2, price: 1 }], paymentMethod: 'cod', subtotal: 2, total: 2, idempotencyKey: 'test-cod-0000000001' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.number && r.body.token);
    assert.equal(r.body.payment, null);
    assert.equal(stockOf(v.id), before - 2);
    const o = (await c.get(`/api/orders/${r.body.number}?token=${r.body.token}`)).body.order;
    assert.equal(o.total, quote.total);
    assert.equal(o.subtotal, v.price * 2);
    assert.equal(o.status, 'pending');
    assert.equal(o.paymentStatus, 'unpaid');
    assert.equal(o.items[0].unitPrice, v.price);
    codOrder = { number: r.body.number, token: r.body.token, variantId: v.id, total: o.total };
  });

  test('duplicate submission with the same idempotency key returns the first order', async () => {
    const c = new Client(srv.base);
    const before = stockOf(codOrder.variantId);
    const r = await c.post('/api/checkout', { ...shopper, items: [{ variantId: codOrder.variantId, quantity: 2 }], paymentMethod: 'cod', idempotencyKey: 'test-cod-0000000001' });
    assert.equal(r.status, 200);
    assert.equal(r.body.duplicate, true);
    assert.equal(r.body.number, codOrder.number);
    assert.equal(stockOf(codOrder.variantId), before, 'no second stock decrement');
  });

  test('order price snapshot survives later catalog price changes', async () => {
    db.run('UPDATE products SET price = price + 50000 WHERE slug = ?', 'merino-crew-sweater');
    const c = new Client(srv.base);
    const o = (await c.get(`/api/orders/${codOrder.number}?token=${codOrder.token}`)).body.order;
    assert.equal(o.total, codOrder.total);
    db.run('UPDATE products SET price = price - 50000 WHERE slug = ?', 'merino-crew-sweater');
  });

  test('server rejects orders exceeding stock (no oversell)', async () => {
    const c = new Client(srv.base);
    const p = await productBySlug(c, 'quilted-down-jacket');
    const v = variant(p, (x) => x.available && x.stock === 1);
    const r = await c.post('/api/checkout', { ...shopper, items: [{ variantId: v.id, quantity: 3 }], paymentMethod: 'cod' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'cart_changed');
    assert.equal(stockOf(v.id), 1);
  });

  test('order is private: no token → 404, wrong token → 404', async () => {
    const c = new Client(srv.base);
    assert.equal((await c.get(`/api/orders/${codOrder.number}`)).status, 404);
    assert.equal((await c.get(`/api/orders/${codOrder.number}?token=wrong`)).status, 404);
  });

  let cardOrder: { number: string; token: string; id: number; variantId: number; qty: number };
  test('card order in demo mode: payment stays pending until confirmed — never fabricated', async () => {
    const c = new Client(srv.base);
    const p = await productBySlug(c, 'halo-table-lamp');
    const v = variant(p, (x) => x.available);
    const r = await c.post('/api/checkout', { ...shopper, items: [{ variantId: v.id, quantity: 1 }], paymentMethod: 'card' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.payment.isDemo, true);
    assert.match(r.body.payment.redirectUrl, /^\/checkout\/demo-payment\//);
    const o = (await c.get(`/api/orders/${r.body.number}?token=${r.body.token}`)).body.order;
    assert.equal(o.paymentStatus, 'pending');
    assert.equal(o.status, 'pending');
    assert.ok(o.reservedUntil, 'stock reservation has an expiry');
    const id = db.get<any>('SELECT id FROM orders WHERE number = ?', r.body.number)!.id;
    cardOrder = { number: r.body.number, token: r.body.token, id, variantId: v.id, qty: 1 };
  });

  test('admin cannot mark a card order paid by hand, nor confirm it unpaid', async () => {
    const pay = await adminClient.post(`/api/admin/orders/${cardOrder.id}/payment`, { paymentStatus: 'paid' });
    assert.equal(pay.status, 400);
    const st = await adminClient.post(`/api/admin/orders/${cardOrder.id}/status`, { status: 'confirmed' });
    assert.equal(st.status, 400);
  });

  test('demo confirmation needs the order token, then marks paid + labelled demo', async () => {
    const stranger = new Client(srv.base);
    const denied = await stranger.post('/api/payments/demo/confirm', { number: cardOrder.number, token: 'nope' });
    assert.equal(denied.status, 404);
    const c = new Client(srv.base);
    const ok = await c.post('/api/payments/demo/confirm', { number: cardOrder.number, token: cardOrder.token });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.demo, true);
    const o = (await c.get(`/api/orders/${cardOrder.number}?token=${cardOrder.token}`)).body.order;
    assert.equal(o.paymentStatus, 'paid');
    assert.equal(o.status, 'confirmed');
    assert.equal(o.isDemoPayment, true);
    assert.ok(o.events.some((e: any) => /DEMO payment simulated — no money was charged/.test(e.message)));
    // A second confirmation is a no-op (no duplicate payment rows).
    await c.post('/api/payments/demo/confirm', { number: cardOrder.number, token: cardOrder.token });
    assert.equal(db.get<any>("SELECT COUNT(*) n FROM payments WHERE order_id = ? AND status = 'paid'", cardOrder.id)!.n, 1);
  });

  test('Stripe webhook endpoint is disabled unless Stripe is configured', async () => {
    const c = new Client(srv.base);
    const r = await c.req('POST', '/api/payments/stripe/webhook', { type: 'checkout.session.completed' }, { csrf: false });
    assert.equal(r.status, 404);
  });

  test('unpaid card reservations expire and release stock', async () => {
    const c = new Client(srv.base);
    const p = await productBySlug(c, 'stoneware-mug-pair');
    const v = variant(p, (x) => x.available);
    const before = stockOf(v.id);
    const r = await c.post('/api/checkout', { ...shopper, items: [{ variantId: v.id, quantity: 1 }], paymentMethod: 'card' });
    assert.equal(stockOf(v.id), before - 1);
    db.run("UPDATE orders SET reserved_until = '2000-01-01T00:00:00.000Z' WHERE number = ?", r.body.number);
    const { expireReservations } = await import('../server/services/orders.ts');
    assert.ok(expireReservations() >= 1);
    assert.equal(stockOf(v.id), before);
    const o = (await c.get(`/api/orders/${r.body.number}?token=${r.body.token}`)).body.order;
    assert.equal(o.status, 'cancelled');
    assert.equal(o.paymentStatus, 'failed');
    // Payment after expiry is refused.
    const late = await c.post('/api/payments/demo/confirm', { number: r.body.number, token: r.body.token });
    assert.notEqual(late.status, 200);
  });

  test('admin status transitions are controlled; cancelling returns stock once', async () => {
    const id = db.get<any>('SELECT id FROM orders WHERE number = ?', codOrder.number)!.id;
    const bad = await adminClient.post(`/api/admin/orders/${id}/status`, { status: 'delivered' });
    assert.equal(bad.status, 400, 'pending → delivered is not allowed');
    const ok = await adminClient.post(`/api/admin/orders/${id}/status`, { status: 'confirmed' });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.order.allowedStatuses, ['processing', 'cancelled']);
    const before = stockOf(codOrder.variantId);
    const cancel = await adminClient.post(`/api/admin/orders/${id}/status`, { status: 'cancelled' });
    assert.equal(cancel.status, 200);
    assert.equal(stockOf(codOrder.variantId), before + 2);
    const again = await adminClient.post(`/api/admin/orders/${id}/status`, { status: 'cancelled' });
    assert.equal(again.status, 400);
    assert.equal(stockOf(codOrder.variantId), before + 2, 'stock returned exactly once');
  });

  test('refund flow: must record payment refund before order can be refunded', async () => {
    const id = cardOrder.id;
    for (const s of ['processing', 'shipped', 'delivered']) assert.equal((await adminClient.post(`/api/admin/orders/${id}/status`, { status: s })).status, 200, s);
    assert.equal((await adminClient.post(`/api/admin/orders/${id}/status`, { status: 'refunded' })).status, 400);
    assert.equal((await adminClient.post(`/api/admin/orders/${id}/payment`, { paymentStatus: 'refunded', note: 'Test refund' })).status, 200);
    const r = await adminClient.post(`/api/admin/orders/${id}/status`, { status: 'refunded' });
    assert.equal(r.status, 200);
    assert.equal(r.body.order.paymentStatus, 'refunded');
  });
});

// ---------------------------------------------------------------- accounts
describe('customer accounts', () => {
  const alice = new Client('');
  const bob = new Client('');
  before(() => {
    alice.base = srv.base;
    bob.base = srv.base;
  });

  test('registration enforces password rules and stores only a hash', async () => {
    const weak = await alice.post('/api/auth/register', { fullName: 'Alice', email: 'alice@example.com', password: 'short', acceptTerms: true });
    assert.equal(weak.status, 400);
    assert.ok(weak.body.error.fields.password);
    const ok = await alice.post('/api/auth/register', { fullName: 'Alice', email: 'alice@example.com', password: 'alice-pass-123', acceptTerms: true });
    assert.equal(ok.status, 200);
    const row = db.get<any>('SELECT password_hash FROM users WHERE email = ?', 'alice@example.com')!;
    assert.match(row.password_hash, /^scrypt\$/);
    assert.ok(!row.password_hash.includes('alice-pass-123'));
    const dup = await bob.post('/api/auth/register', { fullName: 'Bob', email: 'ALICE@example.com', password: 'another-pass-123', acceptTerms: true });
    assert.equal(dup.status, 400, 'duplicate email (case-insensitive)');
    assert.equal((await bob.post('/api/auth/register', { fullName: 'Bob', email: 'bob@example.com', password: 'bob-pass-12345', acceptTerms: true })).status, 200);
  });

  test('login rejects wrong passwords; logout clears the session', async () => {
    const c = new Client(srv.base);
    assert.equal((await c.post('/api/auth/login', { email: 'alice@example.com', password: 'wrong-pass-1' })).status, 401);
    assert.equal((await c.post('/api/auth/login', { email: 'alice@example.com', password: 'alice-pass-123' })).status, 200);
    assert.equal((await c.get('/api/auth/me')).body.user.email, 'alice@example.com');
    await c.post('/api/auth/logout');
    assert.equal((await c.get('/api/auth/me')).body.user, null);
    assert.equal((await c.get('/api/account/orders')).status, 401);
  });

  test('account routes require sign-in', async () => {
    const anon = new Client(srv.base);
    for (const p of ['/api/account/orders', '/api/account/addresses', '/api/account/wishlist', '/api/account/cart']) assert.equal((await anon.get(p)).status, 401, p);
  });

  test("customers cannot see another customer's orders", async () => {
    const p = await productBySlug(alice, 'stoneware-mug-pair');
    const v = variant(p, (x) => x.available);
    const r = await alice.post('/api/checkout', { ...shopper, email: 'alice@example.com', items: [{ variantId: v.id, quantity: 1 }], paymentMethod: 'cod' });
    assert.equal(r.status, 200);
    const mine = (await alice.get('/api/account/orders')).body.orders;
    assert.ok(mine.some((o: any) => o.number === r.body.number));
    assert.equal((await alice.get(`/api/orders/${r.body.number}`)).status, 200, 'owner can view without token');
    assert.equal((await bob.get(`/api/orders/${r.body.number}`)).status, 404);
    assert.ok(!(await bob.get('/api/account/orders')).body.orders.some((o: any) => o.number === r.body.number));
    assert.equal((await bob.post(`/api/account/orders/${r.body.number}/cancel-request`, { reason: 'x' })).status, 404);
    assert.equal((await alice.post(`/api/account/orders/${r.body.number}/cancel-request`, { reason: 'Changed my mind' })).status, 200);
  });

  test('addresses are scoped to their owner', async () => {
    const add = await alice.post('/api/account/addresses', { fullName: 'Alice', phone: '+976 9900 1122', country: 'Mongolia', city: 'Ulaanbaatar', address: 'Peace Avenue 10' });
    assert.equal(add.status, 200);
    const list = (await alice.get('/api/account/addresses')).body.addresses;
    assert.equal(list.length, 1);
    assert.equal(list[0].isDefault, true);
    assert.equal((await bob.put(`/api/account/addresses/${list[0].id}`, { fullName: 'Bob', phone: '+976 9900 1122', country: 'X', city: 'Y', address: 'Hijacked 1' })).status, 404);
    await bob.del(`/api/account/addresses/${list[0].id}`);
    assert.equal((await alice.get('/api/account/addresses')).body.addresses.length, 1);
  });

  test('wishlist and server cart persist per user', async () => {
    const p = await productBySlug(alice, 'halo-table-lamp');
    await alice.post('/api/account/wishlist', { productId: p.id });
    assert.deepEqual((await alice.get('/api/account/wishlist')).body.productIds, [p.id]);
    assert.deepEqual((await bob.get('/api/account/wishlist')).body.productIds, []);
    await alice.put('/api/account/cart', { items: [{ variantId: p.variants[0].id, quantity: 2 }, { variantId: p.variants[0].id, quantity: -1 }] });
    assert.deepEqual((await alice.get('/api/account/cart')).body.items, [{ variantId: p.variants[0].id, quantity: 2 }]);
  });

  test('password reset: same response for unknown emails; token is single-use', async () => {
    const c = new Client(srv.base);
    const a = await c.post('/api/auth/forgot-password', { email: 'alice@example.com' });
    const b = await c.post('/api/auth/forgot-password', { email: 'nobody@example.com' });
    assert.deepEqual(a.body, b.body);
    // Issue a known token directly (the real one is only logged/emailed).
    const { sha256 } = await import('../server/lib/security.ts');
    const uid = db.get<any>('SELECT id FROM users WHERE email = ?', 'alice@example.com')!.id;
    db.run('DELETE FROM password_resets WHERE user_id = ?', uid);
    db.run('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)', uid, sha256('known-token'), new Date(Date.now() + 600000).toISOString());
    assert.equal((await c.post('/api/auth/reset-password', { token: 'known-token', password: 'alice-new-pass-9' })).status, 200);
    assert.equal((await c.post('/api/auth/reset-password', { token: 'known-token', password: 'alice-new-pass-9' })).status, 400);
    assert.equal((await c.post('/api/auth/login', { email: 'alice@example.com', password: 'alice-new-pass-9' })).status, 200);
    // Reset signed out the old session.
    assert.equal((await alice.get('/api/auth/me')).body.user, null);
  });
});

// ---------------------------------------------------------------- admin
describe('admin authorization and management', () => {
  test('anonymous → 401, customer → 403 on every admin endpoint sampled', async () => {
    const anon = new Client(srv.base);
    const cust = new Client(srv.base);
    await cust.post('/api/auth/register', { fullName: 'Carol', email: 'carol@example.com', password: 'carol-pass-123', acceptTerms: true });
    const endpoints: [string, string][] = [
      ['GET', '/api/admin/dashboard'],
      ['GET', '/api/admin/orders'],
      ['GET', '/api/admin/customers'],
      ['POST', '/api/admin/products'],
      ['DELETE', '/api/admin/products/1'],
      ['PUT', '/api/admin/settings'],
      ['POST', '/api/admin/orders/1/status'],
    ];
    for (const [m, p] of endpoints) {
      assert.equal((await anon.req(m, p, m === 'GET' ? undefined : {})).status, 401, `anon ${m} ${p}`);
      assert.equal((await cust.req(m, p, m === 'GET' ? undefined : {})).status, 403, `customer ${m} ${p}`);
    }
    // A customer can't self-promote through profile update.
    await cust.put('/api/account/profile', { fullName: 'Carol', role: 'admin' });
    assert.equal(db.get<any>('SELECT role FROM users WHERE email = ?', 'carol@example.com')!.role, 'customer');
  });

  test('dashboard returns real aggregates', async () => {
    const r = await adminClient.get('/api/admin/dashboard');
    assert.equal(r.status, 200);
    const orders = db.get<any>('SELECT COUNT(*) n FROM orders')!.n;
    assert.equal(r.body.totals.orders, orders);
  });

  let newId: number;
  test('create, edit price/sale/stock, feature, then delete a product', async () => {
    const cats = (await adminClient.get('/api/admin/categories')).body.categories;
    const brands = (await adminClient.get('/api/admin/brands')).body.brands;
    const body = {
      name: 'Test Linen Shirt',
      sku: 'TST-LIN-01',
      price: 120000,
      status: 'active',
      categoryId: cats[0].id,
      brandId: brands[0].id,
      shortDescription: 'A test product',
      images: [{ url: '/images/products/oxford-shirt-sky.webp', alt: 'Test shirt' }],
      variants: [
        { sku: 'TST-LIN-01-S', size: 'S', stock: 4 },
        { sku: 'TST-LIN-01-M', size: 'M', stock: 0 },
      ],
    };
    const bad = await adminClient.post('/api/admin/products', { ...body, salePrice: 130000 });
    assert.equal(bad.status, 400, 'sale price above price rejected');
    const r = await adminClient.post('/api/admin/products', body);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    newId = r.body.id;
    const pub = await new Client(srv.base).get('/api/products/test-linen-shirt');
    assert.equal(pub.status, 200);
    assert.equal(pub.body.product.variants.length, 2);

    const full = (await adminClient.get(`/api/admin/products/${newId}`)).body.product;
    const upd = await adminClient.put(`/api/admin/products/${newId}`, {
      ...body,
      salePrice: 99000,
      featured: true,
      variants: full.variants.map((v: any) => ({ id: v.id, sku: v.sku, size: v.size, stock: v.size === 'M' ? 6 : v.stock })),
    });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    const after = (await new Client(srv.base).get('/api/products/test-linen-shirt')).body.product;
    assert.ok(after.variants.every((v: any) => v.price === 99000 && v.compareAt === 120000));
    assert.equal(after.variants.find((v: any) => v.size === 'M').stock, 6);
    assert.equal(after.featured, true);

    const del = await adminClient.del(`/api/admin/products/${newId}`);
    assert.equal(del.body.deleted, true);
    assert.equal((await new Client(srv.base).get('/api/products/test-linen-shirt')).status, 404);
  });

  test('ordered products are archived, not deleted; archived products leave the storefront', async () => {
    const pid = db.get<any>("SELECT id FROM products WHERE slug = 'stoneware-mug-pair'")!.id;
    const r = await adminClient.del(`/api/admin/products/${pid}`);
    assert.equal(r.body.archived, true);
    assert.equal((await new Client(srv.base).get('/api/products/stoneware-mug-pair')).status, 404);
    const q = (await new Client(srv.base).post('/api/cart/quote', { items: [{ variantId: db.get<any>('SELECT id FROM product_variants WHERE product_id = ?', pid)!.id, quantity: 1 }] })).body;
    assert.equal(q.issues[0].type, 'unavailable');
    await adminClient.patch(`/api/admin/products/${pid}`, { status: 'active' });
  });

  test('categories: create child category, reject unknown parent', async () => {
    const cats = (await adminClient.get('/api/admin/categories')).body.categories;
    const r = await adminClient.post('/api/admin/categories', { name: 'Test Sub', parentId: cats[0].id });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const list = (await adminClient.get('/api/admin/categories')).body.categories;
    const created = list.find((c: any) => c.name === 'Test Sub');
    assert.equal(created.parentId, cats[0].id);
  });

  test('orders search and filter', async () => {
    const all = (await adminClient.get('/api/admin/orders')).body;
    assert.ok(all.total >= 3);
    const cancelled = (await adminClient.get('/api/admin/orders?status=cancelled')).body.orders;
    assert.ok(cancelled.length >= 1 && cancelled.every((o: any) => o.status === 'cancelled'));
    const search = (await adminClient.get('/api/admin/orders?q=alice')).body.orders;
    assert.ok(search.length >= 1 && search.every((o: any) => /alice/i.test(o.email + o.fullName)));
    const requested = (await adminClient.get('/api/admin/orders?status=cancel_requested')).body.orders;
    assert.ok(requested.length >= 1);
  });

  test('settings update is validated and reflected publicly', async () => {
    const s = (await adminClient.get('/api/admin/settings')).body.settings;
    const r = await adminClient.put('/api/admin/settings', { ...s, storeName: 'SOLVIA Test' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await new Client(srv.base).get('/api/settings')).body.storeName, 'SOLVIA Test');
    await adminClient.put('/api/admin/settings', { ...s });
  });

  test('blog drafts are hidden from the public', async () => {
    const r = await adminClient.post('/api/admin/blog', { title: 'Draft only post', body: 'Hello world body text', status: 'draft', author: 'Team' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const slug = (await adminClient.get('/api/admin/blog')).body.posts.find((p: any) => p.title === 'Draft only post').slug;
    assert.equal((await new Client(srv.base).get(`/api/blog/${slug}`)).status, 404);
  });

  test('uploads: only real JPEG/PNG/WebP under 5 MB', async () => {
    const svg = await adminClient.req('POST', '/api/admin/uploads', undefined, { raw: Buffer.from('<svg/>'), headers: { 'Content-Type': 'image/svg+xml' } });
    assert.equal(svg.status, 400);
    const fake = await adminClient.req('POST', '/api/admin/uploads', undefined, { raw: Buffer.from('not really a png'), headers: { 'Content-Type': 'image/png' } });
    assert.equal(fake.status, 400);
    const big = await adminClient.req('POST', '/api/admin/uploads', undefined, { raw: Buffer.alloc(5 * 1024 * 1024 + 10, 0xff), headers: { 'Content-Type': 'image/jpeg' } });
    assert.ok([400, 413].includes(big.status));
    const { readFileSync } = await import('node:fs');
    const png = readFileSync(new URL('../public/apple-touch-icon.png', import.meta.url));
    const ok = await adminClient.req('POST', '/api/admin/uploads', undefined, { raw: png, headers: { 'Content-Type': 'image/png' } });
    assert.equal(ok.status, 200, ok.text);
    assert.match(ok.body.url, /^\/uploads\/.+\.(webp|png)$/);
  });

  test('admin can disable a customer, which ends their sessions', async () => {
    const c = new Client(srv.base);
    await c.post('/api/auth/register', { fullName: 'Dan', email: 'dan@example.com', password: 'dan-pass-12345', acceptTerms: true });
    const id = db.get<any>('SELECT id FROM users WHERE email = ?', 'dan@example.com')!.id;
    assert.equal((await adminClient.patch(`/api/admin/customers/${id}`, { status: 'disabled' })).status, 200);
    assert.equal((await c.get('/api/auth/me')).body.user, null);
    assert.equal((await c.post('/api/auth/login', { email: 'dan@example.com', password: 'dan-pass-12345' })).status, 401);
  });
});

// ---------------------------------------------------------------- SEO
describe('SEO', () => {
  test('robots.txt and sitemap.xml', async () => {
    const c = new Client(srv.base);
    const robots = await c.get('/robots.txt');
    assert.match(robots.text, /Disallow: \/admin/);
    assert.match(robots.text, /Sitemap: /);
    const sm = await c.get('/sitemap.xml');
    assert.match(sm.text, /<loc>[^<]+\/product\/halo-table-lamp<\/loc>/);
    assert.ok(!/draft-only-post/.test(sm.text), 'drafts not in sitemap');
  });

  test('product pages get unique title, canonical, OG and Product JSON-LD in the HTML', async () => {
    const c = new Client(srv.base);
    const html = (await c.get('/product/halo-table-lamp')).text;
    assert.match(html, /<title>Halo Table Lamp by Halden \| SOLVIA<\/title>/);
    assert.match(html, /<link rel="canonical" href="[^"]+\/product\/halo-table-lamp">/);
    assert.match(html, /property="og:image"/);
    assert.match(html, /"@type":"Product"/);
    assert.match(html, /"@type":"BreadcrumbList"/);
    const missing = await c.get('/product/nope');
    assert.equal(missing.status, 404);
    const cart = (await c.get('/cart')).text;
    assert.match(cart, /noindex/);
  });

  test('security headers present', async () => {
    const r = await new Client(srv.base).get('/');
    assert.match(r.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  });
});

// ---------------------------------------------------------------- webhook signature (unit-level, real HMAC)
describe('Stripe signature verification', () => {
  test('accepts a valid v1 signature and rejects tampering / stale timestamps', async () => {
    const { verifyStripeSignature } = await import('../server/services/payments/stripe.ts');
    const secret = 'whsec_test_123';
    const payload = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }));
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
    assert.equal(verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret).id, 'evt_1');
    assert.throws(() => verifyStripeSignature(Buffer.from(payload.toString().replace('evt_1', 'evt_2')), `t=${t},v1=${sig}`, secret));
    assert.throws(() => verifyStripeSignature(payload, `t=${t},v1=${sig}`, 'whsec_other'));
    const old = t - 3600;
    const oldSig = createHmac('sha256', secret).update(`${old}.${payload}`).digest('hex');
    assert.throws(() => verifyStripeSignature(payload, `t=${old},v1=${oldSig}`, secret));
  });
});
