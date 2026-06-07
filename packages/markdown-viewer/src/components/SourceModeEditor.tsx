import React, { useCallback, useEffect, useMemo, useRef } from "react";

import { ACCENT_COLOR, ACCENT_COLOR_ALPHA, DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, alpha, getTextPrimary, getTextSecondary } from "../constants/colors";
import { useIsDark } from "../contexts/ThemeModeContext";
import type { TextareaSearchMatch } from "../hooks/useTextareaSearch";
import { useEditorSettingsContext } from "../useEditorSettings";
import type { Base64TokenSpan } from "../utils/base64Collapse";
import { collapseBase64, restoreBase64 } from "../utils/base64Collapse";
import styles from "./SourceModeEditor.module.css";

interface SourceModeEditorProps {
  sourceText: string;
  onSourceChange: (value: string) => void;
  editorHeight: number;
  ariaLabel: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  searchMatches?: TextareaSearchMatch[];
  searchCurrentIndex?: number;
}

/** Build highlight segments from matches */
function buildHighlightSegments(
  text: string,
  matches: TextareaSearchMatch[],
  currentIndex: number,
): React.ReactNode[] {
  if (matches.length === 0) return [text];
  const segments: React.ReactNode[] = [];
  let lastEnd = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m.start > lastEnd) {
      segments.push(text.substring(lastEnd, m.start));
    }
    segments.push(
      <mark
        key={i}
        style={{
          backgroundColor: i === currentIndex ? ACCENT_COLOR : ACCENT_COLOR_ALPHA,
          color: "transparent",
          borderRadius: 2,
        }}
      >
        {text.substring(m.start, m.end)}
      </mark>,
    );
    lastEnd = m.end;
  }
  if (lastEnd < text.length) {
    segments.push(text.substring(lastEnd));
  }
  return segments;
}

const BASE64_BADGE_DARK = "rgba(139, 92, 246, 0.25)";
const BASE64_BADGE_LIGHT = "rgba(139, 92, 246, 0.18)";
const BASE64_BORDER_DARK = "rgba(139, 92, 246, 0.5)";
const BASE64_BORDER_LIGHT = "rgba(139, 92, 246, 0.4)";

/** base64トークン位置にバッジ風の背景を付与するセグメントを構築 */
function buildBase64Segments(
  text: string,
  spans: Base64TokenSpan[],
  isDark: boolean,
): React.ReactNode[] {
  if (spans.length === 0) return [text];
  const segments: React.ReactNode[] = [];
  let lastEnd = 0;
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (s.start > lastEnd) {
      segments.push(text.substring(lastEnd, s.start));
    }
    segments.push(
      <mark
        key={`b64-${i}`}
        style={{
          backgroundColor: isDark ? BASE64_BADGE_DARK : BASE64_BADGE_LIGHT,
          border: `1px solid ${isDark ? BASE64_BORDER_DARK : BASE64_BORDER_LIGHT}`,
          borderRadius: 3,
          color: "transparent",
          padding: "0 1px",
        }}
      >
        {text.substring(s.start, s.end)}
      </mark>,
    );
    lastEnd = s.end;
  }
  if (lastEnd < text.length) {
    segments.push(text.substring(lastEnd));
  }
  return segments;
}

export function SourceModeEditor({
  sourceText,
  onSourceChange,
  editorHeight,
  ariaLabel,
  textareaRef,
  searchMatches,
  searchCurrentIndex,
}: Readonly<SourceModeEditorProps>) {
  const settings = useEditorSettingsContext();
  const isDark = useIsDark();
  const highlightRef = useRef<HTMLDivElement>(null);
  const base64OverlayRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  // ref を内部参照と外部参照の両方に流すコールバック ref
  const setTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      internalTextareaRef.current = node;
      if (textareaRef) {
        textareaRef.current = node;
      }
    },
    [textareaRef],
  );

  const hasMatches = searchMatches && searchMatches.length > 0;

  // base64 データを短いトークンに置換して表示
  const { displayText, tokenMap, tokenSpans } = useMemo(
    () => collapseBase64(sourceText || ""),
    [sourceText],
  );
  const tokenMapRef = useRef(tokenMap);
  tokenMapRef.current = tokenMap;
  const hasBase64Tokens = tokenSpans.length > 0;

  const displayLines = displayText.split("\n");
  const lineCount = displayLines.length || 1;
  const digits = String(lineCount).length;

  // Sync textarea scroll to highlight layer and gutter
  const handleScroll = useCallback(() => {
    const ta = internalTextareaRef.current;
    const hl = highlightRef.current;
    const b64 = base64OverlayRef.current;
    const gutter = gutterRef.current;
    if (ta) {
      if (hl) {
        hl.scrollTop = ta.scrollTop;
        hl.scrollLeft = ta.scrollLeft;
      }
      if (b64) {
        b64.scrollTop = ta.scrollTop;
        b64.scrollLeft = ta.scrollLeft;
      }
      if (gutter) {
        gutter.scrollTop = ta.scrollTop;
      }
    }
  }, []);

  // Also sync when the parent Paper scrolls (vertical overflow)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const syncScroll = () => {
      const hl = highlightRef.current;
      const b64 = base64OverlayRef.current;
      if (hl && hasMatches) {
        hl.scrollTop = container.scrollTop;
      }
      if (b64 && hasBase64Tokens) {
        b64.scrollTop = container.scrollTop;
      }
    };
    container.addEventListener("scroll", syncScroll);
    return () => container.removeEventListener("scroll", syncScroll);
  }, [hasMatches, hasBase64Tokens]);

  // ミラー要素で各行の描画高さを計測し、行番号ガターと textarea 本体の高さに反映。
  // textarea は rows 属性だけだと折り返し分を含めないため overflow:hidden で末尾が切れる。
  // ミラーの実測総高さを textarea.style.height に同期して欠けを防ぐ。
  useEffect(() => {
    const applyHeights = () => {
      const mirror = mirrorRef.current;
      const gutter = gutterRef.current;
      if (!mirror || !gutter) return;
      for (let i = 0; i < mirror.children.length; i++) {
        const h = (mirror.children[i] as HTMLElement).getBoundingClientRect().height;
        if (i < gutter.children.length) {
          (gutter.children[i] as HTMLElement).style.height = `${h}px`;
        }
      }
      const ta = internalTextareaRef.current;
      if (ta) {
        const mirrorHeight = mirror.getBoundingClientRect().height;
        if (mirrorHeight > 0) {
          ta.style.height = `${mirrorHeight}px`;
        }
      }
    };
    applyHeights();
    const container = textContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(applyHeights);
    ro.observe(container);
    return () => ro.disconnect();
  }, [displayText, settings.fontSize, settings.lineHeight]);

  const sharedTextStyle: React.CSSProperties = {
    fontFamily: "monospace",
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineHeight,
    letterSpacing: "normal",
    tabSize: 4,
  };

  const sharedPaddingStyle: React.CSSProperties = {
    paddingTop: 16,
    paddingBottom: 16,
    paddingRight: 16,
    paddingLeft: 8,
    margin: 0,
    boxSizing: "border-box",
  };

  return (
    <div
      ref={scrollContainerRef}
      className={styles.scrollContainer}
      style={{
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        maxHeight: editorHeight,
        overflow: "auto",
        backgroundColor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
      }}
    >
      <div style={{ display: "flex", minHeight: "100%" }}>
        <div
          ref={gutterRef}
          style={{
            width: `${Math.max(3, digits + 1)}ch`,
            minWidth: `${Math.max(3, digits + 1)}ch`,
            paddingTop: 16,
            paddingBottom: 16,
            paddingLeft: 8,
            paddingRight: 8,
            margin: 0,
            textAlign: "right",
            fontFamily: "monospace",
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            color: alpha(getTextSecondary(isDark), 0.6),
            userSelect: "none",
            overflow: "hidden",
            boxSizing: "border-box",
            flexShrink: 0,
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div ref={textContainerRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
          {/* ミラー: textarea と同じ幅・フォントで描画し、折り返し後の各行高さを計測 */}
          <div
            ref={mirrorRef}
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              visibility: "hidden",
              pointerEvents: "none",
              ...sharedTextStyle,
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
              ...sharedPaddingStyle,
            }}
          >
            {displayLines.map((line, i) => (
              <div key={`mirror-${i}-${line.slice(0, 16)}`}>{line || " "}</div>
            ))}
          </div>
          {/* Base64 token badge layer */}
          {hasBase64Tokens && (
            <div
              ref={base64OverlayRef}
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                ...sharedPaddingStyle,
                ...sharedTextStyle,
                whiteSpace: "pre-wrap",
                overflowWrap: "break-word",
                overflow: "hidden",
                pointerEvents: "none",
                color: "transparent",
              }}
            >
              {buildBase64Segments(displayText, tokenSpans, isDark)}
            </div>
          )}
          {/* Highlight layer behind textarea */}
          {hasMatches && (
            <div
              ref={highlightRef}
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                ...sharedPaddingStyle,
                ...sharedTextStyle,
                whiteSpace: "pre-wrap",
                overflowWrap: "break-word",
                overflow: "hidden",
                pointerEvents: "none",
                color: "transparent",
              }}
            >
              {buildHighlightSegments(displayText, searchMatches, searchCurrentIndex ?? 0)}
            </div>
          )}
          <textarea
            ref={setTextareaRef}
            aria-label={ariaLabel}
            value={displayText}
            rows={Math.max(lineCount, Math.ceil((editorHeight - 36) / (settings.fontSize * settings.lineHeight)))}
            onScroll={handleScroll}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              onSourceChange(restoreBase64(e.target.value, tokenMapRef.current))
            }
            onCopy={(e: React.ClipboardEvent<HTMLTextAreaElement>) => {
              const ta = e.currentTarget;
              const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
              if (selected && tokenMapRef.current.size > 0) {
                const restored = restoreBase64(selected, tokenMapRef.current);
                if (restored !== selected) {
                  e.preventDefault();
                  e.clipboardData.setData("text/plain", restored);
                }
              }
            }}
            onCut={(e: React.ClipboardEvent<HTMLTextAreaElement>) => {
              const ta = e.currentTarget;
              const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
              if (selected && tokenMapRef.current.size > 0) {
                const restored = restoreBase64(selected, tokenMapRef.current);
                if (restored !== selected) {
                  e.preventDefault();
                  e.clipboardData.setData("text/plain", restored);
                  // カット: 選択範囲を削除して onChange を発火
                  const before = ta.value.substring(0, ta.selectionStart);
                  const after = ta.value.substring(ta.selectionEnd);
                  onSourceChange(restoreBase64(before + after, tokenMapRef.current));
                }
              }
            }}
            className={styles.textarea}
            style={{
              position: "relative",
              width: "100%",
              ...sharedPaddingStyle,
              border: "none",
              outline: "none",
              boxShadow: "none",
              resize: "none",
              overflow: "hidden",
              ...sharedTextStyle,
              color: getTextPrimary(isDark),
              backgroundColor: "transparent",
              caretColor: getTextPrimary(isDark),
            }}
          />
        </div>
      </div>
    </div>
  );
}
