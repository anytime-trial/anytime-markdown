/**
 * VS Code webview の `<body>` クラス（`vscode-dark` / `vscode-light` /
 * `vscode-high-contrast` / `vscode-high-contrast-light`）から tickets-viewer が
 * 参照するテーマ値（`documentElement.dataset.theme`）を導出する純粋関数。
 *
 * `vscode-high-contrast-light` は `vscode-high-contrast` の部分文字列を含むため、
 * 配列要素の完全一致で判定する（`.includes()` による部分一致は誤判定する）。
 */
export type ThemeMode = 'dark' | 'light';

// SHORTCUT: high-contrast を dark 配色へ丸めている. ceiling: high contrast 専用の
// コントラストトークンは未定義で、WCAG AAA 相当の強制配色要件を満たす保証はない.
// upgrade: high contrast 環境での可読性・コントラスト比の問題報告が出たら専用モードを追加する.
const DARK_BODY_CLASSES = new Set(['vscode-dark', 'vscode-high-contrast']);

export function resolveThemeFromBodyClasses(classes: readonly string[]): ThemeMode {
  return classes.some((cls) => DARK_BODY_CLASSES.has(cls)) ? 'dark' : 'light';
}
