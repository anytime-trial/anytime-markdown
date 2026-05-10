import type { FunctionRole } from '@anytime-markdown/trail-core/c4';

export interface FunctionAnalysisApiSignals {
  readonly fanInZero: boolean;
}

export interface FunctionAnalysisApiEntry {
  readonly filePath: string;
  readonly functionName: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly language: string;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly distinctCallees: number;
  readonly cognitiveComplexity: number;
  readonly dataMutationScore: number;
  readonly sideEffectScore: number;
  readonly lineCount: number;
  readonly importanceScore: number;
  readonly functionRole: FunctionRole;
  readonly signals: FunctionAnalysisApiSignals;
}

export interface FunctionAnalysisApiResponse {
  readonly entries: readonly FunctionAnalysisApiEntry[];
}

export function buildFunctionAnalysisUrl(serverUrl: string, repo: string, tag: string): string {
  const qs = new URLSearchParams({ repo, tag });
  return `${serverUrl}/api/c4/function-analysis?${qs.toString()}`;
}

export async function fetchFunctionAnalysis(
  serverUrl: string,
  repo: string,
  tag: string,
  signal?: AbortSignal,
): Promise<FunctionAnalysisApiResponse | null> {
  if (!repo) return null;
  const res = await fetch(buildFunctionAnalysisUrl(serverUrl, repo, tag), { signal });
  if (!res.ok) {
    if (res.status === 404 || res.status === 400) return null;
    throw new Error(`function-analysis request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as FunctionAnalysisApiResponse;
}
