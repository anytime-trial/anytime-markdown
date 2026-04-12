import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  CostOptimizationData,
  ToolMetrics,
  TrailFilter,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
  TrailToolCall,
} from '../parser/types';
import type { AnalyticsData } from '../components/AnalyticsPanel';
import type { ITrailReader } from './ITrailReader';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';

// ---------------------------------------------------------------------------
// Row shapes returned by Supabase (snake_case DB columns)
// ---------------------------------------------------------------------------

interface SessionCostDbRow {
  readonly session_id: string;
  readonly model: string;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
  readonly cache_creation_tokens: number;
  readonly estimated_cost_usd: number;
}

interface SessionDbRow {
  readonly id: string;
  readonly slug: string;
  readonly project: string;
  readonly model: string;
  readonly version: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly message_count: number;
  readonly peak_context_tokens: number | null;
  readonly initial_context_tokens: number | null;
  readonly trail_session_costs?: readonly SessionCostDbRow[];
}

interface MessageDbRow {
  readonly uuid: string;
  readonly parent_uuid: string | null;
  readonly type: string;
  readonly subtype: string | null;
  readonly text_content: string | null;
  readonly user_content: string | null;
  readonly tool_calls: string | null;
  readonly model: string | null;
  readonly stop_reason: string | null;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
  readonly cache_creation_tokens: number;
  readonly timestamp: string;
  readonly is_sidechain: number;
}

interface CommitDbRow {
  readonly commit_hash: string;
  readonly commit_message: string;
  readonly author: string;
  readonly committed_at: string;
  readonly is_ai_assisted: number;
  readonly files_changed: number;
  readonly lines_added: number;
  readonly lines_deleted: number;
}

// ---------------------------------------------------------------------------
// SupabaseTrailReader
// ---------------------------------------------------------------------------

export class SupabaseTrailReader implements ITrailReader {
  private readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
  }

  async getSessions(filters?: TrailFilter): Promise<readonly TrailSession[]> {
    let query = this.client
      .from('trail_sessions')
      .select('*, trail_session_costs(*), trail_session_commits(commit_hash, lines_added, lines_deleted, files_changed)')
      .order('start_time', { ascending: false });

    if (filters?.project) {
      query = query.eq('project', filters.project);
    }
    if (filters?.model) {
      query = query.eq('model', filters.model);
    }
    if (filters?.dateRange) {
      query = query.gte('start_time', filters.dateRange.from).lte('start_time', filters.dateRange.to);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase getSessions failed: ${error.message}`);
    return (data ?? []).map((r: SessionDbRow & { trail_session_commits?: readonly CommitDbRow[] }) =>
      this.toTrailSession(r, r.trail_session_commits ?? []),
    );
  }

  async getMessages(sessionId: string): Promise<readonly TrailMessage[]> {
    const { data, error } = await this.client
      .from('trail_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });
    if (error) throw new Error(`Supabase getMessages failed: ${error.message}`);
    return (data ?? []).map((r: MessageDbRow) => this.toTrailMessage(r));
  }

  async getSessionCommits(sessionId: string): Promise<readonly TrailSessionCommit[]> {
    const { data, error } = await this.client
      .from('trail_session_commits')
      .select('*')
      .eq('session_id', sessionId);
    if (error) throw new Error(`Supabase getSessionCommits failed: ${error.message}`);
    return (data ?? []).map((r: CommitDbRow) => ({
      commitHash: r.commit_hash,
      commitMessage: r.commit_message,
      author: r.author,
      committedAt: r.committed_at,
      isAiAssisted: r.is_ai_assisted === 1,
      filesChanged: r.files_changed,
      linesAdded: r.lines_added,
      linesDeleted: r.lines_deleted,
    }));
  }

  async getC4Model(): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.client
      .from('trail_c4_models')
      .select('model_json')
      .eq('id', 'current')
      .single();
    if (error || !data) return null;
    try {
      return JSON.parse(data.model_json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async getAnalytics(): Promise<AnalyticsData | null> {
    const { data: sessions, error } = await this.client
      .from('trail_sessions')
      .select('*');
    if (error) return null;
    if (!sessions || sessions.length === 0) return null;

    const { data: costData } = await this.client
      .from('trail_session_costs')
      .select('*');
    const allCosts = (costData ?? []) as readonly SessionCostDbRow[];

    const { data: dailyCostData } = await this.client
      .from('trail_daily_costs')
      .select('*')
      .eq('cost_type', 'actual')
      .order('date');

    const { data: commits } = await this.client
      .from('trail_session_commits')
      .select('*');

    const allCommits = commits ?? [];

    const totals = {
      sessions: sessions.length,
      inputTokens: allCosts.reduce((s, c) => s + c.input_tokens, 0),
      outputTokens: allCosts.reduce((s, c) => s + c.output_tokens, 0),
      cacheReadTokens: allCosts.reduce((s, c) => s + c.cache_read_tokens, 0),
      cacheCreationTokens: allCosts.reduce((s, c) => s + c.cache_creation_tokens, 0),
      estimatedCostUsd: allCosts.reduce((s, c) => s + c.estimated_cost_usd, 0),
      totalCommits: allCommits.length,
      totalLinesAdded: allCommits.reduce((s, c) => s + c.lines_added, 0),
      totalLinesDeleted: allCommits.reduce((s, c) => s + c.lines_deleted, 0),
      totalFilesChanged: allCommits.reduce((s, c) => s + c.files_changed, 0),
      totalAiAssistedCommits: allCommits.filter((c) => c.is_ai_assisted === 1).length,
      totalSessionDurationMs: sessions.reduce((s, r) => {
        const start = new Date(r.start_time).getTime();
        const end = new Date(r.end_time).getTime();
        return s + (Number.isFinite(end - start) ? end - start : 0);
      }, 0),
      totalRetries: 0,
      totalEdits: 0,
      totalBuildRuns: 0,
      totalBuildFails: 0,
      totalTestRuns: 0,
      totalTestFails: 0,
    };

    // Model breakdown from session_costs
    const modelMap = new Map<string, { sessions: Set<string>; inputTokens: number; outputTokens: number; cacheReadTokens: number; estimatedCostUsd: number }>();
    for (const c of allCosts) {
      const entry = modelMap.get(c.model) ?? { sessions: new Set<string>(), inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, estimatedCostUsd: 0 };
      entry.sessions.add(c.session_id);
      entry.inputTokens += c.input_tokens;
      entry.outputTokens += c.output_tokens;
      entry.cacheReadTokens += c.cache_read_tokens;
      entry.estimatedCostUsd += c.estimated_cost_usd;
      modelMap.set(c.model, entry);
    }
    const modelBreakdown = [...modelMap.entries()].map(([model, v]) => ({
      model,
      sessions: v.sessions.size,
      inputTokens: v.inputTokens,
      outputTokens: v.outputTokens,
      cacheReadTokens: v.cacheReadTokens,
      estimatedCostUsd: v.estimatedCostUsd,
    }));

    // Daily activity from daily_costs
    type DailyEntry = { sessions: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; estimatedCostUsd: number };
    const dailyMap = new Map<string, DailyEntry>();
    for (const r of (dailyCostData ?? []) as readonly { date: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_creation_tokens: number; estimated_cost_usd: number }[]) {
      const entry = dailyMap.get(r.date) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estimatedCostUsd: 0 };
      entry.inputTokens += r.input_tokens;
      entry.outputTokens += r.output_tokens;
      entry.cacheReadTokens += r.cache_read_tokens;
      entry.cacheCreationTokens += r.cache_creation_tokens;
      entry.estimatedCostUsd += r.estimated_cost_usd;
      dailyMap.set(r.date, entry);
    }
    const dailyActivity = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    return { totals, toolUsage: [], modelBreakdown, dailyActivity };
  }

  async getCostOptimization(): Promise<CostOptimizationData | null> {
    const { data, error } = await this.client
      .from('trail_daily_costs')
      .select('*')
      .in('cost_type', ['actual', 'skill'])
      .order('date');
    if (error || !data) return null;

    const rows = data as readonly { date: string; model: string; cost_type: string; estimated_cost_usd: number }[];

    const actualByModel: Record<string, number> = {};
    const skillByModel: Record<string, number> = {};
    const dailyMap = new Map<string, { actualCost: number; skillCost: number }>();

    for (const r of rows) {
      const entry = dailyMap.get(r.date) ?? { actualCost: 0, skillCost: 0 };
      if (r.cost_type === 'actual') {
        actualByModel[r.model] = (actualByModel[r.model] ?? 0) + r.estimated_cost_usd;
        entry.actualCost += r.estimated_cost_usd;
      } else if (r.cost_type === 'skill') {
        skillByModel[r.model] = (skillByModel[r.model] ?? 0) + r.estimated_cost_usd;
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

  async getSessionToolMetrics(sessionId: string): Promise<ToolMetrics | null> {
    const { data, error } = await this.client
      .from('trail_messages')
      .select('tool_calls')
      .eq('session_id', sessionId)
      .not('tool_calls', 'is', null);
    if (error) return null;

    let totalRetries = 0;
    let totalEdits = 0;
    let totalBuildRuns = 0;
    let totalBuildFails = 0;
    let totalTestRuns = 0;
    let totalTestFails = 0;

    for (const row of data ?? []) {
      if (!row.tool_calls) continue;
      try {
        const calls = JSON.parse(row.tool_calls) as readonly { name?: string; error?: boolean }[];
        for (const call of calls) {
          const name = call.name ?? '';
          if (name === 'Retry') totalRetries++;
          if (name === 'Edit' || name === 'Write') totalEdits++;
          if (name === 'Bash' && totalBuildRuns >= 0) {
            // Approximation — count build/test by name heuristic
          }
          if (name.toLowerCase().includes('build')) {
            totalBuildRuns++;
            if (call.error) totalBuildFails++;
          }
          if (name.toLowerCase().includes('test')) {
            totalTestRuns++;
            if (call.error) totalTestFails++;
          }
        }
      } catch {
        // Skip unparseable tool_calls
      }
    }

    return { totalRetries, totalEdits, totalBuildRuns, totalBuildFails, totalTestRuns, totalTestFails };
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toTrailSession(
    r: SessionDbRow,
    commits: readonly CommitDbRow[],
  ): TrailSession {
    const commitStats = commits.length > 0
      ? {
          commits: commits.length,
          linesAdded: commits.reduce((s, c) => s + c.lines_added, 0),
          linesDeleted: commits.reduce((s, c) => s + c.lines_deleted, 0),
          filesChanged: commits.reduce((s, c) => s + c.files_changed, 0),
        }
      : undefined;

    // Aggregate costs from session_costs join
    const costs = r.trail_session_costs ?? [];
    const totalInput = costs.reduce((s, c) => s + c.input_tokens, 0);
    const totalOutput = costs.reduce((s, c) => s + c.output_tokens, 0);
    const totalCacheRead = costs.reduce((s, c) => s + c.cache_read_tokens, 0);
    const totalCacheCreation = costs.reduce((s, c) => s + c.cache_creation_tokens, 0);
    const totalCostUsd = costs.reduce((s, c) => s + c.estimated_cost_usd, 0);

    return {
      id: r.id,
      slug: r.slug,
      project: r.project,
      gitBranch: '',
      startTime: r.start_time,
      endTime: r.end_time,
      version: r.version,
      model: r.model,
      messageCount: r.message_count,
      peakContextTokens: r.peak_context_tokens ?? undefined,
      initialContextTokens: r.initial_context_tokens ?? undefined,
      commitStats,
      usage: {
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cacheReadTokens: totalCacheRead,
        cacheCreationTokens: totalCacheCreation,
      },
      estimatedCostUsd: totalCostUsd,
    };
  }

  private toTrailMessage(r: MessageDbRow): TrailMessage {
    let toolCalls: readonly TrailToolCall[] | undefined;
    if (r.tool_calls) {
      try {
        toolCalls = JSON.parse(r.tool_calls) as readonly TrailToolCall[];
      } catch {
        // ignore parse errors
      }
    }

    return {
      uuid: r.uuid,
      parentUuid: r.parent_uuid,
      type: r.type as 'user' | 'assistant' | 'system',
      subtype: r.subtype ?? undefined,
      timestamp: r.timestamp,
      isSidechain: r.is_sidechain === 1,
      model: r.model ?? undefined,
      toolCalls,
      textContent: r.text_content ?? undefined,
      userContent: r.user_content ?? undefined,
      stopReason: r.stop_reason,
      usage: {
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        cacheReadTokens: r.cache_read_tokens,
        cacheCreationTokens: r.cache_creation_tokens,
      },
    };
  }

  async getReleases(): Promise<readonly TrailRelease[]> {
    const { data, error } = await this.client
      .from('trail_releases')
      .select('*')
      .order('released_at', { ascending: false });
    if (error || !data) return [];
    return (data as readonly {
      tag: string; released_at: string; prev_tag: string | null;
      package_tags: string; commit_count: number;
      files_changed: number; lines_added: number; lines_deleted: number;
      feat_count: number; fix_count: number; refactor_count: number;
      test_count: number; other_count: number;
      affected_packages: string; duration_days: number;
    }[]).map((r) => ({
      tag: r.tag,
      releasedAt: r.released_at,
      prevTag: r.prev_tag,
      packageTags: JSON.parse(r.package_tags) as string[],
      commitCount: r.commit_count,
      filesChanged: r.files_changed,
      linesAdded: r.lines_added,
      linesDeleted: r.lines_deleted,
      featCount: r.feat_count,
      fixCount: r.fix_count,
      refactorCount: r.refactor_count,
      testCount: r.test_count,
      otherCount: r.other_count,
      affectedPackages: JSON.parse(r.affected_packages) as string[],
      durationDays: r.duration_days,
    }));
  }
}
