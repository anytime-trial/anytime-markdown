"use client";

import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import HelpCenterIcon from "@mui/icons-material/HelpCenter";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { KEYBOARD_SHORTCUTS } from "../constants/shortcuts";
import { APP_VERSION } from "../version";
import { HelpDialog } from "./HelpDialog";
import type { TranslationFn } from "../types";

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
  helpDialogOpen: boolean;
  setHelpDialogOpen: (open: boolean) => void;
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
  helpDialogOpen,
  setHelpDialogOpen,
  locale: _locale,
  t,
}: EditorDialogsProps) {
  return (
    <>
      {/* Comment input dialog */}
      <Dialog
        open={commentDialogOpen}
        onClose={() => setCommentDialogOpen(false)}
        aria-labelledby="comment-dialog-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="comment-dialog-title">{t("comment")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            multiline
            minRows={2}
            maxRows={8}
            label={t("commentPrompt")}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCommentInsert(); }}
            fullWidth
            size="small"
            sx={{ mt: 1 }}
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
        aria-labelledby="link-dialog-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="link-dialog-title">{t("link")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label={t("linkUrl")}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleLinkInsert(); }}
            fullWidth
            size="small"
            sx={{ mt: 1 }}
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
        aria-labelledby="image-dialog-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="image-dialog-title">{t("image")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label={t("imageUrl")}
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            fullWidth
            size="small"
            sx={{ mt: 1 }}
          />
          <TextField
            label={t("altText")}
            value={imageAlt}
            onChange={(e) => setImageAlt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleImageInsert(); }}
            fullWidth
            size="small"
            sx={{ mt: 2 }}
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
        aria-labelledby="shortcuts-dialog-title"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="shortcuts-dialog-title" sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
          <HelpCenterIcon aria-hidden="true" sx={{ color: "text.secondary" }} />
          {t("shortcuts")}
        </DialogTitle>
        <DialogContent dividers>
          {KEYBOARD_SHORTCUTS.map((group) => (
            <Box key={group.categoryKey} sx={{ mb: 2, "&:last-child": { mb: 0 } }}>
              <Typography variant="subtitle2" sx={{ color: "text.secondary", mb: 0.5 }}>
                {t(group.categoryKey)}
              </Typography>
              {group.items.map((item) => (
                <Box
                  key={item.keys}
                  sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 0.5, px: 1, borderRadius: 0.5, "&:hover": { bgcolor: "action.hover" } }}
                >
                  <Typography variant="body2">{t(item.descKey)}</Typography>
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    {item.keys.split("+").map((key) => (
                      <Typography
                        key={key}
                        variant="caption"
                        sx={{
                          px: 0.75,
                          py: 0.25,
                          minWidth: 28,
                          textAlign: "center",
                          bgcolor: "action.selected",
                          borderRadius: 0.5,
                          fontFamily: "monospace",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          border: 1,
                          borderColor: "divider",
                          lineHeight: 1.4,
                        }}
                      >
                        {key}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          ))}
        </DialogContent>
      </Dialog>

      {/* Version info dialog */}
      <Dialog open={versionDialogOpen} onClose={() => setVersionDialogOpen(false)} aria-labelledby="version-dialog-title" maxWidth="xs" fullWidth>
        <DialogTitle id="version-dialog-title" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <InfoOutlinedIcon sx={{ color: "text.secondary" }} />
          {t("versionInfo")}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box component="img" src={(window as unknown as Record<string, unknown>).__LOGO_URI__ as string || "/help/camel_markdown.png"} alt="Anytime Markdown" sx={{ width: 40, height: 40 }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{t("versionName")}</Typography>
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>v{APP_VERSION}</Typography>
          <Typography variant="body2" sx={{ mt: 2 }}>{t("versionDescription")}</Typography>
          <Typography variant="caption" sx={{ display: "block", mt: 2, color: "text.secondary" }}>{t("versionTech")}</Typography>
          <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>{t("versionCopyright")}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVersionDialogOpen(false)} color="inherit">{t("close")}</Button>
        </DialogActions>
      </Dialog>

      {/* Help page dialog */}
      <HelpDialog open={helpDialogOpen} onClose={() => setHelpDialogOpen(false)} t={t} />
    </>
  );
});
