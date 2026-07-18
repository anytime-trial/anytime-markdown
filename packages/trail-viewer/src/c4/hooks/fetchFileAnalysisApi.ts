import type { CentralityMatrix, ImportanceMatrix, RoleMatrix } from '@anytime-markdown/trail-core/c4';

export interface DeadCodeSignalsApi {
  readonly orphan: boolean;
  readonly fanInZero: boolean;
  readonly noRecentChurn: boolean;
  readonly zeroCoverage: boolean;
  readonly isolatedCommunity: boolean;
}

export interface FileAnalysisApiEntry {
  readonly filePath: string;
  readonly importanceScore: number;
  readonly fanInTotal: number;
  readonly cognitiveComplexityMax: number;
  readonly lineCount: number;
  readonly functionCount: number;
  readonly deadCodeScore: number;
  readonly signals: DeadCodeSignalsApi;
  readonly isIgnored: boolean;
  readonly ignoreReason: string;
  readonly centralityScore: number;
  readonly crossPkgInCount: number;
  readonly externalConsumerPkgs: number;
  readonly isBarrel: boolean;
  /** UI / Logic 分類。サーバー旧版が返さない場合に備え、消費側で 'logic' へ
   *  フォールバックすること */
  readonly category?: 'ui' | 'logic' | 'excluded';
  /** Phase 6 S5-D: 最近になって動き始めたコードか。旧サーバーは返さないため optional */
  readonly newlyActive?: boolean;
}

export interface FileAnalysisApiResponse {
  readonly entries: readonly FileAnalysisApiEntry[];
  readonly elementMatrix: {
    readonly importance: ImportanceMatrix;
    readonly deadCodeScore: Record<string, number>;
    readonly centrality: CentralityMatrix;
    readonly functionRoles: RoleMatrix;
  };
}

export function buildFileAnalysisUrl(serverUrl: string, repo: string, tag: string): string {
  const qs = new URLSearchParams({ repo, tag });
  return `${serverUrl}/api/c4/file-analysis?${qs.toString()}`;
}

export async function fetchFileAnalysis(
  serverUrl: string,
  repo: string,
  tag: string,
  signal?: AbortSignal,
): Promise<FileAnalysisApiResponse | null> {
  if (!repo) return null;
  const res = await fetch(buildFileAnalysisUrl(serverUrl, repo, tag), { signal });
  if (!res.ok) {
    if (res.status === 404 || res.status === 400) return null;
    throw new Error(`file-analysis request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as FileAnalysisApiResponse;
}
