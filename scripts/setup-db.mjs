/**
 * First-time setup: copy .env.example → .env if missing, run migrations and seed the demo catalog.
 * Does NOT create an administrator; run `npm run create-admin -- --email you@example.com` afterwards.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
if (!existsSync(path.join(root, '.env'))) {
  copyFileSync(path.join(root, '.env.example'), path.join(root, '.env'));
  console.log('Created .env from .env.example (review it before deploying).');
}
const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/scripts/seed.ts'], { cwd: root, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log('\nNext: create your administrator account:\n  npm run create-admin -- --email you@example.com --name "Your Name"\n');
