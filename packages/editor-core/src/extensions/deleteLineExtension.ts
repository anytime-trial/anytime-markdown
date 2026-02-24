import { Extension } from "@tiptap/core";

/** Ctrl+Shift+K でカーソル行を削除 */
export const DeleteLineExtension = Extension.create({
  name: "deleteLine",
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-k": ({ editor }) => {
        const { state, view } = editor;
        const { $from } = state.selection;
        const lineStart = $from.before($from.depth);
        const lineEnd = $from.after($from.depth);
        const tr = state.tr.delete(lineStart, lineEnd);
        view.dispatch(tr);
        return true;
      },
    };
  },
});
