"use client";
import React, { useState, useCallback } from "react";
import { Box, Button, Popover, TextField } from "@mui/material";
import type { TranslationFn } from "../types";

interface CommentPopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSubmit: (text: string) => void;
  initialText?: string;
  t: TranslationFn;
}

export const CommentPopover = React.memo(function CommentPopover({
  open,
  anchorEl,
  onClose,
  onSubmit,
  initialText = "",
  t,
}: CommentPopoverProps) {
  const [text, setText] = useState(initialText);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setText("");
      onClose();
    }
  }, [text, onSubmit, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") {
        onClose();
      }
    },
    [handleSubmit, onClose],
  );

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
    >
      <Box sx={{ p: 1.5, width: 280 }}>
        <TextField
          autoFocus
          fullWidth
          multiline
          rows={2}
          size="small"
          placeholder={t("commentPrompt") || "Enter comment..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={{ mb: 1 }}
        />
        <Button
          size="small"
          variant="contained"
          onClick={handleSubmit}
          disabled={!text.trim()}
          fullWidth
        >
          {t("comment") || "Comment"}
        </Button>
      </Box>
    </Popover>
  );
});
