import { MAX_QTY_PER_LINE } from '../../config/brand.ts';
import { get, type Row } from '../db/index.ts';
import { variantPricing } from './catalog.ts';
import { getSettings } from './settings.ts';

export type CartInput = { variantId: number; quantity: number }[];

export type QuoteLine = {
  variantId: number;
  productId: number;
  slug: string;
  name: string;
  nameMn: string;
  variantLabel: string;
  sku: string;
  image: string;
  imageAlt: string;
  unitPrice: number;
  compareAt: number | null;
  quantity: number;
  requestedQuantity: number;
  stock: number;
  lineTotal: number;
  color: string;
  size: string;
};

export type QuoteIssue = {
  variantId: number;
  type: 'unavailable' | 'out_of_stock' | 'quantity_adjusted' | 'invalid_quantity';
  name?: string;
  available?: number;
};

export type Quote = {
  lines: QuoteLine[];
  issues: QuoteIssue[];
  itemCount: number;
  subtotal: number;
  discount: number;
  coupon: { code: string; description: string } | null;
  couponError: string | null;
  shippingMethod: string | null;
  shippingFee: number;
  freeShippingThreshold: number;
  tax: number;
  taxRate: number;
  taxInclusive: boolean;
  taxLabel: string;
  total: number;
  currency: string;
};

export function variantLabel(v: { color?: string; size?: string }) {
  return [v.color, v.size].filter(Boolean).join(' / ');
}

/**
 * Price a cart entirely from database values. Client-supplied prices are never read.
 * Lines are merged by variant, clamped to available stock, and every problem is reported
 * so the UI can explain what changed.
 */
export function quote(input: CartInput, opts: { couponCode?: string; shippingMethod?: string } = {}): Quote {
  const settings = getSettings();
  const merged = new Map<number, number>();
  const issues: QuoteIssue[] = [];

  for (const item of Array.isArray(input) ? input.slice(0, 100) : []) {
    const vid = Number(item?.variantId);
    const qty = Number(item?.quantity);
    if (!Number.isInteger(vid) || vid <= 0) continue;
    if (!Number.isInteger(qty) || qty <= 0) {
      issues.push({ variantId: vid, type: 'invalid_quantity' });
      continue;
    }
    merged.set(vid, (merged.get(vid) ?? 0) + qty);
  }

  const lines: QuoteLine[] = [];
  for (const [variantId, requested] of merged) {
    const row = get<Row>(
      `SELECT v.*, p.id AS pid, p.slug, p.name, p.name_mn, p.price AS p_price, p.sale_price AS p_sale, p.status AS p_status
       FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`,
      variantId,
    );
    const img = row
      ? get<Row>(
          "SELECT url, alt FROM product_images WHERE product_id = ? AND (color = ? OR color = '') ORDER BY (color = ?) DESC, sort_order LIMIT 1",
          row.pid,
          row.color,
          row.color,
        )
      : undefined;
    if (row) {
      row.image = img?.url;
      row.image_alt = img?.alt;
    }
    if (!row || row.p_status !== 'active' || !row.active) {
      issues.push({ variantId, type: 'unavailable', name: row?.name });
      continue;
    }
    if (row.stock <= 0) {
      issues.push({ variantId, type: 'out_of_stock', name: row.name, available: 0 });
      continue;
    }
    const cap = Math.min(row.stock, MAX_QTY_PER_LINE);
    const quantity = Math.min(requested, cap);
    if (quantity < requested) issues.push({ variantId, type: 'quantity_adjusted', name: row.name, available: cap });
    const pr = variantPricing({ price: row.p_price, sale_price: row.p_sale }, { price: row.price, sale_price: row.sale_price });
    lines.push({
      variantId,
      productId: row.pid,
      slug: row.slug,
      name: row.name,
      nameMn: row.name_mn,
      variantLabel: variantLabel(row),
      sku: row.sku,
      image: row.image ?? '',
      imageAlt: row.image_alt ?? row.name,
      unitPrice: pr.unit,
      compareAt: pr.onSale ? pr.base : null,
      quantity,
      requestedQuantity: requested,
      stock: row.stock,
      lineTotal: pr.unit * quantity,
      color: row.color,
      size: row.size,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  // Coupon
  let discount = 0;
  let coupon: Quote['coupon'] = null;
  let couponError: string | null = null;
  if (opts.couponCode) {
    const c = get<Row>('SELECT * FROM coupons WHERE code = ?', opts.couponCode.trim());
    const t = new Date().toISOString();
    if (!c || !c.active) couponError = 'This code is not valid.';
    else if (c.starts_at && c.starts_at > t) couponError = 'This code is not active yet.';
    else if (c.ends_at && c.ends_at < t) couponError = 'This code has expired.';
    else if (c.usage_limit != null && c.used_count >= c.usage_limit) couponError = 'This code has reached its usage limit.';
    else if (subtotal < c.min_subtotal) couponError = `min_subtotal:${c.min_subtotal}`;
    else {
      discount = c.type === 'percent' ? Math.floor((subtotal * Math.min(c.value, 100)) / 100) : Math.min(c.value, subtotal);
      coupon = { code: c.code, description: c.description };
    }
  }

  // Shipping
  const methods = settings.shipping.methods;
  const method = lines.length ? methods.find((m) => m.code === opts.shippingMethod) ?? null : null;
  let shippingFee = 0;
  if (method) {
    shippingFee = method.fee;
    const threshold = settings.shipping.freeShippingThreshold;
    if (method.code === 'standard' && threshold > 0 && subtotal - discount >= threshold) shippingFee = 0;
  }

  // Tax
  const taxable = subtotal - discount + shippingFee;
  const { enabled, rate, inclusive, label } = settings.tax;
  let tax = 0;
  if (enabled && rate > 0 && taxable > 0) {
    tax = inclusive ? Math.round(taxable - taxable / (1 + rate / 100)) : Math.round((taxable * rate) / 100);
  }
  const total = taxable + (enabled && !inclusive ? tax : 0);

  return {
    lines,
    issues,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal,
    discount,
    coupon,
    couponError,
    shippingMethod: method?.code ?? null,
    shippingFee,
    freeShippingThreshold: settings.shipping.freeShippingThreshold,
    tax,
    taxRate: enabled ? rate : 0,
    taxInclusive: inclusive,
    taxLabel: label,
    total,
    currency: settings.currency.code,
  };
}
