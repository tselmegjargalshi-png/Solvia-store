/** Pure-function unit tests. Run: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, passwordProblems, verifyPassword } from '../server/lib/security.ts';
import { slugify, V } from '../server/lib/validate.ts';
import { fromStripeAmount, toStripeAmount } from '../server/services/payments/stripe.ts';
import { variantPricing } from '../server/services/catalog.ts';
import { ORDER_TRANSITIONS } from '../server/services/orders.ts';

test('password hashing round-trips and rejects wrong passwords', async () => {
  const h = await hashPassword('correct-horse-1');
  assert.match(h, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword('correct-horse-1', h), true);
  assert.equal(await verifyPassword('correct-horse-2', h), false);
  assert.notEqual(await hashPassword('correct-horse-1'), h, 'salted');
});

test('password policy', () => {
  assert.ok(passwordProblems('short1'));
  assert.ok(passwordProblems('onlyletterslong'));
  assert.ok(passwordProblems('1234567890123'));
  assert.equal(passwordProblems('letters-and-123'), null);
});

test('slugify', () => {
  assert.equal(slugify('  Café Crème — Large! '), 'cafe-creme-large');
  assert.equal(slugify('###'), '');
});

test('validator collects field errors', () => {
  const v = new V({ email: 'x', phone: 'abc', qty: '1.5' });
  v.email('email');
  v.phone('phone');
  v.int('qty', { min: 1 });
  v.str('name', { required: true });
  assert.deepEqual(Object.keys(v.errors).sort(), ['email', 'name', 'phone', 'qty']);
  assert.throws(() => v.check(), /highlighted/);
});

test('variant pricing: variant price overrides product; sale only when lower', () => {
  assert.deepEqual(variantPricing({ price: 100, sale_price: 80 }, { price: null, sale_price: null }), { base: 100, unit: 80, onSale: true });
  assert.deepEqual(variantPricing({ price: 100, sale_price: 80 }, { price: 120, sale_price: null }), { base: 120, unit: 120, onSale: false });
  assert.deepEqual(variantPricing({ price: 100, sale_price: null }, { price: null, sale_price: 150 }), { base: 100, unit: 100, onSale: false });
});

test('Stripe amount conversion handles minor units', () => {
  // MNT stored with 0 decimals; Stripe treats MNT as a 2-decimal currency.
  assert.equal(toStripeAmount(189000, 'MNT', 0), 18900000);
  assert.equal(fromStripeAmount(18900000, 'MNT', 0), 189000);
  // USD stored in cents.
  assert.equal(toStripeAmount(1999, 'USD', 2), 1999);
  // JPY is zero-decimal at Stripe.
  assert.equal(toStripeAmount(5000, 'JPY', 0), 5000);
});

test('order transitions never leave terminal states', () => {
  assert.deepEqual(ORDER_TRANSITIONS.cancelled, []);
  assert.deepEqual(ORDER_TRANSITIONS.refunded, []);
  assert.ok(!ORDER_TRANSITIONS.pending.includes('shipped'));
});
