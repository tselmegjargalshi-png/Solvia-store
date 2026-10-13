import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile) && !process.env.SOLVIA_SKIP_DOTENV) process.loadEnvFile(envFile);

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export const env = {
  root,
  nodeEnv: str('NODE_ENV', 'development'),
  isProd: str('NODE_ENV', 'development') === 'production',
  port: Number(str('PORT', '4173')),
  host: str('HOST', '127.0.0.1'),
  publicUrl: str('PUBLIC_URL', 'http://localhost:4173').replace(/\/$/, ''),
  databasePath: path.resolve(root, str('DATABASE_PATH', 'data/solvia.db')),
  uploadDir: path.resolve(root, str('UPLOAD_DIR', 'public/uploads')),
  /** demo | stripe */
  paymentProvider: str('PAYMENT_PROVIDER', 'demo') as 'demo' | 'stripe',
  stripeSecretKey: str('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: str('STRIPE_WEBHOOK_SECRET'),
  gaMeasurementId: str('GA_MEASUREMENT_ID'),
  gscVerification: str('GOOGLE_SITE_VERIFICATION'),
  /** Print password-reset links to the server log when no email provider is configured (dev only). */
  logResetLinks: str('LOG_RESET_LINKS', 'true') === 'true',
  cookieSecure: str('COOKIE_SECURE', 'false') === 'true',
  disableRateLimit: str('DISABLE_RATE_LIMIT', 'false') === 'true',
};

/** True only when a live payment provider is fully configured. */
export function livePaymentsConfigured(): boolean {
  return env.paymentProvider === 'stripe' && !!env.stripeSecretKey && !!env.stripeWebhookSecret;
}
