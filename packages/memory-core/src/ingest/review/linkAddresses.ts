import type { MemoryDbConnection } from '../../db/connection/types';
import { entityId } from '../../canonical/entityId';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LinkAddressesInput = {
  db: MemoryDbConnection;
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

// ── Internal types ─────────────────────────────────────────────────────────────

type FindingRow = {
  id: string;
  finding_entity_id: string;
  target_file_path: string;
  finding_text: string;
  reviewed_at: string;
};

// ── Per-finding helper ─────────────────────────────────────────────────────────

/**
 * Attempt to link one finding to the oldest qualifying commit.
 * Returns { edgeInserted: boolean } on success, null if no commit matched.
 */
function linkOneFinding(
  db: MemoryDbConnection,
  finding: FindingRow,
  repoName: string,
  effectiveWindowDays: number,
): { edgeInserted: boolean } | null {
  // Phase H-4: trail.session_commits / commit_files から repo_name 列を撤去した。
  // 窓の下限は `committed_at >= reviewed_at`（同時刻の即時修正＝同一セッション内の対処も拾う）。
  // 兄弟 linkPrecedesBugs は後続バグを探すため `> reviewed_at`（厳密大なり）で、境界差は意図的。
  const commitResult = db.exec(
    `SELECT sc.commit_hash, sc.commit_message, sc.committed_at
     FROM trail.session_commits sc
     JOIN trail.commit_files cf ON cf.commit_hash = sc.commit_hash
                                AND cf.repo_id = sc.repo_id
     JOIN trail.repos r ON r.repo_id = sc.repo_id
     WHERE cf.file_path = ?
       AND r.repo_name = ?
       AND sc.committed_at >= ?
       AND sc.committed_at <= datetime(?, '+' || ? || ' days')
     ORDER BY sc.committed_at ASC`,
    [finding.target_file_path, repoName, finding.reviewed_at, finding.reviewed_at, effectiveWindowDays]
  );

  const commitRows = commitResult[0];
  if (!commitRows) return null;

  let acceptedCommit: { commit_hash: string; committed_at: string } | null = null;
  for (const row of commitRows.values) {
    const score = scoreCommit(String(row[1]), finding.finding_text);
    if (score >= 2) {
      acceptedCommit = { commit_hash: String(row[0]), committed_at: String(row[2]) };
      break;
    }
  }
  if (!acceptedCommit) return null;

  const now = new Date().toISOString();

  db.run(
    `UPDATE memory_review_findings SET addressed_commit_sha = ?, addressed_at = ? WHERE id = ?`,
    [acceptedCommit.commit_hash, now, finding.id]
  );

  const commitEntityId = entityId('Commit', acceptedCommit.commit_hash);
  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Commit', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
    [commitEntityId, acceptedCommit.commit_hash, acceptedCommit.commit_hash, now, now, now]
  );

  const edgeId = entityId('edge', `addresses:${commitEntityId}:${finding.finding_entity_id}`);
  db.run(
    `INSERT OR IGNORE INTO memory_edges
       (id, subject_entity_id, predicate, object_entity_id,
        valid_from, valid_to, recorded_at,
        source_type, source_ref,
        confidence, confidence_label, modality)
     VALUES (?, ?, 'addresses', ?, ?, NULL, ?, 'review', ?, 0.7, 'INFERRED', 'asserted')`,
    [edgeId, commitEntityId, finding.finding_entity_id, acceptedCommit.committed_at, now, `review_finding#${finding.id}`]
  );

  return { edgeInserted: db.getRowsModified() > 0 };
}

// ── Main function ─────────────────────────────────────────────────────────────

export function linkAddresses(input: LinkAddressesInput): LinkAddressesResult {
  const { db, repoName, windowDays = 30, logger } = input;
  const effectiveWindowDays = Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 30;

  let findings: FindingRow[];

  try {
    // コミット窓のアンカーは memory_reviews.reviewed_at（実レビュー時刻）を使う。
    // memory_review_findings.recorded_at は ingest 時刻なので、一括 re-ingest 後に
    // 全 finding が「今日」付けとなり、reviewed_at 直後の修正コミットを取りこぼす（誤り）。
    // linkPrecedesBugs と同じ修正。
    const result = db.exec(`
      SELECT mrf.id, mrf.finding_entity_id, mrf.target_file_path,
             mrf.finding_text, r.reviewed_at
      FROM memory_review_findings mrf
      JOIN memory_reviews r ON r.id = mrf.review_id
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
      reviewed_at: String(r[4]),
    }));
  } catch (err) {
    logger.warn(
      `[anytime-memory] linkAddresses: failed to query review findings: ${String(err)}`
    );
    return { findings_linked: 0, edges_inserted: 0 };
  }

  let findingsLinked = 0;
  let edgesInserted = 0;

  for (const finding of findings) {
    try {
      const result = linkOneFinding(db, finding, repoName, effectiveWindowDays);
      if (result !== null) {
        findingsLinked += 1;
        if (result.edgeInserted) edgesInserted += 1;
      }
    } catch (err) {
      logger.warn(
        `[anytime-memory] linkAddresses: failed to process finding id=${finding.id}: ${String(err)}`
      );
    }
  }

  return { findings_linked: findingsLinked, edges_inserted: edgesInserted };
}
