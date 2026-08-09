import type { ExportedSymbol } from '@anytime-markdown/trail-activity/analyzer';

export interface ElementFunctionsResponse {
  readonly symbols: ExportedSymbol[];
}

export async function fetchElementFunctionsApi(
  serverUrl: string,
  elementId: string,
  signal?: AbortSignal,
): Promise<ElementFunctionsResponse> {
  const url = `${serverUrl}/api/c4/functions?elementId=${encodeURIComponent(elementId)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`element-functions request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ElementFunctionsResponse;
}
