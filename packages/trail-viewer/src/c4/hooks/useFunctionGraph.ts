// packages/trail-viewer/src/c4/hooks/useFunctionGraph.ts
import { useEffect, useState } from 'react';
import type { FunctionGraphResponse } from './fetchFunctionGraphApi';
import { fetchFunctionGraph } from './fetchFunctionGraphApi';

export interface UseFunctionGraphResult {
  readonly data: FunctionGraphResponse | null;
  readonly loading: boolean;
  readonly error: Error | null;
}

export function useFunctionGraph(
  serverUrl: string,
  elementId: string,
): UseFunctionGraphResult {
  const [data, setData] = useState<FunctionGraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!elementId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetchFunctionGraph(serverUrl, elementId, ctrl.signal);
        setData(res);
      } catch (err) {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        console.warn('[useFunctionGraph]', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [serverUrl, elementId]);

  return { data, loading, error };
}
