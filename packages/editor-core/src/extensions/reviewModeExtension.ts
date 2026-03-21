import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/** Type-safe accessor for ReviewModeExtension storage */
export function reviewModeStorage(editor: Editor): { enabled: boolean } {
  return (editor.storage as unknown as Record<string, unknown>).reviewMode as { enabled: boolean };
}

const reviewModePluginKey = new PluginKey("reviewMode");

/**
 * Review mode extension: blocks document changes while keeping the editor
 * editable (cursor visible, text selectable).
 *
 * Enable/disable via `editor.storage.reviewMode.enabled`.
 * To allow specific transactions (e.g. comment, checkbox), temporarily
 * set `enabled = false` before dispatching.
 */
export const ReviewModeExtension = Extension.create({
  name: "reviewMode",

  addStorage() {
    return {
      enabled: false,
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: reviewModePluginKey,
        filterTransaction: (tr) => {
          if (!this.storage.enabled) return true;
          // Allow selection-only transactions (cursor movement, focus, etc.)
          if (!tr.docChanged) return true;
          // Block content changes
          return false;
        },
      }),
    ];
  },
});
