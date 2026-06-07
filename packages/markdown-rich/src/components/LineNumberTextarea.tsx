import React, { useCallback, useRef } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getDivider, getTextDisabled, getTextPrimary } from "@anytime-markdown/markdown-viewer";

import styles from "./LineNumberTextarea.module.css";

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
    <div className={styles.root}>
      {/* Line number gutter */}
      <div
        ref={gutterRef}
        className={styles.gutter}
        style={{
          fontSize: `${fontSize}px`,
          lineHeight,
          color: getTextDisabled(isDark),
          backgroundColor: bg,
          width: `${gutterWidth}ch`,
          minWidth: `${gutterWidth}ch`,
          borderRightColor: getDivider(isDark),
        }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} style={{ height: `${lineHeightPx}px` }}>
            {i + 1}
          </div>
        ))}
      </div>
      {/* Textarea */}
      <textarea
        ref={ref}
        className={styles.textarea}
        value={value}
        onChange={onChange}
        onScroll={handleScroll}
        onKeyDown={readOnly ? undefined : handleKeyDown}
        readOnly={readOnly}
        spellCheck={spellCheck}
        placeholder={placeholder}
        style={{
          fontSize: `${fontSize}px`,
          lineHeight,
          color: getTextPrimary(isDark),
          backgroundColor: bg,
        }}
      />
    </div>
  );
}
