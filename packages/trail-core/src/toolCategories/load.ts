import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_TOOL_CATEGORIES, DEFAULT_TOOL_CATEGORY_LABELS } from './defaults';
import type { ToolCategoriesFile } from './types';

export function loadToolCategories(workspaceRoot: string): ReadonlyMap<string, number> {
  return loadToolCategoriesFromFile(path.join(workspaceRoot, '.anytime', 'tool-categories.json'));
}

/** 完全なファイルパスから tool categories を読む。不在・不正時はデフォルト。 */
export function loadToolCategoriesFromFile(file: string): ReadonlyMap<string, number> {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as ToolCategoriesFile;
    if (!parsed.entries || typeof parsed.entries !== 'object') return DEFAULT_TOOL_CATEGORIES;
    const map = new Map<string, number>();
    for (const [key, entry] of Object.entries(parsed.entries)) {
      if (typeof entry.category === 'number') map.set(key, entry.category);
    }
    return map.size > 0 ? map : DEFAULT_TOOL_CATEGORIES;
  } catch {
    return DEFAULT_TOOL_CATEGORIES;
  }
}

export function loadToolCategoryLabels(workspaceRoot: string): ReadonlyMap<number, string> {
  return loadToolCategoryLabelsFromFile(path.join(workspaceRoot, '.anytime', 'tool-categories.json'));
}

/** 完全なファイルパスから tool category ラベルを読む。不在・不正時はデフォルト。 */
export function loadToolCategoryLabelsFromFile(file: string): ReadonlyMap<number, string> {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as ToolCategoriesFile;
    if (!parsed.categories || typeof parsed.categories !== 'object') return DEFAULT_TOOL_CATEGORY_LABELS;
    const map = new Map<number, string>();
    for (const [k, v] of Object.entries(parsed.categories)) {
      const n = Number(k);
      if (Number.isInteger(n) && typeof v === 'string' && v.length > 0) map.set(n, v);
    }
    return map.size > 0 ? map : DEFAULT_TOOL_CATEGORY_LABELS;
  } catch {
    return DEFAULT_TOOL_CATEGORY_LABELS;
  }
}
