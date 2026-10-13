import { badRequest } from './http.ts';

/**
 * Tiny schema validator. Collects field errors and throws a 400 with
 * { fields: { name: message } } so forms can show messages next to inputs.
 */
export class V {
  errors: Record<string, string> = {};
  data: any;
  constructor(data: unknown) {
    this.data = data && typeof data === 'object' ? data : {};
  }
  str(key: string, opts: { required?: boolean; max?: number; min?: number; pattern?: RegExp; msg?: string } = {}): string {
    const raw = this.data[key];
    const v = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim();
    if (opts.required && !v) this.errors[key] = opts.msg ?? 'This field is required.';
    else if (v && opts.min && v.length < opts.min) this.errors[key] = `Must be at least ${opts.min} characters.`;
    else if (opts.max && v.length > opts.max) this.errors[key] = `Must be at most ${opts.max} characters.`;
    else if (v && opts.pattern && !opts.pattern.test(v)) this.errors[key] = opts.msg ?? 'Invalid format.';
    return v.slice(0, opts.max ?? 10000);
  }
  email(key: string, required = true): string {
    const v = this.str(key, { required, max: 254 }).toLowerCase();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) this.errors[key] = 'Enter a valid email address.';
    return v;
  }
  phone(key: string, required = true): string {
    const v = this.str(key, { required, max: 30 });
    if (v && !/^\+?[0-9 ()-]{6,20}$/.test(v)) this.errors[key] = 'Enter a valid phone number.';
    return v;
  }
  int(key: string, opts: { required?: boolean; min?: number; max?: number } = {}): number | null {
    const raw = this.data[key];
    if (raw === undefined || raw === null || raw === '') {
      if (opts.required) this.errors[key] = 'This field is required.';
      return null;
    }
    const n = Number(raw);
    if (!Number.isInteger(n)) {
      this.errors[key] = 'Must be a whole number.';
      return null;
    }
    if (opts.min !== undefined && n < opts.min) this.errors[key] = `Must be at least ${opts.min}.`;
    if (opts.max !== undefined && n > opts.max) this.errors[key] = `Must be at most ${opts.max}.`;
    return n;
  }
  bool(key: string): boolean {
    const v = this.data[key];
    return v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
  }
  oneOf<T extends string>(key: string, values: readonly T[], required = true): T {
    const v = this.str(key, { required });
    if (v && !values.includes(v as T)) this.errors[key] = 'Invalid choice.';
    return v as T;
  }
  fail(key: string, msg: string) {
    this.errors[key] = msg;
  }
  check() {
    if (Object.keys(this.errors).length) throw badRequest('Please correct the highlighted fields.', { fields: this.errors });
  }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
