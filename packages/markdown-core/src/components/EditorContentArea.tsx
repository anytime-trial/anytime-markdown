import { Box, Paper } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Editor } from "@tiptap/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import { getEditorPaperSx } from "../styles/editorStyles";
import { useEditorSettingsContext } from "../useEditorSettings";
import { EditorContextMenu } from "./EditorContextMenu";
import { FrontmatterBlock } from "./FrontmatterBlock";
import { SearchReplaceBar } from "./SearchReplaceBar";
import { SourceModeEditor } from "./SourceModeEditor";
import { SourceSearchBar } from "./SourceSearchBar";

interface EditorContentAreaProps {
  editor: Editor | null;
  sourceMode: boolean;
  readonlyMode: boolean;
  reviewMode: boolean;
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
  noScroll?: boolean;
  t: (key: string) => string;
  onSwitchToReview?: () => void;
  onSwitchToWysiwyg?: () => void;
  onSwitchToSource?: () => void;
}

export function EditorContentArea({
  editor,
  sourceMode,
  readonlyMode,
  reviewMode,
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
  noScroll,
  t,
  onSwitchToReview,
  onSwitchToWysiwyg,
  onSwitchToSource,
}: Readonly<EditorContentAreaProps>) {
  const theme = useTheme();
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

  if (sourceMode) {
    return (
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <EditorContextMenu editor={editor} readOnly={false} t={t}
          currentMode="source" extraContainerRef={sourceContainerRef} sourceTextareaRef={sourceTextareaRef}
          onSwitchToReview={onSwitchToReview} onSwitchToWysiwyg={onSwitchToWysiwyg} onSwitchToSource={onSwitchToSource}
        />
        <Box
          ref={sourceContainerRef}
          sx={{ position: "relative" }}
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
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Box
        ref={editorWrapperRef}
        onKeyDown={(readonlyMode || reviewMode) ? (e: React.KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "f") {
            e.preventDefault();
            editor?.commands.openSearch();
          }
        } : undefined}
        sx={{ position: "relative", outline: "none" }}
      >
        {editor && <SearchReplaceBar editor={editor} t={t} />}
        {editor && <EditorContextMenu editor={editor} readOnly={readonlyMode || reviewMode} t={t}
          currentMode={reviewMode ? "review" : sourceMode ? "source" : "wysiwyg"}
          onSwitchToReview={onSwitchToReview} onSwitchToWysiwyg={onSwitchToWysiwyg} onSwitchToSource={onSwitchToSource}
        />}
        <div ref={frontmatterRef}>
          <FrontmatterBlock frontmatter={frontmatterText} onChange={handleFrontmatterChange} readOnly={readonlyMode || reviewMode} defaultCollapsed={readonlyMode} t={t} />
        </div>
        <Paper
          id="md-editor-content"
          variant="outlined"
          sx={getEditorPaperSx(theme, settings, adjustedEditorHeight, { readonlyMode, noScroll })}
        >
          <div ref={editorMountCallback} style={{ display: "contents" }} />
        </Paper>
      </Box>
    </Box>
  );
}
