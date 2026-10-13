/**
 * Test harness: boots the real HTTP app on a random port against a fresh
 * temporary SQLite database seeded with the demo catalog.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

export async function startTestServer() {
  const dir = mkdtempSync(path.join(tmpdir(), 'solvia-test-'));
  process.env.SOLVIA_SKIP_DOTENV = '1';
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dir, 'uploads');
  process.env.DISABLE_RATE_LIMIT = 'true';
  process.env.LOG_RESET_LINKS = 'false';
  process.env.PAYMENT_PROVIDER = 'demo';
  process.env.NODE_ENV = 'test';

  const { env } = await import('../server/env.ts');
  const { openDb, closeDb } = await import('../server/db/index.ts');
  const { seedIfEmpty } = await import('../server/scripts/seed-data.ts');
  const { createApp } = await import('../server/app.ts');
  openDb(env.databasePath);
  await seedIfEmpty();
  const server: Server = createApp();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    dir,
    async stop() {
      await new Promise<void>((r) => server.close(() => r()));
      closeDb();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A tiny client with its own cookie jar (one per simulated browser). */
export class Client {
  cookies = new Map<string, string>();
  base: string;
  constructor(base: string) {
    this.base = base;
  }
  async req(method: string, p: string, body?: unknown, opts: { csrf?: boolean; headers?: Record<string, string>; raw?: Buffer } = {}) {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.csrf !== false) headers['X-Solvia-Request'] = '1';
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload: any;
    if (opts.raw) payload = opts.raw;
    else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(this.base + p, { method, headers, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (/Max-Age=0/.test(c) || v === '') this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, body: json, text, headers: res.headers };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b?: unknown) => this.req('POST', p, b ?? {});
  put = (p: string, b?: unknown) => this.req('PUT', p, b ?? {});
  patch = (p: string, b?: unknown) => this.req('PATCH', p, b ?? {});
  del = (p: string) => this.req('DELETE', p);
}

export const shopper = {
  email: 'guest.buyer@example.com',
  fullName: 'Guest Buyer',
  phone: '+976 9911 2233',
  country: 'Mongolia',
  city: 'Ulaanbaatar',
  address: 'Sukhbaatar district, 1st khoroo, Building 12',
  postalCode: '14200',
  deliveryNotes: '',
  shippingMethod: 'standard',
  acceptTerms: true,
};
