import type { Editor } from "@tiptap/react";
import { useEffect } from "react";

/**
 * VS Code TreeView からのカスタムイベントを購読する。
 * - vscode-scroll-to-heading: 見出しへスクロール
 * - vscode-scroll-to-comment: コメントへスクロール
 * - vscode-resolve-comment / vscode-unresolve-comment / vscode-delete-comment: コメント操作
 * - vscode-toggle-section-numbers: セクション番号トグル
 */
export function useVSCodeIntegration(
  editor: Editor | null,
): void {
  // 見出しスクロール要求
  useEffect(() => {
    const handler = (e: Event) => {
      const pos = (e as CustomEvent<number>).detail;
      if (!editor || editor.isDestroyed) return;
      if (editor.isEditable) {
        editor.chain().focus().setTextSelection(pos).run();
      }
      const domAtPos = editor.view.domAtPos(pos);
      const node = domAtPos.node instanceof HTMLElement ? domAtPos.node : domAtPos.node.parentElement;
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener('vscode-scroll-to-heading', handler);
    return () => window.removeEventListener('vscode-scroll-to-heading', handler);
  }, [editor]);

  // コメントスクロール要求
  useEffect(() => {
    const handler = (e: Event) => {
      const pos = (e as CustomEvent<number>).detail;
      if (!editor || editor.isDestroyed) return;
      if (editor.isEditable) {
        editor.chain().focus().setTextSelection(pos + 1).run();
      }
      const domAtPos = editor.view.domAtPos(pos + 1);
      const node = domAtPos.node instanceof HTMLElement ? domAtPos.node : domAtPos.node.parentElement;
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener('vscode-scroll-to-comment', handler);
    return () => window.removeEventListener('vscode-scroll-to-comment', handler);
  }, [editor]);

  // コメント解決/再開/削除
  useEffect(() => {
    if (!editor) return;
    const handleResolve = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      editor.commands.resolveComment(id);
    };
    const handleUnresolve = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      editor.commands.unresolveComment(id);
    };
    const handleDelete = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      editor.commands.removeComment(id);
    };
    window.addEventListener('vscode-resolve-comment', handleResolve);
    window.addEventListener('vscode-unresolve-comment', handleUnresolve);
    window.addEventListener('vscode-delete-comment', handleDelete);
    return () => {
      window.removeEventListener('vscode-resolve-comment', handleResolve);
      window.removeEventListener('vscode-unresolve-comment', handleUnresolve);
      window.removeEventListener('vscode-delete-comment', handleDelete);
    };
  }, [editor]);

  // セクション番号の挿入/削除は MarkdownEditorPage 側で
  // vscode-toggle-section-numbers イベントを処理する
}
