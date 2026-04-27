import { useCallback, useEffect, useState } from 'react';
import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';

export interface UseCodeGraphResult {
  graph: CodeGraph | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCodeGraph(serverUrl: string): UseCodeGraphResult {
  const [graph, setGraph] = useState<CodeGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/code-graph`);
      if (res.status === 404) {
        setGraph(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CodeGraph;
      setGraph(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  return { graph, loading, error, refetch: load };
}
