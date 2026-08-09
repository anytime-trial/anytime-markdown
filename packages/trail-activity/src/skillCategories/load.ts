import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SKILL_CATEGORIES, DEFAULT_SKILL_CATEGORY_LABELS } from './defaults';
import type { SkillCategoriesFile } from './types';

export function loadSkillCategories(workspaceRoot: string): ReadonlyMap<string, number> {
  return loadSkillCategoriesFromFile(path.join(workspaceRoot, '.anytime', 'skill-categories.json'));
}

/** 完全なファイルパスから skill categories を読む。不在は ENOENT でデフォルト、他例外は throw。 */
export function loadSkillCategoriesFromFile(file: string): ReadonlyMap<string, number> {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    // ENOENT のみデフォルト。EACCES/EIO 等の FS エラーを握りつぶさず throw する
    // (loadCommitCategoriesFromFile と同じ方針)。
    const code = (err as { code?: unknown } | null)?.code;
    if (code === 'ENOENT') return DEFAULT_SKILL_CATEGORIES;
    throw err;
  }

  let parsed: SkillCategoriesFile;
  try {
    parsed = JSON.parse(raw) as SkillCategoriesFile;
  } catch {
    return DEFAULT_SKILL_CATEGORIES;
  }

  if (!parsed.entries || typeof parsed.entries !== 'object') return DEFAULT_SKILL_CATEGORIES;
  const map = new Map<string, number>();
  for (const [key, entry] of Object.entries(parsed.entries)) {
    // entry が null でも TypeError にならないよう optional chaining を使う。
    if (typeof entry?.category === 'number') map.set(key, entry.category);
  }
  return map.size > 0 ? map : DEFAULT_SKILL_CATEGORIES;
}

export function loadSkillCategoryLabels(workspaceRoot: string): ReadonlyMap<number, string> {
  return loadSkillCategoryLabelsFromFile(path.join(workspaceRoot, '.anytime', 'skill-categories.json'));
}

/** 完全なファイルパスから skill category ラベルを読む。不在・不正時はデフォルト。 */
export function loadSkillCategoryLabelsFromFile(file: string): ReadonlyMap<number, string> {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as SkillCategoriesFile;
    if (!parsed.categories || typeof parsed.categories !== 'object') return DEFAULT_SKILL_CATEGORY_LABELS;
    const map = new Map<number, string>();
    for (const [k, v] of Object.entries(parsed.categories)) {
      const n = Number(k);
      if (Number.isInteger(n) && typeof v === 'string' && v.length > 0) map.set(n, v);
    }
    return map.size > 0 ? map : DEFAULT_SKILL_CATEGORY_LABELS;
  } catch {
    return DEFAULT_SKILL_CATEGORY_LABELS;
  }
}
