import React from "react";
import { Box, IconButton, Popover, Tooltip, Typography } from "@mui/material";
import type { Editor } from "@tiptap/react";
import { MATH_SAMPLES } from "../constants/samples";

interface MathSamplePopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  editor: Editor | null;
  t: (key: string) => string;
  getPos: (() => number | undefined) | boolean;
  nodeContentSize: number;
}

export function MathSamplePopover({ anchorEl, onClose, editor, t, getPos, nodeContentSize }: MathSamplePopoverProps) {
  return (
    <Popover
      open={!!anchorEl}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", p: 0.5 }}>
        {MATH_SAMPLES.filter((s) => s.enabled).map((sample) => {
          const sampleCode = sample.code;
          return (
            <Tooltip key={sample.label} title={t(sample.i18nKey)} placement="right">
              <IconButton
                size="small"
                aria-label={t(sample.i18nKey)}
                onClick={() => {
                  if (!editor || typeof getPos !== "function") return;
                  const pos = getPos();
                  if (pos == null) return;
                  const from = pos + 1;
                  const to = from + nodeContentSize;
                  editor.chain().focus().command(({ tr }) => {
                    tr.replaceWith(from, to, editor.schema.text(sampleCode));
                    return true;
                  }).run();
                  onClose();
                }}
                sx={{ minWidth: 32, minHeight: 32 }}
              >
                <Typography aria-hidden="true" sx={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, lineHeight: 1, border: 1, borderColor: "divider", borderRadius: 0.5, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>{sample.icon}</Typography>
              </IconButton>
            </Tooltip>
          );
        })}
      </Box>
    </Popover>
  );
}
