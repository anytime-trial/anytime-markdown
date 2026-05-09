import { createHash } from 'crypto';
import type { Database } from 'sql.js';
import { entityId } from '../../canonical/entityId';
import type { MemoryLogger } from '../../logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtractRationaleInput {
  db: Database;
  repoName: string;
  /** ISO 8601 UTC cursor for incremental runs. Pass null to process all commits. */
  sinceCommittedAt: string | null;
  recordedAt: string;
  logger: MemoryLogger;
}

export interface ExtractRationaleStats {
  decisions_inserted: number;
  edges_inserted: number;
  commits_processed: number;
}

// ── Pattern ───────────────────────────────────────────────────────────────────

/**
 * Matches Rationale: / Reason: / 理由: section in commit body (case-insensitive).
 * Uses [\s\S]+? (lazy) to capture multi-line rationale until:
 *   - a blank line (paragraph break), OR
 *   - a new section heading like "Co-authored-by:" or "Closes:", OR
 *   - end of string
 *
 * The `i` flag makes Rationale/Reason match case-insensitively.
 * The `m` flag is intentionally omitted: with `m`, `$` in the lookahead
 * matches end-of-line instead of end-of-string, causing [\s\S]+? to stop
 * after the first line and truncate multi-line rationale bodies.
 * Instead, `(?:^|\n)` is used to anchor the match at line start.
 */
const RATIONALE_PATTERN =
  /(?:^|\n)(?:Rationale|Reason|理由)\s*[：:]\s*([\s\S]+?)(?=\n\s*\n|\n[A-Z][a-z]+\s*[：:]|$)/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the rationale text from a commit message body (subject line excluded).
 * Returns null when no matching section is found.
 */
function extractRationaleText(message: string): string | null {
  // Split off the subject line (first line); operate only on body
  const newlineIdx = message.indexOf('\n');
  if (newlineIdx === -1) {
    // Single-line message — no body, subject-only commits are skipped
    return null;
  }
  const body = message.slice(newlineIdx + 1).trimStart();
  if (!body) return null;

  const match = RATIONALE_PATTERN.exec(body);
  if (!match) return null;

  const text = match[1].trim();
  return text || null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Reads `trail.session_commits` for a given repo (with optional incremental
 * cursor), extracts Rationale: / Reason: / 理由: sections from commit bodies,
 * and ingests Decision entities with `rationale_for` edges pointing to the
 * corresponding Commit entity.
 *
 * Idempotent: Decision and Commit entity IDs plus edge IDs are derived
 * deterministically from commit_hash, so re-running produces no duplicates.
 *
 * Write to trail.* is blocked by the readonly guard installed by
 * attachTrailDbFromHandle / attachTrailDbReadOnly.
 */
export function extractCommitRationale(input: ExtractRationaleInput): ExtractRationaleStats {
  const { db, repoName, sinceCommittedAt, recordedAt, logger } = input;

  const stats: ExtractRationaleStats = {
    decisions_inserted: 0,
    edges_inserted: 0,
    commits_processed: 0,
  };

  // ── 1. Read commits from trail.session_commits ────────────────────────────
  // Use prepare/bind/step because db.exec() drops params after the trail
  // readonly guard wraps it (see attach.ts installTrailReadonlyGuard).
  const sql =
    sinceCommittedAt !== null
      ? `SELECT commit_hash, commit_message, committed_at
           FROM trail.session_commits
           WHERE repo_name = ? AND committed_at > ?
           GROUP BY commit_hash
           ORDER BY committed_at`
      : `SELECT commit_hash, commit_message, committed_at
           FROM trail.session_commits
           WHERE repo_name = ?
           GROUP BY commit_hash
           ORDER BY committed_at`;

  const stmt = db.prepare(sql);
  try {
    if (sinceCommittedAt !== null) {
      stmt.bind([repoName, sinceCommittedAt]);
    } else {
      stmt.bind([repoName]);
    }

    while (stmt.step()) {
      const row = stmt.getAsObject();
      const commitHash = row['commit_hash'] as string;
      const commitMessage = row['commit_message'] as string;
      const committedAt = (row['committed_at'] as string | null) ?? recordedAt;

      stats.commits_processed += 1;

      // ── 2. Extract rationale from commit body ─────────────────────────────
      const rationaleText = extractRationaleText(commitMessage);
      if (rationaleText === null) continue;

      const text = rationaleText;

      // ── 3. Upsert Commit entity ───────────────────────────────────────────
      const commitId = entityId('Commit', commitHash);
      const commitAttributes = JSON.stringify({ committed_at: committedAt });

      try {
        // INSERT OR IGNORE (not REPLACE): Commit data is immutable. INSERT OR REPLACE
        // internally does DELETE+INSERT, which triggers ON DELETE SET NULL on
        // memory_edges.object_entity_id and then violates a NOT NULL constraint on
        // re-runs that already have edges pointing to this Commit entity.
        db.run(
          `INSERT OR IGNORE INTO memory_entities
             (id, type, canonical_name, display_name,
              aliases_json, tags_json, attributes_json,
              first_seen_at, last_updated_at, recorded_at)
           VALUES (?, 'Commit', ?, ?, '[]', '[]', ?, ?, ?, ?)`,
          [
            commitId,
            commitHash,
            commitHash.slice(0, 12),
            commitAttributes,
            committedAt,
            recordedAt,
            recordedAt,
          ]
        );
      } catch (err) {
        logger.error(
          `[memory-core] extractCommitRationale: failed to upsert Commit entity hash="${commitHash}"`,
          err
        );
        continue;
      }

      // ── 4. Insert Decision entity ─────────────────────────────────────────
      // canonical_name: sha1("commit:<repoName>:<commitHash>:rationale").slice(0,16)
      const decisionCanonName = createHash('sha1')
        .update(`commit:${repoName}:${commitHash}:rationale`)
        .digest('hex')
        .slice(0, 16);
      const decisionId = entityId('Decision', decisionCanonName);
      const summary = text.slice(0, 200);

      try {
        db.run(
          `INSERT OR IGNORE INTO memory_entities
             (id, type, canonical_name, display_name,
              aliases_json, tags_json, attributes_json, summary,
              first_seen_at, last_updated_at, recorded_at)
           VALUES (?, 'Decision', ?, ?, '[]', '[]', '{}', ?, ?, ?, ?)`,
          [
            decisionId,
            decisionCanonName,
            summary.slice(0, 80),
            summary,
            committedAt,
            recordedAt,
            recordedAt,
          ]
        );
        if (db.getRowsModified() > 0) stats.decisions_inserted += 1;
      } catch (err) {
        logger.error(
          `[memory-core] extractCommitRationale: failed to insert Decision entity hash="${commitHash}"`,
          err
        );
        continue;
      }

      // ── 5. Insert rationale_for edge: Decision → Commit ───────────────────
      const sourceRef = `session_commits#${commitHash}`;
      const edgeId = entityId(
        'edge',
        `rationale_for:${decisionId}:${commitId}:commit:${commitHash.slice(0, 8)}`
      );

      try {
        db.run(
          `INSERT INTO memory_edges
             (id, subject_entity_id, predicate, object_entity_id,
              valid_from, recorded_at, source_type, source_ref,
              confidence, confidence_label, modality)
           VALUES (?, ?, 'rationale_for', ?, ?, ?, 'code', ?, 1.0, 'EXTRACTED', 'asserted')
           ON CONFLICT(id) DO NOTHING`,
          [edgeId, decisionId, commitId, committedAt, recordedAt, sourceRef]
        );
        if (db.getRowsModified() > 0) stats.edges_inserted += 1;
      } catch (err) {
        logger.error(
          `[memory-core] extractCommitRationale: failed to insert edge hash="${commitHash}"`,
          err
        );
      }
    }
  } finally {
    stmt.free();
  }

  logger.info(
    `[memory-core] extractCommitRationale: repo="${repoName}" ` +
      `commits_processed=${stats.commits_processed} ` +
      `decisions=${stats.decisions_inserted} edges=${stats.edges_inserted}`
  );

  return stats;
}
