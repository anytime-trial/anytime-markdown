import { createHash } from 'node:crypto';
import type { MemoryDbConnection } from '../../db/connection/types';
import { canonicalize } from '../../canonical/canonicalize';
import { entityId } from '../../canonical/entityId';
import type { MemoryLogger } from '../../logger';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * 1 件の decision comment。analyze-child が ts.Program 走査で抽出し trail-db に
 * 永続化したものを、memory-core が読み込んで渡す（typescript 非依存）。
 */
export interface DecisionCommentItem {
  /** リポジトリルート相対パス */
  filePath: string;
  /** 1-based 行番号 */
  line: number;
  /** WHY/RATIONALE/理由 接頭辞を除いた本文 */
  text: string;
  /** コメント直後の宣言シンボル名（無ければ null） */
  symbolName: string | null;
}

export interface IngestDecisionCommentsInput {
  db: MemoryDbConnection;
  /** trail-db の code_decision_comments から読んだ comment 群 */
  comments: ReadonlyArray<DecisionCommentItem>;
  repoName: string;
  recordedAt: string;
  logger: MemoryLogger;
}

export interface ExtractCommentsStats {
  decisions_inserted: number;
  edges_inserted: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
 * trail-db から読んだ decision comment 群を Decision entity + `rationale_for` edge
 * （Decision → File）として memory DB に ingest する。
 *
 * ソースの AST 走査（ts.Program 依存）は analyze-child 側の scanDecisionComments に
 * 移設済み。本関数は typescript に依存せず、抽出済みデータを受け取って永続化のみ行う。
 *
 * 冪等: Decision entity ID / edge ID は file path + line + comment text から決定的に
 * 導出するため、再実行で重複しない（旧 extractDecisionComments と同一の canonName 計算）。
 */
export function ingestDecisionComments(input: IngestDecisionCommentsInput): ExtractCommentsStats {
  const { db, comments, repoName, recordedAt, logger } = input;

  const stats: ExtractCommentsStats = { decisions_inserted: 0, edges_inserted: 0 };
  const fileEntityCache = new Map<string, string>();

  for (const c of comments) {
    const relFilePath = c.filePath;
    const text = c.text.trim();
    if (!text) continue;

    // File entity はファイルごとに 1 回 upsert する。
    let targetId = fileEntityCache.get(relFilePath);
    if (targetId === undefined) {
      targetId = upsertFileEntity(db, relFilePath, recordedAt, logger);
      fileEntityCache.set(relFilePath, targetId);
    }

    const line = c.line;
    const canonName = createHash('sha1')
      .update(`${repoName}:${relFilePath}:${line}:${text}`)
      .digest('hex')
      .slice(0, 16);
    const decisionId = entityId('Decision', canonName);
    const displayName = (c.symbolName ? `${c.symbolName}: ` : '') + text.slice(0, 80);
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
      continue;
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

  logger.info(
    `[anytime-memory] extractComments: repo="${repoName}" ` +
      `decisions=${stats.decisions_inserted} edges=${stats.edges_inserted}`
  );

  return stats;
}
