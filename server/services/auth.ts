import type { ServerResponse } from 'node:http';
import { env } from '../env.ts';
import { get, now, run, type Row } from '../db/index.ts';
import { forbidden, setCookie, unauthorized, type Ctx } from '../lib/http.ts';
import { randomToken, sha256 } from '../lib/security.ts';

export const SESSION_COOKIE = 'solvia_session';
const SESSION_DAYS = 30;

export function createSession(res: ServerResponse, userId: number) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', sha256(token), userId, now(), expires);
  setCookie(res, SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400, secure: env.cookieSecure });
}

export function destroySession(ctx: Ctx) {
  const token = ctx.cookies[SESSION_COOKIE];
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  setCookie(ctx.res, SESSION_COOKIE, '', { maxAge: 0, secure: env.cookieSecure });
}

/** Resolve the session cookie to an active user (server-side source of truth for auth). */
export function loadUser(ctx: Ctx) {
  const token = ctx.cookies[SESSION_COOKIE];
  if (!token) return;
  const row = get<Row>(
    `SELECT u.id, u.email, u.full_name, u.role, u.status, u.locale, u.phone, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    sha256(token),
  );
  if (!row) return;
  if (row.expires_at < now() || row.status !== 'active') {
    run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
    return;
  }
  ctx.user = { id: row.id, email: row.email, full_name: row.full_name, role: row.role, status: row.status, locale: row.locale, phone: row.phone };
}

export function requireUser(ctx: Ctx) {
  if (!ctx.user) throw unauthorized();
  return ctx.user;
}

/** Every /api/admin route calls this. Hiding UI is not the security boundary — this is. */
export function requireAdmin(ctx: Ctx) {
  const u = requireUser(ctx);
  if (u.role !== 'admin') throw forbidden('Administrator access required.');
  return u;
}

export function publicUser(u: Ctx['user']) {
  if (!u) return null;
  return { id: u.id, email: u.email, fullName: u.full_name, role: u.role, locale: u.locale, phone: u.phone };
}
