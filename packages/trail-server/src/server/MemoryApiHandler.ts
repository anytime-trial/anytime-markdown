import { BetterSqlite3MemoryDb, getMemoryCoreDbPath } from '@anytime-markdown/memory-core';
import type { MemoryDbConnection, MemoryDbSqlValue as SqlValue } from '@anytime-markdown/memory-core';
import * as fs from 'node:fs';

import { resolveDrift } from '@anytime-markdown/memory-core';

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
  committedAt: string;
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
  title: string;
  reviewedAt: string;
  targetFilePath: string | null;
  category: string;
  severity: string;
  findingText: string;
  addressedCommitSha: string | null;
  addressedAt: string | null;
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
                bf.subject_summary, bf.committed_at
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
        return {
          id: toStr(r['id']),
          commitSha: toStr(r['commit_sha']),
          bugEntityId: toStr(r['bug_entity_id']),
          package: toStr(r['package']),
          category: toStr(r['category']),
          subjectSummary: toStr(r['subject_summary']),
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
      const result = db.exec(
        `SELECT rf.id, rf.review_id, r.title, r.reviewed_at,
                rf.target_file_path, rf.category, rf.severity, rf.finding_text,
                rf.addressed_commit_sha, rf.addressed_at
         FROM memory_review_findings rf
         JOIN memory_reviews r ON r.id = rf.review_id
         WHERE 1=1 ${where}
         ORDER BY r.reviewed_at DESC
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
          title: toStr(r['title']),
          reviewedAt: toStr(r['reviewed_at']),
          targetFilePath: toNullStr(r['target_file_path']),
          category: toStr(r['category']),
          severity: toStr(r['severity']),
          findingText: toStr(r['finding_text']),
          addressedCommitSha: toNullStr(r['addressed_commit_sha']),
          addressedAt: toNullStr(r['addressed_at']),
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
      const rankToStatus = (n: number): PipelineRunStatus =>
        n === 3 ? 'error' : n === 2 ? 'partial' : n === 1 ? 'success' : 'running';
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
