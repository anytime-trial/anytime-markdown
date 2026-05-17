import { existsSync } from 'node:fs';

import fg from 'fast-glob';

import type { GoldenFile } from './types';

/**
 * fast-glob で candidate ディレクトリ配下のファイルを列挙する。
 * 戻り値は candidateDir からの POSIX 相対パス。
 */
export async function listDocuments(
  rootDir: string,
  documentGlob: string,
  excludeGlobs: readonly string[],
): Promise<string[]> {
  if (!existsSync(rootDir)) return [];

  const entries = await fg(documentGlob, {
    cwd: rootDir,
    onlyFiles: true,
    dot: false,
    ignore: [...excludeGlobs],
    // POSIX 区切りで返す。Windows パスでも比較を安定化させるため
    absolute: false,
  });
  return entries;
}

export interface MatchedPair {
  /** candidate からの相対パス (golden と一致) */
  relativePath: string;
  /** golden 側 (content 付き) */
  golden: GoldenFile;
  /** candidate 側相対パス (ファイル本文は orchestrator で読み込む) */
  candidateRelativePath: string;
}

export interface PairResult {
  matched: MatchedPair[];
  /** golden にのみ存在するファイルのパス */
  unmatchedReference: string[];
  /** candidate にのみ存在するファイルのパス */
  unmatchedCandidate: string[];
}

/**
 * golden と candidate を相対パスでペアリングする。
 * 双方に存在 → matched、片側のみ → unmatched に振り分け。
 */
export function pairDocuments(
  goldenFiles: readonly GoldenFile[],
  candidateRelativePaths: readonly string[],
): PairResult {
  const goldenMap = new Map<string, GoldenFile>();
  for (const g of goldenFiles) {
    goldenMap.set(g.relativePath, g);
  }
  const candidateSet = new Set(candidateRelativePaths);

  const matched: MatchedPair[] = [];
  const unmatchedReference: string[] = [];

  for (const g of goldenFiles) {
    if (candidateSet.has(g.relativePath)) {
      matched.push({
        relativePath: g.relativePath,
        golden: g,
        candidateRelativePath: g.relativePath,
      });
    } else {
      unmatchedReference.push(g.relativePath);
    }
  }

  const unmatchedCandidate: string[] = [];
  for (const c of candidateRelativePaths) {
    if (!goldenMap.has(c)) unmatchedCandidate.push(c);
  }

  return {
    matched,
    unmatchedReference: unmatchedReference.sort(),
    unmatchedCandidate: unmatchedCandidate.sort(),
  };
}
