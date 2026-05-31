import fs from 'node:fs';
import path from 'node:path';
import type { CommitCategoriesFile } from './types';
import { DEFAULT_COMMIT_CATEGORIES, DEFAULT_COMMIT_CATEGORY_LABELS } from './defaults';

/**
 * `<workspaceRoot>/.anytime/commit-categories.json` を読み込み、
 * コミット種別 → カテゴリ番号 (0/1/2) の Map を返す。
 * ファイル不在・不正 JSON・entries 欠落時はデフォルトを返す。
 */
export function loadCommitCategories(workspaceRoot: string): ReadonlyMap<string, number> {
  return loadCommitCategoriesFromFile(path.join(workspaceRoot, '.anytime', 'commit-categories.json'));
}

/** 完全なファイルパスから commit categories を読む。不在は ENOENT でデフォルト、他例外は throw。 */
export function loadCommitCategoriesFromFile(file: string): ReadonlyMap<string, number> {
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
    if (typeof cat !== 'number' || !Number.isInteger(cat) || cat < 0) continue;
    map.set(prefix.toLowerCase(), cat);
  }
  return map;
}

export function loadCommitCategoryLabels(workspaceRoot: string): ReadonlyMap<number, string> {
  return loadCommitCategoryLabelsFromFile(path.join(workspaceRoot, '.anytime', 'commit-categories.json'));
}

/** 完全なファイルパスから commit category ラベルを読む。不在・不正時はデフォルト。 */
export function loadCommitCategoryLabelsFromFile(file: string): ReadonlyMap<number, string> {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as CommitCategoriesFile;
    if (!parsed.categories || typeof parsed.categories !== 'object') return DEFAULT_COMMIT_CATEGORY_LABELS;
    const map = new Map<number, string>();
    for (const [k, v] of Object.entries(parsed.categories)) {
      const n = Number(k);
      if (Number.isInteger(n) && typeof v === 'string' && v.length > 0) map.set(n, v);
    }
    return map.size > 0 ? map : DEFAULT_COMMIT_CATEGORY_LABELS;
  } catch {
    return DEFAULT_COMMIT_CATEGORY_LABELS;
  }
}
