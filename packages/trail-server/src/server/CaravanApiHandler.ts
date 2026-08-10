import {
  BetterSqlite3CaravanDb,
  attachTrailDbReadOnly,
  resolveDrift,
  tokenizeForFts5,
  isLowInformationEntity,
} from '@anytime-markdown/trail-caravan-book';
import type { CaravanDbConnection, CaravanDbSqlValue as SqlValue } from '@anytime-markdown/trail-caravan-book';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { aggregateDriftByDay } from '@anytime-markdown/trail-activity';
import type { DriftHistoryPoint, RationaleNode } from '@anytime-markdown/trail-activity';
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
   * activity.db が ATTACH できていない構成では null。
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
  /**
   * `x` / `y` はサーバが全体グラフに対して計算した世界座標（`caravan_entity_layout`）。
   * **全ノードに揃っている時だけ**クライアントはレイアウトを省略できる。1 件でも欠けると
   * クライアント側計算へ縮退する（座標のある点と無い点が混ざった図は配置が破綻するため）。
   */
  nodes: { id: string; label: string; type: string; frequency: number; x?: number; y?: number }[];
  links: { a: number; b: number; strength: number }[];
  clusters: { label: string; members: number[] }[];
  /** 種別フィルタ適用後の全エンティティ数（表示が全体の一部であることを示す分母）。 */
  totalEntityCount: number;
  /** エッジを持つエンティティが limit を超えて残っているか。 */
  truncated: boolean;
  /** 種別フィルタ UI の選択肢（DB に実在する全種別。フィルタの影響を受けない）。 */
  availableTypes: string[];
  /**
   * 要求された視野（bbox）で実際に絞ったか。座標が 1 件も無い DB では絞れないため false になる。
   * クライアントはこれを見て「この視野は空」と「視野を無視して全体を返した」を区別する。
   */
  bboxApplied: boolean;
}

/** 知識グラフ画面検索の 1 ヒット（画面設計書 §2.4）。 */
export interface KnowledgeGraphSearchHit {
  id: string;
  label: string;
  type: string;
  /** 保存済み全体次数（migration 027）。無い DB では 0。 */
  degree: number;
}

export interface KnowledgeGraphSearchResponse {
  hits: KnowledgeGraphSearchHit[];
  truncated: boolean;
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
 * Flight Record（指示単位の実行記録）へ畳んだレビュー指摘 1 件。
 *
 * `instructionId` は明示宣言（caravan_instruction_sessions・caravan-book.db 内）があればその指示 ID、無ければ
 * セッション ID そのもの。後者は TrailDatabase が「1 セッション = 1 指示」の暗黙グループへ
 * セッション ID を指示 ID として使うため、同じ値で突き合わせられる。
 */
export interface FlightReviewFindingRow {
  id: string;
  /**
   * caravan_edges の `precedes` が指すのは finding の **entity id** であり行 id ではない。
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

/**
 * 知識グラフのノード選定で走査するエッジペア数の、ノード上限に対する倍率。
 * 貪欲選択は「limit に収まらないペア」を読み飛ばして次を見るため、limit と同数の
 * ペアだけでは埋まらないことがある。
 *
 * SHORTCUT: ペア走査を limit * 20 で打ち切る貪欲選択.
 * ceiling: 上位ペアが少数のノードへ集中する形状では、走査を使い切っても limit 未満の
 * ノード数で終わる（応答からは「そもそも繋がっていない」と区別できない）.
 * upgrade: 下の充填未達 warn ログを観測したら、倍率を上げるかカーソル継続へ切り替える.
 */
const KNOWLEDGE_GRAPH_PAIR_SCAN_MULTIPLIER = 20;

/**
 * 視野の高速経路で、`limit` の何倍のノードを候補として読むか。
 *
 * エッジ誘導選定は「相手が候補の中に居るペア」からしか採れないため、候補が `limit` ちょうどだと
 * 枠が埋まらない。倍率を上げるほど埋まりやすくなるが、候補は視野内の全行を次数で整列してから
 * 切るので読み込み量に直結する。4 は実測（合成 100,000）で枠が埋まる最小の倍率。
 */
const KNOWLEDGE_GRAPH_VIEWPORT_CANDIDATE_MULTIPLIER = 4;

/**
 * 知識グラフが 1 応答で返すノード数の上限。ルート側の clamp（TrailDataServer）と揃える。
 *
 * 制約はサーバではなくクライアント。実測（Chromium 1400x900・実データ・`drawGraph` に計測を
 * 入れた 1 フレームの所要）:
 *
 * | ノード | リンク | ラベル選定改善前 | 改善後 |
 * | ---: | ---: | ---: | ---: |
 * | 2,000 | 8,370 | 3.9ms | 計測せず |
 * | 5,000 | 14,378 | 11.2ms | 4.8ms |
 * | 10,000 | 18,977 | 22.1ms | **8.5ms** |
 * | 16,000 | 23,353 | 62.8ms | 44.3ms |
 *
 * 10,000 は 1 フレーム 8.5ms（120fps 相当の描画予算）で成立する。16,000 は 44.3ms（22fps）で、
 * 残りはラベルではなくリンク・ノードの描画側（42.2ms）。ここを削るには画面外カリングと LOD が
 * 要るため、上限は 10,000 に置く。
 *
 * 初回描画は別問題で、10,000 で約 3.3 秒かかる。これはレイアウト（Barnes-Hut）の同期実行が
 * 占めており、描画方式に依存しない（WebGL の oz スキンでも 3.7 秒）。既定を 150 に据え置くのは
 * このため。詳細は proposal/20260808-knowledge-graph-10k-rendering.ja.md。
 *
 * SQL 側は上限要因ではない（本番 DB のコピーで limit=20,000 でも 510ms）。
 */
const KNOWLEDGE_GRAPH_MAX_NODES = 10000;

/**
 * 知識グラフのノード集合を、順位付け済みのエッジペア列から貪欲に組み立てる。
 * ペアの端点しか採らないので、返る ID はすべて少なくとも 1 本のリンクを持つ。
 *
 * @param pairRows `[a, b]` の 2 列。呼び出し側が重要度の降順に並べて渡す
 * @param limit ノード数の上限
 */
function selectEdgeInducedNodeIds(
  pairRows: readonly (readonly SqlValue[])[],
  limit: number,
): Set<string> {
  const selected = new Set<string>();
  for (const row of pairRows) {
    const a = toStr(row[0]);
    const b = toStr(row[1]);
    const need = (selected.has(a) ? 0 : 1) + (selected.has(b) ? 0 : 1);
    // 収まらないペアは読み飛ばす（片端が既出のペアなら後から 1 枠で入る）
    if (need === 0 || selected.size + need > limit) continue;
    selected.add(a);
    selected.add(b);
    if (selected.size >= limit) break;
  }
  return selected;
}

/**
 * 知識グラフの「今見えている範囲」（`caravan_entity_layout` と同じ世界座標）。
 * 4 辺すべてが有限値でなければ視野指定として扱わない（部分指定は片側が無限の帯になる）。
 */
export interface KnowledgeGraphBbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * 有効エッジの CTE を、種別フィルタと視野で絞って組み立てる。
 *
 * SQL とバインド値を 1 か所で作るのは、この CTE が 4 つのクエリへ埋め込まれるため。
 * 条件の並びとバインドの並びが別々の場所にあると、片方だけ足した時に静かに値がずれる
 * （SQLite は位置バインドなのでエラーにならず、違う条件で絞った結果が返る）。
 */
function buildActiveEdgesCte(params: {
  types: readonly string[];
  bbox: KnowledgeGraphBbox | null;
}): { sql: string; binds: SqlValue[] } {
  const { types, bbox } = params;
  const binds: SqlValue[] = [];
  // 視野は両端に課す。片端だけで絞ると画面外へ伸びる線の相手が選定に入り込み、
  // 「見えている範囲の上位 N」という約束が崩れる。
  let viewportFilter = '';
  if (bbox) {
    viewportFilter = `
            AND EXISTS (
              SELECT 1 FROM caravan_entity_layout ls
               WHERE ls.entity_id = es.id AND ls.x BETWEEN ? AND ? AND ls.y BETWEEN ? AND ?)
            AND EXISTS (
              SELECT 1 FROM caravan_entity_layout lo
               WHERE lo.entity_id = eo.id AND lo.x BETWEEN ? AND ? AND lo.y BETWEEN ? AND ?)`;
    binds.push(bbox.minX, bbox.maxX, bbox.minY, bbox.maxY);
    binds.push(bbox.minX, bbox.maxX, bbox.minY, bbox.maxY);
  }
  let typeFilter = '';
  if (types.length > 0) {
    typeFilter = `
            AND es.type IN (${types.map(() => '?').join(',')})
            AND eo.type IN (${types.map(() => '?').join(',')})`;
    binds.push(...types, ...types);
  }
  const sql = `
        active AS (
          SELECT e.subject_entity_id AS s, e.object_entity_id AS o
          FROM caravan_edges e
          JOIN caravan_entities es ON es.id = e.subject_entity_id
          JOIN caravan_entities eo ON eo.id = e.object_entity_id
          WHERE e.object_entity_id IS NOT NULL
            AND e.subject_entity_id != e.object_entity_id
            AND e.valid_to IS NULL
            AND NOT EXISTS (SELECT 1 FROM caravan_edge_invalidations i WHERE i.edge_id = e.id)
            -- soft delete されたエンティティを端点から外す。runCodeReconciliation は
            -- valid_until を立てるだけで辺を無効化しないため、ここで見ないと削除済み
            -- シンボルがゴーストとして図と件数に残り続ける（剥がす経路が無い）。
            AND es.valid_until IS NULL
            AND eo.valid_until IS NULL${viewportFilter}${typeFilter}
        )`;
  return { sql, binds };
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

/**
 * `hit_entity_ids`（JSON 配列の TEXT 列）を string[] へ解す。CHECK は json_valid までしか
 * 保証しない（配列でない JSON・文字列以外の要素が通り得る）ため、形が想定外の値は
 * 空配列へ落として図の描画側へ渡さない。
 */
function parseHitEntityIds(v: unknown): string[] {
  if (typeof v !== 'string' || v === '') return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
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
//  CaravanApiHandler
// ---------------------------------------------------------------------------

export class CaravanApiHandler {
  private readonly dbPath: string | undefined;
  private readonly logger: Logger;
  /**
   * 読み取り専用接続は lazy 初期化して使い回す。BetterSqlite3 は WAL モードで
   * 別接続からの書き込みを snapshot 経由で見られるため、cache の invalidate は不要。
   */
  private cachedReadOnlyDb: CaravanDbConnection | null = null;

  /** activity.db が cachedReadOnlyDb に ATTACH 済みか（session レビューの model 取得用） */
  private trailDbAttached = false;

  /**
   * caravan-book.db に caravan_instruction_sessions が在るか（指示 ID 解決用）。
   * Flight Record は caravan-book.db へ移設済み（2026-08-07）だが、移行前の DB や
   * FlightRecordDatabase 初期化前はテーブルが無いため、実在を見て縮退を決める。
   * probe は openReadOnly の接続キャッシュ確立時に 1 回だけ走る。TrailDataServer の
   * コンストラクタが FlightRecordDatabase.init()（= ensureTables）を同期完了させてから
   * リスナを立てる配線順序が前提（並べ替えると初回リクエストで恒久 false になりうる）。
   */
  private instructionSessionsAvailable = false;

  /**
   * `caravan_entity_layout`（migration 026）の有無。無い DB（migration 未適用・テストの
   * 手組みスキーマ）では座標を返さず、クライアント側レイアウトへ縮退する。
   */
  private entityLayoutAvailable = false;

  /**
   * `caravan_entity_layout.degree`（migration 027）の有無。あるとき視野の問い合わせは
   * `(x, y)` 索引駆動の高速経路に入る。無い DB では従来の全走査経路で答える（結果は同じで、
   * 遅いだけ）。
   */
  private entityLayoutDegreeAvailable = false;

  /**
   * better-sqlite3 の native binary 絶対パス。webpack-bundled VS Code 拡張で
   * bindings package が call stack から `.node` を推測できず crash する問題の
   * 回避策 (trail-caravan-book / TrailDatabase と同パターン)。
   * 未指定なら bindings の通常解決 (= テスト・スタンドアロン用途) に任せる。
   */
  private readonly nativeBinding?: string;

  /**
   * @param dbPath caravan-book.db の絶対パス。未設定は `null` で**明示**する（全 API
   *   レスポンスを "not configured" = exists:false / null として返す縮退に入る）。
   *
   *   省略可にして `getCaravanBookDbPath()` へ暗黙フォールバックしていたが、解決先が
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
        this.logger.warn(`[CaravanApiHandler.dispose] close failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      this.cachedReadOnlyDb = null;
    }
  }

  // ---- open helpers ----

  private openReadOnly(): CaravanDbConnection | null {
    if (this.cachedReadOnlyDb) return this.cachedReadOnlyDb;
    if (!this.dbPath || !fs.existsSync(this.dbPath)) return null;
    try {
      this.cachedReadOnlyDb = new BetterSqlite3CaravanDb({
        filePath: this.dbPath,
        readOnly: true,
        ...(this.nativeBinding ? { nativeBinding: this.nativeBinding } : {}),
      });
      try {
        const probe = this.cachedReadOnlyDb.exec(
          `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'caravan_instruction_sessions'`,
        );
        this.instructionSessionsAvailable = (probe[0]?.values.length ?? 0) > 0;
      } catch (err) {
        this.instructionSessionsAvailable = false;
        this.logger.warn(`[CaravanApiHandler.openReadOnly] caravan_instruction_sessions probe failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      try {
        const probe = this.cachedReadOnlyDb.exec(
          `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'caravan_entity_layout'`,
        );
        this.entityLayoutAvailable = (probe[0]?.values.length ?? 0) > 0;
        this.entityLayoutDegreeAvailable =
          this.entityLayoutAvailable &&
          (this.cachedReadOnlyDb
            .exec(`SELECT 1 FROM pragma_table_info('caravan_entity_layout') WHERE name = 'degree'`)[0]
            ?.values.length ?? 0) > 0;
      } catch (err) {
        this.entityLayoutAvailable = false;
        this.entityLayoutDegreeAvailable = false;
        this.logger.warn(`[CaravanApiHandler.openReadOnly] caravan_entity_layout probe failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      const trailDbPath = path.join(path.dirname(this.dbPath), 'activity.db');
      if (fs.existsSync(trailDbPath)) {
        // attachTrailDbReadOnly は async。同期 try/catch では reject を捕捉できない (S4822) ため
        // .catch() で拒否を処理する。楽観的に true をセットし、失敗時に false へ戻す。
        this.trailDbAttached = true;
        attachTrailDbReadOnly(this.cachedReadOnlyDb, trailDbPath).catch((err) => {
          this.trailDbAttached = false;
          this.logger.warn(`[CaravanApiHandler.openReadOnly] activity.db attach failed: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
      return this.cachedReadOnlyDb;
    } catch (err) {
      this.logger.error(`[CaravanApiHandler.openReadOnly] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return null;
    }
  }

  private openReadWrite(): CaravanDbConnection | null {
    if (!this.dbPath || !fs.existsSync(this.dbPath)) return null;
    try {
      const db = new BetterSqlite3CaravanDb({
        filePath: this.dbPath,
        readOnly: false,
        ...(this.nativeBinding ? { nativeBinding: this.nativeBinding } : {}),
      });
      db.run('PRAGMA foreign_keys = ON');
      return db;
    } catch (err) {
      this.logger.error(`[CaravanApiHandler.openReadWrite] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return null;
    }
  }

  /**
   * read-only 共有接続は close しない (dispose 時に一括 close)。
   * read-write 接続のみ close する。両者を区別してミスを防ぐためのヘルパー。
   */
  private close(db: CaravanDbConnection): void {
    if (db === this.cachedReadOnlyDb) return;
    db.close();
  }

  // ---- drift events ----

  /**
   * trail-caravan-book が保持するワークスペース（repo_name）の一覧。
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
        "SELECT DISTINCT workspace FROM caravan_reviews WHERE workspace != ''",
        "SELECT DISTINCT workspace FROM caravan_bug_fixes WHERE workspace != ''",
        "SELECT DISTINCT workspace FROM caravan_drift_events WHERE workspace != ''",
      ]) {
        const result = db.exec(sql);
        for (const row of result[0]?.values ?? []) names.add(String(row[0]));
      }
      return [...names].sort((a, b) => a.localeCompare(b));
    } catch (err) {
      this.logger.error(`[CaravanApiHandler.listWorkspaces] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
     * caravan-book.db は複数ワークスペースを 1 DB に集約するため、これが無いと
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
        FROM caravan_drift_events de
        LEFT JOIN caravan_entities e ON e.id = de.subject_entity_id
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
      this.logger.error(`[CaravanApiHandler.listDriftEvents] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
         FROM caravan_drift_events de
         LEFT JOIN caravan_entities e ON e.id = de.subject_entity_id
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
      this.logger.error(`[CaravanApiHandler.getDriftEventDetail] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
      this.logger.error(`[CaravanApiHandler.resolveDriftEvent] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
         FROM caravan_drift_events de
         LEFT JOIN caravan_entities e ON e.id = de.subject_entity_id
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
      this.logger.error(`[CaravanApiHandler.listRecurringBugs] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
      // caravan_instruction_sessions は caravan-book.db 内（2026-08-07 移設）。未移行 DB では
      // テーブルが無いので、行全体を落とさずセッション ID へフォールバックする。
      const instructionIdExpr = this.instructionSessionsAvailable
        ? `COALESCE(
             (SELECT i.instruction_id FROM caravan_instruction_sessions i
               WHERE i.session_id = bf.related_session_id),
             bf.related_session_id
           )`
        : 'bf.related_session_id';
      const result = db.exec(
        `SELECT bf.id, bf.commit_sha, bf.bug_entity_id, bf.package, bf.category,
                bf.subject_summary, bf.related_session_id, bf.committed_at, bf.workspace,
                ${instructionIdExpr} AS instruction_id,
                (SELECT GROUP_CONCAT(e.subject_entity_id)
                 FROM caravan_edges e
                 WHERE e.predicate='precedes' AND e.valid_to IS NULL
                   AND e.object_entity_id = bf.bug_entity_id) AS preceded_by
         FROM caravan_bug_fixes bf
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
      this.logger.error(`[CaravanApiHandler.getBugHistory] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
         FROM caravan_bug_fixes bf
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
         FROM caravan_edges edge
         JOIN caravan_entities e ON e.id = edge.object_entity_id
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
             FROM caravan_edges edge
             WHERE edge.predicate='caused_by' AND edge.valid_to IS NULL
               AND edge.object_entity_id IN (${rootCauses.map(() => '?').join(',')})
               AND edge.subject_entity_id != ?`,
            toBindParams([...rootCauses.map((rc) => rc.entityId), bugEntityId]),
          );
      const siblingBugEntityIds = (siblingResult?.[0]?.values ?? []).map((r) => toStr(r[0]));

      // 4. preceding findings (precedes edges 逆方向)
      const precedesResult = db.exec(
        `SELECT edge.subject_entity_id, rf.target_file_path, rf.severity
         FROM caravan_edges edge
         LEFT JOIN caravan_review_findings rf ON rf.finding_entity_id = edge.subject_entity_id
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
          `SELECT subject_summary FROM caravan_bug_fixes WHERE commit_sha=? LIMIT 1`,
          toBindParams([introducedCommitSha]),
        );
        const subRow = subResult[0]?.values?.[0];
        introducedByCommitSubject = subRow ? toStr(subRow[0]) : null;
      } else {
        // fallback to introduced_by edge
        const edgeResult = db.exec(
          `SELECT e.canonical_name
           FROM caravan_edges edge
           JOIN caravan_entities e ON e.id = edge.object_entity_id
           WHERE edge.predicate='introduced_by' AND edge.valid_to IS NULL
             AND edge.subject_entity_id = ?
           LIMIT 1`,
          toBindParams([bugEntityId]),
        );
        const introRow = edgeResult[0]?.values?.[0];
        if (introRow) {
          // caravan_entities.canonical_name for Commit type = commit_sha
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
      this.logger.error(`[CaravanApiHandler.getBugCausalInfo] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
         FROM caravan_review_findings rf
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
      this.logger.error(`[CaravanApiHandler.listUnaddressedReviewFindings] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
             SELECT msg.model FROM trail.activity_messages msg
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
                 FROM caravan_edges e
                 WHERE e.predicate='precedes' AND e.valid_to IS NULL
                   AND e.subject_entity_id = rf.finding_entity_id) AS precedes_bugs
         FROM caravan_review_findings rf
         JOIN caravan_reviews r ON r.id = rf.review_id
         LEFT JOIN caravan_review_runs rr ON r.source_kind = 'agent' AND rr.id = r.source_ref
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
      this.logger.error(`[CaravanApiHandler.getReviewHistory] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
                     (SELECT i.instruction_id FROM caravan_instruction_sessions i
                       WHERE i.session_id = f.session_id),
                     f.session_id
                   ) AS instruction_id
            FROM (
              SELECT rf.id, rf.finding_entity_id, rf.review_id, rf.target_file_path, rf.target_repo,
                     rf.category, rf.severity, rf.finding_text,
                     rf.addressed_commit_sha, rf.addressed_at,
                     r.title, r.reviewer, r.reviewed_at, r.workspace,
                     substr(r.source_ref, 1, instr(r.source_ref, '#') - 1) AS session_id
              FROM caravan_review_findings rf
              JOIN caravan_reviews r ON r.id = rf.review_id
              WHERE r.source_kind = 'session' AND instr(r.source_ref, '#') > 1
            ) f`;
  }

  /**
   * 指示単位の指摘件数。instructionIds 未指定なら全件を返す。
   *
   * activity.db が ATTACH できていないときは結合キー（caravan_instruction_sessions）が引けないため
   * 空配列を返す。呼び出し側が「0 件」と「引けなかった」を区別できるよう、理由をログへ残す。
   */
  async getFlightReviewFindingCounts(): Promise<FlightReviewFindingCountRow[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    try {
      if (!this.instructionSessionsAvailable) {
        this.logger.error('[CaravanApiHandler.getFlightReviewFindingCounts] caravan_instruction_sessions table missing in caravan-book.db; cannot resolve instruction ids');
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
      this.logger.error(`[CaravanApiHandler.getFlightReviewFindingCounts] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
        this.logger.error('[CaravanApiHandler.getFlightReviewFindings] caravan_instruction_sessions table missing in caravan-book.db; cannot resolve instruction ids');
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
      this.logger.error(`[CaravanApiHandler.getFlightReviewFindings] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
         FROM caravan_pipeline_runs
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
      this.logger.error(`[CaravanApiHandler.listPipelineRunStatsByDay] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
         FROM caravan_pipeline_runs
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
      this.logger.error(`[CaravanApiHandler.listPipelineRuns] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
         FROM caravan_pipeline_run_logs
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
      this.logger.error(`[CaravanApiHandler.listPipelineRunLogs] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  /**
   * Phase 6 S5-C: ドリフト件数の日次推移を返す。
   * SQL は単純な範囲スキャンに留め、日次バケット化（JST 境界・0 埋め・未解決累計）は
   * trail-activity の純粋関数で行う（sql.js は CTE + window の組み合わせで性能が崩れるため）。
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
        `SELECT detected_at, resolved_at FROM caravan_drift_events ${where}`,
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
      this.logger.error(`[CaravanApiHandler.listDriftHistoryByDay] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
         FROM caravan_failed_items
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
      this.logger.error(`[CaravanApiHandler.listFailedItems] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  /**
   * Phase 6 S4 (Rationale Audit): セッションのコミットに紐付く決定根拠ノードを返す。
   * caravan-book.db の rationale_for エッジ（Decision → Commit）を、attach 済み trail.activity_session_commits で
   * セッション絞り込みして辿る（読み取り専用）。caravan-book.db 不在・attach 失敗・0 件は空配列。
   */
  async listRationaleNodes(params: { sessionId: string }): Promise<RationaleNode[]> {
    const db = this.openReadOnly();
    if (!db) return [];
    if (!this.trailDbAttached) {
      this.logger.warn('[CaravanApiHandler.listRationaleNodes] activity.db not attached; returning empty');
      return [];
    }
    try {
      const result = db.exec(
        `SELECT c.canonical_name AS commit_hash, d.summary, e.confidence_label, e.recorded_at AS created_at
         FROM caravan_edges e
         JOIN caravan_entities d ON d.id = e.subject_entity_id AND d.type = 'Decision'
         JOIN caravan_entities c ON c.id = e.object_entity_id AND c.type = 'Commit'
         WHERE e.predicate = 'rationale_for'
           AND c.canonical_name IN (SELECT commit_hash FROM trail.activity_session_commits WHERE session_id = ?)
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
      this.logger.error(`[CaravanApiHandler.listRationaleNodes] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
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
         FROM caravan_edge_invalidations
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
      this.logger.error(`[CaravanApiHandler.listInvalidations] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return [];
    } finally {
      this.close(db);
    }
  }

  // ---- knowledge graph (共起ネットワーク表示用) ----

  /**
   * 知識グラフ（caravan_entities / caravan_edges）を共起ネットワーク描画用に集約して返す。
   * 画面設計書: spec/31.trail/02.trail-viewer/trail-viewer-screen/trail-viewer-screen-knowledge-graph.ja.md §2.2
   *
   * 全件（実測 2.9 万ノード）は描画できないため、有効エッジ次数の上位 `limit` 件だけを返す。
   * 有効エッジ = エンティティ間（object_entity_id 非 NULL）・valid_to IS NULL・無効化記録なし。
   * `types` を指定すると両端がその種別に含まれるエッジだけで次数を数える（片端だけ該当する
   * エッジを残すと、絞り込んだはずの種別外ノードへの線が図に必要になってしまう）。
   *
   * DB 未設定・不在は null（「データ 0 件」と区別する。0 件は正常応答の空配列）。
   */
  async getKnowledgeGraph(
    params: { limit?: number; types?: string[]; bbox?: KnowledgeGraphBbox; seed?: string },
  ): Promise<KnowledgeGraphResponse | null> {
    const db = this.openReadOnly();
    if (!db) return null;
    try {
      // 表・列の有無は接続の寿命で固定されるため、まだ無い間はここで引き直す。座標を返すか
      // （bbox 指定の有無によらず）もこの判定に乗っている。
      this.refreshLayoutCapability(db);
      const limit = Math.max(1, clampLimit(params.limit, 150, KNOWLEDGE_GRAPH_MAX_NODES));
      // seed 指定は ego サブグラフ経路。種別・視野は適用しない（画面設計書 §2.4）
      if (params.seed !== undefined && params.seed !== '') {
        return this.getKnowledgeGraphEgo(db, { seed: params.seed, limit });
      }
      // 種別はバインドで渡すが、識別子形式に絞って未知の値（空文字・記号）を先に落とす
      const types = (params.types ?? []).filter((t) => /^[A-Za-z][A-Za-z0-9_]*$/.test(t));
      // 座標が 1 件も無い DB では視野で絞れない。無視した事実は応答の bboxApplied で返す
      // （黙って全体を返すと、クライアントは「この視野には何も無い」と読んでしまう）。
      const bbox = params.bbox !== undefined && this.hasStoredLayout(db) ? params.bbox : null;
      // 次数を持つ DB では視野の問い合わせを索引駆動へ切り替える（下記メソッドのコメント参照）。
      // 持たない DB（migration 027 未適用）は従来経路で正しく答えられるので縮退する。
      //
      // **種別フィルタ指定時は使わない**。保存済みの `degree` は種別を見ずに数えた値だが、
      // 画面設計書 §2.2 は「`types` 指定時は両端がその種別に含まれるエッジだけで次数を
      // 数える」と定めている。索引駆動へ入れると、初回取得（種別で絞った次数）と
      // パン後（全体次数）で同じノードの円の大きさが変わる。速さより定義の一致を採る。
      if (bbox !== null && types.length === 0 && this.entityLayoutDegreeAvailable) {
        return this.getKnowledgeGraphInViewport(db, { limit, bbox });
      }
      const { sql: activeCte, binds: activeBinds } = buildActiveEdgesCte({ types, bbox });
      const degCte = `
        deg AS (
          SELECT id, SUM(c) AS d FROM (
            SELECT s AS id, COUNT(*) AS c FROM active GROUP BY s
            UNION ALL
            SELECT o AS id, COUNT(*) AS c FROM active GROUP BY o
          ) GROUP BY id
        )`;

      // ノード選定はエッジ誘導。両端がともに重要なペア（次数の min が大きい順）から
      // 貪欲に採り、その端点をノード集合とする。次数上位 N を先に選ぶ方式では、ハブの相手
      // （低次数のスポーク）が全員カットラインの外へ落ちるため、ハブだけがリンク 1 本も
      // 持たない点として図に残る。
      // 次数の「和」ではなく「min」で並べるのは、和だと巨大ハブ 1 個とその低次数スポーク
      // ばかりが上位を占め、図が星形 1 個（実測 150 ノード / 149 リンク）に潰れるため。
      // min なら両端とも次数の高いペアが優先され、実測で同じ 150 ノードに 437 リンクが残る。
      const pairResult = db.exec(
        `WITH ${activeCte}, ${degCte},
        pairs AS (
          SELECT MIN(s, o) AS a, MAX(s, o) AS b, COUNT(*) AS strength
          FROM active
          GROUP BY MIN(s, o), MAX(s, o)
        )
        SELECT p.a, p.b
        FROM pairs p
        JOIN deg dg_a ON dg_a.id = p.a
        JOIN deg dg_b ON dg_b.id = p.b
        ORDER BY MIN(dg_a.d, dg_b.d) DESC, p.strength DESC, p.a, p.b
        LIMIT ?`,
        toBindParams([...activeBinds, limit * KNOWLEDGE_GRAPH_PAIR_SCAN_MULTIPLIER]),
      );

      const pairRows = pairResult[0]?.values ?? [];
      const selectedIds = selectEdgeInducedNodeIds(pairRows, limit);
      // 走査を使い切ってなお枠が埋まらなかった＝ペア走査の打ち切りが効いた可能性がある。
      // 応答からは「繋がっているノードがそれしか無い」と区別できないのでログへ残す。
      if (selectedIds.size < limit && pairRows.length >= limit * KNOWLEDGE_GRAPH_PAIR_SCAN_MULTIPLIER) {
        this.logger.warn(
          `[CaravanApiHandler.getKnowledgeGraph] pair scan exhausted: selected=${selectedIds.size} limit=${limit} scanned=${pairRows.length}`,
        );
      }

      // ペアが 1 つも収まらない場合（limit = 1・有効エッジ 0 本）だけ次数上位 N へ退避する。
      // 空集合を IN 句へ渡すと 0 件になり「データが無い」と区別できなくなる。
      // 選定 ID は件数によらずバインド 1 個（JSON 配列）で渡す。`IN (?,…)` で並べると
      // バインド数が選定件数そのものになり、SQLITE_MAX_VARIABLE_NUMBER（32,766）を
      // 上限引き上げ時に踏み抜く。
      const selectedIdsJson = JSON.stringify([...selectedIds]);
      const idFilter = selectedIds.size > 0
        ? `WHERE en.id IN (SELECT value FROM json_each(?))`
        : '';
      const idBinds = selectedIds.size > 0 ? [selectedIdsJson] : [];
      const layoutColumns = this.entityLayoutAvailable ? 'el.x, el.y' : 'NULL AS x, NULL AS y';
      const layoutJoin = this.entityLayoutAvailable
        ? 'LEFT JOIN caravan_entity_layout el ON el.entity_id = en.id'
        : '';
      const nodeResult = db.exec(
        `WITH ${activeCte}, ${degCte}
        SELECT en.id, en.display_name, en.type, deg.d, ${layoutColumns}
        FROM deg JOIN caravan_entities en ON en.id = deg.id
        ${layoutJoin}
        ${idFilter}
        ORDER BY deg.d DESC, en.id
        LIMIT ?`,
        toBindParams([...activeBinds, ...idBinds, limit]),
      );
      const nodeRows = (nodeResult[0]?.values ?? []).map((row) => {
        const x = row[4];
        const y = row[5];
        const hasPosition = typeof x === 'number' && typeof y === 'number';
        return {
          id: toStr(row[0]),
          label: toStr(row[1]),
          type: toStr(row[2]),
          frequency: Number(row[3] ?? 0),
          ...(hasPosition ? { x, y } : {}),
        };
      });

      const indexById = new Map<string, number>(nodeRows.map((row, i) => [row.id, i]));
      let links: { a: number; b: number; strength: number }[] = [];
      if (nodeRows.length > 0) {
        const ids = nodeRows.map((row) => row.id);
        // 選定 ID は件数によらずバインド 1 個（JSON 配列）で渡す。以前は `VALUES (?),…` で
        // 1 件 1 バインドしており、SQLITE_MAX_VARIABLE_NUMBER（32,766）が実質的な
        // ノード数上限になっていた。json_each なら上限はバインド数ではなく JSON の長さになる。
        const linkResult = db.exec(
          `WITH ${activeCte},
          sel(id) AS (SELECT value FROM json_each(?))
          SELECT MIN(s, o) AS a, MAX(s, o) AS b, COUNT(*) AS strength
          FROM active
          WHERE s IN (SELECT id FROM sel) AND o IN (SELECT id FROM sel)
          GROUP BY MIN(s, o), MAX(s, o)`,
          toBindParams([...activeBinds, JSON.stringify(ids)]),
        );
        links = (linkResult[0]?.values ?? []).flatMap((row) => {
          const a = indexById.get(toStr(row[0]));
          const b = indexById.get(toStr(row[1]));
          if (a === undefined || b === undefined) return [];
          return [{ a, b, strength: Number(row[2] ?? 0) }];
        });
      }

      const clusters = this.buildClusters(db, nodeRows);

      const connectedResult = db.exec(
        `WITH ${activeCte}
        SELECT COUNT(*) FROM (SELECT s AS id FROM active UNION SELECT o FROM active)`,
        toBindParams([...activeBinds]),
      );
      const connectedEntityCount = Number(connectedResult[0]?.values[0]?.[0] ?? 0);

      return {
        // id は引用・エージェント照会ヒット（実体 ID）と図のノードを突き合わせる鍵（§2.5）
        nodes: nodeRows,
        links,
        clusters,
        totalEntityCount: this.countEntities(db, types),
        // 視野指定時は「その視野で繋がっているノード」が分母。truncated は
        // 「この視野にまだ出せていないノードがある」を意味する。
        truncated: nodeRows.length < connectedEntityCount,
        availableTypes: this.listEntityTypes(db),
        bboxApplied: bbox !== null,
      };
    } catch (err) {
      this.logger.error(`[CaravanApiHandler.getKnowledgeGraph] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return null;
    } finally {
      this.close(db);
    }
  }

  /**
   * 視野（bbox）指定時の高速経路。
   *
   * 従来経路は「有効エッジ全件からノードの次数を数える」ところから始まるため、視野を
   * どれだけ狭めても `caravan_edges` の全走査が残る。実測（合成 100,000 ノード /
   * 200,000 リンク・2026-08-08）で、視野を 2% に絞っても 4.4 秒かかり、全体（2.7 秒）
   * より遅かった（視野の条件が走査を減らさず、両端の EXISTS を足すだけだったため）。
   *
   * ここでは順序を逆にする。まず `caravan_entity_layout` の `(x, y)` 索引で視野内のノードを
   * 取り、次数（migration 027 で保存済み）の降順に候補を切る。`caravan_edges` を引くのは
   * 「候補同士のリンク」を取るときだけで、`subject_entity_id` / `object_entity_id` の索引を
   * 使うため候補数に比例する。
   *
   * 選定は従来と同じエッジ誘導（ペアの端点だけを採る）で、**返るノードは必ず 1 本以上の
   * リンクを持つ**性質を保つ。`frequency` は保存済みの全体次数で、視野を変えても同じノードの
   * 円の大きさは変わらない（画面設計書 §2.2 の定義）。
   */
  private getKnowledgeGraphInViewport(
    db: CaravanDbConnection,
    params: { limit: number; bbox: KnowledgeGraphBbox },
  ): KnowledgeGraphResponse {
    const { limit, bbox } = params;
    // 種別フィルタは受け取らない。保存済みの次数が種別を見ていないため、この経路では
    // 画面設計書 §2.2 の定義（両端が同種別のエッジだけで数える）を満たせない。
    // 呼び出し側が types 非空のとき従来経路へ振り分ける前提を、型でも示しておく。
    const boxBinds: SqlValue[] = [bbox.minX, bbox.maxX, bbox.minY, bbox.maxY];

    const candidateRows = db.exec(
      `SELECT l.entity_id, en.display_name, en.type, l.degree, l.x, l.y
         FROM caravan_entity_layout l
         JOIN caravan_entities en ON en.id = l.entity_id
        WHERE l.x BETWEEN ? AND ? AND l.y BETWEEN ? AND ?
          AND en.valid_until IS NULL
          AND l.degree > 0
        ORDER BY l.degree DESC, l.entity_id
        LIMIT ?`,
      toBindParams([...boxBinds, limit * KNOWLEDGE_GRAPH_VIEWPORT_CANDIDATE_MULTIPLIER]),
    )[0]?.values ?? [];

    const candidates = candidateRows.map((row) => ({
      id: toStr(row[0]),
      label: toStr(row[1]),
      type: toStr(row[2]),
      frequency: Number(row[3] ?? 0),
      x: Number(row[4]),
      y: Number(row[5]),
    }));
    const degreeById = new Map(candidates.map((c) => [c.id, c.frequency]));

    // 候補側を外側のループに固定し、`subject_entity_id` の索引で辺を引く。
    //
    // **`CROSS JOIN` は結合順の固定が目的**（SQLite は CROSS JOIN のテーブル順を並べ替えない）。
    // ただの `JOIN` だと SQLite は `valid_to` の部分索引を見て辺側を外側に選び、有効エッジ
    // 200,000 行を走査してから候補集合を照合する。実測（合成 100,000・視野 50%・候補 8,000）
    // で **7,438ms → 46ms**。この 1 語が無いと、索引を足しても視野の絞り込みが効かない。
    //
    // 反対側の端点を `IN (副問い合わせ)` にするのは、SQLite が候補集合へ一時索引
    // （bloom filter 付き）を作るため。`json_each` を 2 回結合すると索引が無い側を
    // 舐め直すことになる。
    const candidateIdsJson = JSON.stringify(candidates.map((c) => c.id));
    const pairRows = candidates.length === 0 ? [] : db.exec(
      `WITH sel(id) AS (SELECT value FROM json_each(?))
       SELECT MIN(e.subject_entity_id, e.object_entity_id) AS a,
              MAX(e.subject_entity_id, e.object_entity_id) AS b,
              COUNT(*) AS strength
         FROM sel
         CROSS JOIN caravan_edges e ON e.subject_entity_id = sel.id
        WHERE e.object_entity_id IN (SELECT value FROM json_each(?))
          AND e.subject_entity_id != e.object_entity_id
          AND e.valid_to IS NULL
          AND NOT EXISTS (SELECT 1 FROM caravan_edge_invalidations i WHERE i.edge_id = e.id)
        GROUP BY 1, 2`,
      toBindParams([candidateIdsJson, candidateIdsJson]),
    )[0]?.values ?? [];

    const pairs = pairRows
      .map((row) => ({ a: toStr(row[0]), b: toStr(row[1]), strength: Number(row[2] ?? 0) }))
      // 従来経路と同じ順序（両端次数の min 降順 → 多重度降順 → id 昇順）。和で並べると
      // 巨大ハブ 1 個と低次数スポークが上位を独占し、図が星形 1 個に潰れる。
      .sort((l, r) => {
        const lm = Math.min(degreeById.get(l.a) ?? 0, degreeById.get(l.b) ?? 0);
        const rm = Math.min(degreeById.get(r.a) ?? 0, degreeById.get(r.b) ?? 0);
        return rm - lm || r.strength - l.strength || l.a.localeCompare(r.a) || l.b.localeCompare(r.b);
      });

    const selectedIds = selectEdgeInducedNodeIds(pairs.map((p) => [p.a, p.b]), limit);
    if (selectedIds.size < limit && candidates.length >= limit * KNOWLEDGE_GRAPH_VIEWPORT_CANDIDATE_MULTIPLIER) {
      // 候補の打ち切りで枠が埋まらなかった可能性がある。応答からは「視野にそれしか無い」と
      // 区別できないのでログへ残す（従来経路のペア走査打ち切りと同じ扱い）。
      this.logger.warn(
        `[CaravanApiHandler.getKnowledgeGraph] viewport candidates exhausted: selected=${selectedIds.size} limit=${limit} candidates=${candidates.length}`,
      );
    }

    const nodes = candidates.filter((c) => selectedIds.has(c.id));
    const indexById = new Map(nodes.map((node, i) => [node.id, i]));
    const links = pairs.flatMap((pair) => {
      const a = indexById.get(pair.a);
      const b = indexById.get(pair.b);
      if (a === undefined || b === undefined) return [];
      return [{ a, b, strength: pair.strength }];
    });

    const clusters = this.buildClusters(db, nodes);

    // 視野の中で「エッジを持つノード」の総数。打ち切りが起きたかの分母に使う。
    const inViewConnected = Number(
      db.exec(
        `SELECT COUNT(*)
           FROM caravan_entity_layout l
           JOIN caravan_entities en ON en.id = l.entity_id
          WHERE l.x BETWEEN ? AND ? AND l.y BETWEEN ? AND ?
            AND en.valid_until IS NULL
            AND l.degree > 0`,
        toBindParams([...boxBinds]),
      )[0]?.values[0]?.[0] ?? 0,
    );

    return {
      nodes,
      links,
      clusters,
      totalEntityCount: this.countEntities(db, []),
      truncated: nodes.length < inViewConnected,
      availableTypes: this.listEntityTypes(db),
      bboxApplied: true,
    };
  }

  /**
   * 座標が 1 行でも保存されているか。**テーブルの有無ではなく行の有無**を見る。
   *
   * migration 026 を当てた直後（パイプライン初回実行前）はテーブルが在って空になる。
   * テーブルの有無だけで視野を有効にすると、その窓では在るはずのデータが全部落ちて
   * 「空グラフ ＋ bboxApplied: true」が返り、クライアントは「この視野には何も無い」と
   * 読んでしまう（Codex レビュー 2026-08-08 指摘 1）。接続確立時の probe に混ぜないのは、
   * 同じ接続を使い続けている間にパイプラインが行を書くため。
   *
   * 既知の限界: 「1 行でもあるか」しか見ないので、エッジ集合が変わってレイアウトが古い間は
   * 新しいノードが座標を持たず視野に現れない。これは事前計算方式に内在する遅れで、次の
   * パイプライン実行で解消する。
   */
  private hasStoredLayout(db: CaravanDbConnection): boolean {
    this.refreshLayoutCapability(db);
    if (!this.entityLayoutAvailable) return false;
    try {
      return (db.exec(`SELECT 1 FROM caravan_entity_layout LIMIT 1`)[0]?.values.length ?? 0) > 0;
    } catch (err) {
      this.logger.warn(
        `[CaravanApiHandler.hasStoredLayout] probe failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /**
   * `caravan_entity_layout` と `degree` 列の有無を**まだ無い間だけ**引き直す。
   *
   * 接続確立時の probe は 1 回きりで、read-only 接続は daemon 停止まで生きる。migration を
   * 当てるのは別の書き込み接続（パイプライン・LogService）なので、read-only 側が先に
   * 確立された既存 DB では、表や列が後から生えても false のまま固まる。症状は
   * 「座標を返さない・索引駆動に入らない」という静かな縮退で、probe 自体は成功するため
   * ログにも出ない（Codex 指摘 1 と同じ理由が、行ではなく表・列にも当てはまる）。
   *
   * 一度 true になったら引き直さない（表と列は消えない）。false の間だけの片方向再評価
   * なので、定常状態での追加コストは無い。
   */
  private refreshLayoutCapability(db: CaravanDbConnection): void {
    if (this.entityLayoutDegreeAvailable) return;
    try {
      if (!this.entityLayoutAvailable) {
        this.entityLayoutAvailable = (db.exec(
          `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'caravan_entity_layout'`,
        )[0]?.values.length ?? 0) > 0;
      }
      if (this.entityLayoutAvailable) {
        this.entityLayoutDegreeAvailable = (db.exec(
          `SELECT 1 FROM pragma_table_info('caravan_entity_layout') WHERE name = 'degree'`,
        )[0]?.values.length ?? 0) > 0;
      }
    } catch (err) {
      this.logger.warn(
        `[CaravanApiHandler.refreshLayoutCapability] re-probe failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** 種別フィルタ適用後の全エンティティ数（表示が全体の一部であることを示す分母）。 */
  // ---- knowledge graph search（画面設計書 §2.4）----

  /**
   * 知識グラフ画面の検索。埋め込み・LLM を使わない 2 アーム構成
   * （FTS: 語彙・識別子分割 / LIKE: トークン境界に乗らない部分文字列）。
   * webview 経路を ollama 稼働へ依存させないための設計（proposal 20260810）。
   */
  async searchKnowledgeGraph(
    params: { q: string; limit?: number },
  ): Promise<KnowledgeGraphSearchResponse | null> {
    const db = this.openReadOnly();
    if (!db) return null;
    try {
      this.refreshLayoutCapability(db);
      const q = params.q.trim();
      if (!q) return { hits: [], truncated: false };
      const limit = Math.max(1, Math.min(params.limit ?? 20, 50));
      const pool = limit * 3;
      // 統合順: 完全一致(0) → 前方一致(1000) → FTS bm25 順(2000+) → LIKE 出現位置順(3000+)。
      // 小さいほど上位。両アームでヒットした id は良い方の順位を採る
      const rankById = new Map<string, number>();
      const consider = (id: string, score: number): void => {
        const prev = rankById.get(id);
        if (prev === undefined || score < prev) rankById.set(id, score);
      };
      this.searchKnowledgeGraphFtsArm(db, q, pool).forEach((id, i) => consider(id, 2000 + i));
      this.searchKnowledgeGraphLikeArm(db, q, pool).forEach((id, i) => consider(id, 3000 + i));
      if (rankById.size === 0) return { hits: [], truncated: false };

      const detail = db.exec(
        `SELECT id, display_name, canonical_name, type, summary FROM caravan_entities
          WHERE id IN (SELECT value FROM json_each(?)) AND valid_until IS NULL`,
        [JSON.stringify([...rankById.keys()])],
      );
      const ql = q.toLowerCase();
      const scored: { id: string; label: string; type: string; score: number }[] = [];
      for (const row of detail[0]?.values ?? []) {
        const id = toStr(row[0]);
        const label = toStr(row[1]);
        const canonical = toStr(row[2]);
        const type = toStr(row[3]);
        const summary = toStr(row[4]);
        // 無名・低情報エンティティは返さない（2026-08-09 に上位独占の実測があった）
        if (isLowInformationEntity(label, summary)) continue;
        let score = rankById.get(id) ?? Number.MAX_SAFE_INTEGER;
        if (label.toLowerCase() === ql || canonical.toLowerCase() === ql) score = 0;
        else if (label.toLowerCase().startsWith(ql)) score = Math.min(score, 1000);
        scored.push({ id, label, type, score });
      }
      scored.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
      const truncated = scored.length > limit;
      const top = scored.slice(0, limit);
      const degrees = this.fetchStoredDegrees(db, top.map((t) => t.id));
      return {
        hits: top.map((t) => ({ id: t.id, label: t.label, type: t.type, degree: degrees.get(t.id) ?? 0 })),
        truncated,
      };
    } catch (err) {
      this.logger.error(`[CaravanApiHandler.searchKnowledgeGraph] ${String(err)}, Stack: ${err instanceof Error ? err.stack : ''}`);
      return null;
    } finally {
      this.close(db);
    }
  }

  /** FTS アーム。FTS 表の無い DB（migration 013 未適用・FTS5 非対応ビルド）は空で縮退する。 */
  private searchKnowledgeGraphFtsArm(db: CaravanDbConnection, q: string, limit: number): string[] {
    const tableCount = Number(
      db.exec(
        `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'caravan_entities_fts'`,
      )[0]?.values[0]?.[0] ?? 0,
    );
    if (tableCount === 0) return [];
    const match = tokenizeForFts5(q);
    if (!match) return [];
    const rows = db.exec(
      `SELECT e.id FROM caravan_entities_fts f
         JOIN caravan_entities e ON e.rowid = f.rowid
        WHERE caravan_entities_fts MATCH ? AND e.valid_until IS NULL
        ORDER BY bm25(caravan_entities_fts) ASC
        LIMIT ?`,
      [match, limit],
    );
    return (rows[0]?.values ?? []).map((r) => toStr(r[0]));
  }

  /**
   * LIKE アーム。識別子形クエリ（空白を含まない）に限る。トークン境界に乗らない
   * 部分文字列（`lockAlign` 等）を拾う。B1 の FTS 分割が索引済みでも境界内の
   * 部分一致は FTS では原理的に引けないため、撤去せず併走する。
   */
  private searchKnowledgeGraphLikeArm(db: CaravanDbConnection, q: string, limit: number): string[] {
    if (!/^[A-Za-z0-9_./\\-]+$/.test(q)) return [];
    const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
    const rows = db.exec(
      `SELECT id FROM caravan_entities
        WHERE display_name LIKE ? ESCAPE '\\' AND valid_until IS NULL
        ORDER BY INSTR(LOWER(display_name), LOWER(?)) ASC, LENGTH(display_name) ASC, id
        LIMIT ?`,
      [`%${escaped}%`, q, limit],
    );
    return (rows[0]?.values ?? []).map((r) => toStr(r[0]));
  }

  /** 保存済み全体次数（migration 027）。無い DB では空 Map（呼び出し側で 0 に倒す）。 */
  private fetchStoredDegrees(db: CaravanDbConnection, ids: readonly string[]): Map<string, number> {
    if (!this.entityLayoutDegreeAvailable || ids.length === 0) return new Map();
    const rows = db.exec(
      `SELECT entity_id, degree FROM caravan_entity_layout
        WHERE entity_id IN (SELECT value FROM json_each(?))`,
      [JSON.stringify([...ids])],
    );
    return new Map((rows[0]?.values ?? []).map((r) => [toStr(r[0]), toNum(r[1])]));
  }

  /**
   * seed の 1 ホップ ego サブグラフ（画面設計書 §2.4）。隣接は多重度降順で
   * `limit - 1` 件に切り、隣接ノード同士のエッジも含めて返す。
   *
   * メイン経路（エッジ誘導選定）と応答組み立てが部分的に重複するが、選定・順序の
   * 規則が異なる（重要度でなく seed 距離が軸）ため、共通化して条件分岐を増やすより
   * 独立した小メソッドを保つ。
   */
  private getKnowledgeGraphEgo(
    db: CaravanDbConnection,
    params: { seed: string; limit: number },
  ): KnowledgeGraphResponse {
    const { seed, limit } = params;
    const empty: KnowledgeGraphResponse = {
      nodes: [],
      links: [],
      clusters: [],
      totalEntityCount: this.countEntities(db, []),
      truncated: false,
      availableTypes: this.listEntityTypes(db),
      bboxApplied: false,
    };
    const seedExists = db.exec(
      `SELECT 1 FROM caravan_entities WHERE id = ? AND valid_until IS NULL`,
      [seed],
    );
    if ((seedExists[0]?.values.length ?? 0) === 0) return empty;

    const { sql: activeCte, binds: activeBinds } = buildActiveEdgesCte({ types: [], bbox: null });
    const capacity = Math.max(0, limit - 1);
    const neighborRows = db.exec(
      `WITH ${activeCte}
      SELECT CASE WHEN s = ? THEN o ELSE s END AS nb, COUNT(*) AS strength
      FROM active
      WHERE s = ? OR o = ?
      GROUP BY nb
      ORDER BY strength DESC, nb
      LIMIT ?`,
      toBindParams([...activeBinds, seed, seed, seed, capacity + 1]),
    )[0]?.values ?? [];
    const truncated = neighborRows.length > capacity;
    const ids = [seed, ...neighborRows.slice(0, capacity).map((r) => toStr(r[0]))];

    const degCte = `
        deg AS (
          SELECT id, SUM(c) AS d FROM (
            SELECT s AS id, COUNT(*) AS c FROM active GROUP BY s
            UNION ALL
            SELECT o AS id, COUNT(*) AS c FROM active GROUP BY o
          ) GROUP BY id
        )`;
    const layoutColumns = this.entityLayoutAvailable ? 'el.x, el.y' : 'NULL AS x, NULL AS y';
    const layoutJoin = this.entityLayoutAvailable
      ? 'LEFT JOIN caravan_entity_layout el ON el.entity_id = en.id'
      : '';
    const nodeResult = db.exec(
      `WITH ${activeCte}, ${degCte}
      SELECT en.id, en.display_name, en.type, COALESCE(deg.d, 0), ${layoutColumns}
      FROM caravan_entities en
      LEFT JOIN deg ON deg.id = en.id
      ${layoutJoin}
      WHERE en.id IN (SELECT value FROM json_each(?))
      ORDER BY CASE WHEN en.id = ? THEN 0 ELSE 1 END, COALESCE(deg.d, 0) DESC, en.id`,
      toBindParams([...activeBinds, JSON.stringify(ids), seed]),
    );
    const nodeRows = (nodeResult[0]?.values ?? []).map((row) => {
      const x = row[4];
      const y = row[5];
      const hasPosition = typeof x === 'number' && typeof y === 'number';
      return {
        id: toStr(row[0]),
        label: toStr(row[1]),
        type: toStr(row[2]),
        frequency: Number(row[3] ?? 0),
        ...(hasPosition ? { x, y } : {}),
      };
    });

    const indexById = new Map<string, number>(nodeRows.map((row, i) => [row.id, i]));
    let links: { a: number; b: number; strength: number }[] = [];
    if (nodeRows.length > 0) {
      const linkResult = db.exec(
        `WITH ${activeCte},
        sel(id) AS (SELECT value FROM json_each(?))
        SELECT MIN(s, o) AS a, MAX(s, o) AS b, COUNT(*) AS strength
        FROM active
        WHERE s IN (SELECT id FROM sel) AND o IN (SELECT id FROM sel)
        GROUP BY MIN(s, o), MAX(s, o)`,
        toBindParams([...activeBinds, JSON.stringify(nodeRows.map((r) => r.id))]),
      );
      links = (linkResult[0]?.values ?? []).flatMap((row) => {
        const a = indexById.get(toStr(row[0]));
        const b = indexById.get(toStr(row[1]));
        if (a === undefined || b === undefined) return [];
        return [{ a, b, strength: Number(row[2] ?? 0) }];
      });
    }

    return {
      ...empty,
      nodes: nodeRows,
      links,
      clusters: this.buildClusters(db, nodeRows),
      truncated,
    };
  }

  /**
   * エージェント照会（MCP search_caravan_book が記録した `source='agent'` の検索）の
   * 直近リスト（画面設計書 §2.5）。ヒット実体は label / type へ解決し、soft delete 済みは
   * 除外する（存在しない実体を画面の選択肢に出さない）。解決後 0 件の照会も返す —
   * 「エージェントは照会したが現存実体に到達しなかった」事実を隠さない。
   *
   * migration 032 未適用の旧 DB（source 列なし）はクエリが失敗するため空リストへ縮退する
   * （照会リストは付加機能であり、ここで 500 を返すと画面全体が障害の顔になる）。
   */
  async getAgentSearches(params: { limit?: number }): Promise<{
    queries: { id: string; query: string; occurredAt: string; hits: { id: string; label: string; type: string }[] }[];
  } | null> {
    const db = this.openReadOnly();
    if (!db) return null;
    const limit = Math.max(1, clampLimit(params.limit, 10, 50));
    try {
      const eventResult = db.exec(
        `SELECT id, occurred_at, query, hit_entity_ids
         FROM caravan_search_events
         WHERE source = 'agent' AND kind = 'search'
         ORDER BY occurred_at DESC
         LIMIT ?`,
        toBindParams([limit]),
      );
      const events = (eventResult[0]?.values ?? []).map((row) => ({
        id: toStr(row[0]),
        occurredAt: toStr(row[1]),
        query: toStr(row[2]),
        hitIds: parseHitEntityIds(row[3]),
      }));

      const allIds = [...new Set(events.flatMap((e) => e.hitIds))];
      const entityById = new Map<string, { label: string; type: string }>();
      if (allIds.length > 0) {
        const entityResult = db.exec(
          `SELECT id, display_name, type
           FROM caravan_entities
           WHERE id IN (SELECT value FROM json_each(?)) AND valid_until IS NULL`,
          toBindParams([JSON.stringify(allIds)]),
        );
        for (const row of entityResult[0]?.values ?? []) {
          entityById.set(toStr(row[0]), { label: toStr(row[1]), type: toStr(row[2]) });
        }
      }

      return {
        queries: events.map((event) => ({
          id: event.id,
          query: event.query,
          occurredAt: event.occurredAt,
          hits: event.hitIds.flatMap((hitId) => {
            const entity = entityById.get(hitId);
            return entity ? [{ id: hitId, ...entity }] : [];
          }),
        })),
      };
    } catch (err) {
      this.logger.warn(
        `[CaravanApiHandler.getAgentSearches] degraded to empty list: ${err instanceof Error ? (err.stack ?? String(err)) : String(err)}`,
      );
      return { queries: [] };
    }
  }

  /**
   * 画面検索の計測イベント記録（画面設計書 §2.4。記録は本機能の受け入れ条件）。
   * 記録の失敗で検索機能を止めない（fail-open。充足率は評価ハーネス側で監視する）。
   */
  async recordSearchEvent(
    params: {
      kind: 'search' | 'ego_open' | 'clear';
      query: string;
      resultCount?: number;
      entityId?: string;
      /** ego_open の起点動線（screen spec §3.6）。search / clear では送られない。 */
      origin?: 'search' | 'citation' | 'agent_history';
    },
  ): Promise<{ ok: boolean }> {
    if (!['search', 'ego_open', 'clear'].includes(params.kind)) {
      this.logger.warn(`[CaravanApiHandler.recordSearchEvent] invalid kind: ${String(params.kind)}`);
      return { ok: false };
    }
    if (params.origin !== undefined && !['search', 'citation', 'agent_history'].includes(params.origin)) {
      this.logger.warn(`[CaravanApiHandler.recordSearchEvent] invalid origin: ${String(params.origin)}`);
      return { ok: false };
    }
    const db = this.openReadWrite();
    if (!db) return { ok: false };
    try {
      // origin 列は migration 032 が前提。未適用 DB では INSERT が失敗し fail-open で
      // WARN に落ちる（デーモン/拡張の次回 open が migration を流すまでの一時的な欠落）。
      db.run(
        `INSERT INTO caravan_search_events (id, occurred_at, kind, query, result_count, entity_id, origin)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          new Date().toISOString(),
          params.kind,
          params.query,
          params.resultCount ?? null,
          params.entityId ?? null,
          params.origin ?? null,
        ],
      );
      this.close(db);
      return { ok: true };
    } catch (err) {
      this.logger.warn(
        `[CaravanApiHandler.recordSearchEvent] ${err instanceof Error ? (err.stack ?? String(err)) : String(err)}`,
      );
      this.close(db);
      return { ok: false };
    }
  }

  private countEntities(db: CaravanDbConnection, types: readonly string[]): number {
    const filter = types.length > 0 ? `WHERE type IN (${types.map(() => '?').join(',')})` : '';
    const result = db.exec(`SELECT COUNT(*) FROM caravan_entities ${filter}`, toBindParams([...types]));
    return Number(result[0]?.values[0]?.[0] ?? 0);
  }

  /** DB に実在する全種別（種別フィルタ UI の選択肢。フィルタの影響を受けない）。 */
  private listEntityTypes(db: CaravanDbConnection): string[] {
    const result = db.exec(`SELECT DISTINCT type FROM caravan_entities ORDER BY type`);
    return (result[0]?.values ?? []).map((row) => toStr(row[0]));
  }

  /**
   * clusters を組み立てる（T-22）。要約済みコミュニティ（caravan_community_summaries）に
   * 属する表示ノードが 1 件でもあれば名前付きコミュニティで束ね、無ければ従来の
   * type グルーピングへフォールバックする。名前付きコミュニティに属さないノードは
   * どのクラスタにも入らない（クラスタは全ノードの分割ではなく重ね掛けの注記）。
   */
  private buildClusters(
    db: CaravanDbConnection,
    nodes: readonly { id: string; type: string }[],
  ): { label: string; members: number[] }[] {
    const communityClusters = this.buildCommunityClusters(db, nodes);
    if (communityClusters.length > 0) return communityClusters;
    const clustersByType = new Map<string, number[]>();
    nodes.forEach((node, i) => {
      const members = clustersByType.get(node.type) ?? [];
      members.push(i);
      clustersByType.set(node.type, members);
    });
    return [...clustersByType.entries()].map(([label, members]) => ({ label, members }));
  }

  private buildCommunityClusters(
    db: CaravanDbConnection,
    nodes: readonly { id: string }[],
  ): { label: string; members: number[] }[] {
    if (nodes.length === 0) return [];
    // migration 026/028 未適用の DB ではテーブル自体が無い。行の有無でなくテーブルの
    // 有無を見るのは、ここでは「無ければ type フォールバック」が正しい縮退のため
    const tableCount = Number(
      db.exec(
        `SELECT COUNT(*) FROM sqlite_master
          WHERE type = 'table' AND name IN ('caravan_entity_layout', 'caravan_community_summaries')`,
      )[0]?.values[0]?.[0] ?? 0,
    );
    if (tableCount < 2) return [];

    const rows =
      db.exec(
        `SELECT l.entity_id, s.name
           FROM caravan_entity_layout l
           JOIN caravan_community_summaries s
             ON s.graph_version = l.graph_version AND s.community_id = l.community_id
          WHERE l.entity_id IN (SELECT value FROM json_each(?))`,
        toBindParams([JSON.stringify(nodes.map((node) => node.id))]),
      )[0]?.values ?? [];
    const nameByEntityId = new Map(rows.map((row) => [toStr(row[0]), toStr(row[1])]));

    const byName = new Map<string, number[]>();
    nodes.forEach((node, i) => {
      const name = nameByEntityId.get(node.id);
      if (name === undefined) return;
      const members = byName.get(name) ?? [];
      members.push(i);
      byName.set(name, members);
    });
    return [...byName.entries()].map(([label, members]) => ({ label, members }));
  }

}
