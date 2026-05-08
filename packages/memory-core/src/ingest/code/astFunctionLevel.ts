import { createHash } from 'crypto';
import type { Database } from 'sql.js';
import { canonicalize } from '../../canonical/canonicalize';
import { entityId } from '../../canonical/entityId';
import type { MemoryLogger } from '../../logger';

// ── Inlined TrailGraph types ─────────────────────────────────────────────────
// trail-core is not a runtime dependency of memory-core. Types are inlined to
// avoid coupling. Keep in sync with packages/trail-core/src/model/types.ts.

type TrailNodeType =
  | 'file'
  | 'class'
  | 'interface'
  | 'function'
  | 'variable'
  | 'type'
  | 'enum'
  | 'namespace';

type TrailEdgeType =
  | 'import'
  | 'call'
  | 'type_use'
  | 'inheritance'
  | 'implementation'
  | 'override';

interface TrailNode {
  readonly id: string;
  readonly label: string;
  readonly type: TrailNodeType;
  readonly filePath: string;
  readonly line: number;
  readonly parent?: string;
}

interface TrailEdge {
  readonly source: string;
  readonly target: string;
  readonly type: TrailEdgeType;
}

interface TrailGraphMetadata {
  readonly projectRoot: string;
  readonly analyzedAt: string;
  readonly fileCount: number;
}

interface TrailGraph {
  readonly nodes: readonly TrailNode[];
  readonly edges: readonly TrailEdge[];
  readonly metadata: TrailGraphMetadata;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface AstFactInput {
  db: Database;
  repoName: string;
  graph: TrailGraph;
  commitSha: string | null;
  recordedAt: string;
  logger: MemoryLogger;
}

export interface AstFactStats {
  facts_inserted: number;
  edges_inserted: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a deterministic 16-char fact ID from the unique tuple.
 * Uses SHA-1 of "filePath#symbolPath#factType#factValue#commitSha".
 */
function factId(
  filePath: string,
  symbolPath: string | null,
  factType: string,
  factValue: string,
  commitSha: string | null
): string {
  return createHash('sha1')
    .update(`${filePath}#${symbolPath ?? ''}#${factType}#${factValue}#${commitSha ?? ''}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Generate a deterministic 16-char edge ID from subject, predicate, object entity IDs.
 */
function astEdgeId(subjectId: string, predicate: string, objectId: string): string {
  return createHash('sha1')
    .update(`${subjectId}:${predicate}:${objectId}:ast`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Upsert a memory_entities row for a File entity and return its entity ID.
 */
function upsertFileEntity(
  db: Database,
  filePath: string,
  recordedAt: string,
  logger: MemoryLogger
): string {
  const canonName = canonicalize(filePath);
  const eId = entityId('File', canonName);
  try {
    db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name,
          aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'File', ?, ?, '[]', '[]', '{}', ?, ?, ?)
       ON CONFLICT(type, canonical_name) DO UPDATE SET
         last_updated_at = excluded.last_updated_at`,
      [eId, canonName, filePath, recordedAt, recordedAt, recordedAt]
    );
  } catch (err) {
    logger.error(
      `[memory-core] astFunctionLevel: failed to upsert File entity path="${filePath}"`,
      err
    );
  }
  return eId;
}

/**
 * Upsert a memory_entities row for a Library entity and return its entity ID.
 */
function upsertLibraryEntity(
  db: Database,
  moduleName: string,
  recordedAt: string,
  logger: MemoryLogger
): string {
  const canonName = canonicalize(moduleName);
  const eId = entityId('Library', canonName);
  try {
    db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name,
          aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Library', ?, ?, '[]', '[]', '{}', ?, ?, ?)
       ON CONFLICT(type, canonical_name) DO UPDATE SET
         last_updated_at = excluded.last_updated_at`,
      [eId, canonName, moduleName, recordedAt, recordedAt, recordedAt]
    );
  } catch (err) {
    logger.error(
      `[memory-core] astFunctionLevel: failed to upsert Library entity name="${moduleName}"`,
      err
    );
  }
  return eId;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Ingests AST-level facts from a TrailGraph into memory_code_facts and
 * memory_edges.
 *
 * Processes edges of type 'import', 'call', and 'inheritance':
 * - 'import'      → fact_type='imports',  predicate='depends_on' (external Library)
 *                    or 'relates_to' (internal File)
 * - 'call'        → fact_type='calls',    predicate='relates_to'
 * - 'inheritance' → fact_type='extends',  predicate='relates_to'
 *
 * Idempotent: duplicate (file_path, symbol_path, fact_type, fact_value, commit_sha)
 * tuples are silently ignored via INSERT OR IGNORE.
 */
export function ingestAstFacts(input: AstFactInput): AstFactStats {
  const { db, repoName, graph, commitSha, recordedAt, logger } = input;

  const stats: AstFactStats = { facts_inserted: 0, edges_inserted: 0 };

  // ── Build internal file path set ─────────────────────────────────────────
  const internalFilePaths = new Set<string>();
  for (const node of graph.nodes) {
    if (node.type === 'file') {
      internalFilePaths.add(node.id);
    }
  }

  // ── Build a source-node index: node id → TrailNode ───────────────────────
  const nodeById = new Map<string, TrailNode>();
  for (const node of graph.nodes) {
    nodeById.set(node.id, node);
  }

  // ── Process edges ─────────────────────────────────────────────────────────
  for (const edge of graph.edges) {
    // Map TrailEdgeType → fact_type and predicate
    let factType: 'imports' | 'calls' | 'extends';
    let predicate: 'depends_on' | 'relates_to';

    if (edge.type === 'import') {
      factType = 'imports';
      // External if target is not in the internal file set
      const isExternal = !internalFilePaths.has(edge.target);
      predicate = isExternal ? 'depends_on' : 'relates_to';
    } else if (edge.type === 'call') {
      factType = 'calls';
      predicate = 'relates_to';
    } else if (edge.type === 'inheritance') {
      factType = 'extends';
      predicate = 'relates_to';
    } else {
      // Skip type_use, implementation, override
      continue;
    }

    // ── Resolve file_path from source node ───────────────────────────────
    const sourceNode = nodeById.get(edge.source);
    // For symbol nodes, id is "filePath#symbolName"; for file nodes, id == filePath
    const filePath = sourceNode?.filePath ?? edge.source;

    // symbol_path: if source is a symbol node, use its id; otherwise null
    const symbolPath = sourceNode && sourceNode.type !== 'file' ? sourceNode.id : null;

    // fact_value: use the target as the value (module name or symbol path)
    const factValue = edge.target;

    // ── Insert fact ───────────────────────────────────────────────────────
    const fId = factId(filePath, symbolPath, factType, factValue, commitSha);
    try {
      db.run(
        `INSERT OR IGNORE INTO memory_code_facts
           (id, repo_name, file_path, symbol_path, fact_type, fact_value,
            line_start, commit_sha, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fId,
          repoName,
          filePath,
          symbolPath ?? null,
          factType,
          factValue,
          sourceNode?.line ?? null,
          commitSha ?? null,
          recordedAt,
        ]
      );
      stats.facts_inserted += 1;
    } catch (err) {
      logger.error(
        `[memory-core] astFunctionLevel: failed to insert fact type="${factType}" ` +
          `file="${filePath}" value="${factValue}"`,
        err
      );
      continue;
    }

    // ── Upsert source entity (File) ───────────────────────────────────────
    const sourceEntityId = upsertFileEntity(db, filePath, recordedAt, logger);

    // ── Upsert target entity (File or Library) and insert edge ───────────
    let targetEntityId: string;
    if (predicate === 'depends_on') {
      // External module → Library entity
      targetEntityId = upsertLibraryEntity(db, edge.target, recordedAt, logger);
    } else {
      // Internal file or symbol → resolve to a file path for the entity
      const targetNode = nodeById.get(edge.target);
      const targetFilePath = targetNode?.filePath ?? edge.target;
      targetEntityId = upsertFileEntity(db, targetFilePath, recordedAt, logger);
    }

    // ── Insert edge (idempotent via ON CONFLICT DO NOTHING) ───────────────
    const eId = astEdgeId(sourceEntityId, predicate, targetEntityId);
    try {
      db.run(
        `INSERT INTO memory_edges
           (id, subject_entity_id, predicate, object_entity_id,
            valid_from, recorded_at, source_type, source_ref,
            confidence, confidence_label, modality)
         VALUES (?, ?, ?, ?, ?, ?, 'code', ?, 1.0, 'EXTRACTED', 'asserted')
         ON CONFLICT(id) DO NOTHING`,
        [eId, sourceEntityId, predicate, targetEntityId, recordedAt, recordedAt, `code_fact:${fId}`]
      );
      stats.edges_inserted += 1;
    } catch (err) {
      logger.error(
        `[memory-core] astFunctionLevel: failed to insert edge pred="${predicate}" ` +
          `src="${filePath}" tgt="${edge.target}"`,
        err
      );
    }
  }

  logger.info(
    `[memory-core] astFunctionLevel: repo="${repoName}" ` +
      `facts=${stats.facts_inserted} edges=${stats.edges_inserted}`
  );

  return stats;
}
