import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { env } from './env.ts';
import { HttpError, parseCookies, readBody, Router, sendJson, type Ctx } from './lib/http.ts';
import { setRateLimitDisabled } from './lib/security.ts';
import { loadUser } from './services/auth.ts';
import { metaFor, renderHead, robotsTxt, sitemapXml } from './services/seo.ts';
import { publicRoutes } from './routes/public.ts';
import { accountRoutes } from './routes/account.ts';
import { checkoutRoutes } from './routes/checkout.ts';
import { adminRoutes } from './routes/admin.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export function buildRouter() {
  const r = new Router();
  publicRoutes(r);
  accountRoutes(r);
  checkoutRoutes(r);
  adminRoutes(r);
  return r;
}

function securityHeaders(res: ServerResponse) {
  const ga = env.gaMeasurementId ? ' https://www.googletagmanager.com' : '';
  const gaConnect = env.gaMeasurementId ? ' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com' : '';
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src 'self'${ga}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:" + (env.gaMeasurementId ? ' https://*.google-analytics.com https://www.googletagmanager.com' : ''),
      `connect-src 'self'${gaConnect}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
      "object-src 'none'",
    ].join('; '),
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function serveFile(req: IncomingMessage, res: ServerResponse, file: string, immutable: boolean) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] ?? 'application/octet-stream';
  const st = statSync(file);
  const etag = `W/"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    ETag: etag,
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const compressible = /text|javascript|json|svg/.test(type);
  if (compressible && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')) && st.size > 1024) {
    const body = gzipSync(readFileSync(file));
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': String(body.length) });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': String(st.size) });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

/** Resolve a URL path inside a root directory without allowing traversal. */
function safeJoin(root: string, urlPath: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const p = path.normalize(path.join(root, decoded));
  if (!p.startsWith(root + path.sep)) return null;
  return existsSync(p) && statSync(p).isFile() ? p : null;
}

export function createApp() {
  setRateLimitDisabled(env.disableRateLimit);
  const router = buildRouter();
  const distDir = path.join(env.root, 'dist');
  const publicDir = path.join(env.root, 'public');
  let template: string | null = null;
  const getTemplate = () => {
    if (template && env.isProd) return template;
    const f = path.join(distDir, 'index.html');
    template = existsSync(f) ? readFileSync(f, 'utf8') : '<!doctype html><html><head><!--head--></head><body><div id="root">Run <code>npm run build</code> first.</div></body></html>';
    return template;
  };

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;
    securityHeaders(res);
    try {
      if (pathname.startsWith('/api/')) {
        const method = req.method ?? 'GET';
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && pathname !== '/api/payments/stripe/webhook') {
          // CSRF defence: browsers can't send this custom header cross-site without a CORS preflight we never allow.
          if (req.headers['x-solvia-request'] !== '1') throw new HttpError(403, 'csrf', 'Request rejected.');
        }
        const match = router.match(method === 'HEAD' ? 'GET' : method, pathname);
        if (match === null) throw new HttpError(404, 'not_found', 'Endpoint not found.');
        if (match === 'method') throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
        let bodyCache: any;
        const ctx: Ctx = {
          req,
          res,
          url,
          params: match.params,
          query: url.searchParams,
          cookies: parseCookies(req.headers.cookie),
          ip: req.socket.remoteAddress ?? 'unknown',
          rawBody: (limit = 1024 * 1024) => readBody(req, limit),
          body: async () => {
            if (bodyCache !== undefined) return bodyCache;
            const buf = await readBody(req, 256 * 1024);
            if (!buf.length) return (bodyCache = {});
            try {
              bodyCache = JSON.parse(buf.toString('utf8'));
            } catch {
              throw new HttpError(400, 'bad_json', 'Malformed JSON body.');
            }
            if (!bodyCache || typeof bodyCache !== 'object') bodyCache = {};
            return bodyCache;
          },
        };
        loadUser(ctx);
        const result = await match.handler(ctx);
        if (!res.headersSent) sendJson(res, 200, result ?? { ok: true });
        return;
      }

      if (pathname === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(robotsTxt());
      }
      if (pathname === '/sitemap.xml') {
        res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
        return res.end(sitemapXml());
      }

      if (pathname.startsWith('/assets/')) {
        const f = safeJoin(distDir, pathname);
        if (f) return serveFile(req, res, f, true);
        res.writeHead(404).end();
        return;
      }
      const pub = safeJoin(publicDir, pathname);
      if (pub) return serveFile(req, res, pub, false);

      // SPA route: inject per-page SEO tags so crawlers and link previews see real titles/descriptions/structured data.
      const meta = metaFor(pathname);
      const html = getTemplate().replace('<!--head-->', renderHead(meta));
      res.writeHead(meta.status ?? 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(html);
    } catch (e: any) {
      if (e instanceof HttpError) {
        if (e.status === 413) res.setHeader('Connection', 'close');
        sendJson(res, e.status, { error: { code: e.code, message: e.message, ...(e.details && typeof e.details === 'object' ? e.details : {}) } });
      } else {
        console.error('[error]', req.method, pathname, e);
        if (!res.headersSent) sendJson(res, 500, { error: { code: 'server_error', message: 'Something went wrong on our side. Please try again.' } });
        else res.end();
      }
    }
  });
}
