import type { IncomingMessage, ServerResponse } from 'node:http';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Please sign in to continue.') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'You do not have permission to do that.') => new HttpError(403, 'forbidden', msg);
export const notFound = (msg = 'Not found.') => new HttpError(404, 'not_found', msg);
export const conflict = (msg: string, details?: unknown) => new HttpError(409, 'conflict', msg, details);

export type Ctx = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
  cookies: Record<string, string>;
  ip: string;
  body: () => Promise<any>;
  rawBody: (limit?: number) => Promise<Buffer>;
  user?: { id: number; email: string; full_name: string; role: string; status: string; locale: string; phone: string };
};

type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
type Route = { method: string; pattern: RegExp; keys: string[]; handler: Handler };

export class Router {
  routes: Route[] = [];
  add(method: string, path: string, handler: Handler) {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/\/:([a-zA-Z_]+)/g, (_m, k) => {
          keys.push(k);
          return '/([^/]+)';
        }) +
        '/?$',
    );
    this.routes.push({ method, pattern, keys, handler });
  }
  get = (p: string, h: Handler) => this.add('GET', p, h);
  post = (p: string, h: Handler) => this.add('POST', p, h);
  put = (p: string, h: Handler) => this.add('PUT', p, h);
  patch = (p: string, h: Handler) => this.add('PATCH', p, h);
  delete = (p: string, h: Handler) => this.add('DELETE', p, h);

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | 'method' | null {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.pattern.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
    return pathMatched ? 'method' : null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}

export function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tooLarge = () => new HttpError(413, 'payload_too_large', 'Request body is too large.');
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      // Reject before reading; the error handler answers 413 with Connection: close.
      req.resume();
      return reject(tooLarge());
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on('data', (c: Buffer) => {
      if (failed) return; // discard the rest so the 413 response can still be delivered
      size += c.length;
      if (size > limit) {
        failed = true;
        chunks.length = 0;
        reject(tooLarge());
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => !failed && resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function sendJson(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function setCookie(
  res: ServerResponse,
  name: string,
  value: string,
  opts: { maxAge?: number; secure?: boolean; httpOnly?: boolean } = {},
) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  const prev = res.getHeader('Set-Cookie');
  const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
  res.setHeader('Set-Cookie', [...list, parts.join('; ')]);
}
