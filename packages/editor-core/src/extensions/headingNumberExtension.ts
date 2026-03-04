import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const headingNumberPluginKey = new PluginKey("headingNumber");

function buildNumberDecorations(
  doc: import("@tiptap/pm/model").Node,
  show: boolean,
): DecorationSet {
  if (!show) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  const counters = [0, 0, 0, 0, 0]; // h1-h5

  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const level = (node.attrs.level as number) - 1; // 0-indexed
    counters[level]++;
    // 下位レベルをリセット
    for (let i = level + 1; i < 5; i++) counters[i] = 0;
    // 番号文字列を生成（例: "1.2.3"）
    const number = counters.slice(0, level + 1).join(".") + ". ";
    const widget = Decoration.widget(
      pos + 1,
      () => {
        const span = document.createElement("span");
        span.className = "heading-number";
        span.textContent = number;
        return span;
      },
      { side: -1 },
    );
    decorations.push(widget);
  });

  return DecorationSet.create(doc, decorations);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    headingNumber: {
      setShowHeadingNumbers: (show: boolean) => ReturnType;
    };
  }
}

export const HeadingNumberExtension = Extension.create({
  name: "headingNumber",

  addCommands() {
    return {
      setShowHeadingNumbers:
        (show: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(headingNumberPluginKey, show);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: headingNumberPluginKey,
        state: {
          init(): DecorationSet {
            return DecorationSet.empty;
          },
          apply(tr, value: DecorationSet): DecorationSet {
            const meta = tr.getMeta(headingNumberPluginKey) as boolean | undefined;
            if (meta !== undefined) {
              return buildNumberDecorations(tr.doc, meta);
            }
            if (tr.docChanged) {
              // ドキュメント変更時は現在の表示状態を維持して再構築
              // DecorationSet が空でなければ表示中
              if (value !== DecorationSet.empty) {
                return buildNumberDecorations(tr.doc, true);
              }
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return headingNumberPluginKey.getState(state) as DecorationSet ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
