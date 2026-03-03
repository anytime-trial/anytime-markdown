"use client";

import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import type { SxProps, Theme } from "@mui/material";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useEditorSettingsContext } from "../../useEditorSettings";

interface CodeBlockFrameProps {
  /** Toolbar row rendered above the code editor */
  toolbar: React.ReactNode;
  /** Whether the entire block is collapsed */
  allCollapsed: boolean;
  /** Whether the code editor portion is collapsed (preview blocks only) */
  codeCollapsed?: boolean;
  /** Whether this is a diagram block (uses wrapper Box around pre) */
  isDiagramLayout?: boolean;
  /** Whether dark mode */
  isDark: boolean;
  /** Whether selected or in fullscreen (affects border visibility) */
  showBorder: boolean;
  /** Max height for code area (default 200 for preview blocks, 400 for regular) */
  codeMaxHeight?: number;
  /** Delete dialog state */
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  handleDeleteBlock: () => void;
  t: (key: string) => string;
  /** Content rendered after the code editor (preview area, diagram area, etc.) */
  children?: React.ReactNode;
  /** Content rendered after the outer Box (fullscreen dialogs, popovers, etc.) */
  afterFrame?: React.ReactNode;
}

export function CodeBlockFrame({
  toolbar,
  allCollapsed,
  codeCollapsed,
  isDiagramLayout,
  isDark,
  showBorder,
  codeMaxHeight,
  deleteDialogOpen,
  setDeleteDialogOpen,
  handleDeleteBlock,
  t,
  children,
  afterFrame,
}: CodeBlockFrameProps) {
  const settings = useEditorSettingsContext();
  const hasCodeCollapse = codeCollapsed !== undefined;
  const maxH = codeMaxHeight ?? (hasCodeCollapse ? 200 : 400);

  const preSx: SxProps<Theme> = allCollapsed
    ? { position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }
    : hasCodeCollapse
      ? {
          m: 0, p: 1.5, fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, bgcolor: isDark ? "grey.900" : "grey.50",
          maxHeight: codeCollapsed ? 0 : maxH, overflow: codeCollapsed ? "hidden" : "auto",
          py: codeCollapsed ? 0 : 1.5, px: codeCollapsed ? 0 : 1.5,
          opacity: codeCollapsed ? 0 : 1, transition: "max-height 0.2s, padding 0.2s, opacity 0.15s",
          "@media (prefers-reduced-motion: reduce)": { transition: "none" },
        }
      : { m: 0, p: 1.5, fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, bgcolor: isDark ? "grey.900" : "grey.50", overflow: "auto", maxHeight: maxH };

  const preElement = (
    <Box component="pre" spellCheck={false} sx={preSx}>
      {/* @ts-expect-error Tiptap NodeViewContent as prop type is too restrictive */}
      <NodeViewContent as="code" />
    </Box>
  );

  return (
    <NodeViewWrapper>
      <Box sx={{
        border: 1, borderRadius: 1, overflow: "hidden", my: 1,
        borderColor: showBorder ? "divider" : "transparent",
        ...(!showBorder && {
          "& > [data-block-toolbar]": {
            maxHeight: 0, opacity: 0, py: 0, overflow: "hidden",
          },
        }),
      }}>
        {toolbar}
        {isDiagramLayout
          ? <Box sx={allCollapsed ? { position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" } : {}}>{preElement}</Box>
          : preElement
        }
        {children}
      </Box>
      {afterFrame}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t("delete")}</DialogTitle>
        <DialogContent><Typography>{t("clearConfirm")}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t("cancel")}</Button>
          <Button color="error" variant="contained" onClick={() => { setDeleteDialogOpen(false); handleDeleteBlock(); }}>{t("delete")}</Button>
        </DialogActions>
      </Dialog>
    </NodeViewWrapper>
  );
}
