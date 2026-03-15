"use client";

import { useTheme } from "@mui/material";
import type { NodeViewProps } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { DiagramBlock } from "./components/codeblock/DiagramBlock";
import { HtmlPreviewBlock } from "./components/codeblock/HtmlPreviewBlock";
import { MathBlock } from "./components/codeblock/MathBlock";
import { RegularCodeBlock } from "./components/codeblock/RegularCodeBlock";
import { useDeleteBlock } from "./hooks/useDeleteBlock";
import { useNodeSelected } from "./hooks/useNodeSelected";
import { useTextareaSearch } from "./hooks/useTextareaSearch";

export function CodeBlockNodeView({ editor, node, updateAttributes, getPos }: NodeViewProps) {
  const theme = useTheme();
  const t = useTranslations("MarkdownEditor");
  const isDark = theme.palette.mode === "dark";
  const language = node.attrs.language;
  const isMath = language === "math";
  const isHtml = language === "html";
  const isDiagram = language === "mermaid" || language === "plantuml";

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const isEditable = useEditorState({ editor, selector: (ctx) => !!ctx.editor?.isEditable });
  const codeCollapsed = !!node.attrs.codeCollapsed || !isEditable;
  const [editOpen, setEditOpen] = useState(false);
  const [fsCode, setFsCode] = useState("");
  const fsTextareaRef = useRef<HTMLTextAreaElement>(null);

  const isSelected = useNodeSelected(editor, getPos, node.nodeSize);

  const selectNode = useCallback(() => {
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;
    editor.commands.setTextSelection(pos + 1);
    if (!isDiagram && !isMath && !isHtml && codeCollapsed) updateAttributes({ codeCollapsed: false });
  }, [editor, getPos, codeCollapsed, updateAttributes, isDiagram, isMath, isHtml]);

  // Auto-collapse code when deselected
  // codeCollapsed, updateAttributes は意図的に除外（選択解除時のみ発火させる）
  useEffect(() => {
    if (!isSelected && !codeCollapsed) {
      updateAttributes({ codeCollapsed: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelected]);

  const code = node.textContent;
  const handleCopyCode = useCallback(() => { navigator.clipboard.writeText(code); }, [code]);

  // Sync code on editOpen open
  // code は意図的に除外（editOpen 切替時のスナップショットのみ取得）
  useEffect(() => {
    if (editOpen) setFsCode(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen]);

  /** Sync editOpen code editor changes back to TipTap node */
  const handleFsCodeChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value;
    setFsCode(newCode);
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;
    const from = pos + 1;
    const to = from + node.content.size;
    editor.chain().command(({ tr }) => {
      if (newCode) {
        tr.replaceWith(from, to, editor.schema.text(newCode));
      } else {
        tr.delete(from, to);
      }
      return true;
    }).run();
  }, [editor, getPos, node.content.size]);

  /** Text update from search/replace (same TipTap node sync) */
  const handleFsTextChange = useCallback((newCode: string) => {
    setFsCode(newCode);
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;
    const from = pos + 1;
    const to = from + node.content.size;
    editor.chain().command(({ tr }) => {
      if (newCode) {
        tr.replaceWith(from, to, editor.schema.text(newCode));
      } else {
        tr.delete(from, to);
      }
      return true;
    }).run();
  }, [editor, getPos, node.content.size]);

  const fsSearch = useTextareaSearch(fsTextareaRef, fsCode, handleFsTextChange);

  /** Delete the code block */
  const handleDeleteBlock = useDeleteBlock(editor, getPos, node.nodeSize);

  // Shared props for all block sub-components
  const shared = {
    editor, node, updateAttributes, getPos,
    isSelected, codeCollapsed,
    selectNode, code,
    handleCopyCode, handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
    editOpen, setEditOpen, fsCode, onFsCodeChange: handleFsCodeChange, fsTextareaRef, fsSearch,
    t, isDark,
  };

  if (isMath) return <MathBlock {...shared} handleFsTextChange={handleFsTextChange} />;
  if (isHtml) return <HtmlPreviewBlock {...shared} handleFsTextChange={handleFsTextChange} />;
  if (isDiagram) {
    return (
      <DiagramBlock
        {...shared}
        handleFsTextChange={handleFsTextChange}
      />
    );
  }
  return <RegularCodeBlock {...shared} handleFsTextChange={handleFsTextChange} />;
}
