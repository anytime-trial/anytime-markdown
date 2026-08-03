import type { AuthorHeatmapEntry } from '@anytime-markdown/trail-core/authorHeatmap';

export interface AuthorHeatmapFetchParams {
  readonly repo: string;
  /** 固有色を割り当てる上位セッション数（サーバー側で 1〜32 にクランプ） */
  readonly topSessions?: number;
}

export interface AuthorHeatmapResponse {
  readonly entries: readonly AuthorHeatmapEntry[];
  readonly topSessions: readonly string[];
  /** 集計に現れたノード数（分子） */
  readonly coveredNodes: number;
  /** コードグラフの総ノード数（分母）。0 ならグラフ未生成 */
  readonly totalNodes: number;
  readonly computedAt: string;
}

export function buildAuthorHeatmapUrl(serverUrl: string, params: AuthorHeatmapFetchParams): string {
  const qs = new URLSearchParams();
  qs.set('repo', params.repo);
  if (params.topSessions !== undefined) qs.set('topSessions', String(params.topSessions));
  return `${serverUrl}/api/author-heatmap?${qs.toString()}`;
}

export async function fetchAuthorHeatmapApi(
  serverUrl: string,
  params: AuthorHeatmapFetchParams,
  signal?: AbortSignal,
): Promise<AuthorHeatmapResponse> {
  const res = await fetch(buildAuthorHeatmapUrl(serverUrl, params), { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as AuthorHeatmapResponse;
}
