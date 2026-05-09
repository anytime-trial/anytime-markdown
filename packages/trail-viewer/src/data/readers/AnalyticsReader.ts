import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnalyticsData } from '@anytime-markdown/trail-core/domain';

export class AnalyticsReader {
  constructor(private readonly client: SupabaseClient) {}

  async getAnalytics(): Promise<AnalyticsData | null> {
    const allSessions: Array<{ id: string; start_time?: string; end_time?: string }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: batch, error } = await this.client
        .from('trail_sessions')
        .select('id,start_time,end_time')
        .range(offset, offset + 999);
      if (error) return null;
      if (!batch || batch.length === 0) break;
      allSessions.push(...(batch as typeof allSessions));
      if (batch.length < 1000) break;
    }
    if (allSessions.length === 0) return null;
    const sessions = allSessions;

    const allCommits: Array<{ repo_name?: string; committed_at?: string; lines_added: number; lines_deleted: number; files_changed: number; is_ai_assisted: number }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: batch } = await this.client
        .from('trail_session_commits')
        .select('repo_name,committed_at,lines_added,lines_deleted,files_changed,is_ai_assisted')
        .order('committed_at', { ascending: true })
        .range(offset, offset + 999);
      if (!batch || batch.length === 0) break;
      allCommits.push(...(batch as typeof allCommits));
      if (batch.length < 1000) break;
    }

    // Build start_time lookup map from sessions
    const startBySessionId = new Map<string, string>();
    for (const s of sessions as Array<{ id: string; start_time?: string }>) {
      if (s.start_time) startBySessionId.set(s.id, s.start_time);
    }

    let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreation = 0;
    let totalEstimatedCost = 0;
    type DailyEntry = { sessions: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; estimatedCostUsd: number; commits: number; linesAdded: number; linesDeleted: number };
    const dailyMap = new Map<string, DailyEntry>();

    if (sessions.length > 0) {
      const getIanaOffsetMs = (timeZone: string, at: Date): number => {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at);
        const label = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
        const match = /^GMT([+-])(\d{1,2}):(\d{2})$/.exec(label);
        if (!match) return 0;
        return (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
      };
      const toJSTDate = (isoStr: string): string => {
        const ms = new Date(isoStr).getTime();
        const jstMs = ms + getIanaOffsetMs('Asia/Tokyo', new Date(ms));
        const d = new Date(jstMs);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      };

      for (const s of sessions as Array<{ id: string; start_time?: string }>) {
        if (s.start_time) {
          const date = toJSTDate(s.start_time);
          const entry = dailyMap.get(date) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estimatedCostUsd: 0, commits: 0, linesAdded: 0, linesDeleted: 0 };
          entry.sessions += 1;
          dailyMap.set(date, entry);
        }
      }

      for (const c of allCommits) {
        if (c.committed_at) {
          const date = toJSTDate(c.committed_at);
          const entry = dailyMap.get(date) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estimatedCostUsd: 0, commits: 0, linesAdded: 0, linesDeleted: 0 };
          entry.commits += 1;
          entry.linesAdded += c.lines_added;
          entry.linesDeleted += c.lines_deleted;
          dailyMap.set(date, entry);
        }
      }

      // Fetch session costs (no date limit — all sessions are synced).
      // trail_messages is limited to 7 days for privacy; trail_session_costs has no such limit
      // and already contains per-session token totals, so use it for the token chart.
      const allSessionCostRows: Array<{ session_id: string; input_tokens: number | null; output_tokens: number | null; cache_read_tokens: number | null; cache_creation_tokens: number | null; estimated_cost_usd: number | null }> = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: batchRows } = await this.client
          .from('trail_session_costs')
          .select('session_id,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,estimated_cost_usd')
          .range(offset, offset + 999);
        if (!batchRows || batchRows.length === 0) break;
        allSessionCostRows.push(...(batchRows as typeof allSessionCostRows));
        if (batchRows.length < 1000) break;
      }

      for (const c of allSessionCostRows) {
        const inp = c.input_tokens ?? 0;
        const out = c.output_tokens ?? 0;
        const crd = c.cache_read_tokens ?? 0;
        const ccr = c.cache_creation_tokens ?? 0;
        const cost = c.estimated_cost_usd ?? 0;

        totalInput += inp;
        totalOutput += out;
        totalCacheRead += crd;
        totalCacheCreation += ccr;
        totalEstimatedCost += cost;

        const start = startBySessionId.get(c.session_id);
        if (start) {
          const date = toJSTDate(start);
          const entry = dailyMap.get(date) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estimatedCostUsd: 0, commits: 0, linesAdded: 0, linesDeleted: 0 };
          entry.inputTokens += inp;
          entry.outputTokens += out;
          entry.cacheReadTokens += crd;
          entry.cacheCreationTokens += ccr;
          entry.estimatedCostUsd += cost;
          dailyMap.set(date, entry);
        }
      }
    }

    const dailyActivity = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    // Fetch current total LOC from current_coverage
    const { data: locData } = await this.client
      .from('trail_current_coverage')
      .select('lines_total');
    const totalLoc = (locData ?? []).reduce((s, r) => s + (r.lines_total ?? 0), 0);

    const totals = {
      sessions: sessions.length,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheCreationTokens: totalCacheCreation,
      estimatedCostUsd: totalEstimatedCost,
      totalCommits: allCommits.length,
      totalLinesAdded: allCommits.reduce((s, c) => s + c.lines_added, 0),
      totalLinesDeleted: allCommits.reduce((s, c) => s + c.lines_deleted, 0),
      totalFilesChanged: allCommits.reduce((s, c) => s + c.files_changed, 0),
      totalAiAssistedCommits: allCommits.filter((c) => c.is_ai_assisted === 1).length,
      totalSessionDurationMs: sessions.reduce((s, r) => {
        if (!r.start_time || !r.end_time) return s;
        const start = new Date(r.start_time).getTime();
        const end = new Date(r.end_time).getTime();
        return s + (Number.isFinite(end - start) ? end - start : 0);
      }, 0),
      totalLoc,
      totalRetries: 0,
      totalEdits: 0,
      totalBuildRuns: 0,
      totalBuildFails: 0,
      totalTestRuns: 0,
      totalTestFails: 0,
    };

    return { totals, toolUsage: [], dailyActivity };
  }
}
