import { useState, type FormEvent } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { ConfirmationDialog, Dialog, ErrorState, FormAlert, SelectField, TextArea, TextField } from '../../components/ui.tsx';
import { api, ApiError } from '../../lib/api.ts';
import type { Category } from '../../lib/types.ts';
import { useApi } from '../../lib/useApi.ts';
import { useToast } from '../../state/toast.tsx';
import { AdminDataTable, fieldErrors, PageHeader } from './kit.tsx';

type CatDraft = { id?: number; name: string; nameMn: string; slug: string; parentId: string; description: string; image: string; sortOrder: string };

export function Categories() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ categories: Category[] }>('/api/admin/categories');
  const [edit, setEdit] = useState<CatDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [del, setDel] = useState<Category | null>(null);
  const cats = data?.categories ?? [];
  // Show the hierarchy: parents followed by their children.
  const ordered = cats.filter((c) => !c.parentId).flatMap((p) => [p, ...cats.filter((c) => c.parentId === p.id)]);
  const orphans = cats.filter((c) => c.parentId && !cats.some((p) => p.id === c.parentId));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    try {
      const body = { ...edit, parentId: edit!.parentId ? Number(edit!.parentId) : null, sortOrder: Number(edit!.sortOrder) || 0 };
      await api(edit!.id ? `/api/admin/categories/${edit!.id}` : '/api/admin/categories', { method: edit!.id ? 'PUT' : 'POST', body });
      setEdit(null);
      reload();
      toast({ tone: 'success', title: 'Category saved' });
    } catch (err) {
      setErrors(err instanceof ApiError ? fieldErrors(err) : { _: 'Network error' });
    }
  };

  return (
    <>
      <PageHeader title="Categories" actions={<button className="btn btn--primary" onClick={() => { setErrors({}); setEdit({ name: '', nameMn: '', slug: '', parentId: '', description: '', image: '', sortOrder: '0' }); }}><Icon name="plus" size={16} /> New category</button>} />
      {error ? <ErrorState onRetry={reload} /> : (
        <AdminDataTable
          rows={data ? [...ordered, ...orphans] : null}
          loading={loading}
          rowKey={(r) => r.id}
          columns={[
            { key: 'n', label: 'Name', render: (r) => <span className={r.parentId ? 'indent' : 'strong'}>{r.parentId ? '↳ ' : ''}{r.name}</span> },
            { key: 'mn', label: 'Mongolian', render: (r) => r.nameMn || <span className="muted">—</span> },
            { key: 's', label: 'Slug', render: (r) => <span className="mono small">{r.slug}</span> },
            { key: 'c', label: 'Products', className: 'num', render: (r) => r.productCount },
            { key: 'a', label: 'Actions', render: (r) => (
              <div className="row-gap">
                <button className="icon-btn icon-btn--sm" aria-label={`Edit ${r.name}`} onClick={() => { setErrors({}); setEdit({ id: r.id, name: r.name, nameMn: r.nameMn, slug: r.slug, parentId: r.parentId ? String(r.parentId) : '', description: r.description, image: r.image, sortOrder: String(r.sortOrder) }); }}><Icon name="edit" size={16} /></button>
                <button className="icon-btn icon-btn--sm" aria-label={`Delete ${r.name}`} onClick={() => setDel(r)}><Icon name="trash" size={16} /></button>
              </div>
            ) },
          ]}
        />
      )}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit category' : 'New category'}>
        {edit && (
          <form onSubmit={save} noValidate className="stack">
            {errors._ && <FormAlert>{errors._}</FormAlert>}
            <TextField label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} error={errors.name} required />
            <TextField label="Name (Mongolian)" value={edit.nameMn} onChange={(e) => setEdit({ ...edit, nameMn: e.target.value })} optional />
            <TextField label="Slug" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} error={errors.slug} hint="Leave empty to generate." />
            <SelectField label="Parent category" value={edit.parentId} onChange={(e) => setEdit({ ...edit, parentId: e.target.value })} error={errors.parentId}>
              <option value="">None (top level)</option>
              {cats.filter((c) => c.id !== edit.id).map((c) => <option key={c.id} value={c.id}>{c.parentId ? `— ${c.name}` : c.name}</option>)}
            </SelectField>
            <TextArea label="Description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={2} />
            <TextField label="Image path" value={edit.image} onChange={(e) => setEdit({ ...edit, image: e.target.value })} hint="e.g. a product image URL such as /images/products/…webp" optional />
            <TextField label="Sort order" inputMode="numeric" value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: e.target.value })} />
            <div className="form-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button className="btn btn--primary">Save</button>
            </div>
          </form>
        )}
      </Dialog>
      <ConfirmationDialog open={!!del} tone="danger" title={`Delete “${del?.name}”?`} body="Categories that still contain products cannot be deleted. Sub-categories move to the top level." confirmLabel="Delete" onCancel={() => setDel(null)} onConfirm={async () => {
        try { await api(`/api/admin/categories/${del!.id}`, { method: 'DELETE' }); toast({ tone: 'success', title: 'Category deleted' }); }
        catch (e) { toast({ tone: 'error', title: 'Could not delete', body: (e as Error).message }); }
        setDel(null); reload();
      }} />
    </>
  );
}

export function Brands() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ brands: { id: number; slug: string; name: string; products: number }[] }>('/api/admin/brands');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await api('/api/admin/brands', { body: { name } });
      setName('');
      reload();
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.fields.name ?? ex.message : 'Network error');
    }
  };
  return (
    <>
      <PageHeader title="Brands" />
      <form className="admin-filters" onSubmit={add} noValidate>
        <TextField label="New brand name" value={name} onChange={(e) => setName(e.target.value)} error={err} />
        <button className="btn btn--primary">Add brand</button>
      </form>
      {error ? <ErrorState onRetry={reload} /> : (
        <AdminDataTable
          rows={data?.brands ?? null}
          loading={loading}
          rowKey={(r) => r.id}
          columns={[
            { key: 'n', label: 'Name', render: (r) => r.name },
            { key: 's', label: 'Slug', render: (r) => <span className="mono small">{r.slug}</span> },
            { key: 'p', label: 'Products', className: 'num', render: (r) => r.products },
            { key: 'a', label: 'Actions', render: (r) => (
              <div className="row-gap">
                <button className="icon-btn icon-btn--sm" aria-label={`Rename ${r.name}`} onClick={async () => {
                  const n = window.prompt('Rename brand', r.name);
                  if (n && n.trim()) { await api(`/api/admin/brands/${r.id}`, { method: 'PUT', body: { name: n } }).catch((e) => toast({ tone: 'error', title: e.message })); reload(); }
                }}><Icon name="edit" size={16} /></button>
                <button className="icon-btn icon-btn--sm" aria-label={`Delete ${r.name}`} disabled={r.products > 0} title={r.products > 0 ? 'Brand has products' : undefined} onClick={async () => {
                  await api(`/api/admin/brands/${r.id}`, { method: 'DELETE' }).catch((e) => toast({ tone: 'error', title: e.message }));
                  reload();
                }}><Icon name="trash" size={16} /></button>
              </div>
            ) },
          ]}
        />
      )}
    </>
  );
}
