import type { Editor } from "@anytime-markdown/markdown-core";
import { Extension } from "@anytime-markdown/markdown-core";
import { Plugin, PluginKey } from "@anytime-markdown/markdown-pm/state";

/** Type-safe accessor for ReviewModeExtension storage */
export function reviewModeStorage(editor: Editor): { enabled: boolean } {
  return (editor.storage as unknown as Record<string, unknown>).reviewMode as { enabled: boolean };
}

/**
 * Transaction meta key that opts a doc-changing transaction out of review-mode blocking.
 *
 * Comment add/remove and image-annotation toggles are legitimate during review and must
 * pass the `filterTransaction` gate even though they change the document. Set
 * `tr.setMeta(REVIEW_MODE_ALLOW_META, true)` on such transactions. This is robust regardless
 * of dispatch timing (the meta travels with the tr to the real `view.dispatch`), unlike
 * temporarily toggling `storage.enabled` around a command whose dispatch is deferred by the
 * CommandManager.
 */
export const REVIEW_MODE_ALLOW_META = "reviewModeAllow";

const reviewModePluginKey = new PluginKey("reviewMode");

/**
 * Review mode extension: blocks document changes while keeping the editor
 * editable (cursor visible, text selectable).
 *
 * Enable/disable via `editor.storage.reviewMode.enabled`.
 * To allow a specific document-changing transaction (e.g. comment add/remove,
 * image-annotation toggle) while review mode is on, set
 * `tr.setMeta(REVIEW_MODE_ALLOW_META, true)` on that transaction. Do NOT rely on
 * temporarily toggling `enabled` around an `editor.commands.*` call: the vendored
 * CommandManager defers the real `view.dispatch` until after the command returns
 * (its `dispatch` prop is a no-op), so the toggle is already restored by then.
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
          // Allow explicitly opted-in operations (comments, annotations) even though
          // they change the document.
          if (tr.getMeta(REVIEW_MODE_ALLOW_META)) return true;
          // Block content changes
          return false;
        },
      }),
    ];
  },
});
