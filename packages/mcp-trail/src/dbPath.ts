import * as fs from 'node:fs';
import * as path from 'node:path';

/** ワークスペースルートの解決元。cwd 由来かどうかを利用者に見せるために持つ。 */
export type WorkspaceOrigin = 'argument' | 'env' | 'cwd';

export interface ResolvedWorkspace {
  readonly path: string;
  readonly origin: WorkspaceOrigin;
}

/**
 * ワークスペースルートの解決（本パッケージ唯一の入口）。
 *
 * 優先順は `ツール引数 > TRAIL_WORKSPACE_PATH > process.cwd()`。各ツールが個別に
 * `process.env` を読むと優先順が実装ごとにずれるため、ここへ集約する。
 *
 * cwd へ落ちた場合は **stderr へ警告する**。cwd 基準の解決は、別ワークスペースで
 * 起動されたときに他プロジェクトの DB を掴み得るため、暗黙のまま通さない
 * （MCP stdio はプロトコルに stdout を使うので、警告は必ず stderr へ出す）。
 */
export function resolveWorkspacePath(workspacePath?: string): ResolvedWorkspace {
  if (workspacePath !== undefined && workspacePath !== '') {
    return { path: workspacePath, origin: 'argument' };
  }
  const fromEnv = process.env.TRAIL_WORKSPACE_PATH;
  if (fromEnv !== undefined && fromEnv !== '') {
    return { path: fromEnv, origin: 'env' };
  }
  const cwd = process.cwd();
  console.error(
    `[mcp-trail] workspace root fell back to cwd (${cwd}). ` +
      'Pass workspacePath or set TRAIL_WORKSPACE_PATH to target a specific workspace.',
  );
  return { path: cwd, origin: 'cwd' };
}

function resolveTrailHome(workspacePath?: string): string {
  const fromEnv = process.env.TRAIL_HOME;
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  return path.join(resolveWorkspacePath(workspacePath).path, '.anytime', 'trail');
}

export function resolveDbPath(opts: { workspacePath?: string }): string {
  const dbPath = path.join(resolveTrailHome(opts.workspacePath), 'db', 'trail.db');

  if (!fs.existsSync(dbPath)) {
    throw new Error(`trail.db not found at ${dbPath}`);
  }
  return dbPath;
}

/**
 * memory-core.db の解決。**不在なら throw し、ディレクトリも DB も作らない**。
 *
 * `openMemoryCoreDb` は渡されたパスに対して `mkdirSync` + マイグレーションを実行する。
 * 解決をそちらへ委ねると、cwd がずれた場所（worktree 等）から呼んだときにスキーマ完備の
 * 空 DB が生まれ、以降のクエリが一律 0 件を返す。呼び出し側からは「該当なし」と区別が
 * 付かない偽陰性になるため、ここは意図的に fail-closed とする。
 */
export function resolveMemoryDbPath(opts: { workspacePath?: string }): string {
  const dbPath = path.join(resolveTrailHome(opts.workspacePath), 'db', 'memory-core.db');

  if (!fs.existsSync(dbPath)) {
    throw new Error(`memory-core.db not found at ${dbPath}`);
  }
  return dbPath;
}

/**
 * Flight Record 直書き（record_instruction）用の memory-core.db 解決。
 *
 * 読み取り系の resolveMemoryDbPath と異なり、**同ディレクトリに trail.db が実在する
 * 既存ワークスペースに限り、memory-core.db 未作成でもパスを返す**（作成は
 * openMemoryDb の readwrite が行う）。拡張が memory-core.db を作るより先に
 * セッション開始の宣言が届くと記録が落ちる、という移設起因の隙間を塞ぐ。
 * trail.db も無いディレクトリは未初期化ワークスペースなので従来どおり throw する
 * （場所違いに空 DB を作る偽陰性を防ぐ fail-closed は維持）。
 */
export function resolveMemoryDbPathForWrite(opts: { workspacePath?: string }): string {
  const dbDir = path.join(resolveTrailHome(opts.workspacePath), 'db');
  const dbPath = path.join(dbDir, 'memory-core.db');
  if (!fs.existsSync(dbPath) && !fs.existsSync(path.join(dbDir, 'trail.db'))) {
    throw new Error(`memory-core.db not found at ${dbPath} (and no trail.db beside it — workspace not initialized)`);
  }
  return dbPath;
}
