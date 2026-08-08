import { useEffect, useRef, useState } from 'react';

import type {
  ConfidenceCouplingEdge,
  TemporalCouplingEdge,
} from '@anytime-markdown/trail-activity';

import {
  fetchTemporalCouplingApi,
  type TemporalCouplingFetchParams,
  type TemporalCouplingGranularity,
} from './fetchTemporalCouplingApi';

export interface UseTemporalCouplingOptions extends TemporalCouplingFetchParams {
  enabled: boolean;
  serverUrl: string | undefined;
  debounceMs?: number;
}

export interface UseTemporalCouplingResult {
  edges: TemporalCouplingEdge[] | ConfidenceCouplingEdge[];
  directional: boolean;
  granularity: TemporalCouplingGranularity;
  loading: boolean;
  error: Error | null;
}

const DEFAULT_DEBOUNCE_MS = 300;

export function useTemporalCoupling(
  options: UseTemporalCouplingOptions,
): UseTemporalCouplingResult {
  const {
    enabled,
    serverUrl,
    repoName,
    windowDays,
    threshold,
    topK,
    minChange,
    directional,
    confidenceThreshold,
    directionalDiff,
    granularity,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  } = options;

  const [edges, setEdges] = useState<TemporalCouplingEdge[] | ConfidenceCouplingEdge[]>([]);
  const [directionalState, setDirectionalState] = useState(false);
  const [granularityState, setGranularityState] = useState<TemporalCouplingGranularity>(
    granularity ?? 'commit',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || serverUrl === undefined || !repoName) {
      abortRef.current?.abort();
      setEdges([]);
      setDirectionalState(false);
      setGranularityState(granularity ?? 'commit');
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
      fetchTemporalCouplingApi(
        serverUrl,
        {
          repoName,
          windowDays,
          threshold,
          topK,
          minChange,
          directional,
          confidenceThreshold,
          directionalDiff,
          granularity,
        },
        controller.signal,
      )
        .then((res) => {
          if (controller.signal.aborted) return;
          setEdges(res.edges);
          setDirectionalState(res.directional === true);
          setGranularityState(res.granularity ?? granularity ?? 'commit');
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
  }, [
    enabled,
    serverUrl,
    repoName,
    windowDays,
    threshold,
    topK,
    minChange,
    directional,
    confidenceThreshold,
    directionalDiff,
    granularity,
    debounceMs,
  ]);

  return {
    edges,
    directional: directionalState,
    granularity: granularityState,
    loading,
    error,
  };
}
