import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, isAbort } from './api.ts';

/** GET a JSON endpoint with loading / error / reload states. Pass null to skip. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const [tick, setTick] = useState(0);
  const first = useRef(true);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    api<T>(path, { signal: ctrl.signal })
      .then((d) => {
        setData(d);
        setLoading(false);
        first.current = false;
      })
      .catch((e) => {
        if (isAbort(e)) return;
        setError(e instanceof ApiError ? e : new ApiError(0, null));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [path, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}
