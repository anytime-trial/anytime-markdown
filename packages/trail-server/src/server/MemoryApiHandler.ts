import { BetterSqlite3MemoryDb, attachTrailDbReadOnly, getMemoryCoreDbPath, resolveDrift } from '@anytime-markdown/memory-core';
import type { MemoryDbConnection, MemoryDbSqlValue as SqlValue } from '@anytime-markdown/memory-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { RationaleNode } from '@anytime-markdown/trail-core';
import type { Logger } from '../runtime/Logger';

// ---------------------------------------------------------------------------
//  Row types (mirrored in trail-viewer/src/data/types.ts)
// ---------------------------------------------------------------------------

export interface DriftEventRow {
  id: string;
  subjectEntityId: string;
  subjectDisplayName: string;
  predicate: string;
  driftType: string;
  severity: string;
  conversationValue: string | null;
  specValue: string | null;
  codeValue: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  resolutionNote: string;
}

export interface DriftEventDetail extends DriftEventRow {
  detailJson: unknown;
}

export interface RecurringBugRow {
  id: string;
  subjectEntityId: string;
  subjectDisplayName: string;
  driftType: string;
  severity: string;
  detectedAt: string;
}

export interface BugHistoryRow {
  id: string;
  commitSha: string;
  bugEntityId: string;
  package: string;
  category: string;
  subjectSummary: string;
  sessionId: string | null;
  precededByFindingIds: string[];
  committedAt: string;
}

export interface BugCausalInfo {
  bugEntityId: string;
  subject: string;
  category: string;
  commitSha: string;
  committedAt: string;
  affectedFilePaths: string[];
  rootCauses: { entityId: string; displayName: string }[];
  siblingBugEntityIds: string[];
  precedingFindings: { findingEntityId: string; targetFilePath: string | null; severity: string }[];
  introducedByCommitSha: string | null;
  introducedByCommitSubject: string | null;
}

export interface UnaddressedReviewFindingRow {
  id: string;
  reviewId: string;
  targetFilePath: string | null;
  category: string;
  severity: string;
  findingText: string;
  recordedAt: string;
}

export interface ReviewHistoryRow {
  id: string;
  reviewId: string;
  findingEntityId: string;
  title: string;
  reviewer: string;
  sourceKind: string;
  model: string | null;
  sessionId: string | null;
  reviewedAt: string;
  targetFilePath: string | null;
  category: string;
  severity: string;
  findingText: string;
  addressedCommitSha: string | null;
  addressedAt: string | null;
  precedesBugEntityIds: string[];
}

export type PipelineRunStatus = 'error' | 'partial' | 'success' | 'running';

export interface PipelineRunStatsByDayRow {
  day: string;
  scope: string;
  runs: number;
  durationSec: number;
  itemsProcessed: number;
  worstStatus: PipelineRunStatus;
}

export interface FailedItemRow {
  scope: string;
  itemKey: string;
  failedAt: string;
  reason: string;
  attemptCount: number;
}

export interface TopEntityRow {
  id: string;
  type: string;
  canonicalName: string;
  displayName: string;
  lastUpdatedAt: string;
}

export interface InvalidationRow {
  id: string;
  edgeId: string;
  invalidatedAt: string;
  reason: string;
  supersedingEdgeId: string | null;
}

// ---------------------------------------------------------------------------
//  Helper
// ---------------------------------------------------------------------------

function clampLimit(limit: number | undefined, def: number): number {
  return Math.min(limit ?? def, 200);
}

function toBindParams(arr: unknown[]): SqlValue[] {
  return arr as SqlValue[];
}

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

function toNullStr(v: unknown): string | null {
  return v == null ? null : String(v);
}

function toNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

/** Map sql.js exec result row to typed object via column name */
function mapRow<T>(columns: ReadonlyArray<string>, values: ReadonlyArray<unknown>): T {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]] = values[i];
  }
  return obj as T;
}

// ---------------------------------------------------------------------------
//  MemoryApiHandler
// ---------------------------------------------------------------------------

export class MemoryApiHandler {
  private readonly dbPath: string | undefined;
  private readonly logger: Logger;
  /**
   * 読み取り専用接続は lazy 初期化して使い回す。BetterSqlite3 は WAL モードで
   * 別接続からの書き込みを snapshot 経由で見られるため、cache の invalidate は不要。
   */
  private cachedReadOnlyDb: MemoryDbConnection | null = null;

  /** trail.db が cachedReadOnlyDb に ATTACH 済みか（session レビューの model 取得用） */
  private trailDbAttached = false;

  /**
   * better-sqlite3 の native binary 絶対パス。webpack-bundled VS Code 拡張で
   * bindings package が call stack から `.node` を推測できず crash する問題の
   * 回避策 (memory-core / TrailDatabase と同パターン)。
   * 未指定なら bindings の通常解決 (= テスト・スタンドアロン用途) に任せる。
   */
  private readonly nativeBinding?: string;

  constructor(logger: Logger, dbPath?: string, nativeBinding?: string) {
    this.logger = logger;
    // dbPath が明示されなければ getMemoryCoreDbPath() を遅延 fallback として呼ぶ。
    // VS Code 拡張のように保護領域 cwd では Error throw されるが、その場合は dbPath=undefined にして
    // 全 API レスポンスを "not configured" (exists:false / null) として返す。
    if (dbPath) {
      this.dbPath = dbPath;
    } else {
      try {
        this.dbPath = getMemoryCoreDbPath();
      } catch (err) {
        this.logger.warn(`[MemoryApiHandler] memory-core.db path not resolvable: ${err instanceof Error ? err.message : String(err)}`);
        this.dbPath = undefined;
      }
    }
    this.nativeBinding = nativeBinding;
  }

  // ---- status ----

  async handleStatus(): Promise<{ exists: boolean }> {
    return { exists: this.dbPath ? fs.existsSync(this.dbPath) : false };
  }

  /** 共有 read-only 接続を解放する。daemon 停止時に呼ぶ。 */
  dispose(): void {
    if (this.cachedReadOnlyDb) {
      try {
        this.cachedReadOnlyDb.close();
      } catch (err) {
        this.logger.warn(`[MemoryApiHandler.dispose] close failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      this.cachedReadOnlyDb = null;
    }
  }

  // ---- open helpers ----

  private openReadOnly(): MemoryDbConnection | null {
    if (this.cachedReadOnlyDb) return this.cachedReadOnlyDb;
    if (!this.dbPath || !fs.existsSync(this.dbPath)) return null;
    try {
      this.cachedReadOnlyDb = new BetterSqlite3MemoryDb({
        filePath: this.dbPath,
        readOnly: true,
        ...(this.nativeBinding ? { nativeBinding: this.nativeBinding } : {}),
      });
      const trailDbPath = path.join(path.dirname(this.dbPath), 'trail.db');
      if (fs.existsSync(trailDbPath)) {
        // attachTrailDbReadOnly は async。同期 try/catch では reject を捕捉できない (S4822) ため
        // .catch() で拒否を処理する。楽観的に true をセットし、失敗時に false へ戻す。
        this.trailDbAttached = true;
        attachTrailDbReadOnly(this.cachedReadOnlyDb, trailDbPath).catch((err) => {
          this.trailDbAttached = false;
          this.logger.warn(`[MemoryApiHandler.openReadOnly] trail.db attach failed: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
      return this.cachedReadOnlyDb;
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.openReadOnly] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return null;
    }
  }

  private openReadWrite(): MemoryDbConnection | null {
    if (!this.dbPath || !fs.existsSync(this.dbPath)) return null;
    try {
      const db = new BetterSqlite3MemoryDb({
        filePath: this.dbPath,
        readOnly: false,
        ...(this.nativeBinding ? { nativeBinding: this.nativeBinding } : {}),
      });
      db.run('PRAGMA foreign_keys = ON');
      return db;
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.openReadWrite] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return null;
    }
  }

  /**
   * read-only 共有接続は close しない (dispose 時に一括 close)。
   * read-write 接続のみ close する。両者を区別してミスを防ぐためのヘルパー。
   */
  private close(db: MemoryDbConnection): void {
    if (db === this.cachedReadOnlyDb) return;
    db.close();
  }

  // ---- drift events ----

  async listDriftEvents(params: {
    unresolvedOnly?: boolean;
    severity?: string;
    driftType?: string;
    since?: string;
    limit?: number;
  }): Promise<DriftEventRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const limit = clampLimit(params.limit, 50);
      const conditions: string[] = [];
      const bindValues: unknown[] = [];

      if (params.unresolvedOnly !== false) {
        conditions.push('de.resolved_at IS NULL');
      }
      if (params.severity) {
        conditions.push('de.severity = ?');
        bindValues.push(params.severity);
      }
      if (params.driftType) {
        conditions.push('de.drift_type = ?');
        bindValues.push(params.driftType);
      }
      if (params.since) {
        conditions.push('de.detected_at >= ?');
        bindValues.push(params.since);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      bindValues.push(limit);

      const sql = `
        SELECT de.id, de.subject_entity_id, COALESCE(e.display_name, e.canonical_name, '') AS subject_display_name,
               de.predicate, de.drift_type, de.severity,
               de.conversation_value, de.spec_value, de.code_value,
               de.detected_at, de.resolved_at, de.resolution_note
        FROM memory_drift_events de
        LEFT JOIN memory_entities e ON e.id = de.subject_entity_id
        ${where}
        ORDER BY de.detected_at DESC
        LIMIT ?
      `;

      const result = db.exec(sql, toBindParams(bindValues));
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        return {
          id: toStr(r['id']),
          subjectEntityId: toStr(r['subject_entity_id']),
          subjectDisplayName: toStr(r['subject_display_name']),
          predicate: toStr(r['predicate']),
          driftType: toStr(r['drift_type']),
          severity: toStr(r['severity']),
          conversationValue: toNullStr(r['conversation_value']),
          specValue: toNullStr(r['spec_value']),
          codeValue: toNullStr(r['code_value']),
          detectedAt: toStr(r['detected_at']),
          resolvedAt: toNullStr(r['resolved_at']),
          resolutionNote: toStr(r['resolution_note']),
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.listDriftEvents] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  async getDriftEventDetail(eventId: string): Promise<DriftEventDetail | null> {
    const db = this.openReadOnly();
    if (!db) return null;
    try {
      const result = db.exec(
        `SELECT de.id, de.subject_entity_id, COALESCE(e.display_name, e.canonical_name, '') AS subject_display_name,
                de.predicate, de.drift_type, de.severity,
                de.conversation_value, de.spec_value, de.code_value,
                de.detected_at, de.resolved_at, de.resolution_note, de.detail_json
         FROM memory_drift_events de
         LEFT JOIN memory_entities e ON e.id = de.subject_entity_id
         WHERE de.id = ?`,
        [eventId],
      );
      if (!result[0]?.values[0]) return null;
      const { columns, values } = result[0];
      const r = mapRow<Record<string, unknown>>(columns, values[0]);
      let detailJson: unknown = {};
      try {
        detailJson = JSON.parse(toStr(r['detail_json']) || '{}');
      } catch {
        detailJson = {};
      }
      return {
        id: toStr(r['id']),
        subjectEntityId: toStr(r['subject_entity_id']),
        subjectDisplayName: toStr(r['subject_display_name']),
        predicate: toStr(r['predicate']),
        driftType: toStr(r['drift_type']),
        severity: toStr(r['severity']),
        conversationValue: toNullStr(r['conversation_value']),
        specValue: toNullStr(r['spec_value']),
        codeValue: toNullStr(r['code_value']),
        detectedAt: toStr(r['detected_at']),
        resolvedAt: toNullStr(r['resolved_at']),
        resolutionNote: toStr(r['resolution_note']),
        detailJson,
      };
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.getDriftEventDetail] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return null;
    } finally {
      this.close(db);
    }
  }

  async resolveDriftEvent(eventId: string, resolutionNote: string): Promise<{ ok: boolean }> {
    const db = this.openReadWrite();
    if (!db) return { ok: false };
    try {
      const result = resolveDrift({ db, event_id: eventId, resolution_note: resolutionNote, logger: this.logger });
      this.close(db);
      return { ok: result.resolved };
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.resolveDriftEvent] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      this.close(db);
      return { ok: false };
    }
  }

  // ---- recurring bugs ----

  async listRecurringBugs(params: {
    package?: string;
    windowDays?: number;
    limit?: number;
  }): Promise<RecurringBugRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const limit = clampLimit(params.limit, 50);
      const conditions: string[] = [
        `de.drift_type IN ('regression_cluster','spec_violation_cluster','recurring_root_cause')`,
        `de.resolved_at IS NULL`,
      ];
      const bindValues: unknown[] = [];
      if (params.windowDays) {
        conditions.push(`de.detected_at >= datetime('now', '-' || ? || ' days')`);
        bindValues.push(params.windowDays);
      }
      bindValues.push(limit);
      const result = db.exec(
        `SELECT de.id, de.subject_entity_id, COALESCE(e.display_name, e.canonical_name, '') AS subject_display_name,
                de.drift_type, de.severity, de.detected_at
         FROM memory_drift_events de
         LEFT JOIN memory_entities e ON e.id = de.subject_entity_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY de.detected_at DESC
         LIMIT ?`,
        toBindParams(bindValues),
      );
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        return {
          id: toStr(r['id']),
          subjectEntityId: toStr(r['subject_entity_id']),
          subjectDisplayName: toStr(r['subject_display_name']),
          driftType: toStr(r['drift_type']),
          severity: toStr(r['severity']),
          detectedAt: toStr(r['detected_at']),
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.listRecurringBugs] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  // ---- bug history ----

  async getBugHistory(params: {
    package?: string;
    filePath?: string;
    category?: string;
    limit?: number;
  }): Promise<BugHistoryRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const limit = clampLimit(params.limit, 50);
      const conditions: string[] = [];
      const bindValues: unknown[] = [];
      if (params.package) {
        conditions.push('bf.package = ?');
        bindValues.push(params.package);
      }
      if (params.category) {
        conditions.push('bf.category = ?');
        bindValues.push(params.category);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      bindValues.push(limit);
      const result = db.exec(
        `SELECT bf.id, bf.commit_sha, bf.bug_entity_id, bf.package, bf.category,
                bf.subject_summary, bf.related_session_id, bf.committed_at,
                (SELECT GROUP_CONCAT(e.subject_entity_id)
                 FROM memory_edges e
                 WHERE e.predicate='precedes' AND e.valid_to IS NULL
                   AND e.object_entity_id = bf.bug_entity_id) AS preceded_by
         FROM memory_bug_fixes bf
         ${where}
         ORDER BY bf.committed_at DESC
         LIMIT ?`,
        toBindParams(bindValues),
      );
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        const precededByRaw = toNullStr(r['preceded_by']);
        return {
          id: toStr(r['id']),
          commitSha: toStr(r['commit_sha']),
          bugEntityId: toStr(r['bug_entity_id']),
          package: toStr(r['package']),
          category: toStr(r['category']),
          subjectSummary: toStr(r['subject_summary']),
          sessionId: toNullStr(r['related_session_id']),
          precededByFindingIds: precededByRaw ? precededByRaw.split(',').filter(Boolean) : [],
          committedAt: toStr(r['committed_at']),
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.getBugHistory] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  async getBugCausalInfo(bugEntityId: string): Promise<BugCausalInfo | null> {
    const db = this.openReadOnly();
    if (!db) return null;
    try {
      // 1. メインの bug_fix 行
      const bugResult = db.exec(
        `SELECT bf.commit_sha, bf.subject_summary, bf.category, bf.committed_at,
                bf.affected_file_paths_json, bf.introduced_commit_sha
         FROM memory_bug_fixes bf
         WHERE bf.bug_entity_id = ?
         ORDER BY bf.committed_at DESC
         LIMIT 1`,
        toBindParams([bugEntityId]),
      );
      const bugRow = bugResult[0]?.values?.[0];
      if (!bugRow) return null;
      const bugCols = bugResult[0]!.columns;
      const bug = mapRow<Record<string, unknown>>(bugCols, bugRow);
      const affectedFilePaths: string[] = (() => {
        try {
          const parsed: unknown = JSON.parse(toStr(bug['affected_file_paths_json']) || '[]');
          return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
        } catch {
          return [];
        }
      })();

      // 2. root causes (caused_by edges → entity display_name)
      const causedByResult = db.exec(
        `SELECT e.id, COALESCE(e.display_name, e.canonical_name, '') AS name
         FROM memory_edges edge
         JOIN memory_entities e ON e.id = edge.object_entity_id
         WHERE edge.predicate='caused_by' AND edge.valid_to IS NULL
           AND edge.subject_entity_id = ?`,
        toBindParams([bugEntityId]),
      );
      const rootCauses = (causedByResult[0]?.values ?? []).map((r) => ({
        entityId: toStr(r[0]),
        displayName: toStr(r[1]),
      }));

      // 3. sibling bugs (同じ root cause を共有する他 bug entity)
      const siblingResult = rootCauses.length === 0
        ? null
        : db.exec(
            `SELECT DISTINCT edge.subject_entity_id
             FROM memory_edges edge
             WHERE edge.predicate='caused_by' AND edge.valid_to IS NULL
               AND edge.object_entity_id IN (${rootCauses.map(() => '?').join(',')})
               AND edge.subject_entity_id != ?`,
            toBindParams([...rootCauses.map((rc) => rc.entityId), bugEntityId]),
          );
      const siblingBugEntityIds = (siblingResult?.[0]?.values ?? []).map((r) => toStr(r[0]));

      // 4. preceding findings (precedes edges 逆方向)
      const precedesResult = db.exec(
        `SELECT edge.subject_entity_id, rf.target_file_path, rf.severity
         FROM memory_edges edge
         LEFT JOIN memory_review_findings rf ON rf.finding_entity_id = edge.subject_entity_id
         WHERE edge.predicate='precedes' AND edge.valid_to IS NULL
           AND edge.object_entity_id = ?`,
        toBindParams([bugEntityId]),
      );
      const precedingFindings = (precedesResult[0]?.values ?? []).map((r) => ({
        findingEntityId: toStr(r[0]),
        targetFilePath: toNullStr(r[1]),
        severity: toStr(r[2]) || 'info',
      }));

      // 5. introduced_by (column or edge - prefer column if non-null)
      const introducedCommitSha = toNullStr(bug['introduced_commit_sha']);
      let introducedByCommitSubject: string | null = null;
      if (introducedCommitSha) {
        const subResult = db.exec(
          `SELECT subject_summary FROM memory_bug_fixes WHERE commit_sha=? LIMIT 1`,
          toBindParams([introducedCommitSha]),
        );
        const subRow = subResult[0]?.values?.[0];
        introducedByCommitSubject = subRow ? toStr(subRow[0]) : null;
      } else {
        // fallback to introduced_by edge
        const edgeResult = db.exec(
          `SELECT e.canonical_name
           FROM memory_edges edge
           JOIN memory_entities e ON e.id = edge.object_entity_id
           WHERE edge.predicate='introduced_by' AND edge.valid_to IS NULL
             AND edge.subject_entity_id = ?
           LIMIT 1`,
          toBindParams([bugEntityId]),
        );
        const introRow = edgeResult[0]?.values?.[0];
        if (introRow) {
          // memory_entities.canonical_name for Commit type = commit_sha
        }
      }

      return {
        bugEntityId,
        subject: toStr(bug['subject_summary']),
        category: toStr(bug['category']),
        commitSha: toStr(bug['commit_sha']),
        committedAt: toStr(bug['committed_at']),
        affectedFilePaths,
        rootCauses,
        siblingBugEntityIds,
        precedingFindings,
        introducedByCommitSha: introducedCommitSha,
        introducedByCommitSubject,
      };
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.getBugCausalInfo] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return null;
    } finally {
      this.close(db);
    }
  }

  // ---- review findings ----

  async listUnaddressedReviewFindings(params: {
    severity?: string;
    daysSinceMin?: number;
    category?: string;
    limit?: number;
  }): Promise<UnaddressedReviewFindingRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const limit = clampLimit(params.limit, 50);
      const conditions: string[] = ['rf.addressed_at IS NULL'];
      const bindValues: unknown[] = [];
      if (params.severity) {
        conditions.push('rf.severity = ?');
        bindValues.push(params.severity);
      }
      if (params.category) {
        conditions.push('rf.category = ?');
        bindValues.push(params.category);
      }
      if (params.daysSinceMin) {
        conditions.push(`rf.recorded_at <= datetime('now', '-' || ? || ' days')`);
        bindValues.push(params.daysSinceMin);
      }
      bindValues.push(limit);
      const result = db.exec(
        `SELECT rf.id, rf.review_id, rf.target_file_path, rf.category, rf.severity,
                rf.finding_text, rf.recorded_at
         FROM memory_review_findings rf
         WHERE ${conditions.join(' AND ')}
         ORDER BY rf.recorded_at ASC
         LIMIT ?`,
        toBindParams(bindValues),
      );
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        return {
          id: toStr(r['id']),
          reviewId: toStr(r['review_id']),
          targetFilePath: toNullStr(r['target_file_path']),
          category: toStr(r['category']),
          severity: toStr(r['severity']),
          findingText: toStr(r['finding_text']),
          recordedAt: toStr(r['recorded_at']),
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.listUnaddressedReviewFindings] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  async getReviewHistory(params: {
    targetFilePath?: string;
    package?: string;
    includePrecedesBugs?: boolean;
    limit?: number;
  }): Promise<ReviewHistoryRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const limit = clampLimit(params.limit, 50);
      const conditions: string[] = [];
      const bindValues: unknown[] = [];
      if (params.targetFilePath) {
        conditions.push('rf.target_file_path = ?');
        bindValues.push(params.targetFilePath);
      }
      const where = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
      bindValues.push(limit);
      const sessionModelExpr = this.trailDbAttached
        ? `WHEN r.source_kind = 'session' THEN (
             SELECT msg.model FROM trail.messages msg
             WHERE msg.session_id = substr(r.source_ref, 1, instr(r.source_ref, '#') - 1)
               AND msg.type = 'assistant' AND msg.model IS NOT NULL AND msg.model != ''
             GROUP BY msg.model
             ORDER BY COUNT(*) DESC
             LIMIT 1
           )`
        : '';
      const result = db.exec(
        `SELECT rf.id, rf.review_id, rf.finding_entity_id, r.title, r.reviewer, r.source_kind,
                CASE
                  WHEN r.source_kind = 'agent' THEN rr.model
                  ${sessionModelExpr}
                  ELSE NULL
                END AS model,
                CASE
                  WHEN r.source_kind = 'session' AND instr(r.source_ref, '#') > 1
                    THEN substr(r.source_ref, 1, instr(r.source_ref, '#') - 1)
                  ELSE NULL
                END AS session_id,
                r.reviewed_at,
                rf.target_file_path, rf.category, rf.severity, rf.finding_text,
                rf.addressed_commit_sha, rf.addressed_at,
                (SELECT GROUP_CONCAT(e.object_entity_id)
                 FROM memory_edges e
                 WHERE e.predicate='precedes' AND e.valid_to IS NULL
                   AND e.subject_entity_id = rf.finding_entity_id) AS precedes_bugs
         FROM memory_review_findings rf
         JOIN memory_reviews r ON r.id = rf.review_id
         LEFT JOIN memory_review_runs rr ON r.source_kind = 'agent' AND rr.id = r.source_ref
         WHERE 1=1 ${where}
         ORDER BY r.reviewed_at DESC
         LIMIT ?`,
        toBindParams(bindValues),
      );
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        const precedesRaw = toNullStr(r['precedes_bugs']);
        return {
          id: toStr(r['id']),
          reviewId: toStr(r['review_id']),
          findingEntityId: toStr(r['finding_entity_id']),
          title: toStr(r['title']),
          reviewer: toStr(r['reviewer']),
          sourceKind: toStr(r['source_kind']),
          model: toNullStr(r['model']),
          sessionId: toNullStr(r['session_id']),
          reviewedAt: toStr(r['reviewed_at']),
          targetFilePath: toNullStr(r['target_file_path']),
          category: toStr(r['category']),
          severity: toStr(r['severity']),
          findingText: toStr(r['finding_text']),
          addressedCommitSha: toNullStr(r['addressed_commit_sha']),
          addressedAt: toNullStr(r['addressed_at']),
          precedesBugEntityIds: precedesRaw ? precedesRaw.split(',').filter(Boolean) : [],
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.getReviewHistory] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  // ---- pipeline runs ----

  async listPipelineRunStatsByDay(params: {
    scope?: string;
    since?: string;
  }): Promise<PipelineRunStatsByDayRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const conditions: string[] = [];
      const bindValues: unknown[] = [];
      if (params.scope) {
        conditions.push('scope = ?');
        bindValues.push(params.scope);
      }
      if (params.since) {
        conditions.push('started_at >= ?');
        bindValues.push(params.since);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      // status を順序付き数値にマップして MAX で worst を抽出。
      // 結果が高々 (日数 × scope 数) で頭打ちのため LIMIT 不要。
      const result = db.exec(
        `SELECT substr(started_at, 1, 10) AS day,
                scope,
                COUNT(*) AS runs,
                COALESCE(SUM(duration_ms), 0) / 1000 AS duration_sec,
                COALESCE(SUM(items_processed), 0) AS items_processed,
                MAX(CASE status
                      WHEN 'error'   THEN 3
                      WHEN 'partial' THEN 2
                      WHEN 'success' THEN 1
                      WHEN 'running' THEN 0
                      ELSE 0
                    END) AS worst_rank
         FROM memory_pipeline_runs
         ${where}
         GROUP BY day, scope
         ORDER BY day DESC, scope ASC`,
        toBindParams(bindValues),
      );
      if (!result[0]) return [];
      const { columns, values } = result[0];
      const rankToStatus = (n: number): PipelineRunStatus => {
        if (n === 3) return 'error';
        if (n === 2) return 'partial';
        return n === 1 ? 'success' : 'running';
      };
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        return {
          day: toStr(r['day']),
          scope: toStr(r['scope']),
          runs: toNum(r['runs']),
          durationSec: toNum(r['duration_sec']),
          itemsProcessed: toNum(r['items_processed']),
          worstStatus: rankToStatus(toNum(r['worst_rank'])),
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.listPipelineRunStatsByDay] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  // ---- failed items ----

  async listFailedItems(params: {
    scope?: string;
    limit?: number;
  }): Promise<FailedItemRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const limit = clampLimit(params.limit, 50);
      const conditions: string[] = ['attempt_count > 0'];
      const bindValues: unknown[] = [];
      if (params.scope) {
        conditions.push('scope = ?');
        bindValues.push(params.scope);
      }
      bindValues.push(limit);
      const result = db.exec(
        `SELECT scope, item_key, failed_at, reason, attempt_count
         FROM memory_failed_items
         WHERE ${conditions.join(' AND ')}
         ORDER BY failed_at DESC
         LIMIT ?`,
        toBindParams(bindValues),
      );
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        return {
          scope: toStr(r['scope']),
          itemKey: toStr(r['item_key']),
          failedAt: toStr(r['failed_at']),
          reason: toStr(r['reason']),
          attemptCount: toNum(r['attempt_count']),
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.listFailedItems] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  // ---- top entities ----

  async listTopEntities(params: {
    type?: string;
    limit?: number;
  }): Promise<TopEntityRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const limit = clampLimit(params.limit, 20);
      const conditions: string[] = [];
      const bindValues: unknown[] = [];
      if (params.type) {
        conditions.push('type = ?');
        bindValues.push(params.type);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      bindValues.push(limit);
      const result = db.exec(
        `SELECT id, type, canonical_name, COALESCE(display_name, canonical_name) AS display_name, last_updated_at
         FROM memory_entities
         ${where}
         ORDER BY last_updated_at DESC
         LIMIT ?`,
        toBindParams(bindValues),
      );
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        return {
          id: toStr(r['id']),
          type: toStr(r['type']),
          canonicalName: toStr(r['canonical_name']),
          displayName: toStr(r['display_name']),
          lastUpdatedAt: toStr(r['last_updated_at']),
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.listTopEntities] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  /**
   * Phase 6 S4 (Rationale Audit): セッションのコミットに紐付く決定根拠ノードを返す。
   * memory.db の rationale_for エッジ（Decision → Commit）を、attach 済み trail.session_commits で
   * セッション絞り込みして辿る（読み取り専用）。memory.db 不在・attach 失敗・0 件は空配列。
   */
  async listRationaleNodes(params: { sessionId: string }): Promise<RationaleNode[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    if (!this.trailDbAttached) {
      this.logger.warn('[MemoryApiHandler.listRationaleNodes] trail.db not attached; returning empty');
      return [];
    }
    try {
      const result = db.exec(
        `SELECT c.canonical_name AS commit_hash, d.summary, e.confidence_label, e.recorded_at
         FROM memory_edges e
         JOIN memory_entities d ON d.id = e.subject_entity_id AND d.type = 'Decision'
         JOIN memory_entities c ON c.id = e.object_entity_id AND c.type = 'Commit'
         WHERE e.predicate = 'rationale_for'
           AND c.canonical_name IN (SELECT commit_hash FROM trail.session_commits WHERE session_id = ?)
         ORDER BY e.recorded_at DESC
         LIMIT 200`,
        toBindParams([params.sessionId]),
      );
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        return {
          commitHash: toStr(r['commit_hash']),
          summary: toStr(r['summary']),
          confidenceLabel: toStr(r['confidence_label']) as RationaleNode['confidenceLabel'],
          recordedAt: toStr(r['recorded_at']),
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.listRationaleNodes] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  // ---- edge invalidations ----

  async listInvalidations(params: {
    since?: string;
    limit?: number;
  }): Promise<InvalidationRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const limit = clampLimit(params.limit, 50);
      const conditions: string[] = [];
      const bindValues: unknown[] = [];
      if (params.since) {
        conditions.push('invalidated_at >= ?');
        bindValues.push(params.since);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      bindValues.push(limit);
      const result = db.exec(
        `SELECT id, edge_id, invalidated_at, reason, superseding_edge_id
         FROM memory_edge_invalidations
         ${where}
         ORDER BY invalidated_at DESC
         LIMIT ?`,
        toBindParams(bindValues),
      );
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        return {
          id: toStr(r['id']),
          edgeId: toStr(r['edge_id']),
          invalidatedAt: toStr(r['invalidated_at']),
          reason: toStr(r['reason']),
          supersedingEdgeId: toNullStr(r['superseding_edge_id']),
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.listInvalidations] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }
}
