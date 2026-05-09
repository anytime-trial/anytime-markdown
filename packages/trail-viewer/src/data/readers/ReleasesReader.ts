import type { SupabaseClient } from '@supabase/supabase-js';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import {
  computeDeploymentFrequency,
  computeReleaseQualityTimeSeries,
} from '@anytime-markdown/trail-core/domain/metrics';
import type {
  DateRange,
  ReleaseQualityBucket,
} from '@anytime-markdown/trail-core/domain/metrics';

export class ReleasesReader {
  constructor(private readonly client: SupabaseClient) {}

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
      total_lines?: number | null;
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
      totalLines: r.total_lines ?? 0,
      featCount: r.feat_count,
      fixCount: r.fix_count,
      refactorCount: r.refactor_count,
      testCount: r.test_count,
      otherCount: r.other_count,
      affectedPackages: JSON.parse(r.affected_packages) as string[],
      durationDays: r.duration_days,
    }));
  }

  async getDeploymentFrequency(
    range: DateRange,
    bucket: 'day' | 'week',
  ): Promise<ReadonlyArray<{ bucketStart: string; value: number }>> {
    const { data } = await this.client
      .from('trail_releases')
      .select('released_at')
      .gte('released_at', range.from)
      .lte('released_at', range.to);
    const releases = (data ?? []) as Array<{ released_at: string }>;
    const { timeSeries } = computeDeploymentFrequency(
      releases.map((r) => ({ tag_date: r.released_at })),
      range,
      range,
      bucket,
    );
    return timeSeries;
  }

  async getDeploymentFrequencyQuality(
    range: DateRange,
    bucket: 'day' | 'week',
  ): Promise<ReadonlyArray<ReleaseQualityBucket>> {
    const FIX_WINDOW_MS = 168 * 60 * 60 * 1000;
    const extendedTo = new Date(new Date(range.to).getTime() + FIX_WINDOW_MS).toISOString();

    const [{ data: releaseData }, { data: commitData }] = await Promise.all([
      this.client
        .from('trail_releases')
        .select('released_at')
        .gte('released_at', range.from)
        .lte('released_at', range.to),
      this.client
        .from('trail_session_commits')
        .select('repo_name, commit_hash, subject, committed_at')
        .gte('committed_at', range.from)
        .lte('committed_at', extendedTo),
    ]);

    const releases = (releaseData ?? []) as Array<{ released_at: string }>;
    const rawCommits = (commitData ?? []) as Array<{ repo_name: string | null; commit_hash: string; subject: string; committed_at: string }>;

    const seenHashes = new Set<string>();
    const uniqueCommits = rawCommits.filter(({ repo_name, commit_hash }) => {
      const identity = `${repo_name ?? ''}:${commit_hash}`;
      if (seenHashes.has(identity)) return false;
      seenHashes.add(identity);
      return true;
    });

    const hashes = uniqueCommits.map((c) => c.commit_hash);
    let rawFiles: Array<{ repo_name?: string | null; commit_hash: string; file_path: string }> = [];
    if (hashes.length > 0) {
      const { data } = await this.client
        .from('trail_commit_files')
        .select('repo_name, commit_hash, file_path')
        .in('commit_hash', hashes);
      rawFiles = (data ?? []) as Array<{ repo_name?: string | null; commit_hash: string; file_path: string }>;
    }

    const filesByHash = new Map<string, string[]>();
    for (const { repo_name, commit_hash, file_path } of rawFiles) {
      const key = `${repo_name ?? ''}:${commit_hash}`;
      const arr = filesByHash.get(key);
      if (arr) arr.push(file_path);
      else filesByHash.set(key, [file_path]);
    }

    const commits = uniqueCommits.map(({ repo_name, commit_hash, subject, committed_at }) => ({
      hash: commit_hash,
      subject,
      committed_at,
      files: filesByHash.get(`${repo_name ?? ''}:${commit_hash}`) ?? [],
    }));

    return computeReleaseQualityTimeSeries(
      {
        releases: releases.map((r) => ({ tag_date: r.released_at })),
        commits,
      },
      range,
      bucket,
    );
  }
}
