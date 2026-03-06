import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { HeadingItem } from "../types";
import { extractHeadings } from "../types";
import { moveHeadingSection } from "../utils/sectionHelpers";

interface UseOutlineParams {
  editor: Editor | null;
  sourceMode: boolean;
}

export function useOutline({ editor, sourceMode }: UseOutlineParams) {
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [foldedIndices, setFoldedIndices] = useState<Set<number>>(new Set());
  const [outlineWidth, setOutlineWidth] = useState(220);
  const isResizingOutline = useRef(false);

  const handleToggleOutline = useCallback(() => {
    setOutlineOpen((v) => !v);
  }, []);

  // ソースモード切替時にも見出しを更新
  useEffect(() => {
    if (!sourceMode && editor) {
      setHeadings(extractHeadings(editor));
    }
  }, [sourceMode, editor]);

  const handleHeadingDragEnd = useCallback(
    (fromIdx: number, toIdx: number) => {
      if (!editor) return;
      moveHeadingSection(editor, headings, fromIdx, toIdx);
    },
    [editor, headings],
  );

  const handleOutlineDelete = useCallback(
    (pos: number, kind: string) => {
      if (!editor) return;
      const { doc } = editor.state;
      const nodeAtPos = doc.nodeAt(pos);
      if (!nodeAtPos) return;

      if (kind === "heading") {
        const level = nodeAtPos.attrs.level as number;
        let end = pos + nodeAtPos.nodeSize;
        while (end < doc.content.size) {
          const next = doc.nodeAt(end);
          if (!next) break;
          if (next.type.name === "heading" && (next.attrs.level as number) <= level) break;
          end += next.nodeSize;
        }
        editor
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.delete(pos, end);
            return true;
          })
          .run();
      } else {
        editor
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.delete(pos, pos + nodeAtPos.nodeSize);
            return true;
          })
          .run();
      }
    },
    [editor],
  );

  const handleOutlineClick = useCallback(
    (pos: number) => {
      if (!editor) return;
      if (editor.isEditable) {
        editor.chain().focus().setTextSelection(pos).run();
      }
      const domAtPos = editor.view.domAtPos(pos);
      const node =
        domAtPos.node instanceof HTMLElement ? domAtPos.node : domAtPos.node.parentElement;
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [editor],
  );

  const toggleFold = useCallback((idx: number) => {
    setFoldedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  const foldAll = useCallback(() => {
    setFoldedIndices(
      new Set(headings.filter((h) => h.kind === "heading").map((h) => h.headingIndex ?? -1)),
    );
  }, [headings]);

  const unfoldAll = useCallback(() => {
    setFoldedIndices(new Set());
  }, []);

  // Decoration ベースで折りたたみを適用
  useEffect(() => {
    if (!editor) return;
    if (sourceMode) {
      editor.commands.setFoldedHeadings(new Set());
      return;
    }
    editor.commands.setFoldedHeadings(foldedIndices);
  }, [editor, foldedIndices, sourceMode]);

  // 折りたたまれた見出しの下位項目を非表示にするインデックス集合を計算
  const hiddenByFold = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      if (h.kind === "heading" && foldedIndices.has(h.headingIndex ?? -1)) {
        const foldedLevel = h.level;
        for (let j = i + 1; j < headings.length; j++) {
          if (headings[j].kind === "heading" && headings[j].level <= foldedLevel) break;
          set.add(j);
        }
      }
    }
    return set;
  }, [headings, foldedIndices]);

  // アウトラインリサイズハンドル
  const handleOutlineResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingOutline.current = true;
      const startX = e.clientX;
      const startWidth = outlineWidth;
      const onMouseMove = (ev: MouseEvent) => {
        if (!isResizingOutline.current) return;
        const newWidth = Math.max(150, Math.min(500, startWidth + ev.clientX - startX));
        setOutlineWidth(newWidth);
      };
      const onMouseUp = () => {
        isResizingOutline.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [outlineWidth],
  );

  return {
    outlineOpen,
    headings,
    setHeadings,
    foldedIndices,
    hiddenByFold,
    outlineWidth,
    setOutlineWidth,
    handleToggleOutline,
    handleHeadingDragEnd,
    handleOutlineDelete,
    handleOutlineClick,
    toggleFold,
    foldAll,
    unfoldAll,
    handleOutlineResizeStart,
  };
}
