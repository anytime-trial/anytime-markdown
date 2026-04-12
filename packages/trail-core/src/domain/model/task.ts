// domain/model/task.ts — Release file and feature row types

// Database row types (snake_case, maps to SQLite columns)

export interface ReleaseFileRow {
  readonly release_tag: string;
  readonly file_path: string;
  readonly lines_added: number;
  readonly lines_deleted: number;
  readonly change_type: string;
}

export interface ReleaseFeatureRow {
  readonly release_tag: string;
  readonly feature_id: string;
  readonly feature_name: string;
  readonly role: string;
}

export interface ReleaseCoverageRow {
  readonly release_tag: string;
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
