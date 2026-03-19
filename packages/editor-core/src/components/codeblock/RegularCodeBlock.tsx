"use client";

import { useBlockMergeCompare } from "../../hooks/useBlockMergeCompare";
import { CodeBlockEditDialog } from "../CodeBlockEditDialog";
import { BlockInlineToolbar } from "./BlockInlineToolbar";
import { shouldShowBorder } from "./compareHelpers";
import { CodeBlockFrame } from "./CodeBlockFrame";
import type { CodeBlockSharedProps } from "./types";

type RegularCodeBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "getPos" | "code"
  | "isSelected"
  | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
  | "editOpen" | "setEditOpen" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
  | "t" | "isDark" | "isEditable" | "isCompareLeft" | "isCompareLeftEditable"
> & {
  handleFsTextChange: (newCode: string) => void;
};

export function RegularCodeBlock(props: RegularCodeBlockProps) {
  const {
    editor, node, getPos: _getPos, code,
    isSelected,
    handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
    editOpen, setEditOpen, fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
    handleFsTextChange,
    t, isDark,
  } = props;

  const language = node.attrs.language;
  const codeLabel = language ? `Code (${language})` : "Code";

  const { isCompareMode, compareCode, thisCode, handleMergeApply } = useBlockMergeCompare({
    editor, getPos: _getPos, language, code, editOpen,
  });

  const toolbar = (
    <BlockInlineToolbar
      label={codeLabel}
      onEdit={props.isCompareLeft ? undefined : () => setEditOpen(true)}
      onDelete={props.isCompareLeft ? undefined : () => setDeleteDialogOpen(true)}
      labelOnly={props.isCompareLeftEditable}
      t={t}
    />
  );

  return (
    <CodeBlockFrame
      toolbar={toolbar}
      isDark={isDark}
      showBorder={shouldShowBorder({ isSelected, isCompareLeft: props.isCompareLeft, isCompareLeftEditable: props.isCompareLeftEditable, isEditable: props.isEditable })}
      codeMaxHeight={400}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      handleDeleteBlock={handleDeleteBlock}
      t={t}
      afterFrame={
        <CodeBlockEditDialog
          open={editOpen}
          onClose={() => { fsSearch.reset(); setEditOpen(false); }}
          label={codeLabel}
          language={language || "plaintext"}
          fsCode={fsCode}
          onFsCodeChange={onFsCodeChange}
          onFsTextChange={handleFsTextChange}
          fsTextareaRef={fsTextareaRef}
          fsSearch={fsSearch}
          readOnly={!props.isEditable}
          isCompareMode={isCompareMode}
          compareCode={compareCode}
          onMergeApply={handleMergeApply}
          thisCode={thisCode}
          t={t}
        />
      }
    />
  );
}
