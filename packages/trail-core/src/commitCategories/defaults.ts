/**
 * `.trail/commit-categories.json` が存在しない場合のデフォルトマッピング。
 * キーは extractCommitPrefix が返す lowercase prefix。
 * 値: 0=計画的開発 / 1=事後対応（不具合） / 2=その他
 */
export const DEFAULT_COMMIT_CATEGORIES: ReadonlyMap<string, number> = new Map<string, number>([
  ['feat', 0], ['refactor', 0], ['docs', 0], ['test', 0], ['perf', 0],
  ['style', 0], ['a11y', 0], ['ci', 0], ['build', 0], ['chore', 0], ['i18n', 0],
  ['fix', 1], ['security', 1], ['revert', 1],
  ['plan', 2], ['debug', 2], ['merge', 2],
]);
