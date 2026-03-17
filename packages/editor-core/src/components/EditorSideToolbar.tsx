import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import GitHubIcon from "@mui/icons-material/GitHub";
import ListAltIcon from "@mui/icons-material/ListAlt";
import { Box, IconButton, Tooltip } from "@mui/material";
import React from "react";

import { SIDE_TOOLBAR_ICON_SIZE, SIDE_TOOLBAR_WIDTH } from "../constants/dimensions";

interface EditorSideToolbarProps {
  sourceMode: boolean;
  outlineOpen: boolean;
  commentOpen: boolean;
  explorerOpen?: boolean;
  onToggleOutline?: () => void;
  onToggleComment: (open: boolean) => void;
  onToggleExplorer?: () => void;
  t: (key: string) => string;
}

export const EditorSideToolbar = React.memo(function EditorSideToolbar({
  sourceMode,
  outlineOpen,
  commentOpen,
  explorerOpen,
  onToggleOutline,
  onToggleComment,
  onToggleExplorer,
  t,
}: EditorSideToolbarProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: SIDE_TOOLBAR_WIDTH,
        py: 1,
        gap: 0.5,
        borderLeft: 1,
        borderRight: 1,
        borderTop: 1,
        borderColor: "divider",
        flexShrink: 0,
      }}
    >
      <Tooltip title={t("outline")} placement="left">
        <IconButton
          size="small"
          onClick={() => {
            if (outlineOpen) {
              onToggleOutline?.();
            } else {
              onToggleComment(false);
              if (explorerOpen) onToggleExplorer?.();
              onToggleOutline?.();
            }
          }}
          disabled={sourceMode}
          color={outlineOpen ? "primary" : "default"}
          sx={{ width: SIDE_TOOLBAR_ICON_SIZE, height: SIDE_TOOLBAR_ICON_SIZE }}
        >
          <ListAltIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("commentPanel")} placement="left">
        <IconButton
          size="small"
          onClick={() => {
            if (commentOpen) {
              onToggleComment(false);
            } else {
              if (outlineOpen) onToggleOutline?.();
              if (explorerOpen) onToggleExplorer?.();
              onToggleComment(true);
            }
          }}
          disabled={sourceMode}
          color={commentOpen ? "primary" : "default"}
          sx={{ width: SIDE_TOOLBAR_ICON_SIZE, height: SIDE_TOOLBAR_ICON_SIZE }}
        >
          <ChatBubbleOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {onToggleExplorer && (
        <Tooltip title={t("explorer")} placement="left">
          <IconButton
            size="small"
            onClick={() => {
              if (explorerOpen) {
                onToggleExplorer?.();
              } else {
                if (outlineOpen) onToggleOutline?.();
                onToggleComment(false);
                onToggleExplorer?.();
              }
            }}
            color={explorerOpen ? "primary" : "default"}
            sx={{ width: SIDE_TOOLBAR_ICON_SIZE, height: SIDE_TOOLBAR_ICON_SIZE }}
          >
            <GitHubIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
});
