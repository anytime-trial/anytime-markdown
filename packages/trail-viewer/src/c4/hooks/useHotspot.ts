import { useEffect, useRef, useState } from 'react';

import { fetchHotspotApi, type HotspotFetchParams, type HotspotResponse } from './fetchHotspotApi';

export interface UseHotspotOptions extends HotspotFetchParams {
  enabled: boolean;
  serverUrl: string | undefined;
  debounceMs?: number;
}

export interface UseHotspotResult {
  data: HotspotResponse | null;
  loading: boolean;
  error: Error | null;
}

const DEFAULT_DEBOUNCE_MS = 300;

export function useHotspot(options: UseHotspotOptions): UseHotspotResult {
  const { enabled, serverUrl, period, granularity, repo, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
  const [data, setData] = useState<HotspotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || serverUrl === undefined) {
      abortRef.current?.abort();
      setData(null);
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
      fetchHotspotApi(serverUrl, { period, granularity, repo }, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          setData(res);
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
  }, [enabled, serverUrl, period, granularity, repo, debounceMs]);

  return { data, loading, error };
}
