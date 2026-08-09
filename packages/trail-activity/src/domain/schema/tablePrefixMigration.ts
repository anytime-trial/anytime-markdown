/**
 * テーブル名接頭辞移行（2026-08-08）の対応表とプランナ。
 *
 * DB ファイル名（activity.db / caravan-book.db / catalog.db）に合わせ、所在 DB ごとの
 * 接頭辞（activity_ / caravan_ / catalog_）へテーブルを改名する。対応表は「物理的な
 * 所在 DB」基準で分割する — Flight Record 系 5 表は DDL が本パッケージにあっても
 * caravan-book.db 所在（2026-08-07 移設）のため CARAVAN 側に載る。
 *
 * 実行主体:
 * - activity.db: trail-db TrailDatabase が DDL 実行前に適用（owner）
 * - caravan-book.db FR 表: trail-db FlightRecordDatabase（owner）と mcp-trail の
 *   冪等作成サイドカーが適用（サイドカーにも入れるのは、旧名実在時に新名 DDL の
 *   IF NOT EXISTS が空テーブルを作って split-brain になるのを防ぐため）
 * - caravan-book.db runner 管理表（memory_* 等）: 023/024 マイグレーション（本表の対象外）
 */

export interface TableRename {
  readonly from: string;
  readonly to: string;
}

function withPrefix(prefix: string, names: readonly string[]): readonly TableRename[] {
  return names.map((from) => ({ from, to: `${prefix}${from}` }));
}

/** activity.db（TrailDatabase 所有）の全テーブル。VIEW（skill_models_resolved）は
 *  ALTER RENAME 不可のため対象外 — 旧 VIEW を DROP し DDL が新名で再作成する。 */
export const ACTIVITY_TABLE_RENAMES: readonly TableRename[] = withPrefix('activity_', [
  'boundary_drift_runs',
  'boundary_drift_warnings',
  'c4_manual_elements',
  'c4_manual_groups',
  'c4_manual_relationships',
  'code_decision_comments',
  'commit_code_graphs',
  'commit_files',
  'cross_source_correlations',
  'current_code_graph_communities',
  'current_code_graphs',
  'current_coverage',
  'current_file_analysis',
  'current_function_analysis',
  'current_graphs',
  'daily_counts',
  'dora_metrics',
  'emergency_log',
  'message_commits',
  'message_tool_calls',
  'messages',
  // pr_reviews / pr_review_comments / pr_review_findings は対象外: caravan_reviews へ
  // 意味統合済み（2026-08-07）のレガシー名で、残っているのは移設・回収コードだけ。
  // 改名するとレガシー DB の回収（trail.pr_reviews の 0 行 DROP）が空振りする。
  'release_code_graph_communities',
  'release_code_graphs',
  'release_coverage',
  'release_files',
  'release_graphs',
  'releases',
  'repos',
  'safe_points',
  'session_commit_resolutions',
  'session_commits',
  'session_costs',
  'sessions',
  'skill_models',
  'user_feedback_entries',
  'verification_runs',
]);

/** caravan-book.db 所在の Flight Record 系（runner の _migrations 管理外のため、
 *  023 マイグレーションでなく owner / サイドカーの open 経路で改名する）。 */
export const CARAVAN_FLIGHT_RECORD_RENAMES: readonly TableRename[] = withPrefix('caravan_', [
  'acceptance_records',
  'doctrine_judgments',
  'flight_reviews',
  'instruction_sessions',
  'instructions',
]);

/**
 * 実在テーブル集合に対して安全に適用できる ALTER 文だけを返す純関数。
 *
 * - 旧名が実在し新名が不在 → ALTER を生成
 * - 旧名が不在（改名済み・未作成）→ スキップ（冪等）
 * - 新旧が同時に実在 → スキップ（旧ビルドの IF NOT EXISTS が新名側を先に作った
 *   衝突状態。データを壊さないため触らず、解消は上位のログ・手動判断に委ねる）
 */
export function planTableRenames(
  existingTables: ReadonlySet<string>,
  renames: readonly TableRename[],
): string[] {
  const statements: string[] = [];
  for (const { from, to } of renames) {
    if (!existingTables.has(from)) continue;
    if (existingTables.has(to)) continue;
    statements.push(`ALTER TABLE ${from} RENAME TO ${to}`);
  }
  return statements;
}
