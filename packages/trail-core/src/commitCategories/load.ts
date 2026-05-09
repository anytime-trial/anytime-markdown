import fs from 'node:fs';
import path from 'node:path';
import type { CommitCategoriesFile } from './types';
import { DEFAULT_COMMIT_CATEGORIES } from './defaults';

/**
 * `<workspaceRoot>/.trail/commit-categories.json` を読み込み、
 * コミット種別 → カテゴリ番号 (0/1/2) の Map を返す。
 * ファイル不在・不正 JSON・entries 欠落時はデフォルトを返す。
 */
export function loadCommitCategories(workspaceRoot: string): ReadonlyMap<string, number> {
  const file = path.join(workspaceRoot, '.trail', 'commit-categories.json');
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    if (code === 'ENOENT') return DEFAULT_COMMIT_CATEGORIES;
    throw err;
  }

  let parsed: CommitCategoriesFile;
  try {
    parsed = JSON.parse(raw) as CommitCategoriesFile;
  } catch {
    return DEFAULT_COMMIT_CATEGORIES;
  }

  if (!parsed.entries || typeof parsed.entries !== 'object') {
    return DEFAULT_COMMIT_CATEGORIES;
  }

  const map = new Map<string, number>();
  for (const [prefix, entry] of Object.entries(parsed.entries)) {
    const cat = entry?.category;
    if (typeof cat !== 'number' || !Number.isInteger(cat) || cat < 0 || cat > 2) continue;
    map.set(prefix.toLowerCase(), cat);
  }
  return map;
}
