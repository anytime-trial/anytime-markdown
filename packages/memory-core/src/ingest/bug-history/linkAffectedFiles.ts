import type { Database } from 'sql.js';
import { canonicalize } from '../../canonical/canonicalize';
import { entityId } from '../../canonical/entityId';
import type { MemoryLogger } from '../../logger';

export interface LinkAffectedFilesInput {
  db: Database;
  bugEntityId: string;
  commitSha: string;
  repoName: string;
  recordedAt: string;
  valid_from: string;
  logger: MemoryLogger;
}

export interface LinkAffectedFilesResult {
  file_paths: string[];
  edges_inserted: number;
}

function extractPackageName(filePath: string): string {
  const match = /^packages\/([^/]+)\//.exec(filePath);
  return match ? match[1] : 'unknown';
}

export function linkAffectedFiles(input: LinkAffectedFilesInput): LinkAffectedFilesResult {
  const { db, bugEntityId, commitSha, repoName, recordedAt, valid_from, logger } = input;

  let rows: { values: unknown[][] } | undefined;
  try {
    const result = db.exec(
      `SELECT file_path FROM trail.commit_files WHERE commit_hash = ? AND repo_name = ?`,
      [commitSha, repoName]
    );
    rows = result[0];
  } catch (err) {
    logger.error(
      `[memory-core] linkAffectedFiles: failed to query commit_files for commit=${commitSha}`,
      err
    );
    return { file_paths: [], edges_inserted: 0 };
  }

  const filePaths = (rows?.values ?? []).map((r) => String(r[0]));
  let edgesInserted = 0;

  for (const filePath of filePaths) {
    const canonName = canonicalize(filePath);
    const fileId = entityId('File', canonName);
    const pkg = extractPackageName(filePath);

    try {
      db.run(
        `INSERT OR IGNORE INTO memory_entities
           (id, type, canonical_name, display_name,
            aliases_json, tags_json, attributes_json,
            first_seen_at, last_updated_at, recorded_at)
         VALUES (?, 'File', ?, ?, '[]', '[]', ?, ?, ?, ?)`,
        [
          fileId,
          canonName,
          filePath,
          JSON.stringify({ repo: repoName, package: pkg }),
          recordedAt,
          recordedAt,
          recordedAt,
        ]
      );
    } catch (err) {
      logger.error(
        `[memory-core] linkAffectedFiles: failed to upsert File entity for path=${filePath}`,
        err
      );
      continue;
    }

    const edgeIdVal = entityId('edge', `affects:${bugEntityId}:${fileId}`);
    try {
      db.run(
        `INSERT OR IGNORE INTO memory_edges
           (id, subject_entity_id, predicate, object_entity_id,
            valid_from, valid_to, recorded_at,
            source_type, source_ref,
            confidence, confidence_label, modality)
         VALUES (?, ?, 'affects', ?, ?, NULL, ?, 'bug_history', ?, 1.0, 'EXTRACTED', 'asserted')`,
        [
          edgeIdVal,
          bugEntityId,
          fileId,
          valid_from,
          recordedAt,
          `commit_files#${commitSha}`,
        ]
      );
      if (db.getRowsModified() > 0) {
        edgesInserted += 1;
      }
    } catch (err) {
      logger.error(
        `[memory-core] linkAffectedFiles: failed to insert affects edge bug=${bugEntityId} file=${fileId}`,
        err
      );
    }
  }

  return { file_paths: filePaths, edges_inserted: edgesInserted };
}
