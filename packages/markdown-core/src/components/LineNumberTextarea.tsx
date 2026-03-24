import { Box } from "@mui/material";
import React, { useCallback, useRef } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getDivider, getTextDisabled, getTextPrimary } from "../constants/colors";

interface LineNumberTextareaProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  readOnly?: boolean;
  spellCheck?: boolean;
  placeholder?: string;
  fontSize: number;
  lineHeight: number;
  isDark: boolean;
}

export function LineNumberTextarea({
  value, onChange, textareaRef, readOnly, spellCheck = false,
  placeholder, fontSize, lineHeight, isDark,
}: Readonly<LineNumberTextareaProps>) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? internalRef;

  const lineCount = (value.match(/\n/g)?.length ?? 0) + 1;
  const gutterWidth = Math.max(3, String(lineCount).length + 1);

  const handleScroll = useCallback(() => {
    if (ref.current && gutterRef.current) {
      gutterRef.current.scrollTop = ref.current.scrollTop;
    }
  }, [ref]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const ta = ref.current;
    if (!ta) return;
    const { selectionStart, selectionEnd } = ta;
    const indent = "  ";
    const newValue = value.slice(0, selectionStart) + indent + value.slice(selectionEnd);
    // Trigger onChange via native input event
    const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (nativeSet) {
      nativeSet.call(ta, newValue);
      const ev = new Event("input", { bubbles: true });
      ta.dispatchEvent(ev);
    }
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = selectionStart + indent.length;
    });
  }, [ref, value]);

  const bg = isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG;
  const lineHeightPx = fontSize * lineHeight;

  return (
    <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Line number gutter */}
      <Box
        ref={gutterRef}
        sx={{
          overflow: "hidden",
          userSelect: "none",
          textAlign: "right",
          fontFamily: "monospace",
          fontSize: `${fontSize}px`,
          lineHeight,
          color: getTextDisabled(isDark),
          bgcolor: bg,
          pt: 2,
          pr: 0.5,
          pl: 1,
          width: `${gutterWidth}ch`,
          minWidth: `${gutterWidth}ch`,
          boxSizing: "border-box",
          borderRight: 1,
          borderColor: getDivider(isDark),
          flexShrink: 0,
        }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <Box key={i} sx={{ height: `${lineHeightPx}px` }}>
            {i + 1}
          </Box>
        ))}
      </Box>
      {/* Textarea */}
      <Box
        component="textarea"
        ref={ref}
        value={value}
        onChange={onChange}
        onScroll={handleScroll}
        onKeyDown={readOnly ? undefined : handleKeyDown}
        readOnly={readOnly}
        spellCheck={spellCheck}
        placeholder={placeholder}
        sx={{
          flex: 1,
          width: "100%",
          border: "none",
          outline: "none",
          "&:focus-visible": { outline: "none" },
          resize: "none",
          fontFamily: "monospace",
          fontSize: `${fontSize}px`,
          lineHeight,
          py: 2,
          pl: 1,
          pr: 2,
          color: getTextPrimary(isDark),
          bgcolor: bg,
          boxSizing: "border-box",
          overflow: "auto",
        }}
      />
    </Box>
  );
}
