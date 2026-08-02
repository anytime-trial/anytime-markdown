import * as fs from 'node:fs';
import * as path from 'node:path';

function resolveTrailHome(workspacePath?: string): string {
  const workspace = workspacePath ?? process.cwd();
  return process.env.TRAIL_HOME ?? path.join(workspace, '.anytime', 'trail');
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
