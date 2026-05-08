import { createHash } from 'crypto';
import type { Database } from 'sql.js';
import { canonicalize } from '../../canonical/canonicalize';
import { entityId } from '../../canonical/entityId';
import type { MemoryLogger } from '../../logger';

// ── Subset of trail-core CodeGraph types needed here ────────────────────────
// (trail-core is not a dependency of memory-core; types are inlined to avoid
// coupling. Keep in sync with packages/trail-core/src/codeGraph.ts.)
interface CodeGraphNode {
  readonly id: string;
  readonly label: string;
  readonly repo: string;
  readonly package: string;
  readonly fileType: 'code' | 'document';
  readonly community: number;
  readonly communityLabel: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

interface CodeGraph {
  readonly generatedAt: string;
  readonly nodes: readonly CodeGraphNode[];
}

export interface FromTrailGraphStats {
  packages_upserted: number;
  files_upserted: number;
  edges_inserted: number;
  repo_name: string;
}

/**
 * Generates a deterministic edge ID from subject, predicate, and object entity IDs.
 * Stable: same inputs always produce the same ID.
 */
function codeEdgeId(subjectId: string, predicate: string, objectId: string): string {
  return createHash('sha1')
    .update(`${subjectId}:${predicate}:${objectId}:code`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Reads `trail.current_code_graphs` for a given repo and upserts
 * Package / File entities plus Package→relates_to→File edges into
 * the memory DB.
 *
 * Idempotent: re-running with the same graph_json does not change row counts.
 */
export function fromTrailGraph(opts: {
  db: Database;
  repoName: string;
  recordedAt: string;
  logger: MemoryLogger;
}): FromTrailGraphStats {
  const { db, repoName, recordedAt, logger } = opts;

  const stats: FromTrailGraphStats = {
    packages_upserted: 0,
    files_upserted: 0,
    edges_inserted: 0,
    repo_name: repoName,
  };

  // ── 1. Read graph_json from trail.current_code_graphs ────────────────────
  // Use prepare/bind/step instead of parameterized exec() because the
  // installTrailReadonlyGuard wraps db.exec() but drops the params argument.
  let graphJson: string | null = null;
  const stmt = db.prepare(
    `SELECT graph_json FROM trail.current_code_graphs WHERE repo_name = ?`
  );
  try {
    stmt.bind([repoName]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      graphJson = row['graph_json'] as string;
    }
  } finally {
    stmt.free();
  }

  if (graphJson === null) {
    logger.info(
      `[memory-core] fromTrailGraph: no graph found for repo_name="${repoName}"`
    );
    return stats;
  }

  let graph: CodeGraph;
  try {
    graph = JSON.parse(graphJson) as CodeGraph;
  } catch (err) {
    logger.error(
      `[memory-core] fromTrailGraph: failed to parse graph_json for repo_name="${repoName}"`,
      err
    );
    return stats;
  }

  const codeNodes = graph.nodes.filter(
    (n: CodeGraphNode) => n.fileType === 'code'
  );

  if (codeNodes.length === 0) {
    logger.info(
      `[memory-core] fromTrailGraph: no code nodes found for repo_name="${repoName}"`
    );
    return stats;
  }

  // ── 2. Collect unique packages ───────────────────────────────────────────
  const packageNames = new Set<string>();
  for (const node of codeNodes) {
    if (node.package) {
      packageNames.add(node.package);
    }
  }

  // ── 3. Upsert Package entities ───────────────────────────────────────────
  const packageIdMap = new Map<string, string>(); // package name → entity id

  for (const pkgName of packageNames) {
    const canonName = canonicalize(pkgName);
    const eId = entityId('Package', canonName);
    packageIdMap.set(pkgName, eId);

    try {
      db.run(
        `INSERT INTO memory_entities
           (id, type, canonical_name, display_name,
            aliases_json, tags_json, attributes_json,
            first_seen_at, last_updated_at, recorded_at)
         VALUES (?, 'Package', ?, ?, '[]', '[]', '{}', ?, ?, ?)
         ON CONFLICT(type, canonical_name) DO UPDATE SET
           last_updated_at = excluded.last_updated_at`,
        [eId, canonName, pkgName, recordedAt, recordedAt, recordedAt]
      );
      stats.packages_upserted += 1;
    } catch (err) {
      logger.error(
        `[memory-core] fromTrailGraph: failed to upsert Package entity name="${pkgName}"`,
        err
      );
    }
  }

  // ── 4. Upsert File entities and insert Package→relates_to→File edges ─────
  for (const node of codeNodes) {
    const fileCanonName = canonicalize(node.id);
    const fileEId = entityId('File', fileCanonName);

    try {
      db.run(
        `INSERT INTO memory_entities
           (id, type, canonical_name, display_name,
            aliases_json, tags_json, attributes_json,
            first_seen_at, last_updated_at, recorded_at)
         VALUES (?, 'File', ?, ?, '[]', '[]', '{}', ?, ?, ?)
         ON CONFLICT(type, canonical_name) DO UPDATE SET
           last_updated_at = excluded.last_updated_at`,
        [fileEId, fileCanonName, node.id, recordedAt, recordedAt, recordedAt]
      );
      stats.files_upserted += 1;
    } catch (err) {
      logger.error(
        `[memory-core] fromTrailGraph: failed to upsert File entity id="${node.id}"`,
        err
      );
      continue;
    }

    // Insert Package→relates_to→File edge if package is known
    if (node.package) {
      const pkgEId = packageIdMap.get(node.package);
      if (pkgEId === undefined) {
        logger.error(
          `[memory-core] fromTrailGraph: package entity not found for package="${node.package}" file="${node.id}"`
        );
        continue;
      }

      const edId = codeEdgeId(pkgEId, 'relates_to', fileEId);

      try {
        db.run(
          `INSERT INTO memory_edges
             (id, subject_entity_id, predicate, object_entity_id,
              valid_from, recorded_at, source_type, source_ref,
              confidence, confidence_label, modality)
           VALUES (?, ?, 'relates_to', ?, ?, ?, 'code', ?, 1.0, 'EXTRACTED', 'asserted')
           ON CONFLICT(id) DO NOTHING`,
          [edId, pkgEId, fileEId, recordedAt, recordedAt, repoName]
        );
        stats.edges_inserted += 1;
      } catch (err) {
        logger.error(
          `[memory-core] fromTrailGraph: failed to insert edge pkg="${node.package}" → file="${node.id}"`,
          err
        );
      }
    }
  }

  logger.info(
    `[memory-core] fromTrailGraph: repo="${repoName}" packages=${stats.packages_upserted} ` +
      `files=${stats.files_upserted} edges=${stats.edges_inserted}`
  );

  return stats;
}
