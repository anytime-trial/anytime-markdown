import type { Theme, SxProps } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";
import type { EditorSettings } from "../useEditorSettings";

/**
 * WYSIWYG エディタ Paper の sx スタイルを生成する。
 * MarkdownEditorPage から切り出し（M-09 リファクタリング）。
 */
export function getEditorPaperSx(
  theme: Theme,
  settings: EditorSettings,
  editorHeight: number,
): SxProps<Theme> {
  return {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    overflow: "hidden",
    bgcolor: theme.palette.mode === "dark"
      ? (settings.darkBgColor || undefined)
      : (settings.lightBgColor || (settings.editorBg === "grey" ? "grey.50" : "background.paper")),
    "& .tiptap": {
      minHeight: editorHeight - 36,
      maxHeight: editorHeight - 4,
      overflowY: "auto",
      py: 2,
      pr: 2,
      pl: 5,
      outline: "none",
      // ビューモード（contenteditable=false）時はホバーラベルを非表示
      '&[contenteditable="false"]': {
        "& h1::before, & h2::before, & h3::before, & h4::before, & h5::before, & > p::before, & > blockquote > p::before, & li::before": {
          display: "none",
        },
      },
      "&:focus-visible": {
        outline: "none",
      },
      fontSize: `${settings.fontSize}px`,
      lineHeight: settings.lineHeight,
      color: theme.palette.mode === "dark"
        ? (settings.darkTextColor || theme.palette.text.primary)
        : (settings.lightTextColor || theme.palette.text.primary),
      "@media print": {
        backgroundImage: "none !important",
      },
      "& .heading-number": {
        color: theme.palette.text.secondary,
        fontWeight: 400,
        marginRight: "0.25em",
        userSelect: "none" as const,
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
      "& .heading-folded::after": {
        content: "' ...'",
        fontSize: "0.75rem",
        color: theme.palette.text.disabled,
        fontWeight: 400,
        fontStyle: "italic",
      },
      "& h1, & h2, & h3, & h4, & h5": {
        position: "relative",
        "&::before": {
          position: "absolute",
          right: "calc(100% + 8px)",
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: "0.6rem",
          fontWeight: 700,
          lineHeight: 1,
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          bgcolor: theme.palette.action.hover,
          color: theme.palette.text.secondary,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          cursor: "pointer",
          opacity: 0,
          transition: "opacity 0.15s",
        },
        "&:hover::before, &:focus-within::before": {
          opacity: 1,
        },
      },
      "& h1": {
        fontSize: "2em", fontWeight: 700, mt: 2, mb: 1,
        "&::before": { content: "'H1'" },
      },
      "& h2": {
        fontSize: "1.5em", fontWeight: 600, mt: 1.5, mb: 1,
        "&::before": { content: "'H2'" },
      },
      "& h3": {
        fontSize: "1.25em", fontWeight: 600, mt: 1, mb: 0.5,
        "&::before": { content: "'H3'" },
      },
      "& h4": {
        fontSize: "1.1em", fontWeight: 600, mt: 1, mb: 0.5,
        "&::before": { content: "'H4'" },
      },
      "& h5": {
        fontSize: "1em", fontWeight: 600, mt: 0.75, mb: 0.5,
        "&::before": { content: "'H5'" },
      },
      "& > p": {
        position: "relative",
        "&::before": {
          content: "'P'",
          position: "absolute",
          right: "calc(100% + 8px)",
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: "0.6rem",
          fontWeight: 700,
          lineHeight: 1,
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          bgcolor: theme.palette.action.hover,
          color: theme.palette.text.secondary,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          cursor: "pointer",
          opacity: 0,
          transition: "opacity 0.15s",
        },
        "&:hover::before, &:focus-within::before": {
          opacity: 1,
        },
      },
      "& p": { mb: 1 },
      "& > blockquote > p": {
        position: "relative",
        "&::before": {
          content: "'Quote'",
          position: "absolute",
          right: "calc(100% + 30px)",
          top: 2,
          fontSize: "0.6rem",
          fontWeight: 700,
          lineHeight: 1,
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          bgcolor: theme.palette.action.hover,
          color: theme.palette.text.secondary,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          cursor: "pointer",
          opacity: 0,
          transition: "opacity 0.15s",
          "&:hover": { bgcolor: theme.palette.action.selected },
        },
        "&:hover::before, &:focus-within::before": { opacity: 1 },
      },
      "& ul, & ol": { pl: 3, mb: 1 },
      "& li": {
        mb: 0.25,
        position: "relative",
        "&::before": {
          position: "absolute",
          right: "calc(100% + 32px)",
          top: 2,
          fontSize: "0.6rem",
          fontWeight: 700,
          lineHeight: 1,
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          bgcolor: theme.palette.action.hover,
          color: theme.palette.text.secondary,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          cursor: "pointer",
          opacity: 0,
          transition: "opacity 0.15s",
          "&:hover": { bgcolor: theme.palette.action.selected },
        },
        "&:hover::before, &:focus-within::before": { opacity: 1 },
      },
      "& > ul:not([data-type='taskList']) > li": {
        "&::before": { content: "'UL'" },
      },
      "& > ol > li": {
        "&::before": { content: "'OL'" },
      },
      "& > ul[data-type='taskList'] > li": {
        "&::before": { content: "'Task'", right: "calc(100% + 8px)" },
      },
      "& code": {
        bgcolor: theme.palette.action.hover,
        color: theme.palette.mode === "dark" ? theme.palette.grey[300] : theme.palette.error.main,
        px: 0.5,
        py: 0.25,
        borderRadius: 0.5,
        fontFamily: "monospace",
        fontSize: "0.875em",
      },
      "& pre": {
        bgcolor: theme.palette.background.paper,
        border: 1,
        borderColor: theme.palette.mode === "dark" ? theme.palette.action.hover : "transparent",
        borderRadius: 1,
        p: 2,
        my: 1,
        overflow: "auto",
        "& code": { bgcolor: "transparent", color: theme.palette.mode === "dark" ? theme.palette.grey[300] : "inherit", p: 0, borderRadius: 0 },
        ...(theme.palette.mode === "dark"
          ? {
              "& .hljs-keyword, & .hljs-selector-tag, & .hljs-built_in, & .hljs-type": { color: "#ff7b72" },
              "& .hljs-string, & .hljs-attr, & .hljs-template-tag, & .hljs-template-variable": { color: "#a5d6ff" },
              "& .hljs-comment, & .hljs-doctag": { color: "#8b949e" },
              "& .hljs-number, & .hljs-literal, & .hljs-variable, & .hljs-regexp": { color: "#79c0ff" },
              "& .hljs-title, & .hljs-title\\.class_, & .hljs-title\\.function_": { color: "#d2a8ff" },
              "& .hljs-params": { color: "#c9d1d9" },
              "& .hljs-meta, & .hljs-meta keyword": { color: "#ffa657" },
              "& .hljs-symbol, & .hljs-bullet": { color: "#ffa657" },
              "& .hljs-addition": { color: "#aff5b4", bgcolor: "rgba(46,160,67,0.15)" },
              "& .hljs-deletion": { color: "#ffdcd7", bgcolor: "rgba(248,81,73,0.15)" },
            }
          : {
              "& .hljs-keyword, & .hljs-selector-tag, & .hljs-built_in, & .hljs-type": { color: "#cf222e" },
              "& .hljs-string, & .hljs-attr, & .hljs-template-tag, & .hljs-template-variable": { color: "#0a3069" },
              "& .hljs-comment, & .hljs-doctag": { color: "#6e7781" },
              "& .hljs-number, & .hljs-literal, & .hljs-variable, & .hljs-regexp": { color: "#0550ae" },
              "& .hljs-title, & .hljs-title\\.class_, & .hljs-title\\.function_": { color: "#8250df" },
              "& .hljs-params": { color: "#24292f" },
              "& .hljs-meta, & .hljs-meta keyword": { color: "#953800" },
              "& .hljs-symbol, & .hljs-bullet": { color: "#953800" },
              "& .hljs-addition": { color: "#116329", bgcolor: "rgba(46,160,67,0.15)" },
              "& .hljs-deletion": { color: "#82071e", bgcolor: "rgba(248,81,73,0.15)" },
            }),
      },
      "& blockquote": {
        borderLeft: `3px solid ${theme.palette.divider}`,
        pl: 2,
        ml: 0,
        my: 1,
        color: theme.palette.text.secondary,
      },
      "& blockquote[data-admonition-type]": {
        borderLeftWidth: 4,
        pl: 2,
        py: 1,
        my: 1.5,
        borderRadius: 1,
        color: theme.palette.text.primary,
      },
      "& blockquote[data-admonition-type='note']": {
        borderLeftColor: theme.palette.info.main,
        bgcolor: alpha(theme.palette.info.main, 0.05),
      },
      "& blockquote[data-admonition-type='tip']": {
        borderLeftColor: theme.palette.success.main,
        bgcolor: alpha(theme.palette.success.main, 0.05),
      },
      "& blockquote[data-admonition-type='important']": {
        borderLeftColor: theme.palette.secondary.main,
        bgcolor: alpha(theme.palette.secondary.main, 0.05),
      },
      "& blockquote[data-admonition-type='warning']": {
        borderLeftColor: theme.palette.warning.main,
        bgcolor: alpha(theme.palette.warning.main, 0.05),
      },
      "& blockquote[data-admonition-type='caution']": {
        borderLeftColor: theme.palette.error.main,
        bgcolor: alpha(theme.palette.error.main, 0.05),
      },
      // 脚注定義行 ([^id]: content) のスタイリング
      "& p:has(> sup[data-footnote-ref])": {
        "& sup[data-footnote-ref]": {
          color: theme.palette.primary.main,
          fontWeight: 600,
          cursor: "default",
        },
      },
      "& table": {
        borderCollapse: "collapse",
        width: settings.tableWidth,
        "& th, & td": {
          border: `1px solid ${theme.palette.divider}`,
          px: 1,
          py: 0.5,
          textAlign: "left",
          minWidth: 80,
          fontSize: "inherit",
          lineHeight: "inherit",
        },
        "& th": {
          bgcolor: theme.palette.action.hover,
          fontWeight: 600,
        },
        "& .selectedCell": {
          bgcolor: theme.palette.action.selected,
        },
      },
      "& img": {
        maxWidth: "100%",
        height: "auto",
        borderRadius: 1,
        my: 1,
      },
      "& ul[data-type='taskList']": {
        listStyle: "none",
        pl: 0,
        "& li": {
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 0.25,
          "& label": {
            display: "flex",
            alignItems: "center",
            "& input[type='checkbox']": {
              width: settings.fontSize - 2,
              height: settings.fontSize - 2,
              cursor: "pointer",
              accentColor: theme.palette.primary.main,
            },
          },
          "& > div": {
            flex: 1,
            "& p": { my: 1 },
          },
        },
      },
      "& a": {
        color: theme.palette.primary.main,
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
        backgroundColor: theme.palette.grey[800],
        color: theme.palette.common.white,
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "12px",
        whiteSpace: "nowrap",
        maxWidth: "400px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        zIndex: 1000,
        pointerEvents: "none",
      },
      '& a[href^="#"]:hover::after': {
        content: "none",
      },
      '&.ctrl-held a[href^="#"]:hover::after': {
        content: "attr(href)",
      },
      "& hr": {
        border: "none",
        borderTop: `1px solid ${theme.palette.divider}`,
        my: 2,
      },
      "& hr.ProseMirror-selectednode": {
        borderLeft: `1.5px solid ${theme.palette.text.primary}`,
        py: "0.5em",
        animation: "blink-caret 1s step-end infinite",
        "@keyframes blink-caret": {
          "0%, 100%": { borderLeftColor: theme.palette.text.primary },
          "50%": { borderLeftColor: "transparent" },
        },
      },
      "& p.is-editor-empty:first-of-type::before": {
        content: "attr(data-placeholder)",
        color: theme.palette.text.disabled,
        float: "left",
        height: 0,
        pointerEvents: "none",
      },
      "& .search-match": {
        bgcolor: alpha(theme.palette.warning.light, theme.palette.mode === "dark" ? 0.3 : 0.5),
        borderRadius: "2px",
      },
      "& .search-match-current": {
        bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === "dark" ? 0.5 : 0.4),
        borderRadius: "2px",
        outline: `2px solid ${theme.palette.primary.main}`,
      },
    },
  };
}
