import { Drawer } from "@mui/material";

import { COMMENT_PANEL_WIDTH } from "../constants/dimensions";
import type { HeadingItem, TranslationFn } from "../types";
import OutlinePanel from "./OutlinePanel";

interface EditorOutlineSectionProps {
  isMd: boolean;
  outlineOpen: boolean;
  handleToggleOutline: () => void;
  outlineWidth: number;
  setOutlineWidth: React.Dispatch<React.SetStateAction<number>>;
  editorHeight: number;
  headings: HeadingItem[];
  foldedIndices: Set<number>;
  hiddenByFold: Set<number>;
  foldAll: () => void;
  unfoldAll: () => void;
  toggleFold: (idx: number) => void;
  handleOutlineClick: (pos: number) => void;
  handleOutlineResizeStart: (e: React.MouseEvent) => void;
  onHeadingDragEnd?: (fromIdx: number, toIdx: number) => void;
  onOutlineDelete?: (pos: number, kind: string) => void;
  onInsertSectionNumbers?: () => void;
  onRemoveSectionNumbers?: () => void;
  t: TranslationFn;
}

export function EditorOutlineSection({
  isMd,
  outlineOpen,
  handleToggleOutline,
  outlineWidth,
  setOutlineWidth,
  editorHeight,
  headings,
  foldedIndices,
  hiddenByFold,
  foldAll,
  unfoldAll,
  toggleFold,
  handleOutlineClick,
  handleOutlineResizeStart,
  onHeadingDragEnd,
  onOutlineDelete,
  onInsertSectionNumbers,
  onRemoveSectionNumbers,
  t,
}: Readonly<EditorOutlineSectionProps>) {
  if (isMd) {
    if (!outlineOpen) return null;
    return (
      <OutlinePanel
        outlineWidth={outlineWidth}
        setOutlineWidth={setOutlineWidth}
        editorHeight={editorHeight}
        headings={headings}
        foldedIndices={foldedIndices}
        hiddenByFold={hiddenByFold}
        foldAll={foldAll}
        unfoldAll={unfoldAll}
        toggleFold={toggleFold}
        handleOutlineClick={handleOutlineClick}
        handleOutlineResizeStart={handleOutlineResizeStart}
        onHeadingDragEnd={onHeadingDragEnd}
        onOutlineDelete={onOutlineDelete}
        onInsertSectionNumbers={onInsertSectionNumbers}
        onRemoveSectionNumbers={onRemoveSectionNumbers}
        t={t}
      />
    );
  }

  return (
    <Drawer
      anchor="left"
      open={outlineOpen}
      onClose={handleToggleOutline}
      slotProps={{ paper: { sx: { width: COMMENT_PANEL_WIDTH } } }}
      aria-labelledby="outline-panel-title"
    >
      <OutlinePanel
        outlineWidth={280}
        setOutlineWidth={setOutlineWidth}
        editorHeight={editorHeight}
        headings={headings}
        foldedIndices={foldedIndices}
        hiddenByFold={hiddenByFold}
        foldAll={foldAll}
        unfoldAll={unfoldAll}
        toggleFold={toggleFold}
        handleOutlineClick={(pos: number) => { handleOutlineClick(pos); handleToggleOutline(); }}
        handleOutlineResizeStart={handleOutlineResizeStart}
        onHeadingDragEnd={onHeadingDragEnd}
        onOutlineDelete={onOutlineDelete}
        onInsertSectionNumbers={onInsertSectionNumbers}
        onRemoveSectionNumbers={onRemoveSectionNumbers}
        t={t}
      />
    </Drawer>
  );
}
