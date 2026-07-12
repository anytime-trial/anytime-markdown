import type { SessionRow, MessageRow, SessionCommitRow, ReleaseFileRow, ReleaseRow } from './TrailDatabase';
import type { ManualElement, ManualRelationship, ManualGroup } from '@anytime-markdown/trail-core';

export interface IRemoteTrailStore {
  connect(): Promise<void>;
  close(): Promise<void>;
  /**
   * [DESTRUCTIVE] リモートの全テーブルを一括削除する。
   * 呼び出し後は即座に upsert で復元する前提で使うこと。
   */
  unsafeClearAll(): Promise<void>;
  getExistingSessionIds(): Promise<readonly string[]>;
  getExistingSyncedAt(): Promise<ReadonlyMap<string, string>>;
  /**
   * repo 正規化の参照テーブル trail_repos を upsert する。
   * FK 親のため、子テーブルの同期より前に呼ぶこと。repo_id=0 sentinel はスキーマ側で seed 済み。
   */
  upsertRepos(rows: readonly { repo_id: number; repo_name: string; created_at: string | null }[]): Promise<void>;
  /** [DESTRUCTIVE] trail_repos を sentinel(repo_id=0) を残して全削除する（洗い替え同期用）。 */
  unsafeClearRepos(): Promise<void>;
  upsertSessions(rows: readonly SessionRow[]): Promise<void>;
  /**
   * メッセージを upsert し、**リモートに実際に入った uuid** を返す。
   *
   * 戻り値は message_tool_calls の FK 親集合として使う (SyncService の参照整合ゲート)。
   * 部分失敗 (一部チャンクのみ成功) の場合は成功分だけを返し、失敗は logger.error に記録する。
   * 呼び出し元は `戻り値.length < rows.length` で部分失敗を検知できる。
   */
  upsertMessages(rows: readonly MessageRow[]): Promise<readonly string[]>;
  upsertCommits(rows: readonly SessionCommitRow[]): Promise<void>;
  upsertCommitFiles(rows: readonly { repo_id: number; commit_hash: string; file_path: string }[]): Promise<void>;
  upsertReleases(rows: readonly ReleaseRow[]): Promise<void>;
  upsertReleaseFiles(rows: readonly ReleaseFileRow[]): Promise<void>;
  upsertSessionCosts(sessionId: string, costs: readonly {
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[]): Promise<void>;
  upsertAllSessionCosts(rows: readonly {
    session_id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[]): Promise<void>;
  upsertDailyCounts(rows: readonly {
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
  }[]): Promise<void>;
  /** [DESTRUCTIVE] current_graphs テーブルを全削除する（洗い替え同期用）。 */
  unsafeClearCurrentGraphs(): Promise<void>;
  /** [DESTRUCTIVE] release_graphs テーブルを全削除する（洗い替え同期用）。 */
  unsafeClearReleaseGraphs(): Promise<void>;
  upsertCurrentGraph(repoId: number, graphJson: string, commitId: string): Promise<void>;
  upsertReleaseGraph(releaseId: number, graphJson: string): Promise<void>;
  listManualElements(repoId: number): Promise<readonly ManualElement[]>;
  upsertManualElement(repoId: number, element: ManualElement): Promise<void>;
  deleteManualElement(repoId: number, elementId: string): Promise<void>;
  listManualRelationships(repoId: number): Promise<readonly ManualRelationship[]>;
  upsertManualRelationship(repoId: number, rel: ManualRelationship): Promise<void>;
  deleteManualRelationship(repoId: number, relId: string): Promise<void>;
  listManualGroups(repoId: number): Promise<readonly ManualGroup[]>;
  upsertManualGroup(repoId: number, group: ManualGroup): Promise<void>;
  deleteManualGroup(repoId: number, groupId: string): Promise<void>;
  /** [DESTRUCTIVE] message_tool_calls テーブルを全削除する（洗い替え同期用）。 */
  unsafeClearMessageToolCalls(): Promise<void>;
  upsertMessageToolCalls(rows: readonly {
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
  }[]): Promise<void>;
  /** [DESTRUCTIVE] trail_current_coverage を全削除する（洗い替え同期用）。 */
  unsafeClearCurrentCoverage(): Promise<void>;
  upsertCurrentCoverage(rows: readonly {
    repo_id?: number;
    package: string;
    file_path: string;
    lines_total: number;
    lines_covered: number;
    lines_pct: number;
    statements_total: number;
    statements_covered: number;
    statements_pct: number;
    functions_total: number;
    functions_covered: number;
    functions_pct: number;
    branches_total: number;
    branches_covered: number;
    branches_pct: number;
    updated_at: string;
  }[]): Promise<void>;
  /** [DESTRUCTIVE] trail_release_coverage を全削除する（洗い替え同期用）。 */
  unsafeClearReleaseCoverage(): Promise<void>;
  upsertReleaseCoverage(rows: readonly {
    release_id?: number;
    package: string;
    file_path: string;
    lines_total: number;
    lines_covered: number;
    lines_pct: number;
    statements_total: number;
    statements_covered: number;
    statements_pct: number;
    functions_total: number;
    functions_covered: number;
    functions_pct: number;
    branches_total: number;
    branches_covered: number;
    branches_pct: number;
  }[]): Promise<void>;
  /** [DESTRUCTIVE] trail_current_file_analysis を全削除する（洗い替え同期用）。 */
  unsafeClearCurrentFileAnalysis(): Promise<void>;
  upsertCurrentFileAnalysis(rows: readonly {
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
  }[]): Promise<void>;
  /** [DESTRUCTIVE] trail_release_file_analysis を全削除する（洗い替え同期用）。 */
  unsafeClearReleaseFileAnalysis(): Promise<void>;
  upsertReleaseFileAnalysis(rows: readonly {
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
  }[]): Promise<void>;
  /** [DESTRUCTIVE] trail_current_function_analysis を全削除する（洗い替え同期用）。 */
  unsafeClearCurrentFunctionAnalysis(): Promise<void>;
  upsertCurrentFunctionAnalysis(rows: readonly {
    repo_id: number; file_path: string; function_name: string; start_line: number;
    end_line: number; language: string;
    fan_in: number; cognitive_complexity: number; data_mutation_score: number;
    side_effect_score: number; line_count: number; importance_score: number;
    signal_fan_in_zero: number;
    fan_out: number; distinct_callees: number; function_role: string;
    analyzed_at: string;
    cyclomatic_complexity: number;
  }[]): Promise<void>;
  /** [DESTRUCTIVE] trail_release_function_analysis を全削除する（洗い替え同期用）。 */
  unsafeClearReleaseFunctionAnalysis(): Promise<void>;
  upsertReleaseFunctionAnalysis(rows: readonly {
    release_id: number; file_path: string; function_name: string; start_line: number;
    end_line: number; language: string;
    fan_in: number; cognitive_complexity: number; data_mutation_score: number;
    side_effect_score: number; line_count: number; importance_score: number;
    signal_fan_in_zero: number;
    fan_out: number; distinct_callees: number; function_role: string;
    analyzed_at: string;
    cyclomatic_complexity: number;
  }[]): Promise<void>;
  /** [DESTRUCTIVE] trail_current_code_graphs と trail_current_code_graph_communities を全削除する（洗い替え同期用）。 */
  unsafeClearCurrentCodeGraphs(): Promise<void>;
  upsertCurrentCodeGraphs(rows: readonly {
    repo_id: number;
    graph_json: string;
    generated_at: string;
    updated_at: string;
  }[]): Promise<void>;
  upsertCurrentCodeGraphCommunities(rows: readonly {
    repo_id: number;
    community_id: number;
    label: string;
    name: string;
    summary: string;
    mappings_json: string | null;
    stable_key: string;
    generated_at: string;
    updated_at: string;
  }[]): Promise<void>;
  /** [DESTRUCTIVE] trail_release_code_graphs と trail_release_code_graph_communities を全削除する（洗い替え同期用）。 */
  unsafeClearReleaseCodeGraphs(): Promise<void>;
  upsertReleaseCodeGraphs(rows: readonly {
    release_id: number;
    graph_json: string;
    generated_at: string;
    updated_at: string;
  }[]): Promise<void>;
  upsertReleaseCodeGraphCommunities(rows: readonly {
    release_id: number;
    community_id: number;
    label: string;
    name: string;
    summary: string;
    stable_key: string;
    generated_at: string;
    updated_at: string;
  }[]): Promise<void>;

  /**
   * trail_user_message_costs / trail_user_messages_meta Materialized View を並列 refresh する。
   * messages の wash-away & insert 完了後に呼ぶ。失敗は致命的でない（古いデータが見えるだけ）。
   */
  refreshMaterializedViews(): Promise<void>;
}
