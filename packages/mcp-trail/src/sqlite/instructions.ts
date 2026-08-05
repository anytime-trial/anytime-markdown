// Flight Record: 指示台帳（instructions / instruction_sessions）への直書き。
// TrailDataServer を経由しないのは、宣言がセッション開始直後に走り、
// デーモン未起動でも記録が落ちてはならないため（doctrine_judgments と同方針）。

import { randomUUID } from 'node:crypto';
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
function ensureTables(db: Database): void {
  db.exec(CREATE_INSTRUCTIONS);
  db.exec(CREATE_INSTRUCTION_SESSIONS);
  for (const idx of CREATE_INSTRUCTION_INDEXES) db.exec(idx);
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
    .prepare('SELECT summary FROM instructions WHERE id = ?')
    .get(input.instructionId) as { summary: string } | undefined;
  if (row === undefined) {
    // 存在しない ID を黙って新規作成しない — 取り違えた宣言がそのまま台帳に増え、
    // 継続したはずのセッションが元の指示から抜ける
    throw new Error(`instruction not found: ${input.instructionId}`);
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

/** 未完了の指示（継続宣言の候補）。started_at 降順。 */
export function listOpenInstructionsDirect(
  db: Database,
  workspacePath: string,
  limit: number,
): OpenInstructionRow[] {
  ensureTables(db);
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
