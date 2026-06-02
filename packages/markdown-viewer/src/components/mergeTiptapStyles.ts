import type { Theme } from "@mui/material/styles";

import { getEditorText } from "../constants/colors";
import { getBaseStyles } from "../styles/baseStyles";
import { getBlockStyles } from "../styles/blockStyles";
import { getCodeStyles } from "../styles/codeStyles";
import { getHeadingStyles } from "../styles/headingStyles";
import { getInlineStyles } from "../styles/inlineStyles";
import type { EditorSettings } from "../useEditorSettings";

/** showHoverLabels=false 時に隠すブロックラベル ::before のセレクタ群 */
const BLOCK_LABEL_SELECTORS =
  "& h1::before, & h2::before, & h3::before, & h4::before, & h5::before, & > p::before, & > blockquote > p::before, & li::before";

/**
 * マージ（比較）エディタ共通の tiptap スタイル。
 *
 * 通常エディタ (styles/editorStyles.ts の getEditorPaperSx) と同じ共有スタイル関数群
 * (baseStyles / headingStyles / codeStyles / blockStyles / inlineStyles) を合成し、
 * admonition・シンタックスハイライト・見出し装飾などを通常モードと一致させる。
 * 比較固有の差分（左パディング pl:5、hover label の表示ゲート）のみを上乗せする。
 *
 * paperSize / blockAlign は比較ビュー（左右分割で幅が動的）では非対応とし適用しない。
 *
 * @param theme MUI テーマ
 * @param settings エディタ設定（fontSize / lineHeight / tableWidth / 文字色など）
 * @param options.showHoverLabels ブロックラベル(H1/P 等)を hover で表示するか。
 *   readonly な diff ペインでは false にしてラベルを隠す。
 */
export function getMergeTiptapStyles(
  theme: Theme,
  settings: EditorSettings,
  options?: { showHoverLabels?: boolean },
) {
  const isDark = theme.palette.mode === "dark";
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
      ...(getBaseStyles(theme) as Record<string, unknown>),
      ...(getHeadingStyles(theme) as Record<string, unknown>),
      ...(getCodeStyles(theme) as Record<string, unknown>),
      ...(getBlockStyles(theme, settings) as Record<string, unknown>),
      ...(getInlineStyles(theme) as Record<string, unknown>),
      // getHeadingStyles はブロックラベルを常に定義するため、
      // 非表示指定のペイン（readonly diff 側）では明示的に隠す。
      ...(showHoverLabels ? {} : {
        [BLOCK_LABEL_SELECTORS]: { display: "none !important" as unknown as string },
      }),
    },
  };
}
