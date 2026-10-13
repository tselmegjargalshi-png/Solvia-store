import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { ProductImage } from '../../components/product.tsx';
import { Checkbox, ConfirmationDialog, ErrorState, FormAlert, LoadingState, SelectField, TextArea, TextField } from '../../components/ui.tsx';
import { api, ApiError } from '../../lib/api.ts';
import { useFormat } from '../../lib/format.ts';
import type { Category, Product } from '../../lib/types.ts';
import { useApi } from '../../lib/useApi.ts';
import { Link, useNavigate } from '../../router.tsx';
import { useToast } from '../../state/toast.tsx';
import { AdminDataTable, fieldErrors, PageHeader } from './kit.tsx';

type Row = { id: number; name: string; slug: string; sku: string; price: number; salePrice: number | null; status: string; featured: boolean; category: string; brand: string; stock: number; variants: number; image: string };

export function ProductsList() {
  const { money } = useFormat();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const { data, loading, error, reload } = useApi<{ products: Row[] }>(`/api/admin/products?${new URLSearchParams({ q: query, status })}`);
  const [del, setDel] = useState<Row | null>(null);

  const patch = async (id: number, body: object) => {
    try {
      await api(`/api/admin/products/${id}`, { method: 'PATCH', body });
      reload();
    } catch (e) {
      toast({ tone: 'error', title: 'Update failed', body: (e as Error).message });
    }
  };

  return (
    <>
      <PageHeader title="Products" sub={data ? `${data.products.length} products` : undefined} actions={<Link to="/admin/products/new" className="btn btn--primary"><Icon name="plus" size={16} /> New product</Link>} />
      <form className="admin-filters" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
        <TextField label="Search name or SKU" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </SelectField>
        <button className="btn btn--outline">Search</button>
      </form>
      {error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <AdminDataTable
          rows={data?.products ?? null}
          loading={loading}
          rowKey={(r) => r.id}
          empty="No products match."
          columns={[
            { key: 'img', label: '', className: 'cell-img', render: (r) => <ProductImage src={r.image} alt="" sizes="48px" /> },
            { key: 'name', label: 'Product', render: (r) => <><Link to={`/admin/products/${r.id}`} className="strong">{r.name}</Link><br /><span className="muted mono small">{r.sku}</span></> },
            { key: 'cat', label: 'Category', render: (r) => r.category ?? '—' },
            { key: 'price', label: 'Price', className: 'num', render: (r) => <>{money(r.salePrice ?? r.price)}{r.salePrice != null && <><br /><s className="muted small">{money(r.price)}</s></>}</> },
            { key: 'stock', label: 'Stock', className: 'num', render: (r) => <span className={r.stock <= 5 ? 'text-warn' : ''}>{r.stock}<span className="muted small"> / {r.variants} var.</span></span> },
            {
              key: 'status',
              label: 'Status',
              render: (r) => (
                <select className="input input--sm" value={r.status} aria-label={`Status for ${r.name}`} onChange={(e) => patch(r.id, { status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              ),
            },
            { key: 'feat', label: 'Featured', render: (r) => <input type="checkbox" checked={r.featured} aria-label={`Featured: ${r.name}`} onChange={(e) => patch(r.id, { featured: e.target.checked })} /> },
            {
              key: 'act',
              label: 'Actions',
              render: (r) => (
                <div className="row-gap">
                  <Link to={`/admin/products/${r.id}`} className="icon-btn icon-btn--sm" aria-label={`Edit ${r.name}`}><Icon name="edit" size={16} /></Link>
                  <a href={`/product/${r.slug}`} target="_blank" rel="noopener" className="icon-btn icon-btn--sm" aria-label={`View ${r.name} in store (new tab)`}><Icon name="eye" size={16} /></a>
                  <button className="icon-btn icon-btn--sm" onClick={() => setDel(r)} aria-label={`Delete ${r.name}`}><Icon name="trash" size={16} /></button>
                </div>
              ),
            },
          ]}
        />
      )}
      <ConfirmationDialog
        open={!!del}
        tone="danger"
        title={`Delete “${del?.name}”?`}
        body="Products that appear in past orders are archived instead of deleted, so order history stays intact."
        confirmLabel="Delete"
        onCancel={() => setDel(null)}
        onConfirm={async () => {
          try {
            const r = await api<{ archived?: boolean }>(`/api/admin/products/${del!.id}`, { method: 'DELETE' });
            toast({ tone: 'success', title: r.archived ? 'Product archived (it has order history)' : 'Product deleted' });
          } catch (e) {
            toast({ tone: 'error', title: 'Could not delete', body: (e as Error).message });
          }
          setDel(null);
          reload();
        }}
      />
    </>
  );
}

type VariantDraft = { id?: number; sku: string; color: string; colorHex: string; size: string; price: string; salePrice: string; stock: string; active: boolean };
type Draft = {
  name: string; nameMn: string; slug: string; sku: string; shortDescription: string; description: string;
  categoryId: string; brandId: string; price: string; salePrice: string; status: string; featured: boolean;
  specs: { label: string; value: string }[]; images: { url: string; alt: string; color: string }[]; variants: VariantDraft[];
};
const EMPTY: Draft = { name: '', nameMn: '', slug: '', sku: '', shortDescription: '', description: '', categoryId: '', brandId: '', price: '', salePrice: '', status: 'draft', featured: false, specs: [], images: [], variants: [{ sku: '', color: '', colorHex: '', size: '', price: '', salePrice: '', stock: '0', active: true }] };

export function ProductEditor({ id }: { id: number | null }) {
  const { toMajor, toMinor, currency } = useFormat();
  const nav = useNavigate();
  const toast = useToast();
  const cats = useApi<{ categories: Category[] }>('/api/admin/categories').data?.categories ?? [];
  const brands = useApi<{ brands: { id: number; name: string }[] }>('/api/admin/brands').data?.brands ?? [];
  const existing = useApi<{ product: Product & { categoryId: number; brandId: number } }>(id ? `/api/admin/products/${id}` : null);
  const [d, setD] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [matrix, setMatrix] = useState({ colors: '', sizes: '' });

  useEffect(() => {
    const p = existing.data?.product;
    if (!p) return;
    const m = (n: number | null | undefined) => (n == null ? '' : String(toMajor(n)));
    setD({
      name: p.name, nameMn: p.nameMn, slug: p.slug, sku: p.sku, shortDescription: p.shortDescription, description: p.description,
      categoryId: p.categoryId ? String(p.categoryId) : '', brandId: p.brandId ? String(p.brandId) : '',
      price: m(p.price), salePrice: m(p.salePrice), status: p.status, featured: p.featured, specs: p.specs,
      images: p.images.map((i) => ({ url: i.url, alt: i.alt, color: i.color ?? '' })),
      variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, color: v.color, colorHex: v.colorHex, size: v.size, price: m(v.ownPrice), salePrice: m(v.ownSalePrice), stock: String(v.stock), active: v.active })),
    });
  }, [existing.data]);

  const set = (k: keyof Draft) => (e: any) => setD({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setVar = (i: number, k: keyof VariantDraft, v: any) => setD({ ...d, variants: d.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const added: Draft['images'] = [];
    for (const f of Array.from(files).slice(0, 6)) {
      try {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) throw new Error('Only JPEG, PNG or WebP images are allowed.');
        if (f.size > 5 * 1024 * 1024) throw new Error('Images must be 5 MB or smaller.');
        const r = await api<{ url: string }>('/api/admin/uploads', { raw: f });
        added.push({ url: r.url, alt: '', color: '' });
      } catch (e) {
        toast({ tone: 'error', title: `Upload failed: ${f.name}`, body: (e as Error).message });
      }
    }
    setD((cur) => ({ ...cur, images: [...cur.images, ...added] }));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const generateMatrix = () => {
    const colors = matrix.colors.split(',').map((s) => s.trim()).filter(Boolean);
    const sizes = matrix.sizes.split(',').map((s) => s.trim()).filter(Boolean);
    const base = (d.sku || 'SKU').toUpperCase();
    const rows: VariantDraft[] = [];
    for (const c of colors.length ? colors : ['']) for (const s of sizes.length ? sizes : ['']) {
      const old = d.variants.find((v) => v.color === c && v.size === s);
      rows.push(old ?? { sku: [base, c.slice(0, 4).toUpperCase(), s.toUpperCase()].filter(Boolean).join('-').replace(/[^A-Z0-9-]/g, ''), color: c, colorHex: '', size: s, price: '', salePrice: '', stock: '0', active: true });
    }
    setD({ ...d, variants: rows });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const mm = (s: string) => (s.trim() === '' ? null : toMinor(s));
    const body = {
      ...d,
      categoryId: d.categoryId ? Number(d.categoryId) : null,
      brandId: d.brandId ? Number(d.brandId) : null,
      price: mm(d.price),
      salePrice: mm(d.salePrice),
      variants: d.variants.map((v) => ({ ...v, price: mm(v.price), salePrice: mm(v.salePrice), stock: Number(v.stock) })),
    };
    try {
      const r = await api<{ id: number }>(id ? `/api/admin/products/${id}` : '/api/admin/products', { method: id ? 'PUT' : 'POST', body });
      toast({ tone: 'success', title: 'Product saved' });
      if (!id) nav(`/admin/products/${r.id}`, { replace: true });
      else existing.reload();
    } catch (err) {
      setErrors(err instanceof ApiError ? fieldErrors(err) : { _: 'Network error' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  if (id && existing.loading && !existing.data) return <LoadingState />;
  if (id && existing.error) return <ErrorState onRetry={existing.reload} />;
  const colorsInVariants = [...new Set(d.variants.map((v) => v.color).filter(Boolean))];
  const errList = Object.entries(errors).filter(([k]) => k !== '_');

  return (
    <form onSubmit={save} noValidate>
      <PageHeader
        title={id ? `Edit: ${d.name || 'product'}` : 'New product'}
        actions={
          <>
            <Link to="/admin/products" className="btn btn--ghost">Cancel</Link>
            {id && <a href={`/product/${d.slug}`} target="_blank" rel="noopener" className="btn btn--outline">View in store</a>}
            <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
          </>
        }
      />
      {(errors._ || errList.length > 0) && (
        <FormAlert>
          {errors._ ?? 'Please correct the highlighted fields.'}
          {errList.length > 0 && <ul className="plain small">{errList.map(([k, v]) => <li key={k}><code>{k}</code>: {v}</li>)}</ul>}
        </FormAlert>
      )}
      <div className="editor-grid">
        <div className="stack">
          <section className="card">
            <h2 className="card__title">Details</h2>
            <div className="form-grid">
              <TextField label="Name (English)" value={d.name} onChange={set('name')} error={errors.name} required className="span-2" />
              <TextField label="Name (Mongolian)" value={d.nameMn} onChange={set('nameMn')} error={errors.nameMn} className="span-2" optional />
              <TextField label="URL slug" value={d.slug} onChange={set('slug')} error={errors.slug} hint="Leave empty to generate from the name." />
              <TextField label="Product SKU" value={d.sku} onChange={set('sku')} error={errors.sku} required />
              <TextArea label="Short description" value={d.shortDescription} onChange={set('shortDescription')} error={errors.shortDescription} rows={2} maxLength={300} className="span-2" />
              <TextArea label="Description" value={d.description} onChange={set('description')} error={errors.description} rows={6} className="span-2" />
            </div>
          </section>

          <section className="card">
            <h2 className="card__title">Images</h2>
            <p className="muted small">JPEG, PNG or WebP up to 5 MB. Uploads are re-encoded to WebP on the server, which also strips location metadata. Alt text is required.</p>
            <ul className="img-list">
              {d.images.map((img, i) => (
                <li key={img.url + i} className="img-row">
                  <ProductImage src={img.url} alt="" sizes="80px" />
                  <div className="img-row__fields">
                    <TextField label="Alt text" value={img.alt} error={errors[`images.${i}.alt`]} onChange={(e) => setD({ ...d, images: d.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) })} />
                    {colorsInVariants.length > 0 && (
                      <SelectField label="Shown for colour" value={img.color} onChange={(e) => setD({ ...d, images: d.images.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })}>
                        <option value="">All colours</option>
                        {colorsInVariants.map((c) => <option key={c}>{c}</option>)}
                      </SelectField>
                    )}
                  </div>
                  <div className="img-row__actions">
                    <button type="button" className="icon-btn icon-btn--sm" disabled={i === 0} aria-label="Move up" onClick={() => { const a = [...d.images]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setD({ ...d, images: a }); }}><Icon name="chevronLeft" size={16} className="rot-90" /></button>
                    <button type="button" className="icon-btn icon-btn--sm" aria-label="Remove image" onClick={() => setD({ ...d, images: d.images.filter((_, j) => j !== i) })}><Icon name="trash" size={16} /></button>
                  </div>
                </li>
              ))}
            </ul>
            <label className="btn btn--outline upload-btn">
              <Icon name="upload" size={16} /> {uploading ? 'Uploading…' : 'Upload images'}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => upload(e.target.files)} disabled={uploading} />
            </label>
          </section>

          <section className="card">
            <h2 className="card__title">Variants & stock</h2>
            <p className="muted small">A simple product has one variant with no colour or size. Leave a variant’s price empty to use the product price ({currency}).</p>
            <div className="matrix">
              <TextField label="Colours (comma-separated)" value={matrix.colors} onChange={(e) => setMatrix({ ...matrix, colors: e.target.value })} />
              <TextField label="Sizes (comma-separated)" value={matrix.sizes} onChange={(e) => setMatrix({ ...matrix, sizes: e.target.value })} />
              <button type="button" className="btn btn--outline btn--sm" onClick={generateMatrix}>Generate combinations</button>
            </div>
            {errors.variants && <p className="field__error">{errors.variants}</p>}
            <div className="table-wrap">
              <table className="table table--compact variant-table">
                <thead>
                  <tr><th>SKU</th><th>Colour</th><th>Hex</th><th>Size</th><th>Price</th><th>Sale</th><th>Stock</th><th>Active</th><th><span className="sr-only">Remove</span></th></tr>
                </thead>
                <tbody>
                  {d.variants.map((v, i) => (
                    <tr key={v.id ?? `n${i}`}>
                      {(['sku', 'color', 'colorHex', 'size', 'price', 'salePrice', 'stock'] as const).map((k) => (
                        <td key={k}>
                          <input className={`input input--sm ${errors[`variants.${i}.${k}`] ? 'input--error' : ''}`} value={v[k] as string} aria-label={`${k} for variant ${i + 1}`} inputMode={['price', 'salePrice', 'stock'].includes(k) ? 'decimal' : undefined} onChange={(e) => setVar(i, k, e.target.value)} title={errors[`variants.${i}.${k}`]} />
                        </td>
                      ))}
                      <td><input type="checkbox" checked={v.active} aria-label={`Variant ${i + 1} active`} onChange={(e) => setVar(i, 'active', e.target.checked)} /></td>
                      <td><button type="button" className="icon-btn icon-btn--sm" aria-label={`Remove variant ${i + 1}`} disabled={d.variants.length === 1} onClick={() => setD({ ...d, variants: d.variants.filter((_, j) => j !== i) })}><Icon name="trash" size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setD({ ...d, variants: [...d.variants, { sku: '', color: '', colorHex: '', size: '', price: '', salePrice: '', stock: '0', active: true }] })}><Icon name="plus" size={16} /> Add variant</button>
          </section>

          <section className="card">
            <h2 className="card__title">Specifications</h2>
            {d.specs.map((s, i) => (
              <div key={i} className="spec-row">
                <TextField label="Label" value={s.label} onChange={(e) => setD({ ...d, specs: d.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <TextField label="Value" value={s.value} onChange={(e) => setD({ ...d, specs: d.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                <button type="button" className="icon-btn icon-btn--sm" aria-label="Remove specification" onClick={() => setD({ ...d, specs: d.specs.filter((_, j) => j !== i) })}><Icon name="trash" size={16} /></button>
              </div>
            ))}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setD({ ...d, specs: [...d.specs, { label: '', value: '' }] })}><Icon name="plus" size={16} /> Add specification</button>
          </section>
        </div>

        <aside className="stack">
          <section className="card">
            <h2 className="card__title">Status</h2>
            <SelectField label="Visibility" value={d.status} onChange={set('status')} error={errors.status}>
              <option value="draft">Draft (hidden)</option>
              <option value="active">Active (visible)</option>
              <option value="archived">Archived</option>
            </SelectField>
            <Checkbox label="Featured on homepage" checked={d.featured} onChange={set('featured')} />
          </section>
          <section className="card">
            <h2 className="card__title">Pricing ({currency})</h2>
            <TextField label="Price" inputMode="decimal" value={d.price} onChange={set('price')} error={errors.price} required />
            <TextField label="Sale price" inputMode="decimal" value={d.salePrice} onChange={set('salePrice')} error={errors.salePrice} hint="Must be lower than the price. Empty = no sale." optional />
          </section>
          <section className="card">
            <h2 className="card__title">Organisation</h2>
            <SelectField label="Category" value={d.categoryId} onChange={set('categoryId')} error={errors.categoryId}>
              <option value="">—</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.parentId ? `— ${c.name}` : c.name}</option>)}
            </SelectField>
            <SelectField label="Brand" value={d.brandId} onChange={set('brandId')} error={errors.brandId}>
              <option value="">—</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </SelectField>
          </section>
        </aside>
      </div>
    </form>
  );
}
