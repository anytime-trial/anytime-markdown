import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SessionRow, MessageRow, SessionCommitRow, ReleaseFileRow, ReleaseRow } from './TrailDatabase';
import type { IRemoteTrailStore } from './IRemoteTrailStore';
import type { ManualElement, ManualRelationship, ManualGroup } from '@anytime-markdown/trail-core';
import { type DbLogger, noopDbLogger } from './DbLogger';
import { isRetryableRemoteError, summarizeRemoteError, type RemoteErrorLike } from './remoteRetry';

/** 一過性エラー時の再試行間隔（指数バックオフ）。この回数を使い切ったら throw する。 */
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [500, 1500, 4000];
const DEFAULT_CHUNK_SIZE = 500;

/** Supabase のクエリビルダ（thenable）が解決する形。data は使わないので error のみ見る。 */
type RemoteWriteResponse = { error: RemoteErrorLike | null };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface SupabaseTrailStoreOptions {
  /** 再試行間隔（テストでは [0,0,0] 等に短縮する）。 */
  readonly retryDelaysMs?: readonly number[];
}

export class SupabaseTrailStore implements IRemoteTrailStore {
  private client: SupabaseClient | null = null;
  private readonly logger: DbLogger;
  private readonly retryDelaysMs: readonly number[];

  constructor(
    private readonly url: string,
    // 書き込み (upsert/delete/clear) を行うため service_role キーを受け取る。
    // anon キーは RLS により読み取り専用なので、このストアでは使えない。
    private readonly serviceRoleKey: string,
    logger?: DbLogger,
    options?: SupabaseTrailStoreOptions,
  ) {
    this.logger = logger ?? noopDbLogger;
    this.retryDelaysMs = options?.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  }

  /**
   * 書き込み 1 回を実行し、一過性エラー（ネットワーク断・ゲートウェイ 5xx/HTML・接続過多・
   * statement timeout）なら指数バックオフで再試行する。制約違反等の恒久エラーは即 throw する。
   */
  private async runWithRetry(
    label: string,
    op: () => PromiseLike<RemoteWriteResponse>,
  ): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      let error: RemoteErrorLike | null;
      try {
        ({ error } = await op());
      } catch (e) {
        // fetch 層の例外（接続断・タイムアウト）は PostgrestError にならず throw される。
        error = { message: e instanceof Error ? e.message : String(e) };
      }
      if (!error) return;

      const summary = summarizeRemoteError(error);
      if (!isRetryableRemoteError(error) || attempt >= this.retryDelaysMs.length) {
        throw new Error(`Supabase ${label} failed: ${summary}`);
      }
      const delayMs = this.retryDelaysMs[attempt];
      this.logger.warn(
        `Supabase ${label} failed (attempt ${attempt + 1}/${this.retryDelaysMs.length + 1}), retrying in ${delayMs}ms: ${summary}`,
      );
      await sleep(delayMs);
    }
  }

  /**
   * 行をチャンク分割して upsert する。**チャンク単位でエラーを隔離**し、失敗したチャンクが
   * あっても残りのチャンクは送り切る（旧実装は最初の失敗で throw していたため、1 チャンクの
   * 失敗でテーブル全体が未同期のまま残った）。成功/失敗した行を返す。
   */
  private async upsertChunked<T>(
    label: string,
    table: string,
    rows: readonly T[],
    toPayload: (row: T) => Record<string, unknown>,
    options: { onConflict: string; ignoreDuplicates?: boolean; chunkSize?: number },
  ): Promise<{ succeeded: readonly T[]; failed: readonly T[] }> {
    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const succeeded: T[] = [];
    const failed: T[] = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const payload = chunk.map(toPayload);
      try {
        await this.runWithRetry(`upsert ${table} (rows ${i}-${i + chunk.length - 1})`, () =>
          this.ensureClient().from(table).upsert(payload, {
            onConflict: options.onConflict,
            ignoreDuplicates: options.ignoreDuplicates,
          }),
        );
        succeeded.push(...chunk);
      } catch (e) {
        this.logger.error(`${label}: chunk failed (rows ${i}-${i + chunk.length - 1})`, e);
        failed.push(...chunk);
      }
    }
    return { succeeded, failed };
  }

  /** チャンク隔離後に失敗行が残っていれば、呼び出し元（SyncService.syncStep）へ集約して報告する。 */
  private static throwIfAnyFailed(label: string, failed: readonly unknown[], total: number): void {
    if (failed.length > 0) {
      throw new Error(`Supabase upsert ${label} failed for ${failed.length}/${total} rows (see log for chunk errors)`);
    }
  }

  async connect(): Promise<void> {
    this.client = createClient(this.url, this.serviceRoleKey);
  }

  async close(): Promise<void> {
    this.client = null;
  }

  async unsafeClearAll(): Promise<void> {
    // Supabase の statement timeout を避けるため、全テーブルをページング削除する。
    // 先に子テーブル(messages)を消してから親(sessions)を消すことで、
    // sessions 削除時の CASCADE 負荷を最小化する。
    // repo_id/release_id 正規化後: 子 → 親の順を維持。trail_repos は upsertRepos で
    // 冪等に再投入するためここではクリアしない (clear すると FK CASCADE で全子が消える)。
    await this.deleteAllPaged('trail_messages', 'uuid');
    await this.deleteAllPaged('trail_sessions', 'id');
    await this.deleteAllPaged('trail_releases', 'release_id');
    await this.ensureClient().from('trail_daily_counts').delete().gte('date', '0000-01-01');
    await this.deleteAllPaged('trail_release_graphs', 'release_id');
    await this.ensureClient().from('trail_current_file_analysis').delete().gte('repo_id', 0);
    await this.ensureClient().from('trail_release_file_analysis').delete().gte('release_id', 0);
    await this.ensureClient().from('trail_current_function_analysis').delete().gte('repo_id', 0);
    await this.ensureClient().from('trail_release_function_analysis').delete().gte('release_id', 0);
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

  async upsertRepos(rows: readonly { repo_id: number; repo_name: string; created_at: string | null }[]): Promise<void> {
    if (rows.length === 0) return;
    await this.runWithRetry('upsert trail_repos', () =>
      this.ensureClient()
        .from('trail_repos')
        .upsert(
          rows.map((r) => ({ repo_id: r.repo_id, repo_name: r.repo_name, created_at: r.created_at })),
          { onConflict: 'repo_id' },
        ),
    );
  }

  async unsafeClearRepos(): Promise<void> {
    // sentinel(repo_id=0) は残す (子の DEFAULT 0 を FK 充足させるため)。
    const { error } = await this.ensureClient().from('trail_repos').delete().gt('repo_id', 0);
    if (error) throw new Error(`Supabase clear trail_repos failed: ${error.message}`);
  }

  async upsertSessions(rows: readonly SessionRow[]): Promise<void> {
    if (rows.length === 0) return;
    const mapped = rows.map((r) => ({
      id: r.id, slug: r.slug, repo_id: r.repo_id ?? null,
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
    // セッション行は session_costs / messages / message_tool_calls の FK 親。ここを一過性エラーで
    // 取りこぼすと子テーブルが丸ごと同期不能になるため、必ずリトライを通す。
    await this.runWithRetry('upsert sessions', () =>
      this.ensureClient().from('trail_sessions').upsert(mapped, { onConflict: 'id' }),
    );
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
    await this.runWithRetry('upsert session_costs', () =>
      this.ensureClient()
        .from('trail_session_costs')
        .upsert(mapped, { onConflict: 'session_id,model' }),
    );
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
    const { failed } = await this.upsertChunked(
      'upsert all session_costs',
      'trail_session_costs',
      rows,
      (r) => ({ ...r }),
      { onConflict: 'session_id,model' },
    );
    SupabaseTrailStore.throwIfAnyFailed('all session_costs', failed, rows.length);
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
    const { failed } = await this.upsertChunked(
      'upsert trail_daily_counts',
      'trail_daily_counts',
      rows,
      (r) => ({ ...r }),
      { onConflict: 'date,kind,key' },
    );
    SupabaseTrailStore.throwIfAnyFailed('trail_daily_counts', failed, rows.length);
  }

  async upsertMessages(rows: readonly MessageRow[]): Promise<readonly string[]> {
    if (rows.length === 0) return [];
    // 部分失敗しても throw せず「リモートに入った uuid」を返す。呼び出し元 (SyncService) は
    // これを message_tool_calls の FK 親集合として使い、届かなかったメッセージの子行を送らない。
    const { succeeded } = await this.upsertChunked(
      'upsert messages',
      'trail_messages',
      rows,
      (r) => ({
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
      }),
      { onConflict: 'uuid' },
    );
    return succeeded.map((r) => r.uuid);
  }

  async upsertCommits(rows: readonly SessionCommitRow[]): Promise<void> {
    if (rows.length === 0) return;
    const mapped = rows.map((r) => ({
      session_id: r.session_id, commit_hash: r.commit_hash,
      repo_id: r.repo_id ?? 0,
      commit_message: r.commit_message, author: r.author,
      committed_at: r.committed_at, is_ai_assisted: r.is_ai_assisted,
      files_changed: r.files_changed,
      lines_added: r.lines_added, lines_deleted: r.lines_deleted,
    }));
    await this.runWithRetry('upsert commits', () =>
      this.ensureClient()
        .from('trail_session_commits')
        .upsert(mapped, { onConflict: 'session_id,repo_id,commit_hash' }),
    );
  }

  async upsertCommitFiles(rows: readonly { repo_id: number; commit_hash: string; file_path: string }[]): Promise<void> {
    if (rows.length === 0) return;
    // commit_files はコミットが不変なので IGNORE（既存行を上書きしない）。
    // 受領 row には additive な repo_name 等が含まれ得るため repo_id/commit_hash/file_path のみ送る。
    const { failed } = await this.upsertChunked(
      'upsert trail_commit_files',
      'trail_commit_files',
      rows,
      (r) => ({ repo_id: r.repo_id, commit_hash: r.commit_hash, file_path: r.file_path }),
      { onConflict: 'repo_id,commit_hash,file_path', ignoreDuplicates: true },
    );
    SupabaseTrailStore.throwIfAnyFailed('trail_commit_files', failed, rows.length);
  }

  async upsertReleases(rows: readonly ReleaseRow[]): Promise<void> {
    if (rows.length === 0) return;
    const mapped = rows.map((r) => ({
      release_id: r.release_id, tag: r.tag, repo_id: r.repo_id ?? 0,
      released_at: r.released_at, prev_release_id: r.prev_release_id ?? null,
      package_tags: r.package_tags, commit_count: r.commit_count,
      files_changed: r.files_changed, lines_added: r.lines_added, lines_deleted: r.lines_deleted,
      total_lines: r.total_lines,
      feat_count: r.feat_count, fix_count: r.fix_count, refactor_count: r.refactor_count,
      test_count: r.test_count, other_count: r.other_count,
      affected_packages: r.affected_packages, duration_days: r.duration_days,
      resolved_at: r.resolved_at ?? null,
      release_time_min: r.release_time_min ?? null,
      synced_at: new Date().toISOString(),
    }));
    await this.runWithRetry('upsert trail_releases', () =>
      this.ensureClient().from('trail_releases').upsert(mapped, { onConflict: 'release_id' }),
    );
  }

  async upsertReleaseFiles(rows: readonly ReleaseFileRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { failed } = await this.upsertChunked(
      'upsert release_files',
      'trail_release_files',
      rows,
      (r) => ({
        release_id: r.release_id ?? 0,
        file_path: r.file_path,
        lines_added: r.lines_added,
        lines_deleted: r.lines_deleted,
        change_type: r.change_type,
      }),
      { onConflict: 'release_id,file_path' },
    );
    SupabaseTrailStore.throwIfAnyFailed('release_files', failed, rows.length);
  }

  /**
   * trail_current_graphs を全削除する（洗い替え同期の前処理）。
   */
  async unsafeClearCurrentGraphs(): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_current_graphs')
      .delete()
      .gte('repo_id', 0);
    if (error) throw new Error(`Supabase clear current graphs failed: ${error.message}`);
  }

  /**
   * trail_release_graphs を全削除する（洗い替え同期の前処理）。
   */
  async unsafeClearReleaseGraphs(): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_release_graphs')
      .delete()
      .gte('release_id', 0);
    if (error) throw new Error(`Supabase clear release graphs failed: ${error.message}`);
  }

  /**
   * リポジトリ単位の current TrailGraph を trail_current_graphs に保存する。
   * 拡張機能のローカル current_graphs と対応する。
   */
  async upsertCurrentGraph(repoId: number, graphJson: string, commitId: string): Promise<void> {
    await this.runWithRetry(`upsert current graph (repo ${repoId})`, () =>
      this.ensureClient()
        .from('trail_current_graphs')
        .upsert({
          repo_id: repoId,
          commit_id: commitId,
          graph_json: graphJson,
          updated_at: new Date().toISOString(),
          synced_at: new Date().toISOString(),
        }, { onConflict: 'repo_id' }),
    );
  }

  /**
   * リリース別の TrailGraph を trail_release_graphs に保存する。
   * graph_json は数 MB になるため、ゲートウェイの 5xx (HTML エラーページ) を踏みやすい。
   * runWithRetry がそれを一過性として再試行する。
   */
  async upsertReleaseGraph(releaseId: number, graphJson: string): Promise<void> {
    await this.runWithRetry(`upsert release graph (release ${releaseId}, ${graphJson.length} bytes)`, () =>
      this.ensureClient()
        .from('trail_release_graphs')
        .upsert({
          release_id: releaseId,
          graph_json: graphJson,
          updated_at: new Date().toISOString(),
          synced_at: new Date().toISOString(),
        }, { onConflict: 'release_id' }),
    );
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
    const { failed } = await this.upsertChunked(
      'upsert trail_message_tool_calls',
      'trail_message_tool_calls',
      rows,
      (r) => ({ ...r }),
      { onConflict: 'session_id,message_uuid,call_index' },
    );
    SupabaseTrailStore.throwIfAnyFailed('trail_message_tool_calls', failed, rows.length);
  }

  async unsafeClearCurrentCoverage(): Promise<void> {
    await this.ensureClient().from('trail_current_coverage').delete().gte('repo_id', 0);
  }

  async upsertCurrentCoverage(rows: readonly {
    repo_id?: number; package: string; file_path: string;
    lines_total: number; lines_covered: number; lines_pct: number;
    statements_total: number; statements_covered: number; statements_pct: number;
    functions_total: number; functions_covered: number; functions_pct: number;
    branches_total: number; branches_covered: number; branches_pct: number;
    updated_at: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const { failed } = await this.upsertChunked(
      'upsert current_coverage',
      'trail_current_coverage',
      rows,
      // additive な repo_name を Supabase に送らないよう除外し repo_id を送る。
      (row) => {
        const { repo_name: _omit, repo_id, ...rest } = row as Record<string, unknown>;
        return { repo_id: repo_id ?? 0, ...rest };
      },
      { onConflict: 'repo_id,package,file_path' },
    );
    SupabaseTrailStore.throwIfAnyFailed('current_coverage', failed, rows.length);
  }

  async unsafeClearReleaseCoverage(): Promise<void> {
    await this.ensureClient().from('trail_release_coverage').delete().gte('release_id', 0);
  }

  async upsertReleaseCoverage(rows: readonly {
    release_id?: number; package: string; file_path: string;
    lines_total: number; lines_covered: number; lines_pct: number;
    statements_total: number; statements_covered: number; statements_pct: number;
    functions_total: number; functions_covered: number; functions_pct: number;
    branches_total: number; branches_covered: number; branches_pct: number;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const { failed } = await this.upsertChunked(
      'upsert release_coverage',
      'trail_release_coverage',
      rows,
      (row) => {
        const { release_tag: _t, release_id, ...rest } = row as Record<string, unknown>;
        return { release_id: release_id ?? 0, ...rest };
      },
      { onConflict: 'release_id,package,file_path' },
    );
    SupabaseTrailStore.throwIfAnyFailed('release_coverage', failed, rows.length);
  }

  async unsafeClearCurrentFileAnalysis(): Promise<void> {
    await this.ensureClient().from('trail_current_file_analysis').delete().gte('repo_id', 0);
  }

  async upsertCurrentFileAnalysis(rows: readonly {
    repo_id: number; file_path: string;
    importance_score: number; fan_in_total: number; cognitive_complexity_max: number; function_count: number;
    dead_code_score: number;
    signal_orphan: number; signal_fan_in_zero: number; signal_no_recent_churn: number;
    signal_zero_coverage: number; signal_isolated_community: number;
    is_ignored: number; ignore_reason: string;
    cross_pkg_in_count: number; external_consumer_pkgs: number; total_in_count: number; is_barrel: number; centrality_score: number;
    analyzed_at: string;
    line_count: number; cyclomatic_complexity_max: number;
    category: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const { failed } = await this.upsertChunked(
      'upsert trail_current_file_analysis',
      'trail_current_file_analysis',
      rows,
      // additive な repo_name を除外して repo_id を送る (型に repo_name は無いが実体に含まれ得る)。
      (row) => {
        const { repo_name: _omit, ...rest } = row as Record<string, unknown>;
        return rest;
      },
      { onConflict: 'repo_id,file_path' },
    );
    SupabaseTrailStore.throwIfAnyFailed('trail_current_file_analysis', failed, rows.length);
  }

  async unsafeClearReleaseFileAnalysis(): Promise<void> {
    await this.ensureClient().from('trail_release_file_analysis').delete().gte('release_id', 0);
  }

  async upsertReleaseFileAnalysis(rows: readonly {
    release_id: number; file_path: string;
    importance_score: number; fan_in_total: number; cognitive_complexity_max: number; function_count: number;
    dead_code_score: number;
    signal_orphan: number; signal_fan_in_zero: number; signal_no_recent_churn: number;
    signal_zero_coverage: number; signal_isolated_community: number;
    is_ignored: number; ignore_reason: string;
    cross_pkg_in_count: number; external_consumer_pkgs: number; total_in_count: number; is_barrel: number; centrality_score: number;
    analyzed_at: string;
    line_count: number; cyclomatic_complexity_max: number;
    category: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const { failed } = await this.upsertChunked(
      'upsert trail_release_file_analysis',
      'trail_release_file_analysis',
      rows,
      // additive な release_tag / repo_name を除外して release_id を送る。
      (row) => {
        const { release_tag: _t, repo_name: _r, ...rest } = row as Record<string, unknown>;
        return rest;
      },
      { onConflict: 'release_id,file_path' },
    );
    SupabaseTrailStore.throwIfAnyFailed('trail_release_file_analysis', failed, rows.length);
  }

  async unsafeClearCurrentFunctionAnalysis(): Promise<void> {
    await this.ensureClient().from('trail_current_function_analysis').delete().gte('repo_id', 0);
  }

  async upsertCurrentFunctionAnalysis(rows: readonly {
    repo_id: number; file_path: string; function_name: string; start_line: number;
    end_line: number; language: string;
    fan_in: number; cognitive_complexity: number; data_mutation_score: number;
    side_effect_score: number; line_count: number; importance_score: number;
    signal_fan_in_zero: number; analyzed_at: string;
    cyclomatic_complexity: number;
    fan_out: number; distinct_callees: number; function_role: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const { failed } = await this.upsertChunked(
      'upsert trail_current_function_analysis',
      'trail_current_function_analysis',
      rows,
      (row) => {
        const { repo_name: _omit, ...rest } = row as Record<string, unknown>;
        return rest;
      },
      { onConflict: 'repo_id,file_path,function_name,start_line' },
    );
    SupabaseTrailStore.throwIfAnyFailed('trail_current_function_analysis', failed, rows.length);
  }

  async unsafeClearReleaseFunctionAnalysis(): Promise<void> {
    await this.ensureClient().from('trail_release_function_analysis').delete().gte('release_id', 0);
  }

  async upsertReleaseFunctionAnalysis(rows: readonly {
    release_id: number; file_path: string; function_name: string; start_line: number;
    end_line: number; language: string;
    fan_in: number; cognitive_complexity: number; data_mutation_score: number;
    side_effect_score: number; line_count: number; importance_score: number;
    signal_fan_in_zero: number; analyzed_at: string;
    cyclomatic_complexity: number;
    fan_out: number; distinct_callees: number; function_role: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const { failed } = await this.upsertChunked(
      'upsert trail_release_function_analysis',
      'trail_release_function_analysis',
      rows,
      (row) => {
        const { release_tag: _t, repo_name: _r, ...rest } = row as Record<string, unknown>;
        return rest;
      },
      { onConflict: 'release_id,file_path,function_name,start_line' },
    );
    SupabaseTrailStore.throwIfAnyFailed('trail_release_function_analysis', failed, rows.length);
  }

  async unsafeClearCurrentCodeGraphs(): Promise<void> {
    await this.ensureClient().from('trail_current_code_graph_communities').delete().gte('repo_id', 0);
    await this.ensureClient().from('trail_current_code_graphs').delete().gte('repo_id', 0);
  }

  async upsertCurrentCodeGraphs(rows: readonly {
    repo_id: number; graph_json: string; generated_at: string; updated_at: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    await this.runWithRetry('upsert current_code_graphs', () =>
      this.ensureClient()
        .from('trail_current_code_graphs')
        .upsert(rows.map(({ repo_name: _omit, ...rest }: Record<string, unknown>) => rest), { onConflict: 'repo_id' }),
    );
  }

  async upsertCurrentCodeGraphCommunities(rows: readonly {
    repo_id: number; community_id: number; label: string;
    name: string; summary: string; mappings_json: string | null;
    stable_key: string;
    generated_at: string; updated_at: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const { failed } = await this.upsertChunked(
      'upsert current_code_graph_communities',
      'trail_current_code_graph_communities',
      rows,
      (row) => {
        const { repo_name: _omit, ...rest } = row as Record<string, unknown>;
        return rest;
      },
      { onConflict: 'repo_id,community_id', chunkSize: 200 },
    );
    SupabaseTrailStore.throwIfAnyFailed('current_code_graph_communities', failed, rows.length);
  }

  async unsafeClearReleaseCodeGraphs(): Promise<void> {
    await this.ensureClient().from('trail_release_code_graph_communities').delete().gte('release_id', 0);
    await this.ensureClient().from('trail_release_code_graphs').delete().gte('release_id', 0);
  }

  async upsertReleaseCodeGraphs(rows: readonly {
    release_id: number; graph_json: string; generated_at: string; updated_at: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    await this.runWithRetry('upsert release_code_graphs', () =>
      this.ensureClient()
        .from('trail_release_code_graphs')
        .upsert(rows.map(({ release_tag: _t, ...rest }: Record<string, unknown>) => rest), { onConflict: 'release_id' }),
    );
  }

  async upsertReleaseCodeGraphCommunities(rows: readonly {
    release_id: number; community_id: number; label: string;
    name: string; summary: string;
    stable_key: string;
    generated_at: string; updated_at: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const { failed } = await this.upsertChunked(
      'upsert release_code_graph_communities',
      'trail_release_code_graph_communities',
      rows,
      (row) => {
        const { release_tag: _t, ...rest } = row as Record<string, unknown>;
        return rest;
      },
      { onConflict: 'release_id,community_id', chunkSize: 200 },
    );
    SupabaseTrailStore.throwIfAnyFailed('release_code_graph_communities', failed, rows.length);
  }

  async listManualElements(repoId: number): Promise<readonly ManualElement[]> {
    const { data, error } = await this.ensureClient()
      .from('trail_c4_manual_elements')
      .select('*')
      .eq('repo_id', repoId);
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

  async upsertManualElement(repoId: number, e: ManualElement): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_c4_manual_elements')
      .upsert({
        repo_id: repoId,
        element_id: e.id,
        type: e.type,
        name: e.name,
        description: e.description ?? null,
        external: e.external,
        parent_id: e.parentId,
        updated_at: e.updatedAt,
      }, { onConflict: 'repo_id,element_id' });
    if (error) throw new Error(`Supabase upsertManualElement failed: ${error.message}`);
  }

  async deleteManualElement(repoId: number, elementId: string): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_c4_manual_elements')
      .delete()
      .eq('repo_id', repoId)
      .eq('element_id', elementId);
    if (error) throw new Error(`Supabase deleteManualElement failed: ${error.message}`);
  }

  async listManualRelationships(repoId: number): Promise<readonly ManualRelationship[]> {
    const { data, error } = await this.ensureClient()
      .from('trail_c4_manual_relationships')
      .select('*')
      .eq('repo_id', repoId);
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

  async upsertManualRelationship(repoId: number, rel: ManualRelationship): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_c4_manual_relationships')
      .upsert({
        repo_id: repoId,
        rel_id: rel.id,
        from_id: rel.fromId,
        to_id: rel.toId,
        label: rel.label ?? null,
        technology: rel.technology ?? null,
        updated_at: rel.updatedAt,
      }, { onConflict: 'repo_id,rel_id' });
    if (error) throw new Error(`Supabase upsertManualRelationship failed: ${error.message}`);
  }

  async deleteManualRelationship(repoId: number, relId: string): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_c4_manual_relationships')
      .delete()
      .eq('repo_id', repoId)
      .eq('rel_id', relId);
    if (error) throw new Error(`Supabase deleteManualRelationship failed: ${error.message}`);
  }

  async listManualGroups(repoId: number): Promise<readonly ManualGroup[]> {
    const { data, error } = await this.ensureClient()
      .from('trail_c4_manual_groups')
      .select('*')
      .eq('repo_id', repoId);
    if (error) throw new Error(`Supabase listManualGroups failed: ${error.message}`);
    return (data ?? []).map(row => ({
      id: String(row.group_id),
      memberIds: typeof row.member_ids === 'string' ? JSON.parse(row.member_ids) : (row.member_ids ?? []),
      label: row.label ?? undefined,
      updatedAt: String(row.updated_at),
    }));
  }

  async upsertManualGroup(repoId: number, g: ManualGroup): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_c4_manual_groups')
      .upsert({
        repo_id: repoId,
        group_id: g.id,
        member_ids: JSON.stringify(g.memberIds),
        label: g.label ?? null,
        updated_at: g.updatedAt,
      }, { onConflict: 'repo_id,group_id' });
    if (error) throw new Error(`Supabase upsertManualGroup failed: ${error.message}`);
  }

  async deleteManualGroup(repoId: number, groupId: string): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_c4_manual_groups')
      .delete()
      .eq('repo_id', repoId)
      .eq('group_id', groupId);
    if (error) throw new Error(`Supabase deleteManualGroup failed: ${error.message}`);
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
