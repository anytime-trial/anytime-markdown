import type { Database } from 'sql.js';
import type { BugEntityRow } from './buildBugEntity';
import { entityId } from '../../canonical/entityId';

export function upsertBugEntity(db: Database, row: BugEntityRow): void {
  // Use ON CONFLICT DO UPDATE (not INSERT OR REPLACE) to avoid CASCADE-deleting
  // edges that reference this entity's id.
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        summary, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Bug', ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name    = excluded.display_name,
       attributes_json = excluded.attributes_json,
       summary         = excluded.summary,
       last_updated_at = excluded.last_updated_at`,
    [
      row.id,
      row.canonical_name,
      row.display_name,
      row.aliases_json,
      row.tags_json,
      row.attributes_json,
      row.summary,
      row.first_seen_at,
      row.last_updated_at,
      row.recorded_at,
    ]
  );
}

export function upsertCommitEntity(
  db: Database,
  opts: { commitSha: string; recordedAt: string }
): string {
  const commitId = entityId('Commit', opts.commitSha);
  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Commit', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
    [commitId, opts.commitSha, opts.commitSha, opts.recordedAt, opts.recordedAt, opts.recordedAt]
  );
  return commitId;
}

export function upsertBugFix(
  db: Database,
  opts: {
    id: string;
    commitSha: string;
    bugEntityId: string;
    pkg: string;
    category: string;
    subjectSummary: string;
    affectedFilePaths: string[];
    committedAt: string;
    recordedAt: string;
    sessionId: string | null;
    introducedCommitSha: string | null;
  }
): void {
  db.run(
    `INSERT INTO memory_bug_fixes
       (id, commit_sha, bug_entity_id, package, category, subject_summary,
        affected_file_paths_json, related_session_id, introduced_commit_sha,
        committed_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       affected_file_paths_json = excluded.affected_file_paths_json,
       introduced_commit_sha    = excluded.introduced_commit_sha`,
    [
      opts.id,
      opts.commitSha,
      opts.bugEntityId,
      opts.pkg,
      opts.category,
      opts.subjectSummary,
      JSON.stringify(opts.affectedFilePaths),
      opts.sessionId,
      opts.introducedCommitSha,
      opts.committedAt,
      opts.recordedAt,
    ]
  );
}

export function insertFixesEdge(
  db: Database,
  opts: {
    commitId: string;
    bugEntityId: string;
    commitSha: string;
    validFrom: string;
    recordedAt: string;
  }
): boolean {
  const edgeId = entityId('edge', `fixes:${opts.commitId}:${opts.bugEntityId}`);
  db.run(
    `INSERT OR IGNORE INTO memory_edges
       (id, subject_entity_id, predicate, object_entity_id,
        valid_from, valid_to, recorded_at,
        source_type, source_ref,
        confidence, confidence_label, modality)
     VALUES (?, ?, 'fixes', ?, ?, NULL, ?, 'bug_history', ?, 1.0, 'EXTRACTED', 'asserted')`,
    [edgeId, opts.commitId, opts.bugEntityId, opts.validFrom, opts.recordedAt, `commit#${opts.commitSha}`]
  );
  return db.getRowsModified() > 0;
}
