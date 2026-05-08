import type { FileHotspotRow, HotspotGranularity, TrendPeriod } from '@anytime-markdown/trail-core/c4';

export interface HotspotFetchParams {
  readonly period: TrendPeriod;
  readonly granularity: HotspotGranularity;
  readonly repo?: string;
}

export interface HotspotResponse {
  readonly period: TrendPeriod;
  readonly granularity: HotspotGranularity;
  readonly from: string;
  readonly to: string;
  readonly files: readonly FileHotspotRow[];
}

export function buildHotspotUrl(serverUrl: string, params: HotspotFetchParams): string {
  const qs = new URLSearchParams();
  qs.set('period', params.period);
  qs.set('granularity', params.granularity);
  if (params.repo) qs.set('repo', params.repo);
  return `${serverUrl}/api/hotspot?${qs.toString()}`;
}

export async function fetchHotspotApi(
  serverUrl: string,
  params: HotspotFetchParams,
  signal?: AbortSignal,
): Promise<HotspotResponse> {
  const url = buildHotspotUrl(serverUrl, params);
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`hotspot request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as HotspotResponse;
}
