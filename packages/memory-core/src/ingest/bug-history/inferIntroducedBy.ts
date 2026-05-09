import * as child_process from 'child_process';
import type { Database } from 'sql.js';
import { entityId } from '../../canonical/entityId';
import { parseFixCommit } from './parseFixCommit';
import type { MemoryLogger } from '../../logger';

export interface InferIntroducedByInput {
  db: Database;
  bugEntityId: string;
  fixCommitSha: string;
  affectedFilePaths: string[];
  repoRoot: string;
  recordedAt: string;
  valid_from: string;
  logger: MemoryLogger;
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
      const count = match[2] !== undefined ? Number(match[2]) : 1;
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

function isFix(db: Database, sha: string): boolean {
  try {
    const result = db.exec(
      `SELECT commit_message FROM trail.session_commits WHERE commit_hash = ? LIMIT 1`,
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

export function inferIntroducedBy(input: InferIntroducedByInput): InferIntroducedByResult {
  const { db, bugEntityId, fixCommitSha, affectedFilePaths, repoRoot, recordedAt, valid_from, logger } = input;

  const shaCount = new Map<string, number>();

  for (const filePath of affectedFilePaths) {
    let diffOutput: string;
    try {
      diffOutput = execFileSync('git', [
        'diff', `${fixCommitSha}^`, fixCommitSha, '--', filePath, '--unified=0',
      ], repoRoot);
    } catch (err) {
      logger.error(
        `[memory-core] inferIntroducedBy: git diff failed for file=${filePath} commit=${fixCommitSha}`,
        err
      );
      continue;
    }

    const lineNums = parseDiffHunks(diffOutput);

    for (const lineNum of lineNums) {
      let blameOutput: string;
      try {
        blameOutput = execFileSync('git', [
          'blame', '-L', `${lineNum},${lineNum}`, `${fixCommitSha}^`, '--', filePath, '--porcelain',
        ], repoRoot);
      } catch (err) {
        logger.error(
          `[memory-core] inferIntroducedBy: git blame failed for file=${filePath} line=${lineNum}`,
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

  if (shaCount.size === 0) {
    return { introduced_commit_sha: null, edges_inserted: 0 };
  }

  // Find most frequent SHA
  let candidate: string | null = null;
  let maxCount = 0;
  for (const [sha, count] of shaCount) {
    if (count > maxCount) {
      maxCount = count;
      candidate = sha;
    }
  }

  // Skip if candidate is itself a fix commit
  if (candidate && isFix(db, candidate)) {
    // Try next best candidate
    shaCount.delete(candidate);
    candidate = null;
    maxCount = 0;
    for (const [sha, count] of shaCount) {
      if (count > maxCount && !isFix(db, sha)) {
        maxCount = count;
        candidate = sha;
      }
    }
  }

  if (!candidate) {
    return { introduced_commit_sha: null, edges_inserted: 0 };
  }

  // Upsert Commit entity for introduced commit
  const commitId = entityId('Commit', candidate);
  try {
    db.run(
      `INSERT OR IGNORE INTO memory_entities
         (id, type, canonical_name, display_name,
          aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Commit', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
      [commitId, candidate, candidate, recordedAt, recordedAt, recordedAt]
    );
  } catch (err) {
    logger.error(
      `[memory-core] inferIntroducedBy: failed to upsert Commit entity for sha=${candidate}`,
      err
    );
    return { introduced_commit_sha: candidate, edges_inserted: 0 };
  }

  // Insert introduced_by edge
  const edgeIdVal = entityId('edge', `introduced_by:${bugEntityId}:${commitId}`);
  try {
    db.run(
      `INSERT OR IGNORE INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id,
          valid_from, valid_to, recorded_at,
          source_type, source_ref,
          confidence, confidence_label, modality)
       VALUES (?, ?, 'introduced_by', ?, ?, NULL, ?, 'bug_history', ?, 0.7, 'INFERRED', 'asserted')`,
      [edgeIdVal, bugEntityId, commitId, valid_from, recordedAt, `git_blame#${fixCommitSha}`]
    );
  } catch (err) {
    logger.error(
      `[memory-core] inferIntroducedBy: failed to insert introduced_by edge`,
      err
    );
    return { introduced_commit_sha: candidate, edges_inserted: 0 };
  }

  return { introduced_commit_sha: candidate, edges_inserted: 1 };
}
