import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useT } from '../i18n/index.tsx';
import { Icon } from './Icon.tsx';

/* ---------- Form fields: label + control + error, wired with aria-describedby ---------- */

type FieldBase = { label: string; error?: string; hint?: string; optional?: boolean };

export function TextField({ label, error, hint, optional, className = '', ...rest }: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const t = useT();
  const desc = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      <label htmlFor={id} className="field__label">
        {label}
        {optional && <span className="field__opt"> · {t('common.optional')}</span>}
      </label>
      <input id={id} className="input" aria-invalid={!!error || undefined} aria-describedby={desc} {...rest} />
      {hint && !error && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field__error">
          <Icon name="alert" size={14} /> {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField(props: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  const t = useT();
  const id = useId();
  const { label, error, hint, className = '', ...rest } = props;
  const desc = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className="input-wrap">
        <input id={id} type={show ? 'text' : 'password'} className="input" aria-invalid={!!error || undefined} aria-describedby={desc} {...rest} />
        <button type="button" className="input-wrap__btn" onClick={() => setShow((s) => !s)} aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')} aria-pressed={show}>
          <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
        </button>
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field__error">
          <Icon name="alert" size={14} /> {error}
        </p>
      )}
    </div>
  );
}

export function TextArea({ label, error, hint, optional, className = '', ...rest }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const t = useT();
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      <label htmlFor={id} className="field__label">
        {label}
        {optional && <span className="field__opt"> · {t('common.optional')}</span>}
      </label>
      <textarea id={id} className="input textarea" aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} {...rest} />
      {hint && !error && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field__error">
          <Icon name="alert" size={14} /> {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({ label, error, hint, className = '', children, ...rest }: FieldBase & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const id = useId();
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className="select-wrap">
        <select id={id} className="input select" aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-err` : undefined} {...rest}>
          {children}
        </select>
        <Icon name="chevronDown" size={16} className="select-wrap__icon" />
      </div>
      {hint && !error && <p className="field__hint">{hint}</p>}
      {error && (
        <p id={`${id}-err`} className="field__error">
          <Icon name="alert" size={14} /> {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, error, className = '', ...rest }: { label: ReactNode; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={`check ${error ? 'field--error' : ''} ${className}`}>
      <input id={id} type="checkbox" className="check__box" aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-err` : undefined} {...rest} />
      <label htmlFor={id} className="check__label">
        {label}
      </label>
      {error && (
        <p id={`${id}-err`} className="field__error check__error">
          <Icon name="alert" size={14} /> {error}
        </p>
      )}
    </div>
  );
}

export function FormAlert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info' | 'warning'; children: ReactNode }) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={tone === 'success' ? 'check' : tone === 'info' ? 'info' : 'alert'} size={18} />
      <div>{children}</div>
    </div>
  );
}

/* ---------- Feedback states ---------- */

export function LoadingState({ label, rows = 0 }: { label?: string; rows?: number }) {
  const t = useT();
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label ?? t('a11y.loading')}</span>
      {rows > 0 && (
        <div className="skeleton-grid" aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton skeleton--img" />
              <div className="skeleton skeleton--line" />
              <div className="skeleton skeleton--line skeleton--short" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon = 'box', title, body, action }: { icon?: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state state--empty">
      <span className="state__icon">
        <Icon name={icon} size={28} />
      </span>
      <h2 className="state__title">{title}</h2>
      {body && <p className="state__body">{body}</p>}
      {action && <div className="state__action">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, body, onRetry }: { title?: string; body?: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="state state--error" role="alert">
      <span className="state__icon">
        <Icon name="alert" size={28} />
      </span>
      <h2 className="state__title">{title ?? t('common.error')}</h2>
      <p className="state__body">{body ?? t('common.errorBody')}</p>
      {onRetry && (
        <button className="btn btn--outline" onClick={onRetry}>
          <Icon name="refresh" size={16} /> {t('common.retry')}
        </button>
      )}
    </div>
  );
}

/* ---------- Dialog / drawer with focus trap, Esc, and focus return ---------- */

export function Dialog({ open, onClose, title, children, variant = 'modal', footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; variant?: 'modal' | 'drawer-left' | 'drawer-right'; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'));
    (focusables()[1] ?? focusables()[0] ?? node).focus();
    document.body.classList.add('no-scroll');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      prev?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className={`overlay overlay--${variant}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`dialog dialog--${variant}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="dialog__head">
          <h2 id={titleId} className="dialog__title">
            {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('a11y.close')}>
            <Icon name="close" />
          </button>
        </div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmationDialog({ open, title, body, confirmLabel, tone = 'default', onConfirm, onCancel, busy, children }: { open: boolean; title: string; body?: ReactNode; confirmLabel?: string; tone?: 'default' | 'danger'; onConfirm: () => void; onCancel: () => void; busy?: boolean; children?: ReactNode }) {
  const t = useT();
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button className={`btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {confirmLabel ?? t('common.confirm')}
          </button>
        </>
      }
    >
      {body && <p>{body}</p>}
      {children}
    </Dialog>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'info' | 'navy'; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
