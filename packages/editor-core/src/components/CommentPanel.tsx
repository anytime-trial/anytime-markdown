"use client";
import CloseIcon from "@mui/icons-material/Close";
import ImageIcon from "@mui/icons-material/Image";
import {
  Box,
  Button,
  ButtonBase,
  Divider,
  IconButton,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import React, { useCallback, useMemo, useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getActionHover, getDivider, getPrimaryMain, getTextDisabled, getTextSecondary } from "../constants/colors";
import { BADGE_NUMBER_FONT_SIZE, COMMENT_BODY_FONT_SIZE, COMMENT_INPUT_FONT_SIZE, COMMENT_PANEL_WIDTH, PANEL_BUTTON_FONT_SIZE, PANEL_HEADER_MIN_HEIGHT, SMALL_BUTTON_FONT_SIZE, SMALL_CAPTION_FONT_SIZE } from "../constants/dimensions";
import { commentDataPluginKey } from "../extensions/commentExtension";
import type { TranslationFn } from "../types";
import type { ImageAnnotation } from "../types/imageAnnotation";
import { parseAnnotations, serializeAnnotations } from "../types/imageAnnotation";
import type { InlineComment } from "../utils/commentHelpers";

interface CommentPanelProps {
  editor: Editor;
  open: boolean;
  onClose: () => void;
  onSave?: () => void;
  t: TranslationFn;
}

/**
 * ドキュメント内でコメントIDに対応するテキストまたは位置を取得する。
 */
function findCommentInDoc(
  editor: Editor,
  commentId: string,
): { text: string; pos: number; isPoint: boolean } | null {
  let result: { text: string; pos: number; isPoint: boolean } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (result) return false;
    // Point Node
    if (
      node.type.name === "commentPoint" &&
      node.attrs.commentId === commentId
    ) {
      result = { text: "", pos, isPoint: true };
      return false;
    }
    // Mark
    if (node.isText) {
      const mark = node.marks.find(
        (m) =>
          m.type.name === "commentHighlight" &&
          m.attrs.commentId === commentId,
      );
      if (mark) {
        result = { text: node.text || "", pos, isPoint: false };
        return false;
      }
    }
  });
  return result;
}

export const CommentPanel = React.memo(function CommentPanel({
  editor,
  open,
  onClose,
  onSave,
  t,
}: CommentPanelProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback((comment: InlineComment, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(comment.id);
    setEditText(comment.text);
    setTimeout(() => editRef.current?.focus(), 50);
  }, []);

  const commitEdit = useCallback(() => {
    if (editingId) {
      editor.commands.updateCommentText(editingId, editText);
      onSave?.();
      setEditingId(null);
    }
  }, [editor, editingId, editText, onSave]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  // Plugin State からコメント一覧を購読
  const comments = useEditorState({
    editor,
    selector: (ctx) => {
      const state = commentDataPluginKey.getState(ctx.editor.state) as
        | { comments: Map<string, InlineComment> }
        | undefined;
      return state?.comments ?? new Map<string, InlineComment>();
    },
  });

  // 画像アノテーションをドキュメントから収集（全アノテーション）
  const imageAnnotations = useEditorState({
    editor,
    selector: (ctx) => {
      const result: { pos: number; src: string; allAnnotations: ImageAnnotation[]; annotations: ImageAnnotation[] }[] = [];
      ctx.editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "image" && node.attrs.annotations) {
          const allAnnotations = parseAnnotations(node.attrs.annotations as string);
          const withComments = allAnnotations.filter(a => a.comment);
          if (withComments.length > 0) {
            result.push({ pos, src: node.attrs.src as string, allAnnotations, annotations: withComments });
          }
        }
      });
      return result;
    },
  });

  const totalImageAnnotations = useMemo(
    () => imageAnnotations.reduce((sum, img) => sum + img.annotations.length, 0),
    [imageAnnotations],
  );

  const unresolvedImageAnnotations = useMemo(
    () => imageAnnotations.reduce((sum, img) => sum + img.annotations.filter(a => !a.resolved).length, 0),
    [imageAnnotations],
  );

  /** 画像アノテーションの resolved を切替 */
  const toggleAnnotationResolved = useCallback((imgPos: number, annotationId: string) => {
    const node = editor.state.doc.nodeAt(imgPos);
    if (!node || node.type.name !== "image") return;
    const all = parseAnnotations(node.attrs.annotations as string);
    const updated = all.map(a => a.id === annotationId ? { ...a, resolved: !a.resolved } : a);
    const { tr } = editor.state;
    tr.setNodeMarkup(imgPos, undefined, { ...node.attrs, annotations: serializeAnnotations(updated) });
    editor.view.dispatch(tr);
    onSave?.();
  }, [editor, onSave]);

  /** 画像アノテーションを削除 */
  const deleteAnnotation = useCallback((imgPos: number, annotationId: string) => {
    const node = editor.state.doc.nodeAt(imgPos);
    if (!node || node.type.name !== "image") return;
    const all = parseAnnotations(node.attrs.annotations as string);
    const updated = all.filter(a => a.id !== annotationId);
    const { tr } = editor.state;
    tr.setNodeMarkup(imgPos, undefined, { ...node.attrs, annotations: serializeAnnotations(updated) });
    editor.view.dispatch(tr);
    onSave?.();
  }, [editor, onSave]);

  if (!open) return null;

  const allComments = Array.from(comments.values());
  const unresolvedCount = allComments.filter((c) => !c.resolved).length;

  const filtered = allComments.filter((c) => {
    if (filter === "open") return !c.resolved;
    if (filter === "resolved") return c.resolved;
    return true;
  });

  const handleClick = (commentId: string) => {
    const found = findCommentInDoc(editor, commentId);
    if (found) {
      editor.chain().setTextSelection(found.pos + 1).focus().run();
      // スクロール
      const domAtPos = editor.view.domAtPos(found.pos + 1);
      const el =
        domAtPos.node instanceof HTMLElement
          ? domAtPos.node
          : domAtPos.node.parentElement;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        width: COMMENT_PANEL_WIDTH,
        minWidth: COMMENT_PANEL_WIDTH,
        borderLeft: 1,
        borderColor: getDivider(isDark),
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1,
          minHeight: PANEL_HEADER_MIN_HEIGHT,
          borderBottom: 1,
          borderColor: getDivider(isDark),
        }}
      >
        <Typography variant="subtitle2" aria-live="polite" aria-atomic="true" sx={{ flex: 1, fontWeight: 700 }}>
          {t("commentPanel") || "Comments"} ({unresolvedCount + unresolvedImageAnnotations}/
          {allComments.length + totalImageAnnotations})
        </Typography>
        <IconButton
          size="small"
          onClick={onClose}
          aria-label={t("close") || "Close"}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* Filter */}
      <Box sx={{ px: 1, py: 0.5 }}>
        <ToggleButtonGroup
          value={filter}
          exclusive
          onChange={(_, v) => {
            if (v) setFilter(v);
          }}
          size="small"
          fullWidth
          aria-label={t("commentPanel")}
        >
          <ToggleButton
            value="all"
            sx={{ py: 0.25, fontSize: PANEL_BUTTON_FONT_SIZE }}
          >
            {t("commentFilterAll") || "All"}
          </ToggleButton>
          <ToggleButton
            value="open"
            sx={{ py: 0.25, fontSize: PANEL_BUTTON_FONT_SIZE }}
          >
            {t("commentFilterOpen") || "Open"}
          </ToggleButton>
          <ToggleButton
            value="resolved"
            sx={{ py: 0.25, fontSize: PANEL_BUTTON_FONT_SIZE }}
          >
            {t("commentFilterResolved") || "Resolved"}
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Comment list */}
      <Box sx={{ flex: 1, overflow: "auto", p: 1 }}>
        {filtered.length === 0 && (
          <Typography
            variant="body2"
            sx={{ textAlign: "center", mt: 2, color: getTextSecondary(isDark) }}
          >
            {filter === "all"
              ? t("noComments")
              : filter === "open"
                ? t("noOpenComments")
                : t("noResolvedComments")}
          </Typography>
        )}
        {filtered.map((comment) => {
          const found = findCommentInDoc(editor, comment.id);
          return (
            <ButtonBase
              key={comment.id}
              component="div"
              onClick={() => handleClick(comment.id)}
              sx={{
                display: "block",
                textAlign: "left",
                width: "100%",
                mb: 1,
                p: 1,
                border: 1,
                borderColor: getDivider(isDark),
                borderRadius: 1,
                cursor: "pointer",
                opacity: comment.resolved ? 0.5 : 1,
                "&:hover, &:focus-visible": { bgcolor: getActionHover(isDark) },
                "&:focus-visible": { outline: "2px solid", outlineColor: getPrimaryMain(isDark), outlineOffset: -2 },
              }}
            >
              {/* Target text */}
              {found && !found.isPoint && found.text && (
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    mb: 0.5,
                    fontStyle: "italic",
                    color: getTextSecondary(isDark),
                    borderLeft: 2,
                    borderColor: getDivider(isDark),
                    pl: 1,
                    maxHeight: "2.8em",
                    overflow: "hidden",
                  }}
                >
                  &ldquo;{found.text}&rdquo;
                </Typography>
              )}
              {found?.isPoint && (
                <Typography
                  variant="caption"
                  sx={{ display: "block", mb: 0.5, color: getTextSecondary(isDark) }}
                >
                  {t("commentPointLabel") || "Point comment"}
                </Typography>
              )}
              {/* Comment text */}
              {editingId === comment.id ? (
                <TextField
                  inputRef={editRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEdit(); }
                    if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={commitEdit}
                  multiline
                  size="small"
                  fullWidth
                  sx={{ mb: 0.5, "& .MuiInputBase-input": { fontSize: COMMENT_INPUT_FONT_SIZE, p: 0.75 } }}
                />
              ) : (
                <Typography
                  variant="body2"
                  onClick={(e) => startEdit(comment, e)}
                  sx={{
                    mb: 0.5,
                    cursor: "text",
                    minHeight: "1.4em",
                    "&:hover": { bgcolor: getActionHover(isDark), borderRadius: 0.5 },
                  }}
                >
                  {comment.text || <Box component="span" sx={{ color: getTextDisabled(isDark), fontStyle: "italic" }}>{t("commentPlaceholder") || "Add comment..."}</Box>}
                </Typography>
              )}
              {/* Actions */}
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Button
                  size="small"
                  variant="text"
                  sx={{ fontSize: SMALL_BUTTON_FONT_SIZE, minWidth: 0, px: 0.5 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (comment.resolved) {
                      editor.commands.unresolveComment(comment.id);
                    } else {
                      editor.commands.resolveComment(comment.id);
                    }
                    onSave?.();
                  }}
                >
                  {comment.resolved
                    ? t("commentUnresolve") || "Reopen"
                    : t("commentResolve") || "Resolve"}
                </Button>
                <Button
                  size="small"
                  variant="text"
                  color="error"
                  sx={{ fontSize: SMALL_BUTTON_FONT_SIZE, minWidth: 0, px: 0.5 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    editor.commands.removeComment(comment.id);
                  }}
                >
                  {t("commentDelete") || "Delete"}
                </Button>
              </Box>
            </ButtonBase>
          );
        })}

        {/* 画像アノテーションコメント */}
        {imageAnnotations.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" sx={{ display: "flex", alignItems: "center", gap: 0.5, color: getTextSecondary(isDark), fontWeight: 700, mb: 0.5 }}>
              <ImageIcon sx={{ fontSize: 14 }} />
              {t("annotate")} ({unresolvedImageAnnotations}/{totalImageAnnotations})
            </Typography>
            {imageAnnotations.map((img) => {
              const filteredAnnotations = img.annotations.filter((a) => {
                if (filter === "open") return !a.resolved;
                if (filter === "resolved") return !!a.resolved;
                return true;
              });
              if (filteredAnnotations.length === 0) return null;
              return (
              <Box key={img.pos}>
                {filteredAnnotations.map((a, i) => (
                  <Box
                    key={a.id}
                    sx={{
                      mb: 0.5, p: 0.75,
                      border: 1,
                      borderColor: getDivider(isDark),
                      borderRadius: 1,
                      opacity: a.resolved ? 0.5 : 1,
                    }}
                  >
                    <ButtonBase
                      component="div"
                      onClick={() => {
                        editor.chain().setTextSelection(img.pos).focus().run();
                        const domAtPos = editor.view.domAtPos(img.pos);
                        const el = domAtPos.node instanceof HTMLElement ? domAtPos.node : domAtPos.node.parentElement;
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      sx={{ display: "block", textAlign: "left", width: "100%", cursor: "pointer" }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.25 }}>
                        <Box sx={{
                          width: 16, height: 16, borderRadius: "50%", bgcolor: a.color,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          <Typography variant="caption" sx={{ color: "white", fontSize: BADGE_NUMBER_FONT_SIZE, fontWeight: 700 }}>{i + 1}</Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: getTextSecondary(isDark), fontSize: SMALL_CAPTION_FONT_SIZE }}>
                          {a.type === "rect" ? t("annotationRect") : a.type === "circle" ? t("annotationCircle") : t("annotationLine")}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: COMMENT_BODY_FONT_SIZE, mb: 0.5 }}>
                        {a.comment}
                      </Typography>
                    </ButtonBase>
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      <Button
                        size="small"
                        variant="text"
                        sx={{ fontSize: SMALL_BUTTON_FONT_SIZE, minWidth: 0, px: 0.5 }}
                        onClick={() => toggleAnnotationResolved(img.pos, a.id)}
                      >
                        {a.resolved
                          ? t("commentUnresolve") || "Reopen"
                          : t("commentResolve") || "Resolve"}
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        color="error"
                        sx={{ fontSize: SMALL_BUTTON_FONT_SIZE, minWidth: 0, px: 0.5 }}
                        onClick={() => deleteAnnotation(img.pos, a.id)}
                      >
                        {t("commentDelete") || "Delete"}
                      </Button>
                    </Box>
                  </Box>
                ))}
              </Box>
              );
            })}
          </>
        )}
      </Box>
    </Paper>
  );
});
