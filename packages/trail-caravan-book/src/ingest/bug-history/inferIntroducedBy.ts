import * as child_process from 'node:child_process';
import { resolveGitExecutable } from '@anytime-markdown/trail-activity/gitExecutable';
import type { CaravanDbConnection } from '../../db/connection/types';
import { entityId } from '../../canonical/entityId';
import { parseFixCommit } from './parseFixCommit';
import type { CaravanLogger } from '../../logger';

export interface InferIntroducedByInput {
  db: CaravanDbConnection;
  bugEntityId: string;
  fixCommitSha: string;
  affectedFilePaths: string[];
  repoRoot: string;
  recordedAt: string;
  valid_from: string;
  logger: CaravanLogger;
}

export interface InferIntroducedByResult {
  introduced_commit_sha: string | null;
  edges_inserted: number;
}

function execFileSync(file: string, args: string[], cwd: string): string {
  return child_process.execFileSync(file, args, { cwd, encoding: 'utf8', timeout: 10000 });
}

function parseDiffHunks(diffOutput: string): number[] {
  const lines: number[] = [];
  for (const line of diffOutput.split('\n')) {
    // Match @@ -a,b +c,d @@ format - we want the old-file line numbers
    const match = /^@@ -(\d+)(?:,(\d+))? \+/.exec(line);
    if (match) {
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      for (let i = 0; i < Math.max(count, 1); i++) {
        lines.push(start + i);
      }
    }
  }
  return lines;
}

function parseBlameSha(blameOutput: string): string | null {
  const firstLine = blameOutput.split('\n')[0] ?? '';
  const sha = firstLine.slice(0, 40).trim();
  return sha.length === 40 ? sha : null;
}

function isFix(db: CaravanDbConnection, sha: string): boolean {
  try {
    const result = db.exec(
      `SELECT commit_message FROM trail.activity_session_commits WHERE commit_hash = ? LIMIT 1`,
      [sha]
    );
    const msg = result[0]?.values?.[0]?.[0] as string | undefined;
    if (!msg) return false;
    const subject = msg.split('\n')[0] ?? '';
    return parseFixCommit({ subject }) !== null;
  } catch {
    return false;
  }
}

/**
 * 修正コミットが触れた各行を git blame し、直前の変更コミット SHA を数える。
 * diff / blame の失敗はファイル・行単位で読み飛ばす（1 件の失敗で全体を止めない）。
 */
function countBlameShas(args: {
  fixCommitSha: string;
  affectedFilePaths: string[];
  repoRoot: string;
  logger: CaravanLogger;
}): Map<string, number> {
  const { fixCommitSha, affectedFilePaths, repoRoot, logger } = args;
  const shaCount = new Map<string, number>();

  for (const filePath of affectedFilePaths) {
    let diffOutput: string;
    try {
      // オプションは `--` の前に置く。後ろに置くと git は pathspec として解釈する
      // （blame は usage エラーで全滅、diff は無視されて context 付き出力になっていた。
      // テストが execFileSync をモックするため引数順の誤りは実 git でしか発現しない）
      diffOutput = execFileSync(resolveGitExecutable(), [
        'diff', '--unified=0', `${fixCommitSha}^`, fixCommitSha, '--', filePath,
      ], repoRoot);
    } catch (err) {
      logger.error(
        `[anytime-memory] inferIntroducedBy: git diff failed for file=${filePath} commit=${fixCommitSha}`,
        err
      );
      continue;
    }

    const lineNums = parseDiffHunks(diffOutput);

    for (const lineNum of lineNums) {
      let blameOutput: string;
      try {
        blameOutput = execFileSync(resolveGitExecutable(), [
          'blame', '--porcelain', '-L', `${lineNum},${lineNum}`, `${fixCommitSha}^`, '--', filePath,
        ], repoRoot);
      } catch (err) {
        logger.error(
          `[anytime-memory] inferIntroducedBy: git blame failed for file=${filePath} line=${lineNum}`,
          err
        );
        continue;
      }

      const blameSha = parseBlameSha(blameOutput);
      if (blameSha && blameSha !== fixCommitSha) {
        shaCount.set(blameSha, (shaCount.get(blameSha) ?? 0) + 1);
      }
    }
  }

  return shaCount;
}

// Find most frequent SHA that is not itself a fix commit
function bestNonFixCandidate(
  db: CaravanDbConnection,
  counts: Map<string, number>,
  exclude?: string,
): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [sha, count] of counts) {
    if (sha === exclude) continue;
    if (count > bestCount && !isFix(db, sha)) {
      bestCount = count;
      best = sha;
    }
  }
  return best;
}

/** 最頻の SHA を選ぶ。それ自体が fix コミットなら次点の非 fix へ退避する。 */
function pickIntroducedCandidate(
  db: CaravanDbConnection,
  shaCount: Map<string, number>,
): string | null {
  // Find most frequent SHA (may be a fix commit)
  let topCandidate: string | null = null;
  let topCount = 0;
  for (const [sha, count] of shaCount) {
    if (count > topCount) { topCount = count; topCandidate = sha; }
  }

  // If top candidate is itself a fix commit, fall back to next best non-fix
  return topCandidate && isFix(db, topCandidate)
    ? bestNonFixCandidate(db, shaCount, topCandidate)
    : topCandidate;
}

export function inferIntroducedBy(input: InferIntroducedByInput): InferIntroducedByResult {
  const { db, bugEntityId, fixCommitSha, affectedFilePaths, repoRoot, recordedAt, valid_from, logger } = input;

  const shaCount = countBlameShas({ fixCommitSha, affectedFilePaths, repoRoot, logger });

  if (shaCount.size === 0) {
    return { introduced_commit_sha: null, edges_inserted: 0 };
  }

  const candidate = pickIntroducedCandidate(db, shaCount);

  if (!candidate) {
    return { introduced_commit_sha: null, edges_inserted: 0 };
  }

  // Upsert Commit entity for introduced commit
  const commitId = entityId('Commit', candidate);
  try {
    db.run(
      `INSERT OR IGNORE INTO caravan_entities
         (id, type, canonical_name, display_name,
          aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Commit', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
      [commitId, candidate, candidate, recordedAt, recordedAt, recordedAt]
    );
  } catch (err) {
    logger.error(
      `[anytime-memory] inferIntroducedBy: failed to upsert Commit entity for sha=${candidate}`,
      err
    );
    return { introduced_commit_sha: candidate, edges_inserted: 0 };
  }

  // Insert introduced_by edge
  const edgeIdVal = entityId('edge', `introduced_by:${bugEntityId}:${commitId}`);
  try {
    db.run(
      `INSERT OR IGNORE INTO caravan_edges
         (id, subject_entity_id, predicate, object_entity_id,
          valid_from, valid_to, recorded_at,
          source_type, source_ref,
          confidence, confidence_label, modality)
       VALUES (?, ?, 'introduced_by', ?, ?, NULL, ?, 'bug_history', ?, 0.7, 'INFERRED', 'asserted')`,
      [edgeIdVal, bugEntityId, commitId, valid_from, recordedAt, `git_blame#${fixCommitSha}`]
    );
  } catch (err) {
    logger.error(
      `[anytime-memory] inferIntroducedBy: failed to insert introduced_by edge`,
      err
    );
    return { introduced_commit_sha: candidate, edges_inserted: 0 };
  }

  return { introduced_commit_sha: candidate, edges_inserted: 1 };
}
