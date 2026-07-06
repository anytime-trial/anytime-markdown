/**
 * get_verification_status — verification.db（検証実施台帳）の読み取り。
 * 台帳は「何が実施済みか」を答えるだけで実行を決めない。判定不能・記録なしは常に needsRun へ倒す。
 * スキーマ正本は scripts/verification-db.mjs（本ファイルは SELECT のみでスキーマを作成しない）。
 */

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

/** scripts/verification-db.mjs の VERIFICATION_KINDS のミラー（reader は .mjs を import できないため）。 */
export const VERIFICATION_KINDS = ['unit', 'build', 'next-build', 'typecheck', 'lint', 'e2e', 'manual'] as const;
export type VerificationKind = (typeof VERIFICATION_KINDS)[number];

export const GetVerificationStatusInputSchema = z.object({
  package: z.string().describe('Target package name recorded by run-verified (e.g. markdown-viewer)'),
  kinds: z.array(z.enum(VERIFICATION_KINDS)).optional().describe('Kinds to check (default: all 7)'),
  workspacePath: z.string().optional().describe('Workspace root (default: cwd)'),
});

export type GetVerificationStatusInput = z.infer<typeof GetVerificationStatusInputSchema>;

interface VerifiedEntry {
  status: 'pass';
  startedAt: string;
  command: string;
}

export interface VerificationStatusResult {
  commitHash: string | null;
  treeState: 'clean' | 'dirty' | null;
  verified: Record<string, VerifiedEntry>;
  needsRun: string[];
  reason?: 'no-db' | 'no-table' | 'dirty-tree';
}

/**
 * scripts/verification-db.mjs の PROTECTED_ROOT_PATTERNS のミラー（reader は .mjs を import できないため）。
 * node:sqlite は WAL モード DB を readOnly で開いても -wal/-shm を新規作成するため、読み取り専用ツールでも保護領域ガードが必要。
 */
const PROTECTED_ROOT_PATTERNS = [/\/vscode-server\//, /\/\.vscode\b/, /\/\.claude\b/];

function resolveDbPath(workspacePath: string): string {
  const home = process.env.TRAIL_HOME ?? path.join(workspacePath, '.anytime', 'trail');
  if (PROTECTED_ROOT_PATTERNS.some((p) => p.test(home))) {
    throw new Error(
      `[get_verification_status] refusing protected path "${home}". Set TRAIL_HOME to a workspace-local dir or pass workspacePath.`,
    );
  }
  return path.join(home, 'db', 'verification.db');
}

export async function handleGetVerificationStatus(
  input: GetVerificationStatusInput,
): Promise<VerificationStatusResult> {
  const ws = input.workspacePath ?? process.cwd();
  const kinds: string[] = input.kinds ? [...input.kinds] : [...VERIFICATION_KINDS];
  const dbPath = resolveDbPath(ws);
  if (!fs.existsSync(dbPath)) {
    return { commitHash: null, treeState: null, verified: {}, needsRun: kinds, reason: 'no-db' };
  }

  const { stdout: head } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ws });
  const { stdout: porcelain } = await execFileAsync('git', ['status', '--porcelain'], { cwd: ws });
  const commitHash = head.trim();
  const treeState: 'clean' | 'dirty' = porcelain.trim() === '' ? 'clean' : 'dirty';
  if (treeState === 'dirty') {
    return { commitHash, treeState, verified: {}, needsRun: kinds, reason: 'dirty-tree' };
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  // run-verified.mjs (writer) の書込直後に読むと SQLITE_BUSY で即失敗し得るため待機を入れる（doc-core と同値）。
  db.exec('PRAGMA busy_timeout = 5000');
  try {
    const rows = db
      .prepare(
        `SELECT kind, command, started_at FROM verification_runs
         WHERE package = ? AND code_state_hash = ? AND status = 'pass' ORDER BY started_at`,
      )
      .all(input.package, commitHash) as Array<{ kind: string; command: string; started_at: string }>;
    const verified: Record<string, VerifiedEntry> = {};
    for (const row of rows) {
      if (!kinds.includes(row.kind)) continue;
      verified[row.kind] = { status: 'pass', startedAt: row.started_at, command: row.command }; // 昇順走査＝最後が最新
    }
    return { commitHash, treeState, verified, needsRun: kinds.filter((k) => !(k in verified)) };
  } catch (err) {
    // instanceof Error は jest の VM コンテキスト（別 realm）で node:sqlite ネイティブ例外に false を返すため message で判定する。
    const message = (err as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message.includes('no such table')) {
      return { commitHash, treeState, verified: {}, needsRun: kinds, reason: 'no-table' };
    }
    throw err;
  } finally {
    db.close();
  }
}
