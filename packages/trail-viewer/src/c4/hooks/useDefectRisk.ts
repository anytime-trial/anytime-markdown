import { useEffect, useRef, useState } from 'react';
import type { DefectRiskEntry } from '@anytime-markdown/trail-core';
import { fetchDefectRiskApi, type DefectRiskFetchParams } from './fetchDefectRiskApi';

export interface UseDefectRiskOptions extends DefectRiskFetchParams {
  enabled: boolean;
  serverUrl: string | undefined;
  debounceMs?: number;
}

export interface UseDefectRiskResult {
  entries: DefectRiskEntry[];
  loading: boolean;
  error: Error | null;
}

const DEFAULT_DEBOUNCE_MS = 300;

export function useDefectRisk(options: UseDefectRiskOptions): UseDefectRiskResult {
  const { enabled, serverUrl, windowDays, halfLifeDays, repo, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
  const [entries, setEntries] = useState<DefectRiskEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || serverUrl === undefined) {
      abortRef.current?.abort();
      setEntries([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchDefectRiskApi(serverUrl, { windowDays, halfLifeDays, repo }, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          setEntries(res.entries);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          const err = e instanceof Error ? e : new Error(String(e));
          if (err.name === 'AbortError') return;
          setError(err);
          setLoading(false);
        });
    }, debounceMs);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [enabled, serverUrl, windowDays, halfLifeDays, repo, debounceMs]);

  return { entries, loading, error };
}
