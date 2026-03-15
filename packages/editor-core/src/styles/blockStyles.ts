import type { SxProps,Theme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";

import type { EditorSettings } from "../useEditorSettings";

/** blockquote・admonition・table・list・taskList・hr・img スタイル */
export function getBlockStyles(theme: Theme, settings: EditorSettings): SxProps<Theme> {
  return {
    "& ul, & ol": { pl: 3, mb: 1 },
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
        bgcolor: theme.palette.background.paper,
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
  };
}
