import fs from 'node:fs';
import path from 'node:path';

import { openBetterSqlite3 } from './internal/loadBetterSqlite3';
import { SqlJsCompatDatabase } from './internal/SqlJsCompatDatabase';
import { type DbLogger, noopDbLogger } from './DbLogger';
import { resolveDbWithLegacyRename } from './legacyDbRename';
import {
  assembleInstructionRecord,
  foldInstructionDeliverables,
  CREATE_ACCEPTANCE_INDEXES,
  CREATE_ACCEPTANCE_RECORDS,
  CREATE_FLIGHT_REVIEW_INDEXES,
  CREATE_FLIGHT_REVIEWS,
  CREATE_INSTRUCTION_INDEXES,
  CREATE_INSTRUCTION_SESSIONS,
  CREATE_INSTRUCTIONS,
  VERIFICATION_KINDS,
  type AcceptanceMissRate,
  type AcceptanceRecord,
  type AcceptanceRecordFilter,
  type AcceptanceRecordInput,
  type AcceptanceRoute,
  type FlightReview,
  type FlightReviewFilter,
  type FlightReviewMachineInput,
  type FlightReviewManualPatch,
  type Instruction,
  type InstructionContinueInput,
  type InstructionDeliverable,
  type InstructionOpenInput,
  type InstructionRecord,
  type InstructionRecordFilter,
  type InstructionSession,
  type InstructionTokenUsage,
  type InstructionTokenUsageByModel,
  type InstructionVerificationRun,
  type InstructionWorkspace,
  type LessonCandidate,
  type RationaleAuditStatus,
  type SelfAssessment,
  type VerificationKind,
  type VerificationRunStatus,
} from '@anytime-markdown/trail-activity';

type Database = SqlJsCompatDatabase;

export interface FlightRecordDatabaseOptions {
  /** activity.db の絶対パス。ATTACH できた場合のみセッション由来の列が埋まる。 */
  readonly trailDbPath?: string | null;
  /**
   * 拡張の dist ディレクトリ。バンドル済み better-sqlite3 の native binary 解決に使う。
   * 未指定だとバンドル環境で init() が throw する（openBetterSqlite3 の Why not 参照）。
   */
  readonly distPath?: string | null;
  readonly logger?: DbLogger;
}

/** destructiveMigrateFromTrailDb の判別可能な結果。成功と部分失敗を型で区別する。 */
export interface FlightRecordMigrationResult {
  readonly status: 'migrated' | 'verification_failed';
  /** INSERT OR IGNORE で実際にコピーできた行数（getRowsModified 由来・テーブル別）。 */
  readonly copiedRows: Record<string, number>;
  /** アンチ結合検証で trail 側に残存と判定された行数（0 なら DROP 済み）。 */
  readonly missingRows: Record<string, number>;
}

/**
 * Flight Record の成果物抽出で「ドキュメントを書いた」と見なすツール名。
 *
 * 未列挙のツールは黙って除外され「そのツールで書いたドキュメントは成果物に出ない」という
 * 形で現れる（機能未実装に見える）。書き込み系ツールを増やしたらここへ追加する。
 * 引数キーは file_path（Claude 標準）/ relative_path（serena）/ path（mcp-markdown）の順で解決する。
 */
const DOC_WRITE_TOOL_NAMES: readonly string[] = [
  'Write',
  'Edit',
  'NotebookEdit',
  'mcp__serena__replace_content',
  'mcp__serena__replace_in_files',
  'mcp__serena__replace_symbol_body',
  'mcp__serena__insert_after_symbol',
  'mcp__serena__insert_before_symbol',
  'mcp__mcp-markdown__write_markdown',
  'mcp__mcp-markdown__update_section',
  'mcp__mcp-markdown__update_frontmatter',
  'mcp__mcp-markdown__format_markdown',
];

/** ドキュメント成果物と見なす拡張子。コードとの二分に使う。 */
function isDocPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.md');
}

function toInstruction(row: readonly unknown[]): Instruction {
  return {
    id: row[0] as string,
    workspacePath: row[1] as string,
    workspaceName: row[2] as string,
    summary: row[3] as string,
    originPrompt: row[4] as string,
    originSessionId: row[5] as string,
    startedAt: row[6] as string,
    closedAt: (row[7] as string | null) ?? null,
    createdAt: row[8] as string,
    updatedAt: row[9] as string,
  };
}

/**
 * `flight_reviews.workspace_path` はセッションの cwd 由来で、ワークスペース直下とは限らない。
 * `.git` を持つ最も近い祖先までさかのぼってワークスペース根を決める（worktree は `.git` が
 * ファイルなので存在判定のみで見る）。到達できないパスは記録値のまま返す — 消えた
 * ディレクトリを推測で書き換えるより、記録どおりを見せるほうが原因を追える。
 */
function resolveWorkspaceRoot(recorded: string, cache: Map<string, string>): string {
  const cached = cache.get(recorded);
  if (cached !== undefined) return cached;
  let current = recorded;
  for (;;) {
    try {
      if (current !== '' && fs.existsSync(path.join(current, '.git'))) break;
    } catch {
      // 権限エラー等でも探索を止めるだけにする（一覧表示を失敗させない）
      current = recorded;
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      current = recorded;
      break;
    }
    current = parent;
  }
  cache.set(recorded, current);
  return current;
}

/**
 * 宣言の無いセッションを 1 セッション = 1 指示の暗黙グループとして扱うための擬似 Instruction。
 * id にセッション ID を使うのは、一覧の行を選んだときに所属セッションを引き直せるようにするため。
 * summary は空にする（推測した見出しを人が書いた指示概要と同じ顔で出さない）。
 */
function implicitInstructionFromReview(review: FlightReview, workspaceName: string): Instruction {
  return {
    id: review.sessionId,
    workspacePath: review.workspacePath,
    workspaceName,
    summary: '',
    originPrompt: '',
    originSessionId: review.sessionId,
    startedAt: review.startedAt ?? review.endedAt,
    closedAt: null,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

/** 畳んだ 1 行に対する絞り込み。セッション単位ではなく指示単位の値で判定する。 */
function matchesInstructionFilter(record: InstructionRecord, filter: InstructionRecordFilter): boolean {
  if (filter.outcome !== undefined && record.outcome !== filter.outcome) return false;
  if (filter.tag !== undefined && filter.tag !== '' && !record.tags.includes(filter.tag)) return false;
  // ワークスペース名は組み立て済み record 側で判定する。SQL の workspace_path 一致では
  // cwd 由来の差（.worktrees/<name> 等）で同一ワークスペースの行が分裂するため。
  if (
    filter.workspaceName !== undefined &&
    filter.workspaceName !== '' &&
    record.workspaceName !== filter.workspaceName
  ) {
    return false;
  }
  // endedAt が無い（flight_reviews 未記録）行は期間指定では絞り込めないため、
  // 期間が指定されたときだけ落とす（指定が無ければ進行中の指示として残す）。
  if (filter.since !== undefined && filter.since !== '') {
    if (record.endedAt === null || record.endedAt < filter.since) return false;
  }
  if (filter.until !== undefined && filter.until !== '') {
    if (record.endedAt === null || record.endedAt > filter.until) return false;
  }
  return true;
}

/**
 * 進行中（終了日時なし）を先頭、以降は終了日時の降順。
 *
 * 未終了行を末尾へ回すと、既存行が limit に達した時点で「宣言した直後の、いま作業中の
 * 指示」が一覧から落ちる。取込ラグは数十分単位あるため、宣言直後に Flight Record を
 * 開いて確認するという主要な導線がそこに当たる。
 */
function compareInstructionRecords(a: InstructionRecord, b: InstructionRecord): number {
  if (a.endedAt === null && b.endedAt === null) return 0;
  if (a.endedAt === null) return -1;
  if (b.endedAt === null) return 1;
  if (a.endedAt === b.endedAt) return 0;
  return a.endedAt > b.endedAt ? -1 : 1;
}

/** session_costs をまだ引いていない状態。imported=false で「0 件」と区別する。 */
const EMPTY_TOKEN_USAGE: InstructionTokenUsage = {
  imported: false,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  estimatedCostUsd: 0,
  byModel: [],
};

/** flight_reviews の 1 行。列順は listFlightReviews / flightReviewsBySessionIds で共有する。 */
function toFlightReview(row: readonly unknown[]): FlightReview {
  return {
    id: row[0] as number,
    sessionId: row[1] as string,
    workspacePath: row[2] as string,
    startedAt: (row[3] as string | null) ?? null,
    endedAt: row[4] as string,
    durationSeconds: (row[5] as number | null) ?? null,
    outcome: row[6] as FlightReview['outcome'],
    outcomeSource: row[7] as FlightReview['outcomeSource'],
    toolCallCount: row[8] as number,
    toolFailureCount: row[9] as number,
    reworkCount: row[10] as number,
    unresolvedItems: row[11] as string,
    nextConcerns: row[12] as string,
    lessonCandidates: row[13] as string,
    tags: row[14] as string,
    notes: row[15] as string,
    rationaleAuditStatus: row[16] as FlightReview['rationaleAuditStatus'],
    createdAt: row[17] as string,
    updatedAt: row[18] as string,
  };
}

/**
 * Flight Record（instructions / instruction_sessions / flight_reviews）の永続化層。
 *
 * 保存先は **caravan-book.db**（activity.db からの移設・2026-08-07）。Flight Record は
 * セッションの生ログではなく「振り返りで読む蒸留データ」であり、レビュー・バグ修正・
 * 乖離と同じ caravan-book.db 側に置く。セッション由来の参照データ（sessions / repos /
 * session_costs / session_commits / verification_runs 等）は activity.db に残るため、
 * activity.db を `trail` alias で ATTACH して読む（MemoryApiHandler と同型）。
 *
 * - activity.db が ATTACH できない構成では、トークン・成果物・検証・リポジトリ名解決が
 *   縮退する（行そのものは落とさない）。
 * - trail.* への書き込みは移行処理（destructiveMigrateFromTrailDb）の退避・DROP のみ。それ以外の
 *   メソッドは trail.* を SELECT でしか触らない（アプリ層規律。better-sqlite3 は
 *   ATTACH 単位の readonly を強制できないため）。
 * - スキーマ正本は trail-activity の DDL 定数。writer が冪等 CREATE する方針は activity.db
 *   時代から不変（デーモン未起動でも mcp-trail の直書きが先行しうるため）。
 */
export class FlightRecordDatabase {
  private db: Database | null = null;
  private trailAttached = false;
  private readonly logger: DbLogger;

  private readonly trailDbPath: string | null;
  private readonly distPath: string | null;

  constructor(
    private readonly memoryDbPath: string,
    options: FlightRecordDatabaseOptions = {},
  ) {
    this.trailDbPath = options.trailDbPath ?? null;
    this.distPath = options.distPath ?? null;
    this.logger = options.logger ?? noopDbLogger;
  }

  /**
   * caravan-book.db を開き、Flight Record テーブルを冪等作成し、activity.db が在れば ATTACH する。
   * 副作用: caravan-book.db が無い場合はファイルを新規作成する（trail-caravan-book の migration は
   * 自前の _migrations で版管理しており、先にこのファイルが出来ていても衝突しない）。
   */
  init(): void {
    if (this.db) return;
    // DB ファイル名変更（memory-core.db→caravan-book.db・2026-08-08）のレガシー移行。owner は
    // デーモン/拡張の open 経路のみ（mcp-trail 等のサイドカーは物理リネームしない）。
    // 任意パス（テスト・明示指定）を巻き込まないよう、新既定名を開くときだけ実施する。
    const memoryDbPath =
      path.basename(this.memoryDbPath) === 'caravan-book.db'
        ? resolveDbWithLegacyRename({
            dir: path.dirname(this.memoryDbPath),
            current: 'caravan-book.db',
            legacy: 'memory-core.db',
            warn: (m) => this.logger.warn(m),
          }).path
        : this.memoryDbPath;
    // native binary の解決は openBetterSqlite3 に集約する。ここで `new Ctor(path)` を直に
    // 書くと、webpack-bundled 拡張で bindings が .node を推測できず init が必ず throw し、
    // flight 系エンドポイントが配布物でだけ全滅する（loadBetterSqlite3.ts の Why not 参照）。
    const inner = openBetterSqlite3(memoryDbPath, {
      distPath: this.distPath,
      onBundledBindingMissing: (expected) =>
        this.logger.warn(
          `[FlightRecordDatabase] bundled better_sqlite3.node not found at ${expected}; falling back to bindings resolution (this fails in bundled builds)`,
        ),
    });
    // 拡張の memory pipeline / MemoryApiHandler と同一ファイルを共有するため WAL を保証する。
    // openMemoryCoreDb（trail-caravan-book パッケージ）だけに任せると、本クラスが先に DB ファイルを
    // 作った環境で既定の DELETE ジャーナルのまま読み書きが競合する（前提はコメントでなく
    // 実装で担保する）。WAL にできないビルドは握りつぶさず警告する。
    const journalMode = String(inner.pragma('journal_mode = WAL', { simple: true }));
    if (journalMode.toLowerCase() !== 'wal') {
      this.logger.warn(`[FlightRecordDatabase] journal_mode=WAL unavailable (got ${journalMode}); concurrent access may block`);
    }
    // ロック競合は即時失敗ではなく待つ（書き込みは短時間）。
    inner.pragma('busy_timeout = 5000');
    // activity.db 時代と同じく FK は強制しない（better-sqlite3 は既定 ON）。
    // instruction_sessions の FK は宣言のみの運用（tables.ts のコメント参照）で、
    // 孤児リンクを含む既存データのバックフィルを FK 違反で止めないため。
    inner.pragma('foreign_keys = OFF');
    this.db = new SqlJsCompatDatabase(inner, memoryDbPath);
    this.ensureTables();
    if (this.trailDbPath !== null && fs.existsSync(this.trailDbPath)) {
      try {
        this.db.run(`ATTACH DATABASE ? AS trail`, [this.trailDbPath]);
        this.trailAttached = true;
      } catch (e) {
        this.logger.error(
          '[FlightRecordDatabase] activity.db attach failed; session-derived fields will degrade',
          e instanceof Error ? e : new Error(String(e)),
        );
      }
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.trailAttached = false;
    }
  }

  /** 互換 API。better-sqlite3 はファイル直書きのため no-op（TrailDatabase の save() 契約と対で持つ）。 */
  save(): void {
    // no-op
  }

  private ensureDb(): Database {
    if (!this.db) {
      throw new Error('FlightRecordDatabase not initialized. Call init() first.');
    }
    return this.db;
  }

  private ensureTables(): void {
    const db = this.ensureDb();
    db.run(CREATE_INSTRUCTIONS);
    db.run(CREATE_INSTRUCTION_SESSIONS);
    for (const idx of CREATE_INSTRUCTION_INDEXES) db.run(idx);
    db.run(CREATE_FLIGHT_REVIEWS);
    for (const idx of CREATE_FLIGHT_REVIEW_INDEXES) db.run(idx);
    // 受入台帳（acceptance_records）も判断記録として caravan-book.db 側で所有する（2026-08-07 移設）
    db.run(CREATE_ACCEPTANCE_RECORDS);
    for (const idx of CREATE_ACCEPTANCE_INDEXES) db.run(idx);
  }

  /**
   * **副作用: 検証通過時に activity.db 側の 3 テーブルを退避テーブルへ複製した上で DROP する**
   * （破壊的操作を含むため destructive プレフィクス。`~/.claude/rules/code-quality.md` §15）。
   *
   * activity.db に残る旧テーブルから caravan-book.db へデータを移設する（冪等・毎起動可）。
   *
   * 1. trail 側に対象テーブルが実在する場合のみコピーする
   *    - 新規キーは INSERT OR IGNORE
   *    - flight_reviews の同一 session_id 衝突は、trail 側が manual（人手訂正）で memory 側が
   *      manual でない場合に限り trail 側の訂正列を採用する（manual > self > machine の
   *      優先順位規約を移行経路にも通す。instructions の id は UUID で「同一 id = 同一宣言」の
   *      ため内容差は生じず、マージ対象にしない）
   * 2. 検証は件数比較ではなく**キー単位のアンチ結合**（trail 側の全キーが memory 側に実在）と
   *    manual 訂正の保存確認で行う。INSERT OR IGNORE は UNIQUE 衝突だけでなく CHECK 制約違反も
   *    黙って捨てるため、件数の大小では喪失を検知できない
   * 3. 検証を通過したテーブルだけを、activity.db 内の退避テーブル `<name>__pre_move_backup` へ
   *    複製してから DROP する（検証をすり抜けた場合の復旧手段を残す。退避の削除は人が行う）
   *
   * blind な drop マイグレーションを作らないのは、コピー前に drop が走る事故を
   * 構造的に不可能にするため。旧ビルドの mcp-trail が activity.db 側へテーブルを
   * 再作成しても、次回起動の本処理が回収して再 DROP する。
   * 検証不一致時は DROP せず error ログを残して継続する（silent skip 禁止・fail-open:
   * 移行が止まっても新規記録は caravan-book.db 側で継続する）。
   *
   * @returns 判別可能な移行結果。trail 未 ATTACH・旧テーブル無しは null。
   */
  destructiveMigrateFromTrailDb(): FlightRecordMigrationResult | null {
    const db = this.ensureDb();
    if (!this.trailAttached) return null;
    const existing = db.exec(
      `SELECT name FROM trail.sqlite_master WHERE type = 'table' AND name IN
         ('instructions', 'instruction_sessions', 'flight_reviews',
          'acceptance_records', 'pr_reviews', 'pr_review_comments', 'pr_review_findings')`,
    );
    const present = new Set((existing[0]?.values ?? []).map((r) => r[0] as string));
    if (present.size === 0) return null;

    const copiedRows: Record<string, number> = {};
    db.run('BEGIN');
    try {
      if (present.has('instructions')) {
        db.run(
          `INSERT OR IGNORE INTO instructions (id, workspace_path, workspace_name, summary, origin_prompt, origin_session_id, started_at, closed_at, created_at, updated_at)
           SELECT id, workspace_path, workspace_name, summary, origin_prompt, origin_session_id, started_at, closed_at, created_at, updated_at FROM trail.instructions`,
        );
        copiedRows['instructions'] = db.getRowsModified();
      }
      // instruction_sessions は instructions の後（参照整合を持つ接続でも成立する順序）
      if (present.has('instruction_sessions')) {
        db.run(
          `INSERT OR IGNORE INTO instruction_sessions (session_id, instruction_id, sequence, declared_at)
           SELECT session_id, instruction_id, sequence, declared_at FROM trail.instruction_sessions`,
        );
        copiedRows['instruction_sessions'] = db.getRowsModified();
      }
      // id は移設先で採番し直す（AUTOINCREMENT 由来の欠番を持ち込まない）。冪等キーは session_id UNIQUE。
      if (present.has('flight_reviews')) {
        db.run(
          `INSERT OR IGNORE INTO flight_reviews (session_id, workspace_path, started_at, ended_at, duration_seconds, outcome, outcome_source, tool_call_count, tool_failure_count, rework_count, unresolved_items, next_concerns, lesson_candidates, tags, notes, rationale_audit_status, created_at, updated_at)
           SELECT session_id, workspace_path, started_at, ended_at, duration_seconds, outcome, outcome_source, tool_call_count, tool_failure_count, rework_count, unresolved_items, next_concerns, lesson_candidates, tags, notes, rationale_audit_status, created_at, updated_at FROM trail.flight_reviews`,
        );
        copiedRows['flight_reviews'] = db.getRowsModified();
        // 衝突キーの manual 訂正を移送する（機械行が人手訂正に勝ったまま DROP しないため）
        db.run(
          `UPDATE flight_reviews SET
             outcome = t.outcome, outcome_source = t.outcome_source, tags = t.tags, notes = t.notes,
             unresolved_items = t.unresolved_items, next_concerns = t.next_concerns, updated_at = t.updated_at
           FROM trail.flight_reviews t
           WHERE flight_reviews.session_id = t.session_id
             AND t.outcome_source = 'manual' AND flight_reviews.outcome_source != 'manual'`,
        );
        // 学習候補は「trail 側にだけ在る」場合に採用する（空の新行で上書きしない）
        db.run(
          `UPDATE flight_reviews SET lesson_candidates =
             (SELECT t.lesson_candidates FROM trail.flight_reviews t WHERE t.session_id = flight_reviews.session_id)
           WHERE lesson_candidates = '[]' AND EXISTS (
             SELECT 1 FROM trail.flight_reviews t
             WHERE t.session_id = flight_reviews.session_id AND t.lesson_candidates != '[]')`,
        );
      }
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }

    // 検証: キー単位のアンチ結合。INSERT OR IGNORE は CHECK 制約違反も黙って捨てるため、
    // 件数の大小比較では「コピーできなかった行」を検知できない（移設後の新規行が件数を膨らませる）。
    const missingRows: Record<string, number> = {};
    const antiJoins: Array<[string, string]> = [
      ['instructions', `SELECT COUNT(*) FROM trail.instructions t WHERE NOT EXISTS (SELECT 1 FROM instructions m WHERE m.id = t.id)`],
      ['instruction_sessions', `SELECT COUNT(*) FROM trail.instruction_sessions t WHERE NOT EXISTS (SELECT 1 FROM instruction_sessions m WHERE m.session_id = t.session_id)`],
      ['flight_reviews', `SELECT COUNT(*) FROM trail.flight_reviews t WHERE NOT EXISTS (SELECT 1 FROM flight_reviews m WHERE m.session_id = t.session_id)`],
    ];
    for (const [table, sql] of antiJoins) {
      if (!present.has(table)) continue;
      missingRows[table] = Number(db.exec(sql)[0]?.values?.[0]?.[0] ?? 0);
    }
    // manual 訂正の保存確認（行の実在だけでなく優先順位規約の遵守も DROP の条件にする）
    if (present.has('flight_reviews')) {
      const unmergedManual = Number(
        db.exec(
          `SELECT COUNT(*) FROM trail.flight_reviews t JOIN flight_reviews m ON m.session_id = t.session_id
           WHERE t.outcome_source = 'manual' AND m.outcome_source != 'manual'`,
        )[0]?.values?.[0]?.[0] ?? 0,
      );
      missingRows['flight_reviews'] = (missingRows['flight_reviews'] ?? 0) + unmergedManual;
    }
    // flight 群の検証結果。失敗しても acceptance / pr の処理は独立に続ける
    // （1 群の失敗が他群の回収まで止めると、失敗が長引くほど二重管理の窓が広がる）。
    const flightLost = Object.entries(missingRows).filter(([, n]) => n > 0);
    if (flightLost.length === 0) {
      for (const table of ['instruction_sessions', 'flight_reviews', 'instructions'] as const) {
        if (present.has(table)) this.backupAndDropTrailTable(table);
      }
    }

    // ── acceptance_records（受入台帳・2026-08-07 移設）─────────────────────────
    if (present.has('acceptance_records')) {
      db.run('BEGIN');
      try {
        db.run(
          `INSERT OR IGNORE INTO acceptance_records (commit_sha, route, repo_name, verdict, decided_by, decided_at, farm_run_ref, failed_tests, vrt_diff, quarantined_count, notes, created_at, updated_at)
           SELECT commit_sha, route, repo_name, verdict, decided_by, decided_at, farm_run_ref, failed_tests, vrt_diff, quarantined_count, notes, created_at, updated_at FROM trail.acceptance_records`,
        );
        copiedRows['acceptance_records'] = db.getRowsModified();
        db.run('COMMIT');
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }
      // 検証はキー存在（アンチ結合）に加えて**衝突キーの全保存列の一致**を要求する。
      // INSERT OR IGNORE は同一キーの既存 memory 行を残すため、存在だけで通すと trail 側の
      // verdict / decided_by / notes 等の差分が退避テーブル以外から消える。どちらが正かを
      // 機械決定できない不一致は DROP せず verification_failed で人の判断へ回す
      const missing = Number(
        db.exec(
          `SELECT COUNT(*) FROM trail.acceptance_records t
           WHERE NOT EXISTS (SELECT 1 FROM acceptance_records m WHERE m.commit_sha = t.commit_sha AND m.route = t.route)`,
        )[0]?.values?.[0]?.[0] ?? 0,
      );
      const conflicting = Number(
        db.exec(
          `SELECT COUNT(*) FROM trail.acceptance_records t JOIN acceptance_records m
             ON m.commit_sha = t.commit_sha AND m.route = t.route
           WHERE m.verdict != t.verdict OR m.decided_by != t.decided_by
              OR COALESCE(m.decided_at, '') != COALESCE(t.decided_at, '')
              OR m.repo_name != t.repo_name OR m.farm_run_ref != t.farm_run_ref
              OR m.failed_tests != t.failed_tests OR m.vrt_diff != t.vrt_diff
              OR m.quarantined_count != t.quarantined_count OR m.notes != t.notes`,
        )[0]?.values?.[0]?.[0] ?? 0,
      );
      if (conflicting > 0) {
        this.logger.error(
          `[FlightRecordDatabase] acceptance_records migration: ${conflicting} row(s) conflict with existing memory-side rows on (commit_sha, route); keeping trail-side table for manual reconciliation`,
          new Error('acceptance records migration column mismatch'),
        );
      }
      missingRows['acceptance_records'] = missing + conflicting;
      if (missingRows['acceptance_records'] === 0) {
        this.backupAndDropTrailTable('acceptance_records');
      }
    }

    // ── pr_reviews 系（memory_reviews への意味統合・2026-08-07）────────────────
    // memory 側に同型テーブルは無い（統合先はスキーマの異なる memory_reviews）ため、
    // 自動のデータ変換はしない。**0 行のときだけ**テーブルを回収し、行が残る DB では
    // DROP せず error ログで手動変換を促す（統合前の実データを黙って捨てない）。
    for (const table of ['pr_review_findings', 'pr_review_comments', 'pr_reviews'] as const) {
      if (!present.has(table)) continue;
      const rows = Number(db.exec(`SELECT COUNT(*) FROM trail.${table}`)[0]?.values?.[0]?.[0] ?? 0);
      if (rows === 0) {
        db.run(`DROP TABLE IF EXISTS trail.${table}`);
      } else {
        missingRows[table] = rows;
        this.logger.error(
          `[FlightRecordDatabase] trail.${table} has ${rows} rows; not dropped. PR reviews were consolidated into memory_reviews (source_kind='pr_comment') — convert manually before removal`,
          new Error('pr review tables require manual conversion'),
        );
      }
    }

    const lost = Object.entries(missingRows).filter(([, n]) => n > 0);
    if (lost.length > 0) {
      this.logger.error(
        `[FlightRecordDatabase] migration verification failed (rows not preserved): ${JSON.stringify(Object.fromEntries(lost))}; keeping affected trail-side tables`,
        new Error('flight record migration anti-join mismatch'),
      );
      return { status: 'verification_failed', copiedRows, missingRows };
    }
    this.logger.info(
      `[FlightRecordDatabase] migrated trail-side tables (copied rows): ${JSON.stringify(copiedRows)}`,
    );
    return { status: 'migrated', copiedRows, missingRows };
  }

  /**
   * 退避 → DROP。退避テーブルが既に在る（過去の移行で作成済み）場合は追記する
   * （CREATE で置き換えると初回退避を失う。重複は退避用途では許容）。
   */
  private backupAndDropTrailTable(table: string): void {
    const db = this.ensureDb();
    const backup = `${table}__pre_move_backup`;
    const backupExists =
      (db.exec(`SELECT 1 FROM trail.sqlite_master WHERE type = 'table' AND name = ?`, [backup])[0]?.values.length ?? 0) > 0;
    if (backupExists) {
      db.run(`INSERT INTO trail.${backup} SELECT * FROM trail.${table}`);
    } else {
      db.run(`CREATE TABLE trail.${backup} AS SELECT * FROM trail.${table}`);
    }
    db.run(`DROP TABLE IF EXISTS trail.${table}`);
  }

  // ---------------------------------------------------------------------------
  //  Flight Review (flight_reviews)
  // ---------------------------------------------------------------------------

  /**
   * 副作用: flight_reviews へ UPSERT。session_id キーで冪等。既存行がある場合は機械集計列のみ
   * 更新し、outcome / outcome_source / tags / notes / unresolved_items は変更しない
   * （Stop フックの再送・多重発火が S2 の自己評価・S3 の手動訂正を上書きしないため）。
   */
  upsertFlightReviewFromMachine(input: FlightReviewMachineInput): void {
    const db = this.ensureDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO flight_reviews (
         session_id, workspace_path, started_at, ended_at, duration_seconds,
         tool_call_count, tool_failure_count, rework_count, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         workspace_path = excluded.workspace_path,
         started_at = excluded.started_at,
         ended_at = excluded.ended_at,
         duration_seconds = excluded.duration_seconds,
         tool_call_count = excluded.tool_call_count,
         tool_failure_count = excluded.tool_failure_count,
         rework_count = excluded.rework_count,
         updated_at = excluded.updated_at`,
    );
    try {
      stmt.run([
        input.sessionId,
        input.workspacePath,
        input.startedAt,
        input.endedAt,
        input.durationSeconds,
        input.toolCallCount,
        input.toolFailureCount,
        input.reworkCount,
        now,
        now,
      ]);
    } finally {
      stmt.free();
    }
  }

  /** ended_at 降順。filter 未指定は直近 100 件。 */
  listFlightReviews(filter: FlightReviewFilter = {}): FlightReview[] {
    const db = this.ensureDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (filter.sessionId !== undefined) {
      conditions.push('session_id = ?');
      params.push(filter.sessionId);
    }
    if (filter.since !== undefined) {
      conditions.push('ended_at >= ?');
      params.push(filter.since);
    }
    if (filter.until !== undefined) {
      conditions.push('ended_at <= ?');
      params.push(filter.until);
    }
    if (filter.outcome !== undefined) {
      conditions.push('outcome = ?');
      params.push(filter.outcome);
    }
    if (filter.tag !== undefined) {
      // tags は JSON 文字列配列。json_each で配列要素との等値一致（部分一致させない）
      conditions.push('EXISTS (SELECT 1 FROM json_each(flight_reviews.tags) WHERE json_each.value = ?)');
      params.push(filter.tag);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = db.exec(
      `SELECT id, session_id, workspace_path, started_at, ended_at, duration_seconds,
              outcome, outcome_source, tool_call_count, tool_failure_count, rework_count,
              unresolved_items, next_concerns, lesson_candidates, tags, notes, rationale_audit_status,
              created_at, updated_at
       FROM flight_reviews ${where} ORDER BY ended_at DESC, id DESC LIMIT ?`,
      params,
    );
    if (!res[0]) return [];
    return res[0].values.map(toFlightReview);
  }

  /**
   * 副作用: flight_reviews の outcome 系列を自己評価で更新。
   * 優先順位 manual > self > machine を SQL 条件で強制する
   * （outcome_source='manual' の行は WHERE で除外され、人間の訂正を self が上書きしない）。
   */
  applySelfAssessmentToFlightReview(sessionId: string, assessment: SelfAssessment): void {
    const db = this.ensureDb();
    const stmt = db.prepare(
      `UPDATE flight_reviews
       SET outcome = ?, outcome_source = 'self', unresolved_items = ?, next_concerns = ?, updated_at = ?
       WHERE session_id = ? AND outcome_source != 'manual'`,
    );
    try {
      stmt.run([
        assessment.outcome,
        JSON.stringify(assessment.unresolvedItems),
        JSON.stringify(assessment.nextConcerns),
        new Date().toISOString(),
        sessionId,
      ]);
    } finally {
      stmt.free();
    }
  }

  /**
   * 副作用: flight_reviews を手動訂正で部分更新。更新時は outcome_source='manual' を設定し、
   * 以後は applySelfAssessmentToFlightReview の WHERE 条件（outcome_source != 'manual'）と
   * 機械 UPSERT の列限定により上書きされない。
   * 対象行が存在しなければ false（行の新規作成はしない）。空 patch は書き込まず存在有無のみ返す。
   */
  updateFlightReviewManual(sessionId: string, patch: FlightReviewManualPatch): boolean {
    const db = this.ensureDb();
    const exists = db.exec(`SELECT 1 FROM flight_reviews WHERE session_id = ? LIMIT 1`, [sessionId]);
    if (exists[0]?.values[0] === undefined) return false;

    const sets: string[] = [];
    const params: string[] = [];
    if (patch.outcome !== undefined) {
      sets.push('outcome = ?');
      params.push(patch.outcome);
    }
    if (patch.tags !== undefined) {
      sets.push('tags = ?');
      params.push(JSON.stringify(patch.tags));
    }
    if (patch.notes !== undefined) {
      sets.push('notes = ?');
      params.push(patch.notes);
    }
    if (sets.length === 0) return true;

    sets.push(`outcome_source = 'manual'`, 'updated_at = ?');
    params.push(new Date().toISOString(), sessionId);
    const stmt = db.prepare(
      `UPDATE flight_reviews SET ${sets.join(', ')} WHERE session_id = ?`,
    );
    try {
      stmt.run(params);
    } finally {
      stmt.free();
    }
    return true;
  }

  /**
   * 副作用: flight_reviews.rationale_audit_status を更新。
   * outcome_source には触れない（監査は成否訂正と独立。相乗りすると self 反映が以後ブロックされる）。
   * 対象行が無ければ false（行の新規作成はしない）。
   */
  markRationaleAudit(sessionId: string, status: RationaleAuditStatus): boolean {
    const db = this.ensureDb();
    const exists = db.exec(`SELECT 1 FROM flight_reviews WHERE session_id = ? LIMIT 1`, [sessionId]);
    if (exists[0]?.values[0] === undefined) return false;
    const stmt = db.prepare(
      `UPDATE flight_reviews SET rationale_audit_status = ?, updated_at = ? WHERE session_id = ?`,
    );
    try {
      stmt.run([status, new Date().toISOString(), sessionId]);
    } finally {
      stmt.free();
    }
    return true;
  }

  /** 副作用: flight_reviews.lesson_candidates を更新。 */
  saveFlightReviewLessonCandidates(sessionId: string, candidates: LessonCandidate[]): void {
    const db = this.ensureDb();
    const stmt = db.prepare(
      `UPDATE flight_reviews SET lesson_candidates = ?, updated_at = ? WHERE session_id = ?`,
    );
    try {
      stmt.run([JSON.stringify(candidates), new Date().toISOString(), sessionId]);
    } finally {
      stmt.free();
    }
  }

  // ---------------------------------------------------------------------------
  //  指示（instructions / instruction_sessions）
  // ---------------------------------------------------------------------------

  /**
   * 副作用: instructions へ INSERT + instruction_sessions へ起点セッションを紐付け。
   * 同一 id の再送は上書きしない（宣言は 1 回きり。冪等に無視して既存の指示を守る）。
   */
  openInstruction(input: InstructionOpenInput): void {
    const db = this.ensureDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO instructions (
         id, workspace_path, workspace_name, summary, origin_prompt, origin_session_id,
         started_at, closed_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    );
    try {
      stmt.run([
        input.id,
        input.workspacePath,
        input.workspaceName,
        input.summary,
        input.originPrompt,
        input.sessionId,
        input.startedAt,
        now,
        now,
      ]);
    } finally {
      stmt.free();
    }
    this.linkInstructionSession(input.id, input.sessionId, input.startedAt);
  }

  /**
   * 副作用: instruction_sessions へ UPSERT(セッションの所属替えを含む)。
   * 対象の指示が存在しなければ false を返し、何も書かない
   * (存在しない指示 ID への継続宣言を黙って通すと、行の無いグループへセッションが消える)。
   */
  continueInstruction(input: InstructionContinueInput): boolean {
    const db = this.ensureDb();
    const found = db.exec('SELECT workspace_path FROM instructions WHERE id = ? LIMIT 1', [input.instructionId]);
    const row = found[0]?.values[0];
    if (row === undefined) return false;
    // ワークスペースをまたぐ継続は拒否する。通すとそのセッションの時間・トークン・コミットが
    // 別ワークスペースの行へ合算され、一覧のワークスペース絞り込みでも落とせない。
    if (input.workspacePath !== undefined && input.workspacePath !== '' && (row[0] as string) !== input.workspacePath) {
      return false;
    }
    this.linkInstructionSession(input.instructionId, input.sessionId, input.declaredAt);
    return true;
  }

  /** sequence は指示内の最大 + 1。所属替え時は既存行を上書きする（1 セッション 1 指示）。 */
  private linkInstructionSession(instructionId: string, sessionId: string, declaredAt: string): void {
    const db = this.ensureDb();
    const maxRes = db.exec(
      'SELECT COALESCE(MAX(sequence), 0) FROM instruction_sessions WHERE instruction_id = ?',
      [instructionId],
    );
    const nextSequence = ((maxRes[0]?.values[0]?.[0] as number | undefined) ?? 0) + 1;
    const stmt = db.prepare(
      `INSERT INTO instruction_sessions (session_id, instruction_id, sequence, declared_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         instruction_id = excluded.instruction_id,
         sequence = excluded.sequence,
         declared_at = excluded.declared_at`,
    );
    try {
      stmt.run([sessionId, instructionId, nextSequence, declaredAt]);
    } finally {
      stmt.free();
    }
  }

  /**
   * 副作用: instructions.closed_at を設定。対象が無ければ false（行の新規作成はしない）。
   */
  closeInstruction(instructionId: string, closedAt: string): boolean {
    const db = this.ensureDb();
    const exists = db.exec('SELECT 1 FROM instructions WHERE id = ? LIMIT 1', [instructionId]);
    if (!exists[0] || exists[0].values.length === 0) return false;
    const stmt = db.prepare('UPDATE instructions SET closed_at = ?, updated_at = ? WHERE id = ?');
    try {
      stmt.run([closedAt, new Date().toISOString(), instructionId]);
    } finally {
      stmt.free();
    }
    return true;
  }

  /** 未完了（closed_at IS NULL）の指示。継続宣言の候補提示に使う。started_at 降順。 */
  listOpenInstructions(workspacePath?: string, limit = 10): Instruction[] {
    const db = this.ensureDb();
    const params: (string | number)[] = [];
    let where = 'WHERE closed_at IS NULL';
    if (workspacePath !== undefined && workspacePath !== '') {
      where += ' AND workspace_path = ?';
      params.push(workspacePath);
    }
    params.push(limit);
    const res = db.exec(
      `SELECT id, workspace_path, workspace_name, summary, origin_prompt, origin_session_id,
              started_at, closed_at, created_at, updated_at
       FROM instructions ${where} ORDER BY started_at DESC LIMIT ?`,
      params,
    );
    return (res[0]?.values ?? []).map(toInstruction);
  }

  /** 指示に属するセッション（sequence 昇順）。 */
  listInstructionSessions(instructionId: string): InstructionSession[] {
    const db = this.ensureDb();
    const res = db.exec(
      `SELECT session_id, instruction_id, sequence, declared_at
       FROM instruction_sessions WHERE instruction_id = ? ORDER BY sequence`,
      [instructionId],
    );
    return (res[0]?.values ?? []).map((row) => ({
      sessionId: row[0] as string,
      instructionId: row[1] as string,
      sequence: row[2] as number,
      declaredAt: row[3] as string,
    }));
  }

  /**
   * 指示単位の一覧（Flight Record）。進行中（終了日時なし）を先頭、以降は ended_at 降順。
   *
   * 宣言のあった指示に加え、どの指示にも属さないセッションを「1 セッション = 1 指示」の
   * 暗黙グループとして併せて返す。宣言機構の導入前に記録された flight_reviews が
   * 一覧から消えないようにするため（宣言忘れも同じ経路で拾われる）。
   *
   * 宣言済み指示のメンバー記録は所属セッション ID で直接引く。最新 N 件の走査窓に
   * 頼ると、窓から外れた古いセッションの分だけ所要時間・件数が欠けた行になり、
   * 「セッション 3 件・所要 20 分」のように**欠落と判別できない小さすぎる値**になる。
   *
   * トークンと成果物はページ確定後にだけ引く。絞り込み前の全件で引くと、1 回の一覧取得
   * あたり最大 scanLimit 本のクエリが出る（viewer は 30 秒ごとにポーリングする）。
   *
   * SHORTCUT: 畳み込みと絞り込みを JS 側で行う単純実装. ceiling: instructions を limit の
   * 10 倍まで、暗黙グループ用の flight_reviews も同数まで読む前提（現状 116 行）.
   * upgrade: flight_reviews が数万行規模になったら指示単位の集計を SQL 側
   * （GROUP BY instruction_id）へ移す.
   */
  listInstructionRecords(filter: InstructionRecordFilter = {}): InstructionRecord[] {
    const db = this.ensureDb();
    const limit = filter.limit ?? 100;
    const scanLimit = limit * 10;

    const instructionParams: (string | number)[] = [];
    let instructionWhere = '';
    if (filter.workspacePath !== undefined && filter.workspacePath !== '') {
      instructionWhere = 'WHERE workspace_path = ?';
      instructionParams.push(filter.workspacePath);
    }
    instructionParams.push(scanLimit);
    const instructionRes = db.exec(
      `SELECT id, workspace_path, workspace_name, summary, origin_prompt, origin_session_id,
              started_at, closed_at, created_at, updated_at
       FROM instructions ${instructionWhere} ORDER BY started_at DESC LIMIT ?`,
      instructionParams,
    );
    const instructions = (instructionRes[0]?.values ?? []).map(toInstruction);

    // 所属セッション（宣言済み）
    const sessionsByInstruction = new Map<string, string[]>();
    const instructionBySession = new Map<string, string>();
    const linkRes = db.exec(
      'SELECT instruction_id, session_id FROM instruction_sessions ORDER BY instruction_id, sequence',
    );
    for (const row of linkRes[0]?.values ?? []) {
      const instructionId = row[0] as string;
      const sessionId = row[1] as string;
      const list = sessionsByInstruction.get(instructionId);
      if (list === undefined) sessionsByInstruction.set(instructionId, [sessionId]);
      else list.push(sessionId);
      instructionBySession.set(sessionId, instructionId);
    }

    // 宣言済みのメンバーは走査窓に依存せず ID 指定で取る
    const linkedSessionIds = instructions.flatMap((i) => sessionsByInstruction.get(i.id) ?? []);
    const reviewsBySession = this.flightReviewsBySessionIds(linkedSessionIds);
    // 暗黙グループは「最近の flight_reviews のうち宣言の無いもの」なので走査窓で足りる
    const recentReviews = this.listFlightReviews({ limit: scanLimit });

    const records: InstructionRecord[] = [];
    // workspace_path → ワークスペース根の解決結果。同じパスを何度も fs で辿らない。
    const workspaceRootCache = new Map<string, string>();
    // ワークスペース名の正本はセッションのリポジトリ名。取れなければパス由来へ縮退する。
    const repoNames = this.repoNamesBySessionIds([
      ...instructions.map((i) => i.originSessionId),
      ...recentReviews.map((r) => r.sessionId),
    ]);
    const workspaceNameOf = (sessionId: string, recordedPath: string): string =>
      repoNames.get(sessionId) ?? path.basename(resolveWorkspaceRoot(recordedPath, workspaceRootCache));
    // 成果物・トークンを引くための所属セッション。record からは辿れない（暗黙グループと
    // 明示指示で意味の違う ID を同じ型に同居させないため）ので、ここで対応表を持つ。
    const sessionIdsByRecord = new Map<string, string[]>();

    for (const instruction of instructions) {
      const sessionIds = sessionsByInstruction.get(instruction.id) ?? [];
      const memberReviews = sessionIds
        .map((id) => reviewsBySession.get(id))
        .filter((r): r is FlightReview => r !== undefined);
      sessionIdsByRecord.set(instruction.id, sessionIds);
      // 宣言側が渡した workspace_name も cwd 由来になりうるので、暗黙グループと同じ規則で揃える
      records.push(
        assembleInstructionRecord({
          instruction: {
            ...instruction,
            workspaceName: workspaceNameOf(instruction.originSessionId, instruction.workspacePath),
          },
          reviews: memberReviews,
          sessionCount: sessionIds.length,
          tokenUsage: EMPTY_TOKEN_USAGE,
          deliverables: [],
          verifications: [],
        }),
      );
    }

    // 宣言の無いセッションは 1 セッション = 1 指示の暗黙グループにする
    for (const review of recentReviews) {
      if (instructionBySession.has(review.sessionId)) continue;
      if (
        filter.workspacePath !== undefined &&
        filter.workspacePath !== '' &&
        review.workspacePath !== filter.workspacePath
      ) {
        continue;
      }
      sessionIdsByRecord.set(review.sessionId, [review.sessionId]);
      records.push(
        assembleInstructionRecord({
          instruction: implicitInstructionFromReview(
            review,
            workspaceNameOf(review.sessionId, review.workspacePath),
          ),
          reviews: [review],
          sessionCount: 1,
          tokenUsage: EMPTY_TOKEN_USAGE,
          deliverables: [],
          verifications: [],
        }),
      );
    }

    const filtered = records.filter((r) => matchesInstructionFilter(r, filter));
    filtered.sort(compareInstructionRecords);
    const page = filtered.slice(0, limit);
    return page.map((record) => {
      const sessionIds = sessionIdsByRecord.get(record.instructionId) ?? [];
      return {
        ...record,
        tokenUsage: this.instructionTokenUsage(sessionIds),
        deliverables: this.instructionDeliverables(sessionIds),
        verifications: this.instructionVerifications(sessionIds),
      };
    });
  }

  /**
   * Flight Record のワークスペース選択肢。
   *
   * 一覧（`listInstructionRecords`）の結果から作らないのは、一覧が limit と絞り込みの
   * 影響を受けるため。表示窓に出ていないワークスペースが選択肢から消えると、
   * 「そのワークスペースの記録が無い」と読めてしまう。
   */
  listInstructionWorkspaces(): InstructionWorkspace[] {
    const db = this.ensureDb();
    const cache = new Map<string, string>();
    const counts = new Map<string, number>();

    const add = (repoName: string | null, workspacePath: string, count: number): void => {
      // 一覧の行と同じ規則で名前を決める（リポジトリ名が正本、無ければパス由来へ縮退）。
      // ここだけ規則がずれると、選択肢に在るのに 1 行も一致しない値が並ぶ。
      const name = repoName !== null && repoName !== ''
        ? repoName
        : path.basename(resolveWorkspaceRoot(workspacePath, cache));
      if (name === '') return;
      counts.set(name, (counts.get(name) ?? 0) + count);
    };

    // sessions / repos は activity.db 側。未 ATTACH ではパス由来の名前解決のみで数える
    const sqls = this.trailAttached
      ? [
          `SELECT r.repo_name, i.workspace_path, COUNT(*)
             FROM instructions i
             LEFT JOIN trail.sessions s ON s.id = i.origin_session_id
             LEFT JOIN trail.repos r ON r.repo_id = s.repo_id
            GROUP BY r.repo_name, i.workspace_path`,
          // 宣言の無いセッション（暗黙グループ）も一覧に出るため、こちらも選択肢に要る
          `SELECT r.repo_name, fr.workspace_path, COUNT(*)
             FROM flight_reviews fr
             LEFT JOIN trail.sessions s ON s.id = fr.session_id
             LEFT JOIN trail.repos r ON r.repo_id = s.repo_id
            GROUP BY r.repo_name, fr.workspace_path`,
        ]
      : [
          `SELECT NULL, workspace_path, COUNT(*) FROM instructions GROUP BY workspace_path`,
          `SELECT NULL, workspace_path, COUNT(*) FROM flight_reviews GROUP BY workspace_path`,
        ];
    for (const sql of sqls) {
      for (const row of db.exec(sql)[0]?.values ?? []) {
        add(row[0] as string | null, row[1] as string, (row[2] as number | null) ?? 0);
      }
    }

    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
  }

  // ---------------------------------------------------------------------------
  //  自律受入基盤 S5: 受入台帳 (acceptance_records)（activity.db から移設・2026-08-07）
  // ---------------------------------------------------------------------------

  /**
   * 副作用: acceptance_records へ UPSERT。
   * (commit_sha, route) キーで冪等（farm の再実行・多重記録を吸収する）。
   */
  upsertAcceptanceRecord(input: AcceptanceRecordInput): void {
    const db = this.ensureDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO acceptance_records (
         commit_sha, route, repo_name, verdict, decided_by, decided_at,
         farm_run_ref, failed_tests, vrt_diff, quarantined_count, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(commit_sha, route) DO UPDATE SET
         repo_name = excluded.repo_name,
         verdict = excluded.verdict,
         decided_by = excluded.decided_by,
         decided_at = excluded.decided_at,
         farm_run_ref = excluded.farm_run_ref,
         failed_tests = excluded.failed_tests,
         vrt_diff = excluded.vrt_diff,
         quarantined_count = excluded.quarantined_count,
         notes = excluded.notes,
         updated_at = excluded.updated_at`,
    );
    try {
      stmt.run([
        input.commitSha,
        input.route,
        input.repoName ?? '',
        input.verdict,
        input.decidedBy,
        input.decidedAt ?? null,
        input.farmRunRef ?? '',
        JSON.stringify(input.failedTests ?? []),
        input.vrtDiff ? 1 : 0,
        input.quarantinedCount ?? 0,
        input.notes ?? '',
        now,
        now,
      ]);
    } finally {
      stmt.free();
    }
  }

  /** decided_at 降順（NULL は末尾）。filter 未指定は直近 100 件。 */
  listAcceptanceRecords(filter: AcceptanceRecordFilter = {}): AcceptanceRecord[] {
    const db = this.ensureDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (filter.commitSha !== undefined) {
      conditions.push('commit_sha = ?');
      params.push(filter.commitSha);
    }
    if (filter.route !== undefined) {
      conditions.push('route = ?');
      params.push(filter.route);
    }
    if (filter.since !== undefined) {
      conditions.push('decided_at >= ?');
      params.push(filter.since);
    }
    if (filter.until !== undefined) {
      conditions.push('decided_at <= ?');
      params.push(filter.until);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = db.exec(
      `SELECT commit_sha, route, repo_name, verdict, decided_by, decided_at,
              farm_run_ref, failed_tests, vrt_diff, quarantined_count, notes, created_at, updated_at
       FROM acceptance_records ${where} ORDER BY decided_at DESC, updated_at DESC LIMIT ?`,
      params,
    );
    if (!res[0]) return [];
    return res[0].values.map((row) => ({
      commitSha: row[0] as string,
      route: row[1] as AcceptanceRecord['route'],
      repoName: row[2] as string,
      verdict: row[3] as AcceptanceRecord['verdict'],
      decidedBy: row[4] as AcceptanceRecord['decidedBy'],
      decidedAt: (row[5] as string | null) ?? null,
      farmRunRef: row[6] as string,
      failedTests: row[7] as string,
      vrtDiff: (row[8] as number) === 1,
      quarantinedCount: row[9] as number,
      notes: row[10] as string,
      createdAt: row[11] as string,
      updatedAt: row[12] as string,
    }));
  }

  /**
   * regression 系 fix コミットか（Conventional Commits: `fix(<pkg>/regression):` / `fix(regression):`。
   * 規約は git-workflow ルール）。見逃し率の突合対象を要件書 §5.2 の定義に限定する —
   * `fix(typo)` / `fix(deps)` 等まで数えると経路別見逃し率が過大計上され、Level Gate の誤降格につながる。
   */
  private static isRegressionFixMessage(message: string): boolean {
    return /^fix\(([^)]*\/)?regression\):/.test(message);
  }

  /**
   * 経路別見逃し率の算出（読み取りのみ・近似指標）。
   * 「合格コミットの変更ファイルと同じファイルに、合格後 windowDays 日以内の regression 系 fix
   * コミット（別 SHA・同一リポジトリ）が触れた」件数を missed と数える。厳密な因果は問わない。
   * コミット・リポジトリ情報は activity.db 残留テーブル（repos / session_commits / commit_files）を
   * ATTACH 経由で読む。未 ATTACH では missed を判定できないため missRate=null に縮退する
   * （0 と区別する。acceptedCount は memory 側だけで数えられるので返す）。
   */
  computeAcceptanceMissRate(windowDays = 14): AcceptanceMissRate[] {
    const db = this.ensureDb();
    const routes: AcceptanceRoute[] = ['auto', 'machine', 'human'];
    const passRes = db.exec(
      `SELECT commit_sha, route, decided_at, repo_name FROM acceptance_records
       WHERE verdict = 'pass' AND decided_at IS NOT NULL`,
    );
    const passRows = (passRes[0]?.values ?? []).map((r) => ({
      commitSha: r[0] as string,
      route: r[1] as AcceptanceRoute,
      decidedAt: r[2] as string,
      repoName: r[3] as string,
    }));
    if (passRows.length === 0) {
      return routes.map((route) => ({ route, acceptedCount: 0, missedCount: 0, missRate: null, windowDays }));
    }
    if (!this.trailAttached) {
      const acceptedByRouteOnly = new Map<AcceptanceRoute, number>();
      for (const pass of passRows) {
        acceptedByRouteOnly.set(pass.route, (acceptedByRouteOnly.get(pass.route) ?? 0) + 1);
      }
      return routes.map((route) => ({
        route,
        acceptedCount: acceptedByRouteOnly.get(route) ?? 0,
        missedCount: 0,
        missRate: null,
        windowDays,
      }));
    }

    const repoIdByName = new Map<string, number>();
    for (const row of db.exec(`SELECT repo_id, repo_name FROM trail.repos`)[0]?.values ?? []) {
      repoIdByName.set(row[1] as string, row[0] as number);
    }

    const filesByCommit = this.commitFilesByHashes(passRows.map((r) => r.commitSha));

    const minDecidedAt = passRows.reduce((min, r) => (r.decidedAt < min ? r.decidedAt : min), passRows[0].decidedAt);
    const fixRes = db.exec(
      `SELECT DISTINCT commit_hash, committed_at, repo_id, commit_message FROM trail.session_commits
       WHERE commit_message GLOB 'fix*' AND committed_at IS NOT NULL AND committed_at >= ?`,
      [minDecidedAt],
    );
    const fixCommits = (fixRes[0]?.values ?? [])
      .map((r) => ({
        commitHash: r[0] as string,
        committedAt: r[1] as string,
        repoId: r[2] as number,
        message: r[3] as string,
      }))
      .filter((f) => FlightRecordDatabase.isRegressionFixMessage(f.message));
    const fixFilesByCommit = this.commitFilesByHashes(fixCommits.map((f) => f.commitHash));

    const filesFor = (
      map: Map<string, Map<number, Set<string>>>,
      hash: string,
      repoId: number | null,
    ): Set<string> => {
      const byRepo = map.get(hash);
      if (!byRepo) return new Set();
      if (repoId !== null) return byRepo.get(repoId) ?? new Set();
      const union = new Set<string>();
      for (const set of byRepo.values()) {
        for (const f of set) union.add(f);
      }
      return union;
    };

    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    const missedByRoute = new Map<AcceptanceRoute, number>();
    const acceptedByRoute = new Map<AcceptanceRoute, number>();
    for (const pass of passRows) {
      acceptedByRoute.set(pass.route, (acceptedByRoute.get(pass.route) ?? 0) + 1);
      const passRepoId = repoIdByName.get(pass.repoName) ?? null;
      const passFiles = filesFor(filesByCommit, pass.commitSha, passRepoId);
      if (passFiles.size === 0) continue;
      const decidedMs = Date.parse(pass.decidedAt);
      const missed = fixCommits.some((fix) => {
        if (fix.commitHash === pass.commitSha) return false;
        if (passRepoId !== null && fix.repoId !== passRepoId) return false;
        const fixMs = Date.parse(fix.committedAt);
        if (Number.isNaN(fixMs) || fixMs <= decidedMs || fixMs > decidedMs + windowMs) return false;
        const fixFiles = filesFor(fixFilesByCommit, fix.commitHash, passRepoId !== null ? fix.repoId : null);
        for (const f of fixFiles) {
          if (passFiles.has(f)) return true;
        }
        return false;
      });
      if (missed) {
        missedByRoute.set(pass.route, (missedByRoute.get(pass.route) ?? 0) + 1);
      }
    }
    return routes.map((route) => {
      const acceptedCount = acceptedByRoute.get(route) ?? 0;
      const missedCount = missedByRoute.get(route) ?? 0;
      return {
        route,
        acceptedCount,
        missedCount,
        missRate: acceptedCount === 0 ? null : missedCount / acceptedCount,
        windowDays,
      };
    });
  }

  /** trail.commit_files をハッシュ集合で引き、hash → (repo_id → file_path 集合) の Map にする（IN 句はチャンク分割）。 */
  private commitFilesByHashes(hashes: string[]): Map<string, Map<number, Set<string>>> {
    const db = this.ensureDb();
    const result = new Map<string, Map<number, Set<string>>>();
    const unique = [...new Set(hashes)];
    const CHUNK = 400;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '?').join(', ');
      const res = db.exec(
        `SELECT commit_hash, file_path, repo_id FROM trail.commit_files WHERE commit_hash IN (${placeholders})`,
        chunk,
      );
      for (const row of res[0]?.values ?? []) {
        const hash = row[0] as string;
        const file = row[1] as string;
        const repoId = row[2] as number;
        let byRepo = result.get(hash);
        if (!byRepo) {
          byRepo = new Map();
          result.set(hash, byRepo);
        }
        let set = byRepo.get(repoId);
        if (!set) {
          set = new Set();
          byRepo.set(repoId, set);
        }
        set.add(file);
      }
    }
    return result;
  }

  /** 指定セッションの flight_reviews を 1 本のクエリで引く（走査窓に依存しない）。 */
  private flightReviewsBySessionIds(sessionIds: readonly string[]): Map<string, FlightReview> {
    const byId = new Map<string, FlightReview>();
    if (sessionIds.length === 0) return byId;
    const db = this.ensureDb();
    const placeholders = sessionIds.map(() => '?').join(', ');
    const res = db.exec(
      `SELECT id, session_id, workspace_path, started_at, ended_at, duration_seconds,
              outcome, outcome_source, tool_call_count, tool_failure_count, rework_count,
              unresolved_items, next_concerns, lesson_candidates, tags, notes, rationale_audit_status,
              created_at, updated_at
       FROM flight_reviews WHERE session_id IN (${placeholders})`,
      [...sessionIds],
    );
    for (const row of res[0]?.values ?? []) {
      byId.set(row[1] as string, toFlightReview(row));
    }
    return byId;
  }

  /**
   * ワークスペース名の正本はセッションが属するリポジトリ名（trail.repos.repo_name）。
   * セッションが trail.sessions に無い（取込前・machine 記録のみ）行と、activity.db を
   * ATTACH できない構成では、呼び出し側がパス由来へ縮退する（行を落とさない）。
   */
  private repoNamesBySessionIds(sessionIds: readonly string[]): Map<string, string> {
    const byId = new Map<string, string>();
    if (!this.trailAttached || sessionIds.length === 0) return byId;
    const db = this.ensureDb();
    const placeholders = sessionIds.map(() => '?').join(', ');
    const res = db.exec(
      `SELECT s.id, r.repo_name
         FROM trail.sessions s JOIN trail.repos r ON r.repo_id = s.repo_id
        WHERE s.id IN (${placeholders})`,
      [...sessionIds],
    );
    for (const row of res[0]?.values ?? []) {
      const name = row[1] as string | null;
      if (name !== null && name !== '') byId.set(row[0] as string, name);
    }
    return byId;
  }

  /** trail.session_costs をモデル別に畳む。行が 1 件も無ければ imported=false（0 と区別する）。 */
  private instructionTokenUsage(sessionIds: readonly string[]): InstructionTokenUsage {
    if (!this.trailAttached || sessionIds.length === 0) return EMPTY_TOKEN_USAGE;
    const db = this.ensureDb();
    const placeholders = sessionIds.map(() => '?').join(', ');
    const res = db.exec(
      `SELECT model, SUM(input_tokens), SUM(output_tokens), SUM(cache_read_tokens),
              SUM(cache_creation_tokens), SUM(estimated_cost_usd)
       FROM trail.session_costs WHERE session_id IN (${placeholders})
       GROUP BY model ORDER BY SUM(estimated_cost_usd) DESC`,
      [...sessionIds],
    );
    const rows = res[0]?.values ?? [];
    if (rows.length === 0) return EMPTY_TOKEN_USAGE;
    const byModel: InstructionTokenUsageByModel[] = rows.map((row) => ({
      model: row[0] as string,
      inputTokens: (row[1] as number | null) ?? 0,
      outputTokens: (row[2] as number | null) ?? 0,
      cacheReadTokens: (row[3] as number | null) ?? 0,
      cacheCreationTokens: (row[4] as number | null) ?? 0,
      estimatedCostUsd: (row[5] as number | null) ?? 0,
    }));
    return {
      imported: true,
      inputTokens: byModel.reduce((s, m) => s + m.inputTokens, 0),
      outputTokens: byModel.reduce((s, m) => s + m.outputTokens, 0),
      cacheReadTokens: byModel.reduce((s, m) => s + m.cacheReadTokens, 0),
      cacheCreationTokens: byModel.reduce((s, m) => s + m.cacheCreationTokens, 0),
      estimatedCostUsd: byModel.reduce((s, m) => s + m.estimatedCostUsd, 0),
      byModel,
    };
  }

  /**
   * 成果物。コードはコミット済みのみ、ドキュメント（.md）は未コミットも含む。
   *
   * 未コミット分は trail.message_tool_calls.file_path ではなく trail.messages.tool_calls の
   * JSON から採る。file_path 列は取込時の extractFilePath が Read/Edit/Write/Glob/Grep しか
   * 埋めておらず、本プロジェクトで多用する serena（relative_path）・mcp-markdown（path）経由の
   * 編集が 1 件も残らないため。
   */
  private instructionDeliverables(sessionIds: readonly string[]): InstructionDeliverable[] {
    if (!this.trailAttached || sessionIds.length === 0) return [];
    const db = this.ensureDb();
    const placeholders = sessionIds.map(() => '?').join(', ');
    const deliverables: InstructionDeliverable[] = [];

    const committed = db.exec(
      `SELECT DISTINCT cf.file_path, sc.commit_hash
       FROM trail.session_commits sc
       JOIN trail.commit_files cf ON cf.commit_hash = sc.commit_hash AND cf.repo_id = sc.repo_id
       WHERE sc.session_id IN (${placeholders})
       ORDER BY cf.file_path`,
      [...sessionIds],
    );
    for (const row of committed[0]?.values ?? []) {
      const filePath = row[0] as string;
      deliverables.push({
        kind: isDocPath(filePath) ? 'doc' : 'code',
        filePath,
        committed: true,
        commitHash: (row[1] as string).slice(0, 8),
      });
    }

    const edited = db.exec(
      `SELECT DISTINCT COALESCE(
                json_extract(call.value, '$.input.file_path'),
                json_extract(call.value, '$.input.relative_path'),
                json_extract(call.value, '$.input.path')
              ) AS target
       FROM trail.messages m, json_each(m.tool_calls) AS call
       WHERE m.session_id IN (${placeholders})
         AND m.tool_calls IS NOT NULL AND json_valid(m.tool_calls)
         AND json_extract(call.value, '$.name') IN (${DOC_WRITE_TOOL_NAMES.map(() => '?').join(', ')})
         AND target IS NOT NULL AND target LIKE '%.md'
       ORDER BY target`,
      [...sessionIds, ...DOC_WRITE_TOOL_NAMES],
    );
    for (const row of edited[0]?.values ?? []) {
      const filePath = row[0] as string;
      deliverables.push({ kind: 'doc', filePath, committed: false, commitHash: '' });
    }

    // 2 本のクエリが同一パスを返しうる（コミット済みのファイルを編集した痕跡が残る）
    return foldInstructionDeliverables(deliverables);
  }

  /**
   * 指示に属する検証実行を kind ごとに最新 1 件へ畳んで返す（scripts/run-verified.mjs が書く）。
   *
   * 結合キーは session_id のみ。宣言済みの指示では instruction_sessions が渡す所属セッション、
   * 暗黙グループでは指示 ID = セッション ID なので、どちらも同じ IN 句で引ける。
   */
  private instructionVerifications(sessionIds: readonly string[]): InstructionVerificationRun[] {
    if (!this.trailAttached || sessionIds.length === 0) return [];
    const db = this.ensureDb();
    const placeholders = sessionIds.map(() => '?').join(', ');
    const res = db.exec(
      `SELECT kind, package, command, status, duration_ms, commit_hash, tree_state, code_state_hash, started_at
       FROM trail.verification_runs
       WHERE session_id IN (${placeholders})
       ORDER BY started_at`,
      [...sessionIds],
    );
    // 昇順走査なので同一 kind は最後の代入が最新になる
    const latest = new Map<string, InstructionVerificationRun>();
    for (const row of res[0]?.values ?? []) {
      const kind = row[0] as VerificationKind;
      latest.set(kind, {
        kind,
        package: row[1] as string,
        command: row[2] as string,
        status: row[3] as VerificationRunStatus,
        durationMs: row[4] as number,
        commitHash: row[5] as string,
        treeState: row[6] as 'clean' | 'dirty',
        codeStateHash: (row[7] as string | null) ?? null,
        startedAt: row[8] as string,
      });
    }
    return [...latest.values()].sort((a, b) => VERIFICATION_KINDS.indexOf(a.kind) - VERIFICATION_KINDS.indexOf(b.kind));
  }
}
