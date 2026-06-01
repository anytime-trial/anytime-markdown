// status/AgentStatusStore.ts — node:sqlite で agent_sessions を読み書きする唯一の場所
//
// 本ファイルだけが node:sqlite を import する（SQLite アクセスの単一所有者）。ワーカープロセスが
// このストアを 1 インスタンス保持し、HTTP POST/GET を直列に処理する。reader/writer 競合は構造的に発生しない。
//
// 拡張ホスト node (v22) では node:sqlite が experimental だが、ワーカーを
// `--disable-warning=ExperimentalWarning` で起動して警告を抑止する（コード側では握らない）。

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  CREATE_AGENT_SESSIONS,
} from './agentStatusSchema';
import type {
  AgentSessionRow,
  CommitUpsertInput,
  EditUpsertInput,
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
    updatedAt: r.updated_at,
  };
}

export class AgentStatusStore {
  private readonly db: DatabaseSync;

  /**
   * @param dbPath DB ファイルのパス。`':memory:'` も可。親ディレクトリは自動作成する。
   */
  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.init();
  }

  private init(): void {
    // WAL: 単一 writer だが外部プロセスが同一ファイルを開く場合の保険。
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 3000');
    this.db.exec(CREATE_AGENT_SESSIONS);
  }

  /** 編集状況のみ UPSERT する。commit 系・summary 系の列は触らない。 */
  upsertEditing(input: EditUpsertInput): void {
    const updatedAt = input.updatedAt ?? nowIso();
    const file = input.file ?? '';
    const branch = input.branch ?? '';
    const workspacePath = input.workspacePath ?? '';
    const sessionEdits = JSON.stringify(input.sessionEdits ?? []);
    const plannedEdits = JSON.stringify(input.plannedEdits ?? []);
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
      $editing: input.editing ? 1 : 0,
      $file: file,
      $branch: branch,
      $ws: workspacePath,
      $sedits: sessionEdits,
      $pedits: plannedEdits,
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
      $hash: input.commitHash,
      $committedAt: input.committedAt,
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
