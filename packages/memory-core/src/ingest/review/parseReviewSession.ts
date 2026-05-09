import type { Database } from 'sql.js';
import type { ParsedFinding } from './findingHelpers';
import {
  inferCategory,
  inferSeverity,
  extractBacktickPaths,
  splitIntoChapters,
  extractProblemSuggestionPairs,
} from './findingHelpers';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ParsedReviewSession = {
  session_id: string;
  message_uuid_start: string;
  message_uuid_end: string;
  subagent_invocation_id: string | null;
  reviewer: string;
  target_kind: 'spec' | 'code' | 'package' | 'release' | 'mixed';
  target_refs: string[];
  body_excerpt: string;
  findings: ParsedFinding[];
  reviewed_at: string;
};

// ── Internal row type ─────────────────────────────────────────────────────────

type MsgRow = {
  uuid: string;
  session_id: string;
  type: string;
  timestamp: string;
  text_excerpt: string;
  tool_calls: string | null;
  subagent_type: string | null;
  skill: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract target refs from tool_calls JSON array.
 * Looks for input.prompt (backtick paths), input.file_path, input.path.
 */
function extractRefsFromToolCalls(
  toolCallsJson: string | null,
  logger: { warn: (msg: string) => void },
): string[] {
  if (!toolCallsJson) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(toolCallsJson);
  } catch (err) {
    logger.warn(
      `[parseReviewSession] Failed to parse tool_calls JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const refs: string[] = [];
  for (const call of parsed) {
    if (!call || typeof call !== 'object') continue;
    const input = (call as Record<string, unknown>)['input'];
    if (!input || typeof input !== 'object') continue;
    const inp = input as Record<string, unknown>;

    if (typeof inp['prompt'] === 'string') {
      refs.push(...extractBacktickPaths(inp['prompt']));
    }
    if (typeof inp['file_path'] === 'string') {
      refs.push(inp['file_path']);
    }
    if (typeof inp['path'] === 'string') {
      refs.push(inp['path']);
    }
  }
  return refs;
}

/**
 * Infer target_kind from the list of target refs.
 */
function inferTargetKind(refs: string[]): ParsedReviewSession['target_kind'] {
  if (refs.length === 0) return 'mixed';

  const allSpec = refs.every((r) => r.startsWith('spec/'));
  if (allSpec) return 'spec';

  const allCode = refs.every((r) => r.startsWith('packages/'));
  if (allCode) return 'code';

  return 'mixed';
}

/**
 * Extract ParsedFinding array from a combined body text.
 */
function extractFindings(bodyText: string): ParsedFinding[] {
  const bodyLines = bodyText.split('\n');
  const chapters = splitIntoChapters(bodyLines);
  const findings: ParsedFinding[] = [];
  let findingIndex = 0;

  for (const chapter of chapters) {
    if (!chapter.heading) continue;

    const chapterBody = chapter.lines.join('\n');
    const pairs = extractProblemSuggestionPairs(chapter.lines);

    if (pairs.length === 0) continue;

    const { category, is_category_inferred } = inferCategory(chapter.heading);
    const severity = inferSeverity(chapterBody);

    for (const [findingText, suggestionText] of pairs) {
      findings.push({
        finding_index: findingIndex++,
        target_file_path: null,
        target_symbol: null,
        target_line_start: null,
        target_line_end: null,
        category,
        severity,
        finding_text: findingText,
        suggestion_text: suggestionText,
        chapter_path: chapter.heading,
        is_category_inferred,
      });
    }
  }

  return findings;
}

// ── Contiguous block grouping ─────────────────────────────────────────────────

/**
 * A contiguous block of messages within a session that share a review-related
 * subagent_type or skill label.
 */
type ReviewBlock = {
  session_id: string;
  rows: MsgRow[];
};

/**
 * Group messages into contiguous review blocks.
 *
 * Block boundary rules:
 * - A new block starts when `session_id` changes (different session).
 * - A new block also starts when the block label (`subagent_type ?? skill`) changes
 *   within the same session. For example, a session that contains messages with
 *   `subagent_type='code-reviewer'` followed by messages with
 *   `skill='superpowers:requesting-code-review'` will produce 2 separate blocks.
 *   This is intentional: they represent distinct review invocations even though
 *   they share a session.
 */
function groupIntoBlocks(
  rows: MsgRow[],
  logger: { warn: (msg: string) => void },
): ReviewBlock[] {
  const blocks: ReviewBlock[] = [];

  let currentSession: string | null = null;
  let currentLabel: string | null = null;
  let currentBlock: MsgRow[] = [];

  function flushBlock(): void {
    if (currentBlock.length === 0) {
      // Edge case: a boundary was detected but the accumulated block is empty.
      // This should not happen in normal operation, but guard against it.
      if (currentSession !== null) {
        logger.warn(
          `[parseReviewSession] Empty block flushed for session_id=${currentSession}, label=${currentLabel ?? 'null'}`,
        );
      }
      return;
    }
    if (currentSession !== null) {
      blocks.push({ session_id: currentSession, rows: currentBlock });
    }
    currentBlock = [];
  }

  for (const row of rows) {
    const label = row.subagent_type ?? row.skill ?? null;

    if (row.session_id !== currentSession || label !== currentLabel) {
      flushBlock();
      currentSession = row.session_id;
      currentLabel = label;
    }

    currentBlock.push(row);
  }

  flushBlock();
  return blocks;
}

// ── Main function ─────────────────────────────────────────────────────────────

const BODY_EXCERPT_MAX = 4096;

export function parseReviewSessions(input: {
  db: Database;
  sinceISO: string;
  logger: { warn: (msg: string) => void };
}): ParsedReviewSession[] {
  const { db, sinceISO, logger } = input;

  // 1. Query trail.messages for review-related messages
  const stmt = db.prepare(
    `SELECT m.uuid, m.session_id, m.type, m.timestamp,
            COALESCE(SUBSTR(m.text_content, 1, 2048), '') AS text_excerpt,
            m.tool_calls, m.subagent_type, m.skill
     FROM trail.messages m
     WHERE m.timestamp >= ?
       AND (m.subagent_type IN ('code-reviewer', 'superpowers:code-reviewer')
         OR m.skill IN ('superpowers:requesting-code-review', 'code-review-checklist', 'security-review'))
     ORDER BY m.session_id, m.timestamp`,
  );
  stmt.bind([sinceISO]);

  const allRows: MsgRow[] = [];

  while (stmt.step()) {
    const row = stmt.getAsObject();
    allRows.push({
      uuid: row['uuid'] as string,
      session_id: row['session_id'] as string,
      type: row['type'] as string,
      timestamp: row['timestamp'] as string,
      text_excerpt: (row['text_excerpt'] as string | null) ?? '',
      tool_calls: (row['tool_calls'] as string | null) ?? null,
      subagent_type: (row['subagent_type'] as string | null) ?? null,
      skill: (row['skill'] as string | null) ?? null,
    });
  }
  stmt.free();

  if (allRows.length === 0) return [];

  // 2. Group into contiguous review blocks
  const blocks = groupIntoBlocks(allRows, logger);

  // 3. Build ParsedReviewSession for each block
  const results: ParsedReviewSession[] = [];
  let blockIndexInSession = 0;
  let lastSessionId: string | null = null;

  for (const block of blocks) {
    // Track block index within session for subagent_invocation_id purposes
    if (block.session_id !== lastSessionId) {
      blockIndexInSession = 0;
      lastSessionId = block.session_id;
    } else {
      blockIndexInSession++;
    }

    const firstRow = block.rows[0];
    const lastRow = block.rows.at(-1)!;

    // Collect body_excerpt from all messages
    const parts: string[] = [];
    for (const row of block.rows) {
      if (row.text_excerpt.length > 0) {
        parts.push(row.text_excerpt);
      }
    }
    const fullBody = parts.join('\n---\n');
    const body_excerpt =
      fullBody.length > BODY_EXCERPT_MAX ? fullBody.slice(0, BODY_EXCERPT_MAX) : fullBody;

    // Collect target refs from tool_calls and user message text_excerpts
    const rawRefs: string[] = [];
    for (const row of block.rows) {
      rawRefs.push(...extractRefsFromToolCalls(row.tool_calls, logger));
      if (row.type === 'user') {
        rawRefs.push(...extractBacktickPaths(row.text_excerpt));
      }
    }
    const target_refs = Array.from(new Set(rawRefs));

    // Infer target_kind
    const target_kind = inferTargetKind(target_refs);

    // Extract findings from body_excerpt
    const findings = extractFindings(body_excerpt);

    results.push({
      session_id: block.session_id,
      message_uuid_start: firstRow.uuid,
      message_uuid_end: lastRow.uuid,
      subagent_invocation_id: null,
      reviewer: 'unknown',
      target_kind,
      target_refs,
      body_excerpt,
      findings,
      reviewed_at: firstRow.timestamp,
    });
  }

  return results;
}
