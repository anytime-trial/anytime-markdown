import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TrailFilter,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
} from '../../domain/parser/types';
import {
  toTrailMessage,
  toTrailSession,
} from '../../domain/analytics/mappers';
import type {
  SessionDbRow,
  MessageDbRow,
  CommitDbRow,
} from '../types';

// egress 対策: 一覧は直近分のみ取得する（全件 select は蓄積とともに転送量が単調増加する）。
// これより古いセッションは一覧・クライアント側フィルタの対象外になる。
const SESSION_FETCH_LIMIT = 200;

export class SessionReader {
  constructor(private readonly client: SupabaseClient) {}

  async getSessions(filters?: TrailFilter): Promise<readonly TrailSession[]> {
    let query = this.client
      .from('trail_sessions')
      // repo_id 正規化後: repo_name は trail_repos を FK 埋め込みして復元する (下で row に flatten)。
      .select('*, repo:trail_repos!repo_id(repo_name), trail_session_costs(*)')
      .order('start_time', { ascending: false })
      .limit(SESSION_FETCH_LIMIT);

    if (filters?.model) {
      query = query.eq('model', filters.model);
    }
    if (filters?.dateRange) {
      query = query.gte('start_time', filters.dateRange.from).lte('start_time', filters.dateRange.to);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase getSessions failed: ${error.message}`);

    // 埋め込んだ trail_repos.repo_name を行へ flatten し、下流 (mapper / codex 照合) を不変に保つ。
    const sessions = ((data ?? []) as Array<SessionDbRow & { repo?: { repo_name: string } | null }>)
      .map((r) => ({ ...r, repo_name: r.repo?.repo_name ?? r.repo_name ?? '' })) as readonly SessionDbRow[];
    const sessionById = new Map(sessions.map((s) => [s.id, s] as const));
    const sessionIds = sessions.map((s) => s.id);
    const linkedCodexByParent = await this.fetchLinkedCodexSessionIdsByParent(sessions);
    const consumedCodexIds = new Set<string>();
    for (const ids of linkedCodexByParent.values()) {
      for (const id of ids) consumedCodexIds.add(id);
    }

    const visibleSessions = sessions.filter((s) => !(s.source === 'codex' && consumedCodexIds.has(s.id)));
    return visibleSessions.map((r) => {
      const linkedIds = linkedCodexByParent.get(r.id) ?? new Set<string>();
      let linkedMessageCount = 0;
      let linkedInput = 0;
      let linkedOutput = 0;
      let linkedCacheRead = 0;
      let linkedCacheCreation = 0;
      let linkedCost = 0;
      for (const linkedId of linkedIds) {
        const linked = sessionById.get(linkedId);
        if (!linked) continue;
        linkedMessageCount += linked.message_count ?? 0;
        for (const c of linked.trail_session_costs ?? []) {
          linkedInput += c.input_tokens;
          linkedOutput += c.output_tokens;
          linkedCacheRead += c.cache_read_tokens;
          linkedCacheCreation += c.cache_creation_tokens;
          linkedCost += c.estimated_cost_usd;
        }
      }
      const base = toTrailSession(r, []);
      return {
        ...base,
        messageCount: base.messageCount + linkedMessageCount,
        usage: {
          inputTokens: base.usage.inputTokens + linkedInput,
          outputTokens: base.usage.outputTokens + linkedOutput,
          cacheReadTokens: base.usage.cacheReadTokens + linkedCacheRead,
          cacheCreationTokens: base.usage.cacheCreationTokens + linkedCacheCreation,
        },
        estimatedCostUsd: (base.estimatedCostUsd ?? 0) + linkedCost,
      };
    });
  }

  async getMessages(sessionId: string): Promise<readonly TrailMessage[]> {
    const { data, error } = await this.client
      .from('trail_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });
    if (error) throw new Error(`Supabase getMessages failed: ${error.message}`);
    return (data ?? []).map((r: MessageDbRow) => toTrailMessage(r));
  }

  async getSessionCommits(sessionId: string): Promise<readonly TrailSessionCommit[]> {
    const { data, error } = await this.client
      .from('trail_session_commits')
      .select('*, repo:trail_repos!repo_id(repo_name)')
      .eq('session_id', sessionId);
    if (error) throw new Error(`Supabase getSessionCommits failed: ${error.message}`);
    return (data ?? []).map((r: CommitDbRow & { repo?: { repo_name: string } | null }) => ({
      commitHash: r.commit_hash,
      commitMessage: r.commit_message,
      author: r.author,
      committedAt: r.committed_at,
      isAiAssisted: r.is_ai_assisted === 1,
      filesChanged: r.files_changed,
      linesAdded: r.lines_added,
      linesDeleted: r.lines_deleted,
      repoName: r.repo?.repo_name ?? r.repo_name ?? '',
    }));
  }

  async searchMessages(query: string): Promise<readonly { sessionId: string; uuid: string; snippet: string }[]> {
    const { data, error } = await this.client
      .from('trail_messages')
      .select('uuid, session_id, text_content')
      .ilike('text_content', `%${query}%`)
      .limit(100);
    if (error) return [];
    return (data ?? []).map((r: { uuid: string; session_id: string; text_content: string | null }) => ({
      sessionId: r.session_id,
      uuid: r.uuid,
      snippet: (r.text_content ?? '').slice(0, 200),
    }));
  }

  private async fetchLinkedCodexSessionIdsByParent(
    sessions: readonly SessionDbRow[],
  ): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>();
    const parentSessions = sessions.filter((s) => s.source !== 'codex');
    if (parentSessions.length === 0) return out;

    const parentIds = parentSessions.map((s) => s.id);
    const allMarkerRows: Array<{ session_id: string; source_tool_assistant_uuid: string | null; timestamp: string | null }> = [];
    const BATCH = 200;
    for (let i = 0; i < parentIds.length; i += BATCH) {
      const batchIds = parentIds.slice(i, i + BATCH);
      const { data: batchRows, error: markerErr } = await this.client
        .from('trail_messages')
        .select('session_id, source_tool_assistant_uuid, timestamp')
        .in('session_id', batchIds as string[])
        .not('source_tool_assistant_uuid', 'is', null);
      if (markerErr) {
        // 1 バッチの失敗で収集済みを全廃棄すると Codex セッションのリンクが
        // 消えて二重表示になるため、当該バッチのみスキップして継続する。
        console.error(
          `[SessionReader] trail_messages marker fetch failed for batch ${i / BATCH} (${batchIds.length} ids):`,
          markerErr,
        );
        continue;
      }
      if (batchRows) allMarkerRows.push(...(batchRows as typeof allMarkerRows));
    }
    const markerRows = allMarkerRows;

    const codexSessions = sessions
      .filter((s) => s.source === 'codex')
      .map((s) => ({
        id: s.id,
        repoName: s.repo_name ?? '',
        startMs: Date.parse(s.start_time),
        endMs: Date.parse(s.end_time),
      }))
      .filter((s) => Number.isFinite(s.startMs) && Number.isFinite(s.endMs));

    const parentRepoById = new Map(parentSessions.map((s) => [s.id, s.repo_name ?? ''] as const));
    for (const row of (markerRows ?? []) as Array<{ session_id: string; source_tool_assistant_uuid: string | null; timestamp: string | null }>) {
      if (!row.timestamp) continue;
      const sid = row.session_id;
      const t = Date.parse(row.timestamp);
      if (!Number.isFinite(t)) continue;
      const parentRepo = parentRepoById.get(sid) ?? '';
      const candidates = codexSessions.filter((s) => parentRepo === '' || s.repoName === parentRepo);
      let bestId: string | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const c of candidates) {
        const inside = t >= (c.startMs - 5 * 60_000) && t <= (c.endMs + 5 * 60_000);
        const score = Math.abs(c.startMs - t);
        if (inside && score < bestScore) {
          bestScore = score;
          bestId = c.id;
        }
      }
      if (!bestId) {
        for (const c of candidates) {
          const score = Math.abs(c.startMs - t);
          if (score <= 60 * 60_000 && score < bestScore) {
            bestScore = score;
            bestId = c.id;
          }
        }
      }
      if (bestId) {
        let set = out.get(sid);
        if (!set) {
          set = new Set<string>();
          out.set(sid, set);
        }
        set.add(bestId);
      }
    }
    return out;
  }
}
