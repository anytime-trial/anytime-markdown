// domain/model/release.ts — Trail release domain types

export interface TrailRelease {
  readonly tag: string;
  readonly releasedAt: string;
  readonly prevTag: string | null;
  readonly repoName: string | null;
  readonly packageTags: readonly string[];
  readonly commitCount: number;
  readonly filesChanged: number;
  readonly linesAdded: number;
  readonly linesDeleted: number;
  readonly totalLines: number;
  readonly featCount: number;
  readonly fixCount: number;
  readonly refactorCount: number;
  readonly testCount: number;
  readonly otherCount: number;
  readonly affectedPackages: readonly string[];
  readonly durationDays: number;
  readonly releaseTimeMin: number | null;
}

export interface ReleaseRow {
  // release_id 代理キー (Phase B-2b-iii flip)。新スキーマでは PK。
  // getReleases() は prev_release_id → tag を解決して prev_tag に詰め直すため、
  // 外部 I/F (Supabase 同期) は従来通り tag / prev_tag を使える。
  readonly release_id?: number;
  readonly tag: string;
  readonly released_at: string;
  readonly prev_tag: string | null;
  // Supabase 正規化ミラー用 (additive)。release_id 代理キー化に伴い、prev は release_id、
  // repo は repo_id で持つ。拡張ローカル UI 向けの repo_name / prev_tag は従来通り保持する。
  readonly prev_release_id?: number | null;
  readonly repo_id?: number;
  readonly repo_name: string;
  readonly package_tags: string;
  readonly commit_count: number;
  readonly files_changed: number;
  readonly lines_added: number;
  readonly lines_deleted: number;
  readonly total_lines: number;
  readonly feat_count: number;
  readonly fix_count: number;
  readonly refactor_count: number;
  readonly test_count: number;
  readonly other_count: number;
  readonly affected_packages: string;
  readonly duration_days: number;
  readonly resolved_at: string | null;
  readonly release_time_min: number | null;
}
