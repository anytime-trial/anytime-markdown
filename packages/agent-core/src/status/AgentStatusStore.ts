// status/AgentStatusStore.ts — node:sqlite で agent_sessions を読み書きする唯一の場所
//
// 本ファイルだけが node:sqlite を import する（SQLite アクセスの単一所有者）。ワーカープロセスが
// このストアを 1 インスタンス保持し、HTTP POST/GET を直列に処理する。reader/writer 競合は構造的に発生しない。
//
// 拡張ホスト node (v22) では node:sqlite が experimental だが、ワーカーを
// `--disable-warning=ExperimentalWarning` で起動して警告を抑止する（コード側では握らない）。

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  CREATE_AGENT_SESSIONS,
  agentSessionsDDL,
} from './agentStatusSchema';
import type {
  AgentSessionRow,
  CommitUpsertInput,
  EditUpsertInput,
  SummaryUpsertInput,
} from './types';

interface RawRow {
  session_id: string;
  editing: number;
  file: string;
  branch: string;
  workspace_path: string;
  session_edits: string;
  planned_edits: string;
  last_head: string | null;
  committed_count: number;
  last_commit_hash: string | null;
  last_commit_at: string | null;
  summary: string;
  summary_at: string | null;
  handoff_at: string | null;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** JSON 文字列を安全にパースし、配列でなければ空配列を返す */
function parseJsonArray<T>(raw: string): T[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch (err) {
    // 破損 JSON は空配列にフォールバック（CHECK json_valid で防がれるが読み取り側でも保険）
    console.error(`[agent-status] failed to parse JSON array: ${String(err)}`);
    return [];
  }
}

function toRow(r: RawRow): AgentSessionRow {
  return {
    sessionId: r.session_id,
    editing: r.editing === 1,
    file: r.file,
    branch: r.branch,
    workspacePath: r.workspace_path,
    sessionEdits: parseJsonArray(r.session_edits),
    plannedEdits: parseJsonArray(r.planned_edits),
    lastHead: r.last_head,
    committedCount: r.committed_count,
    lastCommit:
      r.last_commit_hash && r.last_commit_at
        ? { hash: r.last_commit_hash, timestamp: r.last_commit_at }
        : null,
    summary: r.summary,
    summaryAt: r.summary_at,
    handoffAt: r.handoff_at,
    updatedAt: r.updated_at,
  };
}

export class AgentStatusStore {
  private readonly db: DatabaseSync;
  private readonly dbPath: string;

  /**
   * @param dbPath DB ファイルのパス。`':memory:'` も可。親ディレクトリは自動作成する。
   */
  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.dbPath = dbPath;
    this.db = new DatabaseSync(dbPath);
    this.init();
  }

  private init(): void {
    // WAL: 単一 writer だが外部プロセスが同一ファイルを開く場合の保険。
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 3000');
    // 新規 DB はこの CREATE で最新スキーマになる。既存の旧スキーマ DB は no-op のため、
    // handoff_at 列の有無で旧スキーマを検出し 12-step 移行を走らせる。
    this.db.exec(CREATE_AGENT_SESSIONS);
    if (!this.hasColumn('agent_sessions', 'handoff_at')) {
      this.migrateToHandoffSchema();
    }
  }

  private hasColumn(table: string, column: string): boolean {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return rows.some((r) => r.name === column);
  }

  /**
   * summary を json_valid CHECK 付きにし handoff_at 列を加える 12-step 再作成移行。
   * 旧スキーマ（summary CHECK 無し・DEFAULT ''）からの一度きりの移行。空/不正な summary は
   * '{}' へサニタイズする（json_valid CHECK 違反を防ぐ）。移行前に `.bak` バックアップを取る。
   */
  private migrateToHandoffSchema(): void {
    if (this.dbPath !== ':memory:') {
      // WAL に滞留したコミット済みデータを .db 本体へ書き込んでからバックアップする
      // （.db だけのコピーでは WAL 分が欠落し不整合バックアップになる）。
      this.db.exec('PRAGMA wal_checkpoint(FULL)');
      copyFileSync(this.dbPath, `${this.dbPath}.bak`);
    }
    this.db.exec('PRAGMA foreign_keys = OFF');
    this.db.exec('BEGIN');
    try {
      this.db.exec(agentSessionsDDL('agent_sessions_new'));
      this.db.exec(`INSERT INTO agent_sessions_new
        (session_id, editing, file, branch, workspace_path, session_edits, planned_edits,
         last_head, committed_count, last_commit_hash, last_commit_at,
         summary, summary_at, handoff_at, updated_at)
        SELECT session_id, editing, file, branch, workspace_path, session_edits, planned_edits,
         last_head, committed_count, last_commit_hash, last_commit_at,
         CASE WHEN json_valid(summary) THEN summary ELSE '{}' END,
         summary_at, NULL, updated_at
        FROM agent_sessions`);
      this.db.exec('DROP TABLE agent_sessions');
      this.db.exec('ALTER TABLE agent_sessions_new RENAME TO agent_sessions');
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    } finally {
      // 失敗・成功いずれでも foreign_keys を必ず復帰する（ROLLBACK throw で取りこぼさない）。
      this.db.exec('PRAGMA foreign_keys = ON');
    }
  }

  /**
   * 編集状況を部分更新する。commit 系・summary 系の列は触らない。
   *
   * `undefined` のフィールドは既存値を保持する read-modify-write。ワーカーは単一プロセスで
   * POST を直列処理するため、read→write 間に他 writer は割り込まない。
   */
  upsertEditing(input: EditUpsertInput): void {
    const updatedAt = input.updatedAt ?? nowIso();
    const prev = this.queryOne(input.sessionId);

    const editing = input.editing ?? prev?.editing ?? false;
    const file = input.file ?? prev?.file ?? '';
    const branch = input.branch ?? prev?.branch ?? '';
    const workspacePath = input.workspacePath ?? prev?.workspacePath ?? '';

    let sessionEdits: AgentSessionRow['sessionEdits'] = input.clearEdits
      ? []
      : (prev?.sessionEdits ?? []);
    if (!input.clearEdits && input.appendEdit) {
      const next = [...sessionEdits];
      const idx = next.findIndex((e) => e.file === input.appendEdit!.file);
      if (idx >= 0) next[idx] = input.appendEdit;
      else next.push(input.appendEdit);
      sessionEdits = next;
    }

    const plannedEdits = input.clearEdits
      ? []
      : (input.plannedEdits ?? prev?.plannedEdits ?? []);

    const stmt = this.db.prepare(`
      INSERT INTO agent_sessions
        (session_id, editing, file, branch, workspace_path, session_edits, planned_edits, updated_at)
      VALUES
        ($sid, $editing, $file, $branch, $ws, $sedits, $pedits, $updatedAt)
      ON CONFLICT(session_id) DO UPDATE SET
        editing = excluded.editing,
        file = excluded.file,
        branch = excluded.branch,
        workspace_path = excluded.workspace_path,
        session_edits = excluded.session_edits,
        planned_edits = excluded.planned_edits,
        updated_at = excluded.updated_at
    `);
    stmt.run({
      $sid: input.sessionId,
      $editing: editing ? 1 : 0,
      $file: file,
      $branch: branch,
      $ws: workspacePath,
      $sedits: JSON.stringify(sessionEdits),
      $pedits: JSON.stringify(plannedEdits),
      $updatedAt: updatedAt,
    });
  }

  /** セッション行を削除する（deleteSessionFile 相当）。存在しなくてもエラーにしない。 */
  deleteSession(sessionId: string): void {
    this.db.prepare('DELETE FROM agent_sessions WHERE session_id = ?').run(sessionId);
  }

  /**
   * handoff payload（圧縮ステート JSON）と handoff_at のみ UPSERT する。
   * 編集系・コミット系の列は触らない。`summary` は json_valid である必要がある（CHECK で担保）。
   * 行が無い場合は最小行として作成する。
   */
  upsertSummary(input: SummaryUpsertInput): void {
    const updatedAt = input.updatedAt ?? nowIso();
    const handoffAt = input.handoffAt ?? nowIso();
    const stmt = this.db.prepare(`
      INSERT INTO agent_sessions
        (session_id, summary, handoff_at, updated_at)
      VALUES
        ($sid, $summary, $handoffAt, $updatedAt)
      ON CONFLICT(session_id) DO UPDATE SET
        summary = excluded.summary,
        handoff_at = excluded.handoff_at,
        updated_at = excluded.updated_at
    `);
    stmt.run({
      $sid: input.sessionId,
      $summary: input.summary,
      $handoffAt: handoffAt,
      $updatedAt: updatedAt,
    });
  }

  /**
   * コミット情報のみ UPSERT する。編集系・summary 系の列は触らない。
   * `last_head` を更新し、`committed_count` に `count` を加算、`last_commit_*` を上書きする。
   * 行が無い場合は editing=0 の最小行として作成する。
   */
  upsertCommit(input: CommitUpsertInput): void {
    const updatedAt = input.updatedAt ?? nowIso();
    const prev = this.queryOne(input.sessionId);

    // count===0 のシードでは last_commit_* を上書きしない（既存値を保持）。
    const hasCommit = input.count > 0 && !!input.commitHash && !!input.committedAt;
    const hash = hasCommit ? input.commitHash! : (prev?.lastCommit?.hash ?? null);
    const committedAt = hasCommit ? input.committedAt! : (prev?.lastCommit?.timestamp ?? null);

    const stmt = this.db.prepare(`
      INSERT INTO agent_sessions
        (session_id, last_head, committed_count, last_commit_hash, last_commit_at, updated_at)
      VALUES
        ($sid, $lastHead, $count, $hash, $committedAt, $updatedAt)
      ON CONFLICT(session_id) DO UPDATE SET
        last_head = excluded.last_head,
        committed_count = agent_sessions.committed_count + excluded.committed_count,
        last_commit_hash = excluded.last_commit_hash,
        last_commit_at = excluded.last_commit_at,
        updated_at = excluded.updated_at
    `);
    stmt.run({
      $sid: input.sessionId,
      $lastHead: input.lastHead,
      $count: input.count,
      $hash: hash,
      $committedAt: committedAt,
      $updatedAt: updatedAt,
    });
  }

  queryOne(sessionId: string): AgentSessionRow | null {
    const stmt = this.db.prepare('SELECT * FROM agent_sessions WHERE session_id = ?');
    const r = stmt.get(sessionId) as RawRow | undefined;
    return r ? toRow(r) : null;
  }

  queryAll(): AgentSessionRow[] {
    const stmt = this.db.prepare('SELECT * FROM agent_sessions ORDER BY updated_at DESC');
    const rows = stmt.all() as unknown as RawRow[];
    return rows.map(toRow);
  }

  close(): void {
    this.db.close();
  }
}
