import { getEditorText } from "../constants/colors";
import { HOVER_LABEL_SELECTORS } from "../styles/baseStyles";
import { getSharedContentStyles } from "../styles/sharedContentStyles";
import type { EditorSettings } from "../useEditorSettings";

/**
 * マージ（比較）エディタ共通の tiptap スタイル。
 *
 * 通常エディタ (styles/editorStyles.ts の getEditorPaperSx) と同じ共有コンテンツ装飾
 * (getSharedContentStyles) を合成し、admonition・シンタックスハイライト・見出し装飾などを
 * 通常モードと一致させる。比較固有の差分（左パディング pl:5、hover label の表示ゲート）のみ
 * を上乗せする。
 *
 * paperSize / blockAlign は比較ビュー（左右分割で幅が動的）では非対応とし適用しない。
 *
 * @param isDark ダークモードか否か（ThemeModeContext の useIsDark から渡す）
 * @param settings エディタ設定（fontSize / lineHeight / tableWidth / 文字色など）
 * @param options.showHoverLabels ブロックラベル(H1/P 等)を hover で表示するか。
 *   readonly な diff ペインでは false にしてラベルを隠す。
 */
export function getMergeTiptapStyles(
  isDark: boolean,
  settings: EditorSettings,
  options?: { showHoverLabels?: boolean },
) {
  const showHoverLabels = options?.showHoverLabels ?? false;

  return {
    "& .tiptap": {
      minHeight: "100%",
      py: 2,
      pr: 2,
      // 比較モードは左端に行ラベル/マージガター領域を確保するため通常(pl:2)より広い
      pl: 5,
      outline: "none",
      fontFamily: "var(--editor-content-font-family, sans-serif)",
      fontSize: `${settings.fontSize}px`,
      lineHeight: settings.lineHeight,
      color: getEditorText(isDark, settings),
      // 通常エディタと同一の共有スタイルを合成（二重管理を排し drift を防ぐ）
      ...getSharedContentStyles(isDark, settings),
      // getHeadingStyles はブロックラベルを常に定義するため、
      // 非表示指定のペイン（readonly diff 側）では明示的に隠す。
      ...(showHoverLabels ? {} : {
        [HOVER_LABEL_SELECTORS]: { display: "none !important" as unknown as string },
      }),
    },
  };
}
