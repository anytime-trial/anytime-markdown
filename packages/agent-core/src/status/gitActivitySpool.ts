//
// ワーカー停止中（VS Code を閉じている間）に発生した git 操作を退避する JSONL spool。
// フックが追記し、ワーカーが起動時に drain する。
//
// フックは短命プロセスなので SQLite を直接開かない（ロック競合とスキーマ依存を避ける）。

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { GitActivityInput } from './types';

/** ワークスペース直下の spool ファイルパス */
export function spoolPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.anytime', 'agent', 'git-activity-spool.jsonl');
}

/**
 * spool を読み出して削除する。
 *
 * 壊れた行は捨てるが、`onError` へ内容を渡して黙って消さない。
 * 健全な行は取り込む（1 行の破損で全件を失わない）。
 */
export function drainSpool(
  path: string,
  onError: (message: string) => void = () => {},
): GitActivityInput[] {
  if (!existsSync(path)) return [];

  const raw = readFileSync(path, 'utf8');
  const rows: GitActivityInput[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      rows.push(JSON.parse(trimmed) as GitActivityInput);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      onError(`[git-activity] spool の行を破棄した (${reason}): ${trimmed.slice(0, 200)}`);
    }
  }

  rmSync(path, { force: true });
  return rows;
}
