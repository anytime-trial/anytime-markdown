import fs from 'node:fs';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';

/**
 * `<workspaceRoot>/.trail/analyze-exclude` を読み込み、`.gitignore` 互換の
 * Ignore インスタンスを返す。
 *
 * - ファイル不在 → 何もマッチしない空 Ignore を返す
 * - 文法は `.gitignore` と同等（`!` 否定 / `/` 先頭固定 / `*.ext` ファイル glob /
 *   `dir/` ディレクトリ専用 / `**` 再帰、コメント `#` と空行）
 */
export function loadAnalyzeExclude(workspaceRoot: string): Ignore {
  const file = path.join(workspaceRoot, '.trail', 'analyze-exclude');
  const ig = ignore();
  try {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.trim() !== '') {
      ig.add(content);
    }
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    if (code === 'ENOENT') return ig;
    throw err;
  }
  return ig;
}
