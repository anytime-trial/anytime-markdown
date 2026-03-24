import type { Editor } from "@tiptap/react";
import { useCallback, useEffect } from "react";

const SECTION_NUMBER_RE = /^\d+(\.\d+)*\.?\s/;

/**
 * 見出しへのセクション番号の挿入・削除を管理する hook。
 * VS Code からの `vscode-toggle-section-numbers` カスタムイベントにも対応。
 */
export function useSectionNumbers(editor: Editor | null) {
  const handleInsertSectionNumbers = useCallback(() => {
    if (!editor) return;
    const targets: { pos: number; level: number; text: string }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== "heading") return;
      const level = node.attrs.level as number;
      if (level > 5) return;
      targets.push({ pos, level, text: node.textContent });
    });
    if (targets.length === 0) return;
    const counters = [0, 0, 0, 0, 0];
    const prefixes: string[] = [];
    for (const h of targets) {
      const idx = h.level - 1;
      counters[idx]++;
      for (let i = idx + 1; i < 5; i++) counters[i] = 0;
      prefixes.push(counters.slice(0, idx + 1).join(".") + ". ");
    }
    const { tr } = editor.state;
    for (let i = targets.length - 1; i >= 0; i--) {
      const contentStart = targets[i].pos + 1;
      const existingMatch = SECTION_NUMBER_RE.exec(targets[i].text);
      if (existingMatch) {
        tr.replaceWith(contentStart, contentStart + existingMatch[0].length, editor.schema.text(prefixes[i]));
      } else {
        tr.insertText(prefixes[i], contentStart);
      }
    }
    editor.view.dispatch(tr);
  }, [editor]);

  const handleRemoveSectionNumbers = useCallback(() => {
    if (!editor) return;
    const { tr } = editor.state;
    const removals: { from: number; to: number }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== "heading") return;
      const level = (node.attrs.level as number);
      if (level > 5) return;
      const text = node.textContent;
      const match = SECTION_NUMBER_RE.exec(text);
      if (match) {
        removals.push({ from: pos + 1, to: pos + 1 + match[0].length });
      }
    });
    for (let i = removals.length - 1; i >= 0; i--) {
      tr.delete(removals[i].from, removals[i].to);
    }
    editor.view.dispatch(tr);
  }, [editor]);

  // VS Code からのセクション番号挿入/削除イベント
  useEffect(() => {
    const handler = (e: Event) => {
      const show = (e as CustomEvent<boolean>).detail;
      if (show) {
        handleInsertSectionNumbers();
      } else {
        handleRemoveSectionNumbers();
      }
    };
    globalThis.addEventListener('vscode-toggle-section-numbers', handler);
    return () => globalThis.removeEventListener('vscode-toggle-section-numbers', handler);
  }, [handleInsertSectionNumbers, handleRemoveSectionNumbers]);

  return { handleInsertSectionNumbers, handleRemoveSectionNumbers };
}
