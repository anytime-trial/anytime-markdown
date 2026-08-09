import type { DefectRiskEntry } from '@anytime-markdown/trail-activity';

export type DefectRiskFetchParams = {
  windowDays?: number;
  halfLifeDays?: number;
  repo?: string;
};

export type DefectRiskResponse = {
  entries: DefectRiskEntry[];
  computedAt: string;
  windowDays: number;
  halfLifeDays: number;
  totalFiles: number;
};

export function buildDefectRiskUrl(serverUrl: string, params: DefectRiskFetchParams): string {
  const qs = new URLSearchParams();
  qs.set('windowDays', String(params.windowDays ?? 90));
  qs.set('halfLifeDays', String(params.halfLifeDays ?? 90));
  if (params.repo) qs.set('repo', params.repo);
  return `${serverUrl}/api/defect-risk?${qs.toString()}`;
}

export async function fetchDefectRiskApi(
  serverUrl: string,
  params: DefectRiskFetchParams,
  signal?: AbortSignal,
): Promise<DefectRiskResponse> {
  const url = buildDefectRiskUrl(serverUrl, params);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`defect-risk request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as DefectRiskResponse;
}
