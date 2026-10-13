# Testing report

Environment: Linux container, Node.js 22.22.0, Chromium (Playwright 1.56), run on 12 October 2026.
All results below come from commands that were actually executed in that environment. Nothing
was tested against real payment providers, email services, Google services or a deployed host.

## How to reproduce

```bash
npm run typecheck     # TypeScript, client + server
npm run build         # production bundle + size report
npm test              # API integration + unit tests (temporary SQLite database per run)
npm run test:e2e      # browser tests; needs `npm run build` first
```

## Summary

| Suite | Result |
|---|---|
| TypeScript (client + server) | ✅ no errors |
| Production build | ✅ succeeds (36 files) |
| API integration + unit tests (`npm test`) | ✅ **55 / 55 passed** |
| Browser end-to-end checks (`npm run test:e2e`) | ✅ **30 / 30 passed** |
| `create-admin` script (manual run) | ✅ weak password rejected; admin created with scrypt hash |

## Passed — API integration tests (`tests/api.test.ts`)

Run against the real HTTP server and a fresh seeded database; nothing mocked.

**Catalog** — health/settings expose no secrets · pagination without overlap · search ·
category filter includes child categories · price, brand, colour, size and availability filters
verified against returned data · sorting (price ↑/↓, name, newest) verified · product detail,
related products, 404 for unknown slugs.

**Server-side pricing** — client-supplied prices ignored · VAT-inclusive tax and express shipping
computed · zero, negative, fractional and non-numeric quantities rejected · quantities clamped to
stock, sold-out and unknown variants flagged · coupon minimum subtotal and discount · free
standard shipping over the threshold.

**Checkout & orders** — empty cart rejected and no order created · per-field validation errors ·
CSRF header required · cash-on-delivery order: totals equal the server quote, stock decremented,
payment `unpaid` · duplicate submission (same idempotency key) returns the first order with no
second stock decrement · order price snapshot unchanged after a catalog price change · oversell
rejected (409) and stock untouched · guest order invisible without its token · card order in demo
mode stays `pending` until confirmed (payment status never fabricated) · admin cannot hand-mark a
card order paid or confirm it unpaid · demo confirmation requires the order token, marks
paid + confirmed, is labelled demo, and is not processed twice · Stripe webhook route disabled
when Stripe isn't configured · expired reservations cancel the order, release stock and refuse
late payment · controlled status transitions, stock returned exactly once on cancel · refund
requires a recorded payment refund first.

**Accounts** — password policy; only scrypt hashes stored · duplicate email (case-insensitive)
rejected · wrong password rejected; logout ends the session · account routes return 401 when
signed out · a customer cannot view, list or cancel another customer's order · addresses scoped to
their owner · wishlist and server cart per user (invalid lines dropped) · password reset gives an
identical response for unknown emails, tokens are single-use, reset revokes old sessions.

**Admin** — 7 sampled admin endpoints return 401 anonymous / 403 for customers · customers cannot
self-promote · dashboard totals match the database · create product (sale price above price
rejected), edit sale price/stock/featured, delete · products with orders are archived instead of
deleted and disappear from the storefront and cart · child category creation · order search and
filters (status, cancellation requests) · settings update reflected publicly · blog drafts hidden
publicly and from the sitemap · uploads: SVG, fake PNG and >5 MB files rejected, real PNG accepted
· disabling a customer ends their sessions and blocks login.

**SEO & headers** — robots.txt and sitemap.xml contents · product HTML includes unique title,
canonical, Open Graph image, `Product` and `BreadcrumbList` JSON-LD · unknown product returns 404 ·
cart is `noindex` · CSP and `nosniff` headers present.

**Stripe signature verification** — valid v1 signature accepted; tampered payload, wrong secret
and stale timestamp rejected (real HMAC, no network).

## Passed — unit tests (`tests/unit.test.ts`)

Password hashing round-trip and salting · password policy · slugify · validator field errors ·
variant vs product pricing and sale rules · Stripe minor-unit conversion (MNT, USD, JPY) · terminal
order states have no transitions.

## Passed — browser end-to-end checks (`tests/e2e.mjs`)

1. Homepage renders hero and all sections with no console errors.
2. Every internal link on the homepage (header, footer, content) returns a non-error response; no `#` placeholders.
3. Header search → results page with matching products; empty-results state.
4. Shop filters on real data: price range, brand, clear-all, in-stock; category page.
5. Sorting by price ascending/descending and name re-orders the grid correctly.
6. Pagination shows different products on page 2.
7. Product page: thumbnails, colour/size selection, sold-out size disabled, stock status, description/specs, related products.
8. Quantity selector: cannot exceed stock (2) or drop below 1; typed values clamped.
9. Sold-out product: add-to-cart disabled, "Out of stock" shown.
10. Cart: add two products, header count updates, quantity change and removal recalculate the server subtotal.
11. Guest cart persists across reload.
12. Tampering with prices in localStorage does not change totals.
13. Checkout validation: errors shown, focus moves to the first invalid field.
14. Demo card payment: total includes express shipping; DEMO notice shown; demo page collects no card data; order is `pending` until confirmation; confirmation page shows the DEMO banner; cart cleared; no `purchase` analytics event for a simulated payment.
15. Checkout with an empty cart shows an empty state, not a form.
16. Order page opened in a different browser without the token shows "not found".
17. Register (weak password rejected) → account page → cash-on-delivery order with prefilled email → appears in order history → sign out → account pages redirect to login.
18. Wishlist from a product page shows on `/wishlist`.
19. Forgot password shows a neutral message.
20. Admin refused for anonymous (401) and customer (403) users, in API and UI.
21. Admin dashboard figures match the database; recent orders listed.
22. Admin creates a product via the form; it appears on the storefront with the saved price and stock; then removed.
23. Admin order list search narrows results; detail page offers only valid next statuses; confirming records a timeline event.
24. Admin customers, content, settings and categories pages render without errors.
25. Language switch to Mongolian translates navigation, sets `<html lang="mn">`, persists across reload; prices unchanged (currency independent of language).
26. Mobile menu opens, closes with Escape, and navigates.
27. **No horizontal overflow** on 12 key pages (home, shop, product, cart, checkout, blog, about, FAQ, contact, login, account, admin) at **320, 360, 390, 768, 1024 and 1440 px**.
28. Mobile filter drawer applies a filter.
29. Accessibility basics on 9 pages: exactly one `<h1>`, every input labelled, every image has `alt`, skip link present and first in tab order.
30. Analytics events `view_item`, `add_to_cart`, `view_cart`, `begin_checkout` recorded locally; no `purchase` before an order; no requests to Google when GA is not configured.

Screenshots from the run are written to `tests/.e2e-output/`.

## Bugs found by testing and fixed

| Found by | Problem | Fix |
|---|---|---|
| API test | The demo payment page could still "pay" an order whose reservation had expired and been cancelled (stock already released). | Demo confirmation now requires an order that is still `pending` and unpaid; expiry also cancels pending payment records. |
| API test | Uploads over 5 MB dropped the connection instead of returning an error. | Body reader rejects by `Content-Length` and drains the rest; the server answers 413 with `Connection: close`. |
| E2E (320/390 px) | Cart lines overflowed the screen by 10 px (line total squeezed into a 36 px column). | Mobile cart grid column now sizes to content. |
| E2E (a11y) | Checkout with an empty cart had no `<h1>`. | Heading added. |
| Visual review | Stray list bullets beside every desktop navigation item. | List reset applied to navigation lists. |
| Visual review | Order confirmation said "Payment confirmed" for simulated demo payments. | Demo payments now show a dedicated "simulated, no money charged" message. |
| Code review | `purchase` analytics fired for simulated demo payments (would add fake revenue to GA once configured). | `purchase` only fires for real paid orders. |
| Performance measurement | Cumulative Layout Shift 0.68–1.0 (footer flashed into view while a route loaded). | Main area reserves viewport height; CLS now 0.02–0.07. |
| Visual review | Promo banner requested a 480 px image that doesn't exist (404 on mobile). | Promo `srcset` uses the generated sizes only. |

## Failed

None in the final run.

## Performance (measured)

Production build sizes (from `npm run build`): initial JavaScript **60.7 kB gzip**, CSS **11.7 kB
gzip**; each page and the whole admin are separate lazy-loaded chunks (largest other chunk 19.8 kB
gzip).

Page-load measurements with Chromium against the local server, with simulated throttling
(40 ms latency, 10 Mbps down, 4× CPU slowdown). These are local lab numbers, not field data and not
Lighthouse scores:

| Page | FCP | LCP | CLS | Requests | Transferred |
|---|---|---|---|---|---|
| Home, desktop 1440 px | 712 ms | 1092 ms | 0.024 | 43 | 594 kB |
| Home, mobile 390 px | 784 ms | 1160 ms | 0.044 | 31 | 537 kB |
| Product, mobile 390 px | 664 ms | 1172 ms | 0.070 | 29 | 402 kB |
| Shop, desktop 1440 px | 716 ms | 1340 ms | 0.060 | 49 | 484 kB |

Images are WebP in 480/800/1200 px variants with `srcset`/`sizes`, lazy-loaded below the fold, with
explicit dimensions. Text responses are gzip-compressed; hashed assets are cached for a year.

## Not run

- Lighthouse / PageSpeed Insights (not available in the environment).
- Automated accessibility audit with axe or a screen reader; only the basic checks above were automated.
- Real devices and browsers other than Chromium (Safari/iOS and Firefox untested).
- Load and concurrency testing beyond SQLite's transactional guarantees.
- An independent security review or penetration test.
- Review of the Mongolian translation by a native speaker.

## Features needing credentials (untested)

- **Stripe Checkout** live/test payments and webhooks — needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Only the signature verification and amount conversion were tested locally.

## Features needing external configuration (untested)

- Google Analytics 4 (`GA_MEASUREMENT_ID`) — event hooks verified locally; no data has been sent to or verified in GA.
- Google Search Console (`GOOGLE_SITE_VERIFICATION`) — tag output exists; no property has been verified.
- Transactional email (order confirmations, password-reset delivery) — not implemented; see CONFIGURATION.md.
- HTTPS hosting, `COOKIE_SECURE=true`, backups and monitoring.
