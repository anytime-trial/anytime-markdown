"use client";

import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useCallback, useState } from "react";
import { Box, GlobalStyles } from "@mui/material";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

export function DetailsNodeView() {
  const [open, setOpen] = useState(true);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  return (
    <NodeViewWrapper>
      <GlobalStyles
        styles={{
          ".details-collapsed > * > *:not(summary)": {
            display: "none !important",
          },
        }}
      />
      <Box
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          my: 0.5,
          overflow: "hidden",
        }}
      >
        <Box
          contentEditable={false}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={toggle}
          onKeyDown={handleKeyDown}
          sx={{
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            userSelect: "none",
            px: 0.5,
            py: 0.25,
            bgcolor: "action.hover",
            "&:hover": { bgcolor: "action.selected" },
          }}
        >
          {open ? (
            <KeyboardArrowDownIcon fontSize="small" sx={{ color: "text.secondary" }} />
          ) : (
            <KeyboardArrowRightIcon fontSize="small" sx={{ color: "text.secondary" }} />
          )}
        </Box>
        <NodeViewContent
          className={open ? "details-expanded" : "details-collapsed"}
          style={{ padding: "4px 12px" }}
        />
      </Box>
    </NodeViewWrapper>
  );
}
