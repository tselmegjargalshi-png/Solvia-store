/**
 * Browser end-to-end tests (Playwright + Chromium).
 *
 *   npm run build && npm run test:e2e
 *
 * Starts the real server on a throw-away database, creates an administrator with the
 * create-admin script, then drives the UI like a shopper and an admin would.
 * Screenshots go to tests/.e2e-output/ (git-ignored). Exit code 1 if any check fails.
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const OUT = process.env.E2E_OUT || path.join(root, 'tests', '.e2e-output');
mkdirSync(OUT, { recursive: true });
if (!existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/ missing — run `npm run build` first.');
  process.exit(1);
}

const PORT = Number(process.env.E2E_PORT || 4199);
const BASE = `http://127.0.0.1:${PORT}`;
const tmp = mkdtempSync(path.join(tmpdir(), 'solvia-e2e-'));
const ADMIN = { email: 'e2e-admin@example.com', password: 'E2e-admin-pass-1' };
const env = {
  ...process.env,
  SOLVIA_SKIP_DOTENV: '1',
  PORT: String(PORT),
  HOST: '127.0.0.1',
  PUBLIC_URL: BASE,
  DATABASE_PATH: path.join(tmp, 'e2e.db'),
  UPLOAD_DIR: path.join(tmp, 'uploads'),
  DISABLE_RATE_LIMIT: 'true',
  LOG_RESET_LINKS: 'false',
  PAYMENT_PROVIDER: 'demo',
};
const nodeArgs = ['--disable-warning=ExperimentalWarning'];

// ---- boot
const server = spawn(process.execPath, [...nodeArgs, 'server/index.ts'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(BASE + '/api/health')).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}
const mk = spawnSync(process.execPath, [...nodeArgs, 'server/scripts/create-admin.ts', '--email', ADMIN.email, '--name', 'E2E Admin'], {
  cwd: root,
  env: { ...env, ADMIN_PASSWORD: ADMIN.password },
  encoding: 'utf8',
});
if (mk.status !== 0) {
  console.error('create-admin failed', mk.stderr);
  process.exit(1);
}

// ---- tiny runner
const results = [];
let browser;
async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✔ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, err: String(e?.message ?? e).split('\n')[0] });
    console.log(`  ✖ ${name}\n      ${String(e?.message ?? e).split('\n').slice(0, 3).join('\n      ')}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const digits = (s) => Number(String(s).replace(/[^\d]/g, ''));

async function newPage(viewport = { width: 1280, height: 900 }, opts = {}) {
  const ctx = await browser.newContext({ viewport, ...opts });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && page.errors.push(m.text()));
  page.on('response', (r) => r.status() >= 500 && page.errors.push(`${r.status()} ${r.url()}`));
  page.setDefaultTimeout(8000);
  return page;
}
const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const overflowers = (page) =>
  page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter((e) => e.getBoundingClientRect().right > W + 0.5 && getComputedStyle(e).position !== 'fixed')
      .slice(0, 4)
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}(${Math.round(e.getBoundingClientRect().right)})`)
      .join(' ');
  });
const main = (page) => page.locator('main');
const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });

async function addToCart(page, slug, { color, size, qty } = {}) {
  await page.goto(`${BASE}/product/${slug}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  if (color) await page.getByRole('button', { name: new RegExp(`^Colour: ${color}`) }).click();
  if (size) await page.getByRole('button', { name: new RegExp(`^${size}$`) }).click();
  if (qty) await page.getByRole('spinbutton', { name: 'Quantity' }).fill(String(qty));
  await page.getByTestId('add-to-cart').click();
  await page.getByText('Added to cart').first().waitFor();
}

try {
  // PLAYWRIGHT_CHROMIUM_PATH lets you reuse a pre-installed Chromium instead of `npx playwright install`.
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  console.log(`E2E against ${BASE}\n`);

  // ---------------------------------------------------------------- storefront
  await check('homepage loads with hero, sections and no console errors', async () => {
    const page = await newPage();
    await page.goto(BASE + '/');
    await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Discover Better.' }).waitFor();
    for (const h of ['Shop by category', 'New arrivals', 'Collections', 'From the journal']) await page.getByRole('heading', { name: h }).first().waitFor();
    assert((await page.locator('.pcard').count()) >= 8, 'product cards rendered');
    assert((await page.title()).includes('SOLVIA'), 'title');
    assert(page.errors.length === 0, 'console errors: ' + page.errors.join(' | '));
    await shot(page, 'home-desktop');
    await page.context().close();
  });

  await check('every header/footer link on the homepage resolves (no 404s)', async () => {
    const page = await newPage();
    await page.goto(BASE + '/');
    await page.locator('.pcard').first().waitFor();
    await page.waitForLoadState('networkidle');
    const hrefs = await page.$$eval('header a[href], footer a[href], main a[href]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
    const internal = hrefs.filter((h) => h && h.startsWith('/'));
    assert(internal.length > 30, `found ${internal.length} links`);
    const bad = [];
    for (const h of internal) {
      const r = await fetch(BASE + h);
      if (r.status >= 400) bad.push(`${r.status} ${h}`);
    }
    const external = hrefs.filter((h) => h && /^https?:/.test(h));
    assert(bad.length === 0, 'broken: ' + bad.join(', '));
    assert(hrefs.every((h) => h !== '#' && h !== ''), 'placeholder # links present');
    console.log(`      (${internal.length} internal links OK; ${external.length} external social links)`);
    await page.context().close();
  });

  await check('shop: search from header shows matching results; empty search state', async () => {
    const page = await newPage();
    await page.goto(BASE + '/');
    await page.getByRole('button', { name: 'Search' }).first().click();
    const box = page.getByRole('searchbox').first();
    await box.fill('lamp');
    await box.press('Enter');
    await page.waitForURL(/\/search\?q=lamp/);
    await page.getByRole('heading', { name: /lamp/i }).first().waitFor();
    const titles = await page.locator('.pcard__title').allInnerTexts();
    assert(titles.length > 0 && titles.every((t) => /lamp/i.test(t)), 'titles: ' + titles.join(','));
    await page.goto(BASE + '/search?q=qqqqzzzz');
    await page.getByText('No products match these filters').waitFor();
    await page.context().close();
  });

  await check('shop: category, price, brand, availability filters and clear-all work on real data', async () => {
    const page = await newPage();
    await page.goto(BASE + '/shop');
    await page.locator('.pcard').first().waitFor();
    const countText = async () => digits(await page.locator('.shop__main').getByText(/^\d+ products?$/).first().innerText());
    const all = await countText();
    assert(all >= 24, 'total products ' + all);

    // Price range
    await page.locator('.shop__aside #pmin').fill('100000');
    await page.locator('.shop__aside #pmax').fill('250000');
    await page.locator('.shop__aside').getByRole('button', { name: 'Apply' }).click();
    await page.waitForURL(/minPrice=100000/);
    await page.waitForTimeout(400);
    const prices = (await page.locator('.pcard .price__now').allInnerTexts()).map(digits);
    assert(prices.length > 0 && prices.every((p) => p >= 100000 && p <= 250000), 'prices in range: ' + prices.join(','));
    const inRange = await countText();
    assert(inRange < all, 'count reduced');

    // Brand
    const brandBox = page.locator('.shop__aside label.toggle-row', { hasText: 'Halden' }).locator('input').first();
    await brandBox.check();
    await page.waitForURL(/brand=halden/);
    await page.waitForTimeout(400);
    const brands = await page.locator('.pcard__brand').allInnerTexts();
    assert(brands.length > 0 && brands.every((b) => /halden/i.test(b)), 'brands: ' + brands.join(','));

    // Clear all
    await page.getByRole('button', { name: 'Clear all' }).first().click();
    await page.waitForURL((u) => !u.search.includes('brand') && !u.search.includes('minPrice'));
    await page.waitForTimeout(400);
    assert((await countText()) === all, 'clear restores all');

    // Availability
    await page.locator('.shop__aside label.toggle-row', { hasText: 'In stock only' }).locator('input').first().check();
    await page.waitForURL(/inStock=1/);
    await page.waitForTimeout(400);
    assert((await countText()) < all, 'in-stock filter reduces count');

    // Category page
    await page.goto(BASE + '/category/lighting');
    await page.getByRole('heading', { level: 1, name: /lighting/i }).waitFor();
    const n = await page.locator('.pcard').count();
    assert(n > 0, 'category has products');
    await shot(page, 'category-lighting');
    await page.context().close();
  });

  await check('shop: sorting by price and name re-orders the grid', async () => {
    const page = await newPage();
    await page.goto(BASE + '/shop');
    await page.locator('.pcard').first().waitFor();
    const sort = page.getByLabel('Sort by');
    await sort.selectOption('price_asc');
    await page.waitForURL(/sort=price_asc/);
    await page.waitForTimeout(400);
    let p = (await page.locator('.pcard .price__now').allInnerTexts()).map(digits);
    assert(p.join() === [...p].sort((a, b) => a - b).join(), 'ascending ' + p.join(','));
    await sort.selectOption('price_desc');
    await page.waitForURL(/sort=price_desc/);
    await page.waitForTimeout(400);
    p = (await page.locator('.pcard .price__now').allInnerTexts()).map(digits);
    assert(p.join() === [...p].sort((a, b) => b - a).join(), 'descending ' + p.join(','));
    await sort.selectOption('name_asc');
    await page.waitForURL(/sort=name_asc/);
    await page.waitForTimeout(400);
    const names = (await page.locator('.pcard__title').allInnerTexts()).map((s) => s.toLowerCase());
    assert(names.join() === [...names].sort().join(), 'a-z');
    await page.context().close();
  });

  await check('shop: pagination moves to page 2 with different products', async () => {
    const page = await newPage();
    await page.goto(BASE + '/shop');
    await page.locator('.pcard').first().waitFor();
    const first = await page.locator('.pcard__title').allInnerTexts();
    const next = page.getByRole('link', { name: /Next/ }).or(page.getByRole('button', { name: /Next|Load more/ }));
    await next.first().click();
    await page.waitForTimeout(600);
    const second = await page.locator('.pcard__title').allInnerTexts();
    assert(second.some((t) => !first.includes(t)), 'new products shown');
    await page.context().close();
  });

  await check('product detail: gallery thumbnails, variant selection, sold-out sizes disabled, stock shown', async () => {
    const page = await newPage();
    await page.goto(BASE + '/product/merino-crew-sweater');
    await page.getByRole('heading', { level: 1, name: 'Merino Crew Sweater' }).waitFor();
    // Navy XL is sold out in the seed data.
    await page.getByRole('button', { name: /^Colour: Navy/ }).click();
    const xl = page.getByRole('button', { name: /^XL/ });
    assert(await xl.isDisabled(), 'sold-out size disabled');
    await page.getByRole('button', { name: /^M$/ }).click();
    const stock = await page.getByTestId('stock-status').innerText();
    assert(/in stock|only \d+ left/i.test(stock), 'stock text: ' + stock);
    const thumbs = page.locator('.gallery__thumb');
    assert((await thumbs.count()) >= 2, 'thumbnails');
    await thumbs.nth(1).click();
    assert((await thumbs.nth(1).getAttribute('aria-current')) === 'true' || (await thumbs.nth(1).getAttribute('aria-pressed')) === 'true', 'thumbnail becomes current');
    for (const h of ['Description', 'Specifications']) await page.getByText(h, { exact: true }).first().waitFor();
    await page.getByRole('heading', { name: 'You may also like' }).waitFor();
    await shot(page, 'product-desktop');
    assert(page.errors.length === 0, page.errors.join(' | '));
    await page.context().close();
  });

  await check('product detail: quantity cannot exceed stock or go below 1', async () => {
    const page = await newPage();
    await page.goto(BASE + '/product/halo-table-lamp');
    await page.getByRole('button', { name: /^Colour: Black/ }).click(); // stock 2
    const qty = page.getByRole('spinbutton', { name: 'Quantity' });
    const inc = page.getByRole('button', { name: 'Increase quantity' });
    await inc.click();
    assert(Number(await qty.inputValue()) === 2, 'increments to 2');
    assert(await inc.isDisabled(), 'increase disabled at stock limit (2)');
    await qty.fill('9');
    assert(Number(await qty.inputValue()) <= 2, 'typed value capped at stock, got ' + (await qty.inputValue()));
    await qty.fill('-4');
    assert(Number(await qty.inputValue()) >= 1, 'not negative, got ' + (await qty.inputValue()));
    assert(await page.getByRole('button', { name: 'Decrease quantity' }).isDisabled(), 'decrease disabled at 1');
    await page.context().close();
  });

  await check('sold-out product cannot be added', async () => {
    const page = await newPage();
    await page.goto(BASE + '/product/dome-pendant-light');
    await page.getByRole('heading', { level: 1 }).waitFor();
    assert(await page.getByTestId('add-to-cart').isDisabled(), 'add disabled');
    assert(/out of stock/i.test(await page.getByTestId('stock-status').innerText()), 'out of stock label');
    await page.context().close();
  });

  let checkoutPage;
  await check('cart: add items, count updates, quantity change and removal recalculate totals', async () => {
    const page = await newPage();
    await addToCart(page, 'halo-table-lamp', { color: 'Brass' });
    assert((await page.getByTestId('cart-count').innerText()).trim() === '1', 'count 1');
    await addToCart(page, 'stoneware-mug-pair', {});
    assert((await page.getByTestId('cart-count').innerText()).trim() === '2', 'count 2');
    await page.goto(BASE + '/cart');
    await page.getByTestId('cart-line').first().waitFor();
    assert((await page.getByTestId('cart-line').count()) === 2, 'two lines');
    const sub1 = digits(await page.getByTestId('subtotal').innerText());
    const lamp = page.getByTestId('cart-line').filter({ hasText: 'Halo Table Lamp' });
    await lamp.getByRole('button', { name: 'Increase quantity' }).click();
    await page.waitForFunction((prev) => {
      const el = document.querySelector('[data-testid="subtotal"]');
      return el && Number(el.textContent.replace(/[^\d]/g, '')) !== prev;
    }, sub1);
    const sub2 = digits(await page.getByTestId('subtotal').innerText());
    assert(sub2 === sub1 + 249000, `subtotal ${sub1} → ${sub2}`);
    // Lines sum to subtotal; total = subtotal (+ shipping when chosen), VAT included.
    await page.getByTestId('cart-line').filter({ hasText: 'Stoneware Mug Pair' }).getByRole('button', { name: /Remove/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="cart-line"]').length === 1);
    const sub3 = digits(await page.getByTestId('subtotal').innerText());
    assert(sub3 === 249000 * 2, 'after removal ' + sub3);
    assert((await page.getByTestId('cart-count').innerText()).trim() === '2', 'count follows quantities');
    await shot(page, 'cart-desktop');
    checkoutPage = page;
  });

  await check('cart persists across reloads (guest local persistence)', async () => {
    const page = checkoutPage;
    await page.reload();
    await page.getByTestId('cart-line').first().waitFor();
    assert((await page.getByTestId('cart-line').count()) === 1, 'still one line');
  });

  await check('cart: tampered localStorage price does not change totals', async () => {
    const page = checkoutPage;
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) {
        const v = localStorage.getItem(k);
        if (v && v.includes('variantId')) localStorage.setItem(k, v.replace(/"quantity":\d+/g, '"quantity":2,"price":1,"unitPrice":1'));
      }
    });
    await page.reload();
    await page.getByTestId('cart-line').first().waitFor();
    await page.waitForTimeout(400);
    assert(digits(await page.getByTestId('subtotal').innerText()) === 498000, 'server price used');
  });

  await check('checkout: validation errors shown, focus moves to first invalid field', async () => {
    const page = checkoutPage;
    await page.getByTestId('checkout-link').click();
    await page.waitForURL(/\/checkout$/);
    await page.getByTestId('place-order').click();
    await page.getByText('Please correct the highlighted fields.').first().waitFor();
    const invalid = await page.locator('[aria-invalid="true"]').count();
    assert(invalid >= 4, 'invalid fields ' + invalid);
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-invalid'));
    assert(focused === 'true', 'focus on invalid field');
    await shot(page, 'checkout-errors', true);
  });

  let orderUrl;
  await check('checkout: demo card payment → clearly labelled demo page → paid confirmation', async () => {
    const page = checkoutPage;
    await main(page).getByLabel('Full name').fill('Test Shopper');
    await main(page).getByLabel('Email', { exact: true }).fill('shopper@example.com');
    await main(page).getByLabel('Phone').fill('+976 9911 2233');
    await main(page).getByLabel('City').fill('Ulaanbaatar');
    await main(page).getByLabel('Street address').fill('Peace Avenue 1, Building 2');
    await page.locator('input[name="shippingMethod"][value="express"]').check();
    await page.waitForTimeout(300);
    const total = digits(await page.getByTestId('total').innerText());
    assert(total === 498000 + 15000, 'total with express shipping ' + total);
    await page.locator('input[name="paymentMethod"][value="card"]').check();
    await page.getByText(/DEMO MODE — no real payment is taken/).waitFor();
    await page.getByRole('checkbox', { name: /I have read and accept/ }).check();
    await page.getByTestId('place-order').click();
    await page.waitForURL(/\/checkout\/demo-payment\//);
    await page.getByText('This is a simulated payment page. No card details are collected and no money moves.').waitFor();
    assert((await page.locator('input[autocomplete="cc-number"], input[name*="card" i]').count()) === 0, 'no card inputs');
    await shot(page, 'demo-payment');
    // The order exists but is NOT paid yet.
    const num = decodeURIComponent(page.url().split('/demo-payment/')[1].split('?')[0]);
    const tok = new URL(page.url()).searchParams.get('token');
    const before = await (await fetch(`${BASE}/api/orders/${num}?token=${tok}`)).json();
    assert(before.order.paymentStatus === 'pending', 'pending before confirmation');
    await page.getByTestId('demo-pay-success').click();
    await page.waitForURL(/\/order\//);
    await page.getByText(/DEMO PAYMENT — simulated, no money was charged/).waitFor();
    await page.getByText(/Thank you/).first().waitFor();
    assert((await page.getByTestId('cart-count').count()) === 0 || (await page.getByTestId('cart-count').innerText()).trim() === '0', 'cart cleared');
    const ev = await page.evaluate(() => (window.__solviaEvents || []).map((e) => e.name));
    assert(!ev.includes('purchase'), 'simulated demo payment must not be reported as a purchase');
    orderUrl = page.url();
    await shot(page, 'order-confirmation', true);
    await page.context().close();
  });

  await check('checkout: empty cart shows empty state instead of a form', async () => {
    const page = await newPage();
    await page.goto(BASE + '/checkout');
    await page.getByText('Your cart is empty, so there is nothing to check out.').waitFor();
    assert((await page.getByTestId('place-order').count()) === 0, 'no place-order button');
    await page.context().close();
  });

  await check('order confirmation is private: a different browser without the token sees "not found"', async () => {
    const page = await newPage();
    const u = new URL(orderUrl);
    await page.goto(BASE + u.pathname);
    await page.getByText(/Order not found, or you don’t have access to it/).waitFor();
    await page.context().close();
  });

  // ---------------------------------------------------------------- accounts
  await check('account: register → protected account page → cash order appears in history → logout', async () => {
    const page = await newPage();
    await page.goto(BASE + '/account');
    await page.waitForURL(/\/login/);
    await page.goto(BASE + '/register');
    await main(page).getByLabel('Full name').fill('Erdene Bat');
    await main(page).getByLabel('Email', { exact: true }).fill('erdene@example.com');
    await main(page).getByLabel('Password', { exact: true }).fill('short');
    await page.getByRole('checkbox', { name: /I accept the/ }).check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.locator('[aria-invalid="true"]').first().waitFor();
    await main(page).getByLabel('Password', { exact: true }).fill('erdene-pass-2026');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL(/\/account/);
    await page.getByText(/Hello, Erdene/).waitFor();

    await addToCart(page, 'stoneware-mug-pair', {});
    await page.goto(BASE + '/checkout');
    assert((await main(page).getByLabel('Email', { exact: true }).inputValue()) === 'erdene@example.com', 'email prefilled');
    await main(page).getByLabel('Phone').fill('+976 8800 1122');
    await main(page).getByLabel('City').fill('Darkhan');
    await main(page).getByLabel('Street address').fill('Central street 5, apt 12');
    await page.locator('input[name="paymentMethod"][value="cod"]').check();
    await page.getByRole('checkbox', { name: /I have read and accept/ }).check();
    await page.getByTestId('place-order').click();
    await page.waitForURL(/\/order\//);
    const number = decodeURIComponent(new URL(page.url()).pathname.split('/order/')[1]);
    await page.getByText(/Please have the exact amount ready/).waitFor();
    await page.goto(BASE + '/account/orders');
    await page.getByText(number).first().waitFor();
    await shot(page, 'account-orders');
    // sign out via account menu
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('button', { name: 'Sign out' }).or(page.getByRole('menuitem', { name: 'Sign out' })).first().click();
    await page.waitForTimeout(400);
    await page.goto(BASE + '/account/orders');
    await page.waitForURL(/\/login/);
    await page.context().close();
  });

  await check('wishlist: heart a product, it appears on /wishlist', async () => {
    const page = await newPage();
    await page.goto(BASE + '/product/arc-ceramic-vase');
    await page.getByRole('button', { name: /Add to wishlist: Arc Ceramic Vase/ }).first().click();
    await page.goto(BASE + '/wishlist');
    await page.locator('.pcard__title', { hasText: 'Arc Ceramic Vase' }).waitFor();
    await page.context().close();
  });

  await check('forgot password shows the same neutral message for any email', async () => {
    const page = await newPage();
    await page.goto(BASE + '/forgot-password');
    await main(page).getByLabel('Email', { exact: true }).fill('nobody@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await page.getByText(/If an account exists for that email/).waitFor();
    await page.context().close();
  });

  // ---------------------------------------------------------------- admin
  await check('admin: anonymous and customer users are refused', async () => {
    const page = await newPage();
    await page.goto(BASE + '/admin');
    await page.waitForURL(/\/login|\/admin/);
    const apiAnon = await page.evaluate(() => fetch('/api/admin/dashboard').then((r) => r.status));
    assert(apiAnon === 401, 'anon API 401, got ' + apiAnon);
    await page.goto(BASE + '/login');
    await main(page).getByLabel('Email', { exact: true }).fill('erdene@example.com');
    await main(page).getByLabel('Password', { exact: true }).fill('erdene-pass-2026');
    await main(page).getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/account/);
    const apiCust = await page.evaluate(() => fetch('/api/admin/dashboard').then((r) => r.status));
    assert(apiCust === 403, 'customer API 403, got ' + apiCust);
    await page.goto(BASE + '/admin');
    await page.getByText(/Administrator access required|not have permission|Access denied/i).first().waitFor();
    await page.context().close();
  });

  let adminPage;
  await check('admin: dashboard shows real totals and recent orders', async () => {
    const page = await newPage({ width: 1366, height: 900 });
    await page.goto(BASE + '/login');
    await main(page).getByLabel('Email', { exact: true }).fill(ADMIN.email);
    await main(page).getByLabel('Password', { exact: true }).fill(ADMIN.password);
    await main(page).getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/admin/); // admins land on the dashboard after sign-in
    await page.getByRole('heading', { name: /Dashboard/i }).first().waitFor();
    const dash = await page.evaluate(() => fetch('/api/admin/dashboard').then((r) => r.json()));
    assert(dash.totals.orders === 2, 'two orders so far, got ' + dash.totals.orders);
    await page.getByText(dash.recentOrders?.[0]?.number ?? 'SV-').first().waitFor();
    await page.waitForTimeout(300);
    await shot(page, 'admin-dashboard', true);
    adminPage = page;
  });

  await check('admin: create a product, see it on the storefront, then archive it', async () => {
    const page = adminPage;
    await page.goto(BASE + '/admin/products');
    await page.getByRole('link', { name: 'New product' }).click();
    await page.getByLabel('Name (English)').fill('E2E Canvas Tote');
    await page.getByLabel('Product SKU').fill('E2E-TOTE-1');
    await page.getByLabel('Price', { exact: true }).fill('99000');
    await page.getByLabel('Visibility').selectOption('active');
    await page.getByLabel('sku for variant 1').fill('E2E-TOTE-1-STD');
    await page.getByLabel('stock for variant 1').fill('7');
    await page.getByRole('button', { name: 'Save product' }).click();
    await page.getByText('Product saved').first().waitFor();
    const r = await fetch(BASE + '/api/products/e2e-canvas-tote');
    assert(r.status === 200, 'visible on storefront: ' + r.status);
    const p = (await r.json()).product;
    assert(p.variants[0].price === 99000 && p.variants[0].stock === 7, 'price and stock saved');
    await shot(page, 'admin-product-form', true);
    const id = p.id;
    const del = await page.evaluate((id) => fetch(`/api/admin/products/${id}`, { method: 'DELETE', headers: { 'X-Solvia-Request': '1' } }).then((r) => r.json()), id);
    assert(del.deleted || del.archived, 'removed');
  });

  await check('admin: order management — search, filter, permitted status changes only', async () => {
    const page = adminPage;
    await page.goto(BASE + '/admin/orders');
    await page.locator('table tbody tr').first().waitFor();
    assert((await page.locator('table tbody tr').count()) === 2, 'two orders listed');
    const search = page.getByLabel('Search number, name, email, phone');
    await search.fill('erdene');
    await search.press('Enter');
    await page.waitForURL(/q=erdene/);
    await page.waitForTimeout(400);
    assert((await page.locator('table tbody tr').count()) === 1, 'search narrows to one');
    await page.locator('table tbody tr').first().getByRole('link').first().click();
    await page.getByRole('button', { name: 'Mark as confirmed' }).waitFor();
    // From "pending" only confirmed/cancelled are offered — never shipped/delivered.
    assert((await page.getByRole('button', { name: /Mark as (shipped|delivered|refunded)/ }).count()) === 0, 'invalid transitions hidden');
    await page.getByRole('button', { name: 'Mark as confirmed' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await page.getByText(/Status changed: pending → confirmed/).waitFor();
    await shot(page, 'admin-order-detail', true);
  });

  await check('admin: customers list and content pages render', async () => {
    const page = adminPage;
    for (const [p, txt] of [
      ['/admin/customers', 'erdene@example.com'],
      ['/admin/content', /Blog|Journal|FAQ/i],
      ['/admin/settings', /Store name/i],
      ['/admin/categories', /Categor/i],
    ]) {
      await page.goto(BASE + p);
      await page.getByText(txt).first().waitFor();
    }
    assert(page.errors.length === 0, page.errors.join(' | '));
    await page.context().close();
  });

  // ---------------------------------------------------------------- i18n
  await check('language switch to Mongolian translates navigation and persists; currency unchanged', async () => {
    const page = await newPage();
    await page.goto(BASE + '/');
    const priceBefore = await page.locator('.pcard .price__now').first().innerText();
    await page.getByRole('group', { name: 'Language' }).first().getByRole('button', { name: /MN|Монгол/ }).click();
    await page.getByRole('link', { name: 'Дэлгүүр' }).first().waitFor();
    assert((await page.getAttribute('html', 'lang')) === 'mn', 'html lang=mn');
    const priceAfter = await page.locator('.pcard .price__now').first().innerText();
    assert(digits(priceBefore) === digits(priceAfter), 'same amount after language switch');
    await page.reload();
    await page.getByRole('link', { name: 'Дэлгүүр' }).first().waitFor();
    await shot(page, 'home-mn');
    await page.context().close();
  });

  // ---------------------------------------------------------------- mobile + responsive
  await check('mobile: menu opens as accessible dialog, navigates, closes with Escape', async () => {
    const page = await newPage({ width: 375, height: 760 }, { isMobile: true, hasTouch: true });
    await page.goto(BASE + '/');
    const burger = page.getByRole('button', { name: 'Menu' });
    await burger.click();
    const nav = page.locator('.mnav');
    await nav.waitFor();
    await shot(page, 'mobile-menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert((await burger.getAttribute('aria-expanded')) === 'false', 'closed with Escape');
    await burger.click();
    await nav.getByRole('link', { name: 'Offers' }).click();
    await page.waitForURL(/\/offers/);
    await page.locator('.pcard').first().waitFor();
    await page.context().close();
  });

  await check('responsive: no horizontal overflow on key pages at 320/360/390/768/1024/1440', async () => {
    const pages = ['/', '/shop', '/product/merino-crew-sweater', '/cart', '/checkout', '/blog', '/about', '/faq', '/contact', '/login', '/account', '/admin'];
    const bad = [];
    for (const w of [320, 360, 390, 768, 1024, 1440]) {
      const page = await newPage({ width: w, height: 800 });
      // Put something in the cart so cart/checkout render their full layouts.
      if (w === 320 || w === 390) await addToCart(page, 'stoneware-mug-pair', {});
      for (const p of pages) {
        await page.goto(BASE + p);
        await page.waitForLoadState('networkidle');
        const o = await overflowX(page);
        if (o > 1) bad.push(`${w}px ${p} (+${o}px: ${await overflowers(page)})`);
      }
      if (w === 390) {
        await page.goto(BASE + '/product/merino-crew-sweater');
        await page.waitForLoadState('networkidle');
        await shot(page, 'product-mobile', true);
        await page.goto(BASE + '/shop');
        await page.waitForLoadState('networkidle');
        await shot(page, 'shop-mobile');
        await page.goto(BASE + '/checkout');
        await page.waitForLoadState('networkidle');
        await shot(page, 'checkout-mobile', true);
      }
      await page.context().close();
    }
    assert(bad.length === 0, 'overflow: ' + bad.join(', '));
  });

  await check('mobile filters open in a drawer and apply', async () => {
    const page = await newPage({ width: 390, height: 800 }, { isMobile: true, hasTouch: true });
    await page.goto(BASE + '/shop');
    await page.getByRole('button', { name: /Show filters|Filters/ }).first().click();
    await page.getByRole('dialog').locator('label.toggle-row', { hasText: 'On sale' }).locator('input').check();
    await page.waitForURL(/onSale=1/);
    await shot(page, 'mobile-filters');
    const btn = page.getByRole('button', { name: /Show \d+ results/ });
    if (await btn.count()) await btn.click();
    await page.waitForTimeout(300);
    const badges = await page.locator('.pcard').count();
    assert(badges > 0, 'sale products shown');
    await page.context().close();
  });

  // ---------------------------------------------------------------- a11y basics
  await check('accessibility basics: skip link, one h1 per page, labelled inputs, images have alt', async () => {
    const page = await newPage();
    const problems = [];
    for (const p of ['/', '/shop', '/product/halo-table-lamp', '/cart', '/checkout', '/login', '/register', '/contact', '/blog']) {
      await page.goto(BASE + p);
      await page.waitForLoadState('networkidle');
      const r = await page.evaluate(() => {
        const h1 = document.querySelectorAll('h1').length;
        const unlabeled = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((el) => {
          const id = el.id;
          return !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (id && document.querySelector(`label[for="${id}"]`)) || el.closest('label'));
        }).length;
        const noAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length;
        const skip = !!document.querySelector('a.skip-link[href="#main"]');
        return { h1, unlabeled, noAlt, skip };
      });
      if (r.h1 !== 1) problems.push(`${p}: ${r.h1} h1`);
      if (r.unlabeled) problems.push(`${p}: ${r.unlabeled} unlabeled inputs`);
      if (r.noAlt) problems.push(`${p}: ${r.noAlt} img without alt`);
      if (!r.skip) problems.push(`${p}: no skip link`);
    }
    // Keyboard: first Tab lands on the skip link.
    await page.goto(BASE + '/');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.className);
    if (!/skip-link/.test(focused ?? '')) problems.push('first Tab does not reach skip link');
    assert(problems.length === 0, problems.join('; '));
    await page.context().close();
  });

  await check('analytics events fire locally (no GA configured → nothing sent externally)', async () => {
    const page = await newPage();
    const external = [];
    page.on('request', (r) => /google/.test(r.url()) && external.push(r.url()));
    await addToCart(page, 'arc-ceramic-vase', { color: 'Sand' });
    await page.getByTestId('cart-link').click(); // client-side navigation keeps the event log
    await page.getByTestId('cart-line').first().waitFor();
    await page.getByTestId('checkout-link').click();
    await page.waitForURL(/checkout/);
    await page.getByTestId('place-order').waitFor();
    const names = await page.evaluate(() => (window.__solviaEvents || []).map((e) => e.name));
    for (const n of ['view_item', 'add_to_cart', 'view_cart', 'begin_checkout']) assert(names.includes(n), `${n} missing in ${names}`);
    assert(!names.includes('purchase'), 'purchase not fired before an order');
    assert(external.length === 0, 'external analytics requests: ' + external.join(','));
    await page.context().close();
  });
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  rmSync(tmp, { recursive: true, force: true });
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed. Screenshots: ${path.relative(root, OUT)}/`);
if (passed !== results.length) {
  console.log('\nFailed:');
  for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.name}: ${r.err}`);
  if (process.env.E2E_DEBUG) console.log('\nServer log:\n' + serverLog.slice(-4000));
  process.exit(1);
}
