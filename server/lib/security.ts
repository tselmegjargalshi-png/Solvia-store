import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.ts';

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** Format: scrypt$N$r$p$saltB64$hashB64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  const key = await new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      expected.length,
      { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]), maxmem: 64 * 1024 * 1024 },
      (err, k) => (err ? reject(err) : resolve(k)),
    ),
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A hash that always fails, used to keep login timing similar for unknown emails. */
export const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function passwordProblems(pw: string): string | null {
  if (typeof pw !== 'string' || pw.length < 10) return 'Password must be at least 10 characters.';
  if (pw.length > 200) return 'Password is too long.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must include letters and numbers.';
  return null;
}

/** Fixed-window in-memory rate limiter. Adequate for a single process; use Redis or similar when scaling out. */
const buckets = new Map<string, { count: number; reset: number }>();
let disabled = false;
export function setRateLimitDisabled(v: boolean) {
  disabled = v;
}
export function rateLimit(key: string, limit: number, windowMs: number) {
  if (disabled) return;
  const t = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < t) {
    buckets.set(key, { count: 1, reset: t + windowMs });
    return;
  }
  b.count++;
  if (b.count > limit) {
    const retry = Math.ceil((b.reset - t) / 1000);
    throw new HttpError(429, 'rate_limited', `Too many attempts. Please try again in ${retry} seconds.`);
  }
}
setInterval(() => {
  const t = Date.now();
  for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k);
}, 60_000).unref();
