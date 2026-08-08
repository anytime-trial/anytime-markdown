import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Database } from 'better-sqlite3';
import {
  ALTER_DOCTRINE_JUDGMENTS_ADD_DELEGATED_AT,
  ALTER_DOCTRINE_JUDGMENTS_ADD_UNDERSPECIFIED_POINTS,
  CREATE_DOCTRINE_JUDGMENTS,
  CREATE_DOCTRINE_JUDGMENT_INDEXES,
} from '@anytime-markdown/trail-activity';
import type { ResolvedCitation } from '../doctrine/resolveCitations';
import type { CoverageGateResult } from '../doctrine/coverageGate';

export type AgentJudgment = 'approve' | 'reject' | 'escalate';
export type Coverage = 'covered' | 'silent' | 'conflict' | 'odd_out';
export type HumanDecision = 'approve' | 'reject' | 'modified';

export interface DoctrineJudgmentInput {
  readonly sessionId: string;
  readonly subject: string;
  readonly judgment: AgentJudgment;
  readonly coverage: Coverage;
  readonly citations: ReadonlyArray<ResolvedCitation>;
  readonly judgedAt?: string;
  /** カバレッジゲートの判定 (DCT-10〜12)。未評価なら省略し、列は NULL のままにする */
  readonly gate?: CoverageGateResult;
  /**
   * 指示から一意に定まらない論点の事前申告 (DCT-14)。省略・空配列は
   * 「この指示だけで結論は一意に定まる」という宣言として記録される。
   */
  readonly underspecifiedPoints?: ReadonlyArray<string>;
}

export interface DoctrineJudgmentRecordResult {
  readonly id: number;
  readonly citationCount: number;
  readonly resolvedCount: number;
}

export interface DelegatedApprovalResult {
  readonly id: number;
  readonly delegatedAt: string;
  /** 既に代行済みで、今回の呼び出しでは何も更新していない（最初の記録を返した） */
  readonly alreadyDelegated: boolean;
}

export interface HumanDecisionResult {
  /** escalate 判断は一致率の分母外のため null */
  readonly agreement: boolean | null;
  readonly agentJudgment: AgentJudgment;
}

export interface DoctrineAgreementMetrics {
  readonly total: number;
  /**
   * 人の判断が記録されている件数。**代行後の抜き取り監査を含む**ため `delegated` と
   * 重なる。`decided + pending = total` は成り立たない
   * （`total = decided + delegated - delegatedAudited + pending`）。
   */
  readonly decided: number;
  /**
   * 人の判断も代行の記録も無い件数。代行済み (D2) を含めると「人が答えていない」件数と
   * 「人に聞かなかった」件数が混ざり、どちらの意味でも読めなくなるため分ける。
   */
  readonly pending: number;
  /** D2 でエージェントが代行した件数 */
  readonly delegated: number;
  /** 代行のうち、人が後から抜き取り監査で判断した件数（一致率の入力になる） */
  readonly delegatedAudited: number;
  /**
   * covered かつ人の判断記録済み かつ agent != escalate **かつ未確定論点の申告が空**を
   * 分母とする一致率。
   *
   * 申告が非空の判断を分母から外すのは、そこでの不一致が「較正の失敗」ではなく
   * 「指示の不足」だから (DCT-14)。両者を畳むと、D1 差し戻しでは減らない失敗を
   * 理由に D1 へ戻すことになる。指示の不足側は `instructionGapRate` が測る。
   */
  readonly agreementRate: number | null;
  /** 未確定論点を申告した件数 (DCT-14) */
  readonly underspecified: number;
  /**
   * 申告列を配列として読めなかった件数 (DCT-14)。0 でない間は `agreementRate` /
   * `instructionGapRate` の解釈を保留する。破損行は「申告あり」に畳まず分母に残す
   * ため一致率は下がる方向にしか動かないが、原因が破損か実態かは本件数でしか判らない。
   */
  readonly unreadableDeclarations: number;
  /**
   * 指示不足率 (DCT-14)。未確定論点の申告が非空だった割合 (分母 = total)。
   * 高いときの是正は D1 差し戻しではなく、What 承認を出す前に不足論点を洗い出す運用の側。
   * 不自然に 0 へ張り付く場合は「代行したいから空で出す」申告の形骸化を疑う。
   */
  readonly instructionGapRate: number | null;
  /** escalate または coverage != covered の割合（分母 = total） */
  readonly escalationRate: number | null;
  /** 解決検査を通過した引用の割合 */
  readonly citationResolutionRate: number | null;
  /**
   * canon 接地率 (DCT-3)。covered 判断のうち、承認済み条項 (canon) または明文規約
   * (canon_by_document) の引用を 1 件以上持つものの割合。一致率が高くても未承認条項に
   * 依存した判断は代行根拠にならないため、D2 昇格ゲートは本指標を併せて見る。
   */
  readonly canonGroundedRate: number | null;
  /**
   * 代行可能率 (DCT-10〜12)。カバレッジゲートが `delegable` と判定した割合。分母は
   * ゲート判定を持つレコードのみ (ゲート導入前のレコードは判定していないため除く)。
   * D2 昇格時に「どれだけの What 承認が代行に置き換わるか」の見積りになる。
   */
  readonly delegableRate: number | null;
}

/**
 * テーブルは拡張 (TrailDatabase) 側でも作成されるが、拡張の再ビルド・再配布より
 * 先に本ツールが動けるよう、書込前に冪等作成する (DDL は trail-activity が単一の正)。
 */
/**
 * テーブル本体より後に追加した列。既存 DB には ALTER TABLE で足す (純追加・既存行は
 * NULL のまま)。DDL は trail-activity の CREATE 文と同じ制約を書き写す。
 */
const ADDED_COLUMNS: ReadonlyArray<{ readonly name: string; readonly ddl: string }> = [
  {
    name: 'gate_verdict',
    ddl: `ALTER TABLE doctrine_judgments ADD COLUMN gate_verdict TEXT CHECK (gate_verdict IS NULL OR gate_verdict IN ('delegable', 'escalate'))`,
  },
  {
    name: 'gate_reasons_json',
    ddl: `ALTER TABLE doctrine_judgments ADD COLUMN gate_reasons_json TEXT CHECK (gate_reasons_json IS NULL OR json_valid(gate_reasons_json))`,
  },
  {
    name: 'delegated_at',
    ddl: ALTER_DOCTRINE_JUDGMENTS_ADD_DELEGATED_AT,
  },
  {
    // 唯一 NOT NULL DEFAULT を持つ後付け列。既存行はこの ALTER で '[]' に確定する
    name: 'underspecified_points_json',
    ddl: ALTER_DOCTRINE_JUDGMENTS_ADD_UNDERSPECIFIED_POINTS,
  },
];

export function ensureDoctrineJudgmentsTable(db: Database): void {
  db.exec(CREATE_DOCTRINE_JUDGMENTS);
  for (const idx of CREATE_DOCTRINE_JUDGMENT_INDEXES) {
    db.exec(idx);
  }
  const columns = db.prepare(`PRAGMA table_info(doctrine_judgments)`).all() as Array<{
    name: string;
  }>;
  const existing = new Set(columns.map((column) => column.name));
  for (const column of ADDED_COLUMNS) {
    if (!existing.has(column.name)) {
      db.exec(column.ddl);
    }
  }
}

/** destructiveMigrateDoctrineJudgmentsFromTrailDb の判別可能な結果。 */
export interface DoctrineMigrationResult {
  readonly status: 'migrated' | 'verification_failed';
  /** INSERT できた実行数（id 保持パス + 再採番パスの合計）。 */
  readonly copiedRows: number;
  /** アンチ結合検証で trail 側に残存と判定された行数（0 なら DROP 済み）。 */
  readonly missingRows: number;
}

/**
 * **副作用: 検証通過時に activity.db 側の doctrine_judgments を退避テーブルへ複製した上で DROP する。**
 *
 * doctrine_judgments の保存先移設（activity.db → caravan-book.db・2026-08-07）の遅延移行。
 * デーモン非依存で mcp-trail 自身が行う（判断記録はデーモン未起動でも落とせない —
 * 記録経路と同じ理由で移行も同経路に置く）。全 doctrine 系ツールが ensure 直後に
 * 冪等実行する。移行済み（trail 側テーブル不在）なら即 null を返す。
 *
 * 1. id を保持してコピー（INSERT OR IGNORE。過去セッションが持つ判断 id の突合を守る）
 * 2. id 衝突で入らなかった行は (session_id, subject) 単位で id 再採番の第 2 パスでコピー
 *    （移行前に memory 側へ新規記録が入った稀なケースの自己修復。再採番行の旧 id 参照は
 *    (sessionId + subject) の代替キーで引ける）
 * 3. 衝突キーで trail 側だけが human_decision / delegated_at を持つ場合は移送する
 *    （人の判断・代行監査記録を機械上書きで失わない）
 * 4. 検証は (session_id, subject) のアンチ結合 + 人の判断の保存確認。通過時のみ
 *    trail.doctrine_judgments__pre_move_backup へ複製して DROP（復旧手段を残す）
 */
export function destructiveMigrateDoctrineJudgmentsFromTrailDb(
  db: Database,
  trailDbPath: string,
): DoctrineMigrationResult | null {
  if (!fs.existsSync(trailDbPath)) return null;
  db.prepare(`ATTACH DATABASE ? AS trail`).run(trailDbPath);
  try {
    // BEGIN IMMEDIATE は**並行移行の直列化**のため（トランザクション外に検証・退避・DROP を
    // 置くと、並行 mcp-trail の同時実行で退避テーブルへの全行二重挿入・後続 DROP の
    // no such table・中断時の退避重複が起きる）。WAL 下ではファイル間（caravan-book.db と
    // ATTACH した activity.db）のコミットは原子的でない — クラッシュ耐性は退避テーブル
    // `__pre_move_backup`（DROP と同一の activity.db 内で必ず同時確定）が担保する。退避を外さないこと。
    db.exec('BEGIN IMMEDIATE');
    try {
      // 存在チェックはロック取得後に行う（TOCTOU 回避: 先行プロセスが DROP した直後でもここで抜ける）
      const has = db
        .prepare(`SELECT 1 FROM trail.sqlite_master WHERE type = 'table' AND name = 'doctrine_judgments'`)
        .get();
      if (has === undefined) {
        db.exec('COMMIT');
        return null;
      }
      // 旧 DB は後付け列（gate_verdict 等）を持たない可能性があるため、両側の列の共通部分をコピーする
      const trailCols = (db.prepare(`PRAGMA trail.table_info(doctrine_judgments)`).all() as Array<{ name: string }>).map((c) => c.name);
      const memCols = new Set(
        (db.prepare(`PRAGMA table_info(doctrine_judgments)`).all() as Array<{ name: string }>).map((c) => c.name),
      );
      const cols = trailCols.filter((c) => memCols.has(c));
      const colList = cols.join(', ');
      const colListNoId = cols.filter((c) => c !== 'id').join(', ');
      let copiedRows = 0;
      copiedRows += db
        .prepare(`INSERT OR IGNORE INTO doctrine_judgments (${colList}) SELECT ${colList} FROM trail.doctrine_judgments`)
        .run().changes;
      copiedRows += db
        .prepare(
          `INSERT OR IGNORE INTO doctrine_judgments (${colListNoId})
           SELECT ${colListNoId} FROM trail.doctrine_judgments t
           WHERE NOT EXISTS (SELECT 1 FROM doctrine_judgments m WHERE m.session_id = t.session_id AND m.subject = t.subject)`,
        )
        .run().changes;
      // マージ段も列存在で条件分岐する（後付け列を持たない旧 trail スキーマで prepare が落ちないため）
      if (cols.includes('human_decision')) {
        db.prepare(
          `UPDATE doctrine_judgments SET human_decision = t.human_decision, decided_at = t.decided_at, updated_at = t.updated_at
           FROM trail.doctrine_judgments t
           WHERE doctrine_judgments.session_id = t.session_id AND doctrine_judgments.subject = t.subject
             AND t.human_decision IS NOT NULL AND doctrine_judgments.human_decision IS NULL`,
        ).run();
      }
      if (cols.includes('delegated_at')) {
        db.prepare(
          `UPDATE doctrine_judgments SET delegated_at = t.delegated_at, updated_at = t.updated_at
           FROM trail.doctrine_judgments t
           WHERE doctrine_judgments.session_id = t.session_id AND doctrine_judgments.subject = t.subject
             AND t.delegated_at IS NOT NULL AND doctrine_judgments.delegated_at IS NULL`,
        ).run();
      }
      const trailCount = Number(
        (db.prepare(`SELECT COUNT(*) c FROM trail.doctrine_judgments`).get() as { c: number }).c,
      );
      // (session_id, subject) 衝突で本体列（agent_judgment / coverage / citations 等）が入らなかった
      // 行を可視化する（黙って捨てない）。全行は下の退避テーブルに残るため復旧は可能
      const collided = trailCount - copiedRows;
      if (collided > 0) {
        const sampleKeys = db
          .prepare(
            `SELECT t.session_id, t.subject FROM trail.doctrine_judgments t
             JOIN doctrine_judgments m ON m.session_id = t.session_id AND m.subject = t.subject LIMIT 5`,
          )
          .all() as Array<{ session_id: string; subject: string }>;
        console.error(
          `[${new Date().toISOString()}] [ERROR] [mcp-trail] doctrine_judgments migration: ${collided} row(s) collided on (session_id, subject); trail-side judgment columns not adopted (full rows retained in doctrine_judgments__pre_move_backup). sample=${JSON.stringify(sampleKeys)}`,
        );
      }
      // 検証: アンチ結合（存在）+ human_decision / delegated_at の保存確認（両者対称）
      let missingRows = Number(
        (db
          .prepare(
            `SELECT COUNT(*) c FROM trail.doctrine_judgments t
             WHERE NOT EXISTS (SELECT 1 FROM doctrine_judgments m WHERE m.session_id = t.session_id AND m.subject = t.subject)`,
          )
          .get() as { c: number }).c,
      );
      if (cols.includes('human_decision')) {
        missingRows += Number(
          (db
            .prepare(
              `SELECT COUNT(*) c FROM trail.doctrine_judgments t JOIN doctrine_judgments m
                 ON m.session_id = t.session_id AND m.subject = t.subject
               WHERE t.human_decision IS NOT NULL AND m.human_decision IS NULL`,
            )
            .get() as { c: number }).c,
        );
      }
      if (cols.includes('delegated_at')) {
        missingRows += Number(
          (db
            .prepare(
              `SELECT COUNT(*) c FROM trail.doctrine_judgments t JOIN doctrine_judgments m
                 ON m.session_id = t.session_id AND m.subject = t.subject
               WHERE t.delegated_at IS NOT NULL AND m.delegated_at IS NULL`,
            )
            .get() as { c: number }).c,
        );
      }
      if (missingRows > 0) {
        console.error(
          `[${new Date().toISOString()}] [ERROR] [mcp-trail] doctrine_judgments migration verification failed (rows not preserved: ${missingRows}); keeping trail-side table`,
        );
        // コピー分は保持して確定する（次回の再実行は冪等）。DROP はしない
        db.exec('COMMIT');
        return { status: 'verification_failed', copiedRows, missingRows };
      }
      // 退避 → DROP（同一トランザクション内。退避行数が元と一致しなければ確定しない）
      const backupExists =
        db
          .prepare(`SELECT 1 FROM trail.sqlite_master WHERE type = 'table' AND name = 'doctrine_judgments__pre_move_backup'`)
          .get() !== undefined;
      let backedUp: number;
      if (backupExists) {
        backedUp = db
          .prepare(`INSERT INTO trail.doctrine_judgments__pre_move_backup SELECT * FROM trail.doctrine_judgments`)
          .run().changes;
      } else {
        db.exec(`CREATE TABLE trail.doctrine_judgments__pre_move_backup AS SELECT * FROM trail.doctrine_judgments`);
        backedUp = Number(
          (db.prepare(`SELECT COUNT(*) c FROM trail.doctrine_judgments__pre_move_backup`).get() as { c: number }).c,
        );
      }
      if (backedUp !== trailCount) {
        console.error(
          `[${new Date().toISOString()}] [ERROR] [mcp-trail] doctrine_judgments migration: backup row count mismatch (backup=${backedUp} trail=${trailCount}); rolling back`,
        );
        db.exec('ROLLBACK');
        return { status: 'verification_failed', copiedRows: 0, missingRows: trailCount };
      }
      db.exec(`DROP TABLE IF EXISTS trail.doctrine_judgments`);
      db.exec('COMMIT');
      return { status: 'migrated', copiedRows, missingRows: 0 };
    } catch (e) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ROLLBACK 失敗は元例外を優先して伝播させる（ここで新例外を投げると原因が隠れる）
      }
      throw e;
    }
  } finally {
    db.exec('DETACH DATABASE trail');
  }
}

/**
 * 全 doctrine 系ツール共通の前処理: caravan-book.db 側にテーブルを冪等作成し、
 * activity.db に旧テーブルが残っていれば遅延移行する（各ツールが open 直後に呼ぶ）。
 */
export function ensureAndMigrateDoctrineJudgments(db: Database, memoryDbPath: string): void {
  ensureDoctrineJudgmentsTable(db);
  // 移行は旧データ回収の副次目的であり、失敗（SQLITE_BUSY 等）が判断記録そのものを
  // 止めてはならない（CLAUDE.md D2 §4「記録失敗は承認フローを止めない」と同方針）。
  // 冪等なので次回呼び出しで再試行され、回収機会は失われない。
  try {
    destructiveMigrateDoctrineJudgmentsFromTrailDb(db, path.join(path.dirname(memoryDbPath), 'activity.db'));
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] [ERROR] [mcp-trail] doctrine_judgments migration failed (records continue to caravan-book.db; will retry on next call)`,
      err instanceof Error ? err.stack : err,
    );
  }
}

export function recordDoctrineJudgmentDirect(
  db: Database,
  input: DoctrineJudgmentInput,
): DoctrineJudgmentRecordResult {
  if (input.coverage === 'covered' && input.citations.length === 0) {
    // DCT-9: covered は「ドクトリンが判断根拠を与える」状態であり、根拠引用なしの
    // covered を許すと一致率だけが増え引用解決率を測れないレコードになる
    throw new Error("coverage='covered' requires at least one citation (DCT-9)");
  }
  ensureDoctrineJudgmentsTable(db);
  const now = new Date().toISOString();
  const judgedAt = input.judgedAt ?? now;
  const citationCount = input.citations.length;
  const resolvedCount = input.citations.filter((c) => c.resolved).length;
  // 同一 (session, subject) の再記録は最新判断で上書きし、既存の人の判断は無効化する
  // (判断が変わった後の突合は成立しないため)。
  db.prepare(
    `INSERT INTO doctrine_judgments (
       session_id, subject, agent_judgment, coverage, citations_json,
       citation_count, resolved_count, gate_verdict, gate_reasons_json,
       underspecified_points_json, judged_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id, subject) DO UPDATE SET
       agent_judgment = excluded.agent_judgment,
       coverage = excluded.coverage,
       citations_json = excluded.citations_json,
       citation_count = excluded.citation_count,
       resolved_count = excluded.resolved_count,
       gate_verdict = excluded.gate_verdict,
       gate_reasons_json = excluded.gate_reasons_json,
       -- 申告はラチェット: 論点の追記は通すが、非空 → 空へは戻せない。
       -- 再記録は human_decision / delegated_at もリセットするため、空で再記録できると
       -- 「escalate された判断を空で上書きして代行のガードを全部通す」経路が成立し、
       -- 最初の申告は行ごと消えて監査に残らない (DCT-14)。
       -- 残る自由度は非空 → 別の非空 (部分削除) だが、どちらもゲートは escalate する
       underspecified_points_json = CASE
         WHEN json_array_length(underspecified_points_json) > 0
          AND json_array_length(excluded.underspecified_points_json) = 0
         THEN underspecified_points_json
         ELSE excluded.underspecified_points_json
       END,
       judged_at = excluded.judged_at,
       human_decision = NULL,
       decided_at = NULL,
       delegated_at = NULL,
       updated_at = excluded.updated_at`,
  ).run(
    input.sessionId,
    input.subject,
    input.judgment,
    input.coverage,
    JSON.stringify(input.citations),
    citationCount,
    resolvedCount,
    input.gate === undefined ? null : input.gate.verdict,
    input.gate === undefined ? null : JSON.stringify(input.gate.reasons),
    JSON.stringify(input.underspecifiedPoints ?? []),
    judgedAt,
    now,
    now,
  );
  const row = db
    .prepare(`SELECT id FROM doctrine_judgments WHERE session_id = ? AND subject = ?`)
    .get(input.sessionId, input.subject) as { id: number };
  return { id: row.id, citationCount, resolvedCount };
}

export function recordHumanDecisionDirect(
  db: Database,
  args: {
    readonly id?: number;
    readonly sessionId?: string;
    readonly subject?: string;
    readonly decision: HumanDecision;
    readonly decidedAt?: string;
  },
): HumanDecisionResult {
  ensureDoctrineJudgmentsTable(db);
  const row = findJudgmentRow(db, args);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE doctrine_judgments SET human_decision = ?, decided_at = ?, updated_at = ? WHERE id = ?`,
  ).run(args.decision, args.decidedAt ?? now, now, row.id);
  const agreement =
    row.agent_judgment === 'escalate'
      ? null
      : (row.agent_judgment === 'approve' && args.decision === 'approve') ||
        (row.agent_judgment === 'reject' && args.decision === 'reject');
  return { agreement, agentJudgment: row.agent_judgment };
}

interface JudgmentLookupRow {
  readonly id: number;
  readonly agent_judgment: AgentJudgment;
  readonly gate_verdict: 'delegable' | 'escalate' | null;
  readonly human_decision: HumanDecision | null;
  readonly delegated_at: string | null;
}

/**
 * id もしくは (sessionId + subject) で判断レコードを引く。
 * record_doctrine_judgment が返す id が最も安定した突合キー (subject は表記揺れし得る)。
 */
function findJudgmentRow(
  db: Database,
  key: { readonly id?: number; readonly sessionId?: string; readonly subject?: string },
): JudgmentLookupRow {
  const columns = `id, agent_judgment, gate_verdict, human_decision, delegated_at`;
  let row: JudgmentLookupRow | undefined;
  let keyLabel: string;
  if (key.id !== undefined) {
    row = db
      .prepare(`SELECT ${columns} FROM doctrine_judgments WHERE id = ?`)
      .get(key.id) as JudgmentLookupRow | undefined;
    keyLabel = `id=${key.id}`;
  } else if (key.sessionId !== undefined && key.subject !== undefined) {
    row = db
      .prepare(`SELECT ${columns} FROM doctrine_judgments WHERE session_id = ? AND subject = ?`)
      .get(key.sessionId, key.subject) as JudgmentLookupRow | undefined;
    keyLabel = `session_id=${key.sessionId}, subject=${key.subject}`;
  } else {
    throw new Error('doctrine judgment lookup requires id or (sessionId + subject)');
  }
  if (row === undefined) {
    throw new Error(`doctrine judgment not found (${keyLabel}); record_doctrine_judgment first`);
  }
  return row;
}

/**
 * D2: カバレッジゲートが `delegable` と判定した What 承認をエージェントが代行したことを記録する。
 *
 * 代行してよい条件を機構側でも検査し、満たさないものは記録せず例外にする (fail-closed)。
 * 「代行した」という記録が後から作れてしまうと、一致率も代行率も監査に使えなくなる。
 */
export function recordDelegatedApprovalDirect(
  db: Database,
  args: {
    readonly id?: number;
    readonly sessionId?: string;
    readonly subject?: string;
    /**
     * 記録時刻。**MCP ツールからは渡せない**（外から任意の時刻を入れられると代行を
     * 遡って記録でき、監査に使えなくなる）。テストで時刻を固定するための注入点。
     */
    readonly delegatedAt?: string;
  },
): DelegatedApprovalResult {
  ensureDoctrineJudgmentsTable(db);
  const row = findJudgmentRow(db, args);
  if (row.gate_verdict !== 'delegable') {
    throw new Error(
      `cannot delegate: gate verdict is ${row.gate_verdict ?? 'unevaluated'} (only 'delegable' may be delegated)`,
    );
  }
  if (row.agent_judgment !== 'approve') {
    throw new Error(
      `cannot delegate: agent judgment is '${row.agent_judgment}' (D2 delegates What approvals only)`,
    );
  }
  if (row.human_decision !== null) {
    throw new Error('cannot delegate: human decision already recorded for this judgment');
  }
  if (row.delegated_at !== null) {
    // 最初の記録が勝つ。再呼び出しを例外にせず no-op にするのは、記録の再送 (通信断後の
    // リトライ等) を通したいため。ただし時刻は上書きしない — 上書きできると代行時刻を
    // 後から任意に付け替えられ、監査ログとして使えなくなる
    return { id: row.id, delegatedAt: row.delegated_at, alreadyDelegated: true };
  }
  const now = new Date().toISOString();
  const delegatedAt = args.delegatedAt ?? now;
  db.prepare(
    `UPDATE doctrine_judgments SET delegated_at = ?, updated_at = ? WHERE id = ?`,
  ).run(delegatedAt, now, row.id);
  return { id: row.id, delegatedAt, alreadyDelegated: false };
}

/**
 * 受け入れ確認 (DCT-13) の提示物 1・2・4 の供給元。JSON 列のパース失敗は当該
 * レコードを落とさず parseError へ落とす (1 件の破損で提示物全体を失わせない)。
 */
export interface DoctrineJudgmentView {
  readonly id: number;
  readonly sessionId: string;
  readonly subject: string;
  readonly agentJudgment: AgentJudgment;
  readonly coverage: Coverage;
  readonly citations: ReadonlyArray<ResolvedCitation>;
  /** ゲート未評価 (導入前の記録) は null。delegable として扱わない */
  readonly gateVerdict: 'delegable' | 'escalate' | null;
  readonly gateReasons: readonly string[];
  readonly humanDecision: HumanDecision | null;
  readonly judgedAt: string;
  readonly decidedAt: string | null;
  /** D2 で代行した時刻。人へ聞いたものは null */
  readonly delegatedAt: string | null;
  /** 指示から一意に定まらないと事前申告した論点 (DCT-14)。空 = 一意に定まると宣言した */
  readonly underspecifiedPoints: readonly string[];
  /** JSON 列のパース失敗理由。成功時は null */
  readonly parseError: string | null;
}

interface JsonParseOutcome<T> {
  readonly value: T;
  readonly error: string | null;
}

/**
 * JSON 列を配列として読む。json_valid の CHECK があってもパース後の「形」までは
 * 保証されないため (`'"str"'` は valid JSON)、配列かどうかを別に検査する。
 */
function parseJsonArrayColumn<T>(column: string, raw: string | null): JsonParseOutcome<T[]> {
  if (raw === null) {
    return { value: [], error: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      value: [],
      error: `${column}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!Array.isArray(parsed)) {
    return { value: [], error: `${column}: expected an array, got ${typeof parsed}` };
  }
  return { value: parsed as T[], error: null };
}

function tableColumns(db: Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

/**
 * 受け入れ確認 (DCT-13) の読み出し。**書込・DDL を行わない** (ensure を呼ばない)。
 * 提示のためだけに本番 DB のスキーマを変えないため、テーブル不在は空配列、
 * 後付け列 (gate_*) の不在は NULL として扱う。
 */
export function listDoctrineJudgmentsBySession(
  db: Database,
  sessionId: string,
): DoctrineJudgmentView[] {
  const columns = tableColumns(db, 'doctrine_judgments');
  if (columns.size === 0) {
    return [];
  }
  const gateVerdictExpr = columns.has('gate_verdict') ? 'gate_verdict' : 'NULL AS gate_verdict';
  const gateReasonsExpr = columns.has('gate_reasons_json')
    ? 'gate_reasons_json'
    : 'NULL AS gate_reasons_json';
  const delegatedAtExpr = columns.has('delegated_at') ? 'delegated_at' : 'NULL AS delegated_at';
  // 列を持たない旧 DB は「空の申告」に倒す（列の DEFAULT と同じ扱い。NULL を返すと
  // 「未申告」という第 3 の状態が読み取り側に生まれる）
  const underspecifiedExpr = columns.has('underspecified_points_json')
    ? 'underspecified_points_json'
    : `'[]' AS underspecified_points_json`;
  const rows = db
    .prepare(
      `SELECT id, session_id, subject, agent_judgment, coverage, citations_json,
              ${gateVerdictExpr}, ${gateReasonsExpr}, human_decision, judged_at, decided_at,
              ${delegatedAtExpr}, ${underspecifiedExpr}
         FROM doctrine_judgments
        WHERE session_id = ?
        ORDER BY judged_at ASC, id ASC`,
    )
    .all(sessionId) as Array<{
    id: number;
    session_id: string;
    subject: string;
    agent_judgment: AgentJudgment;
    coverage: Coverage;
    citations_json: string | null;
    gate_verdict: 'delegable' | 'escalate' | null;
    gate_reasons_json: string | null;
    human_decision: HumanDecision | null;
    judged_at: string;
    decided_at: string | null;
    delegated_at: string | null;
    underspecified_points_json: string | null;
  }>;

  return rows.map((row) => {
    const citations = parseJsonArrayColumn<ResolvedCitation>('citations_json', row.citations_json);
    const reasons = parseJsonArrayColumn<string>('gate_reasons_json', row.gate_reasons_json);
    const underspecified = parseJsonArrayColumn<string>(
      'underspecified_points_json',
      row.underspecified_points_json,
    );
    const errors = [citations.error, reasons.error, underspecified.error].filter(
      (e): e is string => e !== null,
    );
    return {
      id: row.id,
      sessionId: row.session_id,
      subject: row.subject,
      agentJudgment: row.agent_judgment,
      coverage: row.coverage,
      citations: citations.value,
      gateVerdict: row.gate_verdict,
      gateReasons: reasons.value,
      humanDecision: row.human_decision,
      judgedAt: row.judged_at,
      decidedAt: row.decided_at,
      delegatedAt: row.delegated_at,
      underspecifiedPoints: underspecified.value,
      parseError: errors.length === 0 ? null : errors.join('; '),
    };
  });
}

/**
 * 承認済み条項 (canon) または明文規約 (canon_by_document) の引用を 1 件以上持つか。
 * 本機能より前に記録されたレコードは approval を持たないため canon 接地なしと数える
 * (記録時点で承認状態を検査していないものを遡って canon 扱いにしない)。
 */
function hasCanonCitation(citationsJson: string): boolean {
  const citations = JSON.parse(citationsJson) as ReadonlyArray<{ approval?: string }>;
  return citations.some((c) => c.approval === 'canon' || c.approval === 'canon_by_document');
}

/** 一致率集計の入力行。(session_id, subject) は過渡期の memory / trail 重複排除キー。 */
export interface DoctrineAgreementRow {
  readonly session_id: string;
  readonly subject: string;
  readonly agent_judgment: AgentJudgment;
  readonly coverage: Coverage;
  readonly human_decision: HumanDecision | null;
  readonly citation_count: number;
  readonly resolved_count: number;
  readonly citations_json: string;
  readonly gate_verdict: 'delegable' | 'escalate' | null;
  readonly delegated_at: string | null;
  readonly underspecified_points_json: string;
}

/**
 * 一致率集計の入力行を読む（**読み取り専用**。ensure も DDL も行わない）。
 * テーブル不在は空配列、後付け列（gate_verdict / delegated_at）の不在は NULL 扱い
 * （listDoctrineJudgmentsBySession と同じ縮退耐性）。
 */
export function fetchDoctrineAgreementRows(
  db: Database,
  range: { readonly since?: string; readonly until?: string } = {},
): DoctrineAgreementRow[] {
  const columns = tableColumns(db, 'doctrine_judgments');
  if (columns.size === 0) return [];
  const gateVerdictExpr = columns.has('gate_verdict') ? 'gate_verdict' : 'NULL AS gate_verdict';
  const delegatedAtExpr = columns.has('delegated_at') ? 'delegated_at' : 'NULL AS delegated_at';
  // 移行過渡期の activity.db 側は列を持たない。空の申告に倒すことで、旧レコードは
  // 従来どおり一致率の分母に入る（遡って分母から外し、自分に有利に再計算しない）
  const underspecifiedExpr = columns.has('underspecified_points_json')
    ? 'underspecified_points_json'
    : `'[]' AS underspecified_points_json`;
  const conditions: string[] = [];
  const params: string[] = [];
  if (range.since !== undefined) {
    conditions.push('judged_at >= ?');
    params.push(range.since);
  }
  if (range.until !== undefined) {
    conditions.push('judged_at <= ?');
    params.push(range.until);
  }
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT session_id, subject, agent_judgment, coverage, human_decision, citation_count, resolved_count, citations_json, ${gateVerdictExpr}, ${delegatedAtExpr}, ${underspecifiedExpr} FROM doctrine_judgments${where}`,
    )
    .all(...params) as DoctrineAgreementRow[];
}

/**
 * memory 側と trail 側（移行過渡期の残存）の行を (session_id, subject) で重複排除して結合する。
 * memory 側優先 — 移設後の新規記録・マージ済みの人の判断が正のため。
 */
export function mergeDoctrineAgreementRows(
  memoryRows: readonly DoctrineAgreementRow[],
  trailRows: readonly DoctrineAgreementRow[],
): DoctrineAgreementRow[] {
  const seen = new Set(memoryRows.map((r) => `${r.session_id} ${r.subject}`));
  const merged = [...memoryRows];
  for (const row of trailRows) {
    if (!seen.has(`${row.session_id} ${row.subject}`)) merged.push(row);
  }
  return merged;
}

/**
 * 未確定論点の申告の読み取り結果 (DCT-14)。**破損を「申告あり」に畳まない**。
 *
 * 破損を申告ありに倒すと当該行が一致率の分母から外れ、**破損が起きるほど
 * `agreementRate` が良く出る**（差し戻しを駆動する指標が壊れる方向に動く）。
 * かといって空扱いにすると指示不足を較正の失敗として数えてしまう。
 * どちらにも倒さず、分母には残しつつ (= 一致率は下がる方向にしか動かない)
 * 別カウントで可視化する。
 */
type DeclarationState = 'empty' | 'declared' | 'unreadable';

function readDeclaration(row: DoctrineAgreementRow): DeclarationState {
  const parsed = parseJsonArrayColumn<string>(
    'underspecified_points_json',
    row.underspecified_points_json,
  );
  if (parsed.error !== null) {
    return 'unreadable';
  }
  return parsed.value.length > 0 ? 'declared' : 'empty';
}

export function aggregateDoctrineAgreement(rows: readonly DoctrineAgreementRow[]): DoctrineAgreementMetrics {
  const total = rows.length;
  const declarations = new Map(rows.map((r) => [r, readDeclaration(r)] as const));
  const underspecifiedRows = rows.filter((r) => declarations.get(r) === 'declared');
  const unreadableDeclarations = rows.filter((r) => declarations.get(r) === 'unreadable').length;
  const decided = rows.filter((r) => r.human_decision !== null).length;
  const delegatedRows = rows.filter((r) => r.delegated_at !== null);
  const delegatedAudited = delegatedRows.filter((r) => r.human_decision !== null).length;
  const pending = rows.filter(
    (r) => r.human_decision === null && r.delegated_at === null,
  ).length;
  const agreementTargets = rows.filter(
    (r) =>
      r.coverage === 'covered' &&
      r.human_decision !== null &&
      r.agent_judgment !== 'escalate' &&
      declarations.get(r) !== 'declared',
  );
  const matched = agreementTargets.filter(
    (r) =>
      (r.agent_judgment === 'approve' && r.human_decision === 'approve') ||
      (r.agent_judgment === 'reject' && r.human_decision === 'reject'),
  ).length;
  const escalations = rows.filter(
    (r) => r.agent_judgment === 'escalate' || r.coverage !== 'covered',
  ).length;
  const citationTotal = rows.reduce((sum, r) => sum + r.citation_count, 0);
  const citationResolved = rows.reduce((sum, r) => sum + r.resolved_count, 0);
  const coveredRows = rows.filter((r) => r.coverage === 'covered');
  const canonGrounded = coveredRows.filter((r) => hasCanonCitation(r.citations_json)).length;
  const gatedRows = rows.filter((r) => r.gate_verdict !== null);
  const delegable = gatedRows.filter((r) => r.gate_verdict === 'delegable').length;

  return {
    total,
    decided,
    pending,
    delegated: delegatedRows.length,
    delegatedAudited,
    agreementRate: agreementTargets.length > 0 ? matched / agreementTargets.length : null,
    underspecified: underspecifiedRows.length,
    unreadableDeclarations,
    instructionGapRate: total > 0 ? underspecifiedRows.length / total : null,
    escalationRate: total > 0 ? escalations / total : null,
    citationResolutionRate: citationTotal > 0 ? citationResolved / citationTotal : null,
    canonGroundedRate: coveredRows.length > 0 ? canonGrounded / coveredRows.length : null,
    delegableRate: gatedRows.length > 0 ? delegable / gatedRows.length : null,
  };
}

/** 互換 API: 単一 DB の読み + 集計。**読み取り専用**（ensure・移行を行わない）。 */
export function getDoctrineAgreementDirect(
  db: Database,
  range: { readonly since?: string; readonly until?: string } = {},
): DoctrineAgreementMetrics {
  return aggregateDoctrineAgreement(fetchDoctrineAgreementRows(db, range));
}
