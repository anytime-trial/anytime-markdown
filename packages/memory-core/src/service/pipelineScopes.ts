/**
 * `pipeline-status.json` に記録する 9 scope (analyzer→scope は 1:N、conversation→2 等)。
 *
 * 重い依存 (sql.js / better-sqlite3 / agent-core) を一切持たない軽量モジュール。
 * index から static import してよい (openMemoryDbSession 経由だと遅延 require 対象の
 * 重いモジュールを eager load してしまうため、scope 定義のみここに分離する)。
 */
export const PIPELINE_SCOPES = [
  'conversation_incremental',
  'conversation_failed_items_retry',
  'code_incremental',
  'code_reconciliation',
  'bug_history_incremental',
  'review_incremental',
  'spec_incremental',
  'drift_detection',
  'embedding_backfill',
] as const;
