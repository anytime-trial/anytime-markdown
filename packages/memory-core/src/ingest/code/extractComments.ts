import { createHash } from 'node:crypto';
import * as ts from 'typescript';
import type { MemoryDbConnection } from '../../db/connection/types';
import { canonicalize } from '../../canonical/canonicalize';
import { entityId } from '../../canonical/entityId';
import type { MemoryLogger } from '../../logger';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExtractCommentsInput {
  db: MemoryDbConnection;
  program: ts.Program;
  repoName: string;
  commitSha: string | null;
  recordedAt: string;
  /** Absolute path to the git repository root. Used to normalize file paths to relative. Defaults to process.cwd(). */
  gitRoot?: string;
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
      `[anytime-memory] extractComments: failed to upsert File entity path="${filePath}"`,
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
  const gitRoot = input.gitRoot ?? process.cwd();

  // Normalize the gitRoot to a posix-style path with trailing separator stripped
  const normalizedGitRoot = gitRoot.replaceAll('\\', '/').replace(/\/$/, '');

  /**
   * Convert an absolute TypeScript compiler path to a project-relative posix path.
   * Only normalizes when the path is actually under gitRoot; otherwise returns
   * the original absolute path unchanged (e.g. for temp-dir test fixtures).
   */
  function toRelPath(absPath: string): string {
    const normalized = absPath.replaceAll('\\', '/');
    if (normalized.startsWith(normalizedGitRoot + '/')) {
      return normalized.slice(normalizedGitRoot.length + 1);
    }
    if (normalized === normalizedGitRoot) {
      return '.';
    }
    // Path is not under gitRoot — return the absolute path as-is
    return absPath;
  }

  const stats: ExtractCommentsStats = { decisions_inserted: 0, edges_inserted: 0 };

  for (const sourceFile of program.getSourceFiles()) {
    const relFilePath = toRelPath(sourceFile.fileName);

    // Skip declaration files and node_modules
    if (sourceFile.isDeclarationFile) continue;
    if (relFilePath.includes('node_modules')) continue;

    // Use getFullText() to include leading trivia (comments before first node).
    // getText() strips file-level leading trivia.
    const sourceText = sourceFile.getFullText();
    // Track processed comment positions to avoid O(N²) duplicates
    const seenCommentPositions = new Set<number>();

    // Upsert File entity once per file (not once per comment)
    const targetId = upsertFileEntity(db, relFilePath, recordedAt, logger);

    function processCommentRange(range: ts.CommentRange, node: ts.Node): void {
      if (seenCommentPositions.has(range.pos)) return;
      seenCommentPositions.add(range.pos);

      const raw = sourceText.slice(range.pos, range.end);
      const inner = commentInnerText(raw, range.kind);
      const match = COMMENT_PATTERN.exec(inner);
      if (!match) return;

      const text = match[1].trim();
      if (!text) return;

      const { line: lineZero } = sourceFile.getLineAndCharacterOfPosition(range.pos);
      const line = lineZero + 1;
      const symbolName = namedNodeIdent(node);
      const canonName = createHash('sha1')
        .update(`${repoName}:${relFilePath}:${line}:${text}`)
        .digest('hex')
        .slice(0, 16);
      const decisionId = entityId('Decision', canonName);
      const displayName = (symbolName ? `${symbolName}: ` : '') + text.slice(0, 80);
      const summary = text.slice(0, 200);

      try {
        db.run(
          `INSERT OR IGNORE INTO memory_entities
             (id, type, canonical_name, display_name,
              aliases_json, tags_json, attributes_json, summary,
              first_seen_at, last_updated_at, recorded_at)
           VALUES (?, 'Decision', ?, ?, '[]', '[]', '{}', ?, ?, ?, ?)`,
          [decisionId, canonName, displayName, summary, recordedAt, recordedAt, recordedAt]
        );
        if (db.getRowsModified() > 0) stats.decisions_inserted += 1;
      } catch (err) {
        logger.error(
          `[anytime-memory] extractComments: failed to upsert Decision entity ` +
            `file="${relFilePath}" line=${line}`,
          err
        );
        return;
      }

      const sourceRef = `code_fact:comment:${relFilePath}#${line}`;
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
          `[anytime-memory] extractComments: failed to insert edge ` +
            `file="${relFilePath}" line=${line}`,
          err
        );
      }
    }

    function visit(node: ts.Node): void {
      const commentRanges =
        ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? [];
      for (const range of commentRanges) {
        processCommentRange(range, node);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  logger.info(
    `[anytime-memory] extractComments: repo="${input.repoName}" ` +
      `decisions=${stats.decisions_inserted} edges=${stats.edges_inserted}`
  );

  return stats;
}
