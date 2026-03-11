import type { Theme } from "@mui/material/styles";

/** マージエディタ共通のtiptapスタイル */
export function getMergeTiptapStyles(theme: Theme, fontSize = 14, lineHeight = 1.6, options?: { showHoverLabels?: boolean }) {
  const hoverLabelBase = {
    position: "absolute" as const,
    fontSize: "0.6rem",
    fontWeight: 700,
    lineHeight: 1,
    px: 0.5,
    py: 0.25,
    borderRadius: 0.5,
    bgcolor: theme.palette.action.hover,
    color: theme.palette.text.secondary,
    fontFamily: "monospace",
    whiteSpace: "nowrap" as const,
    cursor: "pointer",
    opacity: 0,
    transition: "opacity 0.15s",
  };

  const hoverLabelHeadingBase = {
    position: "relative" as const,
    "&::before": {
      ...hoverLabelBase,
      right: "calc(100% + 8px)",
      top: "50%",
      transform: "translateY(-50%)",
    },
    "&:hover::before, &:focus-within::before": { opacity: 1 },
  };

  const hoverLabels = options?.showHoverLabels ? {
    "& h1, & h2, & h3, & h4, & h5": hoverLabelHeadingBase,
    "& > p": {
      position: "relative",
      "&::before": {
        content: "'P'",
        ...hoverLabelBase,
        right: "calc(100% + 8px)",
        top: "50%",
        transform: "translateY(-50%)",
      },
      "&:hover::before, &:focus-within::before": { opacity: 1 },
    },
    "& > blockquote > p": {
      position: "relative",
      "&::before": {
        content: "'Quote'",
        ...hoverLabelBase,
        right: "calc(100% + 30px)",
        top: 2,
        "&:hover": { bgcolor: theme.palette.action.selected },
      },
      "&:hover::before, &:focus-within::before": { opacity: 1 },
    },
  } : {};

  return {
    "& .tiptap": {
      minHeight: "100%",
      py: 2,
      pr: 2,
      pl: 5,
      outline: "none",
      fontSize: `${fontSize}px`,
      lineHeight,
      color: theme.palette.text.primary,
      "& h1": {
        fontSize: "2em", fontWeight: 700, mt: 2, mb: 1,
        ...(options?.showHoverLabels && { "&::before": { content: "'H1'" } }),
      },
      "& h2": {
        fontSize: "1.5em", fontWeight: 600, mt: 1.5, mb: 1,
        ...(options?.showHoverLabels && { "&::before": { content: "'H2'" } }),
      },
      "& h3": {
        fontSize: "1.25em", fontWeight: 600, mt: 1, mb: 0.5,
        ...(options?.showHoverLabels && { "&::before": { content: "'H3'" } }),
      },
      "& h4": {
        fontSize: "1.1em", fontWeight: 600, mt: 1, mb: 0.5,
        ...(options?.showHoverLabels && { "&::before": { content: "'H4'" } }),
      },
      "& h5": {
        fontSize: "1em", fontWeight: 600, mt: 0.75, mb: 0.5,
        ...(options?.showHoverLabels && { "&::before": { content: "'H5'" } }),
      },
      "& p": { mb: 1 },
      "& ul, & ol": { pl: 3, mb: 1 },
      "& li": {
        mb: 0.25,
        ...(options?.showHoverLabels && {
          position: "relative" as const,
          "&::before": {
            ...hoverLabelBase,
            right: "calc(100% + 32px)",
            top: 2,
            "&:hover": { bgcolor: theme.palette.action.selected },
          },
          "&:hover::before, &:focus-within::before": { opacity: 1 },
        }),
      },
      "& > ul:not([data-type='taskList']) > li": {
        ...(options?.showHoverLabels && { "&::before": { content: "'UL'" } }),
      },
      "& > ol > li": {
        ...(options?.showHoverLabels && { "&::before": { content: "'OL'" } }),
      },
      "& > ul[data-type='taskList'] > li": {
        ...(options?.showHoverLabels && { "&::before": { content: "'Task'", right: "calc(100% + 8px)" } }),
      },
      ...hoverLabels,
      // レビュー/readonlyモード時はhover labelを非表示
      '&[data-review-mode="true"], &[data-readonly-mode="true"]': {
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
        bgcolor: theme.palette.mode === "dark" ? theme.palette.grey[900] : theme.palette.grey[100],
        borderRadius: 1,
        p: 2,
        my: 1,
        overflow: "auto",
        "& code": { bgcolor: "transparent", color: "inherit", p: 0, borderRadius: 0 },
      },
      "& blockquote": {
        borderLeft: `3px solid ${theme.palette.divider}`,
        pl: 2,
        ml: 0,
        my: 1,
        color: theme.palette.text.secondary,
      },
      "& table": {
        borderCollapse: "collapse",
        width: "100%",
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
      "& a": { color: theme.palette.primary.main, textDecoration: "underline" },
      "& hr": { border: "none", borderTop: `1px solid ${theme.palette.divider}`, my: 2 },
      "& ul[data-type='taskList']": {
        listStyle: "none",
        pl: 0,
        "& li": {
          display: "flex",
          alignItems: "center",
          gap: 1,
        },
      },
    },
  };
}
