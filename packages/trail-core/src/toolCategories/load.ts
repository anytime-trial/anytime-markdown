import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_TOOL_CATEGORIES, DEFAULT_TOOL_CATEGORY_LABELS } from './defaults';
import type { ToolCategoriesFile } from './types';

export function loadToolCategories(workspaceRoot: string): ReadonlyMap<string, number> {
  const file = path.join(workspaceRoot, '.trail', 'tool-categories.json');
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
  const file = path.join(workspaceRoot, '.trail', 'tool-categories.json');
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
