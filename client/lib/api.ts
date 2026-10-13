export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;
  data: any;
  constructor(status: number, body: any) {
    super(body?.error?.message ?? 'Request failed');
    this.status = status;
    this.code = body?.error?.code ?? 'error';
    this.fields = body?.error?.fields ?? {};
    this.data = body?.error ?? {};
  }
}

type Opts = { method?: string; body?: unknown; signal?: AbortSignal; raw?: Blob | File; headers?: Record<string, string> };

/** All API calls go through here: JSON in/out, cookie auth, CSRF header, typed errors. */
export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Solvia-Request': '1', ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.raw) {
    body = opts.raw;
    headers['Content-Type'] = opts.raw.type;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, credentials: 'same-origin', signal: opts.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(0, { error: { code: 'network', message: 'network' } });
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const isAbort = (e: unknown) => (e as any)?.name === 'AbortError';
