import type { CaravanDbConnection } from '../../db/connection/types';
import { entityId } from '../../canonical/entityId';
import { maxSeverity, type ParsedFinding } from './findingHelpers';
import type { ParsedReviewDoc } from './parseReviewDoc';
import type { ParsedReviewSession } from './parseReviewSession';
import type { CaravanLogger } from '../../logger';

export type PersistReviewStats = {
  reviews_inserted: number;
  findings_inserted: number;
  edges_inserted: number;
};

/**
 * Convert a date string (YYYY-MM-DD or ISO 8601) to ISO 8601 UTC format.
 * If already in ISO 8601 + Z format, returns as-is.
 * If YYYY-MM-DD, appends T00:00:00.000Z.
 */
export function toReviewedAt(dateStr: string): string {
  if (!dateStr) {
    return new Date().toISOString();
  }
  // Already full ISO 8601 + Z
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateStr)) {
    if (dateStr.endsWith('Z')) {
      return dateStr;
    }
    return new Date(dateStr).toISOString();
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return `${dateStr}T00:00:00.000Z`;
  }
  // fallback
  return new Date(dateStr).toISOString();
}

/**
 * Upsert a ReviewFinding entity + caravan_review_findings row + flagged edge.
 */
export function upsertReviewFinding(
  db: CaravanDbConnection,
  reviewEntityId: string,
  finding: ParsedFinding,
  recordedAt: string,
  logger: CaravanLogger,
  /**
   * 抽出元。'parser:review_doc' / 'parser:session' / 'llm:<model>' / 'agent:review'。
   * 既定の '' は「経路不明（extracted_by 配線前の旧データと同義）」であり、新規経路は
   * 必ず明示する。INSERT に含めるのは、後から UPDATE で刻むと失敗時に LLM 由来の行が
   * 書式準拠を装って残り、一括取り消しが効かなくなるため。
   */
  extractedBy = '',
): { finding_entity_id: string; inserted: boolean } {
  const findingCanonicalName = `${reviewEntityId}:${finding.finding_index}`;
  const findingEntityId = entityId('ReviewFinding', findingCanonicalName);

  try {
    // 1. INSERT OR IGNORE entity
    db.run(
      `INSERT OR IGNORE INTO caravan_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'ReviewFinding', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
      [
        findingEntityId,
        findingCanonicalName,
        finding.finding_text.slice(0, 100),
        recordedAt,
        recordedAt,
        recordedAt,
      ],
    );

    // 2. INSERT OR IGNORE caravan_review_findings
    const findingId = entityId('finding_row', `${reviewEntityId}:${finding.finding_index}`);
    db.run(
      `INSERT OR IGNORE INTO caravan_review_findings
         (id, review_id, finding_entity_id, finding_index,
          target_file_path, target_symbol, target_line_start, target_line_end,
          category, severity, finding_text, suggestion_text,
          checklist_ref, extracted_by, category_inferred_by, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        findingId,
        reviewEntityId,
        findingEntityId,
        finding.finding_index,
        finding.target_file_path ?? null,
        finding.target_symbol ?? null,
        finding.target_line_start ?? null,
        finding.target_line_end ?? null,
        finding.category,
        finding.severity,
        finding.finding_text,
        finding.suggestion_text,
        finding.checklist_ref ?? null,
        extractedBy,
        // 明示指定が無い旧経路は is_category_inferred から導出する（true = LLM 推論待ち）。
        finding.category_inferred_by ?? (finding.is_category_inferred ? 'pending_llm' : ''),
        recordedAt,
      ],
    );
    const findingInserted = db.getRowsModified() > 0;
    // INSERT OR IGNORE は CHECK / NOT NULL 違反も「その 1 行を捨てる」で処理するため、
    // 想定外の値が来ると finding が例外もログも無く落ちる（本 pipeline が塞ぎに来た
    // 「書式は満たすのに 1 件も入らない」と同じ形）。入らなかった行が既存でもないなら、
    // それは重複ではなく制約違反なので必ず記録する。
    if (!findingInserted) {
      const existing = db.exec(`SELECT 1 FROM caravan_review_findings WHERE id = ?`, [findingId]);
      if ((existing[0]?.values.length ?? 0) === 0) {
        logger.error(
          `[anytime-memory] upsertReviewFinding: 行が挿入も既存確認もできませんでした` +
            `（制約違反の疑い）id=${findingId} review=${reviewEntityId} index=${finding.finding_index} ` +
            `category=${finding.category} category_inferred_by=${finding.category_inferred_by ?? '(derived)'}`,
        );
      }
    }

    // 3. INSERT OR IGNORE edge: Review → flagged → ReviewFinding
    const edgeId = entityId('edge', `flagged:${reviewEntityId}:${findingEntityId}`);
    db.run(
      `INSERT OR IGNORE INTO caravan_edges
         (id, subject_entity_id, predicate, object_entity_id,
          valid_from, valid_to, recorded_at,
          source_type, source_ref,
          confidence, confidence_label, modality)
       VALUES (?, ?, 'flagged', ?, ?, NULL, ?, 'review', ?, 1.0, 'EXTRACTED', 'asserted')`,
      [
        edgeId,
        reviewEntityId,
        findingEntityId,
        recordedAt,
        recordedAt,
        `review_finding#${findingEntityId}`,
      ],
    );

    return { finding_entity_id: findingEntityId, inserted: findingInserted };
  } catch (err) {
    logger.error(
      `[anytime-memory] upsertReviewFinding: failed for finding_index=${finding.finding_index} review=${reviewEntityId}`,
      err,
    );
    return { finding_entity_id: findingEntityId, inserted: false };
  }
}

/**
 * 既存 caravan_reviews 行の「後から足した列」を補う。
 *
 * 対象は本文列（summary / body_excerpt）と workspace。列ごとに CASE で閉じるのは、
 * 片方だけ空の行に対して既に埋まっている方を空文字で潰さないため（frontmatter に
 * excerpt が無い .md で summary が消える）。
 *
 * **補完が要るかの判定は {@link needsReviewRowReconcile} に集約する**。判定と WHERE が
 * 割れると、片方だけを直したときに「呼ばれるのに何も起きない」状態になる。
 */
export function reconcileExistingReviewRow(
  db: CaravanDbConnection,
  reviewId: string,
  fields: { summary: string; bodyExcerpt: string; workspace?: string },
): void {
  db.run(
    `UPDATE caravan_reviews
        SET summary      = CASE WHEN summary = '' THEN ? ELSE summary END,
            body_excerpt = CASE WHEN body_excerpt = '' THEN ? ELSE body_excerpt END,
            workspace    = CASE WHEN workspace = '' THEN ? ELSE workspace END
      WHERE id = ? AND (body_excerpt = '' OR workspace = '')`,
    [fields.summary, fields.bodyExcerpt, fields.workspace ?? '', reviewId],
  );
}

/**
 * 既存行に補完が要るか。{@link reconcileExistingReviewRow} の WHERE と同一条件。
 *
 * summary を判定に含めないのは、供給源が frontmatter の optional な `excerpt` だけで、
 * 空であることが異常ではないため。含めると excerpt を持たない doc（実測 52 件中 30 件）
 * が毎回「未補完」と判定され、実行のたびに本文の再パースと no-op UPDATE と
 * 「補完した」ログを繰り返す。
 */
export function needsReviewRowReconcile(bodyExcerpt: string, workspace: string): boolean {
  return bodyExcerpt === '' || workspace === '';
}

/** review_doc の findings を upsert する。挿入 1 件につき flagged edge も 1 件増える。 */
function insertReviewDocFindings(args: {
  db: CaravanDbConnection;
  reviewEntityId: string;
  findings: ParsedReviewDoc['findings'];
  recordedAt: string;
  logger: CaravanLogger;
}): { findingsInserted: number; edgesInserted: number } {
  let findingsInserted = 0;
  let edgesInserted = 0;
  for (const finding of args.findings) {
    const result = upsertReviewFinding(
      args.db,
      args.reviewEntityId,
      finding,
      args.recordedAt,
      args.logger,
      'parser:review_doc',
    );
    if (result.inserted) {
      findingsInserted += 1;
      edgesInserted += 1; // flagged edge
    }
  }
  return { findingsInserted, edgesInserted };
}

/** targetRefs ごとに File entity を確保し reviewed_by edge を張る。挿入した edge 数を返す。 */
function insertReviewedByEdges(args: {
  db: CaravanDbConnection;
  reviewEntityId: string;
  targetRefs: ParsedReviewDoc['targetRefs'];
  relPath: string;
  recordedAt: string;
}): number {
  const { db, reviewEntityId, targetRefs, relPath, recordedAt } = args;
  let edgesInserted = 0;
  for (const targetRef of targetRefs) {
    const targetEntityId = entityId('File', targetRef);
    // Ensure File entity exists
    db.run(
      `INSERT OR IGNORE INTO caravan_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'File', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
      [targetEntityId, targetRef, targetRef, recordedAt, recordedAt, recordedAt],
    );

    const edgeId = entityId('edge', `reviewed_by:${targetEntityId}:${reviewEntityId}`);
    db.run(
      `INSERT OR IGNORE INTO caravan_edges
         (id, subject_entity_id, predicate, object_entity_id,
          valid_from, valid_to, recorded_at,
          source_type, source_ref,
          confidence, confidence_label, modality)
       VALUES (?, ?, 'reviewed_by', ?, ?, NULL, ?, 'review', ?, 1.0, 'EXTRACTED', 'asserted')`,
      [
        edgeId,
        targetEntityId,
        reviewEntityId,
        recordedAt,
        recordedAt,
        `review_doc#${relPath}`,
      ],
    );
    if (db.getRowsModified() > 0) {
      edgesInserted += 1;
    }
  }
  return edgesInserted;
}

/**
 * Upsert a review document into caravan_reviews + caravan_entities + findings + edges.
 */
export function upsertReviewDoc(
  db: CaravanDbConnection,
  doc: ParsedReviewDoc,
  relPath: string,
  sourceHash: string,
  recordedAt: string,
  logger: CaravanLogger,
): { review_id: string; is_new: boolean; findings_inserted: number; edges_inserted: number } {
  const reviewEntityId = entityId('Review', relPath);
  const reviewedAt = toReviewedAt(doc.frontmatter.date);
  let findingsInserted = 0;
  let edgesInserted = 0;

  try {
    // INSERT OR IGNORE avoids DELETE+INSERT (which would CASCADE-delete edges/findings)
    db.run(
      `INSERT OR IGNORE INTO caravan_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Review', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
      [
        reviewEntityId,
        relPath,
        doc.frontmatter.title ?? relPath,
        recordedAt,
        recordedAt,
        recordedAt,
      ],
    );
    db.run(
      `UPDATE caravan_entities SET display_name=?, last_updated_at=? WHERE id=? AND type='Review'`,
      [doc.frontmatter.title ?? relPath, recordedAt, reviewEntityId],
    );

    // Check existing source_hash（後から足した列の欠落も同時に見る）
    const existingRows = db.exec(
      `SELECT source_hash, body_excerpt, workspace FROM caravan_reviews
        WHERE source_kind='review_doc' AND source_ref=?`,
      [relPath],
    );
    const existingRow = existingRows[0]?.values?.[0];
    const existingHash = existingRow?.[0] == null ? null : String(existingRow[0]);
    // ハッシュ一致で早期 return すると後から足した列が永久に埋まらないので、
    // 補完だけ行って返す。呼び出し元 processRouteADoc にも同じ判定があり、
    // 通常はそちらが先に skip する（ここは直接呼ぶ経路のための同じ契約）。
    const needsReconcile =
      existingRow !== undefined &&
      needsReviewRowReconcile(String(existingRow[1] ?? ''), String(existingRow[2] ?? ''));

    if (existingHash !== null && existingHash === sourceHash) {
      if (needsReconcile) {
        reconcileExistingReviewRow(db, reviewEntityId, {
          summary: doc.frontmatter.excerpt ?? '',
          bodyExcerpt: doc.bodyExcerpt ?? '',
        });
      }
      return { review_id: reviewEntityId, is_new: false, findings_inserted: 0, edges_inserted: 0 };
    }

    // INSERT OR IGNORE into caravan_reviews
    db.run(
      `INSERT OR IGNORE INTO caravan_reviews
         (id, source_kind, source_ref, source_hash, review_entity_id,
          target_kind, target_refs_json, title, reviewer, severity_overall,
          summary, body_excerpt, reviewed_at, recorded_at)
       VALUES (?, 'review_doc', ?, ?, ?,
               ?, ?, ?, ?, ?,
               ?, ?, ?, ?)`,
      [
        reviewEntityId,
        relPath,
        sourceHash,
        reviewEntityId,
        doc.targetRefs.length > 0 ? 'code' : 'mixed',
        JSON.stringify(doc.targetRefs),
        doc.frontmatter.title ?? relPath,
        doc.frontmatter.reviewer ?? '',
        // frontmatter.severity を優先し、無ければ指摘群の最大重大度を採用。
        doc.frontmatter.severity ?? maxSeverity(doc.findings),
        doc.frontmatter.excerpt ?? '',
        doc.bodyExcerpt ?? '',
        reviewedAt,
        recordedAt,
      ],
    );
    const reviewInserted = db.getRowsModified() > 0;

    // If the row already existed but hash changed, update source_hash
    if (!reviewInserted && existingHash !== null && existingHash !== sourceHash) {
      db.run(
        `UPDATE caravan_reviews SET source_hash=? WHERE source_kind='review_doc' AND source_ref=?`,
        [sourceHash, relPath],
      );
    }

    // 本文列は後から追加されたため、既存行は空のまま残っている。再 ingest で補う。
    if (!reviewInserted) {
      reconcileExistingReviewRow(db, reviewEntityId, {
        summary: doc.frontmatter.excerpt ?? '',
        bodyExcerpt: doc.bodyExcerpt ?? '',
      });
    }

    // Insert findings
    const findingStats = insertReviewDocFindings({
      db,
      reviewEntityId,
      findings: doc.findings,
      recordedAt,
      logger,
    });
    findingsInserted += findingStats.findingsInserted;
    edgesInserted += findingStats.edgesInserted;

    // Insert reviewed_by edges for target refs
    edgesInserted += insertReviewedByEdges({
      db,
      reviewEntityId,
      targetRefs: doc.targetRefs,
      relPath,
      recordedAt,
    });

    return { review_id: reviewEntityId, is_new: reviewInserted, findings_inserted: findingsInserted, edges_inserted: edgesInserted };
  } catch (err) {
    logger.error(
      `[anytime-memory] upsertReviewDoc: failed for relPath=${relPath}`,
      err,
    );
    return { review_id: reviewEntityId, is_new: false, findings_inserted: 0, edges_inserted: 0 };
  }
}

/**
 * Upsert a review session into caravan_reviews + caravan_entities + findings.
 */
export function upsertReviewSession(
  db: CaravanDbConnection,
  session: ParsedReviewSession,
  recordedAt: string,
  logger: CaravanLogger,
): { review_id: string; is_new: boolean; findings_inserted: number; edges_inserted: number } {
  const sourceRef = `${session.session_id}#${session.message_uuid_start}`;
  const reviewEntityId = entityId('Review', sourceRef);
  let findingsInserted = 0;
  let edgesInserted = 0;

  try {
    // Upsert entity
    db.run(
      `INSERT OR IGNORE INTO caravan_entities
         (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
          first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Review', ?, ?, '[]', '[]', '{}', ?, ?, ?)`,
      [
        reviewEntityId,
        sourceRef,
        `Session review ${session.session_id.slice(0, 8)}`,
        recordedAt,
        recordedAt,
        recordedAt,
      ],
    );

    // INSERT OR IGNORE into caravan_reviews
    db.run(
      `INSERT OR IGNORE INTO caravan_reviews
         (id, source_kind, source_ref, source_hash, review_entity_id,
          target_kind, target_refs_json, title, reviewer, severity_overall,
          summary, body_excerpt, reviewed_at, recorded_at)
       VALUES (?, 'session', ?, '', ?,
               ?, ?, ?, ?, ?,
               ?, ?, ?, ?)`,
      [
        reviewEntityId,
        sourceRef,
        reviewEntityId,
        session.target_kind,
        JSON.stringify(session.target_refs),
        `Session review ${session.session_id.slice(0, 8)}`,
        session.reviewer,
        maxSeverity(session.findings),
        session.summary ?? '',
        session.body_excerpt ?? '',
        session.reviewed_at,
        recordedAt,
      ],
    );
    const reviewInserted = db.getRowsModified() > 0;

    // 既存行（INSERT OR IGNORE で素通りしたもの）にも本文を補う。
    // カーソルより古い行はここに来ないため、その是正は runReviewBackfill が担う
    // （CaravanDbSession.runReview から 1 回だけ起動する）。
    if (!reviewInserted) {
      reconcileExistingReviewRow(db, reviewEntityId, {
        summary: session.summary ?? '',
        bodyExcerpt: session.body_excerpt ?? '',
      });
    }

    // Insert findings
    for (const finding of session.findings) {
      const result = upsertReviewFinding(db, reviewEntityId, finding, recordedAt, logger, 'parser:session');
      if (result.inserted) {
        findingsInserted += 1;
        edgesInserted += 1;
      }
    }

    return { review_id: reviewEntityId, is_new: reviewInserted, findings_inserted: findingsInserted, edges_inserted: edgesInserted };
  } catch (err) {
    logger.error(
      `[anytime-memory] upsertReviewSession: failed for session_id=${session.session_id}`,
      err,
    );
    return { review_id: reviewEntityId, is_new: false, findings_inserted: 0, edges_inserted: 0 };
  }
}
