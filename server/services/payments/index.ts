import { env, livePaymentsConfigured } from '../../env.ts';
import type { Row } from '../../db/index.ts';
import { demoProvider } from './demo.ts';
import { stripeProvider } from './stripe.ts';

export type CheckoutSession = {
  /** Where to send the shopper to pay. */
  redirectUrl: string;
  providerRef: string;
};

export interface PaymentProvider {
  name: 'demo' | 'stripe';
  /** Demo providers never move real money; the UI must say so. */
  isDemo: boolean;
  createCheckout(order: Row, accessToken: string): Promise<CheckoutSession>;
}

/**
 * Resolve the active card-payment provider.
 * Stripe is used only when PAYMENT_PROVIDER=stripe AND both secrets are present;
 * otherwise the clearly labelled demo provider is used.
 */
export function cardProvider(): PaymentProvider {
  if (livePaymentsConfigured()) return stripeProvider;
  return demoProvider;
}

export function demoPaymentsAllowed(): boolean {
  return !livePaymentsConfigured() && (!env.isProd || process.env.ALLOW_DEMO_PAYMENTS === 'true');
}
