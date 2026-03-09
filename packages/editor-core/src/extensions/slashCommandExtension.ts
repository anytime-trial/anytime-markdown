import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export interface SlashCommandState {
  active: boolean;
  query: string;
  from: number;
  /** Keyboard navigation event forwarded from ProseMirror to React */
  navigationKey: "ArrowUp" | "ArrowDown" | "Enter" | "Escape" | null;
}

const slashCommandPluginKey = new PluginKey("slashCommand");

/** Strip zero-width spaces (U+200B) that Tiptap inserts as cursor placeholders */
const stripZWS = (s: string) => s.replace(/\u200B/g, "");

export const SlashCommandExtension = Extension.create<{
  onStateChange: (state: SlashCommandState) => void;
}>({
  name: "slashCommand",

  addOptions() {
    return {
      onStateChange: () => {},
    };
  },

  addStorage() {
    return {
      active: false,
      query: "",
      from: 0,
      composing: false,
    };
  },

  addProseMirrorPlugins() {
    const ext = this;

    const notify = (navKey: SlashCommandState["navigationKey"] = null) => {
      ext.options.onStateChange({
        active: ext.storage.active,
        query: ext.storage.query,
        from: ext.storage.from,
        navigationKey: navKey,
      });
    };

    const deactivate = () => {
      if (!ext.storage.active) return;
      ext.storage.active = false;
      ext.storage.query = "";
      ext.storage.from = 0;
      notify();
    };

    /**
     * Detect "/" typed at the end of a heading and convert it to
     * a new paragraph with "/" for slash command activation.
     */
    const handleHeadingSlash = (view: EditorView): boolean => {
      const { state } = view;
      const cursorPos = state.selection.from;
      const $cursor = state.doc.resolve(cursorPos);

      if ($cursor.depth !== 1) return false;
      if ($cursor.parent.type.name !== "heading") return false;

      const text = $cursor.parent.textContent;
      if (!text.endsWith("/")) return false;

      const headingEnd = $cursor.after($cursor.depth);
      if (cursorPos !== headingEnd - 1) return false;

      const { tr } = state;
      const paragraphType = state.schema.nodes.paragraph;

      tr.delete(cursorPos - 1, cursorPos);

      const insertPos = headingEnd - 1;
      const slashTextNode = state.schema.text("/");
      const newParagraph = paragraphType.create(null, slashTextNode);
      tr.insert(insertPos, newParagraph);

      tr.setSelection(
        Selection.near(tr.doc.resolve(insertPos + 2)),
      );

      view.dispatch(tr);
      return true;
    };

    return [
      new Plugin({
        key: slashCommandPluginKey,
        props: {
          handleDOMEvents: {
            compositionstart: () => {
              ext.storage.composing = true;
              return false;
            },
            compositionend: () => {
              ext.storage.composing = false;
              return false;
            },
          },

          handleKeyDown(_view, event) {
            if (!ext.storage.active) return false;

            const { key } = event;

            if (key === "Escape") {
              event.preventDefault();
              deactivate();
              return true;
            }

            if (key === "ArrowUp" || key === "ArrowDown" || key === "Enter") {
              event.preventDefault();
              notify(key);
              return true;
            }

            return false;
          },
        },

        view() {
          return {
            update: (view: EditorView, prevState) => {
              if (ext.storage.composing) return;

              const { state } = view;

              // --- Activation ---
              if (!ext.storage.active) {
                if (prevState.doc.eq(state.doc)) return;

                const cursorPos = state.selection.from;
                const $cursor = state.doc.resolve(cursorPos);

                if ($cursor.depth !== 1) return;

                const parentText = stripZWS($cursor.parent.textContent);

                // Standard case: "/" in a top-level paragraph that was empty
                if (
                  $cursor.parent.type.name === "paragraph" &&
                  parentText === "/"
                ) {
                  const slashPos = cursorPos - 1;
                  ext.storage.active = true;
                  ext.storage.from = slashPos;
                  ext.storage.query = "";
                  notify();
                  return;
                }

                // Heading case: "/" typed at end of a heading
                if (
                  $cursor.parent.type.name === "heading" &&
                  parentText.endsWith("/")
                ) {
                  handleHeadingSlash(view);
                  return;
                }

                return;
              }

              // --- Active: track query or deactivate ---
              const { from } = ext.storage;
              const cursorPos = state.selection.from;

              if (cursorPos <= from) {
                deactivate();
                return;
              }

              const $from = state.doc.resolve(from);
              if ($from.parent.type.name !== "paragraph") {
                deactivate();
                return;
              }

              const text = stripZWS(state.doc.textBetween(from, cursorPos, ""));
              if (!text.startsWith("/")) {
                deactivate();
                return;
              }

              const newQuery = text.slice(1);
              if (newQuery !== ext.storage.query) {
                ext.storage.query = newQuery;
                notify();
              }
            },
          };
        },
      }),
    ];
  },
});
