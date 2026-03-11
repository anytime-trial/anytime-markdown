import CloseIcon from "@mui/icons-material/Close";
import { Box, Dialog, DialogTitle, IconButton, Tooltip, useTheme } from "@mui/material";
import React from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from "../constants/colors";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import { useEditorSettingsContext } from "../useEditorSettings";
import { FsSearchBar } from "./FsSearchBar";
import { FullscreenDiffView } from "./FullscreenDiffView";

interface CodeBlockFullscreenDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  fsCode: string;
  onFsCodeChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  fsTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fsSearch: TextareaSearchState;
  isCompareMode?: boolean;
  compareCode?: string | null;
  onMergeApply?: (newThisCode: string, newOtherCode: string) => void;
  t: (key: string) => string;
}

const textareaSx = (fontSize: number, lineHeight: number, isDark: boolean) => ({
  flex: 1,
  width: "100%",
  border: "none",
  outline: "none",
  resize: "none",
  fontFamily: "monospace",
  fontSize: `${fontSize}px`,
  lineHeight,
  p: 2,
  color: "text.primary",
  bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
  boxSizing: "border-box",
  overflow: "auto",
} as const);

export function CodeBlockFullscreenDialog({
  open, onClose, label, fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
  isCompareMode, compareCode, onMergeApply,
  t,
}: CodeBlockFullscreenDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();

  const showCompareView = isCompareMode && compareCode != null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      aria-labelledby="codeblock-fullscreen-title"
      slotProps={{ paper: { sx: { bgcolor: settings.editorBg === "grey" && !isDark ? "grey.50" : undefined, display: "flex", flexDirection: "column" } } }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (showCompareView) return;
        const mod = e.metaKey || e.ctrlKey;
        if (mod && (e.key === "f" || e.key === "h")) {
          e.preventDefault();
          e.stopPropagation();
          fsSearch.focusSearch();
        }
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1, borderBottom: 1, borderColor: "divider", position: "relative" }}>
        <DialogTitle id="codeblock-fullscreen-title" sx={{ p: 0, fontSize: "0.875rem", fontWeight: 600, mr: 1 }}>
          {label}{showCompareView ? ` - ${t("compare")}` : ""}
        </DialogTitle>
        {!showCompareView && (
          <FsSearchBar search={fsSearch} t={t} />
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={t("close")} placement="bottom">
          <IconButton size="small" onClick={onClose} sx={{ ml: 1 }} aria-label={t("close")}>
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {showCompareView ? (
        <FullscreenDiffView
          initialLeftCode={fsCode}
          initialRightCode={compareCode}
          onMergeApply={onMergeApply ?? (() => {})}
          t={t}
        />
      ) : (
        <Box
          component="textarea"
          ref={fsTextareaRef}
          value={fsCode}
          onChange={onFsCodeChange}
          spellCheck={false}
          aria-label={t("codeBlock")}
          sx={textareaSx(settings.fontSize, settings.lineHeight, isDark)}
        />
      )}
    </Dialog>
  );
}
