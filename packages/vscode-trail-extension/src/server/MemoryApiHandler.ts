import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { resolveDrift } from '@anytime-markdown/memory-core';

import { TrailLogger } from '../utils/TrailLogger';

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

export interface PipelineRunRow {
  id: string;
  scope: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  itemsProcessed: number;
  errorMessage: string | null;
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
function mapRow<T>(columns: string[], values: unknown[]): T {
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
  private readonly dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? path.join(os.homedir(), '.claude', 'memory-core', 'memory-core.db');
  }

  // ---- status ----

  async handleStatus(): Promise<{ exists: boolean }> {
    return { exists: fs.existsSync(this.dbPath) };
  }

  // ---- open helpers ----

  private async openReadOnly(): Promise<Database | null> {
    if (!fs.existsSync(this.dbPath)) return null;
    try {
      const SQL = await initSqlJs();
      const data = fs.readFileSync(this.dbPath);
      return new SQL.Database(data);
    } catch (err) {
      TrailLogger.error(`[MemoryApiHandler.openReadOnly] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return null;
    }
  }

  private async openReadWrite(): Promise<Database | null> {
    if (!fs.existsSync(this.dbPath)) return null;
    try {
      const SQL = await initSqlJs();
      const data = fs.readFileSync(this.dbPath);
      const db = new SQL.Database(data);
      db.run('PRAGMA foreign_keys = ON');
      return db;
    } catch (err) {
      TrailLogger.error(`[MemoryApiHandler.openReadWrite] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return null;
    }
  }

  private saveAndClose(db: Database): void {
    try {
      const data = db.export();
      fs.writeFileSync(this.dbPath, Buffer.from(data));
    } finally {
      db.close();
    }
  }

  // ---- drift events ----

  async listDriftEvents(params: {
    unresolvedOnly?: boolean;
    severity?: string;
    driftType?: string;
    since?: string;
    limit?: number;
  }): Promise<DriftEventRow[]> {
    const db = await this.openReadOnly();
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
      TrailLogger.error(`[MemoryApiHandler.listDriftEvents] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      db.close();
    }
  }

  async getDriftEventDetail(eventId: string): Promise<DriftEventDetail | null> {
    const db = await this.openReadOnly();
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
      TrailLogger.error(`[MemoryApiHandler.getDriftEventDetail] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return null;
    } finally {
      db.close();
    }
  }

  async resolveDriftEvent(eventId: string, resolutionNote: string): Promise<{ ok: boolean }> {
    const db = await this.openReadWrite();
    if (!db) return { ok: false };
    try {
      const result = resolveDrift({ db, event_id: eventId, resolution_note: resolutionNote, logger: TrailLogger });
      this.saveAndClose(db);
      return { ok: result.resolved };
    } catch (err) {
      TrailLogger.error(`[MemoryApiHandler.resolveDriftEvent] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      db.close();
      return { ok: false };
    }
  }

  // ---- recurring bugs ----

  async listRecurringBugs(params: {
    package?: string;
    windowDays?: number;
    limit?: number;
  }): Promise<RecurringBugRow[]> {
    const db = await this.openReadOnly();
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
      TrailLogger.error(`[MemoryApiHandler.listRecurringBugs] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      db.close();
    }
  }

  // ---- bug history ----

  async getBugHistory(params: {
    package?: string;
    filePath?: string;
    category?: string;
    limit?: number;
  }): Promise<BugHistoryRow[]> {
    const db = await this.openReadOnly();
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
      TrailLogger.error(`[MemoryApiHandler.getBugHistory] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      db.close();
    }
  }

  // ---- review findings ----

  async listUnaddressedReviewFindings(params: {
    severity?: string;
    daysSinceMin?: number;
    category?: string;
    limit?: number;
  }): Promise<UnaddressedReviewFindingRow[]> {
    const db = await this.openReadOnly();
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
      TrailLogger.error(`[MemoryApiHandler.listUnaddressedReviewFindings] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      db.close();
    }
  }

  async getReviewHistory(params: {
    targetFilePath?: string;
    package?: string;
    includePrecedesBugs?: boolean;
    limit?: number;
  }): Promise<ReviewHistoryRow[]> {
    const db = await this.openReadOnly();
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
      TrailLogger.error(`[MemoryApiHandler.getReviewHistory] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      db.close();
    }
  }

  // ---- pipeline runs ----

  async listPipelineRuns(params: {
    scope?: string;
    status?: string;
    since?: string;
    limit?: number;
  }): Promise<PipelineRunRow[]> {
    const db = await this.openReadOnly();
    if (!db) return [];
    try {
      const limit = clampLimit(params.limit, 50);
      const conditions: string[] = [];
      const bindValues: unknown[] = [];
      if (params.scope) {
        conditions.push('scope = ?');
        bindValues.push(params.scope);
      }
      if (params.status) {
        conditions.push('status = ?');
        bindValues.push(params.status);
      }
      if (params.since) {
        conditions.push('started_at >= ?');
        bindValues.push(params.since);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      bindValues.push(limit);
      const result = db.exec(
        `SELECT id, scope, started_at, completed_at, status,
                COALESCE(items_processed, 0) AS items_processed, error_message
         FROM memory_pipeline_runs
         ${where}
         ORDER BY started_at DESC
         LIMIT ?`,
        toBindParams(bindValues),
      );
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        return {
          id: toStr(r['id']),
          scope: toStr(r['scope']),
          startedAt: toStr(r['started_at']),
          completedAt: toNullStr(r['completed_at']),
          status: toStr(r['status']),
          itemsProcessed: toNum(r['items_processed']),
          errorMessage: toNullStr(r['error_message']),
        };
      });
    } catch (err) {
      TrailLogger.error(`[MemoryApiHandler.listPipelineRuns] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      db.close();
    }
  }

  // ---- failed items ----

  async listFailedItems(params: {
    scope?: string;
    limit?: number;
  }): Promise<FailedItemRow[]> {
    const db = await this.openReadOnly();
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
      TrailLogger.error(`[MemoryApiHandler.listFailedItems] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      db.close();
    }
  }

  // ---- top entities ----

  async listTopEntities(params: {
    type?: string;
    limit?: number;
  }): Promise<TopEntityRow[]> {
    const db = await this.openReadOnly();
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
      TrailLogger.error(`[MemoryApiHandler.listTopEntities] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      db.close();
    }
  }

  // ---- edge invalidations ----

  async listInvalidations(params: {
    since?: string;
    limit?: number;
  }): Promise<InvalidationRow[]> {
    const db = await this.openReadOnly();
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
      TrailLogger.error(`[MemoryApiHandler.listInvalidations] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      db.close();
    }
  }
}
