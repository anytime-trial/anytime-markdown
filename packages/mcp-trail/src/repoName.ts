import * as path from 'node:path';
import type { Database } from 'better-sqlite3';
import { all } from './sqlite/sqlJsUtil';

export function resolveRepoName(
  opts: { repoName?: string; workspacePath?: string },
  db: Database,
): string {
  if (opts.repoName) {
    return opts.repoName;
  }

  if (process.env.TRAIL_REPO_NAME) {
    return process.env.TRAIL_REPO_NAME;
  }

  try {
    const rows = all<{ repo_name: string }>(
      db,
      'SELECT DISTINCT repo_name FROM current_code_graphs',
    );

    if (rows.length === 1) {
      return rows[0].repo_name;
    }

    if (rows.length > 1) {
      const names = rows.map((r) => r.repo_name);
      throw new Error(`Multiple repos found, specify repoName: [${names.join(', ')}]`);
    }
    // 0 件 → 次の候補へ
  } catch (e) {
    // SQLite エラー (テーブル不在) は無視して次の候補へ
    // 独自 Error（Multiple repos）はそのまま再 throw
    if (e instanceof Error && e.message.startsWith('Multiple repos found')) {
      throw e;
    }
  }

  return path.basename(opts.workspacePath ?? process.cwd());
}
