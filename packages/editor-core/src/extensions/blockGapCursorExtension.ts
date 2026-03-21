/**
 * GapCursor で Enter を押したとき、ブロック前に空段落を挿入する拡張。
 *
 * StarterKit に含まれる GapCursor が矢印キーナビゲーション時に
 * ブロックノード前後にカーソルを配置する。この拡張は Enter キーの
 * ハンドリングを追加し、GapCursor 位置に空段落を挿入する。
 *
 * GapCursor の表示スタイルは blockStyles.ts で定義。
 */
import { Extension } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { TextSelection } from "@tiptap/pm/state";

export const BlockGapCursorExtension = Extension.create({
  name: "blockGapCursor",

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor;
        if (!(state.selection instanceof GapCursor)) return false;

        const pos = state.selection.from;
        const paragraphType = state.schema.nodes.paragraph;
        if (!paragraphType) return false;

        const { tr } = state;
        tr.insert(pos, paragraphType.create());
        tr.setSelection(TextSelection.create(tr.doc, pos + 1));
        editor.view.dispatch(tr);
        return true;
      },
    };
  },
});
