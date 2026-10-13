/**
 * Create or promote an administrator. There is no default admin account and no
 * hard-coded password anywhere in the codebase.
 *
 *   npm run create-admin -- --email you@example.com --name "Your Name"
 *
 * The password is read from the ADMIN_PASSWORD environment variable if set (for CI),
 * otherwise you are prompted for it in the terminal (input is not echoed).
 * Run it once on the server, then unset ADMIN_PASSWORD.
 */
import { parseArgs } from 'node:util';
import { env } from '../env.ts';
import { closeDb, get, now, openDb, run } from '../db/index.ts';
import { hashPassword, passwordProblems } from '../lib/security.ts';

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
const email = (values.email ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const name = (values.name ?? process.env.ADMIN_NAME ?? 'Store Admin').trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error('Usage: npm run create-admin -- --email you@example.com [--name "Your Name"]');
  process.exit(1);
}

async function promptHidden(q: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('No TTY available; set ADMIN_PASSWORD instead.');
  process.stdout.write(q);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let pw = '';
  return new Promise((resolve) => {
    process.stdin.on('data', (b: Buffer) => {
      for (const ch of b.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          return resolve(pw);
        }
        if (ch === '\u0003') process.exit(130);
        if (ch === '\u007f') pw = pw.slice(0, -1);
        else pw += ch;
      }
    });
  });
}

const password = process.env.ADMIN_PASSWORD || (await promptHidden('Admin password (min 10 chars, letters + numbers): '));
const problem = passwordProblems(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}

openDb(env.databasePath);
const hash = await hashPassword(password);
const existing = get<{ id: number }>('SELECT id FROM users WHERE email = ?', email);
if (existing) {
  run("UPDATE users SET role = 'admin', status = 'active', password_hash = ?, updated_at = ? WHERE id = ?", hash, now(), existing.id);
  run('DELETE FROM sessions WHERE user_id = ?', existing.id);
  console.log(`Updated ${email}: role=admin, password reset, existing sessions revoked.`);
} else {
  const t = now();
  run("INSERT INTO users (email, password_hash, full_name, role, created_at, updated_at) VALUES (?, ?, ?, 'admin', ?, ?)", email, hash, name, t, t);
  console.log(`Created administrator ${email}.`);
}
closeDb();
