import type { Editor } from "@tiptap/react";
import { useCallback } from "react";

interface UseEditorBlockActionsParams {
  editor: Editor | null;
}

export function useEditorBlockActions({ editor }: UseEditorBlockActionsParams) {
  /** コードブロック・テーブルの折りたたみを一括トグル */
  const handleToggleAllBlocks = useCallback(() => {
    if (!editor) return;
    let anyExpanded = false;
    editor.state.doc.descendants((node) => {
      if ((node.type.name === "codeBlock" || node.type.name === "table" || node.type.name === "image") && !node.attrs.collapsed) {
        anyExpanded = true;
        return false;
      }
    });
    const collapsed = anyExpanded;
    const tr = editor.state.tr;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "codeBlock" || node.type.name === "table" || node.type.name === "image") {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed });
      }
    });
    editor.view.dispatch(tr);
  }, [editor]);

  /** Mermaid/PlantUML ブロックのコード欄を一括トグル */
  const handleToggleDiagramCode = useCallback(() => {
    if (!editor) return;
    let anyExpanded = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "codeBlock") {
        const lang = (node.attrs.language || "").toLowerCase();
        if ((lang === "mermaid" || lang === "plantuml") && !node.attrs.codeCollapsed) {
          anyExpanded = true;
          return false;
        }
      }
    });
    const codeCollapsed = anyExpanded;
    const tr = editor.state.tr;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "codeBlock") {
        const lang = (node.attrs.language || "").toLowerCase();
        if (lang === "mermaid" || lang === "plantuml") {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, codeCollapsed });
        }
      }
    });
    editor.view.dispatch(tr);
  }, [editor]);

  /** すべてのブロックを展開（折りたたみ解除） */
  const handleExpandAllBlocks = useCallback(() => {
    if (!editor) return;
    const tr = editor.state.tr;
    let changed = false;
    editor.state.doc.descendants((node, pos) => {
      if ((node.type.name === "codeBlock" || node.type.name === "table" || node.type.name === "image") && node.attrs.collapsed) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: false });
        changed = true;
      }
    });
    if (changed) editor.view.dispatch(tr);
  }, [editor]);

  return { handleToggleAllBlocks, handleToggleDiagramCode, handleExpandAllBlocks };
}
