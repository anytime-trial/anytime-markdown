import type { Editor } from "@anytime-markdown/markdown-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";

import { getEditorBg } from "../constants/colors";
import { useEditorMode } from "../contexts/EditorModeContext";
import { useIsDark } from "../contexts/ThemeModeContext";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import { getEditorPaperSx } from "../styles/editorStyles";
import { GlobalStyle } from "../ui/GlobalStyle";
import { Paper } from "../ui/Paper";
import { useEditorSettingsContext } from "../useEditorSettings";
import { EditorContextMenu } from "./EditorContextMenu";
import { FrontmatterBlock } from "./FrontmatterBlock";
import { MarkdownMinimap } from "./MarkdownMinimap";
import { SearchReplaceBar } from "./SearchReplaceBar";
import { SourceModeEditor } from "./SourceModeEditor";
import { SourceSearchBar } from "./SourceSearchBar";

interface EditorContentAreaProps {
  editor: Editor | null;
  editorHeight: number;
  editorWrapperRef: React.RefObject<HTMLDivElement | null>;
  editorMountCallback: (node: HTMLDivElement | null) => void;
  sourceText: string;
  handleSourceChange: (text: string) => void;
  sourceTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  sourceSearchOpen: boolean;
  setSourceSearchOpen: (open: boolean) => void;
  sourceSearch: TextareaSearchState;
  frontmatterText: string | null;
  handleFrontmatterChange: (value: string | null) => void;
  t: (key: string) => string;
}

export function EditorContentArea({
  editor,
  editorHeight,
  editorWrapperRef,
  editorMountCallback,
  sourceText,
  handleSourceChange,
  sourceTextareaRef,
  sourceSearchOpen,
  setSourceSearchOpen,
  sourceSearch,
  frontmatterText,
  handleFrontmatterChange,
  t,
}: Readonly<EditorContentAreaProps>) {
  const {
    sourceMode, readonlyMode, reviewMode, noScroll,
    onSwitchToReview, onSwitchToWysiwyg, onSwitchToSource,
  } = useEditorMode();
  const isDark = useIsDark();
  const settings = useEditorSettingsContext();

  const sourceContainerRef = useRef<HTMLDivElement>(null);

  // Frontmatter パネルの高さを測定し editorHeight から差し引く
  const frontmatterRef = useRef<HTMLDivElement>(null);
  const [frontmatterHeight, setFrontmatterHeight] = useState(0);
  useEffect(() => {
    const el = frontmatterRef.current;
    if (!el) { setFrontmatterHeight(0); return; }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setFrontmatterHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [frontmatterText, sourceMode]);
  const adjustedEditorHeight = editorHeight - frontmatterHeight;

  const editorBg = getEditorBg(isDark, settings);
  const hasPaper = settings.paperSize !== "off";
  const paperBg = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)";
  const outerBg = hasPaper ? paperBg : editorBg;

  // getEditorPaperSx の & .tiptap スタイルを ui/GlobalStyle 経由で注入する
  const paperSxObj = getEditorPaperSx(isDark, settings, adjustedEditorHeight, { readonlyMode, noScroll });
  const tiptapStyles = paperSxObj["& .tiptap"] as Record<string, unknown> | undefined;

  if (sourceMode) {
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <EditorContextMenu editor={editor} readOnly={false} t={t}
          currentMode="source" extraContainerRef={sourceContainerRef} sourceTextareaRef={sourceTextareaRef}
          onSwitchToReview={onSwitchToReview} onSwitchToWysiwyg={onSwitchToWysiwyg} onSwitchToSource={onSwitchToSource}
        />
        <div
          ref={sourceContainerRef}
          style={{ position: "relative" }}
          onKeyDown={(e: React.KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "f") {
              e.preventDefault();
              setSourceSearchOpen(true);
              setTimeout(() => sourceSearch.focusSearch(), 50);
            } else if (e.key === "Escape" && sourceSearchOpen) {
              e.preventDefault();
              setSourceSearchOpen(false);
              sourceSearch.reset();
            }
          }}
        >
          {sourceSearchOpen && (
            <SourceSearchBar
              search={sourceSearch}
              onClose={() => { setSourceSearchOpen(false); sourceSearch.reset(); }}
              t={t}
            />
          )}
          <SourceModeEditor
            sourceText={sourceText}
            onSourceChange={handleSourceChange}
            editorHeight={editorHeight}
            ariaLabel={t("sourceEditor")}
            textareaRef={sourceTextareaRef}
            searchMatches={sourceSearchOpen ? sourceSearch.matches : undefined}
            searchCurrentIndex={sourceSearchOpen ? sourceSearch.currentIndex : undefined}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {tiptapStyles && (
        <GlobalStyle styles={{ "#md-editor-content .tiptap": tiptapStyles }} />
      )}
      <div
        ref={editorWrapperRef}
        onKeyDown={(readonlyMode || reviewMode) ? (e: React.KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "f") {
            e.preventDefault();
            editor?.commands.openSearch();
          }
        } : undefined}
        style={{ position: "relative", outline: "none" }}
      >
        {editor && <SearchReplaceBar editor={editor} t={t} />}
        {editor && <EditorContextMenu editor={editor} readOnly={readonlyMode || reviewMode} t={t}
          currentMode={reviewMode ? "review" : "wysiwyg"}
          onSwitchToReview={onSwitchToReview} onSwitchToWysiwyg={onSwitchToWysiwyg} onSwitchToSource={onSwitchToSource}
        />}
        <div ref={frontmatterRef}>
          <FrontmatterBlock frontmatter={frontmatterText} onChange={handleFrontmatterChange} readOnly={readonlyMode || reviewMode} defaultCollapsed={true} t={t} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <Paper
            id="md-editor-content"
            variant="outlined"
            style={{
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              overflow: "hidden",
              backgroundColor: outerBg,
              flex: 1,
              minWidth: 0,
            }}
          >
            <div ref={editorMountCallback} style={{ display: "contents" }} />
          </Paper>
          {!sourceMode && editor && (
            <MarkdownMinimap editor={editor} editorHeight={adjustedEditorHeight} />
          )}
        </div>
      </div>
    </div>
  );
}
