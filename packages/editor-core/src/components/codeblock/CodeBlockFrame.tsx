"use client";

import type { SxProps, Theme } from "@mui/material";
import { Box } from "@mui/material";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";

import { DEFAULT_DARK_CODE_BG, DEFAULT_LIGHT_CODE_BG, getDivider } from "../../constants/colors";
import { useEditorSettingsContext } from "../../useEditorSettings";
import { DeleteBlockDialog } from "./DeleteBlockDialog";

interface CodeBlockFrameProps {
  /** Toolbar row rendered above the code editor */
  toolbar: React.ReactNode;
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
}: Readonly<CodeBlockFrameProps>) {
  const settings = useEditorSettingsContext();
  const hasCodeCollapse = codeCollapsed !== undefined;
  const maxH = codeMaxHeight ?? (hasCodeCollapse ? 200 : 400);

  const hiddenSx = { position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" } as const;
  const codeBg = isDark ? DEFAULT_DARK_CODE_BG : DEFAULT_LIGHT_CODE_BG;
  const baseSx = { m: 0, p: 1.5, fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight, bgcolor: codeBg, overflow: "auto", maxHeight: maxH };
  let preSx: SxProps<Theme>;
  if (hasCodeCollapse && codeCollapsed) {
    preSx = { ...hiddenSx, m: 0 };
  } else if (hasCodeCollapse) {
    preSx = {
      ...baseSx,
      transition: "max-height 0.2s, padding 0.2s, opacity 0.15s",
      "@media (prefers-reduced-motion: reduce)": { transition: "none" },
    };
  } else {
    preSx = baseSx;
  }

  const preElement = (
    <Box component="pre" spellCheck={false} sx={preSx}>
      {/* @ts-expect-error Tiptap NodeViewContent as prop type is too restrictive */}
      <NodeViewContent as="code" />
    </Box>
  );

  return (
    <NodeViewWrapper className="block-node-wrapper">
      <Box sx={{
        border: 1, borderRadius: 1, overflow: "hidden", my: 1,
        borderColor: showBorder ? getDivider(isDark) : "transparent",
        ...(!showBorder && {
          "& > [data-block-toolbar]": {
            maxHeight: 0, opacity: 0, py: 0, overflow: "hidden",
          },
        }),
      }}>
        {toolbar}
        {isDiagramLayout
          ? <Box sx={codeCollapsed ? { position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" } : {}}>{preElement}</Box>
          : preElement
        }
        {children}
      </Box>
      {afterFrame}
      <DeleteBlockDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onDelete={handleDeleteBlock}
        t={t}
      />
    </NodeViewWrapper>
  );
}
