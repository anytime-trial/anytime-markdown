import React from "react";

import { getDivider } from "../constants/colors";
import { useIsDark } from "../contexts/ThemeModeContext";
import { SIDE_TOOLBAR_ICON_SIZE, SIDE_TOOLBAR_WIDTH } from "../constants/dimensions";
import {
  ChatBubbleOutlineIcon,
  GitHubIcon,
  ListAltIcon,
  SettingsIcon,
} from "../ui/icons";
import { IconButton } from "../ui/IconButton";
import { Tooltip } from "../ui/Tooltip";
import styles from "./EditorSideToolbar.module.css";

interface EditorSideToolbarProps {
  sourceMode: boolean;
  outlineOpen: boolean;
  commentOpen: boolean;
  explorerOpen?: boolean;
  onToggleOutline?: () => void;
  onToggleComment: (open: boolean) => void;
  onToggleExplorer?: () => void;
  onOpenSettings?: () => void;
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
  onOpenSettings,
  t,
}: EditorSideToolbarProps) {
  const isDark = useIsDark();
  return (
    <div
      className={styles.root}
      style={{
        width: SIDE_TOOLBAR_WIDTH,
        border: `1px solid ${getDivider(isDark)}`,
      }}
    >
      <Tooltip title={t("outline")} placement="left">
        <IconButton
          size="small"
          aria-label={t("outline")}
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
          style={{
            width: SIDE_TOOLBAR_ICON_SIZE,
            height: SIDE_TOOLBAR_ICON_SIZE,
            color: outlineOpen ? "var(--am-color-primary-main)" : undefined,
          }}
        >
          <ListAltIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("commentPanel")} placement="left">
        <IconButton
          size="small"
          aria-label={t("commentPanel")}
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
          style={{
            width: SIDE_TOOLBAR_ICON_SIZE,
            height: SIDE_TOOLBAR_ICON_SIZE,
            color: commentOpen ? "var(--am-color-primary-main)" : undefined,
          }}
        >
          <ChatBubbleOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {onToggleExplorer && (
        <Tooltip title={t("explorer")} placement="left">
          <IconButton
            size="small"
            aria-label={t("explorer")}
            onClick={() => {
              if (explorerOpen) {
                onToggleExplorer?.();
              } else {
                if (outlineOpen) onToggleOutline?.();
                onToggleComment(false);
                onToggleExplorer?.();
              }
            }}
            style={{
              width: SIDE_TOOLBAR_ICON_SIZE,
              height: SIDE_TOOLBAR_ICON_SIZE,
              color: explorerOpen ? "var(--am-color-primary-main)" : undefined,
            }}
          >
            <GitHubIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {onOpenSettings && (
        <Tooltip title={t("editorSettings")} placement="left">
          <IconButton
            size="small"
            aria-label={t("editorSettings")}
            onClick={onOpenSettings}
            style={{ width: SIDE_TOOLBAR_ICON_SIZE, height: SIDE_TOOLBAR_ICON_SIZE }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
});
