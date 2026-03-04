"use client";
import React, { useState } from "react";
import {
  Box,
  Button,
  IconButton,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { commentDataPluginKey } from "../extensions/commentExtension";
import type { InlineComment } from "../utils/commentHelpers";
import type { TranslationFn } from "../types";

interface CommentPanelProps {
  editor: Editor;
  open: boolean;
  onClose: () => void;
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
  t,
}: CommentPanelProps) {
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");

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
        width: 280,
        minWidth: 280,
        borderLeft: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          p: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700 }}>
          {t("commentPanel") || "Comments"} ({unresolvedCount}/
          {allComments.length})
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
            sx={{ py: 0.25, fontSize: "0.75rem" }}
          >
            {t("commentFilterAll") || "All"}
          </ToggleButton>
          <ToggleButton
            value="open"
            sx={{ py: 0.25, fontSize: "0.75rem" }}
          >
            {t("commentFilterOpen") || "Open"}
          </ToggleButton>
          <ToggleButton
            value="resolved"
            sx={{ py: 0.25, fontSize: "0.75rem" }}
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
            color="text.secondary"
            sx={{ textAlign: "center", mt: 2 }}
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
            <Box
              key={comment.id}
              role="button"
              tabIndex={0}
              onClick={() => handleClick(comment.id)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClick(comment.id);
                }
              }}
              sx={{
                mb: 1,
                p: 1,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                cursor: "pointer",
                opacity: comment.resolved ? 0.5 : 1,
                "&:hover, &:focus-visible": { bgcolor: "action.hover" },
                "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
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
                    color: "text.secondary",
                    borderLeft: 2,
                    borderColor: "divider",
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
                  sx={{ display: "block", mb: 0.5, color: "text.secondary" }}
                >
                  {t("commentPointLabel") || "Point comment"}
                </Typography>
              )}
              {/* Comment text */}
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                {comment.text}
              </Typography>
              {/* Actions */}
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Button
                  size="small"
                  variant="text"
                  sx={{ fontSize: "0.7rem", minWidth: 0, px: 0.5 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (comment.resolved) {
                      editor.commands.unresolveComment(comment.id);
                    } else {
                      editor.commands.resolveComment(comment.id);
                    }
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
                  sx={{ fontSize: "0.7rem", minWidth: 0, px: 0.5 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    editor.commands.removeComment(comment.id);
                  }}
                >
                  {t("commentDelete") || "Delete"}
                </Button>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
});
