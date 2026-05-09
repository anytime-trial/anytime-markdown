import type { Database } from 'sql.js';
import { entityId } from '../../canonical/entityId';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LinkAddressesInput = {
  db: Database;
  repoName: string;
  windowDays?: number; // default 30
  logger: { warn: (msg: string) => void };
};

export type LinkAddressesResult = {
  findings_linked: number;
  edges_inserted: number;
};

// ── Stop words ────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'in', 'of', 'to', 'and', 'or',
  'it', 'its', 'this', 'that', 'with', 'for', 'on', 'at',
  'by', 'are', 'was', 'be', 'as', 'from', 'not', 'but',
  'have', 'had', 'has',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract top N keywords from text (stop words removed, lowercased).
 */
function topKeywords(text: string, n: number): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      unique.push(w);
    }
  }

  return unique.slice(0, n);
}

/**
 * Extract a chapter title proxy: first line up to '.' or '\n', max 60 chars.
 */
function extractChapterTitleProxy(findingText: string): string {
  const firstLine = findingText.split('\n')[0] ?? '';
  const dotIdx = firstLine.indexOf('.');
  const raw = dotIdx >= 0 ? firstLine.slice(0, dotIdx) : firstLine;
  return raw.slice(0, 60).trim();
}

/**
 * Score a commit message against a finding.
 * Returns a numeric score (accept threshold >= 2).
 */
function scoreCommit(commitMessage: string, findingText: string): number {
  const lowerMsg = commitMessage.toLowerCase();
  const lowerFinding = findingText.toLowerCase();

  let score = 0;

  // +3: finding text (or 20-char excerpt) is a substring of commit message
  const excerpt = lowerFinding.slice(0, 20).trim();
  if (excerpt.length >= 4 && lowerMsg.includes(excerpt)) {
    score += 3;
  }

  // +2: top 3 keywords appear in commit message
  const keywords = topKeywords(findingText, 3);
  const keywordHits = keywords.filter((kw) => lowerMsg.includes(kw));
  if (keywordHits.length > 0) {
    score += 2;
  }

  // +1: chapter title proxy appears in commit message
  const titleProxy = extractChapterTitleProxy(findingText).toLowerCase();
  if (titleProxy.length > 2 && lowerMsg.includes(titleProxy)) {
    score += 1;
  }

  return score;
}

// ── Main function ─────────────────────────────────────────────────────────────

export function linkAddresses(input: LinkAddressesInput): LinkAddressesResult {
  const { db, repoName, windowDays = 30, logger } = input;
  const effectiveWindowDays = Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 30;

  let findings: Array<{
    id: string;
    finding_entity_id: string;
    target_file_path: string;
    finding_text: string;
    recorded_at: string;
  }>;

  try {
    const result = db.exec(`
      SELECT mrf.id, mrf.finding_entity_id, mrf.target_file_path,
             mrf.finding_text, mrf.recorded_at
      FROM memory_review_findings mrf
      WHERE mrf.addressed_at IS NULL
        AND mrf.target_file_path IS NOT NULL
        AND mrf.severity != 'info'
    `);

    const rows = result[0];
    if (!rows) {
      return { findings_linked: 0, edges_inserted: 0 };
    }

    findings = rows.values.map((r) => ({
      id: String(r[0]),
      finding_entity_id: String(r[1]),
      target_file_path: String(r[2]),
      finding_text: String(r[3]),
      recorded_at: String(r[4]),
    }));
  } catch (err) {
    logger.warn(
      `[memory-core] linkAddresses: failed to query review findings: ${String(err)}`
    );
    return { findings_linked: 0, edges_inserted: 0 };
  }

  let findingsLinked = 0;
  let edgesInserted = 0;

  for (const finding of findings) {
    try {
      // Query candidate commits from trail DB
      const commitResult = db.exec(
        `SELECT sc.commit_hash, sc.commit_message, sc.committed_at
         FROM trail.session_commits sc
         JOIN trail.commit_files cf ON cf.commit_hash = sc.commit_hash
                                    AND cf.repo_name = sc.repo_name
         WHERE cf.file_path = ?
           AND sc.repo_name = ?
           AND sc.committed_at >= ?
           AND sc.committed_at <= datetime(?, '+' || ? || ' days')
         ORDER BY sc.committed_at ASC`,
        [
          finding.target_file_path,
          repoName,
          finding.recorded_at,
          finding.recorded_at,
          effectiveWindowDays,
        ]
      );

      const commitRows = commitResult[0];
      if (!commitRows) {
        continue;
      }

      // Find the oldest commit that meets the score threshold
      let acceptedCommit: { commit_hash: string; committed_at: string } | null = null;

      for (const row of commitRows.values) {
        const commitHash = String(row[0]);
        const commitMessage = String(row[1]);
        const committedAt = String(row[2]);

        const score = scoreCommit(commitMessage, finding.finding_text);
        if (score >= 2) {
          acceptedCommit = { commit_hash: commitHash, committed_at: committedAt };
          break; // Take oldest (first in ASC order)
        }
      }

      if (!acceptedCommit) {
        continue;
      }

      const now = new Date().toISOString();

      // Update finding with addressed_commit_sha and addressed_at
      db.run(
        `UPDATE memory_review_findings
         SET addressed_commit_sha = ?, addressed_at = ?
         WHERE id = ?`,
        [acceptedCommit.commit_hash, now, finding.id]
      );

      // Upsert Commit entity
      const commitEntityId = entityId('Commit', acceptedCommit.commit_hash);
      db.run(
        `INSERT OR IGNORE INTO memory_entities
           (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
            first_seen_at, last_updated_at, recorded_at)
         VALUES (?, 'Commit', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
        [
          commitEntityId,
          acceptedCommit.commit_hash,
          acceptedCommit.commit_hash,
          now,
          now,
          now,
        ]
      );

      // Insert addresses edge
      const edgeId = entityId(
        'edge',
        `addresses:${commitEntityId}:${finding.finding_entity_id}`
      );
      db.run(
        `INSERT OR IGNORE INTO memory_edges
           (id, subject_entity_id, predicate, object_entity_id,
            valid_from, valid_to, recorded_at,
            source_type, source_ref,
            confidence, confidence_label, modality)
         VALUES (?, ?, 'addresses', ?, ?, NULL, ?, 'review', ?, 0.7, 'INFERRED', 'asserted')`,
        [
          edgeId,
          commitEntityId,
          finding.finding_entity_id,
          acceptedCommit.committed_at,
          now,
          `review_finding#${finding.id}`,
        ]
      );

      const edgeInserted = db.getRowsModified() > 0;
      if (edgeInserted) {
        edgesInserted += 1;
      }

      findingsLinked += 1;
    } catch (err) {
      logger.warn(
        `[memory-core] linkAddresses: failed to process finding id=${finding.id}: ${String(err)}`
      );
    }
  }

  return { findings_linked: findingsLinked, edges_inserted: edgesInserted };
}
