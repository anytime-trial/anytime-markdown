import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  CombinedData,
  CombinedPeriodMode,
  CombinedRangeDays,
  CostOptimizationData,
  ToolMetrics,
  TrailFilter,
  TrailMessage,
  TrailSession,
  TrailSessionCommit,
  TrailToolCall,
} from '../parser/types';
// AnalyticsData は trail-core の共通型を使用（React 依存を避け、server-safe にする）
import type { AnalyticsData, ITrailReader, TrailRelease } from '@anytime-markdown/trail-core/domain';
import { computeQualityMetrics } from '@anytime-markdown/trail-core/domain/metrics';
import type { DateRange, QualityMetrics } from '@anytime-markdown/trail-core/domain/metrics';

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
  readonly interruption_reason: string | null;
  readonly interruption_context_tokens: number | null;
  readonly compact_count: number | null;
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

    const sessions = data ?? [];
    const sessionIds = sessions.map((r: SessionDbRow) => r.id);
    const errorCountMap = new Map<string, number>();
    const subAgentCountMap = new Map<string, number>();
    if (sessionIds.length > 0) {
      const { data: errData } = await this.client
        .from('trail_message_tool_calls')
        .select('session_id')
        .in('session_id', sessionIds)
        .eq('is_error', 1);
      for (const row of (errData ?? []) as { session_id: string }[]) {
        errorCountMap.set(row.session_id, (errorCountMap.get(row.session_id) ?? 0) + 1);
      }
      const { data: agentData } = await this.client
        .from('trail_message_tool_calls')
        .select('session_id')
        .in('session_id', sessionIds)
        .eq('tool_name', 'Agent');
      for (const row of (agentData ?? []) as { session_id: string }[]) {
        subAgentCountMap.set(row.session_id, (subAgentCountMap.get(row.session_id) ?? 0) + 1);
      }
    }

    return sessions.map((r: SessionDbRow & { trail_session_commits?: readonly CommitDbRow[] }) =>
      this.toTrailSession(r, r.trail_session_commits ?? [], errorCountMap.get(r.id), subAgentCountMap.get(r.id)),
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
      .from('trail_daily_counts')
      .select('date,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,estimated_cost_usd')
      .eq('kind', 'cost_actual')
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

    // Daily activity from trail_daily_counts (kind='cost_actual')
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

    return { totals, toolUsage: [], dailyActivity };
  }

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

    // ツール別利用統計を message_tool_calls + messages から集計
    const normalizeTool = (name: string): string => {
      if (!name.startsWith('mcp__')) return name;
      const parts = name.split('__');
      return parts.length >= 3 ? `${parts[0]}__${parts[1]}` : name;
    };
    const { data: tcData } = await this.client
      .from('trail_message_tool_calls')
      .select('message_uuid, turn_index, tool_name, skill_name, is_error, turn_exec_ms, model')
      .eq('session_id', sessionId);
    const tcRows = (tcData ?? []) as { message_uuid: string; turn_index: number; tool_name: string; skill_name: string | null; is_error: number; turn_exec_ms: number | null; model: string | null }[];

    // メッセージのトークン数を取得
    const msgUuids = [...new Set(tcRows.map(r => r.message_uuid))];
    const msgTokenMap = new Map<string, number>();
    const msgToolCount = new Map<string, number>();
    for (const r of tcRows) {
      msgToolCount.set(r.message_uuid, (msgToolCount.get(r.message_uuid) ?? 0) + 1);
    }
    for (let i = 0; i < msgUuids.length; i += 1000) {
      const batch = msgUuids.slice(i, i + 1000);
      const { data: msgData } = await this.client
        .from('trail_messages')
        .select('uuid, input_tokens, output_tokens')
        .in('uuid', batch);
      if (msgData) {
        for (const m of msgData as { uuid: string; input_tokens: number; output_tokens: number }[]) {
          msgTokenMap.set(m.uuid, (m.input_tokens ?? 0) + (m.output_tokens ?? 0));
        }
      }
    }
    // ターン内ツール数
    const turnToolCount = new Map<string, number>();
    for (const r of tcRows) {
      const tk = `${sessionId}:${r.turn_index}`;
      turnToolCount.set(tk, (turnToolCount.get(tk) ?? 0) + 1);
    }
    const toolAgg = new Map<string, { count: number; tokens: number; durationMs: number }>();
    for (const r of tcRows) {
      const tool = normalizeTool(r.tool_name);
      const e = toolAgg.get(tool) ?? { count: 0, tokens: 0, durationMs: 0 };
      e.count++;
      const mTokens = msgTokenMap.get(r.message_uuid) ?? 0;
      const mTools = msgToolCount.get(r.message_uuid) ?? 1;
      e.tokens += Math.round(mTokens / mTools);
      const tk = `${sessionId}:${r.turn_index}`;
      const tTools = turnToolCount.get(tk) ?? 1;
      e.durationMs += Math.round((r.turn_exec_ms ?? 0) / tTools);
      toolAgg.set(tool, e);
    }
    const toolUsage = [...toolAgg.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([tool, e]) => ({ tool, ...e }));

    // スキル別利用統計
    const skillAgg = new Map<string, { count: number; tokens: number; durationMs: number }>();
    for (const r of tcRows) {
      if (!r.skill_name) continue;
      const skill = r.skill_name;
      const e = skillAgg.get(skill) ?? { count: 0, tokens: 0, durationMs: 0 };
      e.count++;
      const mTokens = msgTokenMap.get(r.message_uuid) ?? 0;
      const mTools = msgToolCount.get(r.message_uuid) ?? 1;
      e.tokens += Math.round(mTokens / mTools);
      const tk = `${sessionId}:${r.turn_index}`;
      const tTools = turnToolCount.get(tk) ?? 1;
      e.durationMs += Math.round((r.turn_exec_ms ?? 0) / tTools);
      skillAgg.set(skill, e);
    }
    const skillUsage = [...skillAgg.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([skill, e]) => ({ skill, ...e }));

    // ツール別エラー回数（MCP 正規化）
    const errorAgg = new Map<string, number>();
    for (const r of tcRows) {
      if (!r.is_error) continue;
      const tool = normalizeTool(r.tool_name);
      errorAgg.set(tool, (errorAgg.get(tool) ?? 0) + 1);
    }
    const errorsByTool = [...errorAgg.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([tool, count]) => ({ tool, count }));

    // モデル別利用統計: count/tokens は assistant メッセージから、durationMs は turn_exec_ms をターン単位で集計
    const { data: modelMsgData } = await this.client
      .from('trail_messages')
      .select('uuid, model, input_tokens, output_tokens')
      .eq('session_id', sessionId)
      .eq('type', 'assistant')
      .not('model', 'is', null);
    const modelAgg = new Map<string, { count: number; tokens: number; durationMs: number }>();
    for (const m of (modelMsgData ?? []) as { uuid: string; model: string | null; input_tokens: number | null; output_tokens: number | null }[]) {
      if (!m.model) continue;
      const e = modelAgg.get(m.model) ?? { count: 0, tokens: 0, durationMs: 0 };
      e.count++;
      e.tokens += (m.input_tokens ?? 0) + (m.output_tokens ?? 0);
      modelAgg.set(m.model, e);
    }
    // turn_exec_ms はターン内全行で同一値。turn_index 単位で一度だけ加算する。
    const turnSeen = new Set<number>();
    for (const r of tcRows) {
      if (turnSeen.has(r.turn_index)) continue;
      turnSeen.add(r.turn_index);
      if (!r.model) continue;
      const e = modelAgg.get(r.model);
      if (e) e.durationMs += r.turn_exec_ms ?? 0;
    }
    const modelUsage = [...modelAgg.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([model, e]) => ({ model, ...e }));

    return { totalRetries, totalEdits, totalBuildRuns, totalBuildFails, totalTestRuns, totalTestFails, toolUsage, skillUsage, errorsByTool, modelUsage };
  }

  async getDayToolMetrics(date: string): Promise<ToolMetrics | null> {
    const { data, error } = await this.client
      .from('trail_daily_counts')
      .select('kind,key,count,tokens,duration_ms')
      .eq('date', date)
      .in('kind', ['tool', 'skill', 'error', 'model']);
    if (error || !data) return null;

    type Row = { kind: string; key: string; count: number; tokens: number; duration_ms: number };
    const rows = data as Row[];

    const toolMap = new Map<string, { count: number; tokens: number; durationMs: number }>();
    const skillMap = new Map<string, { count: number; tokens: number; durationMs: number }>();
    const errMap = new Map<string, number>();
    const modelMap = new Map<string, { count: number; tokens: number; durationMs: number }>();

    for (const r of rows) {
      if (r.kind === 'tool') {
        const e = toolMap.get(r.key) ?? { count: 0, tokens: 0, durationMs: 0 };
        e.count += r.count; e.tokens += r.tokens; e.durationMs += r.duration_ms;
        toolMap.set(r.key, e);
      } else if (r.kind === 'skill') {
        const e = skillMap.get(r.key) ?? { count: 0, tokens: 0, durationMs: 0 };
        e.count += r.count; e.tokens += r.tokens; e.durationMs += r.duration_ms;
        skillMap.set(r.key, e);
      } else if (r.kind === 'error') {
        errMap.set(r.key, (errMap.get(r.key) ?? 0) + r.count);
      } else if (r.kind === 'model') {
        const e = modelMap.get(r.key) ?? { count: 0, tokens: 0, durationMs: 0 };
        e.count += r.count; e.tokens += r.tokens; e.durationMs += r.duration_ms;
        modelMap.set(r.key, e);
      }
    }

    return {
      totalRetries: 0, totalEdits: 0, totalBuildRuns: 0, totalBuildFails: 0,
      totalTestRuns: 0, totalTestFails: 0,
      toolUsage: [...toolMap.entries()].map(([tool, e]) => ({ tool, ...e })).sort((a, b) => b.count - a.count),
      skillUsage: [...skillMap.entries()].map(([skill, e]) => ({ skill, ...e })).sort((a, b) => b.count - a.count),
      errorsByTool: [...errMap.entries()].map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count),
      modelUsage: [...modelMap.entries()].map(([model, e]) => ({ model, ...e })).sort((a, b) => b.count - a.count),
    };
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
    errorCount?: number,
    subAgentCount?: number,
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
      interruption: r.interruption_reason
        ? {
            interrupted: true,
            reason: r.interruption_reason as 'max_tokens' | 'no_response',
            contextTokens: r.interruption_context_tokens ?? 0,
          }
        : undefined,
      compactCount: r.compact_count && r.compact_count > 0 ? r.compact_count : undefined,
      commitStats,
      usage: {
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cacheReadTokens: totalCacheRead,
        cacheCreationTokens: totalCacheCreation,
      },
      estimatedCostUsd: totalCostUsd,
      errorCount: errorCount && errorCount > 0 ? errorCount : undefined,
      subAgentCount: subAgentCount && subAgentCount > 0 ? subAgentCount : undefined,
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
      repo_name: string | null;
      package_tags: string; commit_count: number;
      files_changed: number; lines_added: number; lines_deleted: number;
      feat_count: number; fix_count: number; refactor_count: number;
      test_count: number; other_count: number;
      affected_packages: string; duration_days: number;
    }[]).map((r) => ({
      tag: r.tag,
      releasedAt: r.released_at,
      prevTag: r.prev_tag,
      repoName: r.repo_name,
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

  async getCombinedData(period: CombinedPeriodMode, rangeDays: CombinedRangeDays): Promise<CombinedData | null> {
    try {
      // daily_counts の date は JST (YYYY-MM-DD)。
      // cutoff も JST 日付文字列で比較する。
      const getIanaOffsetMs = (timeZone: string, at: Date): number => {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at);
        const label = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
        const match = /^GMT([+-])(\d{1,2}):(\d{2})$/.exec(label);
        if (!match) return 0;
        const sign = match[1] === '+' ? 1 : -1;
        return sign * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
      };
      const cutoffMs = Date.now() - rangeDays * 86_400_000;
      const cutoffLocal = new Date(cutoffMs + getIanaOffsetMs('Asia/Tokyo', new Date(cutoffMs)));
      const cutoffDate = `${cutoffLocal.getUTCFullYear()}-${String(cutoffLocal.getUTCMonth() + 1).padStart(2, '0')}-${String(cutoffLocal.getUTCDate()).padStart(2, '0')}`;

      const { data, error } = await this.client
        .from('trail_daily_counts')
        .select('date,kind,key,count,tokens,duration_ms')
        .in('kind', ['tool', 'skill', 'error', 'model'])
        .gte('date', cutoffDate);
      if (error || !data) return null;

      type DcRow = { date: string; kind: string; key: string; count: number; tokens: number; duration_ms: number };
      const rows = data as DcRow[];

      const getMonday = (dateStr: string): string => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(Date.UTC(y!, m! - 1, d!));
        const diffToMonday = (dt.getUTCDay() + 6) % 7;
        const monday = new Date(dt.getTime() - diffToMonday * 86_400_000);
        return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
      };
      const periodKey = (dateStr: string): string =>
        period === 'week' ? getMonday(dateStr) : dateStr;

      const toolMap = new Map<string, { count: number; tokens: number; durationMs: number }>();
      const errMap = new Map<string, { err: number; total: number; byTool: Record<string, number> }>();
      const skillMap = new Map<string, number>();
      const modelMap = new Map<string, { count: number; tokens: number }>();

      for (const r of rows) {
        const p = periodKey(r.date);
        if (r.kind === 'tool') {
          const k = `${p}::${r.key}`;
          const e = toolMap.get(k) ?? { count: 0, tokens: 0, durationMs: 0 };
          e.count += r.count; e.tokens += r.tokens; e.durationMs += r.duration_ms;
          toolMap.set(k, e);
          const ef = errMap.get(p) ?? { err: 0, total: 0, byTool: {} };
          ef.total += r.count;
          errMap.set(p, ef);
        } else if (r.kind === 'error') {
          const ef = errMap.get(p) ?? { err: 0, total: 0, byTool: {} };
          ef.err += r.count;
          ef.byTool[r.key] = (ef.byTool[r.key] ?? 0) + r.count;
          errMap.set(p, ef);
        } else if (r.kind === 'skill') {
          const k = `${p}::${r.key}`;
          skillMap.set(k, (skillMap.get(k) ?? 0) + r.count);
        } else if (r.kind === 'model') {
          const k = `${p}::${r.key}`;
          const e = modelMap.get(k) ?? { count: 0, tokens: 0 };
          e.count += r.count; e.tokens += r.tokens;
          modelMap.set(k, e);
        }
      }

      const splitKey = (k: string): [string, string] => {
        const sep = k.indexOf('::');
        return [k.slice(0, sep), k.slice(sep + 2)];
      };

      const toolCounts = [...toolMap.entries()]
        .map(([k, e]) => { const [p, tool] = splitKey(k); return { period: p, tool, ...e }; })
        .sort((a, b) => a.period.localeCompare(b.period) || b.count - a.count);

      const errorRate = [...errMap.entries()]
        .filter(([, e]) => e.total > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([p, e]) => ({ period: p, rate: e.err / e.total, byTool: e.byTool }));

      const skillStats = [...skillMap.entries()]
        .map(([k, count]) => { const [p, skill] = splitKey(k); return { period: p, skill, count, costUsd: 0 }; })
        .sort((a, b) => a.period.localeCompare(b.period));

      const modelStats = [...modelMap.entries()]
        .map(([k, e]) => { const [p, model] = splitKey(k); return { period: p, model, ...e }; })
        .sort((a, b) => a.period.localeCompare(b.period) || b.count - a.count);

      return { toolCounts, errorRate, skillStats, modelStats };
    } catch {
      return null;
    }
  }

  async getQualityMetrics(range: DateRange): Promise<QualityMetrics> {
    // Compute previous range (same duration immediately before current range).
    const fromMs = new Date(range.from).getTime();
    const toMs = new Date(range.to).getTime();
    const duration = toMs - fromMs;
    const prevTo = new Date(fromMs - 1).toISOString();
    const prevFrom = new Date(fromMs - 1 - duration).toISOString();

    type ReleaseRow = { tag: string; released_at: string; fix_count: number };
    type MessageRow = { uuid: string; timestamp: string; type: string };
    type CommitRow = { commit_hash: string; commit_message: string; committed_at: string };

    const fetchReleases = async (f: string, t: string): Promise<ReleaseRow[]> => {
      const { data } = await this.client
        .from('trail_releases')
        .select('tag, released_at, fix_count')
        .gte('released_at', f)
        .lte('released_at', t);
      return (data ?? []) as ReleaseRow[];
    };
    const fetchMessages = async (f: string, t: string): Promise<MessageRow[]> => {
      const { data } = await this.client
        .from('trail_messages')
        .select('uuid, timestamp, type')
        .eq('type', 'user')
        .gte('timestamp', f)
        .lte('timestamp', t);
      return (data ?? []) as MessageRow[];
    };
    const fetchCommits = async (f: string, t: string): Promise<CommitRow[]> => {
      const { data } = await this.client
        .from('trail_session_commits')
        .select('commit_hash, commit_message, committed_at')
        .gte('committed_at', f)
        .lte('committed_at', t);
      return (data ?? []) as CommitRow[];
    };

    const [curReleases, curMessages, curCommits, prevReleases, prevMessages, prevCommits] = await Promise.all([
      fetchReleases(range.from, range.to),
      fetchMessages(range.from, range.to),
      fetchCommits(range.from, range.to),
      fetchReleases(prevFrom, prevTo),
      fetchMessages(prevFrom, prevTo),
      fetchCommits(prevFrom, prevTo),
    ]);

    // trail_message_commits は現状 Supabase 未同期のため空配列。
    // Lead Time / Prompt→Commit 成功率は sampleSize=0 で「データなし」表示になる。
    return computeQualityMetrics(
      {
        releases: curReleases.map((r) => ({ id: r.tag, tag_date: r.released_at, commit_hashes: [], fix_count: r.fix_count })),
        messages: curMessages.map((m) => ({ uuid: m.uuid, created_at: m.timestamp, role: m.type, type: 'text' })),
        messageCommits: [],
        commits: curCommits.map((c) => ({ hash: c.commit_hash, subject: (c.commit_message ?? '').split('\n')[0] })),
        previousReleases: prevReleases.map((r) => ({ id: r.tag, tag_date: r.released_at, commit_hashes: [], fix_count: r.fix_count })),
        previousMessages: prevMessages.map((m) => ({ uuid: m.uuid, created_at: m.timestamp, role: m.type, type: 'text' })),
        previousMessageCommits: [],
        previousCommits: prevCommits.map((c) => ({ hash: c.commit_hash, subject: (c.commit_message ?? '').split('\n')[0] })),
      },
      range,
    );
  }
}
