import type {
  MemoryBugHistoryRow,
  MemoryDriftEventDetail,
  MemoryDriftEventRow,
  MemoryFailedItemRow,
  MemoryInvalidationRow,
  MemoryPipelineRunRow,
  MemoryRecurringBugRow,
  MemoryReviewHistoryRow,
  MemoryTopEntityRow,
  MemoryUnaddressedReviewFindingRow,
} from '../types';

export class MemoryReader {
  constructor(private readonly serverUrl: string) {}

  async probe(): Promise<boolean> {
    try {
      const res = await fetch(`${this.serverUrl}/api/memory/status`);
      if (!res.ok) return false;
      const body = await res.json() as { exists: boolean };
      return body.exists === true;
    } catch {
      return false;
    }
  }

  async listDriftEvents(params: {
    unresolvedOnly?: boolean;
    severity?: string;
    driftType?: string;
    since?: string;
    limit?: number;
  } = {}): Promise<readonly MemoryDriftEventRow[]> {
    const q = new URLSearchParams();
    if (params.unresolvedOnly !== undefined) q.set('unresolvedOnly', String(params.unresolvedOnly));
    if (params.severity) q.set('severity', params.severity);
    if (params.driftType) q.set('driftType', params.driftType);
    if (params.since) q.set('since', params.since);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<MemoryDriftEventRow[]>(`/api/memory/drift/events?${q}`);
  }

  async getDriftEventDetail(eventId: string): Promise<MemoryDriftEventDetail | null> {
    try {
      const res = await fetch(`${this.serverUrl}/api/memory/drift/events/${encodeURIComponent(eventId)}`);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return await res.json() as MemoryDriftEventDetail;
    } catch {
      return null;
    }
  }

  async resolveDriftEvent(eventId: string, resolutionNote: string): Promise<{ ok: boolean }> {
    try {
      const res = await fetch(
        `${this.serverUrl}/api/memory/drift/events/${encodeURIComponent(eventId)}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolutionNote }),
        },
      );
      if (!res.ok) return { ok: false };
      return await res.json() as { ok: boolean };
    } catch {
      return { ok: false };
    }
  }

  async listRecurringBugs(params: {
    pkg?: string;
    windowDays?: number;
    limit?: number;
  } = {}): Promise<readonly MemoryRecurringBugRow[]> {
    const q = new URLSearchParams();
    if (params.pkg) q.set('pkg', params.pkg);
    if (params.windowDays !== undefined) q.set('windowDays', String(params.windowDays));
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<MemoryRecurringBugRow[]>(`/api/memory/bugs/recurring?${q}`);
  }

  async getBugHistory(params: {
    pkg?: string;
    filePath?: string;
    category?: string;
    limit?: number;
  } = {}): Promise<readonly MemoryBugHistoryRow[]> {
    const q = new URLSearchParams();
    if (params.pkg) q.set('pkg', params.pkg);
    if (params.filePath) q.set('filePath', params.filePath);
    if (params.category) q.set('category', params.category);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<MemoryBugHistoryRow[]>(`/api/memory/bugs/history?${q}`);
  }

  async listUnaddressedReviewFindings(params: {
    category?: string;
    severity?: string;
    daysSinceMin?: number;
    limit?: number;
  } = {}): Promise<readonly MemoryUnaddressedReviewFindingRow[]> {
    const q = new URLSearchParams();
    if (params.category) q.set('category', params.category);
    if (params.severity) q.set('severity', params.severity);
    if (params.daysSinceMin !== undefined) q.set('daysSinceMin', String(params.daysSinceMin));
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<MemoryUnaddressedReviewFindingRow[]>(`/api/memory/reviews/unaddressed?${q}`);
  }

  async getReviewHistory(params: {
    targetFilePath?: string;
    pkg?: string;
    limit?: number;
  } = {}): Promise<readonly MemoryReviewHistoryRow[]> {
    const q = new URLSearchParams();
    if (params.targetFilePath) q.set('targetFilePath', params.targetFilePath);
    if (params.pkg) q.set('pkg', params.pkg);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<MemoryReviewHistoryRow[]>(`/api/memory/reviews/history?${q}`);
  }

  async listPipelineRuns(params: {
    scope?: string;
    status?: string;
    since?: string;
    limit?: number;
  } = {}): Promise<readonly MemoryPipelineRunRow[]> {
    const q = new URLSearchParams();
    if (params.scope) q.set('scope', params.scope);
    if (params.status) q.set('status', params.status);
    if (params.since) q.set('since', params.since);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<MemoryPipelineRunRow[]>(`/api/memory/pipeline/runs?${q}`);
  }

  async listFailedItems(params: {
    scope?: string;
    limit?: number;
  } = {}): Promise<readonly MemoryFailedItemRow[]> {
    const q = new URLSearchParams();
    if (params.scope) q.set('scope', params.scope);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<MemoryFailedItemRow[]>(`/api/memory/pipeline/failed?${q}`);
  }

  async listTopEntities(params: {
    type?: string;
    limit?: number;
  } = {}): Promise<readonly MemoryTopEntityRow[]> {
    const q = new URLSearchParams();
    if (params.type) q.set('type', params.type);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<MemoryTopEntityRow[]>(`/api/memory/entities/top?${q}`);
  }

  async listInvalidations(params: {
    since?: string;
    limit?: number;
  } = {}): Promise<readonly MemoryInvalidationRow[]> {
    const q = new URLSearchParams();
    if (params.since) q.set('since', params.since);
    if (params.limit !== undefined) q.set('limit', String(params.limit));
    return this.fetchJson<MemoryInvalidationRow[]>(`/api/memory/edges/invalidations?${q}`);
  }

  private async fetchJson<T>(path: string): Promise<T> {
    try {
      const res = await fetch(`${this.serverUrl}${path}`);
      if (!res.ok) return [] as unknown as T;
      return await res.json() as T;
    } catch {
      return [] as unknown as T;
    }
  }
}
