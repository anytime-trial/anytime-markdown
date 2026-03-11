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
  const allCollapsed = !!node.attrs.collapsed;
  const isEditable = useEditorState({ editor, selector: (ctx) => !!ctx.editor?.isEditable });
  const codeCollapsed = !!node.attrs.codeCollapsed || !isEditable;
  const toggleAllCollapsed = useCallback(() => updateAttributes(allCollapsed ? { collapsed: false, codeCollapsed: false } : { collapsed: true }), [allCollapsed, updateAttributes]);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsCodeVisible, setFsCodeVisible] = useState(true);
  const [fsCode, setFsCode] = useState("");
  const fsTextareaRef = useRef<HTMLTextAreaElement>(null);

  const isSelected = useEditorState({
    editor,
    selector: (ctx) => {
      if (!ctx.editor || typeof getPos !== "function") return false;
      const pos = getPos();
      if (pos == null) return false;
      const from = ctx.editor.state.selection.from;
      return from >= pos && from <= pos + node.nodeSize;
    },
  });

  const selectNode = useCallback(() => {
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;
    editor.commands.setTextSelection(pos + 1);
    if (codeCollapsed) updateAttributes({ codeCollapsed: false });
  }, [editor, getPos, codeCollapsed, updateAttributes]);

  const handleBlockMove = useCallback((direction: "up" | "down") => {
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;
    const { doc, tr } = editor.state;
    const $pos = doc.resolve(pos);
    const depth = $pos.depth;
    const index = $pos.index(depth);
    const parent = $pos.node(depth);
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index >= parent.childCount - 1) return;
    const thisNode = parent.child(index);
    if (direction === "up") {
      const prevNode = parent.child(index - 1);
      const from = pos - prevNode.nodeSize;
      tr.delete(from, from + prevNode.nodeSize);
      const insertPos = from + thisNode.nodeSize;
      tr.insert(insertPos, prevNode);
    } else {
      const nextNode = parent.child(index + 1);
      const nextStart = pos + thisNode.nodeSize;
      tr.delete(nextStart, nextStart + nextNode.nodeSize);
      tr.insert(pos, nextNode);
    }
    editor.view.dispatch(tr);
  }, [editor, getPos]);

  const handleDragKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!e.altKey) return;
    if (e.key === "ArrowUp") { e.preventDefault(); handleBlockMove("up"); }
    if (e.key === "ArrowDown") { e.preventDefault(); handleBlockMove("down"); }
  }, [handleBlockMove]);

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

  // Sync code on fullscreen open
  // code は意図的に除外（fullscreen 切替時のスナップショットのみ取得）
  useEffect(() => {
    if (fullscreen) setFsCode(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  /** Sync fullscreen code editor changes back to TipTap node */
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
  const handleDeleteBlock = useCallback(() => {
    if (!editor || typeof getPos !== "function") return;
    const pos = getPos();
    if (pos == null) return;
    const from = pos;
    const to = pos + node.nodeSize;
    editor.chain().focus().command(({ tr }) => { tr.delete(from, to); return true; }).run();
  }, [editor, getPos, node.nodeSize]);

  // Shared props for all block sub-components
  const shared = {
    editor, node, updateAttributes, getPos,
    isSelected, allCollapsed, codeCollapsed, toggleAllCollapsed,
    selectNode, handleDragKeyDown, code,
    handleCopyCode, handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
    fullscreen, setFullscreen, fsCode, onFsCodeChange: handleFsCodeChange, fsTextareaRef, fsSearch,
    t, isDark,
  };

  if (isMath) return <MathBlock {...shared} />;
  if (isHtml) return <HtmlPreviewBlock {...shared} />;
  if (isDiagram) {
    return (
      <DiagramBlock
        {...shared}
        fsCodeVisible={fsCodeVisible}
        setFsCodeVisible={setFsCodeVisible}
        handleFsTextChange={handleFsTextChange}
      />
    );
  }
  return <RegularCodeBlock {...shared} />;
}
