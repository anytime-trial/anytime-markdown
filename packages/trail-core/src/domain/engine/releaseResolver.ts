// domain/engine/releaseResolver.ts — Release data parsing

import type { TrailRelease } from '../model/release';

/**
 * Conventional Commits のプレフィックスを抽出する。
 * "feat(scope): message" → "feat"
 * "fix: message" → "fix"
 * マッチしない場合は "other" を返す。
 */
export function classifyCommitType(subject: string): string {
  const match = /^(\w+)(?:\([^)]*\))?[!]?:\s/.exec(subject);
  if (!match) return 'other';
  const type = match[1].toLowerCase();
  if (['feat', 'fix', 'refactor', 'test'].includes(type)) return type;
  return 'other';
}

export interface ReleaseGitData {
  readonly tag: string;
  readonly prevTag: string | null;
  readonly releasedAt: string;
  readonly prevReleasedAt: string | null;
  readonly packageTags: readonly string[];
  readonly commitSubjects: readonly string[];
  readonly filesChanged: number;
  readonly linesAdded: number;
  readonly linesDeleted: number;
  readonly affectedPackages: readonly string[];
}

/**
 * git から取得した生データを TrailRelease に変換する。
 */
export function buildReleaseFromGitData(data: ReleaseGitData): TrailRelease {
  let featCount = 0;
  let fixCount = 0;
  let refactorCount = 0;
  let testCount = 0;
  let otherCount = 0;

  for (const subject of data.commitSubjects) {
    const type = classifyCommitType(subject);
    if (type === 'feat') featCount++;
    else if (type === 'fix') fixCount++;
    else if (type === 'refactor') refactorCount++;
    else if (type === 'test') testCount++;
    else otherCount++;
  }

  let durationDays = 0;
  if (data.prevReleasedAt) {
    const diff = new Date(data.releasedAt).getTime() - new Date(data.prevReleasedAt).getTime();
    durationDays = Math.max(0, diff / (1000 * 60 * 60 * 24));
  }

  return {
    tag: data.tag,
    releasedAt: data.releasedAt,
    prevTag: data.prevTag,
    packageTags: data.packageTags,
    commitCount: data.commitSubjects.length,
    filesChanged: data.filesChanged,
    linesAdded: data.linesAdded,
    linesDeleted: data.linesDeleted,
    featCount,
    fixCount,
    refactorCount,
    testCount,
    otherCount,
    affectedPackages: data.affectedPackages,
    durationDays,
  };
}
