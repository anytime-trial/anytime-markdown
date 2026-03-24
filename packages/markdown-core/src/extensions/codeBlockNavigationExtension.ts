import { Extension } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

export const CodeBlockNavigation = Extension.create({
  name: "codeBlockNavigation",

  addKeyboardShortcuts() {
    return {
      Escape: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== "codeBlock") return false;
        const afterPos = $from.after($from.depth);
        const resolved = editor.state.doc.resolve(
          Math.min(afterPos, editor.state.doc.content.size)
        );
        const sel = TextSelection.near(resolved, 1);
        editor.view.dispatch(
          editor.state.tr.setSelection(sel).scrollIntoView()
        );
        return true;
      },
    };
  },
});
