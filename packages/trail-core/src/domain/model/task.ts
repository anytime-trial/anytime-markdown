// domain/model/task.ts — Release file and feature row types

// Database row types (snake_case, maps to SQLite columns)

export interface ReleaseFileRow {
  readonly release_tag: string;
  // Supabase 正規化ミラー用 (additive)。release_id 代理キー。拡張ローカル UI 向けに release_tag も保持。
  readonly release_id?: number;
  readonly file_path: string;
  readonly lines_added: number;
  readonly lines_deleted: number;
  readonly change_type: string;
}

export interface ReleaseCoverageRow {
  readonly release_tag: string;
  // Supabase 正規化ミラー用 (additive)。
  readonly release_id?: number;
  readonly package: string;
  readonly file_path: string;
  readonly lines_total: number;
  readonly lines_covered: number;
  readonly lines_pct: number;
  readonly statements_total: number;
  readonly statements_covered: number;
  readonly statements_pct: number;
  readonly functions_total: number;
  readonly functions_covered: number;
  readonly functions_pct: number;
  readonly branches_total: number;
  readonly branches_covered: number;
  readonly branches_pct: number;
}

export interface CurrentCoverageRow {
  repo_name: string;
  // Supabase 正規化ミラー用 (additive)。
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
}
