import type {
  ConfidenceCouplingEdge,
  TemporalCouplingEdge,
} from '@anytime-markdown/trail-activity';

export type TemporalCouplingGranularity = 'commit' | 'session' | 'subagentType';

export type TemporalCouplingResponse =
  | {
      directional?: false;
      granularity?: TemporalCouplingGranularity;
      edges: TemporalCouplingEdge[];
      computedAt: string;
      windowDays: number;
      totalPairs: number;
    }
  | {
      directional: true;
      granularity?: TemporalCouplingGranularity;
      edges: ConfidenceCouplingEdge[];
      computedAt: string;
      windowDays: number;
      totalPairs: number;
    };

export type TemporalCouplingFetchParams = {
  repoName: string;
  windowDays: number;
  threshold: number;
  topK: number;
  minChange?: number;
  directional?: boolean;
  confidenceThreshold?: number;
  directionalDiff?: number;
  granularity?: TemporalCouplingGranularity;
};

export function buildTemporalCouplingUrl(
  serverUrl: string,
  params: TemporalCouplingFetchParams,
): string {
  const qs = new URLSearchParams();
  qs.set('repo', params.repoName);
  qs.set('windowDays', String(params.windowDays));
  qs.set('threshold', String(params.threshold));
  qs.set('topK', String(params.topK));
  if (params.minChange !== undefined) qs.set('minChange', String(params.minChange));
  if (params.granularity !== undefined) qs.set('granularity', params.granularity);
  if (params.directional) {
    qs.set('directional', 'true');
    if (params.confidenceThreshold !== undefined) {
      qs.set('confidenceThreshold', String(params.confidenceThreshold));
    }
    if (params.directionalDiff !== undefined) {
      qs.set('directionalDiff', String(params.directionalDiff));
    }
  }
  return `${serverUrl}/api/temporal-coupling?${qs.toString()}`;
}

export async function fetchTemporalCouplingApi(
  serverUrl: string,
  params: TemporalCouplingFetchParams,
  signal?: AbortSignal,
): Promise<TemporalCouplingResponse> {
  const url = buildTemporalCouplingUrl(serverUrl, params);
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`temporal-coupling request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as TemporalCouplingResponse;
}
