import fs from 'node:fs';
import path from 'node:path';
import type { Ignore } from 'ignore';

/**
 * analyze-exclude の設定に関係なく常に解析対象から外すディレクトリ名。
 * TypeScript 解析器（ProjectAnalyzer / TypeScriptAdapter）が `node_modules` を
 * ハードコード除外しているのに合わせる。既存ワークスペースの analyze-exclude は
 * seed 済みで既定の変更が届かないため、設定側だけでは塞げない。
 */
const ALWAYS_EXCLUDED_DIRS = new Set(['node_modules']);

/** repo ルート配下の .py / .pyi を repo 相対 POSIX パスで列挙する（exclude で除外）。 */
export function discoverPythonFiles(root: string, exclude?: Ignore): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (exclude?.ignores(rel)) continue;
      if (entry.isDirectory()) {
        if (ALWAYS_EXCLUDED_DIRS.has(entry.name)) continue;
        walk(abs);
      } else if (/\.pyi?$/.test(entry.name)) {
        out.push(rel);
      }
    }
  };
  walk(root);
  // 走査順がそのままコードグラフのノード・エッジ順として永続化されるため、
  // 比較はコードユニット順に固定する（localeCompare は既定ロケール依存で、
  // 同じリポジトリでも実行環境が変わると並びが変わる）。
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
