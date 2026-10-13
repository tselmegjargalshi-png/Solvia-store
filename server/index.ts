import { env } from './env.ts';
import { openDb } from './db/index.ts';
import { createApp } from './app.ts';
import { expireReservations } from './services/orders.ts';
import { seedIfEmpty } from './scripts/seed-data.ts';

openDb(env.databasePath);
await seedIfEmpty();

const server = createApp();
server.listen(env.port, env.host, () => {
  console.log(`SOLVIA running at http://${env.host}:${env.port}  (payments: ${env.paymentProvider}, env: ${env.nodeEnv})`);
});

// Release stock held by unpaid card orders once their reservation window passes.
setInterval(() => {
  try {
    const n = expireReservations();
    if (n) console.log(`[reservations] expired ${n} unpaid order(s)`);
  } catch (e) {
    console.error('[reservations]', e);
  }
}, 60_000).unref();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
