import { createHash } from 'node:crypto';
import type { Database } from 'sql.js';
import { entityId } from '../../canonical/entityId';
import type { ParsedSpec } from './parseFrontmatter';
import type { Claim } from './extractClaims';

// ── Type defs ────────────────────────────────────────────────────────────────

export interface UpsertSpecDocInput {
  db: Database;
  parsed: ParsedSpec;
  source_hash: string;
  recordedAt: string;
}

export interface UpsertSpecDocResult {
  specDocId: string;
  specEntityId: string;
}

export interface UpsertSpecClaimsInput {
  db: Database;
  specDocId: string;
  specEntityId: string;
  claims: Claim[];
  recordedAt: string;
}

export interface UpsertSpecClaimsResult {
  entities_inserted: number;
  edges_inserted: number;
}

// ── Allowed entity types (must match CHECK constraint) ────────────────────────

const ALLOWED_ENTITY_TYPES = new Set([
  'Person', 'Project', 'Package', 'File', 'Library', 'Tool', 'Concept',
  'Decision', 'Bug', 'Task', 'Skill', 'Rule', 'Commit', 'Question',
  'Review', 'ReviewFinding',
]);

function safeEntityType(type: string): string {
  return ALLOWED_ENTITY_TYPES.has(type) ? type : 'Concept';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert YYYY-MM-DD date string to ISO 8601 UTC timestamp.
 * If already contains 'T', return as-is.
 */
function toTimestamp(dateStr: string): string {
  if (dateStr.includes('T')) {
    return dateStr.endsWith('Z') ? dateStr : `${dateStr}Z`;
  }
  return `${dateStr}T00:00:00.000Z`;
}

// ── upsertSpecDoc ─────────────────────────────────────────────────────────────

/**
 * Upsert a spec document into memory_spec_documents and create a corresponding
 * Concept entity (kind='spec_doc') in memory_entities.
 */
export function upsertSpecDoc(input: UpsertSpecDocInput): UpsertSpecDocResult {
  const { db, parsed, source_hash, recordedAt } = input;
  const { rel_path, frontmatter } = parsed;

  // specDocId: sha1(rel_path).substring(0, 16)
  const specDocId = createHash('sha1').update(rel_path).digest('hex').slice(0, 16);

  // specEntityId: entityId('Concept', rel_path)
  const specEntityId = entityId('Concept', rel_path);

  // updated_at: frontmatter.updated ?? frontmatter.date, normalized to ISO 8601
  const rawDate = frontmatter.updated ?? frontmatter.date;
  const updated_at = toTimestamp(rawDate);

  // c4_scope_json
  const c4_scope_json = JSON.stringify(frontmatter.c4Scope ?? []);

  // INSERT OR REPLACE into memory_spec_documents
  db.run(
    `INSERT OR REPLACE INTO memory_spec_documents
      (id, rel_path, type, title, c4_scope_json, updated_at, source_hash, summary, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      specDocId,
      rel_path,
      frontmatter.type,
      frontmatter.title,
      c4_scope_json,
      updated_at,
      source_hash,
      '', // summary will be updated when extractClaims result is known
      recordedAt,
    ],
  );

  // INSERT OR IGNORE Concept entity for this spec doc
  const attributes_json = JSON.stringify({ kind: 'spec_doc', rel_path });
  db.run(
    `INSERT OR IGNORE INTO memory_entities
      (id, type, canonical_name, display_name, attributes_json, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, ?, ?, ?, ?, ?)`,
    [specEntityId, rel_path, frontmatter.title, attributes_json, recordedAt, recordedAt, recordedAt],
  );

  // Link spec doc to its entity in memory_spec_doc_entities
  db.run(
    `INSERT OR IGNORE INTO memory_spec_doc_entities (spec_doc_id, entity_id, line_hint)
     VALUES (?, ?, NULL)`,
    [specDocId, specEntityId],
  );

  return { specDocId, specEntityId };
}

/**
 * Update summary of a spec document.
 */
export function updateSpecDocSummary(db: Database, specDocId: string, summary: string): void {
  db.run(`UPDATE memory_spec_documents SET summary = ? WHERE id = ?`, [summary, specDocId]);
}

// ── upsertSpecClaims ──────────────────────────────────────────────────────────

/**
 * Persist claims extracted from a spec document as memory_edges.
 * Subject and object entities are upserted into memory_entities.
 * Edges are inserted with source_type='spec' and modality from each claim.
 */
export function upsertSpecClaims(input: UpsertSpecClaimsInput): UpsertSpecClaimsResult {
  const { db, specDocId, claims, recordedAt } = input;
  let entities_inserted = 0;
  let edges_inserted = 0;

  for (const claim of claims) {
    // Resolve entity types against CHECK constraint
    const subjectType = safeEntityType(claim.subject.type);
    const objectType = safeEntityType(claim.object.type);

    const subjectId = entityId(subjectType, claim.subject.name);
    const objectId = entityId(objectType, claim.object.name);

    // Upsert subject entity
    const subjectAttr = JSON.stringify({ source: 'spec_claim', spec_doc_id: specDocId });
    db.run(
      `INSERT OR IGNORE INTO memory_entities
        (id, type, canonical_name, display_name, attributes_json, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [subjectId, subjectType, claim.subject.name, claim.subject.name, subjectAttr, recordedAt, recordedAt, recordedAt],
    );
    // sql.js Database.run() returns Database, not { changes }. Use getRowsModified via cast.
    if ((db as unknown as { getRowsModified?: () => number }).getRowsModified?.() ?? 1 > 0) {
      entities_inserted++;
    }

    // Upsert object entity
    const objectAttr = JSON.stringify({ source: 'spec_claim', spec_doc_id: specDocId });
    db.run(
      `INSERT OR IGNORE INTO memory_entities
        (id, type, canonical_name, display_name, attributes_json, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [objectId, objectType, claim.object.name, claim.object.name, objectAttr, recordedAt, recordedAt, recordedAt],
    );
    if ((db as unknown as { getRowsModified?: () => number }).getRowsModified?.() ?? 1 > 0) {
      entities_inserted++;
    }

    // Insert edge
    const edgeId = createHash('sha1')
      .update(`spec:${specDocId}:${subjectId}:${claim.predicate}:${objectId}`)
      .digest('hex')
      .slice(0, 16);

    db.run(
      `INSERT OR IGNORE INTO memory_edges
        (id, subject_entity_id, predicate, object_entity_id, object_literal,
         valid_from, recorded_at, source_type, source_ref,
         confidence, confidence_label, modality, attributes_json)
       VALUES (?, ?, ?, ?, NULL, ?, ?, 'spec', ?, ?, 'EXTRACTED', ?, '{}')`,
      [
        edgeId,
        subjectId,
        claim.predicate,
        objectId,
        recordedAt,
        recordedAt,
        `spec_doc#${specDocId}`,
        Math.max(0, Math.min(1, claim.confidence)),
        claim.modality,
      ],
    );
    if ((db as any).getRowsModified?.() > 0) {
      edges_inserted++;
    }
  }

  return { entities_inserted, edges_inserted };
}
