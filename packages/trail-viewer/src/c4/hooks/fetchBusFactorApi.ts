import type { BusFactorEntry } from '@anytime-markdown/trail-core';

export type BusFactorFetchParams = {
  windowDays?: number;
  minCommits?: number;
  repo?: string;
  /** 集約単位。'c4' はサーバー側で C4 要素単位まで集約した結果を返す */
  unit?: 'file' | 'c4';
  /** unit='c4' のとき、要素 ID を揃えるために表示中のリリースを指定する */
  release?: string;
};

export type BusFactorResponse = {
  entries: BusFactorEntry[];
  computedAt: string;
  windowDays: number;
  minCommits: number;
  unit: 'file' | 'c4';
  totalUnits: number;
  /** unit='c4' のときのみ返る。false なら C4 モデルが無く集約できていない */
  c4ModelAvailable?: boolean;
};

export function buildBusFactorUrl(serverUrl: string, params: BusFactorFetchParams): string {
  const qs = new URLSearchParams();
  qs.set('windowDays', String(params.windowDays ?? 365));
  qs.set('minCommits', String(params.minCommits ?? 5));
  if (params.repo) qs.set('repo', params.repo);
  if (params.unit) qs.set('unit', params.unit);
  if (params.release) qs.set('release', params.release);
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
