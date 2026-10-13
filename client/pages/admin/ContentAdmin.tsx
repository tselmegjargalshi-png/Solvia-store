import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { Badge, Checkbox, ConfirmationDialog, Dialog, ErrorState, FormAlert, LoadingState, SelectField, TextArea, TextField } from '../../components/ui.tsx';
import { api, ApiError } from '../../lib/api.ts';
import { useFormat } from '../../lib/format.ts';
import type { Post } from '../../lib/types.ts';
import { useApi } from '../../lib/useApi.ts';
import { Link, useNavigate } from '../../router.tsx';
import { useToast } from '../../state/toast.tsx';
import { AdminDataTable, fieldErrors, PageHeader } from './kit.tsx';

/* ---------------- Blog ---------------- */

export function BlogList() {
  const { date } = useFormat();
  const toast = useToast();
  const { data, loading, error, reload } = useApi<{ posts: Post[] }>('/api/admin/blog');
  const [del, setDel] = useState<Post | null>(null);
  return (
    <>
      <PageHeader title="Blog posts" actions={<Link to="/admin/blog/new" className="btn btn--primary"><Icon name="plus" size={16} /> New post</Link>} />
      {error ? <ErrorState onRetry={reload} /> : (
        <AdminDataTable
          rows={data?.posts ?? null}
          loading={loading}
          rowKey={(r) => r.id}
          columns={[
            { key: 't', label: 'Title', render: (r) => <><Link to={`/admin/blog/${r.id}`} className="strong">{r.title}</Link>{r.isSample && <> <Badge>Sample</Badge></>}</> },
            { key: 's', label: 'Status', render: (r) => <Badge tone={r.status === 'published' ? 'success' : 'neutral'}>{r.status}</Badge> },
            { key: 'c', label: 'Category', render: (r) => r.category?.name ?? '—' },
            { key: 'd', label: 'Published', render: (r) => (r.publishedAt ? date(r.publishedAt) : '—') },
            { key: 'a', label: 'Actions', render: (r) => (
              <div className="row-gap">
                <Link to={`/admin/blog/${r.id}`} className="icon-btn icon-btn--sm" aria-label={`Edit ${r.title}`}><Icon name="edit" size={16} /></Link>
                <button className="icon-btn icon-btn--sm" aria-label={`Delete ${r.title}`} onClick={() => setDel(r)}><Icon name="trash" size={16} /></button>
              </div>
            ) },
          ]}
        />
      )}
      <ConfirmationDialog open={!!del} tone="danger" title={`Delete “${del?.title}”?`} confirmLabel="Delete" onCancel={() => setDel(null)} onConfirm={async () => {
        await api(`/api/admin/blog/${del!.id}`, { method: 'DELETE' }).catch((e) => toast({ tone: 'error', title: e.message }));
        setDel(null); reload();
      }} />
    </>
  );
}

const EMPTY_POST = { title: '', slug: '', excerpt: '', body: '', image: '', imageAlt: '', author: '', categoryId: '', status: 'draft', seoTitle: '', metaDescription: '', isSample: false };

export function BlogEditor({ id }: { id: number | null }) {
  const nav = useNavigate();
  const toast = useToast();
  const list = useApi<{ categories: { id: number; name: string }[] }>('/api/admin/blog');
  const existing = useApi<{ post: Post }>(id ? `/api/admin/blog/${id}` : null);
  const [d, setD] = useState<typeof EMPTY_POST>(EMPTY_POST);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const p = existing.data?.post;
    if (p) setD({ title: p.title, slug: p.slug, excerpt: p.excerpt, body: p.body ?? '', image: p.image, imageAlt: p.imageAlt, author: p.author, categoryId: p.categoryId ? String(p.categoryId) : '', status: p.status, seoTitle: p.seoTitle, metaDescription: p.metaDescription, isSample: p.isSample });
  }, [existing.data]);
  const set = (k: keyof typeof EMPTY_POST) => (e: any) => setD({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const upload = async (f: File | undefined) => {
    if (!f) return;
    try {
      const r = await api<{ url: string }>('/api/admin/uploads', { raw: f });
      setD((cur) => ({ ...cur, image: r.url }));
    } catch (e) {
      toast({ tone: 'error', title: 'Upload failed', body: (e as Error).message });
    }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const r = await api<{ id: number }>(id ? `/api/admin/blog/${id}` : '/api/admin/blog', { method: id ? 'PUT' : 'POST', body: { ...d, categoryId: d.categoryId ? Number(d.categoryId) : null } });
      toast({ tone: 'success', title: 'Post saved' });
      if (!id) nav(`/admin/blog/${r.id}`, { replace: true });
    } catch (err) {
      setErrors(err instanceof ApiError ? fieldErrors(err) : { _: 'Network error' });
    } finally {
      setBusy(false);
    }
  };
  if (id && existing.loading && !existing.data) return <LoadingState />;
  return (
    <form onSubmit={save} noValidate>
      <PageHeader title={id ? 'Edit post' : 'New post'} actions={<><Link to="/admin/blog" className="btn btn--ghost">Cancel</Link>{id && d.status === 'published' && <a className="btn btn--outline" href={`/blog/${d.slug}`} target="_blank" rel="noopener">View</a>}<button className="btn btn--primary" disabled={busy}>Save</button></>} />
      {Object.keys(errors).length > 0 && <FormAlert>{errors._ ?? 'Please correct the highlighted fields.'}</FormAlert>}
      <div className="editor-grid">
        <section className="card stack">
          <TextField label="Title" value={d.title} onChange={set('title')} error={errors.title} required />
          <TextField label="Slug" value={d.slug} onChange={set('slug')} error={errors.slug} hint="Leave empty to generate from the title." />
          <TextArea label="Excerpt" value={d.excerpt} onChange={set('excerpt')} rows={2} maxLength={400} />
          <TextArea label="Body" value={d.body} onChange={set('body')} error={errors.body} rows={16} hint="Supports ## headings, - bullet lists and **bold**. HTML is shown as text, never executed." />
        </section>
        <aside className="stack">
          <section className="card stack">
            <SelectField label="Status" value={d.status} onChange={set('status')}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </SelectField>
            <TextField label="Author" value={d.author} onChange={set('author')} error={errors.author} required />
            <SelectField label="Category" value={d.categoryId} onChange={set('categoryId')}>
              <option value="">—</option>
              {(list.data?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>
            <Checkbox label="Mark as sample / demo content" checked={d.isSample} onChange={set('isSample')} />
          </section>
          <section className="card stack">
            <h2 className="card__title">Featured image</h2>
            <TextField label="Image URL" value={d.image} onChange={set('image')} />
            <TextField label="Alt text" value={d.imageAlt} onChange={set('imageAlt')} error={errors.imageAlt} />
            <label className="btn btn--outline btn--sm upload-btn"><Icon name="upload" size={16} /> Upload<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} /></label>
          </section>
          <section className="card stack">
            <h2 className="card__title">SEO</h2>
            <TextField label="SEO title" value={d.seoTitle} onChange={set('seoTitle')} maxLength={70} hint={`${d.seoTitle.length}/70`} />
            <TextArea label="Meta description" value={d.metaDescription} onChange={set('metaDescription')} maxLength={170} rows={3} hint={`${d.metaDescription.length}/170`} />
          </section>
        </aside>
      </div>
    </form>
  );
}

/* ---------------- FAQs ---------------- */

type Faq = { id?: number; question: string; answer: string; questionMn: string; answerMn: string; sortOrder: number; published: boolean };

export function Faqs() {
  const { data, loading, error, reload } = useApi<{ faqs: Faq[] }>('/api/admin/faqs');
  const [edit, setEdit] = useState<Faq | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(edit!.id ? `/api/admin/faqs/${edit!.id}` : '/api/admin/faqs', { method: edit!.id ? 'PUT' : 'POST', body: edit });
      setEdit(null);
      reload();
    } catch (err) {
      setErrors(err instanceof ApiError ? fieldErrors(err) : { _: 'Network error' });
    }
  };
  return (
    <>
      <PageHeader title="FAQs" actions={<button className="btn btn--primary" onClick={() => { setErrors({}); setEdit({ question: '', answer: '', questionMn: '', answerMn: '', sortOrder: (data?.faqs.length ?? 0) + 1, published: true }); }}><Icon name="plus" size={16} /> New FAQ</button>} />
      {error ? <ErrorState onRetry={reload} /> : (
        <AdminDataTable rows={data?.faqs ?? null} loading={loading} rowKey={(r) => r.id!} columns={[
          { key: 'q', label: 'Question', render: (r) => r.question },
          { key: 'mn', label: 'MN', render: (r) => (r.questionMn ? '✓' : '—') },
          { key: 'p', label: 'Published', render: (r) => <Badge tone={r.published ? 'success' : 'neutral'}>{r.published ? 'Yes' : 'No'}</Badge> },
          { key: 'a', label: 'Actions', render: (r) => (
            <div className="row-gap">
              <button className="icon-btn icon-btn--sm" aria-label="Edit FAQ" onClick={() => { setErrors({}); setEdit(r); }}><Icon name="edit" size={16} /></button>
              <button className="icon-btn icon-btn--sm" aria-label="Delete FAQ" onClick={async () => { if (window.confirm('Delete this FAQ?')) { await api(`/api/admin/faqs/${r.id}`, { method: 'DELETE' }); reload(); } }}><Icon name="trash" size={16} /></button>
            </div>
          ) },
        ]} />
      )}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit FAQ' : 'New FAQ'}>
        {edit && (
          <form onSubmit={save} className="stack" noValidate>
            {errors._ && <FormAlert>{errors._}</FormAlert>}
            <TextField label="Question" value={edit.question} onChange={(e) => setEdit({ ...edit, question: e.target.value })} error={errors.question} />
            <TextArea label="Answer" value={edit.answer} onChange={(e) => setEdit({ ...edit, answer: e.target.value })} error={errors.answer} rows={4} />
            <TextField label="Question (Mongolian)" value={edit.questionMn} onChange={(e) => setEdit({ ...edit, questionMn: e.target.value })} optional />
            <TextArea label="Answer (Mongolian)" value={edit.answerMn} onChange={(e) => setEdit({ ...edit, answerMn: e.target.value })} rows={4} optional />
            <TextField label="Sort order" inputMode="numeric" value={String(edit.sortOrder)} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) || 0 })} />
            <Checkbox label="Published" checked={edit.published} onChange={(e) => setEdit({ ...edit, published: e.target.checked })} />
            <div className="form-actions"><button type="button" className="btn btn--ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn--primary">Save</button></div>
          </form>
        )}
      </Dialog>
    </>
  );
}

/* ---------------- Coupons ---------------- */

export function Coupons() {
  const { money, toMinor, currency } = useFormat();
  const { data, loading, error, reload } = useApi<{ coupons: any[] }>('/api/admin/coupons');
  const [d, setD] = useState({ code: '', description: '', type: 'percent', value: '', minSubtotal: '', usageLimit: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    try {
      await api('/api/admin/coupons', { body: { ...d, value: d.type === 'fixed' ? toMinor(d.value || 0) : Number(d.value), minSubtotal: d.minSubtotal ? toMinor(d.minSubtotal) : 0, usageLimit: d.usageLimit ? Number(d.usageLimit) : null } });
      setD({ code: '', description: '', type: 'percent', value: '', minSubtotal: '', usageLimit: '' });
      reload();
    } catch (err) {
      setErrors(err instanceof ApiError ? fieldErrors(err) : { _: 'Network error' });
    }
  };
  return (
    <>
      <PageHeader title="Coupons" sub="Discounts are validated and calculated on the server at quote and checkout time." />
      <form className="card form-grid form-grid--4" onSubmit={add} noValidate>
        {errors._ && <FormAlert>{errors._}</FormAlert>}
        <TextField label="Code" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase() })} error={errors.code} />
        <SelectField label="Type" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value })}>
          <option value="percent">Percent</option>
          <option value="fixed">Fixed amount</option>
        </SelectField>
        <TextField label={d.type === 'percent' ? 'Percent off' : `Amount off (${currency})`} inputMode="decimal" value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} error={errors.value} />
        <TextField label={`Min. subtotal (${currency})`} inputMode="decimal" value={d.minSubtotal} onChange={(e) => setD({ ...d, minSubtotal: e.target.value })} error={errors.minSubtotal} optional />
        <TextField label="Description" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} className="span-2" optional />
        <TextField label="Usage limit" inputMode="numeric" value={d.usageLimit} onChange={(e) => setD({ ...d, usageLimit: e.target.value })} error={errors.usageLimit} optional />
        <div className="form-actions"><button className="btn btn--primary">Create coupon</button></div>
      </form>
      {error ? <ErrorState onRetry={reload} /> : (
        <AdminDataTable rows={data?.coupons ?? null} loading={loading} rowKey={(r) => r.id} columns={[
          { key: 'c', label: 'Code', render: (r) => <span className="mono strong">{r.code}</span> },
          { key: 'v', label: 'Discount', render: (r) => (r.type === 'percent' ? `${r.value}%` : money(r.value)) },
          { key: 'm', label: 'Min. subtotal', className: 'num', render: (r) => money(r.min_subtotal) },
          { key: 'u', label: 'Used', className: 'num', render: (r) => `${r.used_count}${r.usage_limit ? ` / ${r.usage_limit}` : ''}` },
          { key: 'a', label: 'Active', render: (r) => <input type="checkbox" checked={!!r.active} aria-label={`Active: ${r.code}`} onChange={async (e) => { await api(`/api/admin/coupons/${r.id}`, { method: 'PATCH', body: { active: e.target.checked } }); reload(); }} /> },
        ]} />
      )}
    </>
  );
}

/* ---------------- Messages ---------------- */

export function Messages() {
  const { dateTime } = useFormat();
  const { data, loading, error, reload } = useApi<{ messages: any[] }>('/api/admin/messages');
  if (error) return <ErrorState onRetry={reload} />;
  return (
    <>
      <PageHeader title="Contact messages" sub="Messages submitted through the contact form. Reply from your email client." />
      {loading && !data ? <LoadingState /> : (
        <AdminDataTable rows={data?.messages ?? []} rowKey={(r) => r.id} empty="No messages yet." columns={[
          { key: 'd', label: 'Received', render: (r) => dateTime(r.created_at) },
          { key: 'f', label: 'From', render: (r) => <>{r.name}<br /><a href={`mailto:${r.email}`} className="small">{r.email}</a></> },
          { key: 's', label: 'Subject', render: (r) => <strong>{r.subject}</strong> },
          { key: 'm', label: 'Message', render: (r) => <span className="pre-wrap">{r.message}</span> },
        ]} />
      )}
    </>
  );
}
