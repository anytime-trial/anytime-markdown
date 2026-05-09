import { createHash } from 'crypto';
import * as ts from 'typescript';
import type { Database } from 'sql.js';
import { canonicalize } from '../../canonical/canonicalize';
import { entityId } from '../../canonical/entityId';
import type { MemoryLogger } from '../../logger';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExtractCommentsInput {
  db: Database;
  program: ts.Program;
  repoName: string;
  commitSha: string | null;
  recordedAt: string;
  logger: MemoryLogger;
}

export interface ExtractCommentsStats {
  decisions_inserted: number;
  edges_inserted: number;
}

// ── Pattern ──────────────────────────────────────────────────────────────────

/**
 * Matches WHY / RATIONALE / 理由 prefixes.
 * Flags: i = case-insensitive, m = multiline (^ / $ match per line).
 */
const COMMENT_PATTERN = /(?:WHY|RATIONALE|理由)\s*[:：]\s*(.+)/i;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip the outer comment delimiters from a raw comment string and return the
 * inner text.
 *
 * - Single-line (`// text`): removes the leading `//` and optional space.
 * - Multi-line (`/* text *\/`): removes `/*`, `*\/`, and any leading `*` on
 *   each inner line, then joins with a space.
 */
function commentInnerText(raw: string, kind: ts.SyntaxKind): string {
  if (kind === ts.SyntaxKind.SingleLineCommentTrivia) {
    // Strip leading //
    return raw.replace(/^\/\/\s?/, '').trim();
  }
  // Multi-line: strip /* */ and leading * per line
  const inner = raw
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, ''))
    .join('\n')
    .trim();
  return inner;
}

/**
 * Attempt to extract the name of the symbol declared by a node.
 * Returns the name string or null if not a named declaration.
 */
function namedNodeIdent(node: ts.Node): string | null {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isModuleDeclaration(node)
  ) {
    return node.name?.text ?? null;
  }
  if (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) {
    const name = node.name;
    if (ts.isIdentifier(name)) return name.text;
    return null;
  }
  if (ts.isVariableStatement(node)) {
    // e.g. const foo = ...
    const decls = node.declarationList.declarations;
    if (decls.length > 0 && ts.isIdentifier(decls[0].name)) {
      return decls[0].name.text;
    }
    return null;
  }
  return null;
}

/**
 * Upsert a File entity and return its entity ID.
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
      `[memory-core] extractComments: failed to upsert File entity path="${filePath}"`,
      err
    );
  }
  return eId;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Scans all source files in the given ts.Program for leading comments that
 * match WHY: / RATIONALE: / 理由: patterns and ingests them as Decision
 * entities with `rationale_for` edges pointing to the File (or containing
 * symbol) where the comment appears.
 *
 * Idempotent: Decision entity IDs and edge IDs are derived deterministically
 * from file path + line + comment text, so re-running produces no duplicates.
 */
export function extractDecisionComments(input: ExtractCommentsInput): ExtractCommentsStats {
  const { db, program, repoName, commitSha: _commitSha, recordedAt, logger } = input;

  const stats: ExtractCommentsStats = { decisions_inserted: 0, edges_inserted: 0 };

  for (const sourceFile of program.getSourceFiles()) {
    const filePath = sourceFile.fileName;

    // Skip declaration files and node_modules
    if (sourceFile.isDeclarationFile) continue;
    if (filePath.includes('node_modules')) continue;

    // Use getFullText() to include leading trivia (comments before first node).
    // getText() strips file-level leading trivia.
    const sourceText = sourceFile.getFullText();
    // Track processed comment positions to avoid O(N²) duplicates
    const seenCommentPositions = new Set<number>();

    // Upsert File entity once per file (not once per comment)
    const targetId = upsertFileEntity(db, filePath, recordedAt, logger);

    function visit(node: ts.Node): void {
      const commentRanges =
        ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? [];

      for (const range of commentRanges) {
        if (seenCommentPositions.has(range.pos)) continue;
        seenCommentPositions.add(range.pos);

        const raw = sourceText.slice(range.pos, range.end);
        const inner = commentInnerText(raw, range.kind);

        const match = COMMENT_PATTERN.exec(inner);
        if (!match) continue;

        const text = match[1].trim();
        if (!text) continue;

        const { line: lineZero } = sourceFile.getLineAndCharacterOfPosition(range.pos);
        const line = lineZero + 1;

        // Determine target entity: symbol name if the annotated node has one,
        // otherwise fall back to the File entity.
        const symbolName = namedNodeIdent(node);

        // Decision canonical_name: sha1(repoName:filePath:line:text) sliced to 16 chars
        const canonName = createHash('sha1')
          .update(`${repoName}:${filePath}:${line}:${text}`)
          .digest('hex')
          .slice(0, 16);

        const decisionId = entityId('Decision', canonName);
        const displayName = (symbolName ? `${symbolName}: ` : '') + text.slice(0, 80);
        const summary = text.slice(0, 200);

        // Insert Decision entity (idempotent: canonical_name + type is unique;
        // use INSERT OR IGNORE so getRowsModified() returns 1 only for new rows)
        try {
          db.run(
            `INSERT OR IGNORE INTO memory_entities
               (id, type, canonical_name, display_name,
                aliases_json, tags_json, attributes_json, summary,
                first_seen_at, last_updated_at, recorded_at)
             VALUES (?, 'Decision', ?, ?, '[]', '[]', '{}', ?, ?, ?, ?)`,
            [
              decisionId,
              canonName,
              displayName,
              summary,
              recordedAt,
              recordedAt,
              recordedAt,
            ]
          );
          if (db.getRowsModified() > 0) stats.decisions_inserted += 1;
        } catch (err) {
          logger.error(
            `[memory-core] extractComments: failed to upsert Decision entity ` +
              `file="${filePath}" line=${line}`,
            err
          );
          continue;
        }

        // Insert rationale_for edge: Decision → rationale_for → File
        const sourceRef = `code_fact:comment:${filePath}#${line}`;
        const edgeId = entityId('edge', `rationale_for:${decisionId}:${targetId}:comment:${line}`);

        try {
          db.run(
            `INSERT INTO memory_edges
               (id, subject_entity_id, predicate, object_entity_id,
                valid_from, recorded_at, source_type, source_ref,
                confidence, confidence_label, modality)
             VALUES (?, ?, 'rationale_for', ?, ?, ?, 'code', ?, 1.0, 'EXTRACTED', 'asserted')
             ON CONFLICT(id) DO NOTHING`,
            [edgeId, decisionId, targetId, recordedAt, recordedAt, sourceRef]
          );
          if (db.getRowsModified() > 0) stats.edges_inserted += 1;
        } catch (err) {
          logger.error(
            `[memory-core] extractComments: failed to insert edge ` +
              `file="${filePath}" line=${line}`,
            err
          );
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  logger.info(
    `[memory-core] extractComments: repo="${input.repoName}" ` +
      `decisions=${stats.decisions_inserted} edges=${stats.edges_inserted}`
  );

  return stats;
}
