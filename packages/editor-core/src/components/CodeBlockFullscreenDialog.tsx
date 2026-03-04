import React from "react";
import { Box, Dialog, DialogTitle, IconButton, Tooltip, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useEditorSettingsContext } from "../useEditorSettings";
import { FsSearchBar } from "./FsSearchBar";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";

interface CodeBlockFullscreenDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  fsCode: string;
  onFsCodeChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  fsTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fsSearch: TextareaSearchState;
  t: (key: string) => string;
}

export function CodeBlockFullscreenDialog({
  open, onClose, label, fsCode, onFsCodeChange, fsTextareaRef, fsSearch, t,
}: CodeBlockFullscreenDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      aria-labelledby="codeblock-fullscreen-title"
      slotProps={{ paper: { sx: { bgcolor: settings.editorBg === "grey" && !isDark ? "grey.50" : undefined, display: "flex", flexDirection: "column" } } }}
      onKeyDown={(e: React.KeyboardEvent) => {
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
          {label}
        </DialogTitle>
        {/* Search & Replace bar */}
        <FsSearchBar search={fsSearch} t={t} />
        <Box sx={{ flex: 1 }} />
        <Tooltip title={t("close")} placement="bottom">
          <IconButton size="small" onClick={onClose} sx={{ ml: 1 }} aria-label={t("close")}>
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box
        component="textarea"
        ref={fsTextareaRef}
        value={fsCode}
        onChange={onFsCodeChange}
        spellCheck={false}
        aria-label={t("codeBlock")}
        sx={{
          flex: 1,
          width: "100%",
          border: "none",
          outline: "none",
          resize: "none",
          fontFamily: "monospace",
          fontSize: `${settings.fontSize}px`,
          lineHeight: settings.lineHeight,
          p: 2,
          color: "text.primary",
          bgcolor: "background.paper",
          boxSizing: "border-box",
          overflow: "auto",
        }}
      />
    </Dialog>
  );
}
