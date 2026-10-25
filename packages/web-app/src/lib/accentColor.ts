/**
 * ブランドの唯一の差し色（design-system.ja.md §1・§2.1 `--color-accent-amber`）。
 * 用途は使う側のページが決める（年表は影響度「高」、テスト実施状況は「CI で実行されていない」）。
 *
 * Why not: `@anytime-markdown/markdown-editor` の ACCENT_COLOR を import しない。
 * 同パッケージは色定数だけの入口を持たず、入口から読むとエディタ一式がバンドルに入る。
 */
export const ACCENT_AMBER = '#E8A012';
