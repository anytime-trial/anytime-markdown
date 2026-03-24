import type { Editor } from "@tiptap/react";
import type { RefObject } from "react";
import { useEffect,useState } from "react";

// Floating toolbar position hook (M-5: shared logic for table/plantuml/mermaid)
export function useFloatingToolbar(
  editor: Editor | null,
  wrapperRef: RefObject<HTMLDivElement | null>,
  nodeType: string,
  language?: string,
): { top: number; left: number } | null {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!editor) { setPosition(null); return; }
    const update = () => {
      if (!wrapperRef.current) { setPosition(null); return; }
      const { $from } = editor.state.selection;
      let depth = $from.depth;
      let found = false;
      while (depth > 0) {
        const node = $from.node(depth);
        if (node.type.name === nodeType && (!language || node.attrs.language === language)) {
          found = true;
          break;
        }
        depth--;
      }
      if (!found) { setPosition(null); return; }
      const blockStart = $from.before(depth);
      const dom = editor.view.nodeDOM(blockStart);
      if (!(dom instanceof HTMLElement)) { setPosition(null); return; }
      const rect = dom.getBoundingClientRect();
      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      setPosition({ top: rect.top - wrapperRect.top - 36, left: rect.right - wrapperRect.left });
    };
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    update();
    return () => { editor.off("selectionUpdate", update); editor.off("update", update); };
  }, [editor, wrapperRef, nodeType, language]);

  return position;
}
