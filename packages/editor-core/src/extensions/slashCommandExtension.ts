import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface SlashCommandState {
  active: boolean;
  query: string;
  from: number;
  /** Keyboard navigation event forwarded from ProseMirror to React */
  navigationKey: "ArrowUp" | "ArrowDown" | "Enter" | "Escape" | null;
}

const slashCommandPluginKey = new PluginKey("slashCommand");

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

    const isValidContext = (state: any, pos: number): boolean => {
      const $pos = state.doc.resolve(pos);
      // Must be inside a paragraph (not codeBlock, table, etc.)
      if ($pos.parent.type.name !== "paragraph") return false;
      // Only top-level paragraphs (doc > paragraph, depth = 1)
      if ($pos.depth > 1) return false;
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

          handleTextInput(view, from, _to, text) {
            if (ext.storage.composing) return false;

            if (text === "/" && !ext.storage.active) {
              const { state } = view;
              const $from = state.doc.resolve(from);

              // Only activate at the start of an empty paragraph
              if ($from.parent.type.name !== "paragraph") return false;
              if ($from.parent.textContent !== "") return false;
              if (!isValidContext(state, from)) return false;

              // Defer activation to after the "/" is inserted
              setTimeout(() => {
                ext.storage.active = true;
                ext.storage.from = from;
                ext.storage.query = "";
                notify();
              }, 0);
            }

            return false;
          },

          handleKeyDown(view, event) {
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

            // Backspace: let ProseMirror handle deletion, appendTransaction will
            // detect if "/" is gone and deactivate accordingly.

            return false;
          },
        },

        appendTransaction(_transactions, _oldState, newState) {
          if (!ext.storage.active) return null;
          if (ext.storage.composing) return null;

          const { from } = ext.storage;
          const cursorPos = newState.selection.from;

          // If cursor moved before the slash position, deactivate
          if (cursorPos <= from) {
            deactivate();
            return null;
          }

          const $from = newState.doc.resolve(from);
          // Validate context still holds
          if ($from.parent.type.name !== "paragraph") {
            deactivate();
            return null;
          }

          // Extract text from "/" to cursor
          const text = newState.doc.textBetween(from, cursorPos, "");
          if (!text.startsWith("/")) {
            deactivate();
            return null;
          }

          const newQuery = text.slice(1);
          if (newQuery !== ext.storage.query) {
            ext.storage.query = newQuery;
            notify();
          }

          return null;
        },
      }),
    ];
  },
});
