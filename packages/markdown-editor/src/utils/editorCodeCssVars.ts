/**
 * rich codeblock（native content）が読む実行時 CSS 変数の適用通知イベント。
 *
 * ホスト（vanillaMarkdownEditor の applyCodeCssVars）が editor root へ
 * `--am-editor-dark` / `--am-code-font-size` 等を書いた直後に document へ
 * dispatch する。NodeView は構築時（dom 未接続・変数書込み前）に正しい値を
 * 読めないため、本イベントを購読して isDark / fontSize 変化時に再描画する
 * （React 時代の useIsDark context 再レンダーの vanilla 置換）。
 */
export const EDITOR_CODE_VARS_CHANGED_EVENT = "md-editor-code-vars-changed";
