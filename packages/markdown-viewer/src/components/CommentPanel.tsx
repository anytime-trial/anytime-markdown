"use client";
import CloseIcon from "@mui/icons-material/Close";
import ImageIcon from "@mui/icons-material/Image";
import {
  ButtonBase,
  TextField,
  useTheme,
} from "@mui/material";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { ToggleButton } from "../ui/ToggleButton";
import { ToggleButtonGroup } from "../ui/ToggleButtonGroup";
import type { Editor } from "@anytime-markdown/markdown-react";
import { useEditorState } from "@anytime-markdown/markdown-react";
import React, { useCallback, useMemo, useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getActionHover, getDivider, getPrimaryMain, getTextDisabled, getTextSecondary } from "../constants/colors";
import { BADGE_NUMBER_FONT_SIZE, COMMENT_BODY_FONT_SIZE, COMMENT_INPUT_FONT_SIZE, COMMENT_PANEL_WIDTH, PANEL_BUTTON_FONT_SIZE, PANEL_HEADER_MIN_HEIGHT, SMALL_BUTTON_FONT_SIZE, SMALL_CAPTION_FONT_SIZE } from "../constants/dimensions";
import { commentDataPluginKey } from "../extensions/commentExtension";
import type { TranslationFn } from "../types";
import type { ImageAnnotation } from "../types/imageAnnotation";
import { parseAnnotations, serializeAnnotations } from "../types/imageAnnotation";
import type { InlineComment } from "../utils/commentHelpers";
import { Divider } from "../ui/Divider";
import { Paper } from "../ui/Paper";
import { Text } from "../ui/Text";
import styles from "./CommentPanel.module.css";

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
  // Ctrl+Enter → commitEdit と直後の onBlur → commitEdit が二重に走るのを防ぐ。
  // 編集セッション開始(startEdit)時に false へ戻す。
  const isCommittingRef = useRef(false);

  const startEdit = useCallback((comment: InlineComment, e: React.MouseEvent) => {
    e.stopPropagation();
    isCommittingRef.current = false;
    setEditingId(comment.id);
    setEditText(comment.text);
    setTimeout(() => editRef.current?.focus(), 50);
  }, []);

  const commitEdit = useCallback(() => {
    // editingId のクロージャは再レンダリングまで更新されないため、
    // 二重コミット（Ctrl+Enter 直後の blur）を ref で抑止する。
    if (!editingId || isCommittingRef.current) return;
    isCommittingRef.current = true;
    editor.commands.updateCommentText(editingId, editText);
    onSave?.();
    setEditingId(null);
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
    if (node?.type.name !== "image") return;
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
    if (node?.type.name !== "image") return;
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

  const filterMessageKey = filter === "open" ? "noOpenComments" : "noResolvedComments";
  const emptyMessage = filter === "all"
    ? t("noComments")
    : t(filterMessageKey);

  return (
    <Paper
      variant="outlined"
      style={{
        width: COMMENT_PANEL_WIDTH,
        minWidth: COMMENT_PANEL_WIDTH,
        flex: 1,
        borderLeft: `1px solid ${getDivider(isDark)}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          paddingLeft: 8,
          paddingRight: 8,
          minHeight: PANEL_HEADER_MIN_HEIGHT,
          borderBottom: `1px solid ${getDivider(isDark)}`,
        }}
      >
        <Text variant="subtitle2" aria-live="polite" aria-atomic="true" style={{ flex: 1, fontWeight: 700 }}>
          {t("commentPanel") || "Comments"} ({unresolvedCount + unresolvedImageAnnotations}/
          {allComments.length + totalImageAnnotations})
        </Text>
        <IconButton
          size="small"
          onClick={onClose}
          aria-label={t("close") || "Close"}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </div>

      {/* Filter */}
      <div style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}>
        <ToggleButtonGroup
          value={filter}
          exclusive
          onChange={(_, v) => {
            if (v) setFilter(v);
          }}
          size="small"
          className={styles.filterGroup}
          aria-label={t("commentPanel")}
        >
          <ToggleButton
            value="all"
            className={styles.filterButton}
          >
            {t("commentFilterAll") || "All"}
          </ToggleButton>
          <ToggleButton
            value="open"
            className={styles.filterButton}
          >
            {t("commentFilterOpen") || "Open"}
          </ToggleButton>
          <ToggleButton
            value="resolved"
            className={styles.filterButton}
          >
            {t("commentFilterResolved") || "Resolved"}
          </ToggleButton>
        </ToggleButtonGroup>
      </div>

      {/* Comment list */}
      <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
        {filtered.length === 0 && (
          <Text
            variant="body2"
            style={{ textAlign: "center", marginTop: 16, color: getTextSecondary(isDark) }}
          >
            {emptyMessage}
          </Text>
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
                <Text
                  variant="caption"
                  component="span"
                  style={{
                    display: "block",
                    marginBottom: 4,
                    fontStyle: "italic",
                    color: getTextSecondary(isDark),
                    borderLeft: `2px solid ${getDivider(isDark)}`,
                    paddingLeft: 8,
                    maxHeight: "2.8em",
                    overflow: "hidden",
                  }}
                >
                  &ldquo;{found.text}&rdquo;
                </Text>
              )}
              {found?.isPoint && (
                <Text
                  variant="caption"
                  component="span"
                  style={{ display: "block", marginBottom: 4, color: getTextSecondary(isDark) }}
                >
                  {t("commentPointLabel") || "Point comment"}
                </Text>
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
                <Text
                  variant="body2"
                  onClick={(e) => startEdit(comment, e)}
                  className={styles.commentBodyHover}
                  style={{
                    marginBottom: 4,
                    cursor: "text",
                    minHeight: "1.4em",
                  }}
                >
                  {comment.text || <span style={{ color: getTextDisabled(isDark), fontStyle: "italic" }}>{t("commentPlaceholder") || "Add comment..."}</span>}
                </Text>
              )}
              {/* Actions */}
              <div style={{ display: "flex", gap: 4 }}>
                <Button
                  size="small"
                  variant="text"
                  className={styles.actionButton}
                  style={{ fontSize: SMALL_BUTTON_FONT_SIZE }}
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
                  className={styles.actionButton}
                  style={{ fontSize: SMALL_BUTTON_FONT_SIZE }}
                  onClick={(e) => {
                    e.stopPropagation();
                    editor.commands.removeComment(comment.id);
                  }}
                >
                  {t("commentDelete") || "Delete"}
                </Button>
              </div>
            </ButtonBase>
          );
        })}

        {/* 画像アノテーションコメント */}
        {imageAnnotations.length > 0 && (
          <>
            <Divider style={{ marginTop: 8, marginBottom: 8 }} />
            <Text
              variant="caption"
              component="span"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: getTextSecondary(isDark),
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              <ImageIcon sx={{ fontSize: 14 }} />
              {t("annotate")} ({unresolvedImageAnnotations}/{totalImageAnnotations})
            </Text>
            {imageAnnotations.map((img) => {
              const filteredAnnotations = img.annotations.filter((a) => {
                if (filter === "open") return !a.resolved;
                if (filter === "resolved") return !!a.resolved;
                return true;
              });
              if (filteredAnnotations.length === 0) return null;
              return (
              <div key={img.pos}>
                {filteredAnnotations.map((a, i) => {
                  let annotationLabel: string;
                  if (a.type === "rect") annotationLabel = t("annotationRect");
                  else if (a.type === "circle") annotationLabel = t("annotationCircle");
                  else annotationLabel = t("annotationLine");
                  return (
                  <div
                    key={a.id}
                    style={{
                      marginBottom: 4,
                      padding: 6,
                      border: `1px solid ${getDivider(isDark)}`,
                      borderRadius: 4,
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
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: "50%", backgroundColor: a.color,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          <Text variant="caption" component="span" style={{ color: "white", fontSize: BADGE_NUMBER_FONT_SIZE, fontWeight: 700 }}>{i + 1}</Text>
                        </div>
                        <Text variant="caption" component="span" style={{ color: getTextSecondary(isDark), fontSize: SMALL_CAPTION_FONT_SIZE }}>
                          {annotationLabel}
                        </Text>
                      </div>
                      <Text variant="body2" style={{ fontSize: COMMENT_BODY_FONT_SIZE, marginBottom: 4 }}>
                        {a.comment}
                      </Text>
                    </ButtonBase>
                    <div style={{ display: "flex", gap: 4 }}>
                      <Button
                        size="small"
                        variant="text"
                        className={styles.actionButton}
                        style={{ fontSize: SMALL_BUTTON_FONT_SIZE }}
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
                        className={styles.actionButton}
                        style={{ fontSize: SMALL_BUTTON_FONT_SIZE }}
                        onClick={() => deleteAnnotation(img.pos, a.id)}
                      >
                        {t("commentDelete") || "Delete"}
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>
              );
            })}
          </>
        )}
      </div>
    </Paper>
  );
});
