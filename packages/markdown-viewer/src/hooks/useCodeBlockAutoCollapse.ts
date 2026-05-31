import type { Editor } from "@tiptap/react";
import { useEffect } from "react";

/** mermaid/plantuml コードブロックを折りたたむ */
function collapseIfNeeded(ed: Editor): void {
  if (ed.isDestroyed) return;
  const { tr, doc } = ed.state;
  let modified = false;
  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") {
      const lang = (node.attrs.language || "").toLowerCase();
      if ((lang === "mermaid" || lang === "plantuml") && !node.attrs.collapsed) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: true });
        modified = true;
      }
    }
  });
  if (modified) ed.view.dispatch(tr);
}

export function useCodeBlockAutoCollapse(
  sourceMode: boolean,
  rightEditor: Editor | null | undefined,
  leftEditor: Editor | null | undefined,
): void {
  // マージプレビューモード時: mermaid/plantuml を常に折りたたむ
  useEffect(() => {
    if (sourceMode) return;

    const editors = [rightEditor, leftEditor].filter((e): e is Editor => !!e);
    // 初回折りたたみ
    for (const ed of editors) collapseIfNeeded(ed);

    // 展開操作されたら再折りたたみ
    const handlers = editors.map((ed) => {
      const scheduleCollapse = () => collapseIfNeeded(ed);
      const handler = () => { requestAnimationFrame(scheduleCollapse); };
      ed.on("update", handler);
      return () => ed.off("update", handler);
    });

    return () => { for (const off of handlers) off(); };
  }, [sourceMode, rightEditor, leftEditor]);
}
