//
// ワーカー停止中（VS Code を閉じている間）に発生した git 操作を退避する JSONL spool。
// フックが追記し、ワーカーが定期的に drain する。
//
// フックは短命プロセスなので SQLite を直接開かない（ロック競合とスキーマ依存を避ける）。

import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { GitActivityInput } from './types';

/** ワークスペース直下の spool ファイルパス */
export function spoolPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.anytime', 'agent', 'git-activity-spool.jsonl');
}

/**
 * spool を読み出して削除する。
 *
 * **読む前に rename する。** 素朴に read → rmSync とすると、その間にフックが `appendFileSync`
 * した行が、DB にも spool にも残らないまま削除される（記録の完全消失）。rename は同一ディレクトリ内で
 * 原子的であり、以降の追記は新しい inode（元のパス）へ載るため、次回の drain で拾える。
 * drain は 3 秒間隔で回るため、この窓は放置すると高頻度で踏まれる。
 *
 * 壊れた行は捨てるが、`onError` へ内容を渡して黙って消さない。
 * 健全な行は取り込む（1 行の破損で全件を失わない）。
 */
export function drainSpool(
  path: string,
  onError: (message: string) => void = () => {},
): GitActivityInput[] {
  if (!existsSync(path)) return [];

  // PID ではなく randomUUID を使う（PID キーは prepared/committed が別プロセスで
  // 一致しなかった前例がある）。同時に複数の drain が走っても衝突しない。
  const draining = `${path}.draining-${randomUUID()}`;
  try {
    renameSync(path, draining);
  } catch (err) {
    // 他の drain が先に rename した等。取りこぼしではないので次回に回す。
    const reason = err instanceof Error ? err.message : String(err);
    onError(`[git-activity] spool の rename に失敗した (${reason}): ${path}`);
    return [];
  }

  const rows: GitActivityInput[] = [];
  try {
    for (const line of readFileSync(draining, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      try {
        rows.push(JSON.parse(trimmed) as GitActivityInput);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        onError(`[git-activity] spool の行を破棄した (${reason}): ${trimmed.slice(0, 200)}`);
      }
    }
  } finally {
    rmSync(draining, { force: true });
  }

  return rows;
}
