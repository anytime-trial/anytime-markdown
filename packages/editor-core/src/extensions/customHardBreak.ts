import HardBreak from "@tiptap/extension-hard-break";
import type { MdSerializerState } from "../types";
import type { Node as PMNode } from "@tiptap/pm/model";

/** Shift+Enterでハードブレイク（スペース2つ+改行）、Enterは通常の段落分割 */
export const CustomHardBreak = HardBreak.extend({
  addKeyboardShortcuts() {
    return {
      "Shift-Enter": () => {
        if (this.editor.isActive("codeBlock")) return false;
        return this.editor.commands.setHardBreak();
      },
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: MdSerializerState, node: PMNode, parent: PMNode, index: number) {
          for (let i = index + 1; i < parent.childCount; i++) {
            if (parent.child(i).type !== node.type) {
              state.write("\\\n");
              return;
            }
          }
        },
        parse: {},
      },
    };
  },
});
