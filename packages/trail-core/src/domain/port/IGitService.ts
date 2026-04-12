// domain/port/IGitService.ts — Git operations port

export interface MergeCommitEntry {
  readonly hash: string;
  readonly subject: string;
  readonly parentHashes: readonly string[];
  readonly mergedAt: string;
}

export interface FileStatEntry {
  readonly filePath: string;
  readonly linesAdded: number;
  readonly linesDeleted: number;
  readonly changeType: string;
}

export interface IGitService {
  getMergeCommits(): readonly MergeCommitEntry[];
  getCommitsInRange(base: string, head: string): readonly string[];
  getAggregateFileStats(commitHashes: readonly string[]): readonly FileStatEntry[];
  getVersionTags(): readonly string[];
  getTagCommitHash(tag: string): string;
  getTagsAtCommit(commitHash: string): readonly string[];
  getTagDate(tag: string): string;
  getCommitSubjects(fromTag: string, toTag: string): readonly string[];
  getDiffStats(fromTag: string, toTag: string): { filesChanged: number; linesAdded: number; linesDeleted: number };
  getFileStatsByRange(fromTag: string, toTag: string): readonly FileStatEntry[];
  getChangedPackages(fromTag: string, toTag: string): readonly string[];
  getHeadCommit(): string;
}
