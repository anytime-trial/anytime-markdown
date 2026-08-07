// Flight Record: 指示台帳（instructions / instruction_sessions）への直書き。
// 保存先は memory-core.db（2026-08-07 に trail.db から移設。openMemoryDb で開く）。
// TrailDataServer を経由しないのは、宣言がセッション開始直後に走り、
// デーモン未起動でも記録が落ちてはならないため（doctrine_judgments と同方針）。

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Database } from 'better-sqlite3';
import {
  CREATE_INSTRUCTIONS,
  CREATE_INSTRUCTION_SESSIONS,
  CREATE_INSTRUCTION_INDEXES,
} from '@anytime-markdown/trail-core';

export interface OpenInstructionInput {
  readonly sessionId: string;
  readonly summary: string;
  readonly originPrompt?: string;
  readonly workspacePath: string;
  readonly startedAt?: string;
}

export interface ContinueInstructionInput {
  readonly sessionId: string;
  readonly instructionId: string;
  readonly declaredAt?: string;
  /** 宣言側のワークスペース。対象指示と不一致なら拒否する。 */
  readonly workspacePath?: string;
}

export interface InstructionDeclarationResult {
  readonly instructionId: string;
  readonly sequence: number;
  readonly summary: string;
}

export interface OpenInstructionRow {
  readonly id: string;
  readonly summary: string;
  readonly originPrompt: string;
  readonly startedAt: string;
  readonly workspaceName: string;
  readonly sessionCount: number;
}

/** 既存 DB に台帳が無い場合に備えて冪等に作る（拡張の migration より先に宣言が届きうる）。 */
export function ensureInstructionTables(db: Database): void {
  db.exec(CREATE_INSTRUCTIONS);
  db.exec(CREATE_INSTRUCTION_SESSIONS);
  for (const idx of CREATE_INSTRUCTION_INDEXES) db.exec(idx);
}
const ensureTables = ensureInstructionTables;

/**
 * **副作用: 検証通過時に trail.db 側の instructions / instruction_sessions を退避テーブルへ
 * 複製した上で DROP する。**
 *
 * 台帳移設（trail.db → memory-core.db・2026-08-07）の遅延移行。doctrine_judgments と同じく
 * デーモン非依存で mcp-trail 自身が行う — 旧指示が trail.db に残ったままだと、移設後の
 * list_open_instructions から消え、continue も成立しない。record_instruction の書込経路が
 * ensure 直後に冪等実行する（読み取り経路では起動しない）。
 *
 * コピー〜検証〜退避〜DROP は BEGIN IMMEDIATE の単一トランザクションで直列化する
 * （並行セッションの同時宣言は常態。存在チェックもロック取得後に行い TOCTOU を避ける）。
 * 検証は id / session_id のアンチ結合。id は UUID で「同一 id = 同一宣言」のため
 * 衝突時の本体マージは不要（INSERT OR IGNORE の先着が正）。
 */
export function destructiveMigrateInstructionTablesFromTrailDb(
  db: Database,
  trailDbPath: string,
): { status: 'migrated' | 'verification_failed'; copiedRows: number; missingRows: number } | null {
  if (!fs.existsSync(trailDbPath)) return null;
  db.prepare(`ATTACH DATABASE ? AS trail`).run(trailDbPath);
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      const present = new Set(
        (
          db
            .prepare(
              `SELECT name FROM trail.sqlite_master WHERE type = 'table' AND name IN ('instructions', 'instruction_sessions')`,
            )
            .all() as Array<{ name: string }>
        ).map((r) => r.name),
      );
      if (present.size === 0) {
        db.exec('COMMIT');
        return null;
      }
      let copiedRows = 0;
      if (present.has('instructions')) {
        copiedRows += db
          .prepare(
            `INSERT OR IGNORE INTO instructions (id, workspace_path, workspace_name, summary, origin_prompt, origin_session_id, started_at, closed_at, created_at, updated_at)
             SELECT id, workspace_path, workspace_name, summary, origin_prompt, origin_session_id, started_at, closed_at, created_at, updated_at FROM trail.instructions`,
          )
          .run().changes;
      }
      if (present.has('instruction_sessions')) {
        copiedRows += db
          .prepare(
            `INSERT OR IGNORE INTO instruction_sessions (session_id, instruction_id, sequence, declared_at)
             SELECT session_id, instruction_id, sequence, declared_at FROM trail.instruction_sessions`,
          )
          .run().changes;
      }
      let missingRows = 0;
      if (present.has('instructions')) {
        missingRows += Number(
          (db
            .prepare(
              `SELECT COUNT(*) c FROM trail.instructions t WHERE NOT EXISTS (SELECT 1 FROM instructions m WHERE m.id = t.id)`,
            )
            .get() as { c: number }).c,
        );
      }
      if (present.has('instruction_sessions')) {
        missingRows += Number(
          (db
            .prepare(
              `SELECT COUNT(*) c FROM trail.instruction_sessions t WHERE NOT EXISTS (SELECT 1 FROM instruction_sessions m WHERE m.session_id = t.session_id)`,
            )
            .get() as { c: number }).c,
        );
      }
      if (missingRows > 0) {
        console.error(
          `[${new Date().toISOString()}] [ERROR] [mcp-trail] instruction tables migration verification failed (rows not preserved: ${missingRows}); keeping trail-side tables`,
        );
        db.exec('COMMIT');
        return { status: 'verification_failed', copiedRows, missingRows };
      }
      for (const table of ['instruction_sessions', 'instructions'] as const) {
        if (!present.has(table)) continue;
        const backup = `${table}__pre_move_backup`;
        const trailCount = Number((db.prepare(`SELECT COUNT(*) c FROM trail.${table}`).get() as { c: number }).c);
        const backupExists =
          db.prepare(`SELECT 1 FROM trail.sqlite_master WHERE type = 'table' AND name = ?`).get(backup) !== undefined;
        let backedUp: number;
        if (backupExists) {
          backedUp = db.prepare(`INSERT INTO trail.${backup} SELECT * FROM trail.${table}`).run().changes;
        } else {
          db.exec(`CREATE TABLE trail.${backup} AS SELECT * FROM trail.${table}`);
          backedUp = Number((db.prepare(`SELECT COUNT(*) c FROM trail.${backup}`).get() as { c: number }).c);
        }
        if (backedUp !== trailCount) {
          console.error(
            `[${new Date().toISOString()}] [ERROR] [mcp-trail] instruction tables migration: backup row count mismatch for ${table} (backup=${backedUp} trail=${trailCount}); rolling back`,
          );
          db.exec('ROLLBACK');
          return { status: 'verification_failed', copiedRows: 0, missingRows: trailCount };
        }
        db.exec(`DROP TABLE IF EXISTS trail.${table}`);
      }
      db.exec('COMMIT');
      return { status: 'migrated', copiedRows, missingRows: 0 };
    } catch (e) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ROLLBACK 失敗は元例外を優先して伝播させる
      }
      throw e;
    }
  } finally {
    db.exec('DETACH DATABASE trail');
  }
}

/**
 * 書込ツール共通の前処理: memory-core.db 側に台帳を冪等作成し、trail.db に旧台帳が
 * 残っていれば遅延移行する。移行失敗は宣言そのものを止めない（error ログの上で続行。
 * doctrine_judgments と同方針・次回呼び出しで冪等に再試行される）。
 */
export function ensureAndMigrateInstructionTables(db: Database, memoryDbPath: string): void {
  ensureInstructionTables(db);
  try {
    destructiveMigrateInstructionTablesFromTrailDb(db, path.join(path.dirname(memoryDbPath), 'trail.db'));
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] [ERROR] [mcp-trail] instruction tables migration failed (declarations continue to memory-core.db; will retry on next call)`,
      err instanceof Error ? err.stack : err,
    );
  }
}

/** sequence は指示内の最大 + 1。所属替えは上書き（1 セッションは 1 指示にしか属さない）。 */
function linkSession(db: Database, instructionId: string, sessionId: string, declaredAt: string): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(sequence), 0) AS max_seq FROM instruction_sessions WHERE instruction_id = ?')
    .get(instructionId) as { max_seq: number } | undefined;
  const sequence = (row?.max_seq ?? 0) + 1;
  db.prepare(
    `INSERT INTO instruction_sessions (session_id, instruction_id, sequence, declared_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       instruction_id = excluded.instruction_id,
       sequence = excluded.sequence,
       declared_at = excluded.declared_at`,
  ).run(sessionId, instructionId, sequence, declaredAt);
  return sequence;
}

export function openInstructionDirect(db: Database, input: OpenInstructionInput): InstructionDeclarationResult {
  ensureTables(db);
  const now = new Date().toISOString();
  const startedAt = input.startedAt ?? now;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO instructions (
       id, workspace_path, workspace_name, summary, origin_prompt, origin_session_id,
       started_at, closed_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    id,
    input.workspacePath,
    path.basename(input.workspacePath),
    input.summary,
    input.originPrompt ?? '',
    input.sessionId,
    startedAt,
    now,
    now,
  );
  const sequence = linkSession(db, id, input.sessionId, startedAt);
  return { instructionId: id, sequence, summary: input.summary };
}

export function continueInstructionDirect(
  db: Database,
  input: ContinueInstructionInput,
): InstructionDeclarationResult {
  ensureTables(db);
  const row = db
    .prepare('SELECT summary, workspace_path FROM instructions WHERE id = ?')
    .get(input.instructionId) as { summary: string; workspace_path: string } | undefined;
  if (row === undefined) {
    // 存在しない ID を黙って新規作成しない — 取り違えた宣言がそのまま台帳に増え、
    // 継続したはずのセッションが元の指示から抜ける
    throw new Error(`instruction not found: ${input.instructionId}`);
  }
  // ワークスペースをまたぐ継続は拒否する。通すとそのセッションの時間・トークン・コミットが
  // 別ワークスペースの行へ合算され、一覧のワークスペース絞り込みでも落とせない。
  if (
    input.workspacePath !== undefined &&
    input.workspacePath !== '' &&
    row.workspace_path !== input.workspacePath
  ) {
    throw new Error(
      `instruction ${input.instructionId} belongs to another workspace (${row.workspace_path})`,
    );
  }
  const declaredAt = input.declaredAt ?? new Date().toISOString();
  const sequence = linkSession(db, input.instructionId, input.sessionId, declaredAt);
  return { instructionId: input.instructionId, sequence, summary: row.summary };
}

export function closeInstructionDirect(db: Database, instructionId: string): { instructionId: string; closedAt: string } {
  ensureTables(db);
  const closedAt = new Date().toISOString();
  const result = db
    .prepare('UPDATE instructions SET closed_at = ?, updated_at = ? WHERE id = ?')
    .run(closedAt, closedAt, instructionId);
  if (result.changes === 0) throw new Error(`instruction not found: ${instructionId}`);
  return { instructionId, closedAt };
}

/**
 * 未完了の指示（継続宣言の候補）。started_at 降順。
 *
 * **読み取り経路では ensure（CREATE TABLE）を呼ばない** — readonly 接続かつ台帳未作成の
 * memory-core.db で「attempt to write a readonly database」になる（2026-08-07 実測。
 * trail.db 時代はテーブル常在で IF NOT EXISTS が無書き込みのため露見しなかった）。
 * テーブル不在は「宣言ゼロ」として空配列に縮退する。
 */
export function listOpenInstructionsDirect(
  db: Database,
  workspacePath: string,
  limit: number,
): OpenInstructionRow[] {
  const hasTable =
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'instructions'`).get() !== undefined;
  if (!hasTable) return [];
  const rows = db
    .prepare(
      `SELECT i.id, i.summary, i.origin_prompt, i.started_at, i.workspace_name,
              (SELECT COUNT(*) FROM instruction_sessions s WHERE s.instruction_id = i.id) AS session_count
       FROM instructions i
       WHERE i.closed_at IS NULL AND (? = '' OR i.workspace_path = ?)
       ORDER BY i.started_at DESC LIMIT ?`,
    )
    .all(workspacePath, workspacePath, limit) as Array<{
      id: string;
      summary: string;
      origin_prompt: string;
      started_at: string;
      workspace_name: string;
      session_count: number;
    }>;
  return rows.map((r) => ({
    id: r.id,
    summary: r.summary,
    originPrompt: r.origin_prompt,
    startedAt: r.started_at,
    workspaceName: r.workspace_name,
    sessionCount: r.session_count,
  }));
}
