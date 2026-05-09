import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SKILL_CATEGORIES } from './defaults';
import type { SkillCategoriesFile } from './types';

export function loadSkillCategories(workspaceRoot: string): ReadonlyMap<string, number> {
  const file = path.join(workspaceRoot, '.trail', 'skill-categories.json');
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as SkillCategoriesFile;
    if (!parsed.entries || typeof parsed.entries !== 'object') return DEFAULT_SKILL_CATEGORIES;
    const map = new Map<string, number>();
    for (const [key, entry] of Object.entries(parsed.entries)) {
      if (typeof entry.category === 'number') map.set(key, entry.category);
    }
    return map.size > 0 ? map : DEFAULT_SKILL_CATEGORIES;
  } catch {
    return DEFAULT_SKILL_CATEGORIES;
  }
}
