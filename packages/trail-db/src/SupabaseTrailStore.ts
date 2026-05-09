import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SessionRow, MessageRow, SessionCommitRow, ReleaseFileRow, ReleaseRow } from './TrailDatabase';
import type { IRemoteTrailStore } from './IRemoteTrailStore';
import type { ManualElement, ManualRelationship } from '@anytime-markdown/trail-core';
import { type DbLogger, noopDbLogger } from './DbLogger';

export class SupabaseTrailStore implements IRemoteTrailStore {
  private client: SupabaseClient | null = null;
  private readonly logger: DbLogger;

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
    logger?: DbLogger,
  ) {
    this.logger = logger ?? noopDbLogger;
  }

  async connect(): Promise<void> {
    this.client = createClient(this.url, this.anonKey);
  }

  async close(): Promise<void> {
    this.client = null;
  }

  async unsafeClearAll(): Promise<void> {
    // Supabase の statement timeout を避けるため、全テーブルをページング削除する。
    // 先に子テーブル(messages)を消してから親(sessions)を消すことで、
    // sessions 削除時の CASCADE 負荷を最小化する。
    await this.deleteAllPaged('trail_messages', 'uuid');
    await this.deleteAllPaged('trail_sessions', 'id');
    await this.deleteAllPaged('trail_releases', 'tag');
    await this.ensureClient().from('trail_daily_counts').delete().gte('date', '0000-01-01');
    await this.deleteAllPaged('trail_release_graphs', 'tag');
    await this.ensureClient().from('trail_current_file_analysis').delete().gte('repo_name', '');
    await this.ensureClient().from('trail_release_file_analysis').delete().gte('release_tag', '');
    await this.ensureClient().from('trail_current_function_analysis').delete().gte('repo_name', '');
    await this.ensureClient().from('trail_release_function_analysis').delete().gte('release_tag', '');
  }

  private async deleteAllPaged(table: string, pk: string, pageSize = 500): Promise<void> {
    const client = this.ensureClient();
    let deleted = 0;
    this.logger.info(`Clearing ${table}...`);
    try {
      while (true) {
        const { data, error } = await client.from(table).select(pk).limit(pageSize);
        if (error) throw new Error(`select ${table} failed: ${error.message}`);
        if (!data || data.length === 0) break;
        const ids = (data as unknown as Array<Record<string, unknown>>).map((r) => r[pk] as string);
        const { error: delError } = await client.from(table).delete().in(pk, ids);
        if (delError) throw new Error(`delete ${table} failed: ${delError.message}`);
        deleted += ids.length;
        this.logger.info(`  ${table}: deleted ${deleted} rows`);
        if (data.length < pageSize) break;
      }
      this.logger.info(`Cleared ${table} (${deleted} rows)`);
    } catch (e) {
      this.logger.error(`Failed to clear ${table} (deleted ${deleted} rows before failure)`, e);
      throw e;
    }
  }

  async getExistingSessionIds(): Promise<readonly string[]> {
    const { data, error } = await this.ensureClient()
      .from('trail_sessions')
      .select('id');
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return (data ?? []).map((r: { id: string }) => r.id);
  }

  async getExistingSyncedAt(): Promise<ReadonlyMap<string, string>> {
    const { data, error } = await this.ensureClient()
      .from('trail_sessions')
      .select('id, imported_at');
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      map.set(row.id, row.imported_at ?? '');
    }
    return map;
  }

  async upsertSessions(rows: readonly SessionRow[]): Promise<void> {
    if (rows.length === 0) return;
    const mapped = rows.map((r) => ({
      id: r.id, slug: r.slug, repo_name: r.repo_name,
      version: r.version, entrypoint: r.entrypoint, model: r.model,
      start_time: r.start_time, end_time: r.end_time,
      message_count: r.message_count,
      file_path: r.file_path, file_size: r.file_size,
      imported_at: r.imported_at,
      commits_resolved_at: r.commits_resolved_at ?? null,
      peak_context_tokens: r.peak_context_tokens ?? null,
      initial_context_tokens: r.initial_context_tokens ?? null,
      interruption_reason: r.interruption_reason ?? null,
      interruption_context_tokens: r.interruption_context_tokens ?? null,
      compact_count:             r.compact_count             ?? null,
      sub_agent_count:           r.sub_agent_count           ?? 0,
      error_count:               r.error_count               ?? 0,
      assistant_message_count:   r.assistant_message_count   ?? 0,
      source: r.source ?? 'claude_code',
      synced_at: new Date().toISOString(),
    }));
    const { error } = await this.ensureClient()
      .from('trail_sessions')
      .upsert(mapped, { onConflict: 'id' });
    if (error) throw new Error(`Supabase upsert sessions failed: ${error.message}`);
  }

  async upsertSessionCosts(sessionId: string, costs: readonly {
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[]): Promise<void> {
    if (costs.length === 0) return;
    const mapped = costs.map((c) => ({
      session_id: sessionId,
      model: c.model,
      input_tokens: c.input_tokens,
      output_tokens: c.output_tokens,
      cache_read_tokens: c.cache_read_tokens,
      cache_creation_tokens: c.cache_creation_tokens,
      estimated_cost_usd: c.estimated_cost_usd,
    }));
    const { error } = await this.ensureClient()
      .from('trail_session_costs')
      .upsert(mapped, { onConflict: 'session_id,model' });
    if (error) throw new Error(`Supabase upsert session_costs failed: ${error.message}`);
  }

  async upsertAllSessionCosts(rows: readonly {
    session_id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await this.ensureClient()
        .from('trail_session_costs')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'session_id,model' });
      if (error) throw new Error(`Supabase upsert all session_costs failed: ${error.message}`);
    }
  }

  async upsertDailyCounts(rows: readonly {
    date: string;
    kind: string;
    key: string;
    count: number;
    tokens: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    duration_ms: number;
    estimated_cost_usd: number;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await this.ensureClient()
        .from('trail_daily_counts')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'date,kind,key' });
      if (error) throw new Error(`Supabase upsert trail_daily_counts failed: ${error.message}`);
    }
  }

  async upsertMessages(rows: readonly MessageRow[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => ({
        uuid: r.uuid, session_id: r.session_id,
        parent_uuid: r.parent_uuid, type: r.type, subtype: r.subtype,
        text_content: r.text_content, user_content: r.user_content,
        tool_calls: r.tool_calls, tool_use_result: r.tool_use_result,
        model: r.model, request_id: r.request_id, stop_reason: r.stop_reason,
        input_tokens: r.input_tokens, output_tokens: r.output_tokens,
        cache_read_tokens: r.cache_read_tokens,
        cache_creation_tokens: r.cache_creation_tokens,
        service_tier: r.service_tier, speed: r.speed,
        timestamp: r.timestamp,
        is_sidechain: r.is_sidechain, is_meta: r.is_meta,
        cwd: r.cwd, git_branch: r.git_branch,
        permission_mode: r.permission_mode ?? null,
        skill: r.skill ?? null,
        agent_id: r.agent_id ?? null,
        agent_description: r.agent_description ?? null,
        agent_model: r.agent_model ?? null,
        subagent_type: r.subagent_type ?? null,
        source_tool_assistant_uuid: r.source_tool_assistant_uuid ?? null,
        source_tool_use_id: r.source_tool_use_id ?? null,
        system_command: r.system_command ?? null,
        duration_ms: r.duration_ms ?? null,
        tool_result_size: r.tool_result_size ?? null,
      }));
      const { error } = await this.ensureClient()
        .from('trail_messages')
        .upsert(chunk, { onConflict: 'uuid' });
      if (error) throw new Error(`Supabase upsert messages failed: ${error.message}`);
    }
  }

  async upsertCommits(rows: readonly SessionCommitRow[]): Promise<void> {
    if (rows.length === 0) return;
    const mapped = rows.map((r) => ({
      session_id: r.session_id, commit_hash: r.commit_hash,
      repo_name: r.repo_name,
      commit_message: r.commit_message, author: r.author,
      committed_at: r.committed_at, is_ai_assisted: r.is_ai_assisted,
      files_changed: r.files_changed,
      lines_added: r.lines_added, lines_deleted: r.lines_deleted,
    }));
    const { error } = await this.ensureClient()
      .from('trail_session_commits')
      .upsert(mapped, { onConflict: 'session_id,repo_name,commit_hash' });
    if (error) throw new Error(`Supabase upsert commits failed: ${error.message}`);
  }

  async upsertCommitFiles(rows: readonly { repo_name: string; commit_hash: string; file_path: string }[]): Promise<void> {
    if (rows.length === 0) return;
    // commit_files はコミットが不変なので IGNORE（既存行を上書きしない）
    const { error } = await this.ensureClient()
      .from('trail_commit_files')
      .upsert(rows, { onConflict: 'repo_name,commit_hash,file_path', ignoreDuplicates: true });
    if (error) throw new Error(`Supabase upsert trail_commit_files failed: ${error.message}`);
  }

  async upsertReleases(rows: readonly ReleaseRow[]): Promise<void> {
    if (rows.length === 0) return;
    const mapped = rows.map((r) => ({
      tag: r.tag, released_at: r.released_at, prev_tag: r.prev_tag ?? null,
      repo_name: r.repo_name, package_tags: r.package_tags, commit_count: r.commit_count,
      files_changed: r.files_changed, lines_added: r.lines_added, lines_deleted: r.lines_deleted,
      total_lines: r.total_lines,
      feat_count: r.feat_count, fix_count: r.fix_count, refactor_count: r.refactor_count,
      test_count: r.test_count, other_count: r.other_count,
      affected_packages: r.affected_packages, duration_days: r.duration_days,
      resolved_at: r.resolved_at ?? null,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await this.ensureClient()
      .from('trail_releases')
      .upsert(mapped, { onConflict: 'tag' });
    if (error) throw new Error(`Supabase upsert trail_releases failed: ${error.message}`);
  }

  async upsertReleaseFiles(rows: readonly ReleaseFileRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.ensureClient()
      .from('trail_release_files')
      .upsert(rows.map((r) => ({
        release_tag: r.release_tag,
        file_path: r.file_path,
        lines_added: r.lines_added,
        lines_deleted: r.lines_deleted,
        change_type: r.change_type,
      })), { onConflict: 'release_tag,file_path' });
    if (error) throw new Error(`Supabase upsert release_files failed: ${error.message}`);
  }

  /**
   * trail_current_graphs を全削除する（洗い替え同期の前処理）。
   */
  async unsafeClearCurrentGraphs(): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_current_graphs')
      .delete()
      .neq('repo_name', '');
    if (error) throw new Error(`Supabase clear current graphs failed: ${error.message}`);
  }

  /**
   * trail_release_graphs を全削除する（洗い替え同期の前処理）。
   */
  async unsafeClearReleaseGraphs(): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_release_graphs')
      .delete()
      .neq('tag', '');
    if (error) throw new Error(`Supabase clear release graphs failed: ${error.message}`);
  }

  /**
   * リポジトリ単位の current TrailGraph を trail_current_graphs に保存する。
   * 拡張機能のローカル current_graphs と対応する。
   */
  async upsertCurrentGraph(repoName: string, graphJson: string, commitId: string): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_current_graphs')
      .upsert({
        repo_name: repoName,
        commit_id: commitId,
        graph_json: graphJson,
        updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      }, { onConflict: 'repo_name' });
    if (error) throw new Error(`Supabase upsert current graph failed: ${error.message}`);
  }

  /**
   * リリース別の TrailGraph を trail_release_graphs に保存する。
   */
  async upsertReleaseGraph(tag: string, graphJson: string): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_release_graphs')
      .upsert({
        tag,
        graph_json: graphJson,
        updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      }, { onConflict: 'tag' });
    if (error) throw new Error(`Supabase upsert release graph failed: ${error.message}`);
  }

  async unsafeClearMessageToolCalls(): Promise<void> {
    await this.deleteAllPaged('trail_message_tool_calls', 'id');
  }

  async upsertMessageToolCalls(rows: readonly {
    id: number;
    session_id: string;
    message_uuid: string;
    turn_index: number;
    call_index: number;
    tool_name: string;
    file_path: string | null;
    command: string | null;
    skill_name: string | null;
    model: string | null;
    is_sidechain: number;
    turn_exec_ms: number | null;
    has_thinking: number;
    is_error: number;
    error_type: string | null;
    timestamp: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await this.ensureClient()
        .from('trail_message_tool_calls')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'session_id,message_uuid,call_index' });
      if (error) throw new Error(`Supabase upsert trail_message_tool_calls failed: ${error.message}`);
    }
  }

  async unsafeClearCurrentCoverage(): Promise<void> {
    await this.ensureClient().from('trail_current_coverage').delete().gte('repo_name', '');
  }

  async upsertCurrentCoverage(rows: readonly {
    repo_name: string; package: string; file_path: string;
    lines_total: number; lines_covered: number; lines_pct: number;
    statements_total: number; statements_covered: number; statements_pct: number;
    functions_total: number; functions_covered: number; functions_pct: number;
    branches_total: number; branches_covered: number; branches_pct: number;
    updated_at: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await this.ensureClient()
        .from('trail_current_coverage')
        .upsert(chunk.map((r) => ({ ...r })), { onConflict: 'repo_name,package,file_path' });
      if (error) throw new Error(`Supabase upsert current_coverage failed: ${error.message}`);
    }
  }

  async unsafeClearReleaseCoverage(): Promise<void> {
    await this.ensureClient().from('trail_release_coverage').delete().gte('release_tag', '');
  }

  async upsertReleaseCoverage(rows: readonly {
    release_tag: string; package: string; file_path: string;
    lines_total: number; lines_covered: number; lines_pct: number;
    statements_total: number; statements_covered: number; statements_pct: number;
    functions_total: number; functions_covered: number; functions_pct: number;
    branches_total: number; branches_covered: number; branches_pct: number;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await this.ensureClient()
        .from('trail_release_coverage')
        .upsert(chunk.map((r) => ({ ...r })), { onConflict: 'release_tag,package,file_path' });
      if (error) throw new Error(`Supabase upsert release_coverage failed: ${error.message}`);
    }
  }

  async unsafeClearCurrentFileAnalysis(): Promise<void> {
    await this.ensureClient().from('trail_current_file_analysis').delete().gte('repo_name', '');
  }

  async upsertCurrentFileAnalysis(rows: readonly {
    repo_name: string; file_path: string;
    importance_score: number; fan_in_total: number; cognitive_complexity_max: number; function_count: number;
    dead_code_score: number;
    signal_orphan: number; signal_fan_in_zero: number; signal_no_recent_churn: number;
    signal_zero_coverage: number; signal_isolated_community: number;
    is_ignored: number; ignore_reason: string; analyzed_at: string;
    line_count: number; cyclomatic_complexity_max: number;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await this.ensureClient()
        .from('trail_current_file_analysis')
        .upsert(chunk.map((r) => ({ ...r })), { onConflict: 'repo_name,file_path' });
      if (error) throw new Error(`Supabase upsert trail_current_file_analysis failed: ${error.message}`);
    }
  }

  async unsafeClearReleaseFileAnalysis(): Promise<void> {
    await this.ensureClient().from('trail_release_file_analysis').delete().gte('release_tag', '');
  }

  async upsertReleaseFileAnalysis(rows: readonly {
    release_tag: string; repo_name: string; file_path: string;
    importance_score: number; fan_in_total: number; cognitive_complexity_max: number; function_count: number;
    dead_code_score: number;
    signal_orphan: number; signal_fan_in_zero: number; signal_no_recent_churn: number;
    signal_zero_coverage: number; signal_isolated_community: number;
    is_ignored: number; ignore_reason: string; analyzed_at: string;
    line_count: number; cyclomatic_complexity_max: number;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await this.ensureClient()
        .from('trail_release_file_analysis')
        .upsert(chunk.map((r) => ({ ...r })), { onConflict: 'release_tag,repo_name,file_path' });
      if (error) throw new Error(`Supabase upsert trail_release_file_analysis failed: ${error.message}`);
    }
  }

  async unsafeClearCurrentFunctionAnalysis(): Promise<void> {
    await this.ensureClient().from('trail_current_function_analysis').delete().gte('repo_name', '');
  }

  async upsertCurrentFunctionAnalysis(rows: readonly {
    repo_name: string; file_path: string; function_name: string; start_line: number;
    end_line: number; language: string;
    fan_in: number; cognitive_complexity: number; data_mutation_score: number;
    side_effect_score: number; line_count: number; importance_score: number;
    signal_fan_in_zero: number; analyzed_at: string;
    cyclomatic_complexity: number;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await this.ensureClient()
        .from('trail_current_function_analysis')
        .upsert(chunk.map((r) => ({ ...r })), { onConflict: 'repo_name,file_path,function_name,start_line' });
      if (error) throw new Error(`Supabase upsert trail_current_function_analysis failed: ${error.message}`);
    }
  }

  async unsafeClearReleaseFunctionAnalysis(): Promise<void> {
    await this.ensureClient().from('trail_release_function_analysis').delete().gte('release_tag', '');
  }

  async upsertReleaseFunctionAnalysis(rows: readonly {
    release_tag: string; repo_name: string; file_path: string; function_name: string; start_line: number;
    end_line: number; language: string;
    fan_in: number; cognitive_complexity: number; data_mutation_score: number;
    side_effect_score: number; line_count: number; importance_score: number;
    signal_fan_in_zero: number; analyzed_at: string;
    cyclomatic_complexity: number;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await this.ensureClient()
        .from('trail_release_function_analysis')
        .upsert(chunk.map((r) => ({ ...r })), { onConflict: 'release_tag,repo_name,file_path,function_name,start_line' });
      if (error) throw new Error(`Supabase upsert trail_release_function_analysis failed: ${error.message}`);
    }
  }

  async unsafeClearCurrentCodeGraphs(): Promise<void> {
    await this.ensureClient().from('trail_current_code_graph_communities').delete().gte('repo_name', '');
    await this.ensureClient().from('trail_current_code_graphs').delete().gte('repo_name', '');
  }

  async upsertCurrentCodeGraphs(rows: readonly {
    repo_name: string; graph_json: string; generated_at: string; updated_at: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.ensureClient()
      .from('trail_current_code_graphs')
      .upsert(rows.map((r) => ({ ...r })), { onConflict: 'repo_name' });
    if (error) throw new Error(`Supabase upsert current_code_graphs failed: ${error.message}`);
  }

  async upsertCurrentCodeGraphCommunities(rows: readonly {
    repo_name: string; community_id: number; label: string;
    name: string; summary: string; mappings_json: string | null;
    generated_at: string; updated_at: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await this.ensureClient()
        .from('trail_current_code_graph_communities')
        .upsert(chunk.map((r) => ({ ...r })), { onConflict: 'repo_name,community_id' });
      if (error) throw new Error(`Supabase upsert current_code_graph_communities failed: ${error.message}`);
    }
  }

  async unsafeClearReleaseCodeGraphs(): Promise<void> {
    await this.ensureClient().from('trail_release_code_graph_communities').delete().gte('release_tag', '');
    await this.ensureClient().from('trail_release_code_graphs').delete().gte('release_tag', '');
  }

  async upsertReleaseCodeGraphs(rows: readonly {
    release_tag: string; graph_json: string; generated_at: string; updated_at: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.ensureClient()
      .from('trail_release_code_graphs')
      .upsert(rows.map((r) => ({ ...r })), { onConflict: 'release_tag' });
    if (error) throw new Error(`Supabase upsert release_code_graphs failed: ${error.message}`);
  }

  async upsertReleaseCodeGraphCommunities(rows: readonly {
    release_tag: string; community_id: number; label: string;
    name: string; summary: string;
    generated_at: string; updated_at: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await this.ensureClient()
        .from('trail_release_code_graph_communities')
        .upsert(chunk.map((r) => ({ ...r })), { onConflict: 'release_tag,community_id' });
      if (error) throw new Error(`Supabase upsert release_code_graph_communities failed: ${error.message}`);
    }
  }

  async listManualElements(repoName: string): Promise<readonly ManualElement[]> {
    const { data, error } = await this.ensureClient()
      .from('trail_c4_manual_elements')
      .select('*')
      .eq('repo_name', repoName);
    if (error) throw new Error(`Supabase listManualElements failed: ${error.message}`);
    return (data ?? []).map(row => ({
      id: String(row.element_id),
      type: String(row.type) as ManualElement['type'],
      name: String(row.name),
      description: row.description ?? undefined,
      external: Boolean(row.external),
      parentId: row.parent_id ?? null,
      updatedAt: String(row.updated_at),
    }));
  }

  async upsertManualElement(repoName: string, e: ManualElement): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_c4_manual_elements')
      .upsert({
        repo_name: repoName,
        element_id: e.id,
        type: e.type,
        name: e.name,
        description: e.description ?? null,
        external: e.external,
        parent_id: e.parentId,
        updated_at: e.updatedAt,
      }, { onConflict: 'repo_name,element_id' });
    if (error) throw new Error(`Supabase upsertManualElement failed: ${error.message}`);
  }

  async deleteManualElement(repoName: string, elementId: string): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_c4_manual_elements')
      .delete()
      .eq('repo_name', repoName)
      .eq('element_id', elementId);
    if (error) throw new Error(`Supabase deleteManualElement failed: ${error.message}`);
  }

  async listManualRelationships(repoName: string): Promise<readonly ManualRelationship[]> {
    const { data, error } = await this.ensureClient()
      .from('trail_c4_manual_relationships')
      .select('*')
      .eq('repo_name', repoName);
    if (error) throw new Error(`Supabase listManualRelationships failed: ${error.message}`);
    return (data ?? []).map(row => ({
      id: String(row.rel_id),
      fromId: String(row.from_id),
      toId: String(row.to_id),
      label: row.label ?? undefined,
      technology: row.technology ?? undefined,
      updatedAt: String(row.updated_at),
    }));
  }

  async upsertManualRelationship(repoName: string, rel: ManualRelationship): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_c4_manual_relationships')
      .upsert({
        repo_name: repoName,
        rel_id: rel.id,
        from_id: rel.fromId,
        to_id: rel.toId,
        label: rel.label ?? null,
        technology: rel.technology ?? null,
        updated_at: rel.updatedAt,
      }, { onConflict: 'repo_name,rel_id' });
    if (error) throw new Error(`Supabase upsertManualRelationship failed: ${error.message}`);
  }

  async deleteManualRelationship(repoName: string, relId: string): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_c4_manual_relationships')
      .delete()
      .eq('repo_name', repoName)
      .eq('rel_id', relId);
    if (error) throw new Error(`Supabase deleteManualRelationship failed: ${error.message}`);
  }

  async refreshMaterializedViews(): Promise<void> {
    const client = this.ensureClient();
    // CONCURRENTLY refresh は互いに block しないため Promise.all で並列実行。
    // どちらの refresh も致命的ではない (古いデータで動作可能、次回 sync で復旧)。
    const [costsResult, metaResult] = await Promise.all([
      client.rpc('refresh_trail_user_message_costs'),
      client.rpc('refresh_trail_user_messages_meta'),
    ]);
    if (costsResult.error) {
      this.logger.error(
        `[${new Date().toISOString()}] [WARN] SupabaseTrailStore.refreshMaterializedViews trail_user_message_costs failed: ${costsResult.error.message}`,
        costsResult.error,
      );
    }
    if (metaResult.error) {
      this.logger.error(
        `[${new Date().toISOString()}] [WARN] SupabaseTrailStore.refreshMaterializedViews trail_user_messages_meta failed: ${metaResult.error.message}`,
        metaResult.error,
      );
    }
  }

  private ensureClient(): SupabaseClient {
    if (!this.client) throw new Error('SupabaseTrailStore not connected');
    return this.client;
  }
}
