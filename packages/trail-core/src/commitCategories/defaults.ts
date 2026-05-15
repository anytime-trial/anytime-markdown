/**
 * `.anytime/commit-categories.json` が存在しない場合のデフォルトマッピング。
 * キーは extractCommitPrefix が返す lowercase prefix。
 */
export const DEFAULT_COMMIT_CATEGORY_LABELS: ReadonlyMap<number, string> = new Map<number, string>([
  [0, '機能追加'],
  [1, 'バグ修正'],
  [2, 'リファクタリング'],
  [3, 'その他'],
]);

export const DEFAULT_COMMIT_CATEGORIES: ReadonlyMap<string, number> = new Map<string, number>([
  // 0: 機能追加
  ['feat', 0], ['a11y', 0], ['i18n', 0], ['test', 0], ['docs', 0], ['plan', 0], ['merge', 0],
  // 1: バグ修正
  ['fix', 1], ['security', 1], ['revert', 1],
  // 2: リファクタリング
  ['refactor', 2], ['perf', 2], ['style', 2],
  // 3: その他
  ['build', 3], ['chore', 3], ['ci', 3], ['debug', 3],
]);
