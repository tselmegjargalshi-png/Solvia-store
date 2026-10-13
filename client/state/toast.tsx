import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon.tsx';

type Toast = { id: number; title: string; body?: string; tone?: 'success' | 'error' | 'info'; action?: { label: string; href: string } };
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

let nextId = 1;

/** Non-blocking notifications announced to screen readers via a polite live region. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((ts) => ts.filter((x) => x.id !== id));
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId++;
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    setTimeout(() => dismiss(id), t.tone === 'error' ? 7000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone ?? 'info'}`}>
            <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'info'} />
            <div className="toast__text">
              <strong>{t.title}</strong>
              {t.body && <span>{t.body}</span>}
              {t.action && (
                <a href={t.action.href} className="toast__action" onClick={(e) => {
                  e.preventDefault();
                  dismiss(t.id);
                  import('../router.tsx').then((m) => m.navigate(t.action!.href));
                }}>
                  {t.action.label}
                </a>
              )}
            </div>
            <button className="icon-btn icon-btn--sm" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
