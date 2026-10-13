import { Breadcrumbs } from '../components/nav.tsx';
import { Prose } from '../components/Prose.tsx';
import { FormAlert } from '../components/ui.tsx';
import { useI18n, useLocalized } from '../i18n/index.tsx';
import { useFormat } from '../lib/format.ts';
import { useSeo } from '../lib/seo.ts';
import { Link } from '../router.tsx';
import { useSettings, type Settings } from '../state/settings.tsx';

type PageKey = 'about' | 'shipping' | 'returns' | 'privacy' | 'terms';

/**
 * Store information and policy pages. Policy text is a TEMPLATE written for the demo;
 * it must be reviewed by a qualified legal professional for your jurisdiction before launch.
 * Values such as fees, thresholds and contact details come from store settings.
 */
function content(key: PageKey, s: Settings, money: (n: number) => string, L: (a: string, b?: string) => string): { title: string; body: string; legal?: boolean } {
  const methods = s.shipping.methods.map((m) => `- **${L(m.name, m.nameMn)}** — ${m.fee === 0 ? 'free' : money(m.fee)}, usually ${m.etaDays} business day(s)`).join('\n');
  switch (key) {
    case 'about':
      return {
        title: `About ${s.storeName}`,
        body: `${s.storeName} is a modern online store built around three ideas: clear prices, honest stock levels and dependable delivery.

## How we work
- Every price on the site includes ${s.tax.enabled && s.tax.inclusive ? s.tax.label : 'applicable taxes as shown at checkout'}. Discounts, delivery and tax are itemised before you pay.
- Stock shown on a product page is the live count in our system, and it is checked again when you place an order.
- If something changes — an item sells out, or a price is updated — we tell you before the order is created.

## About this demo
This storefront is a demonstration build. The products, brands, images and articles are sample content created for the demo, and card payments run in a clearly labelled demo mode where no money is charged.

## Get in touch
Questions are welcome at ${s.contact.email} or ${s.contact.phone} (${s.contact.hours}).`,
      };
    case 'shipping':
      return {
        title: 'Shipping & delivery',
        legal: true,
        body: `## Delivery options
${methods}

## Free standard delivery
${s.shipping.freeShippingThreshold > 0 ? `Standard delivery is free when your order subtotal after discounts is ${money(s.shipping.freeShippingThreshold)} or more.` : 'Delivery fees are shown at checkout.'}

## Processing time
Most orders are prepared within 1–2 business days. Card orders are prepared once payment is confirmed; bank-transfer orders once the transfer arrives.

## Tracking and contact
You can check your order status from your account or from the confirmation link sent after checkout. For delivery questions, contact ${s.contact.email}.`,
      };
    case 'returns':
      return {
        title: 'Returns & refunds',
        legal: true,
        body: `## 14-day returns
You can return unused items in their original packaging within 14 days of delivery.

## How to return
Contact ${s.contact.email} with your order number. We will confirm the return and explain how to send the item back.

## Refunds
Once we receive and check the item, we refund the original payment method. Card refunds are processed through the payment provider; bank-transfer and cash-on-delivery refunds are paid by bank transfer.

## Exceptions
Items that are damaged after delivery, or that cannot be resold for hygiene reasons, may not be eligible. Your statutory rights are not affected.`,
      };
    case 'privacy':
      return {
        title: 'Privacy policy',
        legal: true,
        body: `## What we collect
- Account details you provide: name, email, phone and saved addresses.
- Order details needed to deliver your purchase.
- Technical data such as session cookies needed to keep you signed in and remember your cart.

## What we don't collect
We never store card numbers. Card payments are handled by the payment provider.

## Cookies and analytics
We use an essential session cookie and local storage for your cart, wishlist and language. Analytics run only if the store owner configures Google Analytics; when enabled, events contain product and order values, not names, emails or addresses.

## Your choices
You can update your details in your account, unsubscribe from marketing emails at any time, and contact ${s.contact.email} to request access to or deletion of your data.`,
      };
    case 'terms':
      return {
        title: 'Terms & conditions',
        legal: true,
        body: `## Orders
Placing an order is an offer to buy. An order is accepted when we confirm it. Prices and availability are checked again when you submit your order.

## Prices and payment
Prices are shown in ${s.currency.code}${s.tax.enabled && s.tax.inclusive ? ` and include ${s.tax.label}` : ''}. Delivery fees are shown at checkout. In this demonstration store, card payments run in demo mode and no money is charged.

## Delivery and returns
See the Shipping & delivery and Returns & refunds pages.

## Contact
${s.storeName} · ${s.contact.address} · ${s.contact.email}`,
      };
  }
}

export default function Content({ page }: { page: PageKey }) {
  const { t, locale } = useI18n();
  const L = useLocalized();
  const s = useSettings();
  const { money } = useFormat();
  const c = content(page, s, money, L);
  useSeo({ title: c.title });
  return (
    <div className="container section narrow">
      <Breadcrumbs items={[{ label: t('nav.home'), to: '/' }, { label: c.title }]} />
      <h1 className="page-title">{page === 'about' ? t('about.title', { store: s.storeName }) : c.title}</h1>
      {locale === 'mn' && <FormAlert tone="info">{t('footer.translationNote')} (EN)</FormAlert>}
      {c.legal && (
        <p className="muted small">
          Template policy for the demo store — have it reviewed for your business and jurisdiction before launch.
        </p>
      )}
      <Prose text={c.body} />
      {page === 'about' && (
        <div className="row-gap">
          <Link to="/shop" className="btn btn--primary">
            {t('home.heroCta')}
          </Link>
          <Link to="/contact" className="btn btn--outline">
            {t('nav.contact')}
          </Link>
        </div>
      )}
    </div>
  );
}
