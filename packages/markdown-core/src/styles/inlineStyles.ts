import type { SxProps,Theme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";

import { ACCENT_COLOR, COMMON_WHITE, getGrey, getPrimaryMain, getWarningLight, getWarningMain } from "../constants/colors";
import { TOOLTIP_FONT_SIZE } from "../constants/dimensions";
import { Z_LINK_TOOLTIP } from "../constants/zIndex";

/** リンク・コメント・検索マッチ・脚注スタイル */
export function getInlineStyles(theme: Theme): SxProps<Theme> {
  const isDark = theme.palette.mode === "dark";
  return {
    "& a": {
      color: getPrimaryMain(isDark),
      textDecoration: "underline",
      position: "relative",
      cursor: "pointer",
    },
    '& a[href^="#"]': {
      cursor: "text",
    },
    '&.ctrl-held a[href^="#"]': {
      cursor: "pointer",
    },
    "& a:hover::after": {
      content: "attr(href)",
      position: "absolute",
      bottom: "100%",
      left: 0,
      marginBottom: "4px",
      backgroundColor: getGrey(isDark, 900),
      color: COMMON_WHITE,
      padding: "2px 8px",
      borderRadius: "4px",
      fontSize: TOOLTIP_FONT_SIZE,
      whiteSpace: "nowrap",
      maxWidth: "400px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      zIndex: Z_LINK_TOOLTIP,
      pointerEvents: "none",
    },
    '& a[href^="#"]:hover::after': {
      content: "none",
    },
    '&.ctrl-held a[href^="#"]:hover::after': {
      content: "attr(href)",
    },
    // テキストハイライト（マーカー）
    "& mark": {
      backgroundColor: alpha(ACCENT_COLOR, isDark ? 0.45 : 0.40),
      borderRadius: "2px",
      color: "inherit",
      px: "2px",
    },
    // コメントハイライト
    "& .comment-highlight": {
      backgroundColor: "rgba(255, 200, 0, 0.25)",
      borderBottom: "2px solid rgba(255, 200, 0, 0.6)",
      cursor: "pointer",
      borderRadius: "2px",
    },
    "& .comment-highlight:hover": {
      backgroundColor: "rgba(255, 200, 0, 0.4)",
    },
    // ポイントコメントマーカー
    "& .comment-point-marker": {
      display: "inline-block",
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      backgroundColor: "rgba(255, 200, 0, 0.8)",
      verticalAlign: "middle",
      mx: "2px",
      cursor: "pointer",
      userSelect: "none" as const,
    },
    // 検索マッチ
    "& .search-match": {
      bgcolor: alpha(getWarningLight(isDark), isDark ? 0.3 : 0.5),
      borderRadius: "2px",
    },
    "& .search-match-current": {
      bgcolor: alpha(getWarningMain(isDark), isDark ? 0.5 : 0.4),
      borderRadius: "2px",
      outline: `2px solid ${getPrimaryMain(isDark)}`,
    },
    // 脚注定義行
    "& p:has(> sup[data-footnote-ref])": {
      "& sup[data-footnote-ref]": {
        color: getPrimaryMain(isDark),
        fontWeight: 600,
        cursor: "default",
      },
    },
  };
}
