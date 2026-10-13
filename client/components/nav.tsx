import { useT } from '../i18n/index.tsx';
import { Link } from '../router.tsx';
import { Icon } from './Icon.tsx';

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  const t = useT();
  return (
    <nav aria-label={t('common.breadcrumb')} className="crumbs">
      <ol>
        {items.map((it, i) => (
          <li key={i}>
            {it.to && i < items.length - 1 ? <Link to={it.to}>{it.label}</Link> : <span aria-current={i === items.length - 1 ? 'page' : undefined}>{it.label}</span>}
            {i < items.length - 1 && <Icon name="chevronRight" size={14} className="crumbs__sep" />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  const t = useT();
  if (pages <= 1) return null;
  const nums: (number | '…')[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <nav className="pager" aria-label={t('a11y.pagination')}>
      <button className="pager__btn" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        <Icon name="chevronLeft" size={16} /> <span className="pager__label">{t('shop.prev')}</span>
      </button>
      <ol className="pager__nums">
        {nums.map((n, i) =>
          n === '…' ? (
            <li key={`e${i}`} className="pager__ellipsis" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={n}>
              <button className={`pager__num ${n === page ? 'is-active' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => onChange(n)} aria-label={t('shop.page', { page: n, pages })}>
                {n}
              </button>
            </li>
          ),
        )}
      </ol>
      <button className="pager__btn" onClick={() => onChange(page + 1)} disabled={page >= pages}>
        <span className="pager__label">{t('shop.next')}</span> <Icon name="chevronRight" size={16} />
      </button>
    </nav>
  );
}
