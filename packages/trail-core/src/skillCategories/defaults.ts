export const DEFAULT_SKILL_CATEGORY_LABELS: ReadonlyMap<number, string> = new Map<number, string>([
  [0, '開発関連スキル'],
  [1, 'Anytimeスキル'],
  [2, '調査スキル'],
  [3, 'AIツール・プラグイン'],
  [4, 'その他'],
]);

export const DEFAULT_SKILL_CATEGORIES: ReadonlyMap<string, number> = new Map<string, number>([
  // 0: 開発関連スキル
  ['superpowers:*', 0], ['simplify', 0], ['production-release', 0],
  // 1: Anytimeスキル
  ['anytime-*', 1], ['resolve-issues', 1],
  // 2: 調査スキル
  ['daily-*', 2], ['weekly-research', 2], ['tech-article', 2],
  // 3: AIツール・プラグイン
  ['codex:*', 3], ['mcp__*', 3], ['using-superpowers', 3], ['serena', 3], ['claude-api', 3],
  // 4: その他 (wildcard catch-all)
  ['*', 4],
]);
