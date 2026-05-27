import { createHash } from 'node:crypto';
import type { MemoryDbConnection } from '../../db/connection/types';
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
  db: MemoryDbConnection;
  repoName: string;
  graph: TrailGraph;
  commitSha: string | null;
  recordedAt: string;
  logger: MemoryLogger;
}

export interface AstFactStats {
  facts_inserted: number;
  edges_inserted: number;
  function_entities_upserted: number;
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
  db: MemoryDbConnection,
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
      `[anytime-memory] astFunctionLevel: failed to upsert File entity path="${filePath}"`,
      err
    );
  }
  return eId;
}

/**
 * Compute content hash for a Function entity. Used for embedding invalidation:
 * when filePath / symbolName / parent change, embedding is set to NULL so the
 * next runEmbeddingBackfill regenerates it.
 *
 * Future enhancement: include signature + docstring once trail-core exposes them.
 */
function computeFunctionHash(
  repoName: string,
  filePath: string,
  symbolName: string,
  parentId: string | undefined
): string {
  return createHash('sha1')
    .update(`${repoName}\n${filePath}\n${symbolName}\n${parentId ?? ''}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Upsert a memory_entities row for a Function entity.
 * Identity: (repo, filePath, symbolName, parent). Content hash invalidates
 * embedding when any of these change.
 *
 * Returns the entity ID (always defined, even on partial failure).
 */
function upsertFunctionEntity(
  db: MemoryDbConnection,
  repoName: string,
  filePath: string,
  symbolName: string,
  parentId: string | undefined,
  recordedAt: string,
  logger: MemoryLogger
): string {
  const canonName = canonicalize(`${repoName}:${filePath}::${symbolName}`);
  const eId = entityId('Function', canonName);
  const contentHash = computeFunctionHash(repoName, filePath, symbolName, parentId);
  // 現状 signature 抽出が無いため summary は最小限。trail-core が signature
  // を出すようになったらここを差し替える。
  const summary = `${symbolName} in ${filePath}`;
  try {
    db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name,
          aliases_json, tags_json, attributes_json,
          summary, content_hash, repo_name,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Function', ?, ?, '[]', '[]', '{}', ?, ?, ?, ?, ?, ?)
       ON CONFLICT(type, canonical_name) DO UPDATE SET
         display_name    = excluded.display_name,
         summary         = excluded.summary,
         last_updated_at = excluded.last_updated_at,
         valid_until     = NULL,
         repo_name       = excluded.repo_name,
         embedding       = CASE
           WHEN memory_entities.content_hash IS NULL
             OR memory_entities.content_hash != excluded.content_hash
             THEN NULL
           ELSE memory_entities.embedding
         END,
         content_hash    = excluded.content_hash`,
      [eId, canonName, symbolName, summary, contentHash, repoName, recordedAt, recordedAt, recordedAt]
    );
  } catch (err) {
    logger.error(
      `[anytime-memory] astFunctionLevel: failed to upsert Function entity ` +
        `path="${filePath}" symbol="${symbolName}"`,
      err
    );
  }
  return eId;
}

/**
 * Upsert a memory_entities row for a Library entity and return its entity ID.
 */
function upsertLibraryEntity(
  db: MemoryDbConnection,
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
      `[anytime-memory] astFunctionLevel: failed to upsert Library entity name="${moduleName}"`,
      err
    );
  }
  return eId;
}

// ── Main export ───────────────────────────────────────────────────────────────

type EdgeMeta = { factType: 'imports' | 'calls' | 'extends'; predicate: 'depends_on' | 'relates_to' };

/**
 * Maps a TrailEdge type to the fact_type and predicate used when inserting into
 * memory_code_facts / memory_edges. Returns null for edge types that should be skipped.
 */
function resolveEdgeMeta(edgeType: string, target: string, internalFilePaths: Set<string>): EdgeMeta | null {
  if (edgeType === 'import') {
    const predicate: 'depends_on' | 'relates_to' = internalFilePaths.has(target) ? 'relates_to' : 'depends_on';
    return { factType: 'imports', predicate };
  }
  if (edgeType === 'call') return { factType: 'calls', predicate: 'relates_to' };
  if (edgeType === 'inheritance') return { factType: 'extends', predicate: 'relates_to' };
  return null; // skip type_use, implementation, override
}

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
export function ingestAstFacts(input: AstFactInput): AstFactStats & { current_entity_ids: Set<string> } {
  const { db, repoName, graph, commitSha, recordedAt, logger } = input;

  const stats: AstFactStats = { facts_inserted: 0, edges_inserted: 0, function_entities_upserted: 0 };
  const currentEntityIds = new Set<string>();

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

  // ── Upsert Function entities for function / class / interface nodes ──────
  for (const node of graph.nodes) {
    if (node.type !== 'function' && node.type !== 'class' && node.type !== 'interface') {
      continue;
    }
    const fnEntityId = upsertFunctionEntity(
      db,
      repoName,
      node.filePath,
      node.label,
      node.parent,
      recordedAt,
      logger,
    );
    currentEntityIds.add(fnEntityId);
    stats.function_entities_upserted += 1;
  }

  // ── Process edges ─────────────────────────────────────────────────────────
  for (const edge of graph.edges) {
    // Map TrailEdgeType → fact_type and predicate
    const edgeMeta = resolveEdgeMeta(edge.type, edge.target, internalFilePaths);
    if (edgeMeta === null) continue; // skip type_use, implementation, override
    const { factType, predicate } = edgeMeta;

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
      if (db.getRowsModified() > 0) stats.facts_inserted += 1;
    } catch (err) {
      logger.error(
        `[anytime-memory] astFunctionLevel: failed to insert fact type="${factType}" ` +
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
      if (db.getRowsModified() > 0) stats.edges_inserted += 1;
    } catch (err) {
      logger.error(
        `[anytime-memory] astFunctionLevel: failed to insert edge pred="${predicate}" ` +
          `src="${filePath}" tgt="${edge.target}"`,
        err
      );
    }
  }

  // ── Track File entities for reconciliation ───────────────────────────────
  // upsertFileEntity is called inside the edge loop, so we collect IDs here
  // from the existing internal file set.
  for (const filePath of internalFilePaths) {
    const fileCanon = canonicalize(filePath);
    currentEntityIds.add(entityId('File', fileCanon));
  }

  logger.info(
    `[anytime-memory] astFunctionLevel: repo="${repoName}" ` +
      `facts=${stats.facts_inserted} edges=${stats.edges_inserted} ` +
      `functions=${stats.function_entities_upserted}`
  );

  return { ...stats, current_entity_ids: currentEntityIds };
}
