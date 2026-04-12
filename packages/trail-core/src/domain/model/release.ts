// domain/model/release.ts — Trail release domain types

export interface TrailRelease {
  readonly tag: string;
  readonly releasedAt: string;
  readonly prevTag: string | null;
  readonly packageTags: readonly string[];
  readonly commitCount: number;
  readonly filesChanged: number;
  readonly linesAdded: number;
  readonly linesDeleted: number;
  readonly featCount: number;
  readonly fixCount: number;
  readonly refactorCount: number;
  readonly testCount: number;
  readonly otherCount: number;
  readonly affectedPackages: readonly string[];
  readonly durationDays: number;
}

export interface ReleaseRow {
  readonly tag: string;
  readonly released_at: string;
  readonly prev_tag: string | null;
  readonly repo_name: string;
  readonly package_tags: string;
  readonly commit_count: number;
  readonly files_changed: number;
  readonly lines_added: number;
  readonly lines_deleted: number;
  readonly feat_count: number;
  readonly fix_count: number;
  readonly refactor_count: number;
  readonly test_count: number;
  readonly other_count: number;
  readonly affected_packages: string;
  readonly duration_days: number;
  readonly resolved_at: string | null;
}
