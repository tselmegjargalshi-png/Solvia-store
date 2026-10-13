# External services and deployment configuration

Everything here is configured through environment variables in `.env` (copy from `.env.example`).
Secrets are read only by `server/env.ts` and are never sent to the browser.

## 1. Administrator account

There is no default administrator. On the server, run once:

```bash
npm run create-admin -- --email owner@yourstore.com --name "Store Owner"
```

You are prompted for a password (hidden input, minimum 10 characters with letters and digits).
For automated provisioning you can pass `ADMIN_PASSWORD` in the environment for that one command,
then remove it. Running the command again for the same email resets the password and signs out
existing sessions.

## 2. Payments — Stripe Checkout

The Stripe provider (`server/services/payments/stripe.ts`) creates a Checkout Session for the
server-computed order total and marks the order paid **only** from a signature-verified webhook.
It has **not** been exercised against Stripe in this build.

Before enabling:

1. **Check eligibility.** Confirm Stripe supports your business's country and your store currency.
   Do not assume availability. If Stripe isn't available to you, implement another provider behind
   the same `PaymentProvider` interface (`server/services/payments/index.ts`): `createCheckout()`
   returns a redirect URL, and a verified server-side callback calls `markOrderPaid()`.
2. **Check currency decimals.** Amounts are stored in the store currency's minor unit
   (MNT with 0 decimals by default). `toStripeAmount()` converts to Stripe's expected unit; verify
   the result in test mode for your currency.
3. **Create keys** in the Stripe Dashboard (start in test mode).
4. **Add a webhook endpoint** pointing at `https://YOUR_DOMAIN/api/payments/stripe/webhook` with
   events `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`. Copy its signing secret.
5. Set:
   ```
   PAYMENT_PROVIDER=stripe
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   PUBLIC_URL=https://YOUR_DOMAIN
   ```
   Stripe activates only when all three are present; otherwise the demo provider stays active.
6. **Test end-to-end in test mode**: successful card, declined card, abandoned checkout (order
   should auto-cancel after 30 minutes and release stock), and webhook replay (should be ignored).
7. Switch to live keys only after the above passes. Demo payments are automatically refused once
   Stripe is configured.

Card data never touches this server — Stripe's hosted page collects it.

## 3. Email (required before launch — not implemented)

The app does not send email yet. You need it for password-reset links and order confirmations.

- Integration points: `server/routes/account.ts` (`/api/auth/forgot-password` — currently logs the
  link in development) and `server/services/orders.ts` (`createOrder`, `markOrderPaid`,
  `changeOrderStatus`) for order notifications.
- Use a transactional provider (e.g. Postmark, SendGrid, Amazon SES, Mailgun) with keys in `.env`.
- Set `LOG_RESET_LINKS=false` in production (links are never logged when `NODE_ENV=production`).

## 4. Google Analytics 4

1. Create a GA4 property and a Web data stream for your domain; copy the Measurement ID (`G-…`).
2. Set `GA_MEASUREMENT_ID=G-XXXXXXXXXX` and restart. The server adds Google's domains to the
   Content-Security-Policy and the client loads gtag.js (IP anonymisation on).
3. Events sent: `view_item`, `add_to_cart`, `view_cart`, `begin_checkout`, `purchase`
   (only for orders with a real recorded payment; never for demo payments). Payloads contain
   product ids/SKUs, prices, quantities and currency — no names, emails or addresses.
4. Verify in GA4 → Reports → Realtime and DebugView. Nothing is collected until you do this.
5. Add a cookie/consent banner if your jurisdiction requires consent before analytics.

## 5. Google Search Console

1. Add a URL-prefix property for `https://YOUR_DOMAIN` and choose the **HTML tag** method.
2. Copy only the `content` value into `GOOGLE_SITE_VERIFICATION=...` and restart; the meta tag is
   rendered on every page. Click Verify in Search Console.
3. Submit `https://YOUR_DOMAIN/sitemap.xml`.
4. Make sure `PUBLIC_URL` is your real HTTPS origin — canonical URLs, sitemap and Open Graph tags use it.

## 6. Social links and sharing

Edit in **Admin → Settings → Social** (Facebook, Instagram, TikTok, YouTube, Pinterest, X). Empty
values are hidden from the footer. Product pages offer "copy link" and a Facebook share link; Open
Graph tags use the first product image. No social login or platform API is integrated.

## 7. Deployment checklist

- Node.js ≥ 22.18. `npm ci && npm run build`, then `NODE_ENV=production npm start` behind a
  reverse proxy (nginx, Caddy) that terminates **HTTPS**.
- `.env`: `NODE_ENV=production`, `PUBLIC_URL=https://…`, `COOKIE_SECURE=true`, `HOST=127.0.0.1`
  (proxy in front), real `DATABASE_PATH` on persistent storage.
- **Backups:** the database is one SQLite file in WAL mode. Back it up with
  `sqlite3 data/solvia.db ".backup 'backup.db'"` (or a filesystem snapshot) on a schedule, plus
  `public/uploads/`.
- The server must be able to reach the payment provider's API (outbound HTTPS).
- If you run more than one app instance: move to PostgreSQL, and move rate limiting and the
  reservation-expiry job to shared infrastructure.
- Commission a security review before taking real payments.
- Replace the demo catalog, imagery, articles, legal pages and contact details with your own; have
  the legal pages reviewed for your jurisdiction.
