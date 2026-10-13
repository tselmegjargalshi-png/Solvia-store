import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../env.ts';
import { getSettings } from '../settings.ts';
import type { PaymentProvider } from './index.ts';

/**
 * Stripe Checkout integration using the REST API directly (no SDK dependency).
 *
 * NOT TESTED AGAINST LIVE STRIPE in this build — no credentials were available.
 * Before going live: confirm Stripe supports your business country and the store
 * currency, verify the currency's decimal handling below, and test in Stripe test mode.
 */

// Stripe "zero-decimal" currencies (amounts are sent as whole units). Check Stripe's docs for the current list.
const STRIPE_ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

export function toStripeAmount(amount: number, currency: string, storeDecimals: number) {
  const stripeDecimals = STRIPE_ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
  return Math.round(amount * 10 ** (stripeDecimals - storeDecimals));
}
export function fromStripeAmount(amount: number, currency: string, storeDecimals: number) {
  const stripeDecimals = STRIPE_ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
  return Math.round(amount / 10 ** (stripeDecimals - storeDecimals));
}

export const stripeProvider: PaymentProvider = {
  name: 'stripe',
  isDemo: false,
  async createCheckout(order, accessToken) {
    const { currency } = getSettings();
    const confirmUrl = `${env.publicUrl}/order/${encodeURIComponent(order.number)}?token=${encodeURIComponent(accessToken)}`;
    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', confirmUrl + '&payment=return');
    form.set('cancel_url', confirmUrl + '&payment=cancelled');
    form.set('customer_email', order.email);
    form.set('client_reference_id', String(order.id));
    form.set('metadata[order_id]', String(order.id));
    form.set('metadata[order_number]', order.number);
    // One line for the server-computed total so Stripe charges exactly what the order says.
    form.set('line_items[0][quantity]', '1');
    form.set('line_items[0][price_data][currency]', currency.code.toLowerCase());
    form.set('line_items[0][price_data][unit_amount]', String(toStripeAmount(order.total, currency.code, currency.decimals)));
    form.set('line_items[0][price_data][product_data][name]', `Order ${order.number}`);
    form.set('expires_at', String(Math.floor(Date.now() / 1000) + 31 * 60));

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `order-${order.id}-checkout`,
      },
      body: form,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(`Stripe checkout session failed: ${data?.error?.message ?? res.status}`);
    return { providerRef: data.id, redirectUrl: data.url };
  },
};

/**
 * Verify a Stripe-Signature header (scheme v1: HMAC-SHA256 over "timestamp.payload").
 * Returns the parsed event or throws.
 */
export function verifyStripeSignature(rawBody: Buffer, header: string | undefined, secret: string, toleranceSec = 300) {
  if (!header || !secret) throw new Error('Missing signature or secret');
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const sigs = header
    .split(',')
    .filter((kv) => kv.trim().startsWith('v1='))
    .map((kv) => kv.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) throw new Error('Malformed signature header');
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) throw new Error('Signature timestamp outside tolerance');
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody.toString('utf8')}`).digest();
  const ok = sigs.some((s) => {
    const b = Buffer.from(s, 'hex');
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
  if (!ok) throw new Error('Signature mismatch');
  return JSON.parse(rawBody.toString('utf8'));
}
