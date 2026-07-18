import type { BusFactorEntry, FileAuthorCommitRow } from '@anytime-markdown/trail-core';

export type BusFactorFetchParams = {
  windowDays?: number;
  minCommits?: number;
  repo?: string;
  /** C4 要素単位で再集計するための生行を要求する */
  includeRows?: boolean;
};

export type BusFactorResponse = {
  entries: BusFactorEntry[];
  computedAt: string;
  windowDays: number;
  minCommits: number;
  totalUnits: number;
  rows?: FileAuthorCommitRow[];
  rowsTruncated?: boolean;
};

export function buildBusFactorUrl(serverUrl: string, params: BusFactorFetchParams): string {
  const qs = new URLSearchParams();
  qs.set('windowDays', String(params.windowDays ?? 365));
  qs.set('minCommits', String(params.minCommits ?? 5));
  if (params.repo) qs.set('repo', params.repo);
  if (params.includeRows) qs.set('includeRows', '1');
  return `${serverUrl}/api/bus-factor?${qs.toString()}`;
}

export async function fetchBusFactorApi(
  serverUrl: string,
  params: BusFactorFetchParams,
  signal?: AbortSignal,
): Promise<BusFactorResponse> {
  const url = buildBusFactorUrl(serverUrl, params);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`bus-factor request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as BusFactorResponse;
}
