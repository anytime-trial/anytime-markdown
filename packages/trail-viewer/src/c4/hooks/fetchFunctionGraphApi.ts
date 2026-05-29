// packages/trail-viewer/src/c4/hooks/fetchFunctionGraphApi.ts
import type { FunctionGraphResponse } from '@anytime-markdown/trail-core/c4';

export type { FunctionGraphResponse } from '@anytime-markdown/trail-core/c4';

export function buildFunctionGraphUrl(serverUrl: string, elementId: string): string {
  const qs = new URLSearchParams({ elementId });
  return `${serverUrl}/api/c4/function-graph?${qs.toString()}`;
}

export async function fetchFunctionGraph(
  serverUrl: string,
  elementId: string,
  signal?: AbortSignal,
): Promise<FunctionGraphResponse | null> {
  if (!elementId) return null;
  const res = await fetch(buildFunctionGraphUrl(serverUrl, elementId), { signal });
  if (!res.ok) {
    if (res.status === 404 || res.status === 400) return null;
    throw new Error(`function-graph request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as FunctionGraphResponse;
}
