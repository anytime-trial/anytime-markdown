import type { SxProps,Theme } from "@mui/material/styles";

import { getTextDisabled } from "../constants/colors";

/** readonly/レビューモード制御・プレースホルダー・基本設定スタイル */
export function getBaseStyles(
  theme: Theme,
  options?: { readonlyMode?: boolean },
): SxProps<Theme> {
  const isDark = theme.palette.mode === "dark";
  return {
    // readonly/レビューモード時はホバーラベルを非表示
    '&[contenteditable="false"], &[data-review-mode="true"], &[data-readonly-mode="true"]': {
      "& h1::before, & h2::before, & h3::before, & h4::before, & h5::before, & > p::before, & > blockquote > p::before, & li::before": {
        display: "none !important" as unknown as string,
      },
    },
    // readonly/レビューモード時はコードブロックツールバーとリサイズハンドルを非表示
    '&[contenteditable="false"] [data-block-toolbar], &[data-review-mode="true"] [data-block-toolbar], &[data-readonly-mode="true"] [data-block-toolbar]': {
      display: "none !important" as unknown as string,
    },
    '&[contenteditable="false"] [data-resize-handle], &[data-review-mode="true"] [data-resize-handle], &[data-readonly-mode="true"] [data-resize-handle]': {
      display: "none !important" as unknown as string,
    },
    // readonlyモード時はチェックボックスを無効化
    ...(options?.readonlyMode ? {
      '& input[type="checkbox"]': {
        pointerEvents: "none",
        opacity: 0.7,
      },
    } : {}),
    "&:focus-visible": {
      outline: "none",
    },
    "@media print": {
      backgroundImage: "none !important",
    },
    // プレースホルダー
    "& p.is-editor-empty:first-of-type::before": {
      content: "attr(data-placeholder)",
      color: getTextDisabled(isDark),
      float: "left",
      height: 0,
      pointerEvents: "none",
    },
  };
}
