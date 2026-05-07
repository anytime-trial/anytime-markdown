import type { SupabaseClient } from '@supabase/supabase-js';
import type { CostOptimizationData } from '../../domain/parser/types';
import { computeQualityMetrics } from '@anytime-markdown/trail-core/domain/metrics';
import type {
  DateRange,
  QualityMetrics,
} from '@anytime-markdown/trail-core/domain/metrics';
import { calculateCost } from '@anytime-markdown/trail-core/domain/engine';

export class MetricsReader {
  constructor(private readonly client: SupabaseClient) {}

  async getCostOptimization(): Promise<CostOptimizationData | null> {
    const { data, error } = await this.client
      .from('trail_daily_counts')
      .select('date,kind,key,estimated_cost_usd')
      .in('kind', ['cost_actual', 'cost_skill'])
      .order('date');
    if (error || !data) return null;

    const rows = data as readonly { date: string; kind: string; key: string; estimated_cost_usd: number }[];

    const actualByModel: Record<string, number> = {};
    const skillByModel: Record<string, number> = {};
    const dailyMap = new Map<string, { actualCost: number; skillCost: number }>();

    for (const r of rows) {
      const entry = dailyMap.get(r.date) ?? { actualCost: 0, skillCost: 0 };
      if (r.kind === 'cost_actual') {
        actualByModel[r.key] = (actualByModel[r.key] ?? 0) + r.estimated_cost_usd;
        entry.actualCost += r.estimated_cost_usd;
      } else if (r.kind === 'cost_skill') {
        skillByModel[r.key] = (skillByModel[r.key] ?? 0) + r.estimated_cost_usd;
        entry.skillCost += r.estimated_cost_usd;
      }
      dailyMap.set(r.date, entry);
    }

    const daily = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, actualCost: v.actualCost, skillCost: v.skillCost }));

    const totalActual = Object.values(actualByModel).reduce((s, v) => s + v, 0);
    const totalSkill = Object.values(skillByModel).reduce((s, v) => s + v, 0);

    return {
      actual: { totalCost: totalActual, byModel: actualByModel },
      skillEstimate: { totalCost: totalSkill, byModel: skillByModel },
      daily,
      modelDistribution: { actual: actualByModel, skillRecommended: skillByModel },
    };
  }

  async getQualityMetrics(range: DateRange): Promise<QualityMetrics> {
    const fromMs = new Date(range.from).getTime();
    const toMs = new Date(range.to).getTime();
    const duration = toMs - fromMs;
    const prevTo = new Date(fromMs - 1).toISOString();
    const prevFrom = new Date(fromMs - 1 - duration).toISOString();

    type ReleaseRow = { tag: string; released_at: string; fix_count: number };
    type UserMessageHeader = {
      uuid: string;
      timestamp: string;
      type: string;
      session_id: string;
    };
    type CommitRow = {
      repo_name: string | null;
      commit_hash: string;
      commit_message: string;
      committed_at: string;
      session_id: string;
      is_ai_assisted: number;
      lines_added: number;
      lines_deleted: number;
    };
    type CostBreakdownEntry = {
      model: string;
      input: number;
      output: number;
      cache_read: number;
      cache_creation: number;
    };
    const fetchReleases = async (f: string, t: string): Promise<ReleaseRow[]> => {
      const { data } = await this.client
        .from('trail_releases')
        .select('tag, released_at, fix_count')
        .gte('released_at', f)
        .lte('released_at', t);
      return (data ?? []) as ReleaseRow[];
    };
    const fetchUserMessageHeaders = async (sessionIds: string[]): Promise<UserMessageHeader[]> => {
      if (sessionIds.length === 0) return [];
      // Phase 5e: Materialized View (trail_user_messages_meta) を直接 SELECT。
      // Phase 1 の trail_messages keyset pagination (~2.46s) を事前計算済の
      // index scan に置換。Phase 5d の trail_user_message_costs MV と異なり、
      // assistant 応答の有無に関係なく全 user message を含む (Approach A)。
      // 200 を超えると IN (...) 句で URL が ~7KB を超え PostgREST 経由で
      // "TypeError: fetch failed" になるため fetchSessionSources と揃える。
      const SESSION_BATCH = 200;
      const results: UserMessageHeader[] = [];
      for (let i = 0; i < sessionIds.length; i += SESSION_BATCH) {
        const batchIds = sessionIds.slice(i, i + SESSION_BATCH);
        const { data, error } = await this.client
          .from('trail_user_messages_meta')
          .select('uuid, timestamp, session_id')
          .in('session_id', batchIds);
        if (error) {
          console.warn('MetricsReader.fetchUserMessageHeaders: MV query failed', {
            context: { batch: i / SESSION_BATCH, batchSize: batchIds.length },
            error: { message: error.message },
          });
          continue;
        }
        type Row = { uuid: string; timestamp: string; session_id: string };
        for (const row of (data ?? []) as Row[]) {
          // type は MV の WHERE 句で 'user' 確定のため定数で補完。
          results.push({
            uuid: row.uuid,
            timestamp: row.timestamp,
            type: 'user',
            session_id: row.session_id,
          });
        }
      }
      return results;
    };
    const fetchSessionSources = async (sessionIds: string[]): Promise<Map<string, 'claude_code' | 'codex'>> => {
      if (sessionIds.length === 0) return new Map();
      const SESSION_BATCH = 200;
      const sourceMap = new Map<string, 'claude_code' | 'codex'>();
      for (let i = 0; i < sessionIds.length; i += SESSION_BATCH) {
        const batchIds = sessionIds.slice(i, i + SESSION_BATCH);
        const { data } = await this.client
          .from('trail_sessions')
          .select('id, source')
          .in('id', batchIds);
        for (const row of (data ?? []) as Array<{ id: string; source: 'claude_code' | 'codex' }>) {
          sourceMap.set(row.id, row.source);
        }
      }
      return sourceMap;
    };
    const fetchUserTokenAggregates = async (
      f: string,
      t: string,
      sessionIds: string[],
    ): Promise<Map<string, CostBreakdownEntry[]>> => {
      if (sessionIds.length === 0) return new Map();
      // Phase 5d: Materialized View (trail_user_message_costs) を直接 SELECT。
      // RPC 経由の DISTINCT ON join (3.25s) を事前計算済の index scan に置換。
      // 200 を超えると IN (...) 句で URL が ~7KB を超え PostgREST 経由で
      // "TypeError: fetch failed" になるため fetchSessionSources と揃える。
      const SESSION_BATCH = 200;
      type Row = {
        user_uuid: string;
        model: string;
        input_tokens: number;
        output_tokens: number;
        cache_read_tokens: number;
        cache_creation_tokens: number;
      };
      const aggMap = new Map<string, Map<string, CostBreakdownEntry>>();
      for (let i = 0; i < sessionIds.length; i += SESSION_BATCH) {
        const batchIds = sessionIds.slice(i, i + SESSION_BATCH);
        const { data, error } = await this.client
          .from('trail_user_message_costs')
          .select('user_uuid, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens')
          .in('session_id', batchIds)
          .gte('user_timestamp', f)
          .lte('user_timestamp', t);
        if (error) {
          console.warn('MetricsReader.fetchUserTokenAggregates: MV query failed', {
            context: { batch: i / SESSION_BATCH, batchSize: batchIds.length, from: f, to: t },
            error: { message: error.message },
          });
          continue;
        }
        // 同じ user_uuid に複数セッション分のレコードが返ることがあるため model 単位で再集約する。
        for (const row of (data ?? []) as Row[]) {
          let modelMap = aggMap.get(row.user_uuid);
          if (!modelMap) {
            modelMap = new Map<string, CostBreakdownEntry>();
            aggMap.set(row.user_uuid, modelMap);
          }
          const existing = modelMap.get(row.model);
          if (existing) {
            existing.input += row.input_tokens;
            existing.output += row.output_tokens;
            existing.cache_read += row.cache_read_tokens;
            existing.cache_creation += row.cache_creation_tokens;
          } else {
            modelMap.set(row.model, {
              model: row.model,
              input: row.input_tokens,
              output: row.output_tokens,
              cache_read: row.cache_read_tokens,
              cache_creation: row.cache_creation_tokens,
            });
          }
        }
      }
      const out = new Map<string, CostBreakdownEntry[]>();
      for (const [uuid, modelMap] of aggMap) {
        out.set(uuid, [...modelMap.values()]);
      }
      return out;
    };
    const fetchCommits = async (f: string, t: string): Promise<CommitRow[]> => {
      const PAGE_SIZE = 1000;
      const results: CommitRow[] = [];
      // Keyset pagination by committed_at. Backed by idx_trail_session_commits_committed_at.
      let cursor: string | null = null;
      while (true) {
        let q = this.client
          .from('trail_session_commits')
          .select('repo_name, commit_hash, commit_message, committed_at, session_id, is_ai_assisted, lines_added, lines_deleted')
          .gte('committed_at', f)
          .lte('committed_at', t)
          .order('committed_at', { ascending: true })
          .limit(PAGE_SIZE);
        if (cursor !== null) q = q.gt('committed_at', cursor);
        const { data, error } = await q;
        if (error) {
          console.warn('MetricsReader.fetchCommits: query failed', {
            context: { from: f, to: t, cursor },
            error: { message: error.message },
          });
          break;
        }
        const rows = (data ?? []) as CommitRow[];
        results.push(...rows);
        if (rows.length < PAGE_SIZE) break;
        cursor = rows[rows.length - 1].committed_at;
      }
      return results;
    };
    const fetchFilesByHashes = async (hashes: string[]): Promise<Map<string, string[]>> => {
      if (hashes.length === 0) return new Map();
      const BATCH = 200;
      const map = new Map<string, string[]>();
      for (let i = 0; i < hashes.length; i += BATCH) {
        const { data } = await this.client
          .from('trail_commit_files')
          .select('repo_name, commit_hash, file_path')
          .in('commit_hash', hashes.slice(i, i + BATCH));
        for (const { repo_name, commit_hash, file_path } of (data ?? []) as Array<{ repo_name: string | null; commit_hash: string; file_path: string }>) {
          const key = `${repo_name ?? ''}:${commit_hash}`;
          const arr = map.get(key);
          if (arr) arr.push(file_path);
          else map.set(key, [file_path]);
        }
      }
      return map;
    };

    type UserTokens = { input: number; output: number; cr: number; cc: number; cost: number };
    const computeUserTokens = (
      breakdownByUuid: ReadonlyMap<string, CostBreakdownEntry[]>,
      userMessages: ReadonlyArray<UserMessageHeader>,
      sourceBySessionId: ReadonlyMap<string, 'claude_code' | 'codex'>,
    ): Map<string, UserTokens> => {
      const sessionByUserUuid = new Map<string, string>();
      for (const m of userMessages) sessionByUserUuid.set(m.uuid, m.session_id);
      const result = new Map<string, UserTokens>();
      for (const m of userMessages) {
        result.set(m.uuid, { input: 0, output: 0, cr: 0, cc: 0, cost: 0 });
      }
      for (const [uuid, entries] of breakdownByUuid) {
        const sid = sessionByUserUuid.get(uuid);
        const source = sid ? sourceBySessionId.get(sid) : undefined;
        let input = 0;
        let output = 0;
        let cr = 0;
        let cc = 0;
        let cost = 0;
        for (const e of entries) {
          input += e.input;
          output += e.output;
          cr += e.cache_read;
          cc += e.cache_creation;
          cost += calculateCost(e.model, {
            inputTokens: e.input,
            outputTokens: e.output,
            cacheReadTokens: e.cache_read,
            cacheCreationTokens: e.cache_creation,
          }, source);
        }
        result.set(uuid, { input, output, cr, cc, cost });
      }
      return result;
    };

    const [curReleases, curCommits, prevReleases, prevCommits] = await Promise.all([
      fetchReleases(range.from, range.to),
      fetchCommits(range.from, range.to),
      fetchReleases(prevFrom, prevTo),
      fetchCommits(prevFrom, prevTo),
    ]);

    const curSessionIds = [...new Set(curCommits.map((c) => c.session_id))];
    const prevSessionIds = [...new Set(prevCommits.map((c) => c.session_id))];

    const [curMessages, curBreakdown, curFilesByHash, prevMessages, prevBreakdown, prevFilesByHash, curSources, prevSources] = await Promise.all([
      fetchUserMessageHeaders(curSessionIds),
      fetchUserTokenAggregates(range.from, range.to, curSessionIds),
      fetchFilesByHashes(curCommits.map((c) => c.commit_hash)),
      fetchUserMessageHeaders(prevSessionIds),
      fetchUserTokenAggregates(prevFrom, prevTo, prevSessionIds),
      fetchFilesByHashes(prevCommits.map((c) => c.commit_hash)),
      fetchSessionSources(curSessionIds),
      fetchSessionSources(prevSessionIds),
    ]);

    const curTokens = computeUserTokens(curBreakdown, curMessages, curSources);
    const prevTokens = computeUserTokens(prevBreakdown, prevMessages, prevSources);
    return computeQualityMetrics(
      {
        releases: curReleases.map((r) => ({ id: r.tag, tag_date: r.released_at, commit_hashes: [], fix_count: r.fix_count })),
        messages: curMessages.map((m) => {
          const t = curTokens.get(m.uuid) ?? { input: 0, output: 0, cr: 0, cc: 0, cost: 0 };
          return {
            uuid: m.uuid,
            created_at: m.timestamp,
            role: m.type,
            type: 'text',
            session_id: m.session_id,
            input_tokens: t.input,
            output_tokens: t.output,
            cache_read_tokens: t.cr,
            cache_creation_tokens: t.cc,
            cost_usd: t.cost,
          };
        }),
        messageCommits: [],
        commits: curCommits.map((c) => ({
          hash: c.commit_hash,
          subject: (c.commit_message ?? '').split('\n')[0],
          committed_at: c.committed_at,
          is_ai_assisted: c.is_ai_assisted === 1,
          files: curFilesByHash.get(`${c.repo_name ?? ''}:${c.commit_hash}`) ?? [],
          session_id: c.session_id,
          lines_added: c.lines_added ?? 0,
          lines_deleted: c.lines_deleted ?? 0,
        })),
        previousReleases: prevReleases.map((r) => ({ id: r.tag, tag_date: r.released_at, commit_hashes: [], fix_count: r.fix_count })),
        previousMessages: prevMessages.map((m) => {
          const t = prevTokens.get(m.uuid) ?? { input: 0, output: 0, cr: 0, cc: 0, cost: 0 };
          return {
            uuid: m.uuid,
            created_at: m.timestamp,
            role: m.type,
            type: 'text',
            session_id: m.session_id,
            input_tokens: t.input,
            output_tokens: t.output,
            cache_read_tokens: t.cr,
            cache_creation_tokens: t.cc,
            cost_usd: t.cost,
          };
        }),
        previousMessageCommits: [],
        previousCommits: prevCommits.map((c) => ({
          hash: c.commit_hash,
          subject: (c.commit_message ?? '').split('\n')[0],
          committed_at: c.committed_at,
          is_ai_assisted: c.is_ai_assisted === 1,
          files: prevFilesByHash.get(`${c.repo_name ?? ''}:${c.commit_hash}`) ?? [],
          session_id: c.session_id,
          lines_added: c.lines_added ?? 0,
          lines_deleted: c.lines_deleted ?? 0,
        })),
      },
      range,
    );
  }
}
