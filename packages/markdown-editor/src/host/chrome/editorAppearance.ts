import type { Editor } from "@anytime-markdown/markdown-core";

import { getEditorBg, getEditorText } from "../../constants/colors";
import { calcPaperContentWidth } from "../../constants/dimensions";
import type { EditorSettings } from "../../editorSettings";
import { injectEditorContentCss } from "../../styles/editorContentCss";
import { EDITOR_CODE_VARS_CHANGED_EVENT } from "../../utils/editorCodeCssVars";
import { measureToCssMaxWidth } from "../../utils/measurePreset";

/**
 * 設定・テーマの見た目への適用（旧 React の useEditorSettingsSync + GlobalStyle 注入）。
 *
 * 適用先は 3 系統に分かれる: editor / root の基本設定、rich codeblock（NodeView）が読む
 * 実行時 CSS 変数、コンテンツ装飾 CSS とその変数。3 つとも「設定または themeMode が変わったら
 * まとめて再適用する」という同じ寿命を持つため、1 つのコントローラにまとめる。
 *
 * 設定と themeMode は live update で変わるので値ではなく getter で受ける。
 */

export interface EditorAppearanceOptions {
  readonly editor: Editor;
  /** CSS 変数の書き込み先（エディタ root。複数インスタンス間の後勝ちを避けるため documentElement は使わない）。 */
  readonly root: HTMLElement;
  /** 実効設定（ホストの default* を畳み込んだ後の値）。 */
  readonly getSettings: () => EditorSettings;
  readonly isDark: () => boolean;
  /** 現在の readOnly（ホスト強制 or ユーザー選択）。 */
  readonly isReadOnly: () => boolean;
}

export interface EditorAppearance {
  /** 3 系統すべてを再適用する。 */
  applyAll: () => void;
}

/** settings を editor / root へ適用する（React useEditorSettingsSync 相当の素 DOM 版）。 */
function applyEditorSettings(
  editor: Editor,
  root: HTMLElement,
  settings: EditorSettings,
  readonlyMode: boolean,
): void {
  // スペルチェック機能は撤去済み。エディタ DOM では常に無効化する
  // （未指定だと contenteditable のブラウザ既定で有効化されるため明示的に false 固定）。
  editor.view.dom.setAttribute("spellcheck", "false");
  editor.setEditable(!readonlyMode);
  root.style.setProperty("--am-editor-font-size", `${settings.fontSize}px`);
  root.style.setProperty("--am-editor-line-height", String(settings.lineHeight));
  root.style.setProperty("--am-editor-measure", measureToCssMaxWidth(settings.measure));
  root.style.setProperty("--am-editor-word-break", settings.wordBreak);
  root.style.setProperty("--am-editor-table-width", settings.tableWidth);
  root.dataset.blockAlign = settings.blockAlign;
  root.dataset.paperSize = settings.paperSize;
  root.dataset.tableWidth = settings.tableWidth;
  root.style.setProperty("--am-paper-margin", `${settings.paperMargin}mm`);
}

export function createEditorAppearance(options: EditorAppearanceOptions): EditorAppearance {
  const { editor, root, getSettings, isDark, isReadOnly } = options;

  /**
   * rich codeblock（native content）が読む実行時 CSS 変数（CodeDialogHost 相当）。
   * documentElement でなく editor root へ書き、複数インスタンス間の後勝ち上書きを防ぐ
   * （カスタムプロパティは継承するため、NodeView は自身の要素の computed style から読める）。
   */
  const applyCodeCssVars = (): void => {
    const s = getSettings();
    root.style.setProperty("--am-editor-dark", isDark() ? "1" : "0");
    root.style.setProperty("--am-code-font-size", `${s.fontSize}px`);
    root.style.setProperty("--am-code-line-height", `${s.lineHeight}`);
    // NodeView（rich codeblock）は構築時に変数を読めない（dom 未接続・本適用前）ため、
    // 適用完了を通知して isDark / fontSize 変化を再描画させる（mermaid ダーク色の回帰防止）。
    document.dispatchEvent(new CustomEvent(EDITOR_CODE_VARS_CHANGED_EVENT));
  };

  /**
   * コンテンツ装飾 CSS（styles/editorContentCss・旧 GlobalStyle 注入の置換）と、
   * その CSS が参照するテーマ × 設定依存の CSS 変数（背景・文字色・用紙幅）を適用する。
   */
  const applyContentCssVars = (): void => {
    const dark = isDark();
    const s = getSettings();
    injectEditorContentCss(dark);
    root.style.setProperty("--am-editor-text", getEditorText(dark, s));
    const editorBg = getEditorBg(dark, s);
    root.style.setProperty("--am-editor-bg", editorBg);
    // 用紙サイズ有効時は外側を少し暗く/明るくして用紙境界を示す（旧 getEditorPaperSx と同値）
    const paperBg = dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)";
    root.style.setProperty("--am-editor-outer-bg", s.paperSize === "off" ? editorBg : paperBg);
    if (s.paperSize !== "off") {
      root.style.setProperty(
        "--am-paper-max-width",
        `${calcPaperContentWidth(s.paperSize, s.paperMargin)}px`,
      );
    }
  };

  return {
    applyAll: () => {
      applyEditorSettings(editor, root, getSettings(), isReadOnly());
      applyCodeCssVars();
      applyContentCssVars();
    },
  };
}
