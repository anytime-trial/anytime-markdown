import { useCallback, useEffect, useState } from 'react';

import type { TrailRelease } from '@anytime-markdown/trail-activity/domain';
import type {
  DateRange,
  QualityMetrics,
  ReleaseQualityBucket,
} from '@anytime-markdown/trail-activity/domain/metrics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReleasesDataResult {
  readonly releases: readonly TrailRelease[];
  readonly fetchReleases: () => Promise<readonly TrailRelease[]>;
  readonly fetchQualityMetrics: (range: DateRange) => Promise<QualityMetrics | null>;
  readonly fetchDeploymentFrequency: (
    range: DateRange,
    bucket: 'day' | 'week',
  ) => Promise<ReadonlyArray<{ bucketStart: string; value: number }>>;
  readonly fetchReleaseQuality: (
    range: DateRange,
    bucket: 'day' | 'week',
  ) => Promise<ReadonlyArray<ReleaseQualityBucket>>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useReleasesData(serverUrl: string): ReleasesDataResult {
  const [releases, setReleases] = useState<readonly TrailRelease[]>([]);

  const baseUrl = serverUrl;

  const fetchReleases = useCallback(
    async (): Promise<readonly TrailRelease[]> => {
      try {
        const res = await fetch(`${baseUrl}/api/trail/releases`);
        if (!res.ok) return [];
        const data = (await res.json()) as readonly TrailRelease[];
        setReleases(data);
        return data;
      } catch {
        return [];
      }
    },
    [baseUrl],
  );

  const fetchQualityMetrics = useCallback(
    async (range: DateRange): Promise<QualityMetrics | null> => {
      const url = `${baseUrl}/api/trail/quality-metrics?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(`[fetchQualityMetrics] HTTP ${res.status}: ${body}`);
          return null;
        }
        return (await res.json()) as QualityMetrics;
      } catch (err) {
        console.error('[fetchQualityMetrics] request failed', err);
        return null;
      }
    },
    [baseUrl],
  );

  const fetchDeploymentFrequency = useCallback(
    async (
      range: DateRange,
      bucket: 'day' | 'week',
    ): Promise<ReadonlyArray<{ bucketStart: string; value: number }>> => {
      const url = `${baseUrl}/api/trail/deployment-frequency?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&bucket=${bucket}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(`[fetchDeploymentFrequency] HTTP ${res.status}: ${body}`);
          return [];
        }
        return (await res.json()) as ReadonlyArray<{ bucketStart: string; value: number }>;
      } catch (err) {
        console.error('[fetchDeploymentFrequency] request failed', err);
        return [];
      }
    },
    [baseUrl],
  );

  const fetchReleaseQuality = useCallback(
    async (
      range: DateRange,
      bucket: 'day' | 'week',
    ): Promise<ReadonlyArray<ReleaseQualityBucket>> => {
      const url = `${baseUrl}/api/trail/deployment-frequency-quality?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&bucket=${bucket}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(`[fetchReleaseQuality] HTTP ${res.status}: ${body}`);
          return [];
        }
        return (await res.json()) as ReadonlyArray<ReleaseQualityBucket>;
      } catch (err) {
        console.error('[fetchReleaseQuality] request failed', err);
        return [];
      }
    },
    [baseUrl],
  );

  // Initial fetch
  useEffect(() => {
    void fetchReleases();
  }, [fetchReleases]);

  return {
    releases,
    fetchReleases,
    fetchQualityMetrics,
    fetchDeploymentFrequency,
    fetchReleaseQuality,
  };
}
