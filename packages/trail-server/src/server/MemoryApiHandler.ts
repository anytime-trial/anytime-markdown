import { BetterSqlite3MemoryDb, attachTrailDbReadOnly, resolveDrift } from '@anytime-markdown/memory-core';
import type { MemoryDbConnection, MemoryDbSqlValue as SqlValue } from '@anytime-markdown/memory-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { aggregateDriftByDay } from '@anytime-markdown/trail-core';
import type { DriftHistoryPoint, RationaleNode } from '@anytime-markdown/trail-core';
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
  /** 出所ワークスペースの repo_name。'' は未解決（020_workspace_scope.sql）。 */
  workspace: string;
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
  /**
   * 関連セッションが属する指示 ID。宣言があればその指示 ID、無ければセッション ID
   * （`flightFindingSourceSql` の暗黙グループと同じ規則）。セッション不明、または
   * trail.db が ATTACH できていない構成では null。
   */
  instructionId: string | null;
  precededByFindingIds: string[];
  committedAt: string;
  /** 取込元リポジトリの repo_name。'' は未解決（020_workspace_scope.sql）。 */
  workspace: string;
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

/**
 * 知識グラフの共起ネットワーク表示用応答（trail-viewer/src/views/knowledgeGraphCoocFile.ts とミラー）。
 * links / clusters の数値は nodes の添字。
 */
export interface KnowledgeGraphResponse {
  nodes: { label: string; type: string; frequency: number }[];
  links: { a: number; b: number; strength: number }[];
  clusters: { label: string; members: number[] }[];
  /** 種別フィルタ適用後の全エンティティ数（表示が全体の一部であることを示す分母）。 */
  totalEntityCount: number;
  /** エッジを持つエンティティが limit を超えて残っているか。 */
  truncated: boolean;
  /** 種別フィルタ UI の選択肢（DB に実在する全種別。フィルタの影響を受けない）。 */
  availableTypes: string[];
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

/**
 * Flight Record（指示単位の運航記録）へ畳んだレビュー指摘 1 件。
 *
 * `instructionId` は明示宣言（instruction_sessions・memory-core.db 内）があればその指示 ID、無ければ
 * セッション ID そのもの。後者は TrailDatabase が「1 セッション = 1 指示」の暗黙グループへ
 * セッション ID を指示 ID として使うため、同じ値で突き合わせられる。
 */
export interface FlightReviewFindingRow {
  id: string;
  /**
   * memory_edges の `precedes` が指すのは finding の **entity id** であり行 id ではない。
   * バグ側の「事前指摘」チップから指摘へ絞り込むには両者を同じキーで揃える必要があるため、
   * 行 id と併せて entity id も返す。
   */
  findingEntityId: string;
  reviewId: string;
  instructionId: string;
  sessionId: string;
  title: string;
  reviewer: string;
  reviewedAt: string;
  workspace: string;
  targetFilePath: string | null;
  targetRepo: string | null;
  category: string;
  severity: string;
  findingText: string;
  addressedCommitSha: string | null;
  addressedAt: string | null;
}

/** 指示単位の指摘件数。一覧の列に出すため SQL 側で集計する（limit で欠けさせない）。 */
export interface FlightReviewFindingCountRow {
  instructionId: string;
  error: number;
  warn: number;
  info: number;
  total: number;
}

export type PipelineRunStatus = 'error' | 'partial' | 'success' | 'running';

export interface PipelineRunStatsByDayRow {
  day: string;
  scope: string;
  wave: string;
  runs: number;
  durationSec: number;
  itemsProcessed: number;
  worstStatus: PipelineRunStatus;
}

export interface PipelineRunRow {
  id: string;
  scope: string;
  wave: string;
  tier: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
  itemsProcessed: number;
  itemsFailed: number;
  errorDetail: string;
}

export interface PipelineRunLogRow {
  id: number;
  timestamp: string;
  level: string;
  source: string;
  component: string;
  message: string;
  metadata: string | null;
  stack: string | null;
}

export interface FailedItemRow {
  scope: string;
  itemKey: string;
  failedAt: string;
  reason: string;
  detail: string;
  attemptCount: number;
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

/**
 * 上限は呼び出し側が決める。既定 200 を固定値で埋め込んでいたため、ルートが 1000 まで
 * 許した指定も無音で 200 へ丸められていた（一覧が欠けても呼び出し側には見えない）。
 */
function clampLimit(limit: number | undefined, def: number, max = 200): number {
  return Math.min(limit ?? def, max);
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
   * memory-core.db に instruction_sessions が在るか（指示 ID 解決用）。
   * Flight Record は memory-core.db へ移設済み（2026-08-07）だが、移行前の DB や
   * FlightRecordDatabase 初期化前はテーブルが無いため、実在を見て縮退を決める。
   * probe は openReadOnly の接続キャッシュ確立時に 1 回だけ走る。TrailDataServer の
   * コンストラクタが FlightRecordDatabase.init()（= ensureTables）を同期完了させてから
   * リスナを立てる配線順序が前提（並べ替えると初回リクエストで恒久 false になりうる）。
   */
  private instructionSessionsAvailable = false;

  /**
   * better-sqlite3 の native binary 絶対パス。webpack-bundled VS Code 拡張で
   * bindings package が call stack から `.node` を推測できず crash する問題の
   * 回避策 (memory-core / TrailDatabase と同パターン)。
   * 未指定なら bindings の通常解決 (= テスト・スタンドアロン用途) に任せる。
   */
  private readonly nativeBinding?: string;

  /**
   * @param dbPath memory-core.db の絶対パス。未設定は `null` で**明示**する（全 API
   *   レスポンスを "not configured" = exists:false / null として返す縮退に入る）。
   *
   *   省略可にして `getMemoryCoreDbPath()` へ暗黙フォールバックしていたが、解決先が
   *   `process.cwd()` 基準のため「未設定」の判定が実行場所依存になっていた。開発リポジトリ
   *   直下から動かすと本番 DB を掴み、CI では同ファイルが無いため常に「未設定」と判定されて
   *   永久に検知されない（`~/.claude/rules/code-quality.md` §15）。解決は呼び出し側の責務とする。
   */
  constructor(logger: Logger, dbPath: string | null, nativeBinding?: string) {
    this.logger = logger;
    this.dbPath = dbPath ?? undefined;
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
      try {
        const probe = this.cachedReadOnlyDb.exec(
          `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'instruction_sessions'`,
        );
        this.instructionSessionsAvailable = (probe[0]?.values.length ?? 0) > 0;
      } catch (err) {
        this.instructionSessionsAvailable = false;
        this.logger.warn(`[MemoryApiHandler.openReadOnly] instruction_sessions probe failed: ${err instanceof Error ? err.message : String(err)}`);
      }
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

  /**
   * memory-core が保持するワークスペース（repo_name）の一覧。
   *
   * Flight Record のワークスペース選択肢に使う。一覧 API の結果から作らないのは、
   * limit と絞り込みで縮んだ窓に出てこないワークスペースが選択肢から消え、
   * 「そのワークスペースの記録が無い」と読めてしまうため。
   * '' （未解決）は選択肢にしない — 絞り込みの対象ではなく取込側の欠損だから。
   */
  async listWorkspaces(): Promise<string[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const names = new Set<string>();
      for (const sql of [
        "SELECT DISTINCT workspace FROM memory_reviews WHERE workspace != ''",
        "SELECT DISTINCT workspace FROM memory_bug_fixes WHERE workspace != ''",
        "SELECT DISTINCT workspace FROM memory_drift_events WHERE workspace != ''",
      ]) {
        const result = db.exec(sql);
        for (const row of result[0]?.values ?? []) names.add(String(row[0]));
      }
      return [...names].sort((a, b) => a.localeCompare(b));
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.listWorkspaces] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  async listDriftEvents(params: {
    unresolvedOnly?: boolean;
    severity?: string;
    driftType?: string;
    since?: string;
    /**
     * ワークスペース（repo_name）で絞る。空文字・未指定は絞り込みなし。
     * memory-core.db は複数ワークスペースを 1 DB に集約するため、これが無いと
     * Flight Record の Drift タブに他ワークスペースの乖離が混ざる。
     */
    workspace?: string;
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
      if (params.workspace) {
        conditions.push('de.workspace = ?');
        bindValues.push(params.workspace);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      bindValues.push(limit);

      const sql = `
        SELECT de.id, de.subject_entity_id, COALESCE(e.display_name, e.canonical_name, '') AS subject_display_name,
               de.predicate, de.drift_type, de.severity,
               de.conversation_value, de.spec_value, de.code_value,
               de.detected_at, de.resolved_at, de.resolution_note, de.workspace
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
          workspace: toStr(r['workspace']),
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
                de.detected_at, de.resolved_at, de.resolution_note, de.detail_json, de.workspace
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
        workspace: toStr(r['workspace']),
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
    /** ワークスペース（repo_name）で絞る。空文字・未指定は絞り込みなし。 */
    workspace?: string;
    limit?: number;
  }): Promise<RecurringBugRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const limit = clampLimit(params.limit, 50);
      const conditions: string[] = [
        `de.drift_type IN ('regression_cluster','spec_violation_cluster')`,
        `de.resolved_at IS NULL`,
      ];
      const bindValues: unknown[] = [];
      if (params.windowDays) {
        conditions.push(`de.detected_at >= datetime('now', '-' || ? || ' days')`);
        bindValues.push(params.windowDays);
      }
      if (params.workspace) {
        conditions.push('de.workspace = ?');
        bindValues.push(params.workspace);
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
    /**
     * 指示に属するセッションで絞る。Flight Record の詳細ペインは「この指示が潰したバグ」を
     * 出すため、クライアント側で最新 N 件を絞るのではなくここで絞る（limit で先に切られると
     * 古い指示のバグが「0 件」に化けて、無いのか出ていないのか区別できなくなる）。
     */
    sessionIds?: readonly string[];
    /** ワークスペース（repo_name）で絞る。空文字・未指定は絞り込みなし。 */
    workspace?: string;
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
      if (params.workspace) {
        conditions.push('bf.workspace = ?');
        bindValues.push(params.workspace);
      }
      if (params.sessionIds !== undefined) {
        // 空配列は「絞り込み対象が 0 件」であって「絞り込み無し」ではない。ここで
        // 条件を落とすと全バグが返り、セッション不明の指示が全件を自分の成果に見せる。
        if (params.sessionIds.length === 0) return [];
        conditions.push(`bf.related_session_id IN (${params.sessionIds.map(() => '?').join(',')})`);
        bindValues.push(...params.sessionIds);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      bindValues.push(limit);
      // 指示 ID は Review タブ（flightFindingSourceSql）と同じ規則で解決する。
      // instruction_sessions は memory-core.db 内（2026-08-07 移設）。未移行 DB では
      // テーブルが無いので、行全体を落とさずセッション ID へフォールバックする。
      const instructionIdExpr = this.instructionSessionsAvailable
        ? `COALESCE(
             (SELECT i.instruction_id FROM instruction_sessions i
               WHERE i.session_id = bf.related_session_id),
             bf.related_session_id
           )`
        : 'bf.related_session_id';
      const result = db.exec(
        `SELECT bf.id, bf.commit_sha, bf.bug_entity_id, bf.package, bf.category,
                bf.subject_summary, bf.related_session_id, bf.committed_at, bf.workspace,
                ${instructionIdExpr} AS instruction_id,
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
          instructionId: toNullStr(r['instruction_id']),
          precededByFindingIds: precededByRaw ? precededByRaw.split(',').filter(Boolean) : [],
          committedAt: toStr(r['committed_at']),
          workspace: toStr(r['workspace']),
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
                r.reviewed_at, r.workspace,
                rf.target_file_path, rf.target_repo, rf.category, rf.severity, rf.finding_text,
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
          workspace: toStr(r['workspace']),
          targetFilePath: toNullStr(r['target_file_path']),
          targetRepo: toNullStr(r['target_repo']),
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

  /**
   * session 経路のレビューを指示（Flight Record の行の単位）へ畳む副問い合わせ。
   *
   * `review_doc` / `agent` 経路は session_id を持たないため対象外。SQLite は WHERE 句で
   * SELECT のエイリアスを参照できないので、instruction_id は必ずこの副問い合わせの
   * 外側で絞り込む。
   */
  private flightFindingSourceSql(): string {
    return `SELECT f.*,
                   COALESCE(
                     (SELECT i.instruction_id FROM instruction_sessions i
                       WHERE i.session_id = f.session_id),
                     f.session_id
                   ) AS instruction_id
            FROM (
              SELECT rf.id, rf.finding_entity_id, rf.review_id, rf.target_file_path, rf.target_repo,
                     rf.category, rf.severity, rf.finding_text,
                     rf.addressed_commit_sha, rf.addressed_at,
                     r.title, r.reviewer, r.reviewed_at, r.workspace,
                     substr(r.source_ref, 1, instr(r.source_ref, '#') - 1) AS session_id
              FROM memory_review_findings rf
              JOIN memory_reviews r ON r.id = rf.review_id
              WHERE r.source_kind = 'session' AND instr(r.source_ref, '#') > 1
            ) f`;
  }

  /**
   * 指示単位の指摘件数。instructionIds 未指定なら全件を返す。
   *
   * trail.db が ATTACH できていないときは結合キー（instruction_sessions）が引けないため
   * 空配列を返す。呼び出し側が「0 件」と「引けなかった」を区別できるよう、理由をログへ残す。
   */
  async getFlightReviewFindingCounts(): Promise<FlightReviewFindingCountRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      if (!this.instructionSessionsAvailable) {
        this.logger.error('[MemoryApiHandler.getFlightReviewFindingCounts] instruction_sessions table missing in memory-core.db; cannot resolve instruction ids');
        return [];
      }
      const result = db.exec(
        `SELECT instruction_id,
                SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) AS error_count,
                SUM(CASE WHEN severity = 'warn'  THEN 1 ELSE 0 END) AS warn_count,
                SUM(CASE WHEN severity = 'info'  THEN 1 ELSE 0 END) AS info_count,
                COUNT(*) AS total_count
         FROM (${this.flightFindingSourceSql()})
         GROUP BY instruction_id`,
      );
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        return {
          instructionId: toStr(r['instruction_id']),
          error: toNum(r['error_count']),
          warn: toNum(r['warn_count']),
          info: toNum(r['info_count']),
          total: toNum(r['total_count']),
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.getFlightReviewFindingCounts] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  /** 指示単位のレビュー指摘一覧。instructionIds を渡すとその指示だけに絞る。 */
  async getFlightReviewFindings(params: {
    instructionIds?: readonly string[];
    /** レビューが行われたワークスペース（repo_name）で絞る。空文字・未指定は絞り込みなし。 */
    workspace?: string;
    limit?: number;
  }): Promise<FlightReviewFindingRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      if (!this.instructionSessionsAvailable) {
        this.logger.error('[MemoryApiHandler.getFlightReviewFindings] instruction_sessions table missing in memory-core.db; cannot resolve instruction ids');
        return [];
      }
      // Review タブは全指示横断の一覧なので、他 API より大きい上限を許す（ルートの
      // clampInt と同じ 1000）。ここを 200 に固定すると、件数（集計・上限なし）とだけ
      // 食い違い、詳細ペインが「指摘なし」・件数列が非ゼロという矛盾表示になる。
      const limit = clampLimit(params.limit, 500, 1000);
      const ids = params.instructionIds ?? [];
      const bindValues: unknown[] = [...ids];
      const conditions: string[] = [];
      if (ids.length > 0) conditions.push(`instruction_id IN (${ids.map(() => '?').join(',')})`);
      if (params.workspace) {
        conditions.push('workspace = ?');
        bindValues.push(params.workspace);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      bindValues.push(limit);
      const result = db.exec(
        `SELECT * FROM (${this.flightFindingSourceSql()})
         ${where}
         ORDER BY reviewed_at DESC, id ASC
         LIMIT ?`,
        toBindParams(bindValues),
      );
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        return {
          id: toStr(r['id']),
          findingEntityId: toStr(r['finding_entity_id']),
          reviewId: toStr(r['review_id']),
          instructionId: toStr(r['instruction_id']),
          sessionId: toStr(r['session_id']),
          title: toStr(r['title']),
          reviewer: toStr(r['reviewer']),
          reviewedAt: toStr(r['reviewed_at']),
          workspace: toStr(r['workspace']),
          targetFilePath: toNullStr(r['target_file_path']),
          targetRepo: toNullStr(r['target_repo']),
          category: toStr(r['category']),
          severity: toStr(r['severity']),
          findingText: toStr(r['finding_text']),
          addressedCommitSha: toNullStr(r['addressed_commit_sha']),
          addressedAt: toNullStr(r['addressed_at']),
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.getFlightReviewFindings] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
                wave,
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
         FROM pipeline_runs
         ${where}
         GROUP BY day, scope, wave
         ORDER BY day DESC, scope ASC, wave ASC`,
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
          wave: toStr(r['wave']),
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

  async listPipelineRuns(params: {
    since?: string;
    wave?: string;
    status?: string;
    limit?: number;
  }): Promise<PipelineRunRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const limit = clampLimit(params.limit, 100);
      const conditions: string[] = [];
      const bindValues: unknown[] = [];
      if (params.since) {
        conditions.push('started_at >= ?');
        bindValues.push(params.since);
      }
      if (params.wave) {
        conditions.push('wave = ?');
        bindValues.push(params.wave);
      }
      if (params.status) {
        conditions.push('status = ?');
        bindValues.push(params.status);
      }
      bindValues.push(limit);
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = db.exec(
        `SELECT id, scope, wave, tier, status, started_at, finished_at, duration_ms,
                items_processed, items_failed, error_detail
         FROM pipeline_runs
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
          wave: toStr(r['wave']),
          tier: toNum(r['tier']),
          status: toStr(r['status']),
          startedAt: toStr(r['started_at']),
          finishedAt: toNullStr(r['finished_at']),
          durationMs: toNum(r['duration_ms']),
          itemsProcessed: toNum(r['items_processed']),
          itemsFailed: toNum(r['items_failed']),
          errorDetail: toStr(r['error_detail']),
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.listPipelineRuns] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  async listPipelineRunLogs(params: {
    runId: string;
    limit?: number;
  }): Promise<PipelineRunLogRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const limit = clampLimit(params.limit, 200);
      const result = db.exec(
        `SELECT id, timestamp, level, source, component, message, metadata, stack
         FROM pipeline_run_logs
         WHERE run_id = ?
         ORDER BY timestamp ASC, id ASC
         LIMIT ?`,
        toBindParams([params.runId, limit]),
      );
      if (!result[0]) return [];
      const { columns, values } = result[0];
      return values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        return {
          id: toNum(r['id']),
          timestamp: toStr(r['timestamp']),
          level: toStr(r['level']),
          source: toStr(r['source']),
          component: toStr(r['component']),
          message: toStr(r['message']),
          metadata: toNullStr(r['metadata']),
          stack: toNullStr(r['stack']),
        };
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.listPipelineRunLogs] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  /**
   * Phase 6 S5-C: ドリフト件数の日次推移を返す。
   * SQL は単純な範囲スキャンに留め、日次バケット化（JST 境界・0 埋め・未解決累計）は
   * trail-core の純粋関数で行う（sql.js は CTE + window の組み合わせで性能が崩れるため）。
   */
  async listDriftHistoryByDay(params: {
    since?: string;
    until?: string;
    driftType?: string;
    severity?: string;
    timeZone?: string;
  }): Promise<DriftHistoryPoint[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      const conditions: string[] = [];
      const bindValues: unknown[] = [];
      if (params.since) {
        // 3 種類を取る必要がある:
        //   1) 範囲内で検知されたもの
        //   2) 範囲前に検知され範囲内で解決されたもの（解決として数える）
        //   3) 範囲前に検知され今も未解決のもの（累計の初期値になる。落とすとバックログが 0 から始まる）
        conditions.push('(detected_at >= ? OR resolved_at >= ? OR resolved_at IS NULL)');
        bindValues.push(params.since, params.since);
      }
      if (params.until) {
        conditions.push('detected_at <= ?');
        bindValues.push(params.until);
      }
      if (params.driftType) {
        conditions.push('drift_type = ?');
        bindValues.push(params.driftType);
      }
      if (params.severity) {
        conditions.push('severity = ?');
        bindValues.push(params.severity);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = db.exec(
        `SELECT detected_at, resolved_at FROM memory_drift_events ${where}`,
        toBindParams(bindValues),
      );
      if (!result[0]) {
        return aggregateDriftByDay([], {
          sinceIso: params.since,
          untilIso: params.until,
          timeZone: params.timeZone,
        });
      }
      const { columns, values } = result[0];
      const events = values.map((row) => {
        const r = mapRow<Record<string, unknown>>(columns, row);
        return { detectedAt: toStr(r['detected_at']), resolvedAt: toNullStr(r['resolved_at']) };
      });
      return aggregateDriftByDay(events, {
        sinceIso: params.since,
        untilIso: params.until,
        timeZone: params.timeZone,
      });
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.listDriftHistoryByDay] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
        `SELECT scope, item_key, failed_at, reason, detail, attempt_count
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
          detail: toStr(r['detail']),
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
        `SELECT c.canonical_name AS commit_hash, d.summary, e.confidence_label, e.recorded_at AS created_at
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
          createdAt: toStr(r['created_at']),
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
  // 現在 UI の消費者は無い（2026-08-05 に Runs パネルから撤去）。将来のグラフ表示で
  // 失効エッジの重畳・時点指定に使うため意図的に残す。消費者ゼロを根拠に撤去しないこと。
  // 失効エッジは valid_to が入って現在断面のグラフから外れるため、この経路以外に
  // 「何がいつ何に置き換わったか」の供給元が無い。
  // 経緯: spec/31.trail/02.trail-viewer/trail-viewer-screen/trail-viewer-screen-memory.ja.md §7.1

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

  // ---- knowledge graph (共起ネットワーク表示用) ----

  /**
   * 知識グラフ（memory_entities / memory_edges）を共起ネットワーク描画用に集約して返す。
   * 画面設計書: spec/31.trail/02.trail-viewer/trail-viewer-screen/trail-viewer-screen-knowledge-graph.ja.md §2.2
   *
   * 全件（実測 2.9 万ノード）は描画できないため、有効エッジ次数の上位 `limit` 件だけを返す。
   * 有効エッジ = エンティティ間（object_entity_id 非 NULL）・valid_to IS NULL・無効化記録なし。
   * `types` を指定すると両端がその種別に含まれるエッジだけで次数を数える（片端だけ該当する
   * エッジを残すと、絞り込んだはずの種別外ノードへの線が図に必要になってしまう）。
   *
   * DB 未設定・不在は null（「データ 0 件」と区別する。0 件は正常応答の空配列）。
   */
  async getKnowledgeGraph(params: { limit?: number; types?: string[] }): Promise<KnowledgeGraphResponse | null> {
    const db = this.openReadOnly();
    if (!db) return null;
    try {
      const limit = Math.max(1, clampLimit(params.limit, 150, 500));
      // 種別はバインドで渡すが、識別子形式に絞って未知の値（空文字・記号）を先に落とす
      const types = (params.types ?? []).filter((t) => /^[A-Za-z][A-Za-z0-9_]*$/.test(t));
      const typeFilter = types.length > 0
        ? `AND es.type IN (${types.map(() => '?').join(',')}) AND eo.type IN (${types.map(() => '?').join(',')})`
        : '';
      const activeCte = `
        active AS (
          SELECT e.subject_entity_id AS s, e.object_entity_id AS o
          FROM memory_edges e
          JOIN memory_entities es ON es.id = e.subject_entity_id
          JOIN memory_entities eo ON eo.id = e.object_entity_id
          WHERE e.object_entity_id IS NOT NULL
            AND e.subject_entity_id != e.object_entity_id
            AND e.valid_to IS NULL
            AND NOT EXISTS (SELECT 1 FROM memory_edge_invalidations i WHERE i.edge_id = e.id)
            ${typeFilter}
        )`;
      const typeBinds = types.length > 0 ? [...types, ...types] : [];

      const nodeResult = db.exec(
        `WITH ${activeCte},
        deg AS (
          SELECT id, SUM(c) AS d FROM (
            SELECT s AS id, COUNT(*) AS c FROM active GROUP BY s
            UNION ALL
            SELECT o AS id, COUNT(*) AS c FROM active GROUP BY o
          ) GROUP BY id
        )
        SELECT en.id, en.display_name, en.type, deg.d
        FROM deg JOIN memory_entities en ON en.id = deg.id
        ORDER BY deg.d DESC, en.id
        LIMIT ?`,
        toBindParams([...typeBinds, limit]),
      );
      const nodeRows = (nodeResult[0]?.values ?? []).map((row) => ({
        id: toStr(row[0]),
        label: toStr(row[1]),
        type: toStr(row[2]),
        frequency: Number(row[3] ?? 0),
      }));

      const indexById = new Map<string, number>(nodeRows.map((row, i) => [row.id, i]));
      let links: { a: number; b: number; strength: number }[] = [];
      if (nodeRows.length > 0) {
        const idPlaceholders = nodeRows.map(() => '?').join(',');
        const ids = nodeRows.map((row) => row.id);
        const linkResult = db.exec(
          `WITH ${activeCte}
          SELECT MIN(s, o) AS a, MAX(s, o) AS b, COUNT(*) AS strength
          FROM active
          WHERE s IN (${idPlaceholders}) AND o IN (${idPlaceholders})
          GROUP BY MIN(s, o), MAX(s, o)`,
          toBindParams([...typeBinds, ...ids, ...ids]),
        );
        links = (linkResult[0]?.values ?? []).flatMap((row) => {
          const a = indexById.get(toStr(row[0]));
          const b = indexById.get(toStr(row[1]));
          if (a === undefined || b === undefined) return [];
          return [{ a, b, strength: Number(row[2] ?? 0) }];
        });
      }

      const clustersByType = new Map<string, number[]>();
      nodeRows.forEach((row, i) => {
        const members = clustersByType.get(row.type) ?? [];
        members.push(i);
        clustersByType.set(row.type, members);
      });

      const countFilter = types.length > 0 ? `WHERE type IN (${types.map(() => '?').join(',')})` : '';
      const totalResult = db.exec(
        `SELECT COUNT(*) FROM memory_entities ${countFilter}`,
        toBindParams([...types]),
      );
      const totalEntityCount = Number(totalResult[0]?.values[0]?.[0] ?? 0);

      const connectedResult = db.exec(
        `WITH ${activeCte}
        SELECT COUNT(*) FROM (SELECT s AS id FROM active UNION SELECT o FROM active)`,
        toBindParams([...typeBinds]),
      );
      const connectedEntityCount = Number(connectedResult[0]?.values[0]?.[0] ?? 0);

      const availableResult = db.exec(`SELECT DISTINCT type FROM memory_entities ORDER BY type`);
      const availableTypes = (availableResult[0]?.values ?? []).map((row) => toStr(row[0]));

      return {
        nodes: nodeRows.map(({ label, type, frequency }) => ({ label, type, frequency })),
        links,
        clusters: [...clustersByType.entries()].map(([label, members]) => ({ label, members })),
        totalEntityCount,
        truncated: nodeRows.length < connectedEntityCount,
        availableTypes,
      };
    } catch (err) {
      this.logger.error(`[MemoryApiHandler.getKnowledgeGraph] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return null;
    } finally {
      this.close(db);
    }
  }
}
