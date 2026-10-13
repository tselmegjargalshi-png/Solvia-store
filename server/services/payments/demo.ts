import { randomToken } from '../../lib/security.ts';
import type { PaymentProvider } from './index.ts';

/**
 * Demo provider: sends the shopper to an in-app page that is clearly labelled
 * "Demo payment — no money is charged". Nothing here talks to a bank.
 * Confirmation is handled by POST /api/payments/demo/confirm, which is refused
 * whenever live payments are configured (and in production unless ALLOW_DEMO_PAYMENTS=true).
 */
export const demoProvider: PaymentProvider = {
  name: 'demo',
  isDemo: true,
  async createCheckout(order, accessToken) {
    const ref = 'demo_' + randomToken(9);
    return {
      providerRef: ref,
      redirectUrl: `/checkout/demo-payment/${encodeURIComponent(order.number)}?token=${encodeURIComponent(accessToken)}`,
    };
  },
};
