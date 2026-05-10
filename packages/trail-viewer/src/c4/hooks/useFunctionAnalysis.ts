import { useEffect, useState } from 'react';

import type { FunctionAnalysisApiEntry } from './fetchFunctionAnalysisApi';
import { fetchFunctionAnalysis } from './fetchFunctionAnalysisApi';

export interface UseFunctionAnalysisResult {
  readonly entries: readonly FunctionAnalysisApiEntry[] | null;
  readonly loading: boolean;
  readonly error: Error | null;
}

export function useFunctionAnalysis(
  serverUrl: string,
  repoName: string,
  tag: string,
): UseFunctionAnalysisResult {
  const [entries, setEntries] = useState<readonly FunctionAnalysisApiEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!repoName) {
      setEntries(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetchFunctionAnalysis(serverUrl, repoName, tag, ctrl.signal);
        setEntries(res?.entries ?? null);
      } catch (err) {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setEntries(null);
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [serverUrl, repoName, tag]);

  return { entries, loading, error };
}
