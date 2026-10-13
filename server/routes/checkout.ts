import { env } from '../env.ts';
import { get, now, run, type Row } from '../db/index.ts';
import { badRequest, forbidden, HttpError, notFound, type Router } from '../lib/http.ts';
import { rateLimit } from '../lib/security.ts';
import { V } from '../lib/validate.ts';
import { cardProvider, demoPaymentsAllowed } from '../services/payments/index.ts';
import { fromStripeAmount, verifyStripeSignature } from '../services/payments/stripe.ts';
import { createOrder, findOrderForViewer, markOrderPaid, markPaymentFailed, PAYMENT_METHODS, type PaymentMethod } from '../services/orders.ts';
import { getSettings } from '../services/settings.ts';
import { randomToken } from '../lib/security.ts';

async function startCardPayment(order: Row, accessToken: string) {
  const provider = cardProvider();
  const session = await provider.createCheckout(order, accessToken);
  const t = now();
  run(
    `INSERT INTO payments (order_id, provider, provider_ref, amount, currency, status, is_demo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    order.id,
    provider.name,
    session.providerRef,
    order.total,
    order.currency,
    provider.isDemo ? 1 : 0,
    t,
    t,
  );
  return { redirectUrl: session.redirectUrl, provider: provider.name, isDemo: provider.isDemo };
}

export function checkoutRoutes(r: Router) {
  r.post('/api/checkout', async (ctx) => {
    rateLimit(`checkout:${ctx.ip}`, 20, 10 * 60_000);
    const body = await ctx.body();
    const v = new V(body);
    const input = {
      items: Array.isArray(body.items) ? body.items : [],
      email: v.email('email'),
      fullName: v.str('fullName', { required: true, max: 100 }),
      phone: v.phone('phone'),
      country: v.str('country', { required: true, max: 60 }),
      city: v.str('city', { required: true, max: 80 }),
      address: v.str('address', { required: true, min: 5, max: 300 }),
      postalCode: v.str('postalCode', { max: 20, pattern: /^[A-Za-z0-9 -]*$/, msg: 'Enter a valid postal code.' }),
      deliveryNotes: v.str('deliveryNotes', { max: 500 }),
      shippingMethod: v.str('shippingMethod', { required: true, msg: 'Choose a delivery method.' }),
      paymentMethod: v.oneOf('paymentMethod', PAYMENT_METHODS) as PaymentMethod,
      couponCode: v.str('couponCode', { max: 40 }) || undefined,
      locale: body.locale === 'mn' ? 'mn' : 'en',
    };
    if (!v.bool('acceptTerms')) v.fail('acceptTerms', 'You must accept the terms and conditions.');
    if (input.items.length === 0) throw badRequest('Your cart is empty.', { code: 'empty_cart' });
    v.check();

    const idem = typeof body.idempotencyKey === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(body.idempotencyKey) ? body.idempotencyKey : null;
    const { order, accessToken, duplicate } = createOrder(input, ctx.user?.id ?? null, idem);
    const full = get<Row>('SELECT * FROM orders WHERE id = ?', order.id)!;

    if (duplicate) {
      return { number: full.number, duplicate: true, token: null, payment: null };
    }

    let payment: Awaited<ReturnType<typeof startCardPayment>> | null = null;
    if (input.paymentMethod === 'card') {
      try {
        payment = await startCardPayment(full, accessToken!);
      } catch (e) {
        // The order exists (stock reserved) but the provider failed. Say so truthfully.
        console.error('[payment] could not start checkout', e);
        markPaymentFailed(full.id, 'system', 'Could not start the payment session.');
        return { number: full.number, token: accessToken, payment: null, paymentError: 'We could not start the card payment. Your order is saved but unpaid.' };
      }
    }
    return { number: full.number, token: accessToken, payment, duplicate: false };
  });

  /** Retry a card payment for an unpaid order still inside its reservation window. */
  r.post('/api/orders/:number/pay', async (ctx) => {
    const body = await ctx.body();
    const o = findOrderForViewer(ctx.params.number, ctx.user?.id ?? null, body.token ?? null);
    if (o.payment_method !== 'card' || o.status !== 'pending' || !['pending', 'failed'].includes(o.payment_status)) {
      throw badRequest('This order cannot be paid online.');
    }
    if (o.reserved_until && o.reserved_until < now()) throw badRequest('The payment window for this order has expired.');
    if (!body.token) throw badRequest('A payment link token is required.');
    run("UPDATE orders SET payment_status = 'pending' WHERE id = ?", o.id);
    return { payment: await startCardPayment(o, body.token) };
  });

  /**
   * Demo payment confirmation. Refused when live payments are configured.
   * The order is recorded with is_demo=1 and every UI surface labels it as a simulation.
   */
  r.post('/api/payments/demo/confirm', async (ctx) => {
    if (!demoPaymentsAllowed()) throw forbidden('Demo payments are disabled.');
    const body = await ctx.body();
    const o = findOrderForViewer(String(body.number ?? ''), ctx.user?.id ?? null, body.token ?? null);
    if (o.payment_method !== 'card') throw badRequest('This order does not use card payment.');
    // Only a live, unpaid order can be paid. Expired/cancelled orders have already released their stock.
    if (o.status !== 'pending' || !['pending', 'failed'].includes(o.payment_status)) {
      throw badRequest(o.payment_status === 'paid' ? 'This order is already paid.' : 'This order can no longer be paid.');
    }
    const pay = get<Row>("SELECT * FROM payments WHERE order_id = ? AND provider = 'demo' AND status = 'pending' ORDER BY id DESC LIMIT 1", o.id);
    if (!pay) throw badRequest('No pending demo payment for this order.');
    if (body.outcome === 'fail') {
      run("UPDATE payments SET status = 'failed', updated_at = ? WHERE id = ?", now(), pay.id);
      markPaymentFailed(o.id, 'demo', 'Demo payment declined (simulated).');
      return { ok: true, paymentStatus: 'failed' };
    }
    if (o.reserved_until && o.reserved_until < now()) throw badRequest('The payment window for this order has expired.');
    markOrderPaid({ orderId: o.id, provider: 'demo', providerRef: pay.provider_ref, eventId: `demo_evt_${randomToken(12)}`, amount: o.total, isDemo: true });
    return { ok: true, paymentStatus: 'paid', demo: true };
  });

  /** Stripe webhook — the ONLY path that can mark a Stripe card order as paid. */
  r.post('/api/payments/stripe/webhook', async (ctx) => {
    if (env.paymentProvider !== 'stripe' || !env.stripeWebhookSecret) throw notFound();
    const raw = await ctx.rawBody(1024 * 1024);
    let event: any;
    try {
      event = verifyStripeSignature(raw, ctx.req.headers['stripe-signature'] as string, env.stripeWebhookSecret);
    } catch (e) {
      throw new HttpError(400, 'invalid_signature', 'Invalid signature.');
    }
    const s = event?.data?.object ?? {};
    const orderId = Number(s.metadata?.order_id);
    if (!orderId) return { received: true };
    const { currency } = getSettings();
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (s.payment_status === 'paid') {
        markOrderPaid({
          orderId,
          provider: 'stripe',
          providerRef: s.id,
          eventId: event.id,
          amount: fromStripeAmount(Number(s.amount_total), currency.code, currency.decimals),
          isDemo: false,
        });
      }
    } else if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
      markPaymentFailed(orderId, 'stripe', event.type);
    }
    return { received: true };
  });
}
