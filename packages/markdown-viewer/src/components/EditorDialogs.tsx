"use client";

import HelpCenterIcon from "@mui/icons-material/HelpCenter";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useTheme } from "@mui/material/styles";
import React from "react";

import { getActionHover, getActionSelected, getDivider, getTextSecondary } from "../constants/colors";
import { Button } from "../ui/Button";
import { Dialog, DialogActions, DialogContent, DialogTitle } from "../ui/Dialog";
import { TextField } from "../ui/TextField";
import { SHORTCUT_HINT_FONT_SIZE } from "../constants/dimensions";
import { KEYBOARD_SHORTCUTS } from "../constants/shortcuts";
import type { TranslationFn } from "../types";
import { Text } from "../ui/Text";
import { APP_VERSION } from "../version";
import styles from "./EditorDialogs.module.css";

interface EditorDialogsProps {
  commentDialogOpen: boolean;
  setCommentDialogOpen: (open: boolean) => void;
  commentText: string;
  setCommentText: (text: string) => void;
  handleCommentInsert: () => void;
  linkDialogOpen: boolean;
  setLinkDialogOpen: (open: boolean) => void;
  linkUrl: string;
  setLinkUrl: (url: string) => void;
  handleLinkInsert: () => void;
  imageDialogOpen: boolean;
  setImageDialogOpen: (open: boolean) => void;
  imageUrl: string;
  setImageUrl: (url: string) => void;
  imageAlt: string;
  setImageAlt: (alt: string) => void;
  handleImageInsert: () => void;
  imageEditMode?: boolean;
  shortcutDialogOpen: boolean;
  setShortcutDialogOpen: (open: boolean) => void;
  versionDialogOpen: boolean;
  setVersionDialogOpen: (open: boolean) => void;
  locale: "en" | "ja";
  t: TranslationFn;
}

export const EditorDialogs = React.memo(function EditorDialogs({
  commentDialogOpen,
  setCommentDialogOpen,
  commentText,
  setCommentText,
  handleCommentInsert,
  linkDialogOpen,
  setLinkDialogOpen,
  linkUrl,
  setLinkUrl,
  handleLinkInsert,
  imageDialogOpen,
  setImageDialogOpen,
  imageUrl,
  setImageUrl,
  imageAlt,
  setImageAlt,
  handleImageInsert,
  imageEditMode,
  shortcutDialogOpen,
  setShortcutDialogOpen,
  versionDialogOpen,
  setVersionDialogOpen,
  locale: _locale,
  t,
}: EditorDialogsProps) {
  const isDark = useTheme().palette.mode === "dark";
  const [touched, setTouched] = React.useState<Set<string>>(new Set());
  const markTouched = React.useCallback((field: string) => setTouched((prev) => new Set(prev).add(field)), []);

  // Reset touched state when dialogs open
  React.useEffect(() => { if (commentDialogOpen) setTouched(new Set()); }, [commentDialogOpen]);
  React.useEffect(() => { if (linkDialogOpen) setTouched(new Set()); }, [linkDialogOpen]);
  React.useEffect(() => { if (imageDialogOpen) setTouched(new Set()); }, [imageDialogOpen]);

  return (
    <>
      {/* Comment input dialog */}
      <Dialog
        open={commentDialogOpen}
        onClose={() => setCommentDialogOpen(false)}
        labelledBy="comment-dialog-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="comment-dialog-title">{t("comment")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            required
            multiline
            minRows={2}
            maxRows={8}
            label={t("commentPrompt")}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onBlur={() => markTouched("comment")}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCommentInsert(); }}
            error={touched.has("comment") && !commentText.trim()}
            helperText={touched.has("comment") && !commentText.trim() ? t("requiredField") : undefined}
            helperTextId="comment-helper"
            fullWidth
            size="small"
            style={{ marginTop: 8 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCommentDialogOpen(false)}>{t("cancel")}</Button>
          <Button variant="contained" onClick={handleCommentInsert} disabled={!commentText.trim()}>
            {t("insert")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Link insert dialog (H-6) */}
      <Dialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        labelledBy="link-dialog-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="link-dialog-title">{t("link")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            required
            label={t("linkUrl")}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onBlur={() => markTouched("linkUrl")}
            onKeyDown={(e) => { if (e.key === "Enter") handleLinkInsert(); }}
            error={touched.has("linkUrl") && !linkUrl.trim()}
            helperText={touched.has("linkUrl") && !linkUrl.trim() ? t("requiredField") : undefined}
            helperTextId="link-url-helper"
            fullWidth
            size="small"
            style={{ marginTop: 8 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogOpen(false)}>{t("cancel")}</Button>
          <Button variant="contained" onClick={handleLinkInsert} disabled={!linkUrl.trim()}>
            {t("insert")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Image insert dialog (H-6) */}
      <Dialog
        open={imageDialogOpen}
        onClose={() => setImageDialogOpen(false)}
        labelledBy="image-dialog-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="image-dialog-title">{t("image")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus={!imageUrl.startsWith("data:")}
            required
            label={t("imageUrl")}
            value={imageUrl.startsWith("data:") ? "(base64)" : imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onBlur={() => markTouched("imageUrl")}
            error={touched.has("imageUrl") && !imageUrl.trim()}
            helperText={touched.has("imageUrl") && !imageUrl.trim() ? t("requiredField") : undefined}
            disabled={imageUrl.startsWith("data:")}
            helperTextId="image-url-helper"
            fullWidth
            size="small"
            style={{ marginTop: 8 }}
          />
          <TextField
            label={t("altText")}
            placeholder={t("altTextPlaceholder")}
            helperText={t("altTextGuidance")}
            value={imageAlt}
            onChange={(e) => setImageAlt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleImageInsert(); }}
            fullWidth
            size="small"
            style={{ marginTop: 16 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImageDialogOpen(false)}>{t("cancel")}</Button>
          <Button variant="contained" onClick={handleImageInsert} disabled={!imageUrl.trim()}>
            {imageEditMode ? t("apply") : t("insert")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Keyboard shortcuts dialog */}
      <Dialog
        open={shortcutDialogOpen}
        onClose={() => setShortcutDialogOpen(false)}
        labelledBy="shortcuts-dialog-title"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="shortcuts-dialog-title">
          <div className={styles.dialogTitleRow}>
            <HelpCenterIcon aria-hidden="true" style={{ color: getTextSecondary(isDark) }} />
            {t("shortcuts")}
          </div>
        </DialogTitle>
        <DialogContent dividers>
          {KEYBOARD_SHORTCUTS.map((group) => (
            <div key={group.categoryKey} className={styles.shortcutGroup}>
              <Text variant="subtitle2" style={{ color: getTextSecondary(isDark), marginBottom: 4 }}>
                {t(group.categoryKey)}
              </Text>
              {group.items.map((item) => (
                <div
                  key={item.keys}
                  className={styles.shortcutItemRow}
                  style={{ "--_shortcut-hover": getActionHover(isDark) } as React.CSSProperties}
                >
                  <Text variant="body2">{t(item.descKey)}</Text>
                  <div className={styles.shortcutKeysBox}>
                    {item.keys.split("+").map((key) => (
                      <Text
                        key={key}
                        variant="caption"
                        style={{
                          paddingLeft: 6,
                          paddingRight: 6,
                          paddingTop: 2,
                          paddingBottom: 2,
                          minWidth: 28,
                          textAlign: "center",
                          backgroundColor: getActionSelected(isDark),
                          borderRadius: 2,
                          fontFamily: "monospace",
                          fontSize: SHORTCUT_HINT_FONT_SIZE,
                          fontWeight: 600,
                          border: `1px solid ${getDivider(isDark)}`,
                          lineHeight: 1.4,
                        }}
                      >
                        {key}
                      </Text>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </DialogContent>
      </Dialog>

      {/* Version info dialog */}
      <Dialog open={versionDialogOpen} onClose={() => setVersionDialogOpen(false)} labelledBy="version-dialog-title" maxWidth="xs" fullWidth>
        <DialogTitle id="version-dialog-title">
          <div className={styles.dialogTitleRow}>
            <InfoOutlinedIcon style={{ color: getTextSecondary(isDark) }} />
            {t("versionInfo")}
          </div>
        </DialogTitle>
        <DialogContent dividers>
          <div className={styles.versionHeaderRow}>
            <img
              src={(globalThis as unknown as Record<string, unknown>).__LOGO_URI__ as string || "/images/anytime-markdown-128.png"}
              alt="Anytime Markdown"
              style={{ width: 40, height: 40 }}
            />
            <Text variant="h6" style={{ fontWeight: 700 }}>{t("versionName")}</Text>
          </div>
          <Text variant="caption" style={{ color: getTextSecondary(isDark) }}>v{APP_VERSION}</Text>
          <Text variant="body2" style={{ marginTop: 16 }}>{t("versionDescription")}</Text>
          <Text variant="caption" component="span" style={{ display: "block", marginTop: 16, color: getTextSecondary(isDark) }}>{t("versionTech")}</Text>
          <Text variant="caption" component="span" style={{ display: "block", marginTop: 8, color: getTextSecondary(isDark) }}>{t("versionCopyright")}</Text>
          <Text variant="caption" component="span" style={{ display: "block", marginTop: 4, color: getTextSecondary(isDark) }}>{t("versionLicense")}</Text>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVersionDialogOpen(false)} color="inherit">{t("close")}</Button>
        </DialogActions>
      </Dialog>

      {/* Help page dialog */}
    </>
  );
});
