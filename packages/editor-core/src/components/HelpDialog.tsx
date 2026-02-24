"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from "@mui/material";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { KEYBOARD_SHORTCUTS } from "../constants/shortcuts";

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
  locale: "en" | "ja";
  t: (key: string) => string;
}

/** Kbd-style chip for shortcut keys (matches shortcut dialog style) */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      component="span"
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
      {children}
    </Typography>
  );
}

/** Section heading with icon */
function SectionTitle({ id, icon, children }: { id?: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Typography
      id={id}
      variant="subtitle1"
      sx={{ fontWeight: 700, mt: 3, mb: 1, display: "flex", alignItems: "center", gap: 1, "&:first-of-type": { mt: 0 } }}
    >
      <Box sx={{ color: "text.secondary", display: "flex", alignItems: "center" }}>{icon}</Box>
      {children}
    </Typography>
  );
}

/** Generate a slug from heading text for use as an id */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Extract headings from HTML and add id attributes */
function processHtml(raw: string): { html: string; headings: { id: string; text: string; level: number }[] } {
  const headings: { id: string; text: string; level: number }[] = [];
  const processed = raw.replace(/<h([23])>(.*?)<\/h\1>/g, (_match, level: string, text: string) => {
    const plainText = text.replace(/<[^>]*>/g, "");
    const id = slugify(plainText);
    headings.push({ id, text: plainText, level: parseInt(level) });
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
  return { html: processed, headings };
}

export function HelpDialog({ open, onClose, locale, t }: HelpDialogProps) {
  const [rawHtml, setRawHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/help/help-${locale}.md`)
      .then((res) => res.text())
      .then((md) => {
        if (cancelled) return;
        const result = marked.parse(md);
        if (typeof result === "string") {
          setRawHtml(result);
          setLoading(false);
        } else {
          result.then((html) => {
            if (!cancelled) {
              setRawHtml(html);
              setLoading(false);
            }
          });
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, locale]);

  const { html, headings } = useMemo(() => {
    const processed = processHtml(rawHtml);
    return { html: DOMPurify.sanitize(processed.html), headings: processed.headings };
  }, [rawHtml]);

  // Add keyboard shortcuts heading to TOC
  const shortcutsId = "help-keyboard-shortcuts";
  const allHeadings = useMemo(() => [
    ...headings,
    { id: shortcutsId, text: t("helpShortcuts"), level: 2 },
  ], [headings, t]);

  const handleTocClick = useCallback((id: string) => {
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" aria-labelledby="help-dialog-title">
      <DialogTitle id="help-dialog-title" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <MenuBookIcon sx={{ color: "text.secondary" }} />
        {t("helpPage")}
      </DialogTitle>
      <DialogContent dividers ref={contentRef} sx={{ display: "flex", p: 0 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4, width: "100%" }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <>
            {/* TOC sidebar */}
            <Box
              sx={{
                width: 200,
                minWidth: 200,
                borderRight: 1,
                borderColor: "divider",
                overflow: "auto",
                position: "sticky",
                top: 0,
                alignSelf: "flex-start",
                maxHeight: "100%",
              }}
            >
              <Typography variant="caption" sx={{ px: 2, pt: 1.5, pb: 0.5, display: "block", fontWeight: 600, color: "text.secondary" }}>
                {locale === "ja" ? "目次" : "Contents"}
              </Typography>
              <List dense disablePadding>
                {allHeadings.map((h) => (
                  <ListItemButton
                    key={h.id}
                    onClick={() => handleTocClick(h.id)}
                    sx={{ py: 0.25, pl: h.level === 3 ? 3 : 2, pr: 1 }}
                  >
                    <ListItemText
                      primary={h.text}
                      primaryTypographyProps={{ fontSize: "0.75rem", lineHeight: 1.4, noWrap: true }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>

            {/* Main content */}
            <Box sx={{ flex: 1, overflow: "auto", p: 3 }}>
              {/* Markdown-rendered sections */}
              <Box
                dangerouslySetInnerHTML={{ __html: html }}
                sx={{
                  "& h2": {
                    fontWeight: 700,
                    fontSize: "1rem",
                    mt: 3,
                    mb: 1,
                    "&:first-of-type": { mt: 0 },
                  },
                  "& h3": {
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    mt: 2,
                    mb: 0.5,
                  },
                  "& p": {
                    fontSize: "0.875rem",
                    mb: 1,
                    lineHeight: 1.6,
                  },
                  "& img": {
                    maxWidth: "100%",
                    height: "auto",
                    border: 1,
                    borderColor: "divider",
                    borderStyle: "solid",
                    borderRadius: "4px",
                    my: 1.5,
                    display: "block",
                  },
                  "& table": {
                    width: "100%",
                    borderCollapse: "collapse",
                    mb: 2,
                    fontSize: "0.875rem",
                  },
                  "& th, & td": {
                    border: 1,
                    borderColor: "divider",
                    borderStyle: "solid",
                    px: 1.5,
                    py: 0.75,
                    textAlign: "left",
                    lineHeight: 1.6,
                  },
                  "& th": {
                    fontWeight: 600,
                    bgcolor: "action.hover",
                  },
                  "& ul": {
                    pl: 3,
                    mb: 2,
                    "& li": {
                      mb: 0.5,
                      fontSize: "0.875rem",
                      lineHeight: 1.6,
                    },
                  },
                }}
              />

              {/* Keyboard Shortcuts (dynamic, OS-dependent) */}
              <SectionTitle id={shortcutsId} icon={<KeyboardIcon fontSize="small" />}>{t("helpShortcuts")}</SectionTitle>
              <Typography variant="body2" sx={{ mb: 1 }}>{t("helpShortcutsDesc")}</Typography>
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
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </Box>
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">{t("close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
