import { randomInt } from 'node:crypto';
import { RESERVATION_MINUTES } from '../../config/brand.ts';
import { all, get, now, run, tx, type Row } from '../db/index.ts';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.ts';
import { randomToken, sha256 } from '../lib/security.ts';
import { quote, type CartInput } from './pricing.ts';
import { getSettings } from './settings.ts';

export const ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'] as const;
export const PAYMENT_STATUSES = ['unpaid', 'pending', 'paid', 'failed', 'refunded'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_METHODS = ['card', 'bank_transfer', 'cod'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Allowed fulfilment transitions. Anything not listed is rejected. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

/**
 * Payment transitions an ADMIN may record by hand (cash collected, bank transfer received,
 * manual refund). Card payments can only become "paid" through verified provider confirmation.
 */
export const MANUAL_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  unpaid: ['paid'],
  pending: ['paid', 'failed'],
  paid: ['refunded'],
  failed: [],
  refunded: [],
};

export type CheckoutInput = {
  items: CartInput;
  email: string;
  fullName: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  postalCode: string;
  deliveryNotes: string;
  shippingMethod: string;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  locale: string;
};

function orderNumber() {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `SV-${ymd}-${String(randomInt(0, 1e6)).padStart(6, '0')}`;
}

export function addEvent(orderId: number, type: string, message: string, actor = 'system') {
  run('INSERT INTO order_events (order_id, type, message, actor, created_at) VALUES (?, ?, ?, ?, ?)', orderId, type, message, actor, now());
}

/**
 * Create an order. Everything that affects money or stock is recomputed here, inside one
 * write transaction: prices come from the database, stock is decremented with a guarded
 * UPDATE, and the idempotency key makes a double-submit return the first order instead of a second.
 */
export function createOrder(input: CheckoutInput, userId: number | null, idempotencyKey: string | null) {
  if (idempotencyKey) {
    const existing = get<Row>('SELECT id, number, user_id FROM orders WHERE idempotency_key = ?', idempotencyKey);
    if (existing) {
      if ((existing.user_id ?? null) !== userId) throw conflict('This checkout was already submitted.');
      return { order: existing, accessToken: null as string | null, duplicate: true };
    }
  }
  if (!Array.isArray(input.items) || input.items.length === 0) throw badRequest('Your cart is empty.', { code: 'empty_cart' });

  const settings = getSettings();
  if (!settings.shipping.methods.some((m) => m.code === input.shippingMethod)) {
    throw badRequest('Please correct the highlighted fields.', { fields: { shippingMethod: 'Choose a delivery method.' } });
  }

  return tx(() => {
    const q = quote(input.items, { couponCode: input.couponCode, shippingMethod: input.shippingMethod });
    if (q.lines.length === 0) throw badRequest('Your cart is empty or none of its items are available.', { code: 'empty_cart', issues: q.issues });
    const blocking = q.issues.filter((i) => i.type !== 'invalid_quantity');
    if (blocking.length) {
      throw conflict('Some items in your cart changed. Please review your cart before placing the order.', { code: 'cart_changed', issues: q.issues });
    }
    if (input.couponCode && q.couponError) {
      throw badRequest('Please correct the highlighted fields.', { fields: { couponCode: q.couponError } });
    }

    for (const l of q.lines) {
      const r = run('UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?', l.quantity, l.variantId, l.quantity);
      if (Number(r.changes) !== 1) throw conflict('An item just went out of stock. Please review your cart.', { code: 'cart_changed' });
    }
    if (q.coupon) run('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?', q.coupon.code);

    const accessToken = randomToken(24);
    const t = now();
    const isCard = input.paymentMethod === 'card';
    const paymentStatus: PaymentStatus = input.paymentMethod === 'cod' ? 'unpaid' : 'pending';
    const reservedUntil = isCard ? new Date(Date.now() + RESERVATION_MINUTES * 60_000).toISOString() : null;

    let number = orderNumber();
    while (get('SELECT 1 FROM orders WHERE number = ?', number)) number = orderNumber();

    const res = run(
      `INSERT INTO orders (number, access_token_hash, idempotency_key, user_id, email, full_name, phone, country, city, address, postal_code,
        delivery_notes, shipping_method, payment_method, currency, subtotal, discount, coupon_code, shipping_fee, tax, tax_inclusive, total,
        status, payment_status, reserved_until, locale, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      number,
      sha256(accessToken),
      idempotencyKey,
      userId,
      input.email,
      input.fullName,
      input.phone,
      input.country,
      input.city,
      input.address,
      input.postalCode,
      input.deliveryNotes,
      q.shippingMethod,
      input.paymentMethod,
      q.currency,
      q.subtotal,
      q.discount,
      q.coupon?.code ?? null,
      q.shippingFee,
      q.tax,
      q.taxInclusive ? 1 : 0,
      q.total,
      'pending',
      paymentStatus,
      reservedUntil,
      input.locale === 'mn' ? 'mn' : 'en',
      t,
      t,
    );
    const orderId = Number(res.lastInsertRowid);
    for (const l of q.lines) {
      run(
        `INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_label, sku, image, unit_price, quantity, line_total)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        orderId,
        l.productId,
        l.variantId,
        l.name,
        l.variantLabel,
        l.sku,
        l.image,
        l.unitPrice,
        l.quantity,
        l.lineTotal,
      );
    }
    addEvent(orderId, 'created', `Order placed (${input.paymentMethod}). Stock reserved.`, userId ? `customer:${userId}` : 'guest');
    if (userId) run('DELETE FROM cart_items WHERE user_id = ?', userId);
    return { order: { id: orderId, number }, accessToken, duplicate: false };
  });
}

/** Return stock for an order exactly once. Must run inside a transaction. */
function releaseStock(orderId: number) {
  const o = get<Row>('SELECT stock_released FROM orders WHERE id = ?', orderId);
  if (!o || o.stock_released) return;
  for (const it of all<Row>('SELECT variant_id, quantity FROM order_items WHERE order_id = ?', orderId)) {
    if (it.variant_id) run('UPDATE product_variants SET stock = stock + ? WHERE id = ?', it.quantity, it.variant_id);
  }
  run('UPDATE orders SET stock_released = 1 WHERE id = ?', orderId);
}

export function changeOrderStatus(orderId: number, to: OrderStatus, actor: string, note = '') {
  return tx(() => {
    const o = get<Row>('SELECT * FROM orders WHERE id = ?', orderId);
    if (!o) throw notFound('Order not found.');
    const allowed = ORDER_TRANSITIONS[o.status as OrderStatus] ?? [];
    if (!allowed.includes(to)) throw badRequest(`An order cannot move from "${o.status}" to "${to}".`);
    if (to === 'confirmed' && o.payment_method === 'card' && o.payment_status !== 'paid') {
      throw badRequest('Card orders are confirmed automatically once the payment provider confirms payment.');
    }
    if (to === 'refunded' && o.payment_status !== 'refunded') {
      throw badRequest('Record the refund on the payment first, then mark the order as refunded.');
    }
    if (to === 'cancelled') releaseStock(orderId);
    run('UPDATE orders SET status = ?, reserved_until = NULL, cancel_requested = CASE WHEN ? = \'cancelled\' THEN 0 ELSE cancel_requested END, updated_at = ? WHERE id = ?', to, to, now(), orderId);
    addEvent(orderId, 'status', `Status changed: ${o.status} → ${to}${note ? ` — ${note}` : ''}`, actor);
    return get<Row>('SELECT * FROM orders WHERE id = ?', orderId)!;
  });
}

export function changePaymentStatusManually(orderId: number, to: PaymentStatus, actor: string, note = '') {
  return tx(() => {
    const o = get<Row>('SELECT * FROM orders WHERE id = ?', orderId);
    if (!o) throw notFound('Order not found.');
    const allowed = MANUAL_PAYMENT_TRANSITIONS[o.payment_status as PaymentStatus] ?? [];
    if (!allowed.includes(to)) throw badRequest(`Payment cannot move from "${o.payment_status}" to "${to}".`);
    if (to === 'paid' && o.payment_method === 'card') {
      throw badRequest('Card payments can only be marked paid by a verified provider confirmation.');
    }
    const t = now();
    if (to === 'paid') {
      run(
        `INSERT INTO payments (order_id, provider, amount, currency, status, is_demo, note, created_at, updated_at) VALUES (?, 'manual', ?, ?, 'paid', 0, ?, ?, ?)`,
        orderId,
        o.total,
        o.currency,
        note || `Recorded by ${actor}`,
        t,
        t,
      );
    } else {
      run('UPDATE payments SET status = ?, note = ?, updated_at = ? WHERE order_id = ? AND status IN (\'paid\',\'pending\')', to === 'refunded' ? 'refunded' : 'failed', note, t, orderId);
    }
    run('UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?', to, t, orderId);
    const msg = to === 'refunded' ? 'Refund recorded (manual record — process the actual refund with your payment provider/bank).' : `Payment status: ${o.payment_status} → ${to}`;
    addEvent(orderId, 'payment', msg + (note ? ` — ${note}` : ''), actor);
    return get<Row>('SELECT * FROM orders WHERE id = ?', orderId)!;
  });
}

/**
 * Called ONLY from verified payment confirmations (signed webhook, or the demo provider in demo mode).
 * Idempotent: the same provider event id is processed once.
 */
export function markOrderPaid(opts: { orderId: number; provider: string; providerRef: string; eventId: string; amount: number; isDemo: boolean }) {
  return tx(() => {
    if (get('SELECT 1 FROM payments WHERE raw_event_id = ?', opts.eventId)) return { duplicate: true };
    const o = get<Row>('SELECT * FROM orders WHERE id = ?', opts.orderId);
    if (!o) throw notFound('Order not found.');
    if (o.payment_status === 'paid') return { duplicate: true };
    if (opts.amount !== o.total) {
      addEvent(o.id, 'payment', `Payment amount mismatch (received ${opts.amount}, expected ${o.total}). Not marked paid.`, opts.provider);
      throw badRequest('Amount mismatch.');
    }
    const t = now();
    const existing = get<Row>('SELECT id FROM payments WHERE order_id = ? AND provider = ? AND provider_ref = ?', o.id, opts.provider, opts.providerRef);
    if (existing) {
      run('UPDATE payments SET status = \'paid\', raw_event_id = ?, is_demo = ?, updated_at = ? WHERE id = ?', opts.eventId, opts.isDemo ? 1 : 0, t, existing.id);
    } else {
      run(
        `INSERT INTO payments (order_id, provider, provider_ref, amount, currency, status, is_demo, raw_event_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?)`,
        o.id,
        opts.provider,
        opts.providerRef,
        opts.amount,
        o.currency,
        opts.isDemo ? 1 : 0,
        opts.eventId,
        t,
        t,
      );
    }
    run('UPDATE orders SET payment_status = \'paid\', reserved_until = NULL, updated_at = ? WHERE id = ?', t, o.id);
    if (o.status === 'pending') {
      run('UPDATE orders SET status = \'confirmed\' WHERE id = ?', o.id);
      addEvent(o.id, 'payment', opts.isDemo ? 'DEMO payment simulated — no money was charged. Order confirmed.' : `Payment verified by ${opts.provider}. Order confirmed.`, opts.provider);
    } else {
      addEvent(o.id, 'payment', `Payment verified by ${opts.provider} while order was "${o.status}". Review required (refund or reinstate).`, opts.provider);
    }
    return { duplicate: false };
  });
}

export function markPaymentFailed(orderId: number, provider: string, reason: string) {
  tx(() => {
    const o = get<Row>('SELECT payment_status FROM orders WHERE id = ?', orderId);
    if (!o || o.payment_status !== 'pending') return;
    run('UPDATE orders SET payment_status = \'failed\', updated_at = ? WHERE id = ?', now(), orderId);
    addEvent(orderId, 'payment', `Payment failed: ${reason}`, provider);
  });
}

/** Cancel unpaid card orders whose reservation window has passed, returning their stock. */
export function expireReservations(): number {
  const due = all<Row>(
    "SELECT id FROM orders WHERE status = 'pending' AND payment_status IN ('pending','failed') AND reserved_until IS NOT NULL AND reserved_until < ?",
    now(),
  );
  for (const o of due) {
    tx(() => {
      const cur = get<Row>('SELECT status, payment_status FROM orders WHERE id = ?', o.id);
      if (!cur || cur.status !== 'pending' || cur.payment_status === 'paid') return;
      releaseStock(o.id);
      run("UPDATE orders SET status = 'cancelled', payment_status = 'failed', reserved_until = NULL, updated_at = ? WHERE id = ?", now(), o.id);
      run("UPDATE payments SET status = 'cancelled', updated_at = ? WHERE order_id = ? AND status = 'pending'", now(), o.id);
      addEvent(o.id, 'status', 'Payment not completed within the reservation window. Order cancelled and stock released.');
    });
  }
  return due.length;
}

export function requestCancellation(orderId: number, userId: number, reason: string) {
  const o = get<Row>('SELECT * FROM orders WHERE id = ?', orderId);
  if (!o) throw notFound('Order not found.');
  if (o.user_id !== userId) throw forbidden();
  if (!['pending', 'confirmed'].includes(o.status)) throw badRequest('This order can no longer be cancelled online. Please contact us.');
  if (o.cancel_requested) throw badRequest('A cancellation request is already open for this order.');
  run('UPDATE orders SET cancel_requested = 1, cancel_reason = ?, updated_at = ? WHERE id = ?', reason.slice(0, 500), now(), orderId);
  addEvent(orderId, 'cancel_request', `Customer requested cancellation${reason ? `: ${reason}` : ''}`, `customer:${userId}`);
}

export function rejectCancellation(orderId: number, actor: string, note: string) {
  const o = get<Row>('SELECT cancel_requested FROM orders WHERE id = ?', orderId);
  if (!o) throw notFound('Order not found.');
  if (!o.cancel_requested) throw badRequest('There is no open cancellation request.');
  run('UPDATE orders SET cancel_requested = 0, updated_at = ? WHERE id = ?', now(), orderId);
  addEvent(orderId, 'cancel_request', `Cancellation request declined${note ? `: ${note}` : ''}`, actor);
}

export function serializeOrder(o: Row, opts: { admin?: boolean } = {}) {
  const items = all<Row>('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', o.id);
  const events = all<Row>('SELECT type, message, actor, created_at FROM order_events WHERE order_id = ? ORDER BY id', o.id);
  const payments = all<Row>('SELECT provider, amount, currency, status, is_demo, note, created_at FROM payments WHERE order_id = ? ORDER BY id', o.id);
  const allowedNext = ORDER_TRANSITIONS[o.status as OrderStatus] ?? [];
  return {
    id: o.id,
    number: o.number,
    email: o.email,
    fullName: o.full_name,
    phone: o.phone,
    shippingAddress: { country: o.country, city: o.city, address: o.address, postalCode: o.postal_code },
    deliveryNotes: o.delivery_notes,
    shippingMethod: o.shipping_method,
    paymentMethod: o.payment_method,
    currency: o.currency,
    subtotal: o.subtotal,
    discount: o.discount,
    couponCode: o.coupon_code,
    shippingFee: o.shipping_fee,
    tax: o.tax,
    taxInclusive: !!o.tax_inclusive,
    total: o.total,
    status: o.status,
    paymentStatus: o.payment_status,
    isDemoPayment: payments.some((p) => p.is_demo),
    reservedUntil: o.reserved_until,
    cancelRequested: !!o.cancel_requested,
    cancelReason: o.cancel_reason,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    items: items.map((i) => ({
      productId: i.product_id,
      variantId: i.variant_id,
      name: i.product_name,
      variantLabel: i.variant_label,
      sku: i.sku,
      image: i.image,
      unitPrice: i.unit_price,
      quantity: i.quantity,
      lineTotal: i.line_total,
    })),
    events: events.map((e) => ({ type: e.type, message: e.message, actor: opts.admin ? e.actor : undefined, createdAt: e.created_at })),
    payments: payments.map((p) => ({ provider: p.provider, amount: p.amount, status: p.status, isDemo: !!p.is_demo, createdAt: p.created_at, note: opts.admin ? p.note : undefined })),
    ...(opts.admin
      ? {
          userId: o.user_id,
          allowedStatuses: allowedNext,
          allowedPaymentStatuses: (MANUAL_PAYMENT_TRANSITIONS[o.payment_status as PaymentStatus] ?? []).filter(
            (s) => !(s === 'paid' && o.payment_method === 'card'),
          ),
        }
      : {}),
  };
}

/** Owner check: the signed-in customer who placed it, or a guest holding the one-time access token. */
export function findOrderForViewer(number: string, userId: number | null, token: string | null) {
  const o = get<Row>('SELECT * FROM orders WHERE number = ?', number);
  if (!o) throw notFound('Order not found.');
  const ownerOk = userId != null && o.user_id === userId;
  const tokenOk = !!token && sha256(token) === o.access_token_hash;
  if (!ownerOk && !tokenOk) throw notFound('Order not found.');
  return o;
}
