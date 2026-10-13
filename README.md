# SOLVIA — Premium E-commerce Store & Management System

[![CI](https://github.com/tselmegjargalshi-png/Solvia-store/actions/workflows/main.yml/badge.svg)](https://github.com/tselmegjargalshi-png/Solvia-store/actions/workflows/main.yml)

A full-stack online store: a React + TypeScript storefront, a Node.js + TypeScript API, a SQLite
database with migrations, customer accounts, a server-validated cart and checkout, inventory and
order management, an admin dashboard, a pluggable payment layer (clearly labelled demo mode +
Stripe Checkout integration), English/Mongolian interface, and technical SEO.

> **Status: working demo, not production-ready.** Everything listed below runs and is tested
> locally (see [docs/TESTING.md](docs/TESTING.md)). Before taking real orders you must configure
> live payments, email delivery, HTTPS hosting and backups, and have the security reviewed — see
> [Known limitations](#known-limitations) and [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

The brand name, catalog, brands, articles and images are **demonstration content**. Product
images are generated illustrations (labelled "Illustrative demo image" on product pages), not
photography.

---

## Contents

- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Continuous integration](#continuous-integration)
- [Tech stack and toolchain note](#tech-stack-and-toolchain-note)
- [Project structure](#project-structure)
- [Feature overview](#feature-overview)
- [Security model](#security-model)
- [Payments](#payments)
- [Multilingual support](#multilingual-support)
- [SEO and analytics](#seo-and-analytics)
- [Changing the brand](#changing-the-brand)
- [Known limitations](#known-limitations)

---

## Quick start

Requirements: **Node.js 22.18 or newer** (uses the built-in `node:sqlite` module and native
TypeScript type-stripping — no compile step for the server).

```bash
npm ci                 # exact versions from package-lock.json (react, esbuild, typescript, playwright, optional sharp)
npm run setup          # creates .env from .env.example, runs migrations, seeds the demo catalog
npm run create-admin -- --email you@example.com --name "Your Name"   # prompts for a password
npm run build          # bundles the client into dist/
npm start              # http://localhost:4173
```

For development with automatic rebuilds and server restarts:

```bash
npm run dev            # http://localhost:4173
```

Sign in at `/login` with the admin account you created; admins land on `/admin`.
There is **no default administrator and no hard-coded password** anywhere in the code.

Demo checkout tips: coupon `WELCOME10` (10 % off orders over ₮100,000); choose "Card payment" to
see the labelled demo payment page, or "Cash on delivery" / "Bank transfer" for manual payment flows.

## Scripts

| Command | What it does |
|---|---|
| `npm run setup` | First-time setup: `.env`, migrations, demo catalog (never creates users) |
| `npm run create-admin -- --email … [--name …]` | Create or promote an administrator; password via hidden prompt or `ADMIN_PASSWORD` |
| `npm run dev` | Watch-mode client build + auto-restarting API server |
| `npm run build` | Production client bundle (minified, hashed, code-split) and a size report |
| `npm start` | Run the server (serves API, built client and public assets) |
| `npm run seed` / `npm run seed -- --reset` | Seed if empty / wipe and reseed (refused when `NODE_ENV=production`) |
| `npm run typecheck` | TypeScript checks for client and server |
| `npm test` | 55 API integration + unit tests (temporary database) |
| `npm run test:e2e` | 30 browser end-to-end checks with Playwright/Chromium (run `npm run build` and `npx playwright install chromium` first) |
| `npm run images` | Regenerate the demo illustrations (needs `sharp`) |

## Continuous integration

`.github/workflows/main.yml` runs on every push to `main`, on every pull request and on demand:

1. **check** — `npm ci`, `npm run typecheck`, `npm test`, `npm run build` (the `dist/` bundle is
   kept as a build artifact for 7 days).
2. **e2e** — installs Chromium and runs `npm run test:e2e` against a fresh build; screenshots
   from `tests/.e2e-output/` are uploaded as an artifact, including on failure.

CI uses Node.js 22 and needs no secrets: tests use a temporary database and demo payments.

To run the browser tests with an already installed Chromium instead of Playwright's download,
set `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium`.

## Tech stack and toolchain note

| Layer | Choice | Why |
|---|---|---|
| Client | React 19 + TypeScript, plain modern CSS | Reusable components, no CSS framework weight |
| Bundler | **esbuild** (`scripts/build.mjs`) | See note below |
| Server | Node.js `node:http` + TypeScript (type-stripping) | No framework dependency; small, auditable router |
| Database | SQLite via `node:sqlite`, WAL mode, foreign keys, migrations | Zero-ops relational DB; transactions for stock + orders |
| Auth | scrypt password hashes, opaque session tokens (hashed in DB), HttpOnly cookies | Standard library only |
| Images | `sharp` (optional) for upload re-encoding and demo image generation | |
| Tests | `node:test` (API/unit), Playwright (browser) | |

**Toolchain note — deviations from the preferred stack.** The brief preferred Vite. When the
project was first built the npm registry was unreachable, so Vite and `react-router` could not be
installed. The project therefore:

- bundles with **esbuild** (the bundler Vite uses internally) — `scripts/build.mjs` does hashing,
  code splitting, CSS extraction and HTML generation;
- uses a small **history-API router** (`client/router.tsx`) with the same concepts as
  react-router (params, query strings, links, redirects).

Type checking uses the official `@types/react` / `@types/react-dom` packages;
`client/types/assets.d.ts` only declares CSS imports for the bundler.

Moving to Vite later is straightforward: `client/main.tsx` is a standard entry point and the
server only needs `dist/index.html` with a `<!--head-->` placeholder.

## Project structure

```
config/brand.ts              Brand name, defaults for currency, contact, social, shipping, tax (shared, no secrets)
server/
  index.ts, app.ts           HTTP server, static files, SPA fallback with per-page SEO tags, security headers, CSRF check
  env.ts                     Environment configuration (secrets only read here)
  db/                        Connection, transaction helper, append-only migrations (schema)
  lib/                       Router/HTTP helpers, validation, password hashing, rate limiting
  services/                  Business logic: catalog, pricing (quotes), orders + inventory, auth,
                             settings, uploads, SEO, payments/{demo,stripe}
  routes/                    public, account, checkout/payments, admin (every admin route wrapped in requireAdmin)
  scripts/                   seed, create-admin, demo catalog data
client/
  main.tsx, App.tsx          Entry, providers, central route table, error boundary, lazy routes
  router.tsx                 Client router
  i18n/                      en.ts, mn.ts (394 keys each), provider with locale-aware formatting
  state/                     auth, cart (guest localStorage + server cart sync), wishlist, settings, toasts
  lib/                       API client, analytics hooks, SEO hook, formatting, types
  components/                Header, Footer, ProductCard/Grid/Gallery, PriceDisplay, QuantitySelector,
                             FilterPanel, CartItem/CartSummary, OrderView, ui (fields, dialogs, states, badges)
  pages/                     Storefront pages, account/, admin/
  styles/styles.css          Design system (tokens, components, responsive rules)
public/                      Fonts (OFL), demo images (480/800/1200 px WebP), favicon, uploads/
scripts/                     build, dev, setup, image generator
tests/                       api.test.ts, unit.test.ts, e2e.mjs, helpers.ts
docs/                        TESTING.md, CONFIGURATION.md
```

## Feature overview

**Storefront (30+ routes):** home, shop, category (with sub-categories), search, new arrivals,
best sellers (ranked by real units ordered), offers, product detail, cart, checkout, demo payment,
order confirmation, login, register, forgot/reset password, account (overview, orders, order detail,
addresses, settings), wishlist, about, journal + article, contact, FAQ, shipping, returns, privacy,
terms, 404, and the admin dashboard.

**Catalog:** products with slug, SKU, descriptions, specifications, category, brand, price,
sale price, currency, images with alt text and per-colour assignment, status (draft/active/archived),
featured flag, created/updated dates. Every product has ≥1 variant; variants have their own SKU,
optional price/sale price and stock. Simple, size-only, colour-only and colour×size products are
all in the demo catalog.

**Listing:** search, category, price range, brand, colour, size, in-stock and on-sale filters;
featured/newest/price/name/best-selling sorting; pagination; facet counts; filter chips; clear-all;
loading, empty and error states. Filters run as SQL against the real data.

**Product page:** gallery with thumbnails, arrows, swipe and keyboard support; colour/size
selectors that disable sold-out combinations; live stock status; quantity selector bounded by
stock and per-line limit; add to cart with feedback; wishlist; description, specifications,
shipping and returns; related and recently viewed products; share (copy link / Facebook);
graceful fallback for missing images.

**Cart & checkout:** guest cart in localStorage, signed-in cart synced to the server and merged
at sign-in; quantity, variant change and removal; all totals (subtotal, coupon, shipping with
free-shipping threshold, VAT inclusive or exclusive) computed by the **server** on every change.
Checkout has contact, address (with saved addresses), delivery method, payment method, terms,
per-field validation with focus management, idempotency key against double submission and
clear messages when stock or prices changed.

**Orders & inventory:** price/description snapshots per order line; stock decremented inside a
write transaction with a guarded `UPDATE … WHERE stock >= ?` (no oversell); card orders reserve
stock for 30 minutes and are cancelled automatically (stock released) if unpaid; controlled status
transitions (pending → confirmed → processing → shipped → delivered → refunded; cancel until
shipped); stock returned exactly once on cancellation; order timeline/audit events; customer
cancellation requests reviewed by admins.

**Admin (`/admin`):** dashboard (orders, verified revenue vs demo payments, ordered value,
products, low-stock list, 14-day sales chart with data table, recent orders); products (create,
edit, archive/delete, images upload with alt text, variants matrix generator, prices, sale prices,
stock, featured); categories (hierarchy); brands; orders (search, filter by status/payment/
cancellation requests, detail with permitted actions only, manual payment records, refunds
records); customers (orders, spend, enable/disable); coupons; blog (draft/published, SEO title,
meta description, sample flag); FAQs (EN/MN); contact messages; store settings (name, logo,
currency, contact, social links, shipping methods and threshold, tax, homepage promo, announcement).

## Security model

- **Server-side authority.** Prices, discounts, shipping, tax and stock are recomputed from the
  database for every quote and order; client-sent amounts are ignored (tested).
- **Authorization.** Every `/api/admin/*` handler is wrapped in `requireAdmin` (401 anonymous,
  403 customers — tested for each sampled endpoint). Customer data queries are scoped by
  `user_id` in SQL. Guest order pages require a random per-order token (stored hashed).
- **Passwords.** scrypt (N=16384, r=8, p=1) with per-user salt; minimum 10 characters with letters
  and digits; constant-time comparison; dummy hash for unknown emails.
- **Sessions.** 256-bit random tokens, stored as SHA-256 hashes, HttpOnly + SameSite=Lax cookies
  (`COOKIE_SECURE=true` adds Secure). Password reset or change revokes other sessions; disabling a
  customer revokes theirs.
- **CSRF.** State-changing API calls must carry `X-Solvia-Request: 1`, which cross-site forms can't
  send without a CORS preflight the server never grants. Webhooks are exempt and signature-verified.
- **Headers.** Content-Security-Policy, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  Referrer-Policy, Permissions-Policy.
- **Uploads.** JPEG/PNG/WebP only, checked by MIME type **and** file signature, 5 MB limit,
  re-encoded to WebP with metadata stripped (when `sharp` is installed); SVG refused.
- **Rate limiting.** In-memory per-IP/per-email limits on login, registration, password reset,
  checkout, contact and newsletter (single-process; use a shared store when scaling out).
- **Admin bootstrap.** `npm run create-admin` only; no seeded admin, no default password.
- **Secrets.** Only in `.env` (git-ignored), only read in `server/env.ts`, never sent to the client.

This has **not** had an independent security review; do that before launch.

## Payments

`server/services/payments/` defines a `PaymentProvider` interface. Two providers exist:

- **Demo (default).** The shopper is sent to `/checkout/demo-payment/:number`, a page that states
  it is a simulation, collects no card data and lets you simulate success or decline. Orders paid
  this way are flagged `is_demo` and every customer and admin view says "DEMO — no money was
  charged". The dashboard reports demo payments separately from verified revenue. Demo
  confirmation is refused when live payments are configured, and in production unless
  `ALLOW_DEMO_PAYMENTS=true`.
- **Stripe Checkout.** Activated only when `PAYMENT_PROVIDER=stripe` **and** both
  `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set. Orders are marked paid **only** by a
  signature-verified `checkout.session.completed` webhook whose amount matches the order total;
  events are de-duplicated by event id. Not exercised against Stripe in this build (no
  credentials) — see [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for setup and the currency
  check you must do (Stripe availability depends on your business country and currency).

Cash on delivery and bank transfer are recorded as unpaid/pending until an admin records the
payment. Admins can never mark a card payment as paid by hand.

## Multilingual support

- Interface strings live in `client/i18n/en.ts` and `client/i18n/mn.ts` (same 394 keys; the type
  system enforces completeness). Language selector in the header (choice persists in the browser,
  `<html lang>` updates); signed-in customers can also save a preferred language in account settings.
- Dates and numbers are formatted with `Intl` for the active locale. **Currency is a separate store
  setting** (default MNT) and does not change with language.
- Product names, category names and FAQs have Mongolian fields; product descriptions, blog
  articles, legal pages and admin-entered text (announcement bar, store description, promo) are
  English-only in this build.
- **The Mongolian text is a draft translation and has not been professionally reviewed** — the
  footer says so in Mongolian mode. Have a native speaker review it before launch.
- The admin dashboard is English-only.

## SEO and analytics

- Server-rendered `<title>`, meta description, canonical URL, robots, Open Graph and Twitter tags
  for every route (crawlers see them without running JavaScript), kept in sync on client navigation.
- JSON-LD: `Organization` + `WebSite` (search action) on the home page, `Product` with per-variant
  `Offer` (price, currency, availability) and `BreadcrumbList` on products, `BreadcrumbList` on
  categories, `Article` on posts.
- `/sitemap.xml` (home, static pages, categories, active products, published posts with lastmod) and
  `/robots.txt` (private areas disallowed). Private pages are `noindex`. Unknown products and
  categories return HTTP 404.
- Analytics: `client/lib/analytics.ts` emits `view_item`, `add_to_cart`, `view_cart`,
  `begin_checkout`, and `purchase` (only once an order is actually paid — never for unpaid orders or simulated demo payments). Events carry ids and
  prices only. GA4 loads only when `GA_MEASUREMENT_ID` is set — **analytics is not configured or
  verified in this build**. Search Console verification is a single env variable. See
  [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Changing the brand

1. Edit `config/brand.ts` (name, tagline, description, default currency, contact, social links,
   shipping, tax). These seed the store settings on first run.
2. After first run, change the same things in **Admin → Settings** (stored in the database).
3. Replace colours in the `:root` tokens at the top of `client/styles/styles.css`.
4. Replace `public/favicon.svg`, `public/apple-touch-icon.png`, `public/images/og-default.jpg`.

## Known limitations

- **Not production-ready**: live payments, transactional email, HTTPS deployment, backups,
  monitoring and an external security review are required first.
- **No email delivery** (order confirmations, password-reset links). In development the reset link
  is printed to the server log; integrate an email provider before launch.
- **Stripe integration is untested against Stripe** (no credentials were available).
- **SQLite** suits a single server. For multiple app instances, move to PostgreSQL (the SQL is
  standard and money is stored as integers) and move rate limiting and sessions to a shared store.
- **Demo imagery** is generated illustration, not product photography.
- **Mongolian translation is a draft**; long-form content is English-only (see above).
- **Social**: footer links and product share links only. No social login, publishing or platform
  APIs are integrated.
- **Reviews**: no review system; the homepage says reviews will appear once verified customers
  leave them rather than showing invented testimonials.
- Rate limiting and the reservation-expiry timer run in-process.

---

Testing report: [docs/TESTING.md](docs/TESTING.md) · External services: [docs/CONFIGURATION.md](docs/CONFIGURATION.md) · Case study: [PORTFOLIO.md](PORTFOLIO.md)
