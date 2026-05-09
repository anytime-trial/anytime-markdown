export const DEFAULT_SKILL_CATEGORIES: ReadonlyMap<string, number> = new Map<string, number>([
  // 0: 開発フロー — superpowers:* はデフォルト 0、個別上書きあり
  ['superpowers:*', 0],
  ['production-release', 0],
  ['resolve-issues', 0],
  ['update-config', 0],
  ['simplify', 0],
  ['feature-dev', 0],
  ['deploy-cms-remote', 0],
  ['executing-plans', 0],
  ['subagent-driven-development', 0],
  ['plan', 0],
  ['brainstorming', 0],
  ['code-review-checklist', 0],
  ['dotfiles-commit', 0],
  // 0 の個別上書き不要 — superpowers:writing-skills だけ 1 へ
  ['superpowers:writing-skills', 1],
  // 1: ドキュメント・コンテンツ
  ['markdown-output', 1],
  ['anytime-*', 1],
  ['design-md', 1],
  ['tech-article', 1],
  ['documentation-update', 1],
  ['update-docs', 1],
  ['daily-essay', 1],
  ['note', 1],
  // 2: 調査・分析
  ['daily-*', 2],
  ['weekly-research', 2],
  ['web-search', 2],
  ['claude-code-guide', 2],
  ['find-skills', 2],
  ['insights', 2],
  ['health', 2],
  ['claude-health', 2],
  // 3: AIツール・プラグイン
  ['codex:*', 3],
  ['mcp__*', 3],
  ['using-superpowers', 3],
  ['serena', 3],
  ['claude-api', 3],
  // 4: その他 (wildcard catch-all)
  ['*', 4],
]);
